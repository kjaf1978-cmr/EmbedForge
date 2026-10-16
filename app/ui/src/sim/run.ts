// Runs a schematic simulation and maps the engine's results back to nets and part pins.

import { Engine, SimError, type Waveforms } from './engine';
import { toSpice, spiceName, type Analysis } from './spice';
import { terminals, type Element } from './circuit';
import { buildSimNet, planAnalysis, type SimNet } from '../eda/simnet';
import { connectivity } from '../eda/connectivity';
import { TEMP_REF, type Sheet, type StepAxis } from '../eda/schematic';
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
  /** Mechanical output of motors and servos by part reference (operating point and transient). */
  mech?: Record<string, Mech>;
}

/** Mechanical quantities of a motor or servo, one value per x point. */
export interface Mech {
  /** rotor: a motor (torque in N·m, speed in rpm); servo: the horn angle in degrees. */
  kind: 'rotor' | 'servo';
  torque?: number[];
  rpm?: number[];
  angle?: number[];
  /** Induction motors: the supply period; their torque is shown averaged over it. */
  period?: number;
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
export function stepValues(st: StepAxis): { values: string[] } | { error: string } {
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
  if (ref === TEMP_REF) return { ...sheet, step: undefined, temp: value };
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
export const MAX_RUNS = 50;

export interface Run { label: string; r: SimResult }

/** Overlays runs on the x axis of the first (a transient on an even grid as fine as its finest run). */
export function overlayRuns(runs: Run[], t0: number): SimResult {
  const first = runs[0].r;
  // a transient: an even grid as fine as the finest run (2000 to 20000 steps), so fast detail
  // (and the FFT of it) survives the overlay
  const nGrid = Math.min(20000, Math.max(2000, ...runs.map(({ r }) => r.x.length - 1)));
  const grid = first.analysis === 'tran'
    ? Array.from({ length: nGrid + 1 }, (_, k) => (first.x[first.x.length - 1] * k) / nGrid)
    : first.x;
  const map = (r: SimResult, rec: Record<string, number[]> | undefined) =>
    rec ? Object.fromEntries(Object.entries(rec).map(([k, y]) => [k, resample(r.x, y, grid)])) : undefined;
  const steps: StepRun[] = runs.map(({ label, r }) => ({ label, v: map(r, r.v)!, vi: map(r, r.vi), i: map(r, r.i)!, ii: map(r, r.ii) }));
  return { ...first, x: grid, v: steps[0].v, vi: steps[0].vi, i: steps[0].i, ii: steps[0].ii, steps, warnings: [...new Set(runs.flatMap(({ r }) => r.warnings))], ms: performance.now() - t0 };
}

const axisLabel = (a: StepAxis, val: string) => (a.ref === TEMP_REF ? `T = ${val} °C` : `${a.ref} ${a.param === 'value' ? '' : `${a.param} `}= ${val}`);

/** Runs the analysis once per combination of the swept values (parameter sweep, .step).
 *  An operating point becomes a sweep over the first property's values (one curve per
 *  combination of the others); other analyses overlay every run. */
export function simulateStepped(sheet: Sheet): SimResult | SimFailure {
  const st = sheet.step!;
  const t0 = performance.now();
  const axes: StepAxis[] = [st, ...(st.more ?? [])];
  const lists: string[][] = [];
  for (const a of axes) {
    if (a.ref !== TEMP_REF && !sheet.parts.some((p) => p.ref === a.ref)) return { error: `Parameter sweep: there is no part ${a.ref || '(none chosen)'}`, errors: [] };
    const vals = stepValues(a);
    if ('error' in vals) return { error: axes.length > 1 ? `${a.ref} ${a.param}: ${vals.error}` : vals.error, errors: [] };
    lists.push(vals.values);
  }
  const total = lists.reduce((n, l) => n * l.length, 1);
  if (total > MAX_RUNS) return { error: `Parameter sweep: ${lists.map((l) => l.length).join(' × ')} = ${total} runs; at most ${MAX_RUNS}`, errors: [] };
  // every combination, the first property varying fastest
  const combos = Array.from({ length: total }, (_, idx) => {
    let rest = idx;
    return lists.map((l) => { const v = l[rest % l.length]; rest = Math.floor(rest / l.length); return v; });
  });
  const runs: { combo: string[]; r: SimResult }[] = [];
  for (const c of combos) {
    let s: Sheet = { ...sheet, step: undefined };
    axes.forEach((a, k) => { s = withProp(s, a.ref, a.param, c[k]); });
    const r = simulate(s);
    if ('error' in r) return { error: `${axes.map((a, k) => axisLabel(a, c[k])).join(', ')}: ${r.error}`, errors: r.errors };
    runs.push({ combo: c, r });
  }
  const first = runs[0].r;
  if (first.analysis === 'op') {
    const xs = lists[0].map((v) => parseValue(v));
    if (xs.some((x) => x === null)) return { error: 'Parameter sweep of an operating point needs numeric values for the first property; step models in a transient, AC or DC sweep', errors: [] };
    const curve = (group: { r: SimResult }[]) => {
      const pick = (f: (r: SimResult) => Record<string, number[]>) =>
        Object.fromEntries(Object.keys(f(first)).map((k) => [k, group.map(({ r }) => f(r)[k]?.[0] ?? NaN)]));
      return { v: pick((r) => r.v), i: pick((r) => r.i) };
    };
    const n0 = lists[0].length;
    const groups: { label: string; v: Record<string, number[]>; i: Record<string, number[]> }[] = [];
    for (let g = 0; g < runs.length / n0; g++) {
      const part = runs.slice(g * n0, (g + 1) * n0);
      groups.push({ label: axes.slice(1).map((a, k) => axisLabel(a, part[0].combo[k + 1])).join(', '), ...curve(part) });
    }
    const base = { ...first, analysis: 'dc' as const, xLabel: st.ref === TEMP_REF ? 'Temperature' : `${st.ref} ${st.param}`, xUnit: st.ref === TEMP_REF ? '°C' : '', x: xs as number[], v: groups[0].v, i: groups[0].i, warnings: [...new Set(runs.flatMap(({ r }) => r.warnings))], ms: performance.now() - t0 };
    return axes.length > 1 ? { ...base, steps: groups } : base;
  }
  return overlayRuns(runs.map(({ combo, r }) => ({ label: axes.map((a, k) => axisLabel(a, combo[k])).join(', '), r })), t0);
}

/** Small seeded random number generator (mulberry32): the same seed gives the same runs. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MC_KINDS: Record<string, 'tolR' | 'tolC' | 'tolL'> = { resistor: 'tolR', potentiometer: 'tolR', capacitor: 'tolC', capacitor_pol: 'tolC', inductor: 'tolL' };

/** The sheets of a tolerance analysis: run 1 is nominal, the others vary every resistor,
 *  capacitor and inductor value within its tolerance. */
export function monteCarloSheets(sheet: Sheet): { label: string; sheet: Sheet }[] | { error: string } {
  const mc = sheet.mc!;
  const n = Number(mc.runs), seed = Number(mc.seed || '1');
  if (!(Number.isInteger(n) && n >= 2 && n <= MAX_RUNS)) return { error: `Tolerance analysis: the number of runs must be from 2 to ${MAX_RUNS}` };
  if (!Number.isFinite(seed)) return { error: 'Tolerance analysis: the seed must be a number' };
  const tol: Record<string, number> = {};
  for (const k of ['tolR', 'tolC', 'tolL'] as const) {
    const t = parseValue(mc[k] || '0');
    if (t === null || t < 0 || t >= 100) return { error: 'Tolerance analysis: tolerances must be from 0 to below 100 %' };
    tol[k] = t / 100;
  }
  const rand = rng(seed);
  // Box–Muller transform: two even random numbers give one standard normal number
  const gauss = () => { const u = Math.max(rand(), 1e-12), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const out: { label: string; sheet: Sheet }[] = [{ label: 'nominal', sheet: { ...sheet, mc: undefined, step: undefined } }];
  for (let k = 2; k <= n; k++) {
    const parts = sheet.parts.map((p) => {
      const kind = MC_KINDS[p.sym];
      const v = kind ? parseValue(p.props.value ?? '') : null;
      if (!kind || v === null || !tol[kind]) return p;
      // d in [−1, 1]: Gaussian with σ = 1/3 (the tolerance is 3 σ) clipped at ±1, or even
      const d = mc.dist === 'gauss' ? Math.max(-1, Math.min(1, gauss() / 3)) : 2 * rand() - 1;
      return { ...p, props: { ...p.props, value: String(v * (1 + tol[kind] * d)) } };
    });
    out.push({ label: `run ${k}`, sheet: { ...sheet, parts, mc: undefined, step: undefined } });
  }
  return out;
}

/** Tolerance analysis: every run overlaid; an operating point gives each result over the runs. */
export function simulateMonteCarlo(sheet: Sheet): SimResult | SimFailure {
  if (sheet.step?.on) return { error: 'Turn off either the parameter sweep or the tolerance analysis: they cannot run together', errors: [] };
  const t0 = performance.now();
  const sheets = monteCarloSheets(sheet);
  if ('error' in sheets) return { error: sheets.error, errors: [] };
  const runs: Run[] = [];
  for (const { label, sheet: s } of sheets) {
    const r = simulate(s);
    if ('error' in r) return { error: `Tolerance analysis, ${label}: ${r.error}`, errors: r.errors };
    runs.push({ label, r });
  }
  const first = runs[0].r;
  if (first.analysis === 'op') {
    const pick = (f: (r: SimResult) => Record<string, number[]>) =>
      Object.fromEntries(Object.keys(f(first)).map((k) => [k, runs.map(({ r }) => f(r)[k]?.[0] ?? NaN)]));
    return { ...first, analysis: 'dc', xLabel: 'Run', xUnit: '', x: runs.map((_, k) => k + 1), v: pick((r) => r.v), i: pick((r) => r.i), warnings: [...new Set(runs.flatMap(({ r }) => r.warnings))], ms: performance.now() - t0 };
  }
  return overlayRuns(runs, t0);
}

/** Torque and speed of the motors and the angle of the servos, from their models' internals:
 *  - DC motor: T = k·i_a (armature current), speed from the speed node ω (1 V = 1 rad/s);
 *  - induction motor: T = P_ag / ω_s with the air-gap power P_ag = Σ i_r²·R_r/s over the
 *    phases and the synchronous speed ω_s = 2π·f/(poles/2); speed (1 − s)·ω_s. f is the
 *    frequency of the sheet's sine source (50 Hz without one);
 *  - servo: the angle behind its 100 Ω output, θ = 100·(v_out − v_gnd) − 10⁴·i_out. */
function mechanics(sheet: Sheet, net: SimNet, w: Waveforms): Record<string, Mech> {
  const out: Record<string, Mech> = {};
  const zero = w.x.map(() => 0);
  const volts = (node: string) => (node === '0' ? zero : w.v[node] ?? zero);
  const cur = (el: string, k = 0) => w.i[el]?.[k] ?? zero;
  const src = sheet.parts.find((p) => p.sym === 'vsin' || p.sym === 'vsin3');
  const f = (src && parseValue(src.props.freq ?? '')) || 50;
  for (const p of sheet.parts) {
    const ps = net.parts.get(p.ref);
    if (!ps) continue;
    const num = (k: string, d: number) => parseValue(p.props[k] ?? '') ?? d;
    if (p.sym === 'dcmotor') {
      const k = num('value', 0), wn = volts(`${p.ref}#w`);
      out[p.ref] = { kind: 'rotor', torque: cur(`${p.ref}_RA`).map((i) => k * i), rpm: wn.map((x) => (x * 60) / (2 * Math.PI)) };
    } else if (p.sym === 'motor1' || p.sym === 'motor3') {
      const slip = Math.min(Math.max(num('value', 0.05), 1e-4), 1), poles = Math.max(2, Math.round(num('poles', 4) / 2) * 2);
      const ws = (2 * Math.PI * f) / (poles / 2);
      const rotor = ps.elements.filter((e) => e.startsWith(`${p.ref}_RR`));
      const rOf = new Map(net.circuit.elements.filter((e) => e.kind === 'R').map((e) => [e.name, (e as { r: number }).r]));
      const pag = w.x.map((_, j) => rotor.reduce((a, e) => a + cur(e)[j] ** 2 * rOf.get(e)!, 0));
      out[p.ref] = { kind: 'rotor', torque: pag.map((x) => x / ws), rpm: w.x.map(() => ((1 - slip) * ws * 60) / (2 * Math.PI)), period: 1 / f };
    } else if (p.sym === 'servo') {
      const vo = volts(ps.pinNode['4']), vg = volts(ps.pinNode['3']), io = cur(p.ref, 2);
      out[p.ref] = { kind: 'servo', angle: w.x.map((_, j) => 100 * (vo[j] - vg[j]) - 1e4 * io[j]) };
    }
  }
  return out;
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

/** Windings across an AC supply are shorts at DC: a transient from the operating point starts
 *  with large DC currents that decay only slowly. Switching on (discharged start) is usually meant. */
function switchOnHint(sheet: Sheet, a: Analysis): string[] {
  if (a.type !== 'tran' || a.uic) return [];
  const wound = sheet.parts.filter((p) => ['transformer', 'transformer3', 'motor1', 'motor3'].includes(p.sym)).map((p) => p.ref);
  return wound.length ? [`${wound.join(', ')}: a transient from the DC operating point treats the windings as short circuits and starts with large DC currents. To switch on at t = 0, choose "discharged capacitors (power-on)".`] : [];
}

export function simulate(sheet: Sheet): SimResult | SimFailure {
  if (sheet.mc?.on) return simulateMonteCarlo(sheet);
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
      case 'tran': w = eng.tran(plan.analysis.tstep, plan.analysis.tstop, undefined, 200000, !!plan.analysis.uic, !!plan.analysis.thin); break;
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
    const mech = plan.analysis.type === 'op' || plan.analysis.type === 'tran' ? mechanics(sheet, net, w) : undefined;
    return {
      ...(mech && Object.keys(mech).length ? { mech } : {}),
      analysis: plan.analysis.type, xLabel: plan.xLabel, xUnit: plan.xUnit, x: w.x, v, vi: w.vi ? vi : undefined,
      i: pinCurrents(net, w, false), ii: w.ii ? pinCurrents(net, w, true) : undefined,
      rails: net.rails, notSimulated: net.notSimulated, warnings: [...net.warnings, ...w.warnings, ...switchOnHint(sheet, plan.analysis)], ms: performance.now() - t0,
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
    ...(sheet.mc?.on ? [`* Tolerance analysis (${sheet.mc.runs} runs, R ${sheet.mc.tolR} %, C ${sheet.mc.tolC} %, L ${sheet.mc.tolL} %): not exported; this netlist has the nominal values.`] : []),
    ...(st ? [`* Parameter sweep of ${st.ref === TEMP_REF ? 'the temperature' : `${st.ref} ${st.param}`} (${st.mode === 'list' ? st.list : `${st.start} to ${st.stop}, ${st.mode === 'dec' ? `${st.step} per decade` : `step ${st.step}`}`}): not exported; this netlist has the drawn value.`] : []),
    ...net.rails.map((r) => `* Rail ${r.net} is driven by an ideal ${r.volts} V supply (RAIL_${r.net}).`),
    ...[...net.parts.values()].filter((p) => p.elements.length > 1).map((p) => `* ${p.ref} is modelled by ${p.elements.join(', ')}.`),
  ];
  return toSpice({ ...net.circuit, title }, analysis, []).replace(/^\* .*\n/, `* ${title}\n${head.join('\n')}\n`);
}
