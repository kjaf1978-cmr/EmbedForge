// P4b (D27, D58): the 5, 10 and 15 kVA stabilisers with contactor-switched taps, as the 1 kVA
// unit. The drawing is checked always; the runs (about half a minute to a few minutes each) with
// LONG=1.
import { describe, expect, it } from 'vitest';
import { stabiliserT, type StabTOptions } from '../src/eda/stabiliserT';
import { STAB_STEPS, STAB_TAPS } from '../src/eda/powerExamples';
import { simulate, type SimResult } from '../src/sim/run';
import { erc } from '../src/eda/erc';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';

const LONG = !!process.env.LONG;
const tapFor = (v: number) => STAB_TAPS[STAB_STEPS.findIndex((s) => v < s) === -1 ? STAB_TAPS.length - 1 : STAB_STEPS.findIndex((s) => v < s)];
/** Test timing: 220 nF restart delay and power good (0.35 s each instead of 7.6 and 0.76 s): the
 *  output contactor closes at about 1.0 … 1.4 s. */
const T = { delayC: '220n' };

function run(o: StabTOptions) {
  const { sheet, nb } = stabiliserT({ ...T, ...o });
  const r = simulate(sheet) as SimResult;
  expect('error' in r ? (r as unknown as { error: string }).error : '').toBe('');
  const x = r.x, n = x.length;
  const out = r.v['OUT'].map((v, k) => v - r.v['NOUT'][k]);
  const rms = (y: number[], t0: number, t1 = x[n - 1]) => { let m = 0, S = 0; for (let k = 1; k < n; k++) if (x[k] >= t0 && x[k] <= t1) { const h = x[k] - x[k - 1]; m += y[k] * y[k] * h; S += h; } return Math.sqrt(m / S); };
  const over = () => smoke(sheet, connectivity(sheet), r).rows.filter((q) => q.status === 'over').map((q) => `${q.ref} ${q.what}`);
  /** Largest current in tap contactor k's pole over [t0, t1]. */
  const ipole = (k: number, t0: number, t1: number) => Math.max(0, ...r.i[`K${k}.1`].filter((_, j) => x[j] >= t0 && x[j] <= t1).map(Math.abs));
  /** Times at which tap contactor k's coil is switched (its driven end crosses 12 V). */
  const cmds = (k: number) => x.filter((_, j) => j > 0 && (r.v[`KT${k}`][j] - 12) * (r.v[`KT${k}`][j - 1] - 12) < 0);
  return { r, x, out, rms, over, ipole, cmds, nb, sheet };
}

describe('contactor-switched stabiliser: the drawing', () => {
  for (const kva of [5, 10, 15] as const) it(`${kva} kVA: ERC clean`, () => {
    expect(erc(stabiliserT({ kva }).sheet).filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([]);
  }, 180_000);
});

describe.runIf(LONG)('contactor-switched stabiliser: steady state at full load', () => {
  for (const kva of [5, 10, 15] as const) for (const v of [140, 230, 300]) {
    it(`${kva} kVA, ${v} V in: tap ${tapFor(v)} V, output ${(v * 230 / tapFor(v)).toFixed(0)} V +2/−3 % and within 230 V ± 10 %; no part over its ratings`, () => {
      const s = run({ kva, vin: v, stop: '1.8' });
      const out = s.rms(s.out, 1.6), want = (v * 230) / tapFor(v);
      expect(out).toBeGreaterThan(want * 0.97);
      expect(out).toBeLessThan(want * 1.02);
      expect(Math.abs(out - 230)).toBeLessThan(23);
      expect(s.over()).toEqual([]);
    }, 1_200_000);
  }
});

describe.runIf(LONG)('contactor-switched stabiliser: every step (5 kVA, half load)', () => {
  // 6 V either side of every step
  for (const v of STAB_STEPS.flatMap((s) => [s - 6, s + 6])) it(`${v} V in: tap ${tapFor(v)} V`, () => {
    const s = run({ kva: 5, vin: v, share: 0.5, stop: '1.8' });
    const out = s.rms(s.out, 1.6), want = (v * 230) / tapFor(v);
    expect(out).toBeGreaterThan(want * 0.97);
    expect(out).toBeLessThan(want * 1.02);
  }, 1_200_000);
});

describe.runIf(LONG)('contactor-switched stabiliser: sequence and faults (DFMEA section 3b)', () => {
  it('power-up: the load waits for power good, the input contactor and the restart delay, and never sees more than 253 V', () => {
    const s = run({ kva: 5, vin: 230, stop: '1.6' });
    const on = s.x[s.out.findIndex((v) => Math.abs(v) > 10)];
    expect(on).toBeGreaterThan(0.6);
    expect(on).toBeLessThan(1.5);
    expect(Math.max(...s.out.map(Math.abs))).toBeLessThan(253 * Math.SQRT2);
    // the switched input is dead until KI closes (power good holds it open)
    const vch = s.r.v['VCH'].map((v, k) => v - s.r.v['N'][k]);
    expect(Math.max(...vch.filter((_, k) => s.x[k] < 0.3).map(Math.abs))).toBeLessThan(20);
  }, 1_200_000);
  for (const [kva, to] of [[5, 215], [15, 215], [5, 245]] as const) it(`${kva} kVA, 230 → ${to} V under full load: no tap contactor makes or breaks current; the gap is under 0.4 s; the output contactor stays in`, () => {
    const s = run({ kva, vin: 230, step: { to: [to], at: 1.5 }, stop: '2.4' });
    for (let k = 1; k <= 7; k++) for (const t of s.cmds(k).filter((t) => t > 1.5)) expect(s.ipole(k, t - 0.005, t + 0.15), `K${k} at ${t.toFixed(3)} s`).toBeLessThan(2);
    // the gap: the output's r.m.s. over 10 ms windows below 50 V
    const lowAt: number[] = [];
    for (let t = 1.5; t < 2.4; t += 0.01) if (s.rms(s.out, t, t + 0.01) < 50) lowAt.push(t);
    expect(lowAt.length).toBeGreaterThan(0);
    expect(lowAt[lowAt.length - 1] + 0.01 - lowAt[0]).toBeLessThan(0.4);
    expect(Math.min(...s.r.v['KMC'].filter((_, k) => s.x[k] > 1.5))).toBeGreaterThan(18);
    const want = (to * 230) / tapFor(to), out = s.rms(s.out, 2.25);
    expect(out).toBeGreaterThan(want * 0.97);
    expect(out).toBeLessThan(want * 1.02);
  }, 1_200_000);
  it('a sag from 230 to 195 V: two taps down (one change after the other), the output recovers', () => {
    // two changes: the second after the sense hold of the first (about 1 s after KI recloses)
    const s = run({ kva: 5, vin: 230, step: { to: [195], at: 1.5 }, stop: '4' });
    const out = s.rms(s.out, 3.8), want = (195 * 230) / 190;
    expect(out).toBeGreaterThan(want * 0.97);
    expect(out).toBeLessThan(want * 1.02);
  }, 1_200_000);
  it('tap contactor K5 welded (held in), 230 → 215 V: KI never closes onto two taps; the output opens (FAULT)', () => {
    const s = run({ kva: 5, vin: 230, welded: 5, step: { to: [215], at: 1.5 }, stop: '2.6' });
    // K4 is commanded, K5 stays closed: KI's coil stays off after the change
    const ki = s.r.v['KIC'].filter((_, k) => s.x[k] > 1.7);
    expect(Math.min(...ki)).toBeGreaterThan(18);
    expect(Math.max(...s.r.i['K4.1'].filter((_, k) => s.x[k] > 1.7).map(Math.abs))).toBeLessThan(2);
    expect(s.rms(s.out, 2.4)).toBeLessThan(10);
  }, 1_200_000);
  it('tap contactor K5 welded and its NO auxiliary open all the same (only the NC is a mirror contact), 230 → 215 V: the match check sees only K4, the mirror chain keeps KI open', () => {
    const s = run({ kva: 5, vin: 230, welded: 5, noOpens: true, step: { to: [215], at: 1.5 }, stop: '2.4' });
    expect(Math.min(...s.r.v['KIC'].filter((_, k) => s.x[k] > 1.7))).toBeGreaterThan(18);
    expect(s.rms(s.out, 2.2)).toBeLessThan(10);
  }, 1_200_000);
  it('the coil driver of K1 shorts while running on tap 5: K1 cannot pull in while KI is closed (seal-in), the output carries on', () => {
    const s = run({ kva: 5, vin: 230, driverShortsAt: { k: 1, at: 1.5 }, stop: '2.2' });
    // no current in K1's coil once its driver has shorted (its feed is open while KI is closed)
    expect(Math.max(...s.r.i['K1.A1'].filter((_, k) => s.x[k] > 1.52).map(Math.abs))).toBeLessThan(0.02);
    expect(s.ipole(1, 1.5, 2.2)).toBeLessThan(1);
    const out = s.rms(s.out, 2.0);
    expect(out).toBeGreaterThan(220);
    expect(out).toBeLessThan(236);
  }, 1_200_000);
  it('15 kVA on a weak line (0.3 Ω), the open-circuit input stepped 230 → 225 V: no hunting (the sense held through each change), the output within 230 V ± 10 %', () => {
    const s = run({ kva: 15, vin: 230, rs: 0.3, step: { to: [225], at: 1.5 }, stop: '3.5' });
    // KI's openings after the step: at most one change
    const kic = s.r.v['KIC'], opens = s.x.filter((t, k) => t > 1.5 && k > 0 && kic[k - 1] < 12 && kic[k] >= 12);
    expect(opens.length).toBeLessThanOrEqual(1);
    expect(Math.abs(s.rms(s.out, 3.2) - 230)).toBeLessThan(23);
  }, 1_200_000);
  it('the coil driver of K1 shorted (K1 always closed) at 230 V: KI never closes, the output stays off', () => {
    const s = run({ kva: 5, vin: 230, driverShorted: 1, stop: '1.8' });
    expect(Math.min(...s.r.v['KIC'].filter((_, k) => s.x[k] > 0.1))).toBeGreaterThan(18);
    expect(Math.max(...s.out.map(Math.abs))).toBeLessThan(10);
  }, 1_200_000);
  it('the output relay\'s driver shorted (KO on from power-up), input raised to 330 V: the protection\'s own relay KP opens the output', () => {
    const s = run({ kva: 5, vin: 230, koShorted: true, step: { to: [330], at: 1.5 }, stop: '2.2' });
    expect(s.rms(s.out, 2.0)).toBeLessThan(10);
  }, 1_200_000);
  it('the thermal cut-out open: KI stays open, no tap carries current, the output stays off', () => {
    const s = run({ kva: 5, vin: 230, hot: true, stop: '1.6' });
    expect(Math.max(...[1, 2, 3, 4, 5, 6, 7].map((k) => s.ipole(k, 0, 1.6)))).toBeLessThan(1);
    expect(Math.max(...s.out.map(Math.abs))).toBeLessThan(10);
  }, 1_200_000);
  it('power factor 0.8 at full load, 140 V in: the output within range and no part over its ratings', () => {
    const s = run({ kva: 10, vin: 140, pf: 0.8, stop: '1.8' });
    const out = s.rms(s.out, 1.6), want = (140 * 230) / 150;
    expect(out).toBeGreaterThan(want * 0.96);
    expect(out).toBeLessThan(want * 1.02);
    expect(s.over()).toEqual([]);
  }, 1_200_000);
});
