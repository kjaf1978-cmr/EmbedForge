// P9 (D25): the gate controller's motor drive and protections (src/eda/gate.ts). The firmware's
// commands come from the test bench in the firmware's order: CLR at 150 ms (the power-on reset
// has tripped the cut-off), a relay at 170 ms, RUN at 200 ms.
import { beforeEach, describe, expect, it } from 'vitest';
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
  // each simulation runs for many seconds without yielding: let the worker report to vitest
  // between tests (else "Timeout calling onTaskUpdate")
  beforeEach(() => new Promise<void>((r) => setTimeout(r, 0)));
  it('ERC clean', () => {
    expect(erc(gateController({ shortAt: 0.5, obstacleAt: 0.5 }).sheet).filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([]);
  }, 120_000);
  it('opening: the motor starts (peak below 12 A), runs at about 2.5 A; the open limit switch stops it in hardware (the firmware still commands OPEN and RUN) and the relays\' brake holds it; no part over its ratings', () => {
    const s = run({ open: 0.17, run: 0.2, clrAt: 0.15, limitAt: 1.0, stop: '1.5' });
    expect(s.peak(s.im)).toBeLessThan(12);
    expect(Math.abs(s.im[s.at(0.9)])).toBeGreaterThan(2);
    expect(Math.abs(s.im[s.at(0.9)])).toBeLessThan(3);
    expect(Math.abs(s.r.v['SPD'][s.at(1.5)])).toBeLessThan(0.05); // braked: below 50 rpm
    expect(Math.abs(s.im[s.at(1.5)])).toBeLessThan(0.1);
    expect(s.over).toEqual([]);
  }, 1_200_000);
  it('an obstacle while closing (the gate held still): the cut-off latches within 150 ms (the stall below 12 A), the motor stays off; no part over its ratings', () => {
    const s = run({ close: 0.17, run: 0.2, clrAt: 0.15, obstacleAt: 1.0, stop: '1.5' });
    expect(s.tripAfter(1.0)).toBeLessThan(0.15);
    expect(s.peak(s.im, 0.9)).toBeLessThan(12);
    expect(Math.abs(s.im[s.at(1.5)])).toBeLessThan(0.05);
    expect(s.over).toEqual([]);
  }, 1_200_000);
  it('the motor cable shorted while opening: the cut-off latches within 20 µs of 25 A, the MOSFET\'s current stays within its pulse rating (160 A); no part over its ratings', () => {
    const s = run({ open: 0.17, run: 0.2, clrAt: 0.15, shortAt: 0.8, stop: '0.9' });
    // the bench's short closes over about 100 µs (its source's edge): timed from 25 A
    const k25 = s.x.findIndex((t, k) => t > 0.8 && Math.abs(s.id[k]) > 25);
    expect(s.tripAfter(s.x[k25])).toBeLessThan(20e-6);
    expect(s.peak(s.id)).toBeLessThan(160);
    expect(Math.abs(s.id[s.at(0.9)])).toBeLessThan(0.05);
    expect(s.over).toEqual([]);
  }, 1_200_000);
  it('the photo-beam broken while closing: the close relay drops, the motor stops and brakes (the firmware still commands CLOSE and RUN); no part over its ratings', () => {
    const s = run({ close: 0.17, run: 0.2, clrAt: 0.15, beamAt: 0.8, stop: '1.2' });
    expect(Math.abs(s.im[s.at(0.75)])).toBeGreaterThan(2);
    expect(Math.abs(s.r.v['SPD'][s.at(1.2)])).toBeLessThan(0.1);
    expect(s.over).toEqual([]);
  }, 1_200_000);
  it('both relays commanded (a firmware fault): both motor terminals on 24 V, no current, nothing shorted; no part over its ratings', () => {
    const s = run({ open: 0.17, close: 0.17, run: 0.2, clrAt: 0.15, stop: '0.6' });
    expect(s.peak(s.im, 0.25)).toBeLessThan(0.05);
    expect(s.peak(s.id, 0.25)).toBeLessThan(0.05);
    expect(s.over).toEqual([]);
  }, 1_200_000);
  it('power-up with RUN and OPEN high (the microcontroller not yet running its program): the cut-off is tripped, the motor does not move', () => {
    const s = run({ open: 0, run: 0, stop: '0.6' });
    expect(s.r.v['FLTN'][s.at(0.3)]).toBeLessThan(1);
    expect(s.peak(s.im, 0.001)).toBeLessThan(0.05);
  }, 1_200_000);
  it('power-up with a supply that rises over 100 ms, OPEN and RUN high from the start: the power-on reset trips the cut-off, nothing moves; CLR then releases it', () => {
    const s = run({ rampMs: 100, open: 0, run: 0, clrAt: 0.5, stop: '0.7' });
    expect(s.r.v['FLTN'][s.at(0.45)]).toBeLessThan(1);
    expect(s.peak(s.im, 0.001, 0.49)).toBeLessThan(0.05);
    expect(s.r.v['FLTN'][s.at(0.7)]).toBeGreaterThan(4);
  }, 1_200_000);
  it('a stall from the start (the gate blocked): the cut-off trips within 0.3 s of the start (the blanking about 0.1 s); a normal start does not trip it', () => {
    const s = run({ close: 0.17, run: 0.2, clrAt: 0.15, obstacleAt: 0.2, stop: '0.6' });
    expect(s.tripAfter(0.2)).toBeLessThan(0.3);
    expect(Math.abs(s.im[s.at(0.6)])).toBeLessThan(0.05);
  }, 1_200_000);
  it('closing to the close limit: the close limit stops the motor in hardware (the firmware still commands CLOSE and RUN); no part over its ratings', () => {
    const s = run({ close: 0.17, run: 0.2, clrAt: 0.15, closeLimitAt: 1.0, stop: '1.5' });
    expect(Math.abs(s.im[s.at(0.9)])).toBeGreaterThan(2);
    expect(Math.abs(s.r.v['SPD'][s.at(1.5)])).toBeLessThan(0.05);
    expect(s.r.v['LCI'][s.at(1.2)]).toBeLessThan(0.5);
    expect(s.r.v['LBI'][s.at(1.2)]).toBeLessThan(0.5);
    expect(s.over).toEqual([]);
  }, 1_200_000);
  it('STOP pressed while opening: both relays drop, the motor stops and brakes (the firmware still commands OPEN and RUN)', () => {
    const s = run({ open: 0.17, run: 0.2, clrAt: 0.15, stopPressAt: 0.8, stop: '1.3' });
    expect(Math.abs(s.im[s.at(0.75)])).toBeGreaterThan(2);
    expect(Math.abs(s.r.v['SPD'][s.at(1.3)])).toBeLessThan(0.05);
    expect(s.r.v['LOI'][s.at(1.0)]).toBeLessThan(0.5);
    expect(s.over).toEqual([]);
  }, 1_200_000);
  it('CLR stuck high (a firmware fault): an obstacle still trips the cut-off and it stays tripped; no part over its ratings', () => {
    const s = run({ close: 0.17, run: 0.2, clrAt: 0.15, clrStuck: true, obstacleAt: 1.0, stop: '1.5' });
    expect(s.tripAfter(1.0)).toBeLessThan(0.15);
    expect(s.r.v['FLTN'][s.at(1.5)]).toBeLessThan(1);
    expect(Math.abs(s.im[s.at(1.5)])).toBeLessThan(0.05);
    expect(s.over).toEqual([]);
  }, 1_200_000);
  it('the MOSFET Q7 failed short: the power-on reset holds both relays off; after CLR an obstacle trips the cut-off, which drops the relays and stops the motor', () => {
    const p = run({ qmShort: true, open: 0, run: 0, stop: '0.3' });
    expect(p.peak(p.im, 0.001)).toBeLessThan(0.05);
    const s = run({ qmShort: true, close: 0.17, run: 0.2, clrAt: 0.15, obstacleAt: 1.0, stop: '1.5' });
    expect(s.tripAfter(1.0)).toBeLessThan(0.15);
    expect(Math.abs(s.im[s.at(1.5)])).toBeLessThan(0.1);
    expect(Math.abs(s.r.v['SPD'][s.at(1.5)])).toBeLessThan(0.05);
  }, 1_200_000);
  it('the beam test output: the photo-beam transmitter\'s supply (100 mA) off until the firmware switches it on, then at least 22 V; no part over its ratings', () => {
    const s = run({ beamTxAt: 0.3, stop: '0.5' });
    expect(s.r.v['VTX'][s.at(0.25)]).toBeLessThan(1);
    expect(s.r.v['VTX'][s.at(0.5)]).toBeGreaterThan(22);
    expect(s.over).toEqual([]);
  }, 1_200_000);
});
