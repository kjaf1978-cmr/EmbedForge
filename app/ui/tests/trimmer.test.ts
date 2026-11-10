// P9 (D24): the cordless trimmer's drive (src/eda/trimmer.ts). A run of 0.1 s with the 20 kHz
// PWM takes about three minutes, so the runs need LONG=1; the soft start and the power-up
// blanking run 20 and 10 times faster (their capacitors), the jam timer where a test says so.
import { describe, expect, it } from 'vitest';
import { trimmer, type TrimmerOptions } from '../src/eda/trimmer';
import { simulate, type SimResult } from '../src/sim/run';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { erc } from '../src/eda/erc';

const LONG = !!process.env.LONG;
const T: TrimmerOptions = { softC: '220n', porC: '100n', stop: '0.1' };

function run(o: TrimmerOptions) {
  const { sheet, nb } = trimmer({ ...T, ...o });
  const r = simulate(sheet) as SimResult;
  expect('error' in r ? (r as unknown as { error: string }).error : '').toBe('');
  const x = r.x, n = x.length;
  const at = (t: number) => Math.min(n - 1, x.findIndex((u) => u >= t));
  const im = r.i[`${nb.refOf(sheet, 'M1')}.1`], id = r.i[`${nb.refOf(sheet, 'QM')}.2`];
  const mean = (y: number[], t0: number, t1: number) => { let s = 0, c = 0; for (let k = 0; k < n; k++) if (x[k] >= t0 && x[k] < t1) { s += y[k]; c++; } return s / Math.max(c, 1); };
  const peak = (y: number[], t0 = 0, t1 = Infinity) => y.reduce((m, v, k) => (x[k] >= t0 && x[k] <= t1 ? Math.max(m, Math.abs(v)) : m), 0);
  const product = new Set(sheet.parts.filter((p) => p.props.scope !== 'test').map((p) => p.ref));
  const over = smoke(sheet, connectivity(sheet), r).rows.filter((q) => q.status === 'over' && product.has(q.ref)).map((q) => `${q.ref} ${q.what} ${q.value} / ${q.rating}`);
  return { r, x, at, im, id, mean, peak, over };
}

describe('trimmer drive: the drawing', () => {
  it('ERC clean', () => {
    expect(erc(trimmer({ jamAt: 0.05 }).sheet).filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([]);
  });
});

describe.runIf(LONG)('trimmer drive: start, limits and protections', () => {
  it('full trigger: the soft start raises the duty, the cycle-by-cycle limit holds the motor below 45 A while the head accelerates, no protection trips; no part over its ratings', () => {
    const s = run({ trigger: 1 });
    expect(s.peak(s.im)).toBeLessThan(45);
    expect(s.r.v['FLTN'][s.at(0.1)]).toBeGreaterThan(6);
    expect(s.r.v['SPD'][s.at(0.1)]).toBeGreaterThan(4); // above 4000 rpm and rising
    expect(s.over).toEqual([]);
  }, 1_800_000);
  it('half trigger: the head settles at a lower speed with a part duty, the current well under the limit', () => {
    const s = run({ trigger: 0.4 });
    const spd = s.r.v['SPD'][s.at(0.1)];
    expect(spd).toBeGreaterThan(1);
    expect(spd).toBeLessThan(6);
    expect(Math.abs(s.mean(s.im, 0.09, 0.1))).toBeLessThan(25);
    expect(s.r.v['FLTN'][s.at(0.1)]).toBeGreaterThan(6);
    expect(s.over).toEqual([]);
  }, 1_800_000);
  it('the head jammed from the start (line wrapped): the limit holds the current below 45 A, the jam timer (here 47 ms) latches the drive off; no part over its ratings', () => {
    const s = run({ trigger: 1, jamAt: 0, jamC: '470n' });
    expect(s.peak(s.im)).toBeLessThan(45);
    const kt = s.x.findIndex((t, k) => t > 0.01 && s.r.v['FLTN'][k] < 1);
    expect(kt).toBeGreaterThan(0);
    expect(s.x[kt]).toBeLessThan(0.09);
    expect(Math.abs(s.mean(s.im, 0.095, 0.1))).toBeLessThan(0.5);
    expect(s.over).toEqual([]);
  }, 1_800_000);
  it('the battery at 26 V (below the 27.5 V cut-off): the drive never starts', () => {
    const s = run({ trigger: 1, vbat: 26, stop: '0.05' });
    expect(s.peak(s.im, 0.002)).toBeLessThan(0.5);
    expect(s.r.v['FLTN'][s.at(0.05)]).toBeLessThan(1);
  }, 1_800_000);
  it('the heatsink at 95 °C (stop above 85 °C): the drive never starts; the motor at 95 °C likewise', () => {
    for (const o of [{ tHeatsink: 95 }, { tMotor: 95 }]) {
      const s = run({ trigger: 1, stop: '0.05', ...o });
      expect(s.peak(s.im, 0.002)).toBeLessThan(0.5);
      expect(s.r.v['FLTN'][s.at(0.05)]).toBeLessThan(1);
    }
  }, 1_800_000);
  it('the trigger released while running: the brake contact stops the head (below a third of its speed within 20 ms); no part over its ratings', () => {
    const s = run({ trigger: 1, release: 0.07 });
    const w0 = s.r.v['SPD'][s.at(0.07)];
    expect(w0).toBeGreaterThan(3);
    expect(s.r.v['SPD'][s.at(0.09)]).toBeLessThan(w0 / 3);
    expect(s.over).toEqual([]);
  }, 1_800_000);
});
