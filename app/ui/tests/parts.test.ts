// Functional check of every part in the library: each symbol, and each model it offers, in a
// minimal circuit with a known answer. The circuits are written as netlists: every pin gets a
// net label (or a ground symbol), so a test reads like a SPICE deck.
import { describe, expect, it } from 'vitest';
import { placePart } from '../src/eda/editor';
import { deck, tested, type Spec } from './deck';
import { annotate, emptySheet, type SimSettings } from '../src/eda/schematic';
import { SYMBOLS } from '../src/eda/symbols';
import { BJTS, BRIDGES, DIODES, IGBTS, LED_COLOURS, MOSFETS, OPAMPS, REGULATORS, SHUNT_REFS, TVS, ZENERS } from '../src/eda/models';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { simulate, schematicSpice, type SimResult } from '../src/sim/run';

function run(parts: Spec[], sim?: SimSettings) {
  const { sheet, refs } = deck(parts, sim);
  const r = simulate(sheet);
  if ('error' in r) throw new Error(`${(r as { error: string }).error}: ${(r as { errors: string[] }).errors.join('; ')}`);
  expect(schematicSpice(sheet)).toMatch(/\.end/);
  const res = r as SimResult;
  return { r: res, refs, v: (n: string) => res.v[n][0], i: (pin: string) => res.i[pin][0] };
}

const V = (v: number | string, pos: string, neg = 'GND'): Spec => ['vdc', { value: String(v) }, { '1': pos, '2': neg }];
const R = (v: string, a: string, b: string): Spec => ['resistor', { value: v }, { '1': a, '2': b }];
const near = (x: number, want: number, tol: number) => expect(Math.abs(x - want), `${x} vs ${want}`).toBeLessThanOrEqual(tol);

describe('passive parts', () => {
  it('resistor: 5 V across 1 kΩ gives 5 mA', () => {
    const { i, refs } = run([V(5, 'A'), R('1k', 'A', 'GND')]);
    near(i(`${refs[1]}.1`), 5e-3, 1e-6);
  });
  for (const sym of ['capacitor', 'capacitor_pol']) it(`${sym}: open at DC, charges with τ = RC`, () => {
    const dc = run([V(5, 'A'), R('1k', 'A', 'B'), [sym, { value: '1u' }, { '1': 'B', '2': 'GND' }]]);
    near(dc.v('B'), 5, 1e-3);
    const tr = run([V(5, 'A'), R('1k', 'A', 'B'), [sym, { value: '1u' }, { '1': 'B', '2': 'GND' }]], { type: 'tran', stop: '5m', step: '10u', start: 'zero' });
    const k = tr.r.x.findIndex((t) => t >= 1e-3);
    near(tr.r.v['B'][k], 5 * (1 - Math.exp(-tr.r.x[k] / 1e-3)), 0.05);
  });
  it('inductor: a short at DC', () => {
    const { v, i, refs } = run([V(5, 'A'), R('1k', 'A', 'B'), ['inductor', { value: '10m' }, { '1': 'B', '2': 'GND' }]]);
    near(v('B'), 0, 1e-6);
    near(i(`${refs[2]}.1`), 5e-3, 1e-6);
  });
  for (const pos of [0, 25, 50, 75, 100]) it(`potentiometer at ${pos} %: wiper at V·(1 − pos)`, () => {
    const { v } = run([V(10, 'A'), ['potentiometer', { value: '10k', position: String(pos) }, { '1': 'A', '2': 'W', '3': 'GND' }]]);
    near(v('W'), 10 * (1 - pos / 100), 0.01);
  });
});

describe('sources', () => {
  it('DC source drives its value; AC magnitude used by the AC analysis', () => {
    const { v } = run([V(3.3, 'A'), R('1k', 'A', 'GND')]);
    near(v('A'), 3.3, 1e-9);
    const ac = run([['vdc', { value: '0', ac: '1' }, { '1': 'A', '2': 'GND' }], R('1k', 'A', 'B'), ['capacitor', { value: '100n' }, { '1': 'B', '2': 'GND' }]],
      { type: 'ac', fstart: '10', fstop: '100k', perDecade: '20' });
    // AC results are real and imaginary parts; |H| = 1/√(1 + (f/fc)²)
    const k = ac.r.x.findIndex((f) => f >= 1591);
    const fc = 1 / (2 * Math.PI * 1e3 * 100e-9);
    near(Math.hypot(ac.r.v['B'][k], ac.r.vi!['B'][k]), 1 / Math.sqrt(1 + (ac.r.x[k] / fc) ** 2), 0.005);
  });
  it('battery: internal resistance drops the voltage under load', () => {
    const { v } = run([['battery', { value: '9', rint: '0.5' }, { '1': 'A', '2': 'GND' }], R('100', 'A', 'GND')]);
    near(v('A'), 9 * 100 / 100.5, 1e-3);
  });
  it('sine source: offset, amplitude and frequency', () => {
    const { r } = run([['vsin', { value: '2', offset: '1', freq: '1k' }, { '1': 'A', '2': 'GND' }], R('1k', 'A', 'GND')], { type: 'tran', stop: '5m', step: '5u' });
    const a = r.v['A'];
    near(Math.max(...a), 3, 0.02); near(Math.min(...a), -1, 0.02);
    const ups: number[] = [];
    for (let k = 1; k < a.length; k++) if (a[k - 1] < 1 && a[k] >= 1) ups.push(r.x[k]);
    near((ups.length - 1) / (ups[ups.length - 1] - ups[0]), 1000, 10);
  });
  it('pulse source: levels, frequency and duty cycle', () => {
    const { r } = run([['vpulse', { value: '5', low: '1', freq: '1k', duty: '25' }, { '1': 'A', '2': 'GND' }], R('1k', 'A', 'GND')], { type: 'tran', stop: '4m', step: '2u' });
    const a = r.v['A'];
    near(Math.max(...a), 5, 1e-3); near(Math.min(...a), 1, 1e-3);
    let high = 0;
    for (let k = 1; k < a.length; k++) if (a[k] > 3) high += r.x[k] - r.x[k - 1];
    near(high / r.x[r.x.length - 1], 0.25, 0.02);
  });
  it('DC current source: 1 mA out of "out" into 1 kΩ gives 1 V', () => {
    const { v } = run([['idc', { value: '1m' }, { '1': 'A', '2': 'GND' }], R('1k', 'A', 'GND')]);
    near(v('A'), 1, 1e-6);
  });
});

describe('semiconductors, every model', () => {
  const fwd: Record<string, [number, number]> = { '1N4148': [0.6, 0.8], '1N4007': [0.6, 0.8], '1N5819': [0.12, 0.45], BAT54: [0.3, 0.45], SS34: [0.12, 0.35] };
  for (const m of DIODES) it(`diode ${m.name}: conducts forward, blocks reverse`, () => {
    const f = run([V(5, 'A'), R('1k', 'A', 'K'), ['diode', { value: m.name }, { '2': 'K', '1': 'GND' }]]);
    expect(f.v('K')).toBeGreaterThan(fwd[m.name][0]); expect(f.v('K')).toBeLessThan(fwd[m.name][1]);
    const b = run([V(5, 'A'), R('1k', 'A', 'K'), ['diode', { value: m.name }, { '1': 'K', '2': 'GND' }]]);
    expect(b.v('K')).toBeGreaterThan(4.9);
  });
  for (const m of ZENERS) it(`zener ${m.name}: breaks down at its voltage, conducts forward`, () => {
    const vz = m.model.bv!;
    const z = run([V(vz + 7, 'A'), R('1k', 'A', 'K'), ['zener', { value: m.name }, { '1': 'K', '2': 'GND' }]]);
    near(z.v('K'), vz, 0.05 * vz + 0.05);
    const f = run([V(5, 'A'), R('1k', 'A', 'K'), ['zener', { value: m.name }, { '2': 'K', '1': 'GND' }]]);
    expect(f.v('K')).toBeLessThan(0.9);
  });
  for (const c of LED_COLOURS) it(`LED ${c.name}: forward voltage about ${c.vf} V at 20 mA`, () => {
    const vs = c.vf + 20e-3 * 150;
    const { v, i, refs } = run([V(vs, 'A'), R('150', 'A', 'K'), ['led', { colour: c.name }, { '2': 'K', '1': 'GND' }]]);
    near(v('K'), c.vf, 0.1);
    near(i(`${refs[2]}.2`), 20e-3, 1e-3);
  });
  for (const m of BJTS.filter((b) => b.model.type === 'npn')) it(`NPN ${m.name}: saturates with base current, off without`, () => {
    const on = run([V(5, 'VCC'), R('10k', 'VCC', 'B'), R('1k', 'VCC', 'C'), ['npn', { value: m.name }, { '1': 'B', '2': 'C', '3': 'GND' }]]);
    expect(on.v('C')).toBeLessThan(0.3);
    near(on.v('B'), 0.7, 0.12);
    const off = run([V(5, 'VCC'), R('10k', 'GND', 'B'), R('1k', 'VCC', 'C'), ['npn', { value: m.name }, { '1': 'B', '2': 'C', '3': 'GND' }]]);
    expect(off.v('C')).toBeGreaterThan(4.99);
  });
  for (const m of BJTS.filter((b) => b.model.type === 'pnp')) it(`PNP ${m.name}: on with the base pulled low, off with it high`, () => {
    const on = run([V(5, 'VCC'), R('10k', 'GND', 'B'), R('1k', 'C', 'GND'), ['pnp', { value: m.name }, { '1': 'B', '2': 'C', '3': 'VCC' }]]);
    expect(on.v('C')).toBeGreaterThan(4.7);
    const off = run([V(5, 'VCC'), R('10k', 'VCC', 'B'), R('1k', 'C', 'GND'), ['pnp', { value: m.name }, { '1': 'B', '2': 'C', '3': 'VCC' }]]);
    expect(off.v('C')).toBeLessThan(0.01);
  });
  for (const m of MOSFETS.filter((x) => x.model.type === 'nmos')) it(`N-MOSFET ${m.name}: on with 10 V gate, off with 0 V`, () => {
    const on = run([V(10, 'VDD'), R('1k', 'VDD', 'D'), V(10, 'G'), ['nmos', { value: m.name }, { '1': 'G', '2': 'D', '3': 'GND' }]]);
    expect(on.v('D')).toBeLessThan(0.5);
    const off = run([V(10, 'VDD'), R('1k', 'VDD', 'D'), V(0, 'G'), ['nmos', { value: m.name }, { '1': 'G', '2': 'D', '3': 'GND' }]]);
    expect(off.v('D')).toBeGreaterThan(9.99);
  });
  for (const m of MOSFETS.filter((x) => x.model.type === 'pmos')) it(`P-MOSFET ${m.name}: on with the gate 10 V below the source, off at the source`, () => {
    const on = run([V(10, 'VDD'), R('1k', 'D', 'GND'), V(0, 'G'), ['pmos', { value: m.name }, { '1': 'G', '2': 'D', '3': 'VDD' }]]);
    expect(on.v('D')).toBeGreaterThan(9.5);
    const off = run([V(10, 'VDD'), R('1k', 'D', 'GND'), V(10, 'G'), ['pmos', { value: m.name }, { '1': 'G', '2': 'D', '3': 'VDD' }]]);
    expect(off.v('D')).toBeLessThan(0.01);
  });
});

describe('protection, power and interface parts', () => {
  const I = (amps: number, from: string, into: string): Spec => ['idc', { value: String(amps) }, { '1': into, '2': from }];
  for (const m of TVS) it(`TVS ${m.name}: blocks at ${m.model.vrwm} V, breaks down near ${m.model.vbr} V, clamps near ${m.model.vc} V at ${m.model.ipp} A`, () => {
    const { vrwm, vbr, vc, ipp, bidirectional } = m.model;
    for (const sign of bidirectional ? [1, -1] : [1]) {
      // the line is K (pin 1); a reverse voltage on the line is positive for sign = 1
      const stand = run([V(sign * vrwm, 'L'), ['tvs', { value: m.name }, { '1': 'L', '2': 'GND' }]]);
      expect(Math.abs(stand.i(`${stand.refs[1]}.1`))).toBeLessThan(1e-6);
      const brk = run([V(sign * (vbr + 20), 'S'), R('2k', 'S', 'L'), ['tvs', { value: m.name }, { '1': 'L', '2': 'GND' }]]);
      near(sign * brk.v('L'), vbr, 0.04 * vbr);
      const clamp = run([I(sign * ipp, 'GND', 'L'), ['tvs', { value: m.name }, { '1': 'L', '2': 'GND' }]]);
      near(sign * clamp.v('L'), vc, 0.06 * vc);
    }
    if (!bidirectional) {
      const f = run([V(5, 'S'), R('1k', 'S', 'L'), ['tvs', { value: m.name }, { '2': 'L', '1': 'GND' }]]);
      expect(f.v('L')).toBeLessThan(0.8);
    }
  });
  for (const m of BRIDGES) it(`bridge rectifier ${m.name}: both half-waves, 2 diode drops, output at twice the frequency`, async () => {
    const { measure } = await import('../src/sim/measure');
    const { r } = run([['vsin', { value: '10', freq: '50' }, { '1': 'AC1', '2': 'AC2' }], R('1meg', 'AC2', 'GND'), ['bridge', { value: m.name }, { '1': 'AC1', '2': 'AC2', '3': 'P', '4': 'GND' }], R('1k', 'P', 'GND')],
      { type: 'tran', stop: '60m', step: '20u' });
    const out = r.v['P'], k0 = r.x.findIndex((t) => t >= 20e-3);
    expect(Math.min(...out.slice(k0))).toBeGreaterThan(-0.01);
    expect(Math.max(...out)).toBeGreaterThan(8.3); expect(Math.max(...out)).toBeLessThan(9.2);
    near(measure(r.x, out, 20e-3, 60e-3).freq!, 100, 2);
  });
  const sat: Record<string, [vcesat: number, amps: number]> = { IKW30N60T: [1.5, 30], IKW40N120T2: [1.75, 40], 'generic 600 V 20 A': [1.8, 20] };
  for (const m of IGBTS) it(`IGBT ${m.name}: VCE(sat) about ${sat[m.name][0]} V at ${sat[m.name][1]} A with 15 V on the gate, blocks with 0 V`, () => {
    const [vs, amps] = sat[m.name];
    const load = String(100 / amps);
    const on = run([V(100, 'VCC'), R(load, 'VCC', 'C'), V(15, 'G'), ['igbt', { value: m.name }, { '1': 'G', '2': 'C', '3': 'GND' }]]);
    near(on.v('C'), vs, 0.3);
    const off = run([V(100, 'VCC'), R(load, 'VCC', 'C'), V(0, 'G'), ['igbt', { value: m.name }, { '1': 'G', '2': 'C', '3': 'GND' }]]);
    expect(off.v('C')).toBeGreaterThan(99.9);
    // reverse: the co-packed diode conducts from E to C; without one the IGBT blocks
    const rev = run([V(-10, 'S'), R('10', 'S', 'C'), V(0, 'G'), ['igbt', { value: m.name }, { '1': 'G', '2': 'C', '3': 'GND' }]]);
    if (m.model.diode) { expect(rev.v('C')).toBeGreaterThan(-1.2); expect(rev.v('C')).toBeLessThan(-0.5); } else expect(rev.v('C')).toBeLessThan(-9.9);
  });
  for (const ctr of [100, 200]) it(`optocoupler PC817 with CTR ${ctr} %: IC = CTR·IF before saturation, saturates with a large load, off without LED current`, () => {
    const parts = (rl: string, vin: number): Spec[] => [V(vin, 'IN'), R('1k', 'IN', 'A'), ['opto', { value: 'PC817', ctr: String(ctr) }, { '1': 'A', '2': 'K', '3': 'E', '4': 'C' }],
      R('1', 'K', 'GND'), V(5, 'VCC'), R(rl, 'VCC', 'C'), R('1', 'E', 'GND')];
    const lin = run(parts('100', 5));
    const iF = lin.i(`${lin.refs[2]}.1`), iC = lin.i(`${lin.refs[2]}.4`);
    expect(iF).toBeGreaterThan(3e-3);
    near(iC / iF, ctr / 100, 0.08 * ctr / 100);
    const s = run(parts('10k', 5));
    expect(s.v('C')).toBeLessThan(0.3);
    const off = run(parts('10k', 0));
    expect(off.v('C')).toBeGreaterThan(4.99);
  });
  for (const m of SHUNT_REFS) it(`${m.name}: REF tied to K is ${m.model.vref} V; with a 1:1 divider twice that`, () => {
    const vref = m.model.vref, vin = m.name === 'TLV431' ? 5 : 12;
    const ref = run([V(vin, 'S'), R('1k', 'S', 'K'), ['tl431', { value: m.name }, { '1': 'K', '2': 'GND', '3': 'K' }]]);
    near(ref.v('K'), vref, 0.005 * vref);
    const div = run([V(vin, 'S'), R('1k', 'S', 'K'), ['tl431', { value: m.name }, { '1': 'F', '2': 'GND', '3': 'K' }], R('10k', 'K', 'F'), R('10k', 'F', 'GND')]);
    near(div.v('K'), 2 * vref, 0.005 * 2 * vref);
    // a supply below the reference: the cathode current stops and K follows the supply
    const low = run([V(vref * 0.8, 'S'), R('1k', 'S', 'K'), ['tl431', { value: m.name }, { '1': 'K', '2': 'GND', '3': 'K' }]]);
    near(low.v('K'), vref * 0.8, 0.01);
  });
  it('NTC thermistor: R25 at 25 °C, R25·exp(B·(1/T − 1/298.15)) at 85 °C and −20 °C', () => {
    for (const [t, want] of [[25, 10e3], [85, 10e3 * Math.exp(3950 * (1 / 358.15 - 1 / 298.15))], [-20, 10e3 * Math.exp(3950 * (1 / 253.15 - 1 / 298.15))]] as const) {
      const { sheet, refs } = deck([V(1, 'A'), ['ntc', { value: '10k', beta: '3950' }, { '1': 'A', '2': 'GND' }]]);
      sheet.temp = String(t);
      const r = simulate(sheet) as SimResult;
      near(1 / r.i[`${refs[1]}.1`][0], want, want * 1e-6);
    }
  });
  it('fuse: its cold resistance in the circuit; the stress check says when it would blow', () => {
    const { sheet, refs } = deck([V(2, 'A'), ['fuse', { value: '1', r: '0.1' }, { '1': 'A', '2': 'B' }], R('1', 'B', 'GND')]);
    const r = simulate(sheet) as SimResult;
    near(r.v['B'][0], 2 / 1.1, 1e-6);
    const row = smoke(sheet, connectivity(sheet), r).rows.find((x) => x.ref === refs[1])!;
    expect(row.quantity).toBe('Irms');
    expect(row.status).toBe('over');
    near(row.value, 2 / 1.1, 1e-6);
  });
  it('stress check of the new parts: TVS peak pulse power, IGBT collector current, optocoupler LED current', () => {
    const { sheet, refs } = deck([['idc', { value: '43.5' }, { '1': 'L', '2': 'GND' }], ['tvs', { value: 'SMAJ5.0A' }, { '1': 'L', '2': 'GND' }],
      V(100, 'VCC'), R('2', 'VCC', 'C'), V(15, 'G'), ['igbt', { value: 'IKW30N60T' }, { '1': 'G', '2': 'C', '3': 'GND' }]]);
    const r = simulate(sheet) as SimResult;
    const rows = smoke(sheet, connectivity(sheet), r).rows;
    const tvsPk = rows.find((x) => x.ref === refs[1] && x.quantity === 'Ppk')!;
    expect(tvsPk.value).toBeGreaterThan(350); expect(tvsPk.value).toBeLessThan(450);
    expect(rows.find((x) => x.ref === refs[5] && x.quantity === 'Ic')!.status).toBe('over');
  });
});

describe('integrated circuits, every model', () => {
  const supplies = (): Spec[] => [V(12, 'VP'), V(-12, 'VN')];
  for (const m of OPAMPS) it(`op-amp ${m.name}: follower, gain of 2, output limited near the rails`, () => {
    const fol = run([...supplies(), V(1, 'IN'), ['opamp', { value: m.name }, { '3': 'IN', '2': 'OUT', '6': 'OUT', '7': 'VP', '4': 'VN' }]]);
    near(fol.v('OUT'), 1, 2e-3);
    const amp = run([...supplies(), V(1, 'IN'), R('10k', 'OUT', 'FB'), R('10k', 'FB', 'GND'), ['opamp', { value: m.name }, { '3': 'IN', '2': 'FB', '6': 'OUT', '7': 'VP', '4': 'VN' }]]);
    near(amp.v('OUT'), 2, 5e-3);
    const sat = run([...supplies(), V(1, 'IN'), ['opamp', { value: m.name }, { '3': 'IN', '2': 'GND', '6': 'OUT', '7': 'VP', '4': 'VN' }]]);
    // stops about railDrop below the positive rail, and never beyond it
    near(sat.v('OUT'), 12 - m.model.railDrop, 0.1);
    const neg = run([...supplies(), V(-1, 'IN'), ['opamp', { value: m.name }, { '3': 'IN', '2': 'GND', '6': 'OUT', '7': 'VP', '4': 'VN' }]]);
    near(neg.v('OUT'), -12 + (m.model.railDropLow ?? m.model.railDrop), 0.1);
  });
  for (const m of REGULATORS) it(`regulator ${m.name}: ${m.model.vout} V within 1 % from a 3 V higher input`, () => {
    const { v } = run([V(m.model.vout + 3, 'IN'), R('100', 'OUT', 'GND'), ['regulator', { value: m.name }, { '1': 'IN', '2': 'GND', '3': 'OUT' }]]);
    near(v('OUT'), m.model.vout, 0.01 * m.model.vout);
  });
  it('LM317 with 240 Ω / 720 Ω: 1.25 V × (1 + 720/240) = 5 V', () => {
    const { v } = run([V(12, 'IN'), R('240', 'OUT', 'ADJ'), R('720', 'ADJ', 'GND'), R('100', 'OUT', 'GND'), ['lm317', { value: 'LM317' }, { '3': 'IN', '1': 'ADJ', '2': 'OUT' }]]);
    near(v('OUT'), 5, 0.06);
  });
  const astable = (reset: string): Spec[] => [
    V(9, 'VCC'), R('10k', 'VCC', 'DIS'), R('10k', 'DIS', 'TH'), ['capacitor', { value: '10n' }, { '1': 'TH', '2': 'GND' }],
    ['capacitor', { value: '10n' }, { '1': 'CT', '2': 'GND' }], R('1k', 'OUT', 'GND'),
    ['timer555', {}, { '8': 'VCC', '4': reset, '7': 'DIS', '6': 'TH', '2': 'TH', '3': 'OUT', '5': 'CT', '1': 'GND' }],
  ];
  it('555: oscillates at 1.44/((R1 + 2·R2)·C); RESET low holds the output low', () => {
    const { r } = run(astable('VCC'), { type: 'tran', stop: '2m', step: '1u' });
    const out = r.v['OUT'];
    const rises: number[] = [];
    for (let k = 1; k < out.length; k++) if (out[k - 1] < 4.5 && out[k] >= 4.5) rises.push(r.x[k]);
    const f = (rises.length - 2) / (rises[rises.length - 1] - rises[1]);
    near(f / (1.44 / (30e3 * 10e-9)), 1, 0.06);
    const held = run(astable('GND'), { type: 'tran', stop: '1m', step: '1u' });
    expect(Math.max(...held.r.v['OUT'])).toBeLessThan(0.5);
  });
});

describe('transformer and relay', () => {
  it('transformer 10:1: a 10 V sine on the primary gives about 1 V on the secondary', () => {
    const { r } = run([['vsin', { value: '10', freq: '50' }, { '1': 'IN', '2': 'GND' }],
      ['transformer', { value: '0.1', lp: '1', k: '0.999', rp: '0.1', rs: '0.01' }, { '1': 'IN', '2': 'GND', '3': 'S', '4': 'GND' }], R('100', 'S', 'GND')],
    { type: 'tran', stop: '100m', step: '50u' });
    const late = r.v['S'].filter((_, k) => r.x[k] > 0.06);
    near(Math.max(...late), 1, 0.03);
  });
  it('transformer: the secondary is isolated, and a floating secondary still simulates', () => {
    const { r } = run([['vsin', { value: '10', freq: '50' }, { '1': 'IN', '2': 'GND' }],
      ['transformer', { value: '2' }, { '1': 'IN', '2': 'GND', '3': 'SA', '4': 'SB' }], R('1k', 'SA', 'SB')],
    { type: 'tran', stop: '60m', step: '50u' });
    const diff = r.v['SA'].map((v, k) => v - r.v['SB'][k]).filter((_, k) => r.x[k] > 0.04);
    near(Math.max(...diff), 20, 0.6);
  });
  for (const coil of ['5 V', '12 V', '24 V']) it(`relay ${coil}: COM to NO when energised, to NC at rest`, () => {
    const vc = Number.parseFloat(coil);
    const deckFor = (on: boolean): Spec[] => [V(on ? vc : 0, 'C'), V(12, 'COM'), R('1k', 'NO', 'GND'), R('1k', 'NC', 'GND'),
      ['relay', { value: coil }, { '1': 'C', '2': 'GND', '3': 'COM', '4': 'NC', '5': 'NO' }]];
    const on = run(deckFor(true)), off = run(deckFor(false));
    near(on.v('NO'), 12, 0.01); near(on.v('NC'), 0, 1e-3);
    near(off.v('NO'), 0, 1e-3); near(off.v('NC'), 12, 0.01);
  });
  it('relay: pulls in and drops out in a transient, with hysteresis', () => {
    const { r } = run([['vpulse', { value: '5', low: '0', freq: '20', duty: '50', edge: '1m' }, { '1': 'C', '2': 'GND' }],
      ['diode', { value: '1N4148' }, { '1': 'C', '2': 'GND' }], V(12, 'COM'), R('1k', 'NO', 'GND'),
      ['relay', { value: '5 V' }, { '1': 'C', '2': 'GND', '3': 'COM', '5': 'NO' }]], { type: 'tran', stop: '100m', step: '20u' });
    const no = r.v['NO'];
    let edges = 0;
    for (let k = 1; k < no.length; k++) if ((no[k - 1] < 6) !== (no[k] < 6)) edges++;
    expect(edges).toBe(4); // two pull-ins and two drop-outs in two periods
  });
});

describe('three-phase parts', () => {
  const ac50 = { type: 'ac', fstart: '50', fstop: '50', perDecade: '1' } as SimSettings;
  const ph = (r: SimResult, a: string, b: string) => {
    const re = r.v[a][0] - (b === 'GND' ? 0 : r.v[b][0]), im = r.vi![a][0] - (b === 'GND' ? 0 : r.vi![b][0]);
    return { mag: Math.hypot(re, im), deg: (Math.atan2(im, re) * 180) / Math.PI };
  };
  it('three-phase source: 230 V phase, 400 V line, 120° apart', () => {
    const { r } = run([['vsin3', { value: '230', freq: '50' }, { '1': 'L1', '2': 'L2', '3': 'L3', '4': 'GND' }],
      R('1k', 'L1', 'GND'), R('1k', 'L2', 'GND'), R('1k', 'L3', 'GND')], { type: 'tran', stop: '40m', step: '20u' });
    near(Math.max(...r.v['L1']), 230 * Math.SQRT2, 0.5);
    near(Math.max(...r.v['L1'].map((v, k) => v - r.v['L2'][k])), 400 * Math.SQRT2 * (230 * Math.sqrt(3) / 400), 1);
    const a = run([['vsin3', { value: '230', ac: '1' }, { '1': 'L1', '2': 'L2', '3': 'L3', '4': 'GND' }], R('1k', 'L1', 'GND'), R('1k', 'L2', 'GND'), R('1k', 'L3', 'GND')], ac50).r;
    near(ph(a, 'L2', 'GND').deg, -120, 0.1); near(ph(a, 'L3', 'GND').deg, 120, 0.1);
  });
  for (const [conn, shift] of [['Yyn', 0], ['Dyn', 30], ['Yd', 30], ['Dd', 0]] as const) it(`three-phase transformer ${conn}: 400 V to 230 V line, phase shift ${shift}°`, () => {
    const sec: Spec[] = [R('1k', 'SU', 'SV'), R('1k', 'SV', 'SW'), R('1k', 'SW', 'SU')];
    const nets: Record<string, string> = { '1': 'PU', '2': 'PV', '3': 'PW', '5': 'SU', '6': 'SV', '7': 'SW' };
    if (conn[0] === 'Y') nets['4'] = 'GND';
    if (conn === 'Yyn' || conn === 'Dyn') nets['8'] = 'GND';
    const { r } = run([['vsin3', { value: '230', ac: '1' }, { '1': 'PU', '2': 'PV', '3': 'PW', '4': 'GND' }],
      ['transformer3', { value: conn, vp: '400', vs: '230', lp: '10', k: '0.9999', rp: '0.01', rs: '0.01' }, nets], ...sec], ac50);
    const p = ph(r, 'PU', 'PV'), q = ph(r, 'SU', 'SV');
    near(q.mag / p.mag, 230 / 400, 0.01 * 230 / 400);
    const d = (((q.deg - p.deg) % 360) + 540) % 360 - 180;
    near(Math.abs(d), shift, 0.5);
  });
});

describe('motors', () => {
  it('DC motor: no-load speed V/(k + Ra·B/k), stall current V/Ra, start-up time constant J·Ra/k²', () => {
    const m: Spec = ['dcmotor', { value: '10m', ra: '2', la: '1m', j: '10u', b: '1u', tl: '0' }, { '1': 'A', '2': 'GND', '3': 'SPD' }];
    const w = 12 / (0.01 + 2 * 1e-6 / 0.01);
    const op = run([V(12, 'A'), m]);
    near(op.v('SPD'), (w * 60) / (2 * Math.PI) / 1000, 0.01);
    const stall = run([V(12, 'A'), ['dcmotor', { value: '10m', ra: '2', j: '10u', tl: '1' }, { '1': 'A', '2': 'GND', '3': 'SPD' }]]);
    // a 1 N·m load stalls it: it turns backwards; the current exceeds the stall current V/Ra = 6 A
    expect(-stall.i(`${stall.refs[1]}.2`)).toBeGreaterThan(6);
    const t = run([V(12, 'A'), m], { type: 'tran', stop: '1', step: '1m', start: 'zero' }).r;
    const tau = (10e-6 * 2) / (0.01 * 0.01);
    const k = t.x.findIndex((x) => x >= tau);
    near(t.v['SPD'][k] / t.v['SPD'][t.x.length - 1], 1 - Math.exp(-1), 0.03);
  });
  const zMotor = (rs: number, rr: number, ls: number, lm: number, s: number, f = 50) => {
    const w = 2 * Math.PI * f;
    // rotor branch rr/s + jωls in parallel with jωlm, plus rs + jωls
    const [ar, ai] = [rr / s, w * ls], [br, bi] = [0, w * lm];
    const nr = ar * br - ai * bi, ni = ar * bi + ai * br, dr = ar + br, di = ai + bi;
    const den = dr * dr + di * di;
    return Math.hypot(rs + (nr * dr + ni * di) / den, w * ls + (ni * dr - nr * di) / den);
  };
  it('AC motor, single-phase: current from the equivalent circuit at the slip', () => {
    const { r, refs } = run([['vsin', { value: '0', ac: '1', freq: '50' }, { '1': 'L', '2': 'GND' }],
      ['motor1', { value: '0.05' }, { '1': 'L', '2': 'GND' }]], { type: 'ac', fstart: '50', fstop: '50', perDecade: '1' });
    const i = Math.hypot(r.i[`${refs[1]}.1`][0], r.ii![`${refs[1]}.1`][0]);
    near(i, 1 / zMotor(3, 3, 20e-3, 0.5, 0.05), 1e-3 / zMotor(3, 3, 20e-3, 0.5, 0.05));
  });
  it('AC motor, three-phase: balanced line currents, no neutral current, locked rotor draws more', () => {
    const deckFor = (slip: string): Spec[] => [['vsin3', { value: '230', ac: '1' }, { '1': 'U', '2': 'V', '3': 'W', '4': 'GND' }],
      ['motor3', { value: slip }, { '1': 'U', '2': 'V', '3': 'W', '4': 'GND' }]];
    const run1 = run(deckFor('0.04'), { type: 'ac', fstart: '50', fstop: '50', perDecade: '1' });
    const ref = run1.refs[1], I = (pin: string) => Math.hypot(run1.r.i[`${ref}.${pin}`][0], run1.r.ii![`${ref}.${pin}`][0]);
    const z = zMotor(1.5, 1.2, 6e-3, 0.2, 0.04);
    for (const pin of ['1', '2', '3']) near(I(pin), 1 / z, 1e-3 / z);
    near(I('4'), 0, 1e-6);
    const locked = run(deckFor('1'), { type: 'ac', fstart: '50', fstop: '50', perDecade: '1' });
    expect(Math.hypot(locked.r.i[`${locked.refs[1]}.1`][0], locked.r.ii![`${locked.refs[1]}.1`][0])).toBeGreaterThan(4 / z);
  });
  for (const [ms, deg] of [[1.0, -90], [1.5, 0], [2.0, 90], [1.25, -45]] as const) it(`servo: ${ms} ms pulses turn it to ${deg}°`, () => {
    const { r } = run([V(5, 'VP'), ['vpulse', { value: '5', low: '0', freq: '50', duty: String(ms / 20 * 100), edge: '1u' }, { '1': 'PWM', '2': 'GND' }],
      ['servo', { value: '600' }, { '1': 'PWM', '2': 'VP', '3': 'GND', '4': 'POS' }]], { type: 'tran', stop: '400m', step: '100u' });
    near(r.v['POS'][r.x.length - 1], deg / 100, 0.02);
  });
  it('servo: it turns at the set speed (0.1 s per 60° at 600 °/s)', () => {
    const { r } = run([V(5, 'VP'), ['vpulse', { value: '5', low: '0', freq: '50', duty: '10', edge: '1u' }, { '1': 'PWM', '2': 'GND' }],
      ['servo', { value: '600' }, { '1': 'PWM', '2': 'VP', '3': 'GND', '4': 'POS' }]], { type: 'tran', stop: '200m', step: '100u' });
    const k = r.x.findIndex((x) => x >= 0.1);
    // the first pulse ends at 2 ms; 98 ms later the horn has turned about 59°
    near(r.v['POS'][k], 0.588, 0.03);
  });
});

describe('logic', () => {
  const lv = (b: boolean) => (b ? 5 : 0);
  const table: [string, (a: boolean, b: boolean) => boolean][] = [
    ['and2', (a, b) => a && b], ['nand2', (a, b) => !(a && b)], ['or2', (a, b) => a || b], ['nor2', (a, b) => !(a || b)], ['xor2', (a, b) => a !== b],
  ];
  for (const [sym, f] of table) it(`${sym}: truth table, output at the rail or ground`, () => {
    for (const a of [false, true]) for (const b of [false, true]) {
      const { v } = run([V(lv(a), 'A'), V(lv(b), 'B'), R('10k', 'Y', 'GND'), [sym, {}, { '1': 'A', '2': 'B', '3': 'Y' }]]);
      near(v('Y'), f(a, b) ? 5 * 10e3 / (10e3 + 50) : 0, 1e-3);
    }
  });
  it('inverter and Schmitt inverter; the Schmitt input has hysteresis (60 % up, 40 % down)', () => {
    for (const a of [false, true]) expect(run([V(lv(a), 'A'), ['not', {}, { '1': 'A', '2': 'Y' }], R('1meg', 'Y', 'GND')]).v('Y') > 2.5).toBe(!a);
    // a slow triangle 0 → 5 → 0 V over 2 ms
    const { r } = run([['vpulse', { value: '5', low: '0', freq: '500', duty: '50', edge: '1m' }, { '1': 'A', '2': 'GND' }], ['schmitt', {}, { '1': 'A', '2': 'Y' }], R('1meg', 'Y', 'GND')],
      { type: 'tran', stop: '2m', step: '1u' });
    const at = (cond: (k: number) => boolean) => { for (let k = 1; k < r.x.length; k++) if (cond(k)) return r.v['A'][k]; return NaN; };
    near(at((k) => r.v['Y'][k - 1] > 2.5 && r.v['Y'][k] <= 2.5), 3, 0.05); // falls when A passes 60 %
    near(at((k) => r.v['Y'][k - 1] < 2.5 && r.v['Y'][k] >= 2.5), 2, 0.05); // rises when A falls below 40 %
  });
  it('D flip-flop: Q̄ fed back to D divides the clock by two; the 3.3 V rail sets the levels', () => {
    const { r } = run([['vpulse', { value: '3.3', freq: '1k', edge: '1u' }, { '1': 'CLK', '2': 'GND' }], ['dff', { value: '+3V3' }, { '1': 'QN', '2': 'CLK', '3': 'Q', '4': 'QN' }], R('100k', 'Q', 'GND')],
      { type: 'tran', stop: '10m', step: '5u' });
    let rises = 0;
    for (let k = 1; k < r.x.length; k++) if (r.v['Q'][k - 1] < 1.65 && r.v['Q'][k] >= 1.65) rises++;
    expect(rises).toBe(5); // 10 clock periods → 5 output periods
    near(Math.max(...r.v['Q']), 3.3 * 100e3 / (100e3 + 50), 1e-3);
    expect(r.rails.map((x) => x.net)).toContain('+3V3');
  });
  it('the supply rail is the drawn net when there is one; an unnamed rail is refused', () => {
    // drawn +5V rail driven by a 4 V source: the gate output follows it
    const { v } = run([V(4, '+5V'), ['not', {}, { '1': 'GND', '2': 'Y' }], R('1meg', 'Y', 'GND')]);
    near(v('Y'), 4, 1e-3);
    const { sheet } = deck([V(5, 'A'), ['not', { value: 'VDD' }, { '1': 'A', '2': 'Y' }]]);
    expect((simulate(sheet) as { error: string }).error).toMatch(/Logic supply rail "VDD"/);
  });
});

describe('switches and power symbols', () => {
  for (const closed of [true, false]) it(`switch ${closed ? 'closed' : 'open'}`, () => {
    const { i, refs } = run([V(5, 'A'), R('1k', 'A', 'B'), ['switch', { closed: String(closed) }, { '1': 'B', '2': 'GND' }]]);
    near(i(`${refs[1]}.1`), closed ? 5e-3 : 0, 1e-5);
  });
  for (const pressed of [true, false]) it(`push-button ${pressed ? 'pressed' : 'released'}`, () => {
    const { i, refs } = run([V(5, 'A'), R('1k', 'A', 'B'), ['button', { pressed: String(pressed) }, { '1': 'B', '2': 'GND' }]]);
    near(i(`${refs[1]}.1`), pressed ? 5e-3 : 0, 1e-5);
  });
  for (const pos of ['A', 'B']) it(`changeover switch in position ${pos}`, () => {
    const { v } = run([V(5, 'C'), R('1k', 'NA', 'GND'), R('1k', 'NB', 'GND'), ['spdt', { position: pos }, { '1': 'C', '2': 'NA', '3': 'NB' }]]);
    near(v('NA'), pos === 'A' ? 5 : 0, 1e-3);
    near(v('NB'), pos === 'B' ? 5 : 0, 1e-3);
  });
  for (const [rail, volts] of [['+5V', 5], ['+3V3', 3.3], ['+12V', 12], ['-12V', -12]] as const) it(`power rail ${rail} without a source is an ideal ${volts} V supply`, () => {
    let s = emptySheet();
    s = placePart(s, 'power', { x: -30, y: 0 }, 0, false, { value: rail }).sheet; tested.add('power');
    s = placePart(s, 'resistor', { x: 0, y: 0 }, 0, false, { value: '1k' }).sheet;
    s = placePart(s, 'gnd', { x: 30, y: 0 }).sheet;
    s = annotate(s);
    const r = simulate(s) as SimResult;
    expect('error' in r).toBe(false);
    near(r.i['R1.1'][0], volts / 1000, 1e-6);
    expect(r.rails.map((x) => x.net)).toContain(rail);
  });
});

describe('messages that point at the cause', () => {
  it('a ground symbol connected to nothing is named as such, not as missing', () => {
    let s = emptySheet();
    s = placePart(s, 'vdc', { x: 0, y: 0 }).sheet;
    s = placePart(s, 'gnd', { x: 200, y: 0 }).sheet;
    const r = simulate(annotate(s)) as { error: string };
    expect(r.error).toMatch(/ground symbol is not connected/);
  });
  it('two parts with one reference stop the simulation instead of merging their pins', () => {
    const { sheet } = deck([V(5, 'A'), R('1k', 'A', 'GND'), R('1k', 'A', 'GND')]);
    const rs = sheet.parts.filter((p) => p.sym === 'resistor');
    sheet.parts = sheet.parts.map((p) => (p.id === rs[1].id ? { ...p, ref: rs[0].ref } : p));
    const r = simulate(sheet) as { error: string; errors: string[] };
    expect(r.errors.join(' ')).toMatch(/is used 2 times/);
  });
});

describe('parts left on their own', () => {
  it('a floating capacitor or near-zero resistor does not stop the simulation or change the rest', () => {
    const base: Spec[] = [V(5, 'A'), R('1k', 'A', 'B'), R('1k', 'B', 'GND')];
    const lone: Spec[] = [['capacitor', { value: '2' }, {}], ['resistor', { value: '0' }, {}], ['opamp', {}, {}], ['timer555', {}, {}]];
    for (const sim of [{ type: 'op' }, { type: 'tran', stop: '1m', step: '' }] as SimSettings[]) {
      const a = run(base, sim), b = run([...base, ...lone], sim);
      near(b.v("B"), a.v("B"), 1e-6);
    }
    const sw = run([...base, ...lone], { type: 'dc', target: 'R3', param: 'value', start: '0', stop: '10', step: '1' });
    near(sw.r.v["B"][0], 2.5, 1e-6);
  });
});

describe('coverage', () => {
  it('every default value is allowed by its limits, and a value outside them is refused', async () => {
    const { outOfLimits } = await import('../src/eda/symbols');
    const { parseValue } = await import('../src/eda/units');
    for (const sd of SYMBOLS) for (const d of [sd.value, ...sd.params]) {
      if (d.kind === 'value') expect(outOfLimits(d, parseValue(d.default)!), `${sd.id}.${d.key}`).toBeNull();
    }
    const k = SYMBOLS.find((x) => x.id === 'transformer')!.params.find((d) => d.key === 'k')!;
    expect(outOfLimits(k, 2)).toMatch(/at most 1/);
    expect(outOfLimits(k, 0)).toMatch(/above 0/);
  });
  it('every symbol in the library was exercised above', () => {
    expect(SYMBOLS.map((s) => s.id).filter((id) => !tested.has(id))).toEqual([]);
  });
});
