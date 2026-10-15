// The MPPT charger tests (D20), split over three files so that they run in parallel.
import { describe, expect, it } from 'vitest';
import { mpptCharger } from '../src/eda/powerExamples';
import { simulate, type SimResult } from '../src/sim/run';
import { erc } from '../src/eda/erc';
import { deck } from './deck';
import { connectivity } from '../src/eda/connectivity';
import type { Sheet } from '../src/eda/schematic';

const netOf = (sheet: Sheet, ref: string, pin: string) => connectivity(sheet).pinNet.get(`${ref}.${pin}`) ?? '';

/** Mean of y over x > t0 (trapezoidal). */
const mean = (x: number[], y: number[], t0: number) => {
  let s = 0, T = 0;
  for (let k = 1; k < x.length; k++) if (x[k] > t0) { const h = x[k] - x[k - 1]; s += (h * (y[k] + y[k - 1])) / 2; T += h; }
  return s / T;
};

/** Maximum power of the charger's PV array at irradiance g: a DC sweep of the same model. */
function arrayMpp(g: number, temp = 25): { p: number; v: number } {
  const { sheet, refs } = deck([['pv', { value: '410 Wp, 108 half-cells mono', ns: '3', np: '3', g: String(g) }, { '1': 'P', '2': 'GND' }], ['vdc', { value: '90' }, { '1': 'P', '2': 'GND' }]],
    { type: 'dc', target: '', param: 'value', start: '70', stop: '110', step: '0.1' });
  const r = simulate({ ...sheet, temp: String(temp), sim: { type: 'dc', target: refs[1], param: 'value', start: '70', stop: '110', step: '0.1' } }) as SimResult;
  const i = r.i[`${refs[1]}.1`];
  let best = { p: 0, v: 0 };
  r.x.forEach((v, k) => { const p = v * i[k]; if (p > best.p) best = { p, v }; });
  return best;
}

/** Steady state of the last 5 ms: PV power and voltage, battery current and voltage. */
function run(o: Parameters<typeof mpptCharger>[0], stop = 0.07) {
  const { sheet, nb } = mpptCharger({ stop: String(stop), ...o });
  const r = simulate(sheet) as SimResult;
  expect('error' in r ? r.error : '').toBe('');
  const t0 = stop - 0.005, pv = r.v['PVP'], ipv = r.i[`${nb.refOf(sheet, 'PV')}.1`], ib = r.i[`${nb.refOf(sheet, 'BAT')}.1`];
  return {
    r, ppv: -mean(r.x, pv.map((v, k) => v * ipv[k]), t0), vpv: mean(r.x, pv, t0), ibat: mean(r.x, ib, t0), vbat: mean(r.x, r.v['VO'], t0),
    ipeak: r.i[`${nb.refOf(sheet, 'L1')}.1`].reduce((m, v) => Math.max(m, Math.abs(v)), 0),
  };
}

export function chargerTests(part: number) {
  const T = (k: number) => (k === part ? it : it.skip);
  describe(`MPPT solar charger (one 3.7 kW unit), part ${part}`, () => {
  T(1)('ERC clean', () => {
    expect(erc(mpptCharger().sheet).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
  });
  // cells at 25 °C, and on a hot tropical roof at 65 °C
  for (const [g, temp, k] of [[1000, 25, 1], [500, 25, 1], [200, 25, 2], [1000, 65, 2], [300, 65, 2]] as const) {
    T(k)(`${g} W/m², cells at ${temp} °C: the array works at ≥ 97 % of its maximum power; ≥ 93 % reaches the battery`, async () => {
      await new Promise((r) => setTimeout(r, 0));
      const mpp = arrayMpp(g, temp), s = run({ g, temp });
      expect(s.ppv / mpp.p).toBeGreaterThan(0.97);
      expect((s.ibat * s.vbat) / s.ppv).toBeGreaterThan(0.93);
      expect(s.ipeak).toBeLessThan(110);
    }, 600_000);
  }
  T(3)('hot case (1000 W/m², 65 °C air and cells): every power semiconductor stays below Tj 125 °C on its heatsink', async () => {
    const { sheet, nb } = mpptCharger({ temp: 65 });
    const r = simulate(sheet) as SimResult;
    expect('error' in r ? r.error : '').toBe('');
    // loss in the steady state (the last 10 ms), junction-to-case from the datasheet, 1.5 K/W case to air
    const loss = (key: string, pins: string[]) => {
      const ref = nb.refOf(sheet, key), part = sheet.parts.find((p) => p.ref === ref)!;
      const v = (pin: string) => r.v[[...Object.keys(r.v)].find((n) => n === netOf(sheet, ref, pin))!];
      return mean(r.x, r.x.map((_, k) => pins.reduce((a, pin) => a + v(pin)[k] * r.i[`${ref}.${pin}`][k], 0)), 0.06) + 0 * part.x;
    };
    const rows = [['Q1', ['1', '2', '3'], 0.29], ['D1', ['1', '2'], 0.6], ['QB', ['1', '2', '3'], 0.29], ['QB2', ['1', '2', '3'], 0.29], ['QPV', ['1', '2', '3'], 0.29], ['QPV2', ['1', '2', '3'], 0.29]] as const;
    for (const [key, pins, rjc] of rows) {
      const p = loss(key, [...pins]), tj = 65 + p * (rjc + 1.5);
      expect(p).toBeGreaterThan(0);
      expect(tj, `${key}: ${p.toFixed(1)} W, Tj ${tj.toFixed(0)} °C`).toBeLessThan(125);
    }
  }, 600_000);
  T(3)('a deeply discharged battery (44 V): the charge current is limited to 80 A', async () => {
    const s = run({ vbat: 44 });
    expect(s.ibat).toBeLessThan(82);
    expect(s.ibat).toBeGreaterThan(75);
  }, 600_000);
  T(1)('a nearly full battery (56.4 V open-circuit): the battery is held at 56.6 V, the current tapers', async () => {
    const s = run({ vbat: 56.4 });
    expect(s.vbat).toBeLessThan(56.8);
    expect(s.vbat).toBeGreaterThan(56.4);
    expect(s.ibat).toBeLessThan(15);
  }, 600_000);
});
}
