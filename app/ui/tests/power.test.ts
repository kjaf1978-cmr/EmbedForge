// Worked examples of the power and installation track (D20), each against its specification.
import { describe, expect, it } from 'vitest';
import { changeover1, type MainsStep } from '../src/eda/powerExamples';
import { simulate, type SimResult } from '../src/sim/run';
import { erc } from '../src/eda/erc';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { rms } from './power3.helpers';

describe('single-phase change-over with voltage protection', () => {
  it('ERC clean; every part buyable; within its ratings at 230 V', () => {
    const { sheet } = changeover1();
    expect(erc(sheet).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
  });
  // from start-up the mains is taken inside about 197 … 250 V; while connected it trips at 195
  // and 253 V; after a trip the hysteresis reconnects only inside about 205 … 245 V
  const cases: [number, MainsStep | undefined, 'mains' | 'backup'][] = [
    [180, undefined, 'backup'], [194, undefined, 'backup'], [200, undefined, 'mains'], [230, undefined, 'mains'], [248, undefined, 'mains'], [256, undefined, 'backup'], [270, undefined, 'backup'],
    [230, { to: [194], at: 0.6 }, 'backup'], [230, { to: [196], at: 0.6 }, 'mains'], [230, { to: [252], at: 0.6 }, 'mains'], [230, { to: [254], at: 0.6 }, 'backup'],
    [180, { to: [200], at: 0.6 }, 'backup'], [180, { to: [210], at: 0.6 }, 'mains'], [270, { to: [250], at: 0.6 }, 'backup'], [270, { to: [240], at: 0.6 }, 'mains'],
  ];
  for (const [vrms, step, src] of cases) {
    const what = step ? `mains stepping from ${vrms} to ${step.to[0]} V` : `mains at ${vrms} V from start-up`;
    it(`${what}: the load runs from the ${src}; never both contactors closed`, async () => {
      await new Promise((r) => setTimeout(r, 0)); // let the worker answer its RPC between long simulations
      const { sheet, nb } = changeover1(String(vrms * Math.SQRT2), step);
      const r = simulate({ ...sheet, step: undefined }) as SimResult;
      expect('error' in r ? r.error : '').toBe('');
      const k1 = r.i[`${nb.refOf(sheet, 'K1')}.1`], k2 = r.i[`${nb.refOf(sheet, 'K2')}.1`];
      const t0 = r.x[r.x.length - 1] - 0.1, v = step ? step.to[0] : vrms;
      const i1 = rms(r.x, k1, t0), i2 = rms(r.x, k2, t0);
      if (src === 'mains') { expect(i1).toBeGreaterThan((v / 51) * 0.95); expect(i2).toBeLessThan(0.01); }
      else { expect(i2).toBeGreaterThan((230 / 51) * 0.95); expect(i1).toBeLessThan(0.01); }
      // break before make: at no instant do both contactors carry current
      for (let k = 0; k < r.x.length; k++) expect(Math.min(Math.abs(k1[k]), Math.abs(k2[k]))).toBeLessThan(0.05);
      if (vrms === 230 && !step) {
        const rows = smoke(sheet, connectivity(sheet), r).rows.filter((x) => x.status === 'over');
        expect(rows.map((x) => `${x.ref} ${x.what}`)).toEqual([]);
      }
    }, 120_000);
  }
  it('coil supply at 18 V (below the 20 V lockout): both contactors stay open', async () => {
    const { sheet, nb } = changeover1(String(230 * Math.SQRT2), undefined, '0.6', { v24: 18 });
    const r = simulate({ ...sheet, step: undefined }) as SimResult;
    expect('error' in r ? r.error : '').toBe('');
    for (const key of ['K1', 'K2']) expect(rms(r.x, r.i[`${nb.refOf(sheet, key)}.1`], 0.3)).toBeLessThan(0.01);
  }, 120_000);
  it('transfer on a fault (230 → 270 V): the back-up closes only after the dead time', async () => {
    const { sheet, nb } = changeover1(String(230 * Math.SQRT2), { to: [270], at: 0.6 });
    const r = simulate({ ...sheet, step: undefined }) as SimResult;
    expect('error' in r ? r.error : '').toBe('');
    const k1 = r.i[`${nb.refOf(sheet, 'K1')}.1`], k2 = r.i[`${nb.refOf(sheet, 'K2')}.1`];
    let off = 0, on = Infinity;
    r.x.forEach((t, k) => { if (Math.abs(k1[k]) > 0.05) off = t; });
    r.x.forEach((t, k) => { if (t > off && Math.abs(k2[k]) > 0.05 && on === Infinity) on = t; });
    expect(off).toBeGreaterThan(0.6);
    expect(on - off).toBeGreaterThan(0.04);
  }, 120_000);
});
