import { describe, expect, it } from 'vitest';
import { deck } from './deck';
import { monteCarloSheets, simulate, type SimResult } from '../src/sim/run';
import type { MonteCarlo } from '../src/eda/schematic';
import { fromFiles, toFiles } from '../src/eda/project';

const mc = (o: Partial<MonteCarlo> = {}): MonteCarlo => ({ on: true, runs: '50', seed: '7', dist: 'uniform', tolR: '5', tolC: '10', tolL: '10', ...o });
const divider = () => deck([['vdc', { value: '10' }, { '1': 'A', '2': 'GND' }], ['resistor', { value: '1k' }, { '1': 'A', '2': 'OUT' }], ['resistor', { value: '1k' }, { '1': 'OUT', '2': 'GND' }]]);

describe('tolerance analysis (Monte Carlo)', () => {
  it('values stay within the tolerance; run 1 is nominal; the same seed gives the same runs', () => {
    const { sheet } = divider();
    sheet.mc = mc();
    const a = monteCarloSheets(sheet), b = monteCarloSheets(sheet);
    if ('error' in a || 'error' in b) throw new Error('mc');
    expect(a.length).toBe(50);
    expect(a[0].label).toBe('nominal');
    expect(a.map((x) => x.sheet.parts.map((p) => p.props.value))).toEqual(b.map((x) => x.sheet.parts.map((p) => p.props.value)));
    const rs = a.slice(1).flatMap((x) => x.sheet.parts.filter((p) => p.sym === 'resistor').map((p) => Number(p.props.value)));
    expect(Math.min(...rs)).toBeGreaterThanOrEqual(950); expect(Math.max(...rs)).toBeLessThanOrEqual(1050);
    expect(new Set(rs).size).toBe(rs.length); // every value differs
    // the source is not varied
    expect(new Set(a.map((x) => x.sheet.parts.find((p) => p.sym === 'vdc')!.props.value)).size).toBe(1);
    sheet.mc = mc({ seed: '8' });
    const c = monteCarloSheets(sheet) as typeof a;
    const r1 = (x: typeof a) => x[1].sheet.parts.find((p) => p.sym === 'resistor')!.props.value;
    expect(r1(c)).not.toBe(r1(a));
  });
  it('operating point: OUT over the runs stays inside the worst case 10·R2/(R1+R2) with ±5 %', () => {
    const { sheet } = divider();
    sheet.mc = mc({ dist: 'gauss' });
    const r = simulate(sheet) as SimResult;
    expect(r.x.length).toBe(50);
    expect(r.v['OUT'][0]).toBeCloseTo(5, 6);
    const lo = (10 * 950) / (1050 + 950), hi = (10 * 1050) / (950 + 1050);
    for (const v of r.v['OUT']) { expect(v).toBeGreaterThanOrEqual(lo - 1e-9); expect(v).toBeLessThanOrEqual(hi + 1e-9); }
    expect(Math.max(...r.v['OUT']) - Math.min(...r.v['OUT'])).toBeGreaterThan(0.01);
  });
  it('transient runs are overlaid; bad settings and a parameter sweep at the same time are refused; saved with the project', () => {
    const { sheet } = deck([['vpulse', { value: '5', freq: '100' }, { '1': 'IN', '2': 'GND' }], ['resistor', { value: '1k' }, { '1': 'IN', '2': 'OUT' }], ['capacitor', { value: '1u' }, { '1': 'OUT', '2': 'GND' }]], { type: 'tran', stop: '10m', step: '' });
    sheet.mc = mc({ runs: '5' });
    expect((simulate(sheet) as SimResult).steps!.map((s) => s.label)).toEqual(['nominal', 'run 2', 'run 3', 'run 4', 'run 5']);
    sheet.mc = mc({ runs: '1' });
    expect((simulate(sheet) as { error: string }).error).toMatch(/from 2 to 50/);
    sheet.mc = mc({ runs: '5' });
    sheet.step = { on: true, ref: 'R1', param: 'value', mode: 'list', list: '1k', start: '', stop: '', step: '' };
    expect((simulate(sheet) as { error: string }).error).toMatch(/cannot run together/);
    const back = fromFiles(JSON.parse(JSON.stringify(toFiles('MC', sheet)))).sheet;
    expect(back.mc).toEqual(sheet.mc);
  });
});
