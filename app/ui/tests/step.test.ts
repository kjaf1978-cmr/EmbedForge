// Parameter sweep (.step): values, operating point over the values, overlaid runs.
import { describe, expect, it } from 'vitest';
import { deck, type Spec } from './deck';
import { simulate, stepValues, type SimResult } from '../src/sim/run';
import { fromFiles, toFiles } from '../src/eda/project';
import type { StepSweep } from '../src/eda/schematic';

const step = (o: Partial<StepSweep>): StepSweep => ({ on: true, ref: '', param: 'value', mode: 'list', list: '', start: '', stop: '', step: '', ...o });
const near = (x: number, want: number, tol: number) => expect(Math.abs(x - want), `${x} vs ${want}`).toBeLessThanOrEqual(tol);

describe('parameter sweep values', () => {
  it('short engineering values read back exactly', async () => {
    const { parseValue, shortValue } = await import('../src/eda/units');
    for (const v of [50e-9, 4.7e3, 2.2e6, 1.25, 330, 1e-12, 0.015]) expect(parseValue(shortValue(v))).toBeCloseTo(v, 15);
    expect(shortValue(2.2e6)).toBe('2.2meg');
    expect(shortValue(4.7e-6)).toBe('4.7u');
  });
  it('list, linear and per decade', () => {
    expect(stepValues(step({ list: '1k 2k2, 4k7' }))).toEqual({ values: ['1k', '2k2', '4k7'] });
    expect(stepValues(step({ mode: 'lin', start: '1', stop: '2', step: '0.25' }))).toEqual({ values: ['1', '1.25', '1.5', '1.75', '2'] });
    expect(stepValues(step({ mode: 'dec', start: '1k', stop: '100k', step: '1' }))).toEqual({ values: ['1k', '10k', '100k'] });
    expect(stepValues(step({ mode: 'lin', start: '0', stop: '100', step: '1' }))).toHaveProperty('error');
    expect(stepValues(step({ mode: 'lin', start: '0', stop: '1', step: '0' }))).toHaveProperty('error');
    expect(stepValues(step({ list: ' ' }))).toHaveProperty('error');
  });
});

describe('parameter sweep runs', () => {
  const divider: Spec[] = [['vdc', { value: '10' }, { '1': 'A', '2': 'GND' }], ['resistor', { value: '1k' }, { '1': 'A', '2': 'OUT' }], ['resistor', { value: '1k' }, { '1': 'OUT', '2': 'GND' }]];
  it('operating point: one point per value, x = the stepped value', () => {
    const { sheet, refs } = deck(divider);
    sheet.step = step({ ref: refs[2], list: '1k 3k 9k' });
    const r = simulate(sheet) as SimResult;
    expect(r.analysis).toBe('dc');
    expect(r.x).toEqual([1e3, 3e3, 9e3]);
    r.v['OUT'].forEach((v, k) => near(v, (10 * r.x[k]) / (1e3 + r.x[k]), 1e-6));
  });
  it('AC: a stepped capacitor moves the corner frequency; every run on the same axis', () => {
    const { sheet, refs } = deck([['vsin', { value: '1', ac: '1' }, { '1': 'IN', '2': 'GND' }], ['resistor', { value: '1k' }, { '1': 'IN', '2': 'OUT' }], ['capacitor', { value: '100n' }, { '1': 'OUT', '2': 'GND' }]],
      { type: 'ac', fstart: '10', fstop: '1meg', perDecade: '20' });
    sheet.step = step({ ref: refs[2], list: '10n 100n 1u' });
    const r = simulate(sheet) as SimResult;
    expect(r.steps!.length).toBe(3);
    expect(r.steps!.map((s) => s.label)).toEqual([`${refs[2]} = 10n`, `${refs[2]} = 100n`, `${refs[2]} = 1u`]);
    [10e-9, 100e-9, 1e-6].forEach((c, k) => {
      const fc = 1 / (2 * Math.PI * 1e3 * c);
      const j = r.x.findIndex((f) => f >= fc);
      const mag = Math.hypot(r.steps![k].v['OUT'][j], r.steps![k].vi!['OUT'][j]);
      near(mag, 1 / Math.sqrt(1 + (r.x[j] / fc) ** 2), 0.005);
    });
  });
  it('transient: stepping a diode model, resampled to a common time axis', () => {
    const { sheet, refs } = deck([['vsin', { value: '5', freq: '50' }, { '1': 'IN', '2': 'GND' }], ['diode', { value: '1N4148' }, { '2': 'IN', '1': 'OUT' }], ['resistor', { value: '1k' }, { '1': 'OUT', '2': 'GND' }]],
      { type: 'tran', stop: '40m', step: '' });
    sheet.step = step({ ref: refs[1], list: '1N4148 1N5819' });
    const r = simulate(sheet) as SimResult;
    expect(r.x.length).toBe(2001);
    const peak = (k: number) => Math.max(...r.steps![k].v['OUT']);
    // the Schottky drops less
    expect(peak(1) - peak(0)).toBeGreaterThan(0.2);
  });
  it('an invalid value names the run that failed', () => {
    const { sheet, refs } = deck(divider);
    sheet.step = step({ ref: refs[2], list: '1k abc' });
    expect((simulate(sheet) as { error: string }).error).toMatch(/= abc/);
  });
  it('is saved with the project', () => {
    const { sheet, refs } = deck(divider);
    sheet.step = step({ ref: refs[2], list: '1k 2k' });
    const back = fromFiles(JSON.parse(JSON.stringify(toFiles('Step', sheet)))).sheet;
    expect(back.step).toEqual(sheet.step);
  });
  it('two properties: every combination, first one fastest; an operating point gives one curve per value of the second', () => {
    const { sheet, refs } = deck(divider);
    sheet.step = step({ ref: refs[2], list: '1k 3k', more: [{ ref: refs[1], param: 'value', mode: 'list', list: '1k 2k 4k', start: '', stop: '', step: '' }] });
    const r = simulate(sheet) as SimResult;
    expect(r.x).toEqual([1e3, 3e3]);
    expect(r.steps!.map((s) => s.label)).toEqual([`${refs[1]} = 1k`, `${refs[1]} = 2k`, `${refs[1]} = 4k`]);
    [1e3, 2e3, 4e3].forEach((r1, k) => r.x.forEach((r2, j) => near(r.steps![k].v['OUT'][j], (10 * r2) / (r1 + r2), 1e-6)));
  });
  it('three properties in a transient: labels name every value; more than 50 runs is refused', () => {
    const { sheet, refs } = deck([['vpulse', { value: '5', freq: '100' }, { '1': 'IN', '2': 'GND' }], ['resistor', { value: '1k' }, { '1': 'IN', '2': 'OUT' }], ['capacitor', { value: '1u' }, { '1': 'OUT', '2': 'GND' }]],
      { type: 'tran', stop: '20m', step: '' });
    const ax = (ref: string, param: string, list: string) => ({ ref, param, mode: 'list' as const, list, start: '', stop: '', step: '' });
    sheet.step = step({ ref: refs[1], list: '1k 2k', more: [ax(refs[2], 'value', '1u 2u'), ax(refs[0], 'value', '3 5')] });
    const r = simulate(sheet) as SimResult;
    expect(r.steps!.length).toBe(8);
    expect(r.steps![0].label).toBe(`${refs[1]} = 1k, ${refs[2]} = 1u, ${refs[0]} = 3`);
    expect(r.steps![7].label).toBe(`${refs[1]} = 2k, ${refs[2]} = 2u, ${refs[0]} = 5`);
    sheet.step = step({ ref: refs[1], mode: 'lin', start: '1k', stop: '10k', step: '1k', more: [ax(refs[2], 'value', '1u 2u 3u 4u 5u 6u')] });
    expect((simulate(sheet) as { error: string }).error).toMatch(/10 × 6 = 60 runs; at most 50/);
  });
});

