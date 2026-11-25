// P9 (D24, D65 … D67): the block moulding machine's safety circuit, its 24 V outputs and inputs
// (src/eda/blockMachine.ts). The safety relays are a behavioural model of their certified function.
import { beforeEach, describe, expect, it } from 'vitest';
import { blockMachine, type BlockOptions } from '../src/eda/blockMachine';
import { simulate, type SimResult } from '../src/sim/run';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { erc } from '../src/eda/erc';

function run(o: BlockOptions) {
  const { sheet, nb } = blockMachine(o);
  const r = simulate(sheet) as SimResult;
  expect('error' in r ? (r as unknown as { error: string }).error : '').toBe('');
  const x = r.x, n = x.length;
  const k = (t: number) => Math.min(n - 1, x.findIndex((u) => u >= t));
  const v = (net: string, t: number) => r.v[net][k(t)];
  const iv = r.i[`${nb.refOf(sheet, 'RCV1')}.1`], iq = r.i[`${nb.refOf(sheet, 'QHS1')}.2`];
  const product = new Set(sheet.parts.filter((p) => p.props.scope !== 'test').map((p) => p.ref));
  const over = smoke(sheet, connectivity(sheet), r).rows.filter((q) => q.status === 'over' && product.has(q.ref)).map((q) => `${q.ref} ${q.what} ${q.value} / ${q.rating}`);
  // the first time after t0 that V24S rose above 20 V / fell below 5 V
  const onAfter = (t0: number) => { const j = x.findIndex((u, i) => u > t0 && r.v['V24S'][i] > 20); return j < 0 ? Infinity : x[j]; };
  const offAfter = (t0: number) => { const j = x.findIndex((u, i) => u > t0 && r.v['V24S'][i] < 5); return j < 0 ? Infinity : x[j] - t0; };
  const peak = (y: number[], t0 = 0, t1 = Infinity) => y.reduce((m, q, i) => (x[i] >= t0 && x[i] <= t1 ? Math.max(m, Math.abs(q)) : m), 0);
  return { r, x, v, iv, iq, over, onAfter, offAfter, peak };
}

describe('block moulding machine: safety circuit, outputs and inputs', () => {
  // each simulation runs for many seconds without yielding: let the worker report to vitest
  beforeEach(() => new Promise<void>((r) => setTimeout(r, 0)));
  it('ERC clean', () => {
    expect(erc(blockMachine({ k1Welded: true, ch1Bridged: true, qvShorted: true, valveShortAt: 0.5, allValves: true }).sheet).filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([]);
  }, 120_000);
  it('power-up: the safety rail stays off (no automatic start) even with the controller commanding the pump and a valve; no output current', () => {
    const s = run({ pump: 0.05, valve: 0.05, stop: '0.5' });
    expect(s.v('V24S', 0.5)).toBeLessThan(3);
    expect(s.peak(s.iv)).toBeLessThan(0.01);
  }, 600_000);
  it('reset: the rail comes on at RESET\'s release, not while it is held; the pump contactor and the valve follow the controller and are read back; the valve releases within 5 ms (SMAJ33CA); no part over its ratings', () => {
    const s = run({ reset: 0.1, resetFor: 0.3, pump: 0.5, valve: 0.6, valveTo: 0.8, stop: '0.9' });
    expect(s.v('V24S', 0.38)).toBeLessThan(3);           // held: not yet
    expect(s.onAfter(0.1)).toBeGreaterThan(0.4);         // on after the release at 0.4 s
    expect(s.onAfter(0.1)).toBeLessThan(0.5);
    expect(s.v('KPA', 0.55)).toBeGreaterThan(22);        // the pump contactor's coil on
    expect(Math.abs(s.iv[s.x.findIndex((t) => t >= 0.79)])).toBeGreaterThan(0.8);
    expect(s.v('RBS1', 0.79)).toBeGreaterThan(3.5);      // read back on
    expect(s.v('RBS1', 0.59)).toBeLessThan(0.5);         // and off before
    expect(Math.abs(s.iv[s.x.findIndex((t) => t >= 0.805)])).toBeLessThan(0.05);
    expect(s.over).toEqual([]);
  }, 600_000);
  it('E-stop while running: the rail falls within 50 ms and stays off when the E-stop is released; a RESET then brings it back', () => {
    const s = run({ reset: 0.1, pump: 0.4, valve: 0.5, estop: 0.6, estopTo: 0.8, reset2: 1.0, stop: '1.4' });
    expect(s.offAfter(0.6)).toBeLessThan(0.05);
    expect(s.v('V24S', 0.95)).toBeLessThan(3);
    expect(s.peak(s.iv, 0.7, 0.95)).toBeLessThan(0.01);
    expect(s.v('V24S', 1.4)).toBeGreaterThan(22);
  }, 600_000);
  it('RESET held through an E-stop: the machine does not restart when the E-stop is released', () => {
    const s = run({ reset: 0.1, resetFor: 1.5, estop: 0.8, estopTo: 1.0, stop: '1.4' });
    expect(s.v('V24S', 0.7)).toBeLessThan(3);            // held from the first press: no start yet
    const t = run({ reset: 0.1, reset2: 0.6, estop: 0.8, estopTo: 1.1, stop: '1.5' });
    expect(t.v('V24S', 0.75)).toBeGreaterThan(22);
    expect(t.v('V24S', 1.5)).toBeLessThan(3);
  }, 600_000);
  it('RESET jammed closed at power-up, with a supply that rises over 100 ms: no start', () => {
    const s = run({ rampMs: 100, reset: 0, resetFor: 2, stop: '0.8' });
    expect(s.v('V24S', 0.8)).toBeLessThan(3);
  }, 600_000);
  it('the guard opened while running: the rail falls within 50 ms; closed again, nothing restarts until RESET', () => {
    const s = run({ reset: 0.1, guard: 0.6, guardTo: 0.8, reset2: 1.0, stop: '1.4' });
    expect(s.offAfter(0.6)).toBeLessThan(0.05);
    expect(s.v('V24S', 0.95)).toBeLessThan(3);
    expect(s.v('V24S', 1.4)).toBeGreaterThan(22);
  }, 600_000);
  it('only one E-stop channel opens (a contact block failed in the other): the rail falls; a RESET after the release does not start (both channels must have opened)', () => {
    const s = run({ estopCh1Only: true, reset: 0.1, estop: 0.6, estopTo: 0.8, reset2: 1.0, stop: '1.4' });
    expect(s.offAfter(0.6)).toBeLessThan(0.05);
    expect(s.v('V24S', 1.4)).toBeLessThan(3);
  }, 600_000);
  it('one E-stop channel bridged (a cross short): the other channel still stops the machine, and the next RESET is refused', () => {
    const s = run({ ch1Bridged: true, reset: 0.1, estop: 0.6, estopTo: 0.8, reset2: 1.0, stop: '1.4' });
    expect(s.v('V24S', 0.5)).toBeGreaterThan(22);
    expect(s.offAfter(0.6)).toBeLessThan(0.05);
    expect(s.v('V24S', 1.4)).toBeLessThan(3);
  }, 600_000);
  it('K1 welded from power-up: the reset is refused (K1\'s mirror contacts are open)', () => {
    const s = run({ k1Welded: true, reset: 0.1, stop: '0.6' });
    expect(s.v('V24S', 0.6)).toBeLessThan(3);
  }, 600_000);
  it('K1 welds while running: the E-stop still stops the machine through K2, and the next reset is refused', () => {
    const s = run({ reset: 0.1, k1WeldAt: 0.4, estop: 0.6, estopTo: 0.8, reset2: 1.0, stop: '1.4' });
    expect(s.v('V24S', 0.5)).toBeGreaterThan(22);
    expect(s.offAfter(0.6)).toBeLessThan(0.05);
    expect(s.v('V24S', 1.4)).toBeLessThan(3);
  }, 600_000);
  it('valve 1\'s MOSFET shorted: with the outputs\' enable off the valve is not fed even with the rail on; the enable given for 3 ms (the firmware drops it at the read-back) feeds it only for those 3 ms; the E-stop still removes the rail', () => {
    const s = run({ qvShorted: true, reset: 0.1, enable: 0.6, enableTo: 0.603, estop: 0.7, stop: '0.8' });
    expect(s.v('V24S', 0.55)).toBeGreaterThan(22);
    expect(s.v('SV1', 0.55)).toBeLessThan(1);
    expect(s.v('RBEN', 0.55)).toBeLessThan(0.5);
    expect(s.v('RBS1', 0.6015)).toBeGreaterThan(3.5);
    expect(s.v('SV1', 0.61)).toBeLessThan(1);
    expect(s.v('V24S', 0.8)).toBeLessThan(3);
  }, 600_000);
  it('the outputs\' enable: off, the outputs\' supply is off and read back low; on, read back high', () => {
    const s = run({ reset: 0.1, enable: 0.6, stop: '0.7' });
    expect(s.v('V24O', 0.55)).toBeLessThan(1);
    expect(s.v('RBEN', 0.55)).toBeLessThan(0.5);
    expect(s.v('RBEN', 0.65)).toBeGreaterThan(3.5);
  }, 600_000);
  it('valve 1\'s wire shorted to the frame (0 V, PE) while on: the current is limited to below 3 A and read back low; the valve is not energised; no part over its ratings for the 10 ms until the firmware switches it off (it sees the read-back low at its next loop)', () => {
    const s = run({ reset: 0.1, valve: 0.5, valveTo: 0.61, valveShortAt: 0.6, stop: '0.75' });
    expect(s.peak(s.iq, 0.602, 0.61)).toBeLessThan(3);
    expect(s.v('RBS1', 0.605)).toBeLessThan(0.5);
    expect(s.over).toEqual([]);
  }, 600_000);
  it('all four valves on together (more than the firmware ever commands) with the pump contactor: the 24 V stays above 22 V, F1 holds, every valve releases within 5 ms; no part over its ratings', () => {
    const s = run({ reset: 0.1, pump: 0.4, valve: 0.5, valveTo: 0.8, allValves: true, stop: '0.9' });
    expect(s.v('V24F', 0.79)).toBeGreaterThan(22);
    expect(s.v('V24S', 0.79)).toBeGreaterThan(21);
    for (const net of ['SV1', 'SV2', 'SV3', 'SV4']) expect(s.v(net, 0.79)).toBeGreaterThan(20);
    expect(Math.abs(s.iv[s.x.findIndex((t) => t >= 0.805)])).toBeLessThan(0.05);
    expect(s.over).toEqual([]);
  }, 600_000);
  it('the READY / FAULT lamp follows its output (with the safety rail off); STOP closed reads low, pressed reads high', () => {
    const s = run({ lamp: 0.1, stop: '0.3' });
    expect(s.v('V24F', 0.2) - s.v('LMP', 0.2)).toBeGreaterThan(22);
    expect(s.v('V24F', 0.05) - s.v('LMP', 0.05)).toBeLessThan(1);
    expect(s.v('IN8', 0.2)).toBeLessThan(0.8);
    expect(s.over).toEqual([]);
    const p = run({ stopPressed: true, stop: '0.1' });
    expect(p.v('IN8', 0.1)).toBeGreaterThan(4);
  }, 600_000);
});
