// Functional check of every part in the library: each symbol, and each model it offers, in a
// minimal circuit with a known answer. The circuits are written as netlists: every pin gets a
// net label (or a ground symbol), so a test reads like a SPICE deck.
import { describe, expect, it } from 'vitest';
import { addLabel, placePart } from '../src/eda/editor';
import { annotate, emptySheet, pinPositions, type SimSettings, type Sheet } from '../src/eda/schematic';
import { SYMBOLS } from '../src/eda/symbols';
import { BJTS, DIODES, LED_COLOURS, MOSFETS, OPAMPS, REGULATORS, ZENERS } from '../src/eda/models';
import { simulate, schematicSpice, type SimResult } from '../src/sim/run';

type Spec = [sym: string, props: Record<string, string>, nets: Record<string, string>];

const tested = new Set<string>();

/** Builds a sheet from a part list; pin → net name, "GND" places a ground symbol on the pin. */
function deck(parts: Spec[], sim: SimSettings = { type: 'op' }): { sheet: Sheet; refs: string[] } {
  let s = emptySheet();
  const ids: string[] = [];
  parts.forEach(([sym, props, nets], k) => {
    tested.add(sym);
    const r = placePart(s, sym, { x: (k % 6) * 200, y: Math.floor(k / 6) * 200 }, 0, false, props);
    s = r.sheet; ids.push(r.id);
    const part = s.parts.find((p) => p.id === r.id)!;
    for (const pin of pinPositions(part)) {
      const net = nets[pin.pin];
      if (!net) continue;
      if (net === 'GND') { s = placePart(s, 'gnd', pin.at).sheet; tested.add('gnd'); }
      else s = addLabel(s, net, pin.at).sheet;
    }
  });
  s = annotate(s);
  s.sim = sim;
  return { sheet: s, refs: ids.map((id) => s.parts.find((p) => p.id === id)!.ref) };
}

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
  const fwd: Record<string, [number, number]> = { '1N4148': [0.6, 0.8], '1N4007': [0.6, 0.8], '1N5819': [0.12, 0.45] };
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
  it('every symbol in the library was exercised above', () => {
    expect(SYMBOLS.map((s) => s.id).filter((id) => !tested.has(id))).toEqual([]);
  });
});
