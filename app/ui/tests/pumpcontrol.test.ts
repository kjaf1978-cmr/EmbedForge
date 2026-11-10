// P9 (D24): the pump controller (src/eda/pumpControl.ts): its tank cycle and its DFMEA faults,
// with a compressed tank (0.1 F: a cycle of about 2 s) and a fast clock (the timers scale with it).
import { describe, expect, it } from 'vitest';
import { pumpControl, type PumpOptions } from '../src/eda/pumpControl';
import { simulate, type SimResult } from '../src/sim/run';
import { erc } from '../src/eda/erc';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';

const LONG = !!process.env.LONG;
function run(o: PumpOptions) {
  const { sheet } = pumpControl({ clkC: '1n', tankF: '0.1', ...o });
  const r = simulate(sheet) as SimResult;
  expect('error' in r ? (r as unknown as { error: string }).error : '').toBe('');
  const x = r.x;
  const on = (t: number) => r.v['RUNQ'][x.findIndex((u) => u >= t)] > 6;
  const motor = (t0: number, t1: number) => { let m = 0; for (let k = 0; k < x.length; k++) if (x[k] >= t0 && x[k] <= t1) m = Math.max(m, Math.abs(r.v['LM'][k])); return m; };
  const lvl = r.v['LVL'];
  const over = () => smoke(sheet, connectivity(sheet), r).rows.filter((q) => q.status === 'over').map((q) => `${q.ref} ${q.what}`);
  return { r, x, on, motor, lvl, over, at: (n: string, t: number) => r.v[n][x.findIndex((u) => u >= t)] };
}

describe('pump control: the drawing', () => {
  it('ERC clean', () => {
    expect(erc(pumpControl().sheet).filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([]);
  });
});

describe.runIf(LONG)('pump control: cycle and DFMEA faults', () => {
  it('normal cycle: off while the tank is above LOW, the pump starts below LOW (3 V) and stops at HIGH (8 V); never near OVERFLOW; no part over its ratings', () => {
    const s = run({ stop: '4' });
    const starts: number[] = [], stops: number[] = [];
    for (let k = 1; k < s.x.length; k++) { const a = s.r.v['RUNQ'][k - 1] > 6, b = s.r.v['RUNQ'][k] > 6; if (!a && b) starts.push(s.lvl[k]); if (a && !b) stops.push(s.lvl[k]); }
    expect(starts.length).toBeGreaterThanOrEqual(2);
    for (const v of starts) { expect(v).toBeLessThan(3.2); expect(v).toBeGreaterThan(2.2); }
    for (const v of stops) { expect(v).toBeGreaterThan(7.6); expect(v).toBeLessThan(8.6); }
    expect(Math.max(...s.lvl)).toBeLessThan(9.3);
    expect(s.motor(0, 4)).toBeGreaterThan(300); // the contactor fed the pump
    expect(s.over()).toEqual([]);
  }, 3_600_000);
  it('the HIGH electrode\'s cable broken: OVERFLOW stops the pump and latches FAULT; it stays off when the tank falls below LOW again', () => {
    const s = run({ stop: '4', highBroken: true });
    expect(Math.max(...s.lvl)).toBeLessThan(10);
    const tf = s.x.find((t, k) => s.r.v['FLTQ'][k] > 6)!;
    expect(tf).toBeDefined();
    expect(s.at('LVL', tf)).toBeGreaterThan(9.3);
    expect(s.on(3.9)).toBe(false);
    expect(s.at('LVL', 3.9)).toBeLessThan(3); // below LOW, and still off
  }, 3_600_000);
  it('the source runs dry while pumping: the pump stops at once and starts again only after the lockout (512 clocks) once the water is back', () => {
    // dry from 1.45 s (pumping) for 0.3 s; the lockout ends 0.51 s after 1.75 s
    const s = run({ stop: '3.2', dryAt: 1.45, dryFor: 0.3 });
    expect(s.on(1.40)).toBe(true);
    expect(s.on(1.55)).toBe(false);
    expect(s.on(2.1)).toBe(false); // the water is back, the lockout still runs
    expect(s.on(2.5)).toBe(true);
  }, 3_600_000);
  it('a burst pipe (no water reaches the tank): after the maximum run (8192 clocks) FAULT latches and the pump stops', () => {
    const s = run({ stop: '1.6', clkC: '0.1n', noFlow: true, level0: 2 });
    expect(s.on(0.3)).toBe(true);
    expect(s.on(1.5)).toBe(false);
    expect(s.at('FLTQ', 1.5)).toBeGreaterThan(6);
  }, 3_600_000);
  it('after power-up the pump waits for the start delay (8 clocks) even with the tank empty', () => {
    const s = run({ stop: '0.3', clkC: '10n', level0: 1 });
    expect(s.on(0.05)).toBe(false); // 8 clocks of 105 Hz = 76 ms
    expect(s.on(0.2)).toBe(true);
  }, 3_600_000);
});
