import { describe, expect, it } from 'vitest';
import { importModel, parseModelCard, spiceValue } from '../src/eda/spicemodel';
import { deck } from './deck';
import { simulate, type SimResult } from '../src/sim/run';

describe('SPICE .model import', () => {
  it('SPICE numbers: M is milli, MEG is mega, units after the suffix are ignored', () => {
    expect(spiceValue('2.52n')).toBeCloseTo(2.52e-9, 20);
    expect(spiceValue('10m')).toBeCloseTo(0.01, 15);
    expect(spiceValue('1MEG')).toBe(1e6);
    expect(spiceValue('100V')).toBe(100);
    expect(spiceValue('1.5e-14')).toBe(1.5e-14);
    expect(spiceValue('pF')).toBeNull();
  });
  it('a diode card with continuation lines: used and ignored parameters', () => {
    const r = importModel('diode', `.model 1N4001 D(IS=29.5n RS=73.6m N=1.98
+ CJO=17p M=0.333 BV=50 IBV=10u TT=4.32u)`);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.name).toBe('1N4001');
    expect(r.model).toEqual({ is: 29.5e-9, n: 1.98, rs: 0.0736, bv: 50, ibv: 10e-6 });
    expect(r.ignored).toEqual(['CJO', 'M', 'TT']);
  });
  it('a BJT card; a wrong type or a level-3 MOSFET is refused with the reason', () => {
    const q = importModel('npn', '.model BC337 NPN(IS=4.13E-14 BF=292 BR=7.4 VAF=145 NF=1 NR=1 CJE=2.42E-11)');
    expect('error' in q ? q.error : q.model).toEqual({ type: 'npn', is: 4.13e-14, bf: 292, br: 7.4, nf: 1, nr: 1, vaf: 145 });
    expect(importModel('pnp', '.model BC337 NPN(IS=1e-14)')).toEqual({ error: expect.stringMatching(/does not fit/) });
    expect(importModel('nmos', '.model X NMOS(LEVEL=3 VTO=2)')).toEqual({ error: expect.stringMatching(/LEVEL=3/) });
    expect(parseModelCard('model X D')).toHaveProperty('error');
    expect(parseModelCard('.model X D(IS=abc)')).toHaveProperty('error');
  });
  it('the imported model is the one simulated', () => {
    const card = '.model SLOW D(IS=1e-6 N=2)';
    const run = (spice: string) => {
      const { sheet } = deck([['vdc', { value: '5' }, { '1': 'A', '2': 'GND' }], ['resistor', { value: '1k' }, { '1': 'A', '2': 'K' }], ['diode', { value: '1N4148', spice }, { '2': 'K', '1': 'GND' }]]);
      return simulate(sheet) as SimResult;
    };
    const vf = run(card).v['K'][0];
    const i = (5 - vf) / 1e3;
    expect(vf).toBeCloseTo(2 * 0.025865 * Math.log(i / 1e-6 + 1), 3);
    expect(Math.abs(run('').v['K'][0] - vf)).toBeGreaterThan(0.2);
    const bad = simulate(deck([['vdc', { value: '5' }, { '1': 'A', '2': 'GND' }], ['diode', { spice: '.model Q1 NPN(IS=1e-14)' }, { '2': 'A', '1': 'GND' }]]).sheet) as { error: string };
    expect(bad.error).toMatch(/SPICE model: a NPN model does not fit/);
  });
});
