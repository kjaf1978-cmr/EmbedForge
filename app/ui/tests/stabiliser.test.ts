// Worked example of the power track (D20): the relay-switched mains voltage stabiliser.
import { describe, expect, it } from 'vitest';
import { STAB_STEPS, STAB_TAPS, stabiliser } from '../src/eda/powerExamples';
import { tieNets } from './faults';
import { simulate, type SimResult } from '../src/sim/run';
import { erc } from '../src/eda/erc';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { rms } from './power3.helpers';

/** The tap the stabiliser must use at input v: the first step v is below, else the top tap. */
/** Test timing: a 220 nF restart-delay capacitor (0.35 s instead of the product's 7.6 s) and a
 *  220 nF power-good capacitor (0.35 s instead of 0.76 s), 2 s runs. */
const T = { delayC: '220n' };
const tapFor = (v: number) => STAB_TAPS[STAB_STEPS.findIndex((s) => v < s) === -1 ? STAB_TAPS.length - 1 : STAB_STEPS.findIndex((s) => v < s)];

describe('relay-switched mains voltage stabiliser', () => {
  it('ERC clean', () => {
    expect(erc(stabiliser().sheet).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
  }, 30_000); // building and checking the sheet takes 6–10 s on a loaded machine
  // 6 V either side of every step, and the ends of the input range
  const inputs = [140, ...STAB_STEPS.flatMap((s) => [s - 6, s + 6]), 300];
  for (const v of inputs) {
    it(`${v} V in: tap ${tapFor(v)} V, output ${(v * 230 / tapFor(v)).toFixed(0)} V`, async () => {
      await new Promise((r) => setTimeout(r, 0)); // let the worker answer its RPC between long simulations
      const { sheet } = stabiliser(v, undefined, '2', undefined, T);
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
    }, 1_200_000); // the 170 V tap with the input contactor closed is slow to solve (about 160 … 740 s at 166 and 174 V in); the circuit is correct
  }
  it('the load is connected only after the power-on delay, and never above 253 V', () => {
    const { sheet } = stabiliser(226, undefined, '2', undefined, T);
    const r = simulate(sheet) as SimResult;
    expect('error' in r ? r.error : '').toBe('');
    // power good (0.35 s), the input relay, the protection settled, then the restart delay
    const on = r.x[r.v['OUT'].findIndex((v) => Math.abs(v) > 10)];
    expect(on).toBeGreaterThan(0.6);
    expect(on).toBeLessThan(1.4);
    expect(Math.max(...r.v['OUT'].map(Math.abs))).toBeLessThan(253 * Math.SQRT2);
  }, 120_000);
  it('fault: tap relay K1 stuck on (its driver shorted) at 230 V in: the output stays disconnected', async () => {
    await new Promise((r) => setTimeout(r, 500));
    const { sheet } = stabiliser(230, undefined, '2', undefined, T);
    // a 10 mΩ short from the coil's low side (net K1) to GND
    const r = simulate(tieNets(sheet, 'K1', 'GND')) as SimResult;
    expect('error' in r ? r.error : '').toBe('');
    expect(Math.max(...r.v['OUT'].map(Math.abs))).toBeLessThan(10);
  }, 120_000);
  it('two faults: K1 stuck on and the output relay\'s driver shorted (K7 on from power-up): the protection\'s own relay KP keeps the load off', async () => {
    await new Promise((r) => setTimeout(r, 500));
    const { sheet } = stabiliser(230, undefined, '2', undefined, T);
    const r = simulate(tieNets(tieNets(sheet, 'K1', 'GND'), 'KD', 'GND')) as SimResult;
    expect('error' in r ? r.error : '').toBe('');
    expect(Math.max(...r.v['OUT'].map(Math.abs))).toBeLessThan(10);
  }, 120_000);
  it('power-up with the product\'s timing: no input current until the sense has settled (power good, about 0.76 s), and never the lowest tap with the input relay closed', async () => {
    await new Promise((r) => setTimeout(r, 500));
    const { sheet } = stabiliser(230, undefined, '1.5', undefined, {});
    const r = simulate(sheet) as SimResult;
    expect('error' in r ? r.error : '').toBe('');
    // the input relay's coil on (its low side down) once the 12 V supply is up
    const kiOn = r.x[r.v['KIC'].findIndex((v, k) => v < 2 && r.v['+12V'][k] > 10)];
    expect(kiOn).toBeGreaterThan(0.7);
    // the lowest tap's flip-flop may hold anything while the input relay is open (its state before
    // the first clock); with the input relay closed it is never set
    const bad = r.x.filter((_, k) => r.v['KIC'][k] < 2 && r.v['+12V'][k] > 10 && r.v['QF1'][k] > 6);
    expect(bad).toEqual([]);
  }, 180_000);
  it('a tap changes only while the input relay is open (no current made or broken by a tap relay)', async () => {
    await new Promise((r) => setTimeout(r, 500));
    const { sheet } = stabiliser(230, { to: [215], at: 1.3 }, '2', undefined, T);
    const r = simulate(sheet) as SimResult;
    expect('error' in r ? r.error : '').toBe('');
    // the tap 4 flip-flop takes the new state after the change (230 → 215 V: K4 on)
    const i = r.v['QF4'].findIndex((v, k) => r.x[k] > 1.3 && v > 6);
    expect(i).toBeGreaterThan(0);
    // the input contactor's pole is open (the input's voltage across it within the last 5 ms)
    // when the flip-flop changes, and 15 ms later (the tap relays' operate time)
    const open = (k: number) => { let m = 0; for (let j = k; j > 0 && r.x[j] > r.x[k] - 0.005; j--) m = Math.max(m, Math.abs(r.v['VIN'][j] - r.v['VCH'][j])); return m > 50; };
    expect(open(i)).toBe(true);
    expect(open(r.x.findIndex((x) => x > r.x[i] + 0.015))).toBe(true);
    // the load's gap (the pole open) is under 100 ms
    const t0 = r.x.findIndex((x, k) => x > 1.3 && Math.abs(r.v['VIN'][k] - r.v['VCH'][k]) > 50);
    const t1 = r.x.findIndex((x, k) => k > t0 && x > r.x[t0] + 0.02 && !open(k));
    expect(r.x[t1] - r.x[t0]).toBeLessThan(0.1);
  }, 180_000);
  it('a sag from 230 to 195 V while running: it steps down a tap and the output recovers', async () => {
    const { sheet } = stabiliser(230, { to: [195], at: 1.3 }, '2', undefined, T);
    const r = simulate(sheet) as SimResult;
    expect('error' in r ? r.error : '').toBe('');
    const out = rms(r.x, r.v['OUT'], 1.9);
    expect(out).toBeGreaterThan(195 * 230 / 190 * 0.98);
    expect(out).toBeLessThan(195 * 230 / 190 * 1.02);
  }, 120_000);
});
