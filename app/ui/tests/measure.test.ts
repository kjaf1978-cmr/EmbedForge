// Waveform measurements: pulse timing (rise and fall time, period, duty cycle, overshoot)
// against exact values.
import { describe, expect, it } from 'vitest';
import { measure, timing } from '../src/sim/measure';
import { Engine } from '../src/sim/engine';
import { simulate, type SimResult } from '../src/sim/run';
import { EXAMPLES } from '../src/eda/examples';
import { parseValue } from '../src/eda/units';

const near = (x: number | null, want: number, tol: number) => { expect(x).not.toBeNull(); expect(Math.abs(x! - want), `${x} vs ${want}`).toBeLessThanOrEqual(tol); };

/** A trapezoidal pulse train as points: 0 → 5 V, rise tr, high pw, fall tf, period per. */
function pulses(tr: number, pw: number, tf: number, per: number, n: number, lo = 0, hi = 5): [number[], number[]] {
  const x: number[] = [0], y: number[] = [lo];
  for (let k = 0; k < n; k++) {
    const t0 = k * per + per / 10;
    x.push(t0, t0 + tr, t0 + tr + pw, t0 + tr + pw + tf); y.push(lo, hi, hi, lo);
  }
  x.push(n * per + per / 10); y.push(lo);
  return [x, y];
}

describe('pulse measurements', () => {
  it('a trapezoidal pulse train: 10–90 % times, period and duty cycle at the 50 % level', () => {
    const [x, y] = pulses(1e-6, 2e-6, 2e-6, 10e-6, 8);
    const m = timing(x, y)!;
    near(m.base, 0, 1e-9); near(m.top, 5, 1e-9);
    near(m.rise, 0.8e-6, 1e-12);
    near(m.fall, 1.6e-6, 1e-12);
    near(m.period, 10e-6, 1e-12);
    // high from the middle of the rise to the middle of the fall: tr/2 + pw + tf/2 = 3.5 µs
    near(m.duty, 35, 1e-6);
    expect(m.overshoot).toBe(0); expect(m.undershoot).toBe(0);
    expect(m.edges).toEqual({ rise: 8, fall: 8 });
  });
  it('a range of the waveform: only the complete edges and cycles in it count', () => {
    const [x, y] = pulses(1e-6, 2e-6, 2e-6, 10e-6, 8);
    const m = timing(x, y, 15e-6, 45e-6)!;
    near(m.period, 10e-6, 1e-12);
    expect(m.edges.rise).toBe(3);
  });
  it('RC charging: rise time 10–90 % = RC·ln 9', () => {
    const rc = 1e3 * 100e-9;
    const eng = new Engine({ elements: [
      { kind: 'V', name: 'V1', p: 'in', n: '0', dc: 0, wave: { type: 'pulse', v1: 0, v2: 1, td: 0, tr: 1e-9, tf: 1e-9, pw: 2e-3, per: 4e-3 } },
      { kind: 'R', name: 'R1', a: 'in', b: 'out', r: 1e3 },
      { kind: 'C', name: 'C1', a: 'out', b: '0', c: 100e-9 },
    ] });
    const w = eng.tran(1e-6, 8e-3, 1e-6);
    const m = timing(w.x, w.v.out)!;
    near(m.rise, rc * Math.log(9), rc * 0.01);
    near(m.fall, rc * Math.log(9), rc * 0.01);
    near(m.duty, 50, 0.5);
    near(m.period, 4e-3, 4e-6);
  });
  it('a series RLC step: overshoot e^(−ζπ/√(1−ζ²)) above the settled level', () => {
    const L = 10e-3, C = 1e-6, R = 40; // ζ = R/2·√(C/L) = 0.2
    const z = (R / 2) * Math.sqrt(C / L);
    const eng = new Engine({ elements: [
      { kind: 'V', name: 'V1', p: 'in', n: '0', dc: 0, wave: { type: 'pulse', v1: 0, v2: 1, td: 0, tr: 1e-9, tf: 1e-9, pw: 1, per: 2 } },
      { kind: 'R', name: 'R1', a: 'in', b: 'a', r: R },
      { kind: 'L', name: 'L1', a: 'a', b: 'out', l: L },
      { kind: 'C', name: 'C1', a: 'out', b: '0', c: C },
    ] });
    const w = eng.tran(2e-6, 20e-3, 2e-6);
    const m = timing(w.x, w.v.out)!;
    near(m.top, 1, 0.005);
    near(m.overshoot, 100 * Math.exp((-z * Math.PI) / Math.sqrt(1 - z * z)), 1);
  });
  it('a sine: no flat levels, so top and base are the peaks; no overshoot; duty 50 %', () => {
    const x = Array.from({ length: 4001 }, (_, k) => k * 1e-5), y = x.map((t) => Math.sin(2 * Math.PI * 100 * t));
    const m = timing(x, y)!;
    near(m.top, 1, 1e-6); near(m.base, -1, 1e-6);
    expect(m.overshoot).toBe(0);
    near(m.period, 0.01, 1e-7);
    near(m.duty, 50, 0.01);
    // and the existing frequency measurement agrees
    near(measure(x, y).freq, 100, 1e-3);
  });
  it('a flat line has no timing', () => {
    expect(timing([0, 1], [2, 2])).toBeNull();
  });
  it('555 blinker example: period 0.693·(R1 + 2·R2)·C and duty (R1 + R2)/(R1 + 2·R2)', () => {
    const ex = EXAMPLES.find((e) => e.id === 'blinker555')!;
    const sheet = ex.build();
    const r = simulate(sheet) as SimResult;
    const out = Object.keys(r.v).find((k) => /OUT/i.test(k))!;
    const vals = (sym: string) => sheet.parts.filter((p) => p.sym === sym).map((p) => parseValue(p.props.value)!);
    const [r1, r2] = vals('resistor'), [c] = vals('capacitor_pol');
    expect([r1, r2]).toEqual([10e3, 68e3]); expect(c).toBeCloseTo(10e-6, 12);
    // skip the first cycle (the capacitor starts empty)
    const t0 = r.x[r.x.length - 1] * 0.3;
    const m = timing(r.x, r.v[out], t0)!;
    near(m.period, 0.693 * (r1 + 2 * r2) * c, 0.693 * (r1 + 2 * r2) * c * 0.03);
    near(m.duty, (100 * (r1 + r2)) / (r1 + 2 * r2), 2);
  });
});
