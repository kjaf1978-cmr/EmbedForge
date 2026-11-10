// P9 (D24): the block moulding machine's safety circuit and 24 V outputs (src/eda/blockMachine.ts).
import { describe, expect, it } from 'vitest';
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
  const v = (net: string, t: number) => r.v[net][Math.min(n - 1, x.findIndex((u) => u >= t))];
  const iv = r.i[`${nb.refOf(sheet, 'RSV')}.1`];
  const product = new Set(sheet.parts.filter((p) => p.props.scope !== 'test').map((p) => p.ref));
  const over = smoke(sheet, connectivity(sheet), r).rows.filter((q) => q.status === 'over' && product.has(q.ref)).map((q) => `${q.ref} ${q.what} ${q.value} / ${q.rating}`);
  // the first time after t0 that V24S fell below 5 V
  const offAfter = (t0: number) => { const k = x.findIndex((u, j) => u > t0 && r.v['V24S'][j] < 5); return k < 0 ? Infinity : x[k] - t0; };
  return { r, x, v, iv, over, offAfter };
}

describe('block moulding machine: safety circuit and outputs', () => {
  it('ERC clean', () => {
    expect(erc(blockMachine({ k1Welded: true, ch1Bridged: true }).sheet).filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([]);
  });
  it('power-up: the safety rail stays off (no automatic start) even with the microcontroller commanding the pump and the valve', () => {
    const s = run({ pump: 0.05, valve: 0.05, stop: '0.5' });
    expect(s.v('V24S', 0.5)).toBeLessThan(1);
    expect(Math.max(...s.iv.map(Math.abs))).toBeLessThan(0.01);
  }, 600_000);
  it('reset: K1 and K2 pull in and hold, the rail is on; the pump contactor and the valve follow the microcontroller; the valve releases within 5 ms (38 V clamp); no part over its ratings', () => {
    const s = run({ reset: 0.1, pump: 0.4, valve: 0.5, valveTo: 0.7, stop: '0.8' });
    expect(s.v('V24S', 0.39)).toBeGreaterThan(22);
    expect(s.v('KPD', 0.45)).toBeLessThan(1); // the pump's contactor coil on
    expect(Math.abs(s.iv[s.x.findIndex((t) => t >= 0.69)])).toBeGreaterThan(0.8);
    expect(Math.abs(s.iv[s.x.findIndex((t) => t >= 0.705)])).toBeLessThan(0.05);
    expect(Math.max(...s.r.v['SVD'])).toBeLessThan(45);
    expect(s.over).toEqual([]);
  }, 600_000);
  it('E-stop while running: the rail falls within 50 ms and stays off when the E-stop is released; the valve and the pump are off', () => {
    const s = run({ reset: 0.1, pump: 0.4, valve: 0.5, estop: 0.6, estopTo: 0.8, stop: '1.2' });
    expect(s.offAfter(0.6)).toBeLessThan(0.05);
    expect(s.v('V24S', 1.2)).toBeLessThan(1);
    expect(Math.abs(s.iv[s.iv.length - 1])).toBeLessThan(0.01);
  }, 600_000);
  it('RESET held down (jammed) through an E-stop: after the E-stop is released the machine does not restart', () => {
    const s = run({ reset: 0.1, resetFor: 1.5, estop: 0.6, estopTo: 0.8, stop: '1.2' });
    expect(s.v('V24S', 0.5)).toBeGreaterThan(22);
    expect(s.v('V24S', 1.2)).toBeLessThan(1);
  }, 600_000);
  it('one E-stop channel bridged (a cross short): the other channel still stops the machine', () => {
    const s = run({ ch1Bridged: true, reset: 0.1, estop: 0.6, stop: '1' });
    expect(s.v('V24S', 0.5)).toBeGreaterThan(22);
    expect(s.offAfter(0.6)).toBeLessThan(0.05);
  }, 600_000);
  it('K1 welded from power-up: the reset is refused (K1\'s mirror contact is open)', () => {
    const s = run({ k1Welded: true, reset: 0.1, stop: '0.5' });
    expect(s.v('V24S', 0.5)).toBeLessThan(1);
  }, 600_000);
  it('K1 welds while running: the E-stop still stops the machine through K2, and the next reset is refused', () => {
    const s = run({ reset: 0.1, k1WeldAt: 0.3, estop: 0.6, estopTo: 0.8, reset2: 1.0, stop: '1.4' });
    expect(s.v('V24S', 0.5)).toBeGreaterThan(22);
    expect(s.offAfter(0.6)).toBeLessThan(0.05);
    expect(s.v('V24S', 1.4)).toBeLessThan(1);
  }, 600_000);
});
