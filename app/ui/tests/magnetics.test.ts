// Saturating magnetics (decision D32): an inductor with a saturation current and a transformer
// whose core saturates, against their flux curve and against the linear coupled-inductor model.
import { describe, expect, it } from 'vitest';
import { Engine, coreFlux } from '../src/sim/engine';
import type { Circuit, Element } from '../src/sim/circuit';

const sine = (va: number, freq = 50, phase = 0): Element => ({ kind: 'V', name: 'V1', p: 's', n: '0', dc: 0, wave: { type: 'sin', vo: 0, va, freq, phase } });

describe('core flux curve', () => {
  it('the incremental inductance has fallen by 20 % at the saturation current and tends to l/50 far above it', () => {
    expect(coreFlux(1e-3, 2, 2)[1] / 1e-3).toBeCloseTo(0.8, 2);
    expect(coreFlux(1e-3, 0, 2)[1]).toBeCloseTo(1e-3, 9);
    expect(coreFlux(1e-3, 40, 2)[1] / 1e-3).toBeCloseTo(0.02, 3);
    // the flux levels off at about 1.3 × l·isat
    expect(coreFlux(1e-3, 6, 2)[0] / (1e-3 * 2)).toBeGreaterThan(1.2);
    expect(coreFlux(1e-3, 6, 2)[0] / (1e-3 * 2)).toBeLessThan(1.45);
    // without a saturation current: linear
    expect(coreFlux(1e-3, 40)).toEqual([40e-3, 1e-3]);
  });
});

describe('saturating inductor', () => {
  it('on a constant voltage its flux rises linearly and its current follows the inverse of the flux curve', () => {
    // 10 V across 1 mH (isat 5 A) through 1 mΩ: after t the flux is 10·t
    const c: Circuit = { elements: [{ kind: 'V', name: 'V1', p: 's', n: '0', dc: 10 }, { kind: 'R', name: 'R1', a: 's', b: 'm', r: 1e-3 }, { kind: 'L', name: 'L1', a: 'm', b: '0', l: 1e-3, isat: 5 }] };
    const w = new Engine(c).tran(1e-6, 2e-3, 1e-6, 200000, true);
    for (const t of [0.2e-3, 0.5e-3, 1e-3, 1.5e-3]) {
      const k = w.x.findIndex((x) => x >= t), i = w.i.L1[0][k];
      // flux at that current against 10 V × t (the 1 mΩ drop is negligible)
      expect(Math.abs(coreFlux(1e-3, i, 5)[0] - 10 * w.x[k]) / (10 * w.x[k])).toBeLessThan(0.02);
    }
    // beyond saturation the current runs away: 1.5 ms is 15 mWb, about 3 × the linear 5 A
    const kEnd = w.x.length - 1;
    expect(w.i.L1[0][kEnd]).toBeGreaterThan(30);
  });
  it('below its saturation current it behaves as the linear inductor', () => {
    const mk = (isat?: number): Circuit => ({ elements: [sine(10, 1000), { kind: 'R', name: 'R1', a: 's', b: 'm', r: 10 }, { kind: 'L', name: 'L1', a: 'm', b: '0', l: 1e-3, ...(isat ? { isat } : {}) }] });
    const a = new Engine(mk()).tran(1e-6, 3e-3, 1e-6), b = new Engine(mk(100)).tran(1e-6, 3e-3, 1e-6);
    const pa = Math.max(...a.i.L1[0].map(Math.abs)), pb = Math.max(...b.i.L1[0].map(Math.abs));
    expect(Math.abs(pa - pb) / pa).toBeLessThan(0.01);
  });
});

describe('saturating transformer', () => {
  const tx = (isat?: number, n = 0.1): Element => ({ kind: 'TX', name: 'T1', a: 'p', b: '0', c: 'o', d: '0', l1: 2, n, k: 0.98, ...(isat ? { isat } : {}) });
  it('without a saturation current it equals two coupled inductors (l1 and n²·l1, coupling k)', () => {
    const load: Element = { kind: 'R', name: 'RL', a: 'o', b: '0', r: 10 };
    const a = new Engine({ elements: [sine(325), { kind: 'R', name: 'RP', a: 's', b: 'p', r: 0.5 }, tx(), load] }).tran(20e-6, 60e-3, 20e-6);
    const b = new Engine({ elements: [sine(325), { kind: 'R', name: 'RP', a: 's', b: 'p', r: 0.5 },
      { kind: 'L', name: 'LP', a: 'p', b: '0', l: 2 }, { kind: 'L', name: 'LS', a: 'o', b: '0', l: 2 * 0.01 }, { kind: 'K', name: 'K1', l1: 'LP', l2: 'LS', k: 0.98 }, load] }).tran(20e-6, 60e-3, 20e-6);
    const pa = Math.max(...a.v.o.slice(-1500).map(Math.abs)), pb = Math.max(...b.v.o.slice(-1500).map(Math.abs));
    expect(Math.abs(pa - pb) / pb).toBeLessThan(0.005);
    expect(pa).toBeGreaterThan(28); // 325 × 0.1 less the leakage and winding drops
  });
  it('20 % overvoltage on a core that saturates just above its rated flux: the magnetising current peaks well above the rated one', () => {
    // no load: the primary current is the magnetising current. Rated 325 V peak gives a peak
    // flux of 325/(2π·50) = 1.03 Wb·turn, 85 % of where the core levels off (1.3 × 1.96 H ×
    // 0.48 A = 1.22 Wb); 20 % more voltage drives it past. Switched on at the voltage's peak (90°), so the flux starts
    // at its own zero crossing and has no offset (switched on at a voltage zero, the flux
    // swings to twice its peak: the inrush, which this model shows too)
    const peak = (va: number) => {
      const w = new Engine({ elements: [sine(va, 50, 90), { kind: 'R', name: 'RP', a: 's', b: 'p', r: 0.5 }, tx(0.48), { kind: 'R', name: 'RL', a: 'o', b: '0', r: 1e6 }] }).tran(20e-6, 100e-3, 20e-6, 200000, true);
      return Math.max(...w.i.T1[0].slice(-1000).map(Math.abs));
    };
    const rated = peak(325), over = peak(390);
    expect(rated).toBeLessThan(1);
    // 1.7 × with this knee (iron cores: about 1.5 … 4 × at 120 %)
    expect(over / rated).toBeGreaterThan(1.5);
  });
  it('switched on at a voltage zero, the flux offset drives the core into saturation: the inrush current', () => {
    const w = new Engine({ elements: [sine(325, 50, 0), { kind: 'R', name: 'RP', a: 's', b: 'p', r: 0.5 }, tx(0.6), { kind: 'R', name: 'RL', a: 'o', b: '0', r: 1e6 }] }).tran(20e-6, 40e-3, 20e-6);
    expect(Math.max(...w.i.T1[0].map(Math.abs))).toBeGreaterThan(5);
  });
});

describe('saturating parts in a schematic', () => {
  it('a transformer part with a saturation current: its inrush at a voltage zero is many times its magnetising current; without one, linear', async () => {
    const { deck } = await import('./deck');
    const { simulate } = await import('../src/sim/run');
    const run = (isat?: string) => {
      const { sheet } = deck([['vsin', { value: '325', freq: '50' }, { '1': 'A', '2': 'GND' }],
        ['transformer', { value: '0.1', lp: '2', k: '0.98', rp: '0.5', rs: '0.01', ...(isat ? { isat } : {}) }, { '1': 'A', '2': 'GND', '3': 'B', '4': 'GND' }],
        ['resistor', { value: '1Meg' }, { '1': 'B', '2': 'GND' }]]);
      sheet.sim = { type: 'tran', stop: '40m', step: '20u', start: 'zero' };
      const r = simulate(sheet);
      if ('error' in r) throw new Error(r.error);
      return Math.max(...r.i['T1.1'].map(Math.abs));
    };
    const lin = run(), sat = run('0.48');
    expect(lin).toBeLessThan(1.2);
    expect(sat / lin).toBeGreaterThan(5);
  });
});
