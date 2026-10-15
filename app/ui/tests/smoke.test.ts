import { describe, expect, it } from 'vitest';
import { deck, type Spec } from './deck';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { simulate, type SimResult } from '../src/sim/run';
import { EXAMPLES } from '../src/eda/examples';
import type { SimSettings } from '../src/eda/schematic';

const check = (parts: Spec[], sim?: SimSettings, derate = 80) => {
  const { sheet, refs } = deck(parts, sim);
  const r = simulate(sheet) as SimResult;
  expect('error' in r).toBe(false);
  return { ...smoke(sheet, connectivity(sheet), r, derate), refs };
};
const row = (rows: ReturnType<typeof smoke>['rows'], ref: string, q: string) => rows.find((x) => x.ref === ref && x.quantity === q)!;

describe('smoke analysis (stress check)', () => {
  it('a 100 Ω resistor across 10 V dissipates 1 W: 400 % of 0.25 W', () => {
    const { rows, refs } = check([['vdc', { value: '10' }, { '1': 'A', '2': 'GND' }], ['resistor', { value: '100' }, { '1': 'A', '2': 'GND' }]]);
    const p = row(rows, refs[1], 'P');
    expect(p.value).toBeCloseTo(1, 6); expect(p.pct).toBeCloseTo(400, 3); expect(p.status).toBe('over');
    expect(rows[0]).toBe(p); // worst first
  });
  it('a 1 W rating passes; 85 % of it is a warning at the default derating, not at 90 %', () => {
    const parts: Spec[] = [['vdc', { value: '10' }, { '1': 'A', '2': 'GND' }], ['resistor', { value: '100', pmax: '1.176' }, { '1': 'A', '2': 'GND' }]];
    expect(check(parts).rows[0].status).toBe('derated');
    expect(check(parts, undefined, 90).rows[0].status).toBe('ok');
  });
  it('diode forward current, LED current, capacitor voltage and a reversed electrolytic', () => {
    const { rows, refs } = check([['vdc', { value: '12' }, { '1': 'A', '2': 'GND' }], ['resistor', { value: '20', pmax: '10' }, { '1': 'A', '2': 'K' }], ['diode', { value: '1N4148' }, { '2': 'K', '1': 'GND' }],
      ['resistor', { value: '100', pmax: '10' }, { '1': 'A', '2': 'L' }], ['led', {}, { '2': 'L', '1': 'GND' }],
      ['capacitor', { value: '1u', vmax: '10' }, { '1': 'A', '2': 'GND' }], ['capacitor_pol', { value: '10u' }, { '2': 'A', '1': 'GND' }]]);
    expect(row(rows, refs[2], 'If').status).toBe('over'); // about 0.55 A in a 200 mA diode
    expect(row(rows, refs[4], 'If').status).toBe('over'); // about 100 mA in a 30 mA LED
    expect(row(rows, refs[5], 'V').pct).toBeCloseTo(120, 3);
    expect(row(rows, refs[6], 'Vr').status).toBe('over'); // 12 V reversed
  });
  it('transient: power is the average over the run (50 % duty → half), voltage the peak', () => {
    const { rows, refs } = check([['vpulse', { value: '10', freq: '1k', duty: '50', edge: '1n' }, { '1': 'A', '2': 'GND' }], ['resistor', { value: '100' }, { '1': 'A', '2': 'GND' }]],
      { type: 'tran', stop: '10m', step: '1u' });
    near(row(rows, refs[1], 'P').value, 0.5, 0.01);
  });
  it('an AC analysis is not checked; every example is within its ratings', () => {
    const { sheet } = deck([['vsin', { value: '1', ac: '1' }, { '1': 'A', '2': 'GND' }], ['resistor', {}, { '1': 'A', '2': 'GND' }]], { type: 'ac', fstart: '10', fstop: '1k', perDecade: '5' });
    expect(smoke(sheet, connectivity(sheet), simulate(sheet) as SimResult).note).toMatch(/AC analysis/);
    for (const ex of EXAMPLES) {
      const b = ex.build();
      // the charger's 90 ms run takes minutes: its start-up here, its steady state in charger*.test.ts (hot case)
      const s = ex.id === 'mppt-charger' ? { ...b, sim: { ...b.sim, stop: '10m' } as typeof b.sim } : b;
      if (s.sim.type === 'ac') continue;
      const res = smoke(s, connectivity(s), simulate(s) as SimResult);
      expect(res.rows.filter((r) => r.status === 'over').map((r) => `${r.ref} ${r.what} ${Math.round(r.pct)} %`), ex.id).toEqual([]);
    }
  }, 300_000);
});

const near = (x: number, want: number, tol: number) => expect(Math.abs(x - want), `${x} vs ${want}`).toBeLessThanOrEqual(tol);
