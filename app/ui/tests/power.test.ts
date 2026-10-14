// Worked examples of the power and installation track (D20), each against its specification.
import { describe, expect, it } from 'vitest';
import { changeover1 } from '../src/eda/powerExamples';
import { simulate, type SimResult } from '../src/sim/run';
import { erc } from '../src/eda/erc';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';

const rms = (x: number[], y: number[], t0: number) => {
  let s = 0, T = 0;
  for (let k = 1; k < x.length; k++) if (x[k] > t0) { const h = x[k] - x[k - 1]; s += h * (y[k] ** 2 + y[k - 1] ** 2) / 2; T += h; }
  return Math.sqrt(s / T);
};

describe('single-phase change-over with voltage protection', () => {
  it('ERC clean; every part buyable; within its ratings at 230 V', () => {
    const { sheet } = changeover1();
    expect(erc(sheet).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
  });
  // a mains voltage (r.m.s.) and which source must feed the load
  for (const [vrms, src] of [[180, 'backup'], [194, 'backup'], [196, 'mains'], [230, 'mains'], [252, 'mains'], [254, 'backup'], [270, 'backup']] as const) {
    it(`mains at ${vrms} V: the load runs from the ${src}; never both contactors closed`, () => {
      const { sheet, nb } = changeover1(String(vrms * Math.SQRT2));
      const r = simulate({ ...sheet, step: undefined }) as SimResult;
      expect('error' in r ? r.error : '').toBe('');
      const k1 = r.i[`${nb.refOf(sheet, 'K1')}.1`], k2 = r.i[`${nb.refOf(sheet, 'K2')}.1`];
      const t0 = r.x[r.x.length - 1] - 0.1;
      const i1 = rms(r.x, k1, t0), i2 = rms(r.x, k2, t0);
      if (src === 'mains') { expect(i1).toBeGreaterThan((vrms / 51) * 0.95); expect(i2).toBeLessThan(0.01); }
      else { expect(i2).toBeGreaterThan((230 / 51) * 0.95); expect(i1).toBeLessThan(0.01); }
      // break before make: at no instant do both contactors carry current
      for (let k = 0; k < r.x.length; k++) expect(Math.min(Math.abs(k1[k]), Math.abs(k2[k]))).toBeLessThan(0.05);
      if (vrms === 230) {
        const rows = smoke(sheet, connectivity(sheet), r).rows.filter((x) => x.status === 'over');
        expect(rows.map((x) => `${x.ref} ${x.what}`)).toEqual([]);
      }
    }, 120_000);
  }
});
