// Temperature analysis (.temp): device temperature equations, resistor coefficients, the
// temperature as a stepped property, and the export. The ngspice cross-check at −20, 85 and
// 125 °C is in sim.ngspice.test.ts (the "@…C" reference cases).
import { describe, expect, it } from 'vitest';
import { deck } from './deck';
import { schematicSpice, simulate, type SimResult } from '../src/sim/run';
import { Engine, TNOM, VT, satCurrent, mosAtTemp } from '../src/sim/engine';
import { D1N4148, M2N7000 } from '../src/sim/reference';
import { fromFiles, toFiles } from '../src/eda/project';
import { TEMP_REF, sheetTemp, type StepSweep } from '../src/eda/schematic';
import { ledModel } from '../src/eda/models';
import type { Circuit, DiodeModel } from '../src/sim/circuit';

const near = (x: number, want: number, tol: number) => expect(Math.abs(x - want), `${x} vs ${want}`).toBeLessThanOrEqual(tol);
const step = (o: Partial<StepSweep>): StepSweep => ({ on: true, ref: '', param: 'value', mode: 'list', list: '', start: '', stop: '', step: '', ...o });

/** Junction voltage of a diode driven by a current source. */
function vf(model: DiodeModel, i: number, temp?: number): number {
  const c: Circuit = { temp, elements: [{ kind: 'I', name: 'I1', p: '0', n: 'a', dc: i }, { kind: 'D', name: 'D1', a: 'a', k: '0', model: { ...model, rs: 0 } }] };
  return new Engine(c).op().v.a;
}

describe('temperature equations', () => {
  it('saturation current: unchanged at 27 °C, about ×2 per 5 K for silicon (N = 1)', () => {
    expect(satCurrent(1e-14, 1, TNOM)).toBe(1e-14);
    const r = satCurrent(1e-14, 1, TNOM + 5) / 1e-14;
    expect(r).toBeGreaterThan(1.8); expect(r).toBeLessThan(2.2);
  });
  it('the thermal voltage follows T: 25.9 mV at 27 °C, 30.9 mV at 85 °C', () => {
    near(VT, 0.025865, 1e-6);
    const c: Circuit = { temp: 85, elements: [{ kind: 'I', name: 'I1', p: '0', n: 'a', dc: 1e-3 }, { kind: 'D', name: 'D1', a: 'a', k: '0', model: { is: 1e-14, n: 1, rs: 0, xti: 0, eg: 0 } }] };
    // with XTI = EG = 0 the saturation current stays, so v = V_T(T)·ln(I/IS + 1)
    near(new Engine(c).op().v.a, VT * (358.15 / TNOM) * Math.log(1e-3 / 1e-14 + 1), 1e-6);
  });
  it('a silicon diode at 1 mA: about −2 mV/K, and the exact SPICE relation r·V₀ − (r − 1)·EG − XTI·V_T·ln r', () => {
    const v27 = vf(D1N4148, 1e-3), v85 = vf(D1N4148, 1e-3, 85);
    const slope = (v85 - v27) / 58;
    expect(slope).toBeLessThan(-1.2e-3); expect(slope).toBeGreaterThan(-2.5e-3);
    // n·V_T(T)·ln(I/IS(T)) with IS(T) from satCurrent, solved independently of the engine
    const tk = 358.15, r = tk / TNOM, n = D1N4148.n;
    near(v85, r * n * VT * Math.log(1e-3 / D1N4148.is) - (r - 1) * 1.11 - 3 * r * VT * Math.log(r), 1e-4);
  });
  it('an LED falls by about 2 mV/K at 20 mA (its band gap is fitted to that)', () => {
    const m = ledModel(2.0);
    near((vf(m, 0.02, 85) - vf(m, 0.02)) / 58, -2e-3, 0.3e-3);
  });
  it('MOSFET: KP falls as T^−1.5 and the threshold of an n-channel part by about 1 mV/K', () => {
    const t = mosAtTemp(M2N7000, 358.15);
    near(t.kp, M2N7000.kp * (TNOM / 358.15) ** 1.5, 1e-12);
    const dv = (t.vto - M2N7000.vto) / 58;
    expect(dv).toBeLessThan(-0.5e-3); expect(dv).toBeGreaterThan(-2e-3);
    near(mosAtTemp(M2N7000, TNOM).vto, M2N7000.vto, 1e-4);
  });
  it('below absolute zero is an error', () => {
    expect(() => new Engine({ temp: -300, elements: [{ kind: 'R', name: 'R1', a: 'a', b: '0', r: 1 }] })).toThrow(/absolute zero/);
  });
});

describe('temperature on the schematic', () => {
  const diode = () => deck([['idc', { value: '1m' }, { '1': 'A', '2': 'GND' }], ['diode', { value: '1N4148' }, { '1': 'GND', '2': 'A' }]]);
  it('the sheet temperature: empty is 27 °C; text that is not a temperature is an error', () => {
    expect(sheetTemp({})).toBe(27);
    expect(sheetTemp({ temp: '85' })).toBe(85);
    expect(sheetTemp({ temp: '-40' })).toBe(-40);
    expect(sheetTemp({ temp: 'hot' })).toHaveProperty('error');
    expect(sheetTemp({ temp: '-300' })).toHaveProperty('error');
    const { sheet } = diode();
    sheet.temp = 'hot';
    expect(simulate(sheet)).toHaveProperty('error');
  });
  it('a resistor temperature coefficient in ppm/K: r·(1 + tc·ΔT)', () => {
    const { sheet } = deck([['vdc', { value: '10' }, { '1': 'A', '2': 'GND' }], ['resistor', { value: '1k', tc: '1000' }, { '1': 'A', '2': 'OUT' }], ['resistor', { value: '1k' }, { '1': 'OUT', '2': 'GND' }]]);
    sheet.temp = '127';
    const r = simulate(sheet) as SimResult;
    near(r.v.OUT[0], 10 * 1e3 / (1e3 + 1e3 * 1.1), 1e-6);
  });
  it('the temperature as a stepped property: an operating point over −20, 27, 85 °C', () => {
    const { sheet } = diode();
    sheet.step = step({ ref: TEMP_REF, list: '-20 27 85' });
    const r = simulate(sheet) as SimResult;
    expect(r.analysis).toBe('dc');
    expect(r.x).toEqual([-20, 27, 85]);
    expect(r.xLabel).toBe('Temperature');
    expect(r.xUnit).toBe('°C');
    const v = r.v.A;
    expect(v[0]).toBeGreaterThan(v[1]); expect(v[1]).toBeGreaterThan(v[2]);
    near(v[1], vf(D1N4148, 1e-3) + 1e-3 * D1N4148.rs, 1e-6);
  });
  it('a stepped temperature overlays a transient with one trace per temperature', () => {
    const { sheet } = deck([['vsin', { value: '5', freq: '50' }, { '1': 'IN', '2': 'GND' }], ['diode', { value: '1N4148' }, { '1': 'OUT', '2': 'IN' }], ['resistor', { value: '1k' }, { '1': 'OUT', '2': 'GND' }]],
      { type: 'tran', stop: '20m', step: '20u' });
    sheet.step = step({ ref: TEMP_REF, list: '0 100' });
    const r = simulate(sheet) as SimResult;
    expect(r.steps!.map((s) => s.label)).toEqual(['T = 0 °C', 'T = 100 °C']);
    // the hot diode drops less, so the rectified peak is higher
    expect(Math.max(...r.steps![1].v.OUT)).toBeGreaterThan(Math.max(...r.steps![0].v.OUT) + 0.05);
  });
  it('op-amp clamps and regulators keep their behaviour: macro-model junctions stay at 27 °C', () => {
    const { sheet } = deck([['vdc', { value: '12' }, { '1': 'VCC', '2': 'GND' }], ['vdc', { value: '5' }, { '1': 'IN', '2': 'GND' }],
      ['opamp', {}, { '3': 'IN', '2': 'GND', '6': 'OUT', '7': 'VCC', '4': 'GND' }], ['resistor', { value: '10k' }, { '1': 'OUT', '2': 'GND' }]]);
    const cold = (simulate(sheet) as SimResult).v.OUT[0];
    sheet.temp = '125';
    near((simulate(sheet) as SimResult).v.OUT[0], cold, 2e-3);
  });
  it('is saved with the project and exported as .temp', () => {
    const { sheet } = diode();
    sheet.temp = '85';
    expect(fromFiles(JSON.parse(JSON.stringify(toFiles('T', sheet)))).sheet.temp).toBe('85');
    expect(schematicSpice(sheet)).toMatch(/^\.temp 85$/m);
    sheet.temp = undefined;
    expect(schematicSpice(sheet)).not.toMatch(/\.temp/);
  });
});
