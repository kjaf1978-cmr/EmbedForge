// P7b, the high-frequency inverter (48 V, 5 kW): structure, and its DFMEA failure modes
// (DFMEA.md section 6) by simulation. The runs with the converters switching take 10 to 90
// minutes each, so they run with LONG=1 (npm run test:long); their results are in TEST_REPORT.md.
import { describe, expect, it } from 'vitest';
import { inverterHF, type InverterHfOptions } from '../src/eda/inverters';
import { simulate, type SimResult } from '../src/sim/run';
import { erc } from '../src/eda/erc';
import { smoke } from '../src/eda/smoke';
import { buildBom } from '../src/eda/bom';
import { connectivity } from '../src/eda/connectivity';
import { textCollisions } from './drawing.helpers';

const LONG = !!process.env.LONG;

async function runHF(o: InverterHfOptions) {
  const { sheet, nb } = inverterHF(o);
  await new Promise((r) => setTimeout(r, 500)); // let the reporter's pending update be answered before the worker blocks
  const r = simulate(sheet) as SimResult;
  expect('error' in r ? r.error : '').toBe('');
  const x = r.x, n = x.length;
  const ref = (key: string) => nb.refOf(sheet, key);
  const cur = (key: string, pin: string) => r.i[`${ref(key)}.${pin}`];
  const k0 = (t0: number) => Math.max(0, x.findIndex((t) => t >= t0));
  const mean = (y: number[], t0: number) => { let m = 0, T = 0; for (let k = k0(t0) + 1; k < n; k++) { const h = x[k] - x[k - 1]; m += y[k] * h; T += h; } return m / T; };
  const rms = (y: number[], t0: number) => { let m = 0, T = 0; for (let k = k0(t0) + 1; k < n; k++) { const h = x[k] - x[k - 1]; m += y[k] * y[k] * h; T += h; } return Math.sqrt(m / T); };
  const max = (y: number[], t0 = 0) => y.slice(k0(t0)).reduce((m, v) => Math.max(m, v), -Infinity);
  const min = (y: number[], t0 = 0) => y.slice(k0(t0)).reduce((m, v) => Math.min(m, v), Infinity);
  return { r, sheet, x, ref, cur, mean, rms, max, min, last: (net: string) => r.v[net][n - 1] };
}

describe('high-frequency inverter: the drawing', () => {
  const { sheet, nb } = inverterHF();
  it('ERC clean, every connection drawn as a wire or label, text readable', () => {
    expect(erc(sheet).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
    expect(nb.unrouted).toEqual([]);
    expect(textCollisions(sheet)).toEqual([]);
  });
  it('the two sides meet only in transformers, optocouplers, the two Y2 capacitors and leg B of the sine bridge (its node is N, bonded to PE): no other part has pins on both grounds', () => {
    const c = connectivity(sheet);
    const y2 = (p: { sym: string; props: Record<string, string> }) => p.sym === 'capacitor' && p.props.vmax === '1600';
    const legB = new Set([nb.refOf(sheet, 'UDIB')]);
    const both = sheet.parts.filter((p) => p.props.scope !== 'test' && !['transformer', 'opto'].includes(p.sym) && !y2(p) && !legB.has(p.ref)).filter((p) => {
      const nets = [...c.pinNet.entries()].filter(([k]) => k.startsWith(`${p.ref}.`)).map(([, v]) => v);
      return nets.includes('GND') && nets.includes('HVG');
    });
    expect(both.map((p) => p.ref)).toEqual([]);
  });
  it('the controls of the two sides are joined only where intended: merging nets through every part but the sine bridge, its output, the transformers, optocouplers and Y2 capacitors keeps PE and the bus negative apart (a net name shared by mistake would join them)', () => {
    const c = connectivity(sheet);
    const y2 = (p: { sym: string; props: Record<string, string> }) => p.sym === 'capacitor' && p.props.vmax === '1600';
    // the power path joins the sides by design (leg B's node is N); so does the DC servo's
    // divider from N
    const bridging = (p: { id: string; ref: string }) => ['bridge', 'output'].includes(nb.blockOf(p.id)) || p.ref === nb.refOf(sheet, 'RDB1');
    const parent = new Map<string, string>();
    const find = (a: string): string => { while (parent.has(a) && parent.get(a) !== a) a = parent.get(a)!; return a; };
    for (const p of sheet.parts) {
      if (p.props.scope === 'test' || ['transformer', 'opto'].includes(p.sym) || y2(p) || bridging(p)) continue;
      const nets = [...c.pinNet.entries()].filter(([k]) => k.startsWith(`${p.ref}.`)).map(([, v]) => find(v));
      for (const n of nets.slice(1)) if (n !== nets[0]) parent.set(n, nets[0]);
    }
    expect(find('HVG')).not.toBe(find('GND'));
  });
  it('no wasted units (D31): every package full but two LM393 (five comparators on the low-voltage side, seven on the high-voltage side); the logic in one CD4001 and two CD4013, all used', () => {
    const bom = buildBom(sheet);
    const qty = (v: string, sym?: string) => bom.filter((l) => (l.value === v || l.raw === v) && (!sym || l.sym === sym)).reduce((a, l) => a + l.qty, 0);
    expect(qty('LM339')).toBe(2);
    expect(qty('LM393')).toBe(4);
    expect(qty('TL074')).toBe(2);
    expect(qty('LM358')).toBe(1);
    expect(bom.filter((l) => l.sym === 'nor2').reduce((a, l) => a + l.qty, 0)).toBe(1);
    expect(bom.filter((l) => l.sym === 'dff').reduce((a, l) => a + l.qty, 0)).toBe(2);
    const c = connectivity(sheet);
    const spares = sheet.parts.filter((p) => p.sym === 'comparator' && c.pinNet.get(`${p.ref}.1`) === 'GND');
    expect(spares.length).toBe(1); // the high-voltage side's spare has its output on HVG
  });
});

describe('high-frequency inverter: DFMEA failure modes', () => {
  it('H-2 battery connected the wrong way round: nothing conducts, the contactor stays open', async () => {
    const s = await runHF({ reversed: true, stop: '10m' });
    expect(Math.abs(s.max(s.cur('BAT', '1').map(Math.abs)))).toBeLessThan(0.05);
    expect(s.min(s.r.v['BUS'])).toBeGreaterThan(-1);
    expect(s.max(s.r.v['BUS'])).toBeLessThan(1);
    expect(s.max(s.r.v['AXA'])).toBeLessThan(1);
  }, 600_000);
});


/** Every product part within its ratings (the test bench excluded). */
const overRated = (s: Awaited<ReturnType<typeof runHF>>) => {
  const test = new Set(s.sheet.parts.filter((p) => p.props.scope === 'test').map((p) => p.ref));
  return smoke(s.sheet, connectivity(s.sheet), s.r).rows.filter((x) => x.status === 'over' && !test.has(x.ref)).map((x) => `${x.ref} ${x.what}`);
};

/** The output at the rated load from t1 on: 230 V ± 3 %, THD below 3 %, 50 Hz, mean below 1 V (H-12). */
function checkOutput(s: Awaited<ReturnType<typeof runHF>>, t1: number) {
  const out = s.r.v['OUTL'];
  const k0 = s.x.findIndex((t) => t >= t1), xs = s.x.slice(k0), ys = out.slice(k0), T = xs[xs.length - 1] - xs[0];
  const h = (n: number) => { let a = 0, b = 0; for (let k = 1; k < xs.length; k++) { const d = xs[k] - xs[k - 1], w = 2 * Math.PI * 50 * n * xs[k]; a += ys[k] * Math.cos(w) * d; b += ys[k] * Math.sin(w) * d; } return (Math.hypot(a, b) * 2) / T; };
  const h1 = h(1), thd = Math.sqrt([...Array(14)].reduce((m, _, i) => m + h(i + 2) ** 2, 0)) / h1;
  expect(h1 / Math.SQRT2).toBeGreaterThan(230 * 0.97);
  expect(h1 / Math.SQRT2).toBeLessThan(230 * 1.03);
  expect(thd).toBeLessThan(0.03);
  const zc: number[] = []; for (let k = k0 + 1; k < s.x.length; k++) if (out[k - 1] < 0 && out[k] >= 0) zc.push(s.x[k - 1] + (-out[k - 1] / (out[k] - out[k - 1])) * (s.x[k] - s.x[k - 1]));
  expect(zc.length).toBeGreaterThanOrEqual(2);
  expect(Math.abs((zc.length - 1) / (zc[zc.length - 1] - zc[0]) - 50)).toBeLessThan(1);
  // H-12: the output's mean below 1 V
  expect(Math.abs(s.mean(out, t1))).toBeLessThan(1);
  expect(s.max(out.map(Math.abs))).toBeLessThan(230 * Math.SQRT2 * 1.08);
}

describe.runIf(LONG)('high-frequency inverter: DFMEA failure modes (long runs)', () => {
  it('H-1 connecting the battery: pre-charge, the contactor closes above 91 %, the converter charges the bus to 381 V without overvoltage, the sine bridge waits for 355 V', async () => {
    // the pre-charge takes about 0.11 s (10 Ω, 4.7 mF), the contactor 14 ms, the bus about 40 ms
    const s = await runHF({ stop: '180m' });
    const ibat = s.cur('BAT', '1').map(Math.abs), kClose = s.x.findIndex((t, k) => t > 1e-3 && s.r.v['BKA'][k] < 0.3);
    expect(kClose).toBeGreaterThan(0);
    expect(s.max(ibat.slice(0, kClose))).toBeLessThan(5.5);
    expect(s.r.v['BUS'][kClose]).toBeGreaterThan(0.91 * 52 * 0.98);
    const bus = s.r.v['HBUS'].map((v, k) => v - s.r.v['HVG'][k]);
    expect(s.max(bus)).toBeLessThan(427);
    expect(bus[bus.length - 1]).toBeGreaterThan(355);
    // EN (the sine bridge) only once the bus is above 355 V
    const kEn = s.x.findIndex((_, k) => s.r.v['EN'][k] - s.r.v['HVG'][k] > 8);
    if (kEn >= 0) expect(bus[kEn]).toBeGreaterThan(350);
  }, 7_200_000);

  for (const [what, o] of [
    ['H-16 battery below the 42 V low cut-out (41 V)', { vbat: 41 }],
    ['H-16 battery at 45 V, between the cut-out and the 47 V restart level', { vbat: 45 }],
    ['H-16 battery above the 61 V high cut-out (62 V)', { vbat: 62 }],
    ['H-16 heatsink at 95 °C (stop above 90 °C)', { theatsink: 95 }],
  ] as [string, InverterHfOptions][]) {
    it(`${what}: the converter never starts, the bus stays empty`, async () => {
      const s = await runHF({ ...o, stop: '24m' });
      expect(s.max(s.r.v['ENL'])).toBeLessThan(1);
      expect(s.max(s.r.v['HBUS'].map((v, k) => v - s.r.v['HVG'][k]))).toBeLessThan(5);
    }, 1_800_000);
  }

  it('start-up at the rated load (5 kW), 52 V: 230 V 50 Hz, THD below 3 %, no DC at the output, the bus within 381 V ± 6 %, the transformer without DC, every part within its ratings', async () => {
    const s = await runHF({ stop: '160m', precharged: true });
    const t1 = 0.12;
    checkOutput(s, t1);
    // the bus: 381 V, its 100 Hz ripple included
    const bus = s.r.v['HBUS'].map((v, k) => v - s.r.v['HVG'][k]);
    expect(s.min(bus, t1)).toBeGreaterThan(381 * 0.94);
    expect(s.max(bus, t1)).toBeLessThan(381 * 1.06);
    // H-3, H-6, H-8, H-9: every product part within its ratings
    expect(overRated(s)).toEqual([]);
  }, 7_200_000);

  it('the sine bridge alone (bus and 15 V from the bench), 5 kW: 230 V 50 Hz, THD below 3 %, no DC at the output, every part within its ratings', async () => {
    const s = await runHF({ stage: 'sine', stop: '160m', precharged: true });
    checkOutput(s, 0.12);
    expect(overRated(s)).toEqual([]);
  }, 7_200_000);

  it('H-8 at the highest battery voltage (58.4 V, fully charged), 5 kW: every part within its ratings (MOSFET voltage at turn-off, rectifier voltage)', async () => {
    const s = await runHF({ stop: '160m', precharged: true, vbat: 58.4 });
    expect(overRated(s)).toEqual([]);
  }, 7_200_000);

  it('H-7 motor start at half load: a locked rotor (about 85 A) for 50 ms: the current window holds, nothing trips, the output recovers; no product part over its ratings', async () => {
    const s = await runHF({ stop: '260m', precharged: true, load: '21.6', motorStart: { at: 0.16, for: 0.05 } });
    const ish = s.cur('RSHI', '1').map(Math.abs), out = s.r.v['OUTL'];
    expect(s.max(ish, 0.16)).toBeLessThan(90);
    expect(s.max(s.r.v['FLT'].map((v, k) => v - s.r.v['HVG'][k]), 0.02)).toBeLessThan(1);
    expect(s.rms(out, 0.24)).toBeGreaterThan(230 * 0.9);
    expect(s.rms(out, 0.24)).toBeLessThan(230 * 1.05);
    expect(s.max(out.map(Math.abs), 0.21)).toBeLessThan(230 * Math.SQRT2 * 1.3);
    expect(overRated(s)).toEqual([]);
  }, 7_200_000);

  it('H-7 short circuit at the output from the start: the window (±69 A) holds the bridge current below 90 A, the overload timer latches the bridge off; no part over its ratings', async () => {
    const s = await runHF({ stop: '60m', precharged: true, load: '0.02', overloadC: '10n' });
    const ish = s.cur('RSHI', '1').map(Math.abs);
    expect(s.max(ish)).toBeLessThan(90);
    expect(s.last('FLT') - s.last('HVG')).toBeGreaterThan(5);
    expect(s.last('EN') - s.last('HVG')).toBeLessThan(1);
    expect(overRated(s)).toEqual([]);
  }, 7_200_000);

  it('H-10 the voltage loop has lost its sense: the independent protection trips below 270 V and holds the bridge off', async () => {
    const s = await runHF({ stop: '120m', precharged: true, senseOpen: true });
    const out = s.r.v['OUTL'];
    expect(s.max(out.map(Math.abs))).toBeLessThan(270 * Math.SQRT2 * 1.1);
    expect(s.last('FLT') - s.last('HVG')).toBeGreaterThan(5);
    expect(s.max(out.slice(-200).map(Math.abs))).toBeLessThan(5);
  }, 7_200_000);

  it('H-3 the bus feedback has failed (its optocoupler LED open): the independent stop holds the bus below 435 V (the converter alone, 1 kW on the bus)', async () => {
    const s = await runHF({ stage: 'dcdc', stop: '80m', precharged: true, feedbackOpen: true, busLoad: '145' });
    const bus = s.r.v['HBUS'].map((v, k) => v - s.r.v['HVG'][k]);
    expect(s.max(bus)).toBeLessThan(435);
    // it does stop the converter (the feedback alone would hold 381 V)
    expect(s.max(bus)).toBeGreaterThan(400);
    expect(overRated(s)).toEqual([]);
  }, 7_200_000);

  it('H-4 the 380 V bus shorted (0.5 Ω): the converter\'s cycle-by-cycle limit holds the primary current, nothing over its ratings for 20 ms', async () => {
    const s = await runHF({ stage: 'dcdc', stop: '40m', precharged: true, busLoad: '0.5' });
    expect(s.max(s.cur('TR1', '1').map(Math.abs), 0.016)).toBeLessThan(380);
    expect(overRated(s)).toEqual([]);
  }, 7_200_000);
});
