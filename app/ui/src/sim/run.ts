// Runs a schematic simulation and maps the engine's results back to nets and part pins.

import { Engine, SimError, type Waveforms } from './engine';
import { toSpice, spiceName, type Analysis } from './spice';
import { terminals, type Element } from './circuit';
import { buildSimNet, planAnalysis, type SimNet } from '../eda/simnet';
import { connectivity } from '../eda/connectivity';
import type { Sheet } from '../eda/schematic';

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
}

export interface SimFailure { error: string; errors: string[] }

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
export function schematicSpice(sheet: Sheet, title = 'EmbedForge schematic'): string {
  const conn = connectivity(sheet);
  const net = buildSimNet(sheet, conn);
  const errors: string[] = [];
  const plan = planAnalysis(sheet.sim, sheet, errors);
  let analysis: Analysis | undefined = errors.length ? undefined : plan.analysis;
  if (analysis?.type === 'dc') {
    const el = net.circuit.elements.find((e) => e.name === plan.sweep!.element);
    analysis = el ? { ...analysis, source: spiceName(el) } : undefined;
  }
  const head = [
    `* Exported by EmbedForge. Ground is node 0.`,
    ...net.rails.map((r) => `* Rail ${r.net} is driven by an ideal ${r.volts} V supply (RAIL_${r.net}).`),
    ...[...net.parts.values()].filter((p) => p.elements.length > 1).map((p) => `* ${p.ref} is modelled by ${p.elements.join(', ')}.`),
  ];
  return toSpice({ ...net.circuit, title }, analysis, []).replace(/^\* .*\n/, `* ${title}\n${head.join('\n')}\n`);
}
