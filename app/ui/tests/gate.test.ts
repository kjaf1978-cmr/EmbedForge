// P9 (D25): the gate controller's motor drive and protections (src/eda/gate.ts). The firmware's
// commands come from the test bench: CLR at 30 ms (the cut-off trips itself at power-up), a
// relay at 50 ms, RUN at 80 ms.
import { describe, expect, it } from 'vitest';
import { gateController, type GateOptions } from '../src/eda/gate';
import { simulate, type SimResult } from '../src/sim/run';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { erc } from '../src/eda/erc';

function run(o: GateOptions) {
  const { sheet, nb } = gateController(o);
  const r = simulate(sheet) as SimResult;
  expect('error' in r ? (r as unknown as { error: string }).error : '').toBe('');
  const x = r.x, n = x.length;
  const at = (t: number) => Math.min(n - 1, x.findIndex((u) => u >= t));
  const im = r.i[`${nb.refOf(sheet, 'M1')}.1`], id = r.i[`${nb.refOf(sheet, 'QM')}.2`];
  const product = new Set(sheet.parts.filter((p) => p.props.scope !== 'test').map((p) => p.ref));
  const over = smoke(sheet, connectivity(sheet), r).rows.filter((q) => q.status === 'over' && product.has(q.ref)).map((q) => `${q.ref} ${q.what} ${q.value} / ${q.rating}`);
  // the motor's current at t, and the first time after t0 that FLTN fell (the cut-off tripped)
  const tripAfter = (t0: number) => { const k = x.findIndex((u, j) => u > t0 && r.v['FLTN'][j] < 1); return k < 0 ? Infinity : x[k] - t0; };
  const peak = (y: number[], t0 = 0, t1 = Infinity) => y.reduce((m, v, k) => (x[k] >= t0 && x[k] <= t1 ? Math.max(m, Math.abs(v)) : m), 0);
  return { r, x, at, im, id, over, tripAfter, peak };
}

describe('gate controller: motor drive, limit switches, cut-off', () => {
  it('ERC clean', () => {
    expect(erc(gateController({ shortAt: 0.5, obstacleAt: 0.5 }).sheet).filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([]);
  });
  it('opening: the motor starts (peak below 12 A), runs at about 2.5 A; the open limit switch stops it in hardware (the firmware still commands OPEN and RUN) and the relays\' brake holds it; no part over its ratings', () => {
    const s = run({ open: 0.05, run: 0.08, clrAt: 0.03, limitAt: 1.0, stop: '1.5' });
    expect(s.peak(s.im)).toBeLessThan(12);
    expect(Math.abs(s.im[s.at(0.9)])).toBeGreaterThan(2);
    expect(Math.abs(s.im[s.at(0.9)])).toBeLessThan(3);
    expect(Math.abs(s.r.v['SPD'][s.at(1.5)])).toBeLessThan(0.05); // braked: below 50 rpm
    expect(Math.abs(s.im[s.at(1.5)])).toBeLessThan(0.1);
    expect(s.over).toEqual([]);
  }, 1_200_000);
  it('an obstacle while closing (the gate held still): the cut-off latches within 150 ms (the stall below 12 A), the motor stays off; no part over its ratings', () => {
    const s = run({ close: 0.05, run: 0.08, clrAt: 0.03, obstacleAt: 1.0, stop: '1.5' });
    expect(s.tripAfter(1.0)).toBeLessThan(0.15);
    expect(s.peak(s.im, 0.9)).toBeLessThan(12);
    expect(Math.abs(s.im[s.at(1.5)])).toBeLessThan(0.05);
    expect(s.over).toEqual([]);
  }, 1_200_000);
  it('the motor cable shorted while opening: the cut-off latches within 20 µs of 25 A, the MOSFET\'s current stays within its pulse rating (160 A); no part over its ratings', () => {
    const s = run({ open: 0.05, run: 0.08, clrAt: 0.03, shortAt: 0.8, stop: '0.9' });
    // the bench's short closes over about 100 µs (its source's edge): timed from 25 A
    const k25 = s.x.findIndex((t, k) => t > 0.8 && Math.abs(s.id[k]) > 25);
    expect(s.tripAfter(s.x[k25])).toBeLessThan(20e-6);
    expect(s.peak(s.id)).toBeLessThan(160);
    expect(Math.abs(s.id[s.at(0.9)])).toBeLessThan(0.05);
    expect(s.over).toEqual([]);
  }, 1_200_000);
  it('the photo-beam broken while closing: the close relay drops, the motor stops and brakes (the firmware still commands CLOSE and RUN); no part over its ratings', () => {
    const s = run({ close: 0.05, run: 0.08, clrAt: 0.03, beamAt: 0.8, stop: '1.2' });
    expect(Math.abs(s.im[s.at(0.75)])).toBeGreaterThan(2);
    expect(Math.abs(s.r.v['SPD'][s.at(1.2)])).toBeLessThan(0.1);
    expect(s.over).toEqual([]);
  }, 1_200_000);
  it('both relays commanded (a firmware fault): both motor terminals on 24 V, no current, nothing shorted; no part over its ratings', () => {
    const s = run({ open: 0.05, close: 0.05, run: 0.08, clrAt: 0.03, stop: '0.6' });
    expect(s.peak(s.im, 0.1)).toBeLessThan(0.05);
    expect(s.peak(s.id, 0.1)).toBeLessThan(0.05);
    expect(s.over).toEqual([]);
  }, 1_200_000);
  it('power-up with RUN and OPEN high (the microcontroller not yet running its program): the cut-off is tripped, the motor does not move', () => {
    const s = run({ open: 0, run: 0, stop: '0.6' });
    expect(s.r.v['FLTN'][s.at(0.3)]).toBeLessThan(1);
    expect(s.peak(s.im, 0.001)).toBeLessThan(0.05);
  }, 1_200_000);
});
