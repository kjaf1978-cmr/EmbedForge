// Runs a schematic simulation and maps the engine's results back to nets and part pins.

import { Engine, SimError, type Waveforms } from './engine';
import { toSpice, spiceName, type Analysis } from './spice';
import { terminals, type Element } from './circuit';
import { buildSimNet, planAnalysis, type SimNet } from '../eda/simnet';
import { connectivity } from '../eda/connectivity';
import type { Sheet, StepSweep } from '../eda/schematic';
import { parseValue, shortValue } from '../eda/units';

export interface SimResult {
  analysis: Analysis['type'];
  xLabel: string;
  xUnit: string;
  x: number[];
  /** Net → voltage (real part for AC). */
  v: Record<string, number[]>;
  vi?: Record<string, number[]>;
  /** "REF.PIN" → current into the part at that pin. */
  i: Record<string, number[]>;
  ii?: Record<string, number[]>;
  rails: { net: string; volts: number }[];
  notSimulated: string[];
  warnings: string[];
  ms: number;
  /** Parameter sweep: one entry per run (v, i… above are the first run). */
  steps?: StepRun[];
}

export interface SimFailure { error: string; errors: string[] }

/** One run of a parameter sweep, on the shared x axis of the stepped result. */
export interface StepRun {
  label: string;
  v: Record<string, number[]>;
  vi?: Record<string, number[]>;
  i: Record<string, number[]>;
  ii?: Record<string, number[]>;
}

export const MAX_STEPS = 25;

/** Values of a parameter sweep, as the texts to put into the property. */
export function stepValues(st: StepSweep): { values: string[] } | { error: string } {
  if (st.mode === 'list') {
    const values = st.list.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!values.length) return { error: 'Parameter sweep: give at least one value' };
    if (values.length > MAX_STEPS) return { error: `Parameter sweep: at most ${MAX_STEPS} steps` };
    return { values };
  }
  const a = parseValue(st.start), b = parseValue(st.stop), c = parseValue(st.step);
  if (a === null || b === null || c === null) return { error: 'Parameter sweep: start, stop and step must be values' };
  let nums: number[];
  if (st.mode === 'lin') {
    if (!(c !== 0)) return { error: 'Parameter sweep: the step must not be 0' };
    const n = Math.floor((b - a) / c + 1e-9);
    if (n < 0) return { error: 'Parameter sweep: the step goes away from the stop value' };
    nums = Array.from({ length: n + 1 }, (_, k) => a + k * c);
  } else {
    if (!(a > 0 && b > a && c >= 1)) return { error: 'Parameter sweep (per decade): start above 0, stop above start, at least 1 point per decade' };
    const n = Math.round(Math.log10(b / a) * c);
    nums = Array.from({ length: n + 1 }, (_, k) => a * Math.pow(10, k / c));
  }
  if (nums.length > MAX_STEPS) return { error: `Parameter sweep: ${nums.length} steps; at most ${MAX_STEPS}` };
  return { values: nums.map((v) => shortValue(v, 6)) };
}

/** The sheet with one property of one part set to `value`. */
export function withProp(sheet: Sheet, ref: string, param: string, value: string): Sheet {
  return { ...sheet, step: undefined, parts: sheet.parts.map((p) => (p.ref === ref ? { ...p, props: { ...p.props, [param]: value } } : p)) };
}

function resample(xs: number[], ys: number[], grid: number[]): number[] {
  if (xs.length === grid.length && xs.every((x, k) => x === grid[k])) return ys;
  let j = 0;
  return grid.map((g) => {
    while (j < xs.length - 2 && xs[j + 1] < g) j++;
    const x0 = xs[j], x1 = xs[j + 1] ?? x0;
    const t = x1 > x0 ? Math.min(1, Math.max(0, (g - x0) / (x1 - x0))) : 0;
    return ys[j] + t * ((ys[j + 1] ?? ys[j]) - ys[j]);
  });
}

/** Runs the analysis once per sweep value. An operating point becomes a sweep over the values
 *  (x = the stepped value); other analyses share the x axis of the first run (a transient is
 *  resampled to 2000 points) and carry every run in `steps`. */
export function simulateStepped(sheet: Sheet): SimResult | SimFailure {
  const st = sheet.step!;
  const t0 = performance.now();
  const part = sheet.parts.find((p) => p.ref === st.ref);
  if (!part) return { error: `Parameter sweep: there is no part ${st.ref || '(none chosen)'}`, errors: [] };
  const vals = stepValues(st);
  if ('error' in vals) return { error: vals.error, errors: [] };
  const runs: { label: string; r: SimResult }[] = [];
  for (const val of vals.values) {
    const r = simulate(withProp(sheet, st.ref, st.param, val));
    if ('error' in r) return { error: `${st.ref} ${st.param} = ${val}: ${r.error}`, errors: r.errors };
    runs.push({ label: `${st.ref} ${st.param === 'value' ? '' : `${st.param} `}= ${val}`, r });
  }
  const first = runs[0].r;
  if (first.analysis === 'op') {
    const xs = vals.values.map((v) => parseValue(v));
    if (xs.some((x) => x === null)) return { error: 'Parameter sweep of an operating point needs numeric values; step models in a transient, AC or DC sweep', errors: [] };
    const pick = (f: (r: SimResult) => Record<string, number[]>) =>
      Object.fromEntries(Object.keys(f(first)).map((k) => [k, runs.map(({ r }) => f(r)[k]?.[0] ?? NaN)]));
    return { ...first, analysis: 'dc', xLabel: `${st.ref} ${st.param}`, xUnit: '', x: xs as number[], v: pick((r) => r.v), i: pick((r) => r.i), warnings: [...new Set(runs.flatMap(({ r }) => r.warnings))], ms: performance.now() - t0 };
  }
  const grid = first.analysis === 'tran'
    ? Array.from({ length: 2001 }, (_, k) => (first.x[first.x.length - 1] * k) / 2000)
    : first.x;
  const map = (r: SimResult, rec: Record<string, number[]> | undefined) =>
    rec ? Object.fromEntries(Object.entries(rec).map(([k, y]) => [k, resample(r.x, y, grid)])) : undefined;
  const steps: StepRun[] = runs.map(({ label, r }) => ({ label, v: map(r, r.v)!, vi: map(r, r.vi), i: map(r, r.i)!, ii: map(r, r.ii) }));
  return { ...first, x: grid, v: steps[0].v, vi: steps[0].vi, i: steps[0].i, ii: steps[0].ii, steps, warnings: [...new Set(runs.flatMap(({ r }) => r.warnings))], ms: performance.now() - t0 };
}

/** Pin currents of a part: the currents into its elements at terminals on that pin's node. */
function pinCurrents(net: SimNet, w: Waveforms, imag: boolean): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const src = imag ? w.ii! : w.i;
  const byName = new Map(net.circuit.elements.map((e) => [e.name, e]));
  for (const [ref, ps] of net.parts) {
    for (const [pin, node] of Object.entries(ps.pinNode)) {
      const acc = new Array(w.x.length).fill(0);
      for (const name of ps.elements) {
        const e = byName.get(name)!;
        terms(e).forEach((t, k) => { if (t === node) src[name][k].forEach((v, j) => { acc[j] += v; }); });
      }
      out[`${ref}.${pin}`] = acc;
    }
  }
  return out;
}

const terms = terminals;

export function simulate(sheet: Sheet): SimResult | SimFailure {
  if (sheet.step?.on) return simulateStepped(sheet);
  const t0 = performance.now();
  const conn = connectivity(sheet);
  const net = buildSimNet(sheet, conn);
  const errors = [...net.errors];
  const plan = planAnalysis(sheet.sim, sheet, errors);
  if (errors.length) return { error: errors[0], errors };
  if (!net.circuit.elements.length) return { error: 'The schematic has no parts to simulate.', errors: [] };
  try {
    const eng = new Engine(net.circuit);
    let w: Waveforms;
    switch (plan.analysis.type) {
      case 'op': {
        const r = eng.op();
        w = { x: [0], v: Object.fromEntries(Object.entries(r.v).map(([k, v]) => [k, [v]])), i: Object.fromEntries(Object.entries(r.i).map(([k, v]) => [k, v.map((x) => [x])])), warnings: r.warnings };
        break;
      }
      case 'tran': w = eng.tran(plan.analysis.tstep, plan.analysis.tstop, undefined, 200000, !!plan.analysis.uic); break;
      case 'ac': w = eng.ac(plan.points!); break;
      case 'dc': {
        const el = eng.element(plan.sweep!.element) as (Element & { kind: 'V' | 'I' }) | (Element & { kind: 'R' });
        if (!el) return { error: `DC sweep: ${plan.sweep!.element} has no simulation element`, errors: [] };
        w = eng.dcSweep(plan.points!, (v) => { if (el.kind === 'R') el.r = Math.max(v, 1e-6); else el.dc = v; });
        break;
      }
    }
    const v: Record<string, number[]> = {}, vi: Record<string, number[]> = {};
    for (const [netName, node] of net.netNode) {
      v[netName] = node === '0' ? w.x.map(() => 0) : w.v[node] ?? w.x.map(() => 0);
      if (w.vi) vi[netName] = node === '0' ? w.x.map(() => 0) : w.vi[node] ?? w.x.map(() => 0);
    }
    return {
      analysis: plan.analysis.type, xLabel: plan.xLabel, xUnit: plan.xUnit, x: w.x, v, vi: w.vi ? vi : undefined,
      i: pinCurrents(net, w, false), ii: w.ii ? pinCurrents(net, w, true) : undefined,
      rails: net.rails, notSimulated: net.notSimulated, warnings: [...net.warnings, ...w.warnings], ms: performance.now() - t0,
    };
  } catch (e) {
    if (e instanceof SimError) return { error: e.message, errors: [] };
    throw e;
  }
}

/** SPICE netlist of the schematic with its analysis (SIM-04 export). */
export function schematicSpice(sheet: Sheet, title = 'NETApps schematic'): string {
  const conn = connectivity(sheet);
  const net = buildSimNet(sheet, conn);
  const errors: string[] = [];
  const plan = planAnalysis(sheet.sim, sheet, errors);
  let analysis: Analysis | undefined = errors.length ? undefined : plan.analysis;
  if (analysis?.type === 'dc') {
    const el = net.circuit.elements.find((e) => e.name === plan.sweep!.element);
    analysis = el ? { ...analysis, source: spiceName(el) } : undefined;
  }
  const st = sheet.step?.on ? sheet.step : undefined;
  const head = [
    `* Exported by NETApps Electric Simulation. Ground is node 0.`,
    ...(st ? [`* Parameter sweep of ${st.ref} ${st.param} (${st.mode === 'list' ? st.list : `${st.start} to ${st.stop}, ${st.mode === 'dec' ? `${st.step} per decade` : `step ${st.step}`}`}): not exported; this netlist has the drawn value.`] : []),
    ...net.rails.map((r) => `* Rail ${r.net} is driven by an ideal ${r.volts} V supply (RAIL_${r.net}).`),
    ...[...net.parts.values()].filter((p) => p.elements.length > 1).map((p) => `* ${p.ref} is modelled by ${p.elements.join(', ')}.`),
  ];
  return toSpice({ ...net.circuit, title }, analysis, []).replace(/^\* .*\n/, `* ${title}\n${head.join('\n')}\n`);
}
