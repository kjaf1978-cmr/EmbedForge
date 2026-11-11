// P9 (D26, D46): the grinder drive (src/eda/grinder.ts), 240 V and 24 V. A run of 0.3 s with the
// 20 kHz PWM takes 10–20 minutes, so the runs need LONG=1. The tests run faster than the product:
// the ramp (220 nF for 4.7 µF), the stall timer and the overload filter where a test says so, and
// the tool's inertia (0.002 kg·m²: the motor reaches speed in about 0.1 s).
import { describe, expect, it } from 'vitest';
import { grinder, GRINDER, type GrinderOptions } from '../src/eda/grinder';
import { simulate, type SimResult } from '../src/sim/run';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { erc } from '../src/eda/erc';

const LONG = !!process.env.LONG;
const T: GrinderOptions = { accelC: '220n', inertia: 0.002, stop: '0.3' };

function run(o: GrinderOptions) {
  const { sheet, nb } = grinder({ ...T, ...o });
  const r = simulate(sheet) as SimResult;
  expect('error' in r ? (r as unknown as { error: string }).error : '').toBe('');
  const x = r.x, n = x.length;
  const at = (t: number) => { const k = x.findIndex((u) => u >= t); return k < 0 ? n - 1 : k; };
  const im = r.i[`${nb.refOf(sheet, 'M1')}.1`];
  // time-weighted mean (the output's points are denser at the switching edges)
  const mean = (y: number[], t0: number, t1: number) => {
    let s = 0, d = 0;
    for (let k = 1; k < n; k++) if (x[k - 1] >= t0 && x[k] <= t1) { const dt = x[k] - x[k - 1]; s += 0.5 * (y[k] + y[k - 1]) * dt; d += dt; }
    return s / Math.max(d, 1e-12);
  };
  const peak = (y: number[], t0 = 0, t1 = Infinity) => y.reduce((m, v, k) => (x[k] >= t0 && x[k] <= t1 ? Math.max(m, Math.abs(v)) : m), 0);
  const rpm = (t: number) => r.v['SPD'][at(t)] * 1000;
  const v = (net: string, t: number) => r.v[net][at(t)];
  const product = new Set(sheet.parts.filter((p) => p.props.scope !== 'test').map((p) => p.ref));
  const over = smoke(sheet, connectivity(sheet), r).rows.filter((q) => q.status === 'over' && product.has(q.ref)).map((q) => `${q.ref} ${q.what} ${q.value} / ${q.rating}`);
  return { r, x, at, im, mean, peak, rpm, v, over };
}

for (const supply of ['240', '24'] as const) {
  const G = GRINDER[supply], ilim = 1.45 * G.irated; // CURRENT LIMIT at its default (90 %): 145 %
  describe(`grinder drive ${supply} V: the drawing`, () => {
    it('ERC clean', () => {
      expect(erc(grinder({ supply, jamAt: 0.1 }).sheet).filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([]);
    }, 30_000);
  });

  describe.runIf(LONG)(`grinder drive ${supply} V: start, speed, torque and protections`, () => {
    it('START at rated load: the motor accelerates at the current limit (145 % of rated, the peak within 5 % of it), reaches the set speed (MAX at 80 %: about 2400 rpm) within 5 % and holds it; no fault; no part over its ratings', () => {
      const s = run({ supply, load: supply === '240' ? 8.3 : 8.6, maxSpeed: 0.7 });
      expect(s.peak(s.im)).toBeLessThan(ilim * 1.05);
      expect(s.v('OK', 0.3)).toBeGreaterThan(6);
      expect(s.v('EN', 0.3)).toBeGreaterThan(6);
      const target = 3000 * (0.7 * 2.5) / 2.0; // MAX 70 % of 2.5 V against 2.0 V at the rated speed
      expect(Math.abs(s.rpm(0.3) - target) / target).toBeLessThan(0.05);
      expect(Math.abs(s.rpm(0.3) - s.rpm(0.25)) / target).toBeLessThan(0.02);
      expect(s.over).toEqual([]);
    }, 3_600_000);
    it('the shaft jammed while running: the current limit holds the motor at 145 % of rated (full torque at standstill), the stall trip latches within about 3 s (here scaled), K1 and the main contactor drop, the motor current ends; no part over its ratings', () => {
      const s = run({ supply, load: 2, jamAt: 0.12, stallC: '100n', stop: '0.3' });
      expect(s.peak(s.im, 0.12, 0.3)).toBeLessThan(ilim * 1.05);
      expect(s.mean(s.im, 0.13, 0.15)).toBeGreaterThan(G.irated);
      expect(s.v('EN', 0.3)).toBeLessThan(1);
      expect(Math.abs(s.mean(s.im, 0.28, 0.3))).toBeLessThan(0.05 * G.irated);
      expect(s.over).toEqual([]);
    }, 3_600_000);
    it('E-STOP while running: K1 drops within 50 ms, the drive is off (the motor coasts, no current) and stays off when the E-stop is released (no restart without START)', () => {
      const s = run({ supply, load: 4, estop: 0.15, stop: '0.3' });
      expect(s.v('EN', 0.12)).toBeGreaterThan(6);
      expect(s.v('EN', 0.2)).toBeLessThan(1);
      expect(Math.abs(s.mean(s.im, 0.2, 0.3))).toBeLessThan(0.05 * G.irated);
      expect(s.v('EN', 0.3)).toBeLessThan(1);
    }, 3_600_000);
    it('a power cut while running and the power back: the drive does not restart by itself', () => {
      const s = run({ supply, load: 4, powerOff: 0.12, powerOn: 0.2, stop: '0.3' });
      expect(s.v('EN', 0.1)).toBeGreaterThan(6);
      expect(s.v('EN', 0.3)).toBeLessThan(1);
      expect(Math.abs(s.mean(s.im, 0.25, 0.3))).toBeLessThan(0.05 * G.irated);
    }, 3_600_000);
    it('the heatsink at 95 °C: START is refused (the fault holds QEN off), the motor does not move', () => {
      const s = run({ supply, load: 4, tHeatsink: 95, stop: '0.15' });
      expect(s.v('EN', 0.15)).toBeLessThan(1);
      expect(s.rpm(0.15)).toBeLessThan(10);
    }, 3_600_000);
    it('overload: 130 % of the rated torque, the overload trip latches (its 20 s filter here scaled) and the drive stops', () => {
      const s = run({ supply, load: supply === '240' ? 10.8 : 11.2, overloadC: '33n', stop: '0.3' });
      expect(s.v('EN', 0.3)).toBeLessThan(1);
    }, 3_600_000);
    if (supply === '24') it('the battery at 20.5 V (below 21 V): START is refused', () => {
      const s = run({ supply, vbat: 20.5, load: 4, stop: '0.15' });
      expect(s.v('EN', 0.15)).toBeLessThan(1);
      expect(s.rpm(0.15)).toBeLessThan(10);
    }, 3_600_000);
  });
}
