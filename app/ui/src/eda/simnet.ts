// Schematic → simulation circuit (SIM-01, SIM-05). Each part becomes one or more primitive
// elements; the SPICE export (SIM-04) writes exactly these elements.

import type { Circuit, Element } from '../sim/circuit';
import type { Analysis } from '../sim/spice';
import { decadePoints } from '../sim/engine';
import { BJTS, DIODES, LED_COLOURS, MOSFETS, OPAMPS, ZENERS, findModel, ledModel } from './models';
import { railVoltage, symbolOf } from './symbols';
import { connectivity, GND_NET, type Connectivity } from './connectivity';
import { pinPositions, type Part, type Sheet, type SimSettings } from './schematic';
import { parseValue } from './units';

export interface PartSim {
  ref: string;
  elements: string[];
  /** Simulation node of each pin. */
  pinNode: Record<string, string>;
}

export interface SimNet {
  circuit: Circuit;
  /** Net name → simulation node ("0" for ground). */
  netNode: Map<string, string>;
  parts: Map<string, PartSim>;
  notSimulated: string[];
  /** Rails driven by an ideal supply added for a power symbol (SIM-05: said, not hidden). */
  rails: { net: string; volts: number }[];
  errors: string[];
  warnings: string[];
}

export class SimSetupError extends Error {}

function num(text: string | undefined, what: string, errors: string[], fallback = 0): number {
  const v = parseValue(text ?? '');
  if (v === null) { errors.push(`${what}: "${text ?? ''}" is not a value`); return fallback; }
  return v;
}

export function buildSimNet(sheet: Sheet, conn: Connectivity = connectivity(sheet)): SimNet {
  const errors: string[] = [], warnings: string[] = [];
  const netNode = new Map<string, string>();
  for (const n of conn.nets) netNode.set(n.name, n.name === GND_NET ? '0' : n.name);
  const elements: Element[] = [];
  const parts = new Map<string, PartSim>();
  const notSimulated: string[] = [];
  const hasGround = conn.nets.some((n) => n.name === GND_NET);
  if (!hasGround) errors.push('There is no ground symbol. Add GND: every voltage is measured against it.');

  for (const p of sheet.parts) {
    const s = symbolOf(p.sym);
    if (s.power) continue;
    if (!s.simulated) { notSimulated.push(p.ref); continue; }
    const pinNode: Record<string, string> = {};
    for (const pp of pinPositions(p)) {
      const net = conn.pinNet.get(`${p.ref}.${pp.pin}`);
      pinNode[pp.pin] = net ? netNode.get(net)! : `nc_${p.ref}_${pp.pin}`;
    }
    const before = elements.length;
    partElements(p, pinNode, elements, errors);
    parts.set(p.ref, { ref: p.ref, elements: elements.slice(before).map((e) => e.name), pinNode });
  }

  // rails named by power symbols but driven by no voltage source get an ideal supply
  const rails: { net: string; volts: number }[] = [];
  const driven = new Set<string>();
  for (const e of elements) if (e.kind === 'V') { driven.add(e.p); driven.add(e.n); }
  for (const n of conn.nets) {
    if (n.name === GND_NET || !n.power.length) continue;
    const node = netNode.get(n.name)!;
    if (driven.has(node)) continue;
    const v = railVoltage(n.name);
    if (v === null) { warnings.push(`Rail ${n.name} has no voltage source and its name gives no voltage: it floats. Name it like +5V or add a source.`); continue; }
    elements.push({ kind: 'V', name: `RAIL_${n.name}`, p: node, n: '0', dc: v });
    rails.push({ net: n.name, volts: v });
  }
  return { circuit: { title: 'EmbedForge schematic', elements }, netNode, parts, notSimulated, rails, errors, warnings };
}

function partElements(p: Part, pin: Record<string, string>, out: Element[], errors: string[]) {
  const s = symbolOf(p.sym);
  const v = (k: string, what = k) => num(p.props[k], `${p.ref} ${what}`, errors);
  const ref = p.ref;
  switch (s.id) {
    case 'resistor': out.push({ kind: 'R', name: ref, a: pin['1'], b: pin['2'], r: Math.max(v('value', 'resistance'), 1e-6) }); break;
    case 'capacitor': case 'capacitor_pol': out.push({ kind: 'C', name: ref, a: pin['1'], b: pin['2'], c: v('value', 'capacitance') }); break;
    case 'inductor': out.push({ kind: 'L', name: ref, a: pin['1'], b: pin['2'], l: v('value', 'inductance') }); break;
    case 'potentiometer': {
      const r = Math.max(v('value', 'resistance'), 1e-3);
      const pos = Math.min(1, Math.max(0, v('position', 'wiper position') / 100));
      out.push({ kind: 'R', name: `${ref}_A`, a: pin['1'], b: pin['2'], r: Math.max(r * pos, 1e-3) });
      out.push({ kind: 'R', name: `${ref}_B`, a: pin['2'], b: pin['3'], r: Math.max(r * (1 - pos), 1e-3) });
      break;
    }
    case 'vdc': out.push({ kind: 'V', name: ref, p: pin['1'], n: pin['2'], dc: v('value', 'voltage'), acMag: v('ac', 'AC magnitude') || undefined }); break;
    case 'battery': {
      const ri = Math.max(v('rint', 'internal resistance'), 1e-6);
      const mid = `${ref}#i`;
      out.push({ kind: 'V', name: ref, p: mid, n: pin['2'], dc: v('value', 'voltage') });
      out.push({ kind: 'R', name: `${ref}_RINT`, a: pin['1'], b: mid, r: ri });
      break;
    }
    case 'vsin': {
      const off = v('offset'), amp = v('value', 'amplitude'), f = v('freq', 'frequency');
      out.push({ kind: 'V', name: ref, p: pin['1'], n: pin['2'], dc: off, wave: { type: 'sin', vo: off, va: amp, freq: f }, acMag: v('ac', 'AC magnitude') || undefined });
      break;
    }
    case 'vpulse': {
      const hi = v('value', 'high level'), lo = v('low', 'low level'), f = v('freq', 'frequency');
      const duty = Math.min(100, Math.max(0, v('duty', 'duty cycle'))) / 100;
      const per = f > 0 ? 1 / f : 1;
      const edge = Math.max(v('edge', 'rise/fall time'), per * 1e-6, 1e-12);
      const pw = Math.max(per * duty - edge, 0);
      out.push({ kind: 'V', name: ref, p: pin['1'], n: pin['2'], dc: lo, wave: { type: 'pulse', v1: lo, v2: hi, td: v('delay'), tr: edge, tf: edge, pw, per } });
      break;
    }
    case 'idc': out.push({ kind: 'I', name: ref, p: pin['2'], n: pin['1'], dc: v('value', 'current') }); break;
    case 'diode': out.push({ kind: 'D', name: ref, a: pin['2'], k: pin['1'], model: findModel(DIODES, p.props.value).model }); break;
    case 'zener': out.push({ kind: 'D', name: ref, a: pin['2'], k: pin['1'], model: findModel(ZENERS, p.props.value).model }); break;
    case 'led': {
      const c = LED_COLOURS.find((x) => x.name === p.props.colour) ?? LED_COLOURS[0];
      out.push({ kind: 'D', name: ref, a: pin['2'], k: pin['1'], model: ledModel(c.vf) });
      break;
    }
    case 'npn': case 'pnp': out.push({ kind: 'Q', name: ref, c: pin['2'], b: pin['1'], e: pin['3'], model: findModel(BJTS.filter((m) => m.model.type === s.id), p.props.value).model }); break;
    case 'nmos': case 'pmos': out.push({ kind: 'M', name: ref, d: pin['2'], g: pin['1'], s: pin['3'], model: findModel(MOSFETS.filter((m) => m.model.type === s.id), p.props.value).model }); break;
    case 'opamp': {
      const m = findModel(OPAMPS, p.props.value).model;
      const inp = pin['3'], inn = pin['2'], o = pin['6'], vp = pin['7'], vn = pin['4'];
      const n1 = `${ref}#n1`, nh = `${ref}#nh`, nl = `${ref}#nl`, oi = `${ref}#oi`;
      const gm = 1e-3, r1 = m.gain / gm, fp = m.gbw / m.gain;
      const clamp = Math.max(m.railDrop + 0.55, 0);
      const dm = { is: 1e-15, n: 1, rs: 0 };
      out.push(
        { kind: 'R', name: `${ref}_RIN`, a: inp, b: inn, r: m.rin },
        { kind: 'G', name: `${ref}_G1`, p: '0', n: n1, cp: inp, cn: inn, gm },
        { kind: 'R', name: `${ref}_R1`, a: n1, b: '0', r: r1 },
        { kind: 'C', name: `${ref}_C1`, a: n1, b: '0', c: 1 / (2 * Math.PI * r1 * fp) },
        { kind: 'V', name: `${ref}_VH`, p: vp, n: nh, dc: clamp },
        { kind: 'D', name: `${ref}_DH`, a: n1, k: nh, model: dm },
        { kind: 'V', name: `${ref}_VL`, p: nl, n: vn, dc: clamp },
        { kind: 'D', name: `${ref}_DL`, a: nl, k: n1, model: dm },
        { kind: 'E', name: `${ref}_EO`, p: oi, n: '0', cp: n1, cn: '0', gain: 1 },
        { kind: 'R', name: `${ref}_RO`, a: oi, b: o, r: m.rout },
      );
      break;
    }
    case 'switch': out.push({ kind: 'R', name: ref, a: pin['1'], b: pin['2'], r: p.props.closed === 'true' ? 0.01 : 1e9 }); break;
    case 'button': out.push({ kind: 'R', name: ref, a: pin['1'], b: pin['2'], r: p.props.pressed === 'true' ? 0.01 : 1e9 }); break;
    case 'spdt': {
      const b = p.props.position === 'B';
      out.push({ kind: 'R', name: `${ref}_A`, a: pin['1'], b: pin['2'], r: b ? 1e9 : 0.01 });
      out.push({ kind: 'R', name: `${ref}_B`, a: pin['1'], b: pin['3'], r: b ? 0.01 : 1e9 });
      break;
    }
    default: throw new SimSetupError(`no simulation model for ${s.id}`);
  }
}

/** Parts whose value a DC sweep can vary. */
export function sweepTargets(sheet: Sheet): { ref: string; label: string; unit: string }[] {
  return sheet.parts.flatMap((p) => {
    const s = symbolOf(p.sym);
    if (['vdc', 'battery', 'idc', 'resistor'].includes(s.id)) return [{ ref: p.ref, label: `${p.ref} ${s.value.label.toLowerCase()}`, unit: s.value.unit ?? '' }];
    return [];
  });
}

export interface AnalysisPlan {
  analysis: Analysis;
  /** Sweep points for DC (values) and AC (frequencies). */
  points?: number[];
  /** DC sweep: element name and the field it sets. */
  sweep?: { element: string; field: 'dc' | 'r' };
  xLabel: string;
  xUnit: string;
}

export function planAnalysis(sim: SimSettings, sheet: Sheet, errors: string[]): AnalysisPlan {
  const val = (t: string, what: string) => num(t, what, errors, NaN);
  switch (sim.type) {
    case 'op': return { analysis: { type: 'op' }, xLabel: '', xUnit: '' };
    case 'tran': {
      const stop = val(sim.stop, 'Stop time');
      let step = sim.step.trim() ? val(sim.step, 'Time step') : stop / 1000;
      if (!(stop > 0)) errors.push('Stop time must be greater than 0');
      if (!(step > 0)) step = stop / 1000;
      if (stop / step > 100000) errors.push('More than 100 000 time steps: use a larger time step');
      return { analysis: { type: 'tran', tstep: step, tstop: stop }, xLabel: 'Time', xUnit: 's' };
    }
    case 'ac': {
      const f0 = val(sim.fstart, 'Start frequency'), f1 = val(sim.fstop, 'Stop frequency'), pd = val(sim.perDecade, 'Points per decade');
      if (!(f0 > 0 && f1 > f0)) errors.push('AC: the stop frequency must be above the start frequency, both > 0');
      const ppd = Math.max(1, Math.round(pd || 20));
      return { analysis: { type: 'ac', fstart: f0, fstop: f1, perDecade: ppd }, points: f0 > 0 && f1 > f0 ? decadePoints(f0, f1, ppd) : [], xLabel: 'Frequency', xUnit: 'Hz' };
    }
    case 'dc': {
      const part = sheet.parts.find((p) => p.ref === sim.target);
      const start = val(sim.start, 'Sweep start'), stop = val(sim.stop, 'Sweep stop'), step = val(sim.step, 'Sweep step');
      if (!part) { errors.push(`DC sweep: choose a part to sweep (${sim.target || 'none chosen'})`); return { analysis: { type: 'op' }, xLabel: '', xUnit: '' }; }
      const s = symbolOf(part.sym);
      if (!(Math.abs(step) > 0)) errors.push('DC sweep: the step must not be 0');
      else if (Math.abs((stop - start) / step) > 10000) errors.push('DC sweep: more than 10 000 points');
      const points: number[] = [];
      if (Math.abs(step) > 0 && Math.abs((stop - start) / step) <= 10000) {
        const st = (stop - start) * step < 0 ? -step : step;
        const n = Math.floor((stop - start) / st + 1e-9);
        for (let i = 0; i <= n; i++) points.push(start + i * st);
      }
      const field = s.id === 'resistor' ? 'r' : 'dc';
      return {
        analysis: { type: 'dc', source: part.ref, start, stop, step }, points,
        sweep: { element: part.ref, field }, xLabel: `${part.ref} ${s.value.label.toLowerCase()}`, xUnit: s.value.unit ?? '',
      };
    }
  }
}
