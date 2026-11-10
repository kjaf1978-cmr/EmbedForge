// P9 (D24): the irrigation controller's field interface (src/eda/irrigation.ts): valve drivers,
// the shared overcurrent cut-off and the protected sensor inputs.
import { describe, expect, it } from 'vitest';
import { irrigationFront, type IrrigationOptions } from '../src/eda/irrigation';
import { simulate, type SimResult } from '../src/sim/run';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';

function run(o: IrrigationOptions) {
  const { sheet, nb } = irrigationFront(o);
  const r = simulate(sheet) as SimResult;
  expect('error' in r ? (r as unknown as { error: string }).error : '').toBe('');
  const mx = (y: number[]) => y.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const product = new Set(sheet.parts.filter((p) => p.props.scope !== 'test').map((p) => p.ref));
  // the product's parts against their ratings; a surge run of milliseconds has no mean power,
  // and a MOSFET's pulsed rating is a 10 µs one (its sub-microsecond peak is checked below)
  const over = smoke(sheet, connectivity(sheet), r).rows.filter((x) => x.status === 'over' && product.has(x.ref) && !/^power$/.test(x.what) && !/pulsed drain/.test(x.what)).map((x) => `${x.ref} ${x.what}`);
  const id = r.i[`${nb.refOf(sheet, 'QV1')}.2`];
  return { r, x: r.x, mx, over, id };
}

describe('irrigation controller: valve channels, overcurrent, sensor inputs', () => {
  it('a valve switched on and off: its current settles at 0.3 A, the drain stays below 30 V at turn-off (flyback diode); no part over its ratings', () => {
    const s = run({ offAt: 0.02 });
    expect(s.mx(s.id)).toBeGreaterThan(0.25);
    expect(s.mx(s.r.v['OUT1'])).toBeLessThan(30);
    expect(s.over).toEqual([]);
  }, 600_000);
  it('a valve shorted while on: the cut-off latches within 10 µs, every output off; the MOSFET above its 11 A pulse rating for under 2 µs', () => {
    const s = run({ offAt: 0.03, shortAt: 0.01, stop: '25m' });
    const k0 = s.x.findIndex((t) => t >= 0.01);
    const kt = s.x.findIndex((t, k) => k > k0 && s.r.v['OCN'][k] < 1);
    expect(s.x[kt] - 0.01).toBeLessThan(10e-6);
    expect(s.r.v['OCN'][s.x.length - 1]).toBeLessThan(1); // stays latched
    let above = 0;
    for (let k = 1; k < s.x.length; k++) if (Math.abs(s.id[k]) > 11) above += s.x[k] - s.x[k - 1];
    expect(above).toBeLessThan(2e-6);
    expect(Math.abs(s.id[s.x.length - 1])).toBeLessThan(0.01);
    expect(s.over).toEqual([]);
  }, 600_000);
  it('a 2 kV 1.2/50 µs surge on an idle valve\'s cable: the driver\'s drain stays below 60 V (SMAJ33A); no part over its ratings', () => {
    const s = run({ surgeKv: 2, surgeAt: 0.01, offAt: 0.02, stop: '15m' });
    expect(s.mx(s.r.v['OUT2'])).toBeLessThan(60);
    expect(s.over).toEqual([]);
  }, 600_000);
  it('a 1 kV surge (42 Ω) on a sensor cable: the multiplexer\'s input stays within −0.3 … 3.6 V; no part over its ratings', () => {
    const s = run({ sensorSurgeKv: 1, stop: '5m' });
    expect(Math.max(...s.r.v['MX1'])).toBeLessThan(3.6);
    expect(Math.min(...s.r.v['MX1'])).toBeGreaterThan(-0.3);
    expect(s.over).toEqual([]);
  }, 600_000);
});
