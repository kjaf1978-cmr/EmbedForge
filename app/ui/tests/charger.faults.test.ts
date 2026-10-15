// DFMEA of the MPPT charger (D22): every protection tested by injecting its fault.
import { describe, expect, it } from 'vitest';
import { mpptCharger, type ChargerOptions } from '../src/eda/powerExamples';
import { simulate, type SimResult } from '../src/sim/run';
import type { Sheet } from '../src/eda/schematic';
import { tieNets } from './faults';
import { rms } from './power3.helpers';

async function run(o: ChargerOptions, f: (s: Sheet) => Sheet = (s) => s) {
  const { sheet, nb } = mpptCharger(o);
  await new Promise((r) => setTimeout(r, 500)); // let the reporter's pending update be answered before the worker blocks
  const r = simulate(f(sheet)) as SimResult;
  expect('error' in r ? r.error : '').toBe('');
  const at = (key: string, pin: string) => r.i[`${nb.refOf(sheet, key)}.${pin}`];
  return { r, at, ref: (key: string) => nb.refOf(sheet, key), ibat: (t0: number) => rms(r.x, at('BAT', '1'), t0), last: (net: string) => r.v[net][r.x.length - 1] };
}

describe('MPPT charger: protections against the DFMEA failure modes', () => {
  it('PV array connected the wrong way round: QPV blocks it, nothing flows', async () => {
    const s = await run({ pvReversed: true });
    expect(s.ibat(0.05)).toBeLessThan(0.5);
    expect(Math.abs(rms(s.r.x, s.at('PV', '1'), 0.05))).toBeLessThan(0.5);
  }, 600_000);
  it('battery connected the wrong way round (the auxiliary supply, fed from it through a diode, stays off): blocked by QB2', async () => {
    const s = await run({ batteryReversed: true, aux: 0, stop: '20m' });
    expect(s.ibat(0)).toBeLessThan(1);
  }, 600_000);
  it('Q1 shorted (drain to source): the overvoltage latch cuts the battery and the array off', async () => {
    // a nearly full battery: the uncontrolled current through the short pushes it over 57.6 V
    const s = await run({ vbat: 58 }, (sh) => tieNets(sh, 'PVP', 'SW'));
    expect(s.last('FLT')).toBeGreaterThan(6);
    expect(s.ibat(0.065)).toBeLessThan(1);
    expect(Math.max(...s.r.v['VO'].slice(-2000))).toBeLessThan(100);
  }, 600_000);
  it('the BMS opens the battery during charging: the output stays below the 100 V capacitor rating; the charger stops', async () => {
    const s = await run({ bmsOpenAt: 0.06 });
    const vo = s.r.v['VO'], k0 = s.r.x.findIndex((t) => t > 0.06);
    expect(vo.slice(k0).reduce((m, v) => Math.max(m, v), 0)).toBeLessThan(100);
    expect(s.last('VO')).toBeLessThan(80);
    expect(Math.abs(s.r.i[`${s.ref('L1')}.1`][s.r.x.length - 1])).toBeLessThan(1);
  }, 600_000);
  for (const [what, o] of [['battery at 55 °C', { tbat: 55 }], ['battery at −5 °C', { tbat: -5 }], ['heatsink at 95 °C', { theatsink: 95 }]] as const) {
    it(`${what}: no charging`, async () => {
      const s = await run(o);
      expect(s.ibat(0.06)).toBeLessThan(1);
    }, 600_000);
  }
});
