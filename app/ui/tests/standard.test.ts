// Purchasable values and ratings (D20, VER-13).
import { describe, expect, it } from 'vitest';
import { E6, E96, inSeries, nearestIn, nextStep, RES_W, unbuyable } from '../src/eda/standard';
import { E12, E24 } from '../src/eda/units';
import type { Part } from '../src/eda/schematic';
import { erc } from '../src/eda/erc';
import { deck } from './deck';

const part = (sym: string, props: Record<string, string>): Part => ({ id: 'p', ref: 'R1', sym, x: 0, y: 0, rot: 0, mirror: false, props });

describe('E series', () => {
  it('E96 by the IEC 60063 formula: 96 values from 1.00 to 9.76, with 1.02, 4.99, 6.04 and 9.53 among them', () => {
    expect(E96.length).toBe(96);
    expect(E96[0]).toBe(1); expect(E96[95]).toBe(9.76);
    for (const v of [1.02, 4.99, 6.04, 9.53]) expect(E96).toContain(v);
    expect(new Set(E96).size).toBe(96);
  });
  it('E6 ⊂ E12 ⊂ E24; membership in any decade', () => {
    for (const v of E6) expect(E12).toContain(v);
    for (const v of E12) expect(E24).toContain(v);
    for (const v of [4.7, 47, 4700, 4.7e6, 0.47, 47e-9]) expect(inSeries(v, E12)).toBe(true);
    expect(inSeries(5.1e3, E12)).toBe(false); expect(inSeries(5.1e3, E24)).toBe(true);
    expect(inSeries(1.13e3, E24)).toBe(false); expect(inSeries(1.13e3, E96)).toBe(true);
  });
  it('nearest value on a log scale, across a decade boundary', () => {
    expect(nearestIn(1.13e3, E24)).toBe(1.1e3);
    expect(nearestIn(9.3e3, E24)).toBe(9.1e3);
    expect(nearestIn(9.6e3, E24)).toBe(10e3);
    expect(nearestIn(9.8e3, E12)).toBe(10e3);
    expect(nearestIn(3.4e-9, E12)).toBe(3.3e-9);
  });
  it('a rating goes up to the next catalogue step', () => {
    expect(nextStep(0.3, RES_W)).toBe(0.4);
    expect(nextStep(0.25, RES_W)).toBe(0.25);
    expect(nextStep(5000, RES_W)).toBeNull();
  });
});

describe('parts that cannot be bought', () => {
  it('a 1.13 kΩ resistor is E96 (1 %); 1.15 kΩ neither E24 nor E96, with the nearest of each', () => {
    expect(unbuyable(part('resistor', { value: '1.13k', pmax: '0.25' }))).toEqual([]);
    const u = unbuyable(part('resistor', { value: '1.17k', pmax: '0.25' }));
    expect(u.map((x) => x.options)).toEqual([['1.2k', '1.18k']]);
  });
  it('a 0.3 W resistor, a 30 V capacitor and a 7 A fuse are offered the next rating up', () => {
    expect(unbuyable(part('resistor', { value: '1k', pmax: '0.3' })).map((x) => x.options)).toEqual([['400m']]);
    expect(unbuyable(part('capacitor', { value: '100n', vmax: '30' })).map((x) => x.options)).toEqual([['35']]);
    expect(unbuyable(part('fuse', { value: '7', r: '0.01' })).map((x) => x.options)).toEqual([['8']]);
  });
  it('the electrical rule check reports it as VER-13; every example is buyable', async () => {
    const { sheet } = deck([['vdc', { value: '5' }, { '1': 'A', '2': 'GND' }], ['resistor', { value: '1.17k' }, { '1': 'A', '2': 'GND' }]]);
    expect(erc(sheet).filter((i) => i.rule === 'VER-13').map((i) => i.severity)).toEqual(['warning']);
    const { EXAMPLES } = await import('../src/eda/examples');
    for (const ex of EXAMPLES) expect(erc(ex.build()).filter((i) => i.rule === 'VER-13').map((i) => i.message), ex.id).toEqual([]);
  });
});
