// Worked example of the power track (D20): the relay-switched mains voltage stabiliser.
import { describe, expect, it } from 'vitest';
import { STAB_STEPS, STAB_TAPS, stabiliser } from '../src/eda/powerExamples';
import { simulate, type SimResult } from '../src/sim/run';
import { erc } from '../src/eda/erc';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { rms } from './power3.helpers';

/** The tap the stabiliser must use at input v: the first step v is below, else the top tap. */
const tapFor = (v: number) => STAB_TAPS[STAB_STEPS.findIndex((s) => v < s) === -1 ? STAB_TAPS.length - 1 : STAB_STEPS.findIndex((s) => v < s)];

describe('relay-switched mains voltage stabiliser', () => {
  it('ERC clean', () => {
    expect(erc(stabiliser().sheet).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
  });
  // 6 V either side of every step, and the ends of the input range
  const inputs = [140, ...STAB_STEPS.flatMap((s) => [s - 6, s + 6]), 300];
  for (const v of inputs) {
    it(`${v} V in: tap ${tapFor(v)} V, output ${(v * 230 / tapFor(v)).toFixed(0)} V`, async () => {
      await new Promise((r) => setTimeout(r, 0)); // let the worker answer its RPC between long simulations
      const { sheet } = stabiliser(v);
      const r = simulate(sheet) as SimResult;
      expect('error' in r ? r.error : '').toBe('');
      const out = rms(r.x, r.v['OUT'], r.x[r.x.length - 1] - 0.1);
      expect(out).toBeGreaterThan((v * 230 / tapFor(v)) * 0.98);
      expect(out).toBeLessThan((v * 230 / tapFor(v)) * 1.02);
      expect(Math.abs(out - 230)).toBeLessThan(23);
      if (v === 140 || v === 226) {
        const rows = smoke(sheet, connectivity(sheet), r).rows.filter((x) => x.status === 'over');
        expect(rows.map((x) => `${x.ref} ${x.what}`)).toEqual([]);
      }
    }, 120_000);
  }
  it('the load is connected only after the power-on delay, and never above 253 V', () => {
    const { sheet } = stabiliser(226);
    const r = simulate(sheet) as SimResult;
    expect('error' in r ? r.error : '').toBe('');
    const on = r.x[r.v['OUT'].findIndex((v) => Math.abs(v) > 10)];
    expect(on).toBeGreaterThan(0.25);
    expect(on).toBeLessThan(0.45);
    expect(Math.max(...r.v['OUT'].map(Math.abs))).toBeLessThan(253 * Math.SQRT2);
  }, 120_000);
  it('a sag from 230 to 195 V while running: it steps down a tap and the output recovers', async () => {
    const { sheet } = stabiliser(230, { to: [195], at: 0.5 }, '0.9');
    const r = simulate(sheet) as SimResult;
    expect('error' in r ? r.error : '').toBe('');
    const out = rms(r.x, r.v['OUT'], 0.8);
    expect(out).toBeGreaterThan(195 * 230 / 190 * 0.98);
    expect(out).toBeLessThan(195 * 230 / 190 * 1.02);
  }, 120_000);
});
