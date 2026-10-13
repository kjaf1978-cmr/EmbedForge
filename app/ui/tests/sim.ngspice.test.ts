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
    case 'tran': return eng.tran(a.tstep, a.tstop, a.tmax);
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

describe.skipIf(ok)('SIM-04 reference suite against ngspice', () => {
  it.skip('ngspice is not installed here; CI runs this suite', () => {});
});
