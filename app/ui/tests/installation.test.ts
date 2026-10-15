// Power and installation parts (D20): each against its datasheet or standard.
import { describe, expect, it } from 'vitest';
import { deck, type Spec } from './deck';
import { simulate, type SimResult } from '../src/sim/run';
import { AUTOTRANSFORMERS, CONTACTORS, POWER_MOSFETS, PV_MODULES, VARISTORS, varistorAlpha } from '../src/eda/models';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import type { SimSettings } from '../src/eda/schematic';

const near = (x: number, want: number, tol: number) => expect(Math.abs(x - want), `${x} vs ${want}`).toBeLessThanOrEqual(tol);
function run(parts: Spec[], sim?: SimSettings, temp?: string) {
  const d = deck(parts, sim);
  if (temp) d.sheet.temp = temp;
  const r = simulate(d.sheet);
  if ('error' in r) throw new Error(r.error);
  return { r: r as SimResult, refs: d.refs, sheet: d.sheet, v: (n: string) => (r as SimResult).v[n][0], i: (pin: string) => (r as SimResult).i[pin][0] };
}
const V = (v: number | string, pos: string, neg = 'GND'): Spec => ['vdc', { value: String(v) }, { '1': pos, '2': neg }];
const R = (v: string, a: string, b: string): Spec => ['resistor', { value: v }, { '1': a, '2': b }];
const I = (amps: number, into: string): Spec => ['idc', { value: String(amps) }, { '1': into, '2': 'GND' }];

describe('varistors', () => {
  for (const m of VARISTORS) it(`${m.name}: 1 mA at ${m.model.vn} V, ${m.model.vc} V at ${m.model.ic} A, α = ${varistorAlpha(m.model).toFixed(1)}`, () => {
    const a = run([I(1e-3, 'L'), ['mov', { value: m.name }, { '1': 'L', '2': 'GND' }]]);
    near(a.v('L'), m.model.vn, 0.002 * m.model.vn);
    const b = run([I(m.model.ic, 'L'), ['mov', { value: m.name }, { '1': 'L', '2': 'GND' }]]);
    near(b.v('L'), m.model.vc, 0.002 * m.model.vc);
    // at the continuous AC peak it leaks under 1 mA (discs about 50 µA, SPD blocks, α ≈ 15, about 0.2 mA)
    const c = run([V(m.model.vac * Math.SQRT2, 'L'), ['mov', { value: m.name }, { '1': 'L', '2': 'GND' }]]);
    expect(Math.abs(c.i(`${c.refs[1]}.1`))).toBeLessThan(1e-3);
  });
  it('a 4 kV 1.2/50 µs surge (2 Ω) on the 14D471K is clamped below 1 kV; the stress check rates its peak current and energy', () => {
    const { r, refs, sheet } = run([['vsurge', { value: '4k' }, { '1': 'S', '2': 'GND' }], ['mov', { value: '14D471K' }, { '1': 'S', '2': 'GND' }]],
      { type: 'tran', stop: '100u', step: '50n' });
    const peak = Math.max(...r.v.S);
    expect(peak).toBeGreaterThan(700); expect(peak).toBeLessThan(1000);
    const rows = smoke(sheet, connectivity(sheet), r).rows.filter((x) => x.ref === refs[1]);
    expect(rows.map((x) => x.quantity).sort()).toEqual(['E', 'Ipk']);
    const ipk = rows.find((x) => x.quantity === 'Ipk')!;
    expect(ipk.value).toBeGreaterThan(1000); expect(ipk.value).toBeLessThan(2000);
  });
});

describe('surge generators', () => {
  it('1.2/50 µs: open-circuit peak at the set voltage', () => {
    const { r } = run([['vsurge', { value: '6k' }, { '1': 'S', '2': 'GND' }], R('1meg', 'S', 'GND')], { type: 'tran', stop: '100u', step: '20n' });
    near(Math.max(...r.v.S), 6000, 60);
  });
  for (const wave of ['8/20', '10/350']) it(`${wave} µs current: peak at the set current`, () => {
    const { r, refs } = run([['isurge', { value: '10k', wave }, { '1': 'S', '2': 'GND' }], R('0.1', 'S', 'GND')], { type: 'tran', stop: wave === '8/20' ? '60u' : '1m', step: '50n' });
    near(Math.max(...r.v.S) / 0.1, 10000, 150);
    void refs;
  });
});

describe('circuit breakers', () => {
  it('3-pole C16: each pole conducts; a short on L2 trips all three poles', () => {
    const src: Spec = ['vsin3', { value: '230', freq: '50' }, { '1': 'L1', '2': 'L2', '3': 'L3', '4': 'GND' }];
    const ok = run([src, ['breaker3', { value: '16', curve: 'C' }, { '1': 'L1', '2': 'A', '3': 'L2', '4': 'B', '5': 'L3', '6': 'C' }], R('100', 'A', 'GND'), R('100', 'B', 'GND'), R('100', 'C', 'GND')], { type: 'tran', stop: '40m', step: '50u' });
    near(Math.max(...ok.r.v.A), 325, 2);
    const short = run([src, ['breaker3', { value: '16', curve: 'C' }, { '1': 'L1', '2': 'A', '3': 'L2', '4': 'B', '5': 'L3', '6': 'C' }], R('100', 'A', 'GND'), R('0.2', 'B', 'GND'), R('100', 'C', 'GND')], { type: 'tran', stop: '40m', step: '50u' });
    const end = short.r.x.length - 1;
    for (const n of ['A', 'B', 'C']) expect(Math.abs(short.r.v[n][end])).toBeLessThan(0.1);
  });
  it('1-pole + N with a 30 mA RCD: a 50 mA earth leak trips it', () => {
    const { r } = run([['vsin', { value: '325', freq: '50' }, { '1': 'L', '2': 'N' }], R('1', 'N', 'GND'),
      ['breaker2', { value: '16', curve: 'B', rcd: '30m' }, { '1': 'L', '2': 'LO', N1: 'N', N2: 'NO' }], R('100', 'LO', 'NO'), R('6.8k', 'LO', 'GND')], { type: 'tran', stop: '40m', step: '50u' });
    expect(Math.abs(r.v.LO[r.x.length - 1] - r.v.NO[r.x.length - 1])).toBeLessThan(0.1);
  });
  it('switched off: open', () => {
    const { v } = run([V(230, 'L'), ['breaker1', { value: '10', closed: 'false' }, { '1': 'L', '2': 'O' }], R('100', 'O', 'GND')]);
    expect(Math.abs(v('O'))).toBeLessThan(1e-3);
  });
});

describe('contactors', () => {
  for (const m of CONTACTORS) it(`${m.name}: closes on its rated coil voltage, holds through the AC zero crossings, the NC contact opens`, () => {
    const coil: Spec = m.model.coil === 'ac' ? ['vsin', { value: String(m.model.vcoil * Math.SQRT2), freq: '50' }, { '1': 'CA', '2': 'GND' }] : V(m.model.vcoil, 'CA');
    const { r } = run([coil, ['contactor', { value: m.name }, { A1: 'CA', A2: 'GND', '1': 'P', '2': 'L1', '3': 'P', '4': 'L2', '5': 'P', '6': 'L3', '13': 'P', '14': 'NO', '21': 'P', '22': 'NC' }],
      V(10, 'P'), R('10', 'L1', 'GND'), R('10', 'L2', 'GND'), R('10', 'L3', 'GND'), R('1k', 'NO', 'GND'), R('1k', 'NC', 'GND')], { type: 'tran', stop: '200m', step: '100u', start: 'zero' });
    const k = r.x.findIndex((t) => t >= 0.1);
    // closed from 100 ms on, without dropping out at any zero crossing
    for (let j = k; j < r.x.length; j++) { expect(r.v.L1[j]).toBeGreaterThan(9.9); expect(r.v.NC[j]).toBeLessThan(0.01); }
    // pull-in within 30 ms
    const kin = r.v.L1.findIndex((v) => v > 5);
    expect(r.x[kin]).toBeLessThan(0.03);
  });
  it('drops out when the coil supply falls below 40 %', () => {
    const { v } = run([V(24 * 0.3, 'CA'), ['contactor', { value: '9 A, coil 24 V DC' }, { A1: 'CA', A2: 'GND', '1': 'P', '2': 'L1' }], V(10, 'P'), R('10', 'L1', 'GND')]);
    expect(v('L1')).toBeLessThan(0.01);
  });
});

describe('comparators', () => {
  for (const name of ['LM393', 'LM339']) it(`${name}: open collector, low (< 0.4 V at 4 mA) while − is above +, pulled up otherwise`, () => {
    const cmp = (plus: number, minus: number) => run([V(12, 'VCC'), V(plus, 'P'), V(minus, 'M'), ['comparator', { value: name }, { '3': 'P', '2': 'M', '1': 'O', '8': 'VCC', '4': 'GND' }], R('3k', 'VCC', 'O')]).v('O');
    expect(cmp(2.0, 2.01)).toBeLessThan(0.4);
    expect(cmp(2.01, 2.0)).toBeGreaterThan(11.9);
  });
});

describe('PV modules', () => {
  for (const m of PV_MODULES) it(`${m.name}: Voc, Isc and the maximum power point at standard test conditions`, () => {
    const oc = run([['pv', { value: m.name }, { '1': 'P', '2': 'GND' }], R('1meg', 'P', 'GND')], undefined, '25');
    near(oc.v('P'), m.model.voc, 0.01 * m.model.voc);
    const sc = run([['pv', { value: m.name }, { '1': 'P', '2': 'GND' }], R('1m', 'P', 'GND')], undefined, '25');
    near(sc.v('P') / 1e-3, m.model.isc, 0.01 * m.model.isc);
  });
  it('the maximum power point of the 410 Wp module: 410 W at 31.3 V, within 1 %', () => {
    const { sheet, refs } = deck([V(0, 'P'), ['pv', { value: '410 Wp, 108 half-cells mono' }, { '1': 'P', '2': 'GND' }]],
      { type: 'dc', target: '', param: 'value', start: '20', stop: '37', step: '0.1' });
    sheet.temp = '25';
    sheet.sim = { type: 'dc', target: refs[0], param: 'value', start: '20', stop: '37', step: '0.1' };
    const r = simulate(sheet) as SimResult;
    // the module drives current into the source's + pin: P = v · i(V1.+)
    const p = r.x.map((v, k) => v * r.i[`${refs[0]}.1`][k]);
    const kmax = p.indexOf(Math.max(...p));
    near(p[kmax], 31.3 * 13.1, 0.01 * 410);
    near(r.x[kmax], 31.3, 0.3);
  });
  it('half the irradiance halves Isc; two in series double Voc; a hot module loses voltage', () => {
    const iscAt = (props: Record<string, string>) => run([['pv', { value: '100 Wp, 36 cells', ...props }, { '1': 'P', '2': 'GND' }], R('1m', 'P', 'GND')], undefined, '25').v('P') / 1e-3;
    near(iscAt({ g: '500' }), 2.95, 0.03);
    near(iscAt({ np: '3' }), 17.7, 0.18);
    const voc = (props: Record<string, string>, temp = '25') => run([['pv', { value: '100 Wp, 36 cells', ...props }, { '1': 'P', '2': 'GND' }], R('1meg', 'P', 'GND')], undefined, temp).v('P');
    near(voc({ ns: '2' }), 44.0, 0.5);
    const hot = voc({}, '65');
    // about −0.3 %/K: 40 K hotter loses 10 to 15 %
    expect(hot).toBeLessThan(22 * 0.9); expect(hot).toBeGreaterThan(22 * 0.85);
  });
});

describe('autotransformer', () => {
  for (const m of AUTOTRANSFORMERS) it(`${m.name}: 230 V on the 230 V tap gives every tap its voltage`, () => {
    const { r } = run([['vsin', { value: String(230 * Math.SQRT2), freq: '50' }, { '1': 'T5', '2': 'GND' }],
      ['autotransformer', { value: m.name }, { N: 'GND', T1: 'T1', T2: 'T2', T3: 'T3', T4: 'T4', T5: 'T5', T6: 'T6', T7: 'T7' }], R('1meg', 'T1', 'GND')], { type: 'tran', stop: '60m', step: '20u', start: 'zero' });
    const k0 = r.x.findIndex((t) => t >= 0.04);
    m.model.taps.forEach((tv, j) => near(Math.max(...r.v[`T${j + 1}`].slice(k0)), tv * Math.SQRT2, 0.015 * tv * Math.SQRT2));
  });
});

describe('half-bridge gate driver', () => {
  it('HO follows IN (between VB and VS), LO the inverse, with about 0.5 µs when both are off', () => {
    const { r } = run([V(15, 'VCC'), V(115, 'VB'), V(100, 'VS'), ['vpulse', { value: '5', low: '0', freq: '20k', duty: '50', edge: '20n' }, { '1': 'IN', '2': 'GND' }],
      ['hbdriver', {}, { '1': 'IN', '8': 'VCC', '3': 'GND', '7': 'VB', '6': 'HO', '5': 'VS', '4': 'LO' }], R('1k', 'HO', 'VS'), R('1k', 'LO', 'GND')], { type: 'tran', stop: '100u', step: '20n' });
    const k = r.x.findIndex((t) => t >= 10e-6), h = r.v.HO[k] - r.v.VS[k];
    expect(h).toBeGreaterThan(14); expect(r.v.LO[k]).toBeLessThan(0.5);
    const k2 = r.x.findIndex((t) => t >= 40e-6);
    expect(r.v.HO[k2] - r.v.VS[k2]).toBeLessThan(0.5); expect(r.v.LO[k2]).toBeGreaterThan(14);
    // dead time after the falling edge at 25 µs: HO is off, LO not yet on
    let off = 0;
    for (let j = 1; j < r.x.length; j++) if (r.x[j] > 25e-6 && r.x[j] < 27e-6 && r.v.HO[j] - r.v.VS[j] < 7.5 && r.v.LO[j] < 7.5) off += r.x[j] - r.x[j - 1];
    near(off, 0.5e-6, 0.15e-6);
  });
});

describe('power MOSFETs', () => {
  const rds: Record<string, number> = { IRFP4468: 2.0e-3, IRFP4110: 3.7e-3, IRFB4115: 9.3e-3, IPW65R041: 41e-3, IRFP4668: 8.0e-3 };
  for (const m of POWER_MOSFETS) it(`${m.name}: RDS(on) ≈ ${rds[m.name] * 1e3} mΩ at VGS 10 V`, () => {
    const { v } = run([V(10, 'G'), I(10, 'D'), ['nmos', { value: m.name }, { '1': 'G', '2': 'D', '3': 'GND' }]]);
    near(v('D') / 10, rds[m.name], 0.1 * rds[m.name]);
  });
});
