// Worked examples of the power and installation track (D20): the three-phase change-over.
import { expect, it } from 'vitest';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { changeover3, type MainsStep } from '../src/eda/powerExamples';
import { simulate, type SimResult } from '../src/sim/run';

/** r.m.s. value of y over x > t0 (trapezoidal). */
export const rms = (x: number[], y: number[], t0: number) => {
  let s = 0, T = 0;
  for (let k = 1; k < x.length; k++) if (x[k] > t0) { const h = x[k] - x[k - 1]; s += h * (y[k] ** 2 + y[k - 1] ** 2) / 2; T += h; }
  return Math.sqrt(s / T);
};

type Case = [[number, number, number], MainsStep | undefined, 'mains' | 'backup', string];

export function run3(cases: Case[]) {
  for (const [ph, step, src, why] of cases) {
    const what = step ? `${ph.join(' / ')} V stepping to ${step.to.join(' / ')} V` : `${ph.join(' / ')} V from start-up`;
    it(`${what} (${why}): the load runs from the ${src}; never both contactors closed`, async () => {
      await new Promise((r) => setTimeout(r, 0)); // let the worker answer its RPC between long simulations
      const { sheet, nb } = changeover3(ph, step, step ? '0.7' : '0.5');
      const r = simulate(sheet) as SimResult;
      expect('error' in r ? r.error : '').toBe('');
      const k1 = r.i[`${nb.refOf(sheet, 'K1')}.1`], k2 = r.i[`${nb.refOf(sheet, 'K2')}.1`];
      const t0 = r.x[r.x.length - 1] - 0.1, v = step ? step.to : ph;
      const i1 = rms(r.x, k1, t0), i2 = rms(r.x, k2, t0);
      if (src === 'mains') { expect(i1).toBeGreaterThan((v[0] / 51) * 0.95); expect(i2).toBeLessThan(0.01); }
      else { expect(i2).toBeGreaterThan((230 / 51) * 0.95); expect(i1).toBeLessThan(0.01); }
      for (let k = 0; k < r.x.length; k++) expect(Math.min(Math.abs(k1[k]), Math.abs(k2[k]))).toBeLessThan(0.05);
      if (why === 'balanced') {
        const rows = smoke(sheet, connectivity(sheet), r).rows.filter((x) => x.status === 'over');
        expect(rows.map((x) => `${x.ref} ${x.what}`)).toEqual([]);
      }
    }, 300_000);
  }
}
