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
  ['relay with flyback diode', [['vpulse', { value: '5', freq: '20', edge: '1m' }, { '1': 'C', '2': 'GND' }], ['diode', {}, { '1': 'C', '2': 'GND' }], V(12, 'COM'),
    R('1k', 'NO', 'GND'), R('1k', 'NC', 'GND'), ['relay', {}, { '1': 'C', '2': 'GND', '3': 'COM', '4': 'NC', '5': 'NO' }]], { type: 'tran', stop: '100m', step: '20u' }],
];

// every example schematic that has SPICE primitives only (not the 555) is a reference case too
const exampleCases: RefCase[] = [...EXAMPLES.map((ex) => [`example ${ex.id}`, ex.build()] as const), ...partDecks.map(([id, parts, sim]) => [`part ${id}`, deck(parts, sim).sheet] as const)].flatMap(([id, sheet]) => {
  const net = buildSimNet(sheet);
  if (net.circuit.elements.some((e) => e.kind === 'T' || e.kind === 'P')) return [];
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
