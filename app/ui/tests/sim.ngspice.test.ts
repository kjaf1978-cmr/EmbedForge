// @vitest-environment node
// SIM-04: the built-in engine against ngspice on the reference suite. Runs where ngspice is
// installed (CI installs it); elsewhere the test is skipped and says so.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REFERENCE, type RefCase } from '../src/sim/reference';
import { toSpice, spiceNode, spiceName } from '../src/sim/spice';
import { Engine, decadePoints, linearPoints, type Waveforms } from '../src/sim/engine';
import type { Element } from '../src/sim/circuit';
import { EXAMPLES } from '../src/eda/examples';
import { buildSimNet, planAnalysis } from '../src/eda/simnet';
import type { SimSettings } from '../src/eda/schematic';
import { deck, type Spec } from './deck';

function haveNgspice(): boolean {
  try { execFileSync('ngspice', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; }
}

interface Table { x: number[]; cols: Record<string, number[]> }

function runNgspice(rc: RefCase): Table {
  const dir = mkdtempSync(join(tmpdir(), 'ef-ngspice-'));
  const out = join(dir, 'out.txt');
  const vecs: string[] = [];
  const isAc = rc.analysis.type === 'ac';
  for (const nd of rc.nodes) {
    const v = `v(${spiceNode(nd)})`;
    vecs.push(...(isAc ? [`real(${v})`, `imag(${v})`] : [v]));
  }
  for (const e of rc.currents ?? []) {
    const el = rc.circuit.elements.find((x) => x.name === e)!;
    vecs.push(`i(${spiceName(el).toLowerCase()})`);
  }
  const control = ['.control', 'set wr_singlescale', 'set wr_vecnames', 'set numdgt=10', 'run', `wrdata ${out} ${vecs.join(' ')}`, '.endc'];
  const file = join(dir, 'c.cir');
  writeFileSync(file, toSpice(rc.circuit, rc.analysis, control));
  execFileSync('ngspice', ['-b', file], { stdio: 'pipe' });
  const lines = readFileSync(out, 'utf8').trim().split('\n');
  const head = lines[0].trim().split(/\s+/);
  const rows = lines.slice(1).map((l) => l.trim().split(/\s+/).map(Number));
  const cols: Record<string, number[]> = {};
  head.slice(1).forEach((h, k) => { cols[h] = rows.map((r) => r[k + 1]); });
  // op analysis writes one row without a scale column meaning; normalise
  return { x: rows.map((r) => r[0]), cols: Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v])) };
}

function runEngine(rc: RefCase): Waveforms {
  const eng = new Engine(rc.circuit);
  const a = rc.analysis;
  switch (a.type) {
    case 'op': {
      const r = eng.op();
      return { x: [0], v: Object.fromEntries(Object.entries(r.v).map(([k, v]) => [k, [v]])), i: Object.fromEntries(Object.entries(r.i).map(([k, v]) => [k, v.map((x) => [x])])), warnings: r.warnings };
    }
    case 'dc': {
      const el = eng.element(a.source) as Element & { kind: 'V' | 'I' };
      return eng.dcSweep(linearPoints(a.start, a.stop, a.step), (v) => { el.dc = v; });
    }
    case 'tran': return eng.tran(a.tstep, a.tstop, a.tmax, 200000, !!a.uic);
    case 'ac': return eng.ac(decadePoints(a.fstart, a.fstop, a.perDecade));
  }
}

/** Linear interpolation of (xs, ys) at x. */
function interp(xs: number[], ys: number[], x: number): number {
  if (xs.length === 1) return ys[0];
  let lo = 0, hi = xs.length - 1;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[hi]) return ys[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

function compare(name: string, xsRef: number[], ref: number[], xs: number[], got: number[], absTol: number, transient: boolean): string[] {
  const errs: string[] = [];
  const span = Math.max(...ref.map(Math.abs));
  ref.forEach((r, k) => {
    const x = xsRef[k];
    const g = interp(xs, got, x);
    // transient: compare on a time grid; near a fast edge the interpolation of either
    // result dominates, so the tolerance also allows 1 % of the signal span
    const tol = Math.max(0.01 * Math.abs(r), absTol, transient ? 0.01 * span : 0);
    if (Math.abs(g - r) > tol) errs.push(`${name} @ ${x.toExponential(3)}: engine ${g.toPrecision(6)} vs ngspice ${r.toPrecision(6)}`);
  });
  return errs;
}

const ok = haveNgspice();
describe.skipIf(!ok)('SIM-04 reference suite against ngspice', () => {
  for (const rc of REFERENCE) {
    it(rc.id, () => {
      const ng = runNgspice(rc);
      const me = runEngine(rc);
      const tran = rc.analysis.type === 'tran';
      const errs: string[] = [];
      for (const nd of rc.nodes) {
        const v = `v(${spiceNode(nd)})`;
        if (rc.analysis.type === 'ac') {
          // compare magnitude and phase-free components through real and imaginary parts
          errs.push(...compare(`Re ${v}`, ng.x, ng.cols[`real(${v})`], me.x, me.v[nd], 1e-3, false));
          errs.push(...compare(`Im ${v}`, ng.x, ng.cols[`imag(${v})`], me.x, me.vi![nd], 1e-3, false));
        } else errs.push(...compare(v, ng.x, ng.cols[v], me.x, me.v[nd], 1e-3, tran));
      }
      for (const e of rc.currents ?? []) {
        const el = rc.circuit.elements.find((x) => x.name === e)!;
        const key = `i(${spiceName(el).toLowerCase()})`;
        errs.push(...compare(key, ng.x, ng.cols[key], me.x, me.i[e][0], 1e-6, tran));
      }
      expect(errs.slice(0, 10)).toEqual([]);
    });
  }
});

// the newer parts at schematic level: the same flattening as in the app, then both simulators
const V = (v: number, pos: string): Spec => ['vdc', { value: String(v) }, { '1': pos, '2': 'GND' }];
const R = (r: string, a: string, b: string): Spec => ['resistor', { value: r }, { '1': a, '2': b }];
const partDecks: [string, Spec[], SimSettings][] = [
  ['DC motor start-up', [V(12, 'A'), ['dcmotor', {}, { '1': 'A', '2': 'GND', '3': 'SPD' }]], { type: 'tran', stop: '500m', step: '1m', start: 'zero' }],
  ['transformer 10:1 with load', [['vsin', { value: '10', freq: '50' }, { '1': 'IN', '2': 'GND' }], ['transformer', { value: '0.1' }, { '1': 'IN', '2': 'GND', '3': 'S', '4': 'GND' }], R('100', 'S', 'GND')], { type: 'tran', stop: '60m', step: '50u' }],
  ['three-phase Dyn transformer', [['vsin3', { value: '230', freq: '50' }, { '1': 'PU', '2': 'PV', '3': 'PW', '4': 'GND' }],
    ['transformer3', { value: 'Dyn', vs: '230' }, { '1': 'PU', '2': 'PV', '3': 'PW', '5': 'SU', '6': 'SV', '7': 'SW', '8': 'GND' }],
    R('100', 'SU', 'GND'), R('100', 'SV', 'GND'), R('100', 'SW', 'GND')], { type: 'tran', stop: '60m', step: '50u' }],
  ['three-phase induction motor at 50 Hz', [['vsin3', { value: '230', ac: '1' }, { '1': 'U', '2': 'V', '3': 'W', '4': 'GND' }], R('0.5', 'U', 'MU'),
    ['motor3', {}, { '1': 'MU', '2': 'V', '3': 'W', '4': 'N' }]], { type: 'ac', fstart: '1', fstop: '1k', perDecade: '10' }],
  ['single-phase motor', [['vsin', { value: '325', freq: '50' }, { '1': 'L', '2': 'GND' }], R('1', 'L', 'ML'), ['motor1', {}, { '1': 'ML', '2': 'GND' }]], { type: 'tran', stop: '60m', step: '50u' }],
  ['imported SPICE models (1N4001, BC337)', [V(5, 'A'), R('1k', 'A', 'K'), ['diode', { spice: '.model 1N4001 D(IS=29.5n RS=73.6m N=1.98 CJO=17p BV=50 IBV=10u)' }, { '2': 'K', '1': 'GND' }],
    R('10k', 'A', 'B'), R('470', 'A', 'C'), ['npn', { spice: '.model BC337 NPN(IS=4.13E-14 BF=292 BR=7.4 VAF=145 NF=1 NR=1)' }, { '1': 'B', '2': 'C', '3': 'GND' }]], { type: 'dc', target: 'V1', param: 'value', start: '0', stop: '5', step: '0.1' }],
  ['TVS diodes, uni- and bidirectional', [V(0, 'S'), R('100', 'S', 'L'), ['tvs', { value: 'SMAJ12A' }, { '1': 'L', '2': 'GND' }], R('100', 'S', 'M'), ['tvs', { value: 'SMAJ12CA' }, { '1': 'M', '2': 'GND' }]],
    { type: 'dc', target: 'V1', param: 'value', start: '-30', stop: '30', step: '0.5' }],
  ['bridge rectifier with smoothing', [['vsin', { value: '12', freq: '50' }, { '1': 'AC1', '2': 'AC2' }], R('1meg', 'AC2', 'GND'), ['bridge', { value: 'DB107' }, { '1': 'AC1', '2': 'AC2', '3': 'P', '4': 'GND' }],
    R('1k', 'P', 'GND'), ['capacitor', { value: '22u' }, { '1': 'P', '2': 'GND' }]], { type: 'tran', stop: '60m', step: '20u', start: 'zero' }],
  ['IGBT gate sweep with a load', [V(0, 'G'), V(100, 'VCC'), R('5', 'VCC', 'C'), ['igbt', { value: 'IKW30N60T' }, { '1': 'G', '2': 'C', '3': 'GND' }]],
    { type: 'dc', target: 'V1', param: 'value', start: '0', stop: '15', step: '0.25' }],
  ['optocoupler transfer', [V(0, 'IN'), R('1k', 'IN', 'A'), ['opto', { value: 'PC817' }, { '1': 'A', '2': 'GND', '3': 'GND', '4': 'C' }], V(5, 'VCC'), R('470', 'VCC', 'C')],
    { type: 'dc', target: 'V1', param: 'value', start: '0', stop: '10', step: '0.2' }],
  ['TL431 regulator from a divider', [V(0, 'S'), R('470', 'S', 'K'), ['tl431', { value: 'TL431' }, { '1': 'F', '2': 'GND', '3': 'K' }], R('10k', 'K', 'F'), R('10k', 'F', 'GND')],
    { type: 'dc', target: 'V1', param: 'value', start: '0', stop: '15', step: '0.25' }],
  ['relay with flyback diode', [['vpulse', { value: '5', freq: '20', edge: '1m' }, { '1': 'C', '2': 'GND' }], ['diode', {}, { '1': 'C', '2': 'GND' }], V(12, 'COM'),
    R('1k', 'NO', 'GND'), R('1k', 'NC', 'GND'), ['relay', {}, { '1': 'C', '2': 'GND', '3': 'COM', '4': 'NC', '5': 'NO' }]], { type: 'tran', stop: '100m', step: '20u' }],
];

// every example schematic that has SPICE primitives only (not the 555) is a reference case too
const exampleCases: RefCase[] = [...EXAMPLES.map((ex) => [`example ${ex.id}`, ex.build()] as const), ...partDecks.map(([id, parts, sim]) => [`part ${id}`, deck(parts, sim).sheet] as const)].flatMap(([id, sheet]) => {
  const net = buildSimNet(sheet);
  if (net.circuit.elements.some((e) => e.kind === 'T' || e.kind === 'P' || e.kind === 'X')) return [];
  const errors: string[] = [];
  const plan = planAnalysis(sheet.sim, sheet, errors);
  let analysis = plan.analysis;
  if (analysis.type === 'dc') {
    const el = net.circuit.elements.find((e) => e.name === plan.sweep!.element)!;
    analysis = { ...analysis, source: spiceName(el) };
  }
  const nodes = [...net.netNode.values()].filter((n) => n !== '0');
  return [{ id, circuit: net.circuit, analysis, nodes }];
});

describe.skipIf(!ok)('SIM-04 example schematics against ngspice', () => {
  for (const rc of exampleCases) {
    it(rc.id, () => {
      const ng = runNgspice(rc);
      const a = rc.analysis;
      const me = a.type === 'dc'
        ? (() => { const eng = new Engine(rc.circuit); const el = rc.circuit.elements.find((e) => spiceName(e) === a.source) as Element & { kind: 'V' };
            const mine = eng.element(el.name) as Element & { kind: 'V' }; return eng.dcSweep(linearPoints(a.start, a.stop, a.step), (v) => { mine.dc = v; }); })()
        : runEngine(rc);
      const errs: string[] = [];
      for (const nd of rc.nodes) {
        const v = `v(${spiceNode(nd)})`;
        if (a.type === 'ac') {
          errs.push(...compare(`Re ${v}`, ng.x, ng.cols[`real(${v})`], me.x, me.v[nd], 1e-3, false));
          errs.push(...compare(`Im ${v}`, ng.x, ng.cols[`imag(${v})`], me.x, me.vi![nd], 1e-3, false));
        } else errs.push(...compare(v, ng.x, ng.cols[v], me.x, me.v[nd], 1e-3, a.type === 'tran'));
      }
      expect(errs.slice(0, 10)).toEqual([]);
    });
  }
});

describe.skipIf(ok)('SIM-04 reference suite against ngspice', () => {
  it.skip('ngspice is not installed here; CI runs this suite', () => {});
});

// FFT view against ngspice's fft (Hann window): harmonic levels relative to the fundamental of
// a diode clipper. Main-lobe energies are compared, so ngspice's zero padding does not matter.
describe.skipIf(!ok)('FFT view against ngspice fft', () => {
  it('diode clipper: odd harmonics within 0.1 dB of ngspice; even harmonics absent', async () => {
    const { spectrum, component } = await import('../src/sim/fft');
    const d = { is: 2.52e-9, n: 1.752, rs: 0.568 };
    const circuit = { elements: [
      { kind: 'V', name: 'V1', p: 'in', n: '0', dc: 0, wave: { type: 'sin', vo: 0, va: 5, freq: 1e3 } },
      { kind: 'R', name: 'R1', a: 'in', b: 'out', r: 1e3 },
      { kind: 'D', name: 'D1', a: 'out', k: '0', model: d }, { kind: 'D', name: 'D2', a: '0', k: 'out', model: d },
    ] } as const;
    const dir = mkdtempSync(join(tmpdir(), 'ef-fft-'));
    const out = join(dir, 'fft.txt');
    const file = join(dir, 'c.cir');
    writeFileSync(file, toSpice(circuit as never, { type: 'tran', tstep: 1e-6, tstop: 10e-3, tmax: 1e-6 },
      ['.control', 'run', 'linearize v(out)', 'set specwindow=hanning', 'fft v(out)', 'set wr_singlescale', 'wrdata ' + out + ' mag(v(out))', '.endc']));
    execFileSync('ngspice', ['-b', file], { stdio: 'pipe' });
    const rows = readFileSync(out, 'utf8').trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
    const lobe = (h: number) => Math.sqrt(rows.filter(([f]) => Math.abs(f - h * 1000) <= 200).reduce((a, [, m]) => a + m * m, 0));
    const w = new Engine(circuit as never).tran(1e-6, 10e-3);
    const s = spectrum(w.x, w.v['out'], 0, 10e-3);
    const ours = (h: number) => component(s, Math.round((h * 1000) / s.df) - 1).amp;
    for (const h of [3, 5, 7, 9, 11]) {
      const ng = 20 * Math.log10(lobe(h) / lobe(1)), me = 20 * Math.log10(ours(h) / ours(1));
      expect(Math.abs(me - ng), `harmonic ${h}: ours ${me.toFixed(2)} dBc, ngspice ${ng.toFixed(2)} dBc`).toBeLessThan(0.1);
    }
    for (const h of [2, 4]) expect(20 * Math.log10(ours(h) / ours(1))).toBeLessThan(-100);
  });
});
