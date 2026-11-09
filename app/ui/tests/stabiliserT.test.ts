// P4b (D27, D41): the 5, 10 and 15 kVA stabilisers with thyristor-switched taps. The drawing is
// checked always; the runs (about a minute to a few minutes each) with LONG=1.
import { describe, expect, it } from 'vitest';
import { stabiliserT, type StabTOptions } from '../src/eda/stabiliserT';
import { STAB_STEPS, STAB_TAPS } from '../src/eda/powerExamples';
import { simulate, type SimResult } from '../src/sim/run';
import { erc } from '../src/eda/erc';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';

const LONG = !!process.env.LONG;
const tapFor = (v: number) => STAB_TAPS[STAB_STEPS.findIndex((s) => v < s) === -1 ? STAB_TAPS.length - 1 : STAB_STEPS.findIndex((s) => v < s)];
/** Test timing: 220 nF restart delay (the output closes at about 0.75 s). */
const T = { delayC: '220n' };

function run(o: StabTOptions) {
  const { sheet, nb } = stabiliserT({ ...T, ...o });
  const r = simulate(sheet) as SimResult;
  expect('error' in r ? (r as unknown as { error: string }).error : '').toBe('');
  const x = r.x, n = x.length;
  const out = r.v['OUT'].map((v, k) => v - r.v['NOUT'][k]);
  const rms = (y: number[], t0: number, t1 = x[n - 1]) => { let m = 0, S = 0; for (let k = 1; k < n; k++) if (x[k] >= t0 && x[k] <= t1) { const h = x[k] - x[k - 1]; m += y[k] * y[k] * h; S += h; } return Math.sqrt(m / S); };
  const scr = sheet.parts.filter((p) => p.sym === 'scr').map((p) => Math.max(...r.i[`${p.ref}.1`].map(Math.abs)));
  const over = () => smoke(sheet, connectivity(sheet), r).rows.filter((q) => q.status === 'over').map((q) => `${q.ref} ${q.what}`);
  return { r, x, out, rms, scrPeak: Math.max(...scr), over, nb, sheet };
}
/** The rated input current's peak at the lowest input (140 V). */
const ipk = (kva: number) => (kva * 1000 / 140) * Math.SQRT2;

describe('thyristor-switched stabiliser: the drawing', () => {
  for (const kva of [5, 10, 15] as const) it(`${kva} kVA: ERC clean`, () => {
    expect(erc(stabiliserT({ kva }).sheet).filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([]);
  });
});

describe.runIf(LONG)('thyristor-switched stabiliser: steady state at full load', () => {
  for (const kva of [5, 10, 15] as const) for (const v of [140, 230, 300]) {
    it(`${kva} kVA, ${v} V in: tap ${tapFor(v)} V, output ${(v * 230 / tapFor(v)).toFixed(0)} V ±2 %; the thyristors' peak within the rated input's; no part over its ratings`, () => {
      const s = run({ kva, vin: v, stop: '1' });
      const o = s.rms(s.out, 0.9);
      expect(o).toBeGreaterThan(v * 230 / tapFor(v) * 0.98);
      expect(o).toBeLessThan(v * 230 / tapFor(v) * 1.02);
      expect(s.scrPeak).toBeLessThan(1.5 * ipk(kva));
      expect(s.over()).toEqual([]);
    }, 1_800_000);
  }
});

describe.runIf(LONG)('thyristor-switched stabiliser: tap changes under load (never two taps at once)', () => {
  for (const kva of [5, 15] as const) for (const [what, o] of [
    ['a sag 230 → 195 V, resistive full load', { step: { to: [195], at: 1.0 } }],
    ['a swell 230 → 250 V, resistive full load', { step: { to: [250], at: 1.0 } }],
    ['a sag 230 → 195 V, full load at power factor 0.8 (inductive)', { step: { to: [195], at: 1.0 }, pf: 0.8 }],
  ] as [string, StabTOptions][]) it(`${kva} kVA, ${what}: the output returns within ±6 % of 230 V; the thyristors' peak within the rated input's; no part over its ratings`, () => {
    const s = run({ kva, vin: 230, stop: '1.4', ...o });
    const v = s.rms(s.out, 1.3);
    expect(Math.abs(v - 230) / 230).toBeLessThan(0.06);
    expect(s.scrPeak).toBeLessThan(1.5 * ipk(kva));
    expect(s.over()).toEqual([]);
  }, 1_800_000);
});

describe.runIf(LONG)('thyristor-switched stabiliser: DFMEA', () => {
  it('a thyristor pair failed short (tap 5) and a sag that wants tap 4: no second tap closes onto it (no section short), the stuck-change protection opens the output', () => {
    const s = run({ kva: 5, vin: 230, stop: '1.4', step: { to: [195], at: 1.0 }, shorted: 5 });
    expect(s.scrPeak).toBeLessThan(1.5 * ipk(5));
    expect(s.rms(s.out, 1.3)).toBeLessThan(5);
  }, 1_800_000);
  it('the heatsink above 85 °C (95 °C): the output never closes', () => {
    const s = run({ kva: 5, vin: 230, stop: '1', theatsink: 95 });
    expect(s.rms(s.out, 0.8)).toBeLessThan(5);
  }, 1_800_000);
  it('no load (the autotransformer\'s magnetising current only), 230 → 195 V: the tap still changes and the output returns', () => {
    const s = run({ kva: 15, vin: 230, stop: '1.4', step: { to: [195], at: 1.0 }, noLoad: true });
    expect(Math.abs(s.rms(s.out, 1.3) - 230) / 230).toBeLessThan(0.06);
  }, 1_800_000);
});
