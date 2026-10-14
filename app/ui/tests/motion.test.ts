// Motion on the schematic: motor torque and speed, servo angle, and the rotor rate that shows
// them. Torques are checked against the motors' own equations, worked out independently.
import { describe, expect, it } from 'vitest';
import { deck, type Spec } from './deck';
import { simulate, type SimResult } from '../src/sim/run';
import { MAX_RATE, meanTorque, motionAt, shownTorque } from '../src/sim/motion';

const near = (x: number, want: number, tol: number) => expect(Math.abs(x - want), `${x} vs ${want}`).toBeLessThanOrEqual(tol);
const V = (v: number, pos: string): Spec => ['vdc', { value: String(v) }, { '1': pos, '2': 'GND' }];

/** Complex numbers for the equivalent circuit of the induction motor. */
type C = [number, number];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => { const d = b[0] ** 2 + b[1] ** 2; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const par = (a: C, b: C): C => div(mul(a, b), add(a, b));

describe('motor torque and speed', () => {
  it('DC motor: stall torque k·V/Ra at switch-on, no-load speed at the end; the rotor turns fastest at the largest torque', () => {
    const { sheet, refs } = deck([V(12, 'A'), ['dcmotor', { value: '10m', ra: '2', la: '1m', j: '10u', b: '1u' }, { '1': 'A', '2': 'GND' }]],
      { type: 'tran', stop: '2', step: '1m', start: 'zero' }); // 10 mechanical time constants J·Ra/k²
    const r = simulate(sheet) as SimResult;
    const m = r.mech![refs[1]];
    const peak = Math.max(...m.torque!);
    near(peak, (10e-3 * 12) / 2, 0.06 * 0.06);
    // steady state: k·ω = V − Ra·i and k·i = B·ω → ω = V/(k + Ra·B/k)
    const w = 12 / (10e-3 + (2 * 1e-6) / 10e-3);
    near(m.rpm![r.x.length - 1], (w * 60) / (2 * Math.PI), 20);
    near(m.torque![r.x.length - 1], 1e-6 * w, 1e-5);
    const tq = shownTorque(r), kPeak = m.torque!.indexOf(peak);
    const atPeak = motionAt(r, tq, kPeak).get(refs[1])!;
    near(atPeak.rate!, MAX_RATE, 1e-9);
    near(atPeak.share!, 1, 1e-12);
    const atEnd = motionAt(r, tq, r.x.length - 1).get(refs[1])!;
    expect(atEnd.rate!).toBeLessThan(MAX_RATE * 0.1);
    expect(atEnd.rate!).toBeGreaterThan(0);
  });
  it('DC motor driven backwards turns the rotor the other way', () => {
    const { sheet, refs } = deck([V(-12, 'A'), ['dcmotor', {}, { '1': 'A', '2': 'GND' }]]);
    const r = simulate(sheet) as SimResult;
    const mo = motionAt(r, shownTorque(r), 0).get(refs[1])!;
    expect(mo.torque!).toBeLessThan(0);
    expect(mo.rate!).toBeLessThan(0);
  });
  it('three-phase induction motor: torque 3·|Ir|²·(Rr/s)/ωs from the equivalent circuit, speed (1 − s)·120f/poles', () => {
    const p = { value: '0.04', rs: '1.5', rr: '1.2', ls: '6m', lm: '0.2', poles: '4' };
    const { sheet, refs } = deck([['vsin3', { value: '230', freq: '50' }, { '1': 'U', '2': 'V', '3': 'W', '4': 'GND' }], ['motor3', p, { '1': 'U', '2': 'V', '3': 'W', '4': 'GND' }]],
      { type: 'tran', stop: '400m', step: '50u' });
    const r = simulate(sheet) as SimResult;
    const m = r.mech![refs[1]];
    const w = 2 * Math.PI * 50, ws = w / 2;
    // phasor solution per phase: I_s = V/(Rs + jωLs + (jωLm ∥ (Rr/s + jωLs))), divided between Lm and the rotor
    const zr: C = [1.2 / 0.04, w * 6e-3], zm: C = [0, w * 0.2], zin = add([1.5, w * 6e-3], par(zm, zr));
    const is = div([230, 0], zin), ir = div(mul(is, zm), add(zm, zr));
    const t = (3 * (ir[0] ** 2 + ir[1] ** 2) * (1.2 / 0.04)) / ws;
    const k = r.x.length - 1;
    near(shownTorque(r)[refs[1]][k], t, 0.01 * t);
    near(m.rpm![k], 0.96 * 1500, 1e-6);
  });
  it('single-phase motor: the torque pulsates at twice the supply frequency; the shown torque is its mean over a period', () => {
    const { sheet, refs } = deck([['vsin', { value: '325', freq: '50' }, { '1': 'L', '2': 'GND' }], ['motor1', {}, { '1': 'L', '2': 'GND' }]],
      { type: 'tran', stop: '300m', step: '50u' });
    const r = simulate(sheet) as SimResult;
    const raw = r.mech![refs[1]].torque!, shown = shownTorque(r)[refs[1]];
    const last = r.x.findIndex((x) => x >= 0.26);
    const win = raw.slice(last);
    expect(Math.max(...win)).toBeGreaterThan(1.8 * shown[r.x.length - 1]);
    expect(Math.min(...win)).toBeLessThan(0.2 * shown[r.x.length - 1]);
    // the mean is steady once the start-up transient is over
    near(shown[r.x.length - 1], shown[last], 0.01 * shown[last]);
  });
  it('mean over a period: exact for a sine on a constant', () => {
    const x = Array.from({ length: 2001 }, (_, k) => k * 1e-4), t = x.map((q) => 2 + Math.sin(2 * Math.PI * 100 * q));
    const m = meanTorque(x, t, 0.01);
    for (const k of [500, 1000, 2000]) near(m[k], 2, 1e-4);
  });
});

describe('servo angle', () => {
  for (const [ms, deg] of [[1.0, -90], [1.5, 0], [2.0, 90]] as const) it(`${ms} ms pulses: the horn at ${deg}°, also with the angle output loaded`, () => {
    const { sheet, refs } = deck([V(5, 'VP'), ['vpulse', { value: '5', low: '0', freq: '50', duty: String((ms / 20) * 100), edge: '1u' }, { '1': 'PWM', '2': 'GND' }],
      ['servo', { value: '600' }, { '1': 'PWM', '2': 'VP', '3': 'GND', '4': 'POS' }], ['resistor', { value: '100' }, { '1': 'POS', '2': 'GND' }]],
      { type: 'tran', stop: '400m', step: '100u' });
    const r = simulate(sheet) as SimResult;
    const mo = motionAt(r, shownTorque(r), r.x.length - 1).get(refs[2])!;
    expect(mo.kind).toBe('servo');
    near(mo.angle!, deg, 1);
    // the 100 Ω load halves the voltage output, but not the angle
    near(r.v['POS'][r.x.length - 1], deg / 200, 0.02);
  });
});
