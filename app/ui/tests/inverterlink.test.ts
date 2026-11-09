// P7, DFMEA I-13 / H-18: inverter units in parallel and as three phases, with their link modules
// and the link box (inverterLink.ts, inverterSystem.ts). The box and the drawings are quick; the
// runs of whole systems take hours and run with LONG=1 (results in TEST_REPORT.md).
import { describe, expect, it } from 'vitest';
import { inverterLF } from '../src/eda/inverters';
import { joinSheets, linkBox } from '../src/eda/inverterLink';
import { inverterSystem, type SystemOptions } from '../src/eda/inverterSystem';
import { NB } from '../src/eda/powerExamples';
import { simulate, type SimResult } from '../src/sim/run';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { useCheckpoint } from './checkpoint';

const LONG = !!process.env.LONG;

/** Rising crossings of `th` (interpolated). */
function rising(x: number[], y: number[], th: number, t0 = 0): number[] {
  const z: number[] = [];
  for (let k = 1; k < x.length; k++) if (x[k] >= t0 && y[k - 1] < th && y[k] >= th) z.push(x[k - 1] + ((th - y[k - 1]) / (y[k] - y[k - 1])) * (x[k] - x[k - 1]));
  return z;
}
/** Fundamental (amplitude, phase in degrees) and THD of y over [t0, end]. */
function harmonics(x: number[], y: number[], t0: number) {
  const k0 = x.findIndex((t) => t >= t0), T = x[x.length - 1] - x[k0];
  const h = (n: number) => { let a = 0, b = 0; for (let k = k0 + 1; k < x.length; k++) { const d = x[k] - x[k - 1], w = 2 * Math.PI * 50 * n * x[k]; a += y[k] * Math.cos(w) * d; b += y[k] * Math.sin(w) * d; } return { amp: (Math.hypot(a, b) * 2) / T, deg: (Math.atan2(a, b) * 180) / Math.PI }; };
  const h1 = h(1);
  return { ...h1, rms: h1.amp / Math.SQRT2, thd: Math.sqrt([...Array(14)].reduce((m, _, i) => m + h(i + 2).amp ** 2, 0)) / h1.amp };
}
function rmsOf(x: number[], y: number[], t0: number) { let m = 0, T = 0; for (let k = x.findIndex((t) => t >= t0) + 1; k < x.length; k++) { const h = x[k] - x[k - 1]; m += y[k] * y[k] * h; T += h; } return Math.sqrt(m / T); }
const wrap = (d: number) => ((d % 360) + 540) % 360 - 180;

async function run(o: SystemOptions) {
  const sys = inverterSystem(o);
  await new Promise((r) => setTimeout(r, 500));
  const done = useCheckpoint();
  const r = simulate(sys.sheet) as SimResult;
  done();
  expect('error' in r ? (r as unknown as { error: string }).error : '').toBe('');
  const over = smoke(sys.sheet, connectivity(sys.sheet), r).rows.filter((x) => x.status === 'over').map((x) => `${x.ref} ${x.what}`);
  return { ...sys, r, x: r.x, over };
}

describe('link box', () => {
  it('three 50 Hz references 120° apart; every loop sink keeps regulating with six units on it (LEDs 1.8 V)', () => {
    const nb = new NB();
    nb.block('bench').part('VB', 'battery', 400, 0, { value: '42', rint: '0.01' }, { '1': 'SYS_VB', '2': 'GND' }, 1);
    for (let p = 0; p < 3; p++) for (let j = 0; j < 6; j++) nb.part(`D${p}${j}`, 'led', 600 + 300 * p, 100 * j, { colour: 'red' }, { '2': `SYS_SY${p}_${j}`, '1': `SYS_SY${p}_${j + 1}` });
    for (let j = 0; j < 6; j++) nb.part(`DR${j}`, 'led', 1600, 100 * j, { colour: 'red' }, { '2': `SYS_RUN${j}`, '1': `SYS_RUN${j + 1}` });
    linkBox(nb, 'SYS_VB', [6, 6, 6]);
    nb.sim({ type: 'tran', stop: '90m', step: '10u', start: 'zero' });
    const r = simulate(nb.done()) as SimResult;
    const x = r.x, a = rising(x, r.v['B1'], 7.5, 0.02), b = rising(x, r.v['B3'], 7.5, 0.02), c = rising(x, r.v['B2N'], 7.5, 0.02);
    const f = (a.length - 1) / (a[a.length - 1] - a[0]);
    expect(Math.abs(f - 50)).toBeLessThan(1);
    const lag = (z: number[]) => wrap((z.find((t) => t > a[0])! - a[0]) * f * 360);
    expect(Math.abs(lag(b) - 120)).toBeLessThan(0.5);
    expect(Math.abs(lag(c) + 120)).toBeLessThan(0.5); // 240°
    // the sinks: at least 1 V across each with six LEDs in its loop
    const tail = (n: string) => r.v[n].slice(-3000);
    for (const p of [0, 1, 2]) expect(Math.min(...tail(`SYS_SY${p}_6`))).toBeGreaterThan(1);
    expect(Math.min(...tail('SYS_RUN6'))).toBeGreaterThan(1);
  }, 600_000);
});

describe('linked unit: the drawing', () => {
  it('a unit without the link has no link parts; a linked unit has the module and JQ in position B', () => {
    const plain = inverterLF({}).nb, linked = inverterLF({ link: { sync: ['SYS_A', 'SYS_B'], run: ['SYS_C', 'SYS_D'], bus: 'SYS_L1' } }).nb;
    expect(plain.ids.has('JQ')).toBe(false);
    expect(plain.ids.has('UKS')).toBe(false);
    expect(linked.ids.has('JQ') && linked.ids.has('UKS') && linked.ids.has('TKC')).toBe(true);
    expect(linked.unrouted).toEqual([]);
  }, 120_000);
});

describe.runIf(LONG)('the phase-locked loop (the 50 Hz, sine and link blocks of two units, ideal supplies)', () => {
  it('two units with 5 % off filter capacitors and a 2 % off oscillator lock to the reference within 0.7 s, their sines within 0.5° of each other', () => {
    const KEEP = new Set(['50 Hz', 'sine', 'link', '']);
    const unit = (k: number, rb: string, cs: number) => {
      const { sheet, nb } = inverterLF({ link: { sync: [`SYS_SY0_${k}`, `SYS_SY0_${k + 1}`], run: [`SYS_RUN${k}`, `SYS_RUN${k + 1}`], bus: 'SYS_L1' }, load: '0' });
      sheet.parts = sheet.parts.filter((p) => KEEP.has(nb.blockOf(p.id)));
      for (const p of sheet.parts) {
        if (['CF1', 'CF2', 'CF3', 'CF4'].some((key) => nb.ids.get(key) === p.id)) p.props = { ...p.props, value: `${parseFloat(p.props.value) * cs}n` };
        if (nb.ids.get('RK5B') === p.id) p.props = { ...p.props, value: rb };
      }
      const ren = new Map([['V12', 'SYS_V12'], ['VMID', 'SYS_VMID'], ['VREF', 'SYS_VREF'], ['VME', 'SYS_VMID'], ['VA', 'SYS_VA'], ['EN', 'SYS_V12'], ['SO', 'SYS_VREF'], ['VFX', 'SYS_VMID'], ['OUTL', 'GND'], ['BQE', `SYS_BQE${k}`]]);
      for (const l of sheet.labels) if (ren.has(l.name)) l.name = ren.get(l.name)!;
      for (const p of sheet.parts) if (ren.has(p.props.value) && ['dff', 'xor2', 'power'].includes(p.sym)) p.props = { ...p.props, value: ren.get(p.props.value)! };
      return sheet;
    };
    const nb = new NB();
    nb.block('bench').part('VS', 'battery', 0, 0, { value: '12', rint: '0.01' }, { '1': 'SYS_V12', '2': 'GND' }, 1)
      .part('VM', 'battery', 100, 0, { value: '6', rint: '0.01' }, { '1': 'SYS_VMID', '2': 'GND' }, 1)
      .part('VR', 'battery', 200, 0, { value: '2.5', rint: '0.01' }, { '1': 'SYS_VREF', '2': 'GND' }, 1)
      .part('VAA', 'battery', 300, 0, { value: '0.001', rint: '0.01' }, { '1': 'SYS_VA', '2': 'GND' }, 1)
      .part('VB', 'battery', 400, 0, { value: '52', rint: '0.01' }, { '1': 'SYS_VB', '2': 'GND' }, 1)
      .part('RLB', 'resistor', 500, 0, { value: '1k' }, { '1': 'SYS_L1', '2': 'GND' }, 1)
      .part('RQ0', 'resistor', 800, 0, { value: '47k' }, { '1': 'SYS_V12', '2': 'SYS_BQE0' })
      .part('RQ1', 'resistor', 900, 0, { value: '47k' }, { '1': 'SYS_V12', '2': 'SYS_BQE1' });
    linkBox(nb, 'SYS_VB', [2]);
    nb.sim({ type: 'tran', stop: '800m', step: '20u', start: 'zero' });
    const box = nb.done();
    const sheet = joinSheets([unit(0, '32.4k', 1), unit(1, '31.6k', 1.05), box], ['', '_1', '_LB']);
    sheet.sim = box.sim;
    const r = simulate(sheet) as SimResult;
    const x = r.x, s0 = rising(x, r.v['SINE'], 6, 0.7), s1 = rising(x, r.v['SINE_1'], 6, 0.7), sy = rising(x, r.v['KSY'].map((v) => -v), -6, 0.69);
    expect(s0.length).toBeGreaterThanOrEqual(4);
    const f = (s0.length - 1) / (s0[s0.length - 1] - s0[0]), fs = (sy.length - 1) / (sy[sy.length - 1] - sy[0]);
    expect(Math.abs(f - fs)).toBeLessThan(0.01);
    for (let i = 0; i < s0.length; i++) {
      const j = s1.reduce((b, t, m) => (Math.abs(t - s0[i]) < Math.abs(s1[b] - s0[i]) ? m : b), 0);
      expect(Math.abs((s1[j] - s0[i]) * 50 * 360)).toBeLessThan(0.5);
    }
  }, 3_600_000);
});

const TOL = (k: number, set: (key: string, p: Record<string, string>) => void) => {
  // the second unit at its tolerances: filter capacitors +5 %, its oscillator −2 %, its sense
  // divider 0.4 % off (what is left of the commissioning trim)
  if (k !== 1) return;
  for (const [key, v] of [['CF1', '115.5n'], ['CF2', '105n'], ['CF3', '283.5n'], ['CF4', '40.95n']]) set(key, { value: v });
  set('RK5B', { value: '31.6k' });
  set('RVO2', { value: '25.6k' });
};

describe.runIf(LONG)('50 Hz-transformer units (48 V) in parallel and as three phases', () => {
  it('I-13 two 5 kW units in parallel at 10 kW, the second at its tolerances: 230 V ±3 %, THD below 3 %, the units share the load within 10 %, their sines within 1°; no product part over its ratings', async () => {
    const s = await run({ arch: 'lf', phases: [0, 0], load: [5.3], unit: { precharged: true, link: { delayC: '1u' } as never }, tweak: TOL, stop: '600m' });
    const t1 = 0.54, out = harmonics(s.x, s.r.v['SYS_L1'], t1);
    expect(out.rms).toBeGreaterThan(230 * 0.97);
    expect(out.rms).toBeLessThan(230 * 1.03);
    expect(out.thd).toBeLessThan(0.03);
    const i0 = rmsOf(s.x, s.r.i[`${s.ref(0, 'TKC')}.1`], t1), i1 = rmsOf(s.x, s.r.i[`${s.ref(1, 'TKC')}.1`], t1);
    expect(Math.abs(i0 - i1) / ((i0 + i1) / 2)).toBeLessThan(0.1);
    const p0 = harmonics(s.x, s.r.v['SINE'], t1).deg, p1 = harmonics(s.x, s.r.v['SINE_1'], t1).deg;
    console.log('parallel LF:', { rms: out.rms, thd: out.thd, i0, i1, dphase: wrap(p1 - p0), over: s.over });
    expect(Math.abs(wrap(p1 - p0))).toBeLessThan(1);
    expect(s.over).toEqual([]);
  }, 43_200_000);

  it('H-18 three 5 kW units as 3 × 400/230 V, 15 kW: line voltages 400 V ±3 %, 120° ±1° apart, THD below 3 %; no product part over its ratings', async () => {
    const s = await run({ arch: 'lf', phases: [0, 1, 2], load: [10.6, 10.6, 10.6], unit: { precharged: true, link: { delayC: '1u' } as never }, stop: '600m' });
    const t1 = 0.54, ph = [1, 2, 3].map((p) => harmonics(s.x, s.r.v[`SYS_L${p}`], t1));
    console.log('3-phase LF:', ph.map((h) => [h.rms, h.deg, h.thd]), s.over);
    for (const h of ph) { expect(h.thd).toBeLessThan(0.03); expect(Math.abs(h.rms - 230) / 230).toBeLessThan(0.03); }
    expect(Math.abs(wrap(ph[0].deg - ph[1].deg) - 120)).toBeLessThan(1);
    expect(Math.abs(wrap(ph[1].deg - ph[2].deg) - 120)).toBeLessThan(1);
    const ll = harmonics(s.x, s.r.v['SYS_L1'].map((v, k) => v - s.r.v['SYS_L2'][k]), t1);
    expect(Math.abs(ll.rms - 400) / 400).toBeLessThan(0.03);
    expect(s.over).toEqual([]);
  }, 43_200_000);

  it('H-18 a unit of the three phases stops (its EN pulled low at 0.5 s): the run loop opens and all three bridges stop within 2 ms; no product part over its ratings', async () => {
    const s = await run({ arch: 'lf', phases: [0, 1, 2], load: [10.6, 10.6, 10.6], unit: { precharged: true, link: { delayC: '1u' } as never }, fault: { unit: 1, at: 0.5 }, stop: '540m' });
    const k = s.x.findIndex((t) => t >= 0.502);
    console.log('fault:', s.suffix.map((sx) => s.r.v[`ENN${sx}`][k]), s.over);
    for (const sx of s.suffix) expect(s.r.v[`ENN${sx}`][k]).toBeGreaterThan(8);
    for (const p of [1, 2, 3]) expect(Math.max(...s.r.v[`SYS_L${p}`].slice(s.x.findIndex((t) => t >= 0.52)).map(Math.abs))).toBeLessThan(50);
    expect(s.over).toEqual([]);
  }, 43_200_000);
});

describe.runIf(LONG)('high-frequency units (48 V) in parallel: their sine bridges (bench buses)', () => {
  it('H-18 two 5 kW sine bridges in parallel at 10 kW, the second at its tolerances: 230 V ±3 %, THD below 3 %, the units share the load within 10 %, their sines within 1°; no product part over its ratings', async () => {
    const s = await run({ arch: 'hf', phases: [0, 0], load: [5.3], unit: { precharged: true, link: { delayC: '1u' } as never }, tweak: TOL, stop: '600m' });
    const t1 = 0.54, out = harmonics(s.x, s.r.v['SYS_L1'], t1);
    expect(out.rms).toBeGreaterThan(230 * 0.97);
    expect(out.rms).toBeLessThan(230 * 1.03);
    expect(out.thd).toBeLessThan(0.03);
    const i0 = rmsOf(s.x, s.r.i[`${s.ref(0, 'TKC')}.1`], t1), i1 = rmsOf(s.x, s.r.i[`${s.ref(1, 'TKC')}.1`], t1);
    expect(Math.abs(i0 - i1) / ((i0 + i1) / 2)).toBeLessThan(0.1);
    console.log('parallel HF:', { rms: out.rms, thd: out.thd, i0, i1, over: s.over });
    const sine = (sx: string) => s.r.v[`SINE${sx}`].map((v, k) => v - s.r.v[`HVG${sx}`][k]);
    expect(Math.abs(wrap(harmonics(s.x, sine('_1'), t1).deg - harmonics(s.x, sine(''), t1).deg))).toBeLessThan(1);
    expect(s.over).toEqual([]);
  }, 43_200_000);
});
