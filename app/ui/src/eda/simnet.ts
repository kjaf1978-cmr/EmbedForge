// Schematic → simulation circuit (SIM-01, SIM-05). Each part becomes one or more primitive
// elements; the SPICE export (SIM-04) writes exactly these elements.

import { terminals, type BjtModel, type Circuit, type DiodeModel, type Element, type LogicFn, type MosModel } from '../sim/circuit';
import { importModel } from './spicemodel';
import type { Analysis } from '../sim/spice';
import { decadePoints } from '../sim/engine';
import { ADJ_REGULATORS, AUTOTRANSFORMERS, BJTS, BRIDGES, COMPARATORS, CONTACTORS, CURVE_MAG, DIODES, GATE_DRIVERS, GDTS, IGBTS, LED_COLOURS, MOSFETS, OPAMPS, OPTOS, PV_MODULES, REGULATORS, RELAYS, SHUNT_REFS, TVS, VARISTORS, ZENERS, findModel, ledModel, pvFit, tvsJunction, varistorAlpha } from './models';
import { satCurrent } from '../sim/engine';
import { railVoltage, symbolOf } from './symbols';
import { connectivity, GND_NET, type Connectivity } from './connectivity';
import { pinPositions, sheetTemp, type Part, type Sheet, type SimSettings } from './schematic';
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
  if (!hasGround) {
    const placed = sheet.parts.some((p) => p.sym === 'gnd' && (p.props.value ?? 'GND').trim() === GND_NET);
    errors.push(placed
      ? 'The ground symbol is not connected to anything. Wire it to the circuit: every voltage is measured against it.'
      : 'There is no ground symbol. Add GND: every voltage is measured against it.');
  }
  // nets are keyed by REF.PIN: two parts with one reference would merge their pins
  const refCount = new Map<string, number>();
  for (const p of sheet.parts) if (!symbolOf(p.sym).power) refCount.set(p.ref, (refCount.get(p.ref) ?? 0) + 1);
  for (const [r, n] of refCount) if (n > 1) errors.push(`Reference ${r} is used ${n} times. Use Annotate to renumber, then simulate.`);

  const sheetT = sheetTemp(sheet);
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
    partElements(p, pinNode, elements, errors, warnings, typeof sheetT === 'number' ? sheetT : 27);
    parts.set(p.ref, { ref: p.ref, elements: elements.slice(before).map((e) => e.name), pinNode });
  }

  // logic parts: their supply rail is the drawn net of that name, or an ideal supply
  const rails: { net: string; volts: number }[] = [];
  const hidden = new Set<string>();
  for (const e of elements) if (e.kind === 'X' && e.vcc.startsWith('rail:')) {
    const name = e.vcc.slice(5);
    const node = netNode.get(name);
    if (node) e.vcc = node; else hidden.add(name);
  }
  for (const name of hidden) {
    const v = railVoltage(name);
    if (v === null) { errors.push(`Logic supply rail "${name}" is not drawn and its name gives no voltage: name it like +5V or +3V3.`); continue; }
    elements.push({ kind: 'V', name: `RAIL_${name}`, p: `rail:${name}`, n: '0', dc: v });
    rails.push({ net: name, volts: v });
  }
  // rails named by power symbols but driven by no voltage source get an ideal supply
  const driven = new Set<string>();
  for (const e of elements) if (e.kind === 'V') { driven.add(e.p); driven.add(e.n); }
  // a regulator's output (a power output pin of a part) drives its rail too
  const byRef = new Map(sheet.parts.map((p) => [p.ref, p]));
  const powerOut = (rp: string) => {
    const i = rp.lastIndexOf('.'), part = byRef.get(rp.slice(0, i));
    return !!part && symbolOf(part.sym).pins.find((q) => q.id === rp.slice(i + 1))?.type === 'power_out';
  };
  const supplyIn = (rp: string) => {
    const i = rp.lastIndexOf('.'), part = byRef.get(rp.slice(0, i));
    const t = part && symbolOf(part.sym).pins.find((q) => q.id === rp.slice(i + 1))?.type;
    return t === 'power_in' || t === 'input';
  };
  for (const n of conn.nets) {
    if (n.name === GND_NET || !n.power.length) continue;
    const node = netNode.get(n.name)!;
    if (driven.has(node) || n.pins.some(powerOut)) continue;
    const v = railVoltage(n.name);
    // a rail whose name gives no voltage is driven by the circuit (an emitter follower…); it
    // floats only when every pin on it is a supply input
    if (v === null && !n.pins.every(supplyIn)) continue;
    if (v === null) { warnings.push(`Rail ${n.name} has no voltage source and its name gives no voltage: it floats. Name it like +5V or add a source.`); continue; }
    elements.push({ kind: 'V', name: `RAIL_${n.name}`, p: node, n: '0', dc: v });
    rails.push({ net: n.name, volts: v });
  }
  tieIslands(elements);
  const temp = sheetTemp(sheet);
  if (typeof temp !== 'number') errors.push(temp.error);
  const circuit: Circuit = { title: 'NETApps schematic', elements, ...(typeof temp === 'number' && temp !== 27 ? { temp } : {}) };
  return { circuit, netNode, parts, notSimulated, rails, errors, warnings };
}

/**
 * A group of nodes with no element connecting it to ground (a part left on its own, say) is
 * held only by the tiny shunt conductances, which next to an ordinary conductance is below
 * float64 precision: the matrix is singular in practice. One resistor from one node of each such
 * island to ground fixes that exactly — with a single connection no current can flow through it.
 * Control inputs of controlled sources carry no current and do not join their nodes.
 */
function tieIslands(elements: Element[]) {
  const parent = new Map<string, string>();
  const find = (a: string): string => { let r = a; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!; parent.set(a, r); if (!parent.has(r)) parent.set(r, r); return r; };
  const join = (nodes: string[]) => { if (!nodes.length) return; const r = find(nodes[0]); for (const n of nodes.slice(1)) { const q = find(n); if (q !== r) parent.set(q, r); } };
  for (const e of elements) {
    if (e.kind === 'E' || e.kind === 'G') { join([e.p, e.n]); find(e.cp); find(e.cn); }
    else join(terminals(e));
  }
  const ground = find('0');
  const tied = new Set<string>();
  let k = 0;
  for (const node of [...parent.keys()]) {
    const r = find(node);
    if (r === find(ground) || tied.has(r)) continue;
    tied.add(r);
    elements.push({ kind: 'R', name: `RTIE${++k}`, a: node, b: '0', r: 1e3 });
  }
}

/** Supply of a logic part, resolved in buildSimNet to the net of the rail it names (or to an
 *  ideal supply when no such rail is drawn). */
function logicRail(p: Part): string {
  return `rail:${(p.props.value ?? '+5V').trim() || '+5V'}`;
}

/** `temp`: the circuit temperature in °C (parts whose value depends on it, such as the NTC). */
function partElements(p: Part, pin: Record<string, string>, out: Element[], errors: string[], warnings: string[] = [], temp = 27) {
  const s = symbolOf(p.sym);
  const v = (k: string, what = k) => num(p.props[k], `${p.ref} ${what}`, errors);
  const ref = p.ref;
  // an imported SPICE .model card replaces the chosen generic model
  const custom = <T,>(): T | undefined => {
    const text = p.props.spice?.trim();
    if (!text) return undefined;
    const r = importModel(p.sym, text);
    if ('error' in r) { errors.push(`${ref} SPICE model: ${r.error}`); return undefined; }
    if (r.ignored.length) warnings.push(`${ref} model ${r.name}: ${r.ignored.join(', ')} ignored (no junction capacitance in the simulator).`);
    return r.model as T;
  };
  switch (s.id) {
    case 'resistor': {
      const tc = p.props.tc?.trim() ? v('tc', 'temperature coefficient') : 0;
      out.push({ kind: 'R', name: ref, a: pin['1'], b: pin['2'], r: Math.max(v('value', 'resistance'), 1e-6), ...(tc ? { tc1: tc * 1e-6 } : {}) });
      break;
    }
    case 'capacitor': case 'capacitor_pol': {
      const ic = p.props.ic?.trim() ? parseValue(p.props.ic) : null;
      if (p.props.ic?.trim() && ic === null) errors.push(`${p.ref}: the initial voltage is not a number`);
      out.push({ kind: 'C', name: ref, a: pin['1'], b: pin['2'], c: v('value', 'capacitance'), ...(ic !== null ? { ic } : {}) });
      break;
    }
    case 'inductor': out.push({ kind: 'L', name: ref, a: pin['1'], b: pin['2'], l: v('value', 'inductance') }); break;
    case 'transformer': {
      const ratio = v('value', 'turns ratio'), lp = v('lp', 'primary inductance'), k = v('k', 'coupling');
      if (!(ratio > 0)) errors.push(`${p.ref}: the turns ratio must be above 0`);
      if (!(k > 0 && k <= 1)) errors.push(`${p.ref}: the coupling must be above 0 and at most 1`);
      const a = `${ref}#p`, b = `${ref}#s`;
      out.push(
        { kind: 'R', name: `${ref}_RP`, a: pin['1'], b: a, r: Math.max(v('rp', 'primary resistance'), 1e-6) },
        { kind: 'L', name: `${ref}_LP`, a, b: pin['2'], l: lp },
        { kind: 'R', name: `${ref}_RS`, a: pin['3'], b, r: Math.max(v('rs', 'secondary resistance'), 1e-6) },
        { kind: 'L', name: `${ref}_LS`, a: b, b: pin['4'], l: lp * ratio * ratio },
        { kind: 'K', name: `${ref}_K`, l1: `${ref}_LP`, l2: `${ref}_LS`, k: Math.min(Math.max(k, 1e-6), 1) },
      );
      break;
    }
    case 'relay': {
      const m = findModel(RELAYS, p.props.value).model, inom = m.vcoil / m.rcoil;
      const a = `${ref}#a`, b = `${ref}#b`, sw = { it: 0.5 * inom, ih: 0.25 * inom };
      out.push(
        { kind: 'V', name: `${ref}_VS`, p: pin['1'], n: a, dc: 0 },
        { kind: 'R', name: `${ref}_RC`, a, b, r: m.rcoil },
        { kind: 'L', name: `${ref}_LC`, a: b, b: pin['2'], l: m.lcoil },
        { kind: 'W', name: `${ref}_NO`, p: pin['3'], n: pin['5'], ctrl: `${ref}_VS`, ...sw, ron: 0.05, roff: 1e9 },
        { kind: 'W', name: `${ref}_NC`, p: pin['3'], n: pin['4'], ctrl: `${ref}_VS`, ...sw, ron: 1e9, roff: 0.05 },
      );
      break;
    }
    case 'dcmotor': {
      const k = v('value', 'motor constant'), ra = Math.max(v('ra', 'armature resistance'), 1e-6), la = v('la', 'armature inductance');
      const j = v('j', 'inertia'), b = v('b', 'friction'), tl = v('tl', 'load torque');
      if (!(k > 0)) errors.push(`${p.ref}: the motor constant must be above 0`);
      if (!(j > 0)) errors.push(`${p.ref}: the inertia must be above 0`);
      // mechanical side as a circuit: node w carries the speed in rad/s (1 V = 1 rad/s);
      // torque k·i is a current into w, inertia a capacitor, friction a conductance, load a sink
      const a = `${ref}#a`, e = `${ref}#e`, w = `${ref}#w`;
      out.push(
        { kind: 'R', name: `${ref}_RA`, a: pin['1'], b: a, r: ra },
        { kind: 'L', name: `${ref}_LA`, a, b: e, l: Math.max(la, 1e-9) },
        { kind: 'E', name: `${ref}_EMF`, p: e, n: pin['2'], cp: w, cn: '0', gain: k },
        { kind: 'G', name: `${ref}_GT`, p: '0', n: w, cp: pin['1'], cn: a, gm: k / ra },
        { kind: 'C', name: `${ref}_J`, a: w, b: '0', c: j },
        { kind: 'R', name: `${ref}_B`, a: w, b: '0', r: b > 0 ? 1 / b : 1e12 },
        // speed output, 1 V per 1000 rpm, through 100 Ω (it may be shorted without harm)
        { kind: 'E', name: `${ref}_SPD`, p: `${ref}#t`, n: '0', cp: w, cn: '0', gain: 60 / (2 * Math.PI) / 1000 },
        { kind: 'R', name: `${ref}_RT`, a: `${ref}#t`, b: pin['3'], r: 100 },
      );
      if (tl) out.push({ kind: 'I', name: `${ref}_TL`, p: w, n: '0', dc: tl });
      break;
    }
    case 'motor1': case 'motor3': {
      const slip = v('value', 'slip');
      if (!(slip > 0 && slip <= 1)) errors.push(`${p.ref}: the slip must be above 0 and at most 1`);
      const rs = Math.max(v('rs', 'stator resistance'), 1e-6), rr = Math.max(v('rr', 'rotor resistance'), 1e-6);
      const ls = Math.max(v('ls', 'leakage inductance'), 1e-9), lm = Math.max(v('lm', 'magnetising inductance'), 1e-9);
      const s3 = s.id === 'motor3';
      const phases: [string, string][] = s3 ? [['U', pin['1']], ['V', pin['2']], ['W', pin['3']]] : [['', pin['1']]];
      const star = s3 ? pin['4'] : pin['2'];
      for (const [ph, line] of phases) {
        const a = `${ref}#a${ph}`, m = `${ref}#m${ph}`, r = `${ref}#r${ph}`;
        out.push(
          { kind: 'R', name: `${ref}_RS${ph}`, a: line, b: a, r: rs },
          { kind: 'L', name: `${ref}_LS${ph}`, a, b: m, l: ls },
          { kind: 'L', name: `${ref}_LM${ph}`, a: m, b: star, l: lm },
          { kind: 'L', name: `${ref}_LR${ph}`, a: m, b: r, l: ls },
          { kind: 'R', name: `${ref}_RR${ph}`, a: r, b: star, r: rr / Math.min(Math.max(slip, 1e-4), 1) },
        );
      }
      break;
    }
    case 'servo': {
      out.push(
        { kind: 'P', name: ref, sig: pin['1'], gnd: pin['3'], out: pin['4'], slew: Math.max(v('value', 'speed'), 1) },
        { kind: 'R', name: `${ref}_RSUP`, a: pin['2'], b: pin['3'], r: 500 },
        { kind: 'R', name: `${ref}_RIN`, a: pin['1'], b: pin['3'], r: 100e3 },
      );
      break;
    }
    case 'and2': case 'nand2': case 'or2': case 'nor2': case 'xor2':
      out.push({ kind: 'X', name: ref, fn: s.id.slice(0, -1) as LogicFn, ins: [pin['1'], pin['2']], outs: [pin['3']], vcc: logicRail(p) });
      break;
    case 'not': case 'schmitt':
      out.push({ kind: 'X', name: ref, fn: s.id as LogicFn, ins: [pin['1']], outs: [pin['2']], vcc: logicRail(p) });
      break;
    case 'dff':
      out.push({ kind: 'X', name: ref, fn: 'dff', ins: [pin['1'], pin['2']], outs: [pin['3'], pin['4']], vcc: logicRail(p) });
      break;
    case 'mov': {
      const m = findModel(VARISTORS, p.props.value).model;
      out.push({ kind: 'Z', name: ref, a: pin['1'], b: pin['2'], vn: m.vn, alpha: varistorAlpha(m) });
      break;
    }
    case 'gdt': {
      const m = findModel(GDTS, p.props.value).model;
      out.push({ kind: 'N', name: ref, a: pin['1'], b: pin['2'], vspark: m.vspark, varc: m.varc, ron: m.vspark > 1000 ? 0.002 : 0.02, ihold: m.ihold });
      break;
    }
    case 'breaker1': case 'breaker2': case 'breaker3': case 'breaker4': {
      const inom = v('value', 'rated current'), curve = p.props.curve ?? 'C';
      const pairs = s.id === 'breaker1' ? [['1', '2']] : s.id === 'breaker2' ? [['1', '2'], ['N1', 'N2']] : s.id === 'breaker3' ? [['1', '2'], ['3', '4'], ['5', '6']] : [['1', '2'], ['3', '4'], ['5', '6'], ['N1', 'N2']];
      const idn = s.id === 'breaker2' || s.id === 'breaker4' ? parseValue(p.props.rcd ?? '0') ?? 0 : 0;
      // a few milliohms per pole: 80 mΩ·A / In (16 A: 5 mΩ)
      out.push({ kind: 'Y', name: ref, poles: pairs.map(([a, b]) => ({ a: pin[a], b: pin[b] })), inom, mag: CURVE_MAG[curve] ?? 10, tau: 68, idn, ron: 0.08 / inom, closed: p.props.closed !== 'false' });
      break;
    }
    case 'contactor': {
      const m = findModel(CONTACTORS, p.props.value).model;
      // coil: resistance and inductance; the armature is the coil current, rectified and
      // smoothed (pull-in 5 ms, drop-out time constant 20 ms): 10 V at the rated current
      const c = `${ref}#c`, ep = `${ref}#ep`, em = `${ref}#em`, arm = `${ref}#arm`, ar = `${ref}#ar`;
      const w = 2 * Math.PI * 50, ipk = m.coil === 'ac' ? (Math.SQRT2 * m.vcoil) / Math.hypot(m.rcoil, w * m.lcoil) : m.vcoil / m.rcoil;
      // 12.5 V before the 5 kΩ / 20 kΩ divider of the armature filter: 10 V on it at the rated current
      const g = 12.5 / (ipk * m.rcoil);
      const dm = { is: 1e-15, n: 0.1, rs: 0 };
      out.push(
        { kind: 'R', name: `${ref}_RC`, a: pin.A1, b: c, r: m.rcoil },
        { kind: 'L', name: `${ref}_LC`, a: c, b: pin.A2, l: m.lcoil },
        { kind: 'E', name: `${ref}_EP`, p: ep, n: '0', cp: pin.A1, cn: c, gain: g },
        { kind: 'E', name: `${ref}_EM`, p: em, n: '0', cp: pin.A1, cn: c, gain: -g },
        { kind: 'D', name: `${ref}_DP`, a: ep, k: ar, model: dm, fixedTemp: true },
        { kind: 'D', name: `${ref}_DM`, a: em, k: ar, model: dm, fixedTemp: true },
        { kind: 'R', name: `${ref}_RCH`, a: ar, b: arm, r: 5e3 },
        { kind: 'C', name: `${ref}_CA`, a: arm, b: '0', c: 1e-6 },
        { kind: 'R', name: `${ref}_RA`, a: arm, b: '0', r: 20e3 },
      );
      // pull-in at 8.5 V (85 %), drop-out at 4 V (40 %)
      const sw = (name: string, a: string, b: string, nc = false) => out.push({ kind: 'S', name: `${ref}_${name}`, p: a, n: b, cp: arm, cn: '0', vt: 6.25, vh: 2.25, ron: nc ? 1e9 : 0.002, roff: nc ? 0.002 : 1e9 });
      sw('K1', pin['1'], pin['2']); sw('K2', pin['3'], pin['4']); sw('K3', pin['5'], pin['6']); sw('K4', pin['7'], pin['8']); sw('NO', pin['13'], pin['14']); sw('NC', pin['21'], pin['22'], true);
      break;
    }
    case 'comparator': {
      const m = findModel(COMPARATORS, p.props.value).model;
      const [inp, inn, o, vp, g] = [pin['3'], pin['2'], pin['1'], pin['8'], pin['4']];
      const n1 = `${ref}#n1`, nh = `${ref}#nh`, b = `${ref}#b`, gm = 1e-3, r1 = m.gain / gm;
      const dm = { is: 1e-15, n: 0.1, rs: 0 };
      out.push(
        // the output transistor conducts while − is above +: n1 = gain·(v− − v+), clamped to 0…1 V above GND
        { kind: 'G', name: `${ref}_G1`, p: g, n: n1, cp: inn, cn: inp, gm },
        { kind: 'R', name: `${ref}_R1`, a: n1, b: g, r: r1 },
        // response time: 100 mV overdrive charges the node to 1 V in tresp
        { kind: 'C', name: `${ref}_C1`, a: n1, b: g, c: (gm * 0.1 * m.tresp) / 1 },
        { kind: 'V', name: `${ref}_VH`, p: nh, n: g, dc: 1 },
        { kind: 'D', name: `${ref}_DH`, a: n1, k: nh, model: dm, fixedTemp: true },
        { kind: 'D', name: `${ref}_DL`, a: g, k: n1, model: dm, fixedTemp: true },
        // buffered, so the base current does not load the amplifier node
        { kind: 'E', name: `${ref}_EB`, p: `${ref}#o1`, n: g, cp: n1, cn: g, gain: 1 },
        { kind: 'R', name: `${ref}_RB`, a: `${ref}#o1`, b, r: 1e3 },
        { kind: 'Q', name: `${ref}_Q`, c: o, b, e: g, model: { type: 'npn', is: 1e-14, bf: 100, br: 1, nf: 1, nr: 1 }, fixedTemp: true },
        { kind: 'R', name: `${ref}_RS`, a: vp, b: g, r: 5e3 },
      );
      break;
    }
    case 'pv': {
      const m = findModel(PV_MODULES, p.props.value).model, f = pvFit(m);
      const gIrr = Math.max(v('g', 'irradiance'), 0), ns = Math.max(1, Math.round(v('ns', 'modules in series'))), np = Math.max(1, Math.round(v('np', 'strings in parallel')));
      // N cells in series behave as one diode with N times the emission coefficient; band gap
      // and XTI scale with N too, so the temperature drift is that of one cell
      const N = f.n * m.cells * ns, cellsN = m.cells * ns;
      const isNom = (f.is * np) / satCurrent(1, N, 298.15, 3 * cellsN, 1.12 * cellsN);
      const isc = m.isc * np * (gIrr / 1000) * (1 + m.kIsc * (temp - 25));
      const j = `${ref}#j`;
      out.push(
        { kind: 'I', name: `${ref}_IPH`, p: pin['2'], n: j, dc: isc },
        { kind: 'D', name: `${ref}_D`, a: j, k: pin['2'], model: { is: isNom, n: N, rs: 0, xti: 3 * cellsN, eg: 1.12 * cellsN } },
        { kind: 'R', name: `${ref}_RSH`, a: j, b: pin['2'], r: (f.rsh * ns) / np },
        { kind: 'R', name: `${ref}_RS`, a: j, b: pin['1'], r: Math.max((f.rs * ns) / np, 1e-6) },
      );
      break;
    }
    case 'autotransformer': {
      const m = findModel(AUTOTRANSFORMERS, p.props.value).model;
      const top = m.taps[m.taps.length - 1];
      // magnetising current 2 % of the rated current at 230 V; copper loss 1 %
      const lFull = (top / 230) ** 2 * (230 / (2 * Math.PI * m.f * (0.02 * m.va / 230)));
      const rFull = (0.01 * 230 * 230) / m.va;
      const nodes = [pin.N, ...m.taps.map((_, k) => pin[`T${k + 1}`])];
      const segs: string[] = [];
      for (let k = 0; k < m.taps.length; k++) {
        const share = (m.taps[k] - (k ? m.taps[k - 1] : 0)) / top, mid = `${ref}#s${k}`;
        out.push({ kind: 'R', name: `${ref}_R${k}`, a: nodes[k], b: mid, r: Math.max(rFull * share, 1e-6) }, { kind: 'L', name: `${ref}_L${k}`, a: mid, b: nodes[k + 1], l: lFull * share * share });
        segs.push(`${ref}_L${k}`);
      }
      for (let i = 0; i < segs.length; i++) for (let j2 = i + 1; j2 < segs.length; j2++) out.push({ kind: 'K', name: `${ref}_K${i}_${j2}`, l1: segs[i], l2: segs[j2], k: 0.999 });
      break;
    }
    case 'hbdriver': {
      const m = findModel(GATE_DRIVERS, p.props.value).model;
      const [inp, vcc, com, vb, ho, vs, lo] = [pin['1'], pin['8'], pin['3'], pin['7'], pin['6'], pin['5'], pin['4']];
      const sd = pin['2']?.startsWith('nc_') ? undefined : pin['2']; // optional: unconnected, the driver runs
      // the input (0/5 V), delayed by an RC; HO is on above 3.7 V of it and LO below 1.3 V, so
      // after either edge both are off for τ·(ln 4 − ln(5/3.65)) = 1.07·τ: τ from the dead time
      const u0 = `${ref}#u0`, u = `${ref}#u`, tau = m.dead / 1.07;
      out.push(
        { kind: 'E', name: `${ref}_EIN`, p: u0, n: com, cp: inp, cn: com, gain: 1 },
        { kind: 'R', name: `${ref}_RD`, a: u0, b: u, r: 1e3 },
        { kind: 'C', name: `${ref}_CD`, a: u, b: com, c: tau / 1e3 },
        { kind: 'S', name: `${ref}_SHU`, p: sd ? `${ref}#hs` : vb, n: ho, cp: u, cn: com, vt: 3.7, vh: 0.05, ron: m.ron, roff: 1e9 },
        { kind: 'S', name: `${ref}_SHD`, p: ho, n: vs, cp: com, cn: u, vt: -3.6, vh: 0.05, ron: m.ron, roff: 1e9 },
        { kind: 'S', name: `${ref}_SLU`, p: sd ? `${ref}#ls` : vcc, n: lo, cp: com, cn: u, vt: -1.3, vh: 0.05, ron: m.ron, roff: 1e9 },
        { kind: 'S', name: `${ref}_SLD`, p: lo, n: com, cp: u, cn: com, vt: 1.4, vh: 0.05, ron: m.ron, roff: 1e9 },
        { kind: 'R', name: `${ref}_RQ`, a: vcc, b: com, r: 15e3 },
        { kind: 'R', name: `${ref}_RBQ`, a: vb, b: vs, r: 150e3 },
      );
      // SD low (below 1.75 V; the IR2184's 0.8/2.7 V levels): both outputs off at once
      if (sd) out.push(
        { kind: 'S', name: `${ref}_SSH`, p: vb, n: `${ref}#hs`, cp: sd, cn: com, vt: 1.75, vh: 0.05, ron: 0.01, roff: 1e9 },
        { kind: 'S', name: `${ref}_SSL`, p: vcc, n: `${ref}#ls`, cp: sd, cn: com, vt: 1.75, vh: 0.05, ron: 0.01, roff: 1e9 },
        { kind: 'S', name: `${ref}_SHO`, p: ho, n: vs, cp: com, cn: sd, vt: -1.75, vh: 0.05, ron: m.ron, roff: 1e9 },
        { kind: 'S', name: `${ref}_SLO`, p: lo, n: com, cp: com, cn: sd, vt: -1.75, vh: 0.05, ron: m.ron, roff: 1e9 },
      );
      break;
    }
    case 'vsurge': {
      const vp = v('value', 'peak voltage'), rs = parseValue(p.props.rsrc ?? '2') ?? 2, td = v('delay', 'delay');
      const mid = `${ref}#s`;
      out.push(
        // 1.2/50 µs: 1.037·Vp·(e^(−t/68.2 µs) − e^(−t/0.405 µs))
        { kind: 'V', name: ref, p: mid, n: pin['2'], dc: 0, wave: { type: 'exp', v1: 0, v2: 1.0372 * vp, td1: td, tau1: 0.4042e-6, td2: td, tau2: 68.22e-6 } },
        { kind: 'R', name: `${ref}_RS`, a: mid, b: pin['1'], r: rs },
      );
      break;
    }
    case 'isurge': {
      const ip = v('value', 'peak current'), td = v('delay', 'delay');
      if ((p.props.wave ?? '8/20') === '10/350') {
        out.push({ kind: 'I', name: ref, p: pin['2'], n: pin['1'], dc: 0, wave: { type: 'exp', v1: 0, v2: 1.0514 * ip, td1: td, tau1: 4.064e-6, td2: td, tau2: 470.1e-6 } });
      } else {
        // 8/20 µs (IEC 61000-4-5): i = 0.01243·Ip·t³·e^(−t/3.911 µs), t in µs, sampled
        const pts: [number, number][] = [[0, 0]];
        for (let k = 1; k <= 160; k++) { const t = k < 80 ? k * 0.25 : 20 + (k - 80) * 1.0; pts.push([(td + t * 1e-6), ip * 0.01243 * t ** 3 * Math.exp(-t / 3.911)]); }
        if (td > 0) pts.splice(1, 0, [td, 0]);
        out.push({ kind: 'I', name: ref, p: pin['2'], n: pin['1'], dc: 0, wave: { type: 'pwl', pts } });
      }
      break;
    }
    case 'ntc': {
      // R(T) = R25·exp(B·(1/T − 1/T25)) with T25 = 298.15 K
      const tk = (p.props.temp?.trim() ? v('temp', 'sensed temperature') : temp) + 273.15, r = Math.max(v('value', 'resistance') * Math.exp(v('beta', 'B value') * (1 / tk - 1 / 298.15)), 1e-6);
      out.push({ kind: 'R', name: ref, a: pin['1'], b: pin['2'], r });
      break;
    }
    case 'fuse': out.push({ kind: 'R', name: ref, a: pin['1'], b: pin['2'], r: Math.max(v('r', 'cold resistance'), 1e-6) }); break;
    case 'tvs': {
      const m = findModel(TVS, p.props.value).model;
      if (!m.bidirectional) { out.push({ kind: 'D', name: ref, a: pin['2'], k: pin['1'], model: tvsJunction(m) }); break; }
      // two junctions in anti-series: one conducts forward (about 0.6 V at 10 mA), the other breaks
      // down, so each breaks down 0.6 V below VBR and carries half the clamping resistance
      const mid = `${ref}#m`, j = tvsJunction(m, m.vbr - 0.6), half = { ...j, rs: j.rs / 2 };
      out.push({ kind: 'D', name: `${ref}_D1`, a: pin['2'], k: mid, model: half }, { kind: 'D', name: `${ref}_D2`, a: pin['1'], k: mid, model: half });
      break;
    }
    case 'bridge': {
      const m = findModel(BRIDGES, p.props.value).model;
      const [ac1, ac2, pos, neg] = [pin['1'], pin['2'], pin['3'], pin['4']];
      out.push(
        { kind: 'D', name: `${ref}_D1`, a: ac1, k: pos, model: m }, { kind: 'D', name: `${ref}_D2`, a: ac2, k: pos, model: m },
        { kind: 'D', name: `${ref}_D3`, a: neg, k: ac1, model: m }, { kind: 'D', name: `${ref}_D4`, a: neg, k: ac2, model: m },
      );
      break;
    }
    case 'igbt': {
      // the MOSFET's drain feeds the base of the wide-base PNP: IC = (1 + BF)·IMOS
      const m = findModel(IGBTS, p.props.value).model;
      const b = `${ref}#b`, [g, c, e] = [pin['1'], pin['2'], pin['3']];
      out.push(
        { kind: 'M', name: `${ref}_M`, d: b, g, s: e, model: { type: 'nmos', vto: m.vto, kp: m.kp, lambda: 0.002, w: 1, l: 1, is: 1e-12 } },
        { kind: 'Q', name: `${ref}_Q`, c: e, b, e: c, model: { type: 'pnp', is: m.is, bf: m.bf, br: 1, nf: 1, nr: 1 } },
      );
      if (m.diode) out.push({ kind: 'D', name: `${ref}_D`, a: e, k: c, model: m.diode });
      break;
    }
    case 'opto': {
      // LED, a 1 Ω current sense, and a photocurrent CTR/BF·IF from collector into the base
      const m = findModel(OPTOS, p.props.value).model;
      const ctr = v('ctr', 'current transfer ratio') / 100;
      const sense = `${ref}#s`, b = `${ref}#b`;
      out.push(
        { kind: 'D', name: `${ref}_D`, a: pin['1'], k: sense, model: ledModel(m.vf) },
        { kind: 'R', name: `${ref}_RS`, a: sense, b: pin['2'], r: 1 },
        { kind: 'G', name: `${ref}_G`, p: pin['4'], n: b, cp: sense, cn: pin['2'], gm: ctr / m.bf },
        { kind: 'Q', name: `${ref}_Q`, c: pin['4'], b, e: pin['3'], model: { type: 'npn', is: 1e-14, bf: m.bf, br: 1, nf: 1, nr: 1, vaf: 100 } },
      );
      break;
    }
    case 'tl431': {
      // error amplifier (gain 10⁴) from REF against Vref above the anode, clamped between the
      // anode and 2.5 V above it, buffered, driving an NPN from cathode to anode; a diode
      // conducts in reverse
      const m = findModel(SHUNT_REFS, p.props.value).model;
      const [refPin, a, k] = [pin['1'], pin['2'], pin['3']];
      const r = `${ref}#r`, e = `${ref}#e`, h = `${ref}#h`, o = `${ref}#o`, b = `${ref}#b`;
      const dm = { is: 1e-15, n: 0.1, rs: 0 };
      out.push(
        { kind: 'V', name: `${ref}_VR`, p: r, n: a, dc: m.vref },
        { kind: 'G', name: `${ref}_G`, p: a, n: e, cp: refPin, cn: r, gm: 1e-3 },
        { kind: 'R', name: `${ref}_R1`, a: e, b: a, r: 1e7 },
        { kind: 'D', name: `${ref}_DL`, a, k: e, model: dm, fixedTemp: true },
        { kind: 'V', name: `${ref}_VH`, p: h, n: a, dc: 2.5 },
        { kind: 'D', name: `${ref}_DH`, a: e, k: h, model: dm, fixedTemp: true },
        // unity buffer, so the base current does not load the amplifier (loop gain 1000 A/V)
        { kind: 'E', name: `${ref}_EB`, p: o, n: a, cp: e, cn: a, gain: 1 },
        { kind: 'R', name: `${ref}_RB`, a: o, b, r: 1e3 },
        { kind: 'Q', name: `${ref}_Q`, c: k, b, e: a, model: { type: 'npn', is: 1e-14, bf: 100, br: 1, nf: 1, nr: 1 }, fixedTemp: true },
        { kind: 'D', name: `${ref}_DR`, a, k, model: { is: 1e-14, n: 1, rs: 0.5 }, fixedTemp: true },
      );
      break;
    }
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
      const off = v('offset'), amp = v('value', 'amplitude'), f = v('freq', 'frequency'), ph = p.props.phase ? v('phase') : 0, td = p.props.delay ? v('delay') : 0;
      if (td < 0) errors.push(`${p.ref}: the delay must not be negative`);
      out.push({ kind: 'V', name: ref, p: pin['1'], n: pin['2'], dc: off, wave: { type: 'sin', vo: off, va: amp, freq: f, ...(ph ? { phase: ph } : {}), ...(td > 0 ? { td } : {}) }, acMag: v('ac', 'AC magnitude') || undefined, ...(ph ? { acPhase: ph } : {}) });
      break;
    }
    case 'vsin3': {
      const amp = Math.SQRT2 * v('value', 'phase voltage'), f = v('freq', 'frequency'), acm = v('ac', 'AC magnitude');
      ([['1', 0], ['2', -120], ['3', 120]] as const).forEach(([k, ph], i) => out.push({
        kind: 'V', name: `${ref}_L${i + 1}`, p: pin[k], n: pin['4'], dc: 0,
        wave: { type: 'sin', vo: 0, va: amp, freq: f, ...(ph ? { phase: ph } : {}) }, acMag: acm || undefined, ...(acm && ph ? { acPhase: ph } : {}),
      }));
      break;
    }
    case 'transformer3': {
      const conn = p.props.value ?? 'Dyn', dp = conn[0] === 'D', ds = conn.slice(1).toLowerCase().startsWith('d');
      const vp = v('vp', 'primary line voltage'), vs = v('vs', 'secondary line voltage'), lp = v('lp', 'winding inductance'), k = v('k', 'coupling');
      if (!(vp > 0 && vs > 0)) errors.push(`${p.ref}: the line voltages must be above 0`);
      if (!(k > 0 && k <= 1)) errors.push(`${p.ref}: the coupling must be above 0 and at most 1`);
      // winding voltage: the line voltage across a delta winding, line / √3 across a star winding
      const wp = dp ? vp : vp / Math.sqrt(3), ws = ds ? vs : vs / Math.sqrt(3), n = ws / wp;
      const rp = Math.max(v('rp', 'primary resistance'), 1e-6), rs = Math.max(v('rs', 'secondary resistance'), 1e-6);
      const P = [pin['1'], pin['2'], pin['3']], S = [pin['5'], pin['6'], pin['7']];
      for (let i = 0; i < 3; i++) {
        // delta: winding i between line i and line i+1; star: between line i and the neutral
        const pa = P[i], pb = dp ? P[(i + 1) % 3] : pin['4'];
        const sa = S[i], sb = ds ? S[(i + 1) % 3] : pin['8'];
        const ph = 'UVW'[i], mp = `${ref}#p${ph}`, ms = `${ref}#s${ph}`;
        out.push(
          { kind: 'R', name: `${ref}_RP${ph}`, a: pa, b: mp, r: rp },
          { kind: 'L', name: `${ref}_LP${ph}`, a: mp, b: pb, l: lp },
          { kind: 'R', name: `${ref}_RS${ph}`, a: sa, b: ms, r: rs },
          { kind: 'L', name: `${ref}_LS${ph}`, a: ms, b: sb, l: lp * n * n },
          { kind: 'K', name: `${ref}_K${ph}`, l1: `${ref}_LP${ph}`, l2: `${ref}_LS${ph}`, k: Math.min(Math.max(k, 1e-6), 1) },
        );
      }
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
    case 'diode': out.push({ kind: 'D', name: ref, a: pin['2'], k: pin['1'], model: custom<DiodeModel>() ?? findModel(DIODES, p.props.value).model }); break;
    case 'zener': out.push({ kind: 'D', name: ref, a: pin['2'], k: pin['1'], model: custom<DiodeModel>() ?? findModel(ZENERS, p.props.value).model }); break;
    case 'led': {
      const c = LED_COLOURS.find((x) => x.name === p.props.colour) ?? LED_COLOURS[0];
      out.push({ kind: 'D', name: ref, a: pin['2'], k: pin['1'], model: ledModel(c.vf) });
      break;
    }
    case 'npn': case 'pnp': out.push({ kind: 'Q', name: ref, c: pin['2'], b: pin['1'], e: pin['3'], model: custom<BjtModel>() ?? findModel(BJTS.filter((m) => m.model.type === s.id), p.props.value).model }); break;
    case 'nmos': case 'pmos': {
      const m = custom<MosModel>() ?? findModel(MOSFETS.filter((x) => x.model.type === s.id), p.props.value).model;
      out.push({ kind: 'M', name: ref, d: pin['2'], g: pin['1'], s: pin['3'], model: m });
      // power MOSFETs: their capacitances set the switching edges with the gate resistor
      // free (the MOSFET's own capacitances): a power-on start held them at 0 V, and with a
      // charged bus that shorted every MOSFET (205 kA at t = 0 in the inverter)
      if (m.cgs) out.push({ kind: 'C', name: `${ref}_CGS`, a: pin['1'], b: pin['3'], c: m.cgs, free: true });
      if (m.cgd) out.push({ kind: 'C', name: `${ref}_CGD`, a: pin['1'], b: pin['2'], c: m.cgd, free: true });
      if (m.cds) out.push({ kind: 'C', name: `${ref}_CDS`, a: pin['2'], b: pin['3'], c: m.cds, free: true });
      break;
    }
    case 'opamp': {
      const m = findModel(OPAMPS, p.props.value).model;
      const inp = pin['3'], inn = pin['2'], o = pin['6'], vp = pin['7'], vn = pin['4'];
      const n1 = `${ref}#n1`, nh = `${ref}#nh`, nl = `${ref}#nl`, oi = `${ref}#oi`, rh = `${ref}#rh`, rl = `${ref}#rl`;
      const gm = 1e-3, r1 = m.gain / gm, fp = m.gbw / m.gain;
      // sharp clamp diodes (N = 0.1): their drop stays between 50 and 90 mV from 1 µA to 1 A
      // of overdrive, so the output stops railDrop from each rail and never beyond a rail
      const dm = { is: 1e-15, n: 0.1, rs: 0 };
      const clamp = Math.max(m.railDrop + 0.07, 0), clampLow = Math.max((m.railDropLow ?? m.railDrop) + 0.07, 0);
      out.push(
        { kind: 'R', name: `${ref}_RIN`, a: inp, b: inn, r: m.rin },
        { kind: 'G', name: `${ref}_G1`, p: '0', n: n1, cp: inp, cn: inn, gm },
        { kind: 'R', name: `${ref}_R1`, a: n1, b: '0', r: r1 },
        { kind: 'C', name: `${ref}_C1`, a: n1, b: '0', c: 1 / (2 * Math.PI * r1 * fp) },
        // the clamps follow the rails through buffers: their current returns to ground, not into
        // a supply pin (a saturated amplifier fed its own unpowered rail: found in simulation)
        // (1 Ω each: unpowered, the two clamps overlap; it bounds the current between them)
        { kind: 'E', name: `${ref}_ERH`, p: `${rh}0`, n: '0', cp: vp, cn: '0', gain: 1 },
        { kind: 'R', name: `${ref}_RRH`, a: `${rh}0`, b: rh, r: 1 },
        { kind: 'V', name: `${ref}_VH`, p: rh, n: nh, dc: clamp },
        { kind: 'D', name: `${ref}_DH`, a: n1, k: nh, model: dm, fixedTemp: true },
        { kind: 'E', name: `${ref}_ERL`, p: `${rl}0`, n: '0', cp: vn, cn: '0', gain: 1 },
        { kind: 'R', name: `${ref}_RRL`, a: `${rl}0`, b: rl, r: 1 },
        { kind: 'V', name: `${ref}_VL`, p: nl, n: rl, dc: clampLow },
        { kind: 'D', name: `${ref}_DL`, a: nl, k: n1, model: dm, fixedTemp: true },
        { kind: 'E', name: `${ref}_EO`, p: oi, n: '0', cp: n1, cn: '0', gain: 1 },
        { kind: 'R', name: `${ref}_RO`, a: oi, b: o, r: m.rout },
      );
      break;
    }
    case 'regulator': case 'lm317': {
      const adj = s.id === 'lm317';
      const m = findModel(adj ? ADJ_REGULATORS : REGULATORS, p.props.value).model;
      const vin = adj ? pin['3'] : pin['1'], g = adj ? pin['1'] : pin['2'], vo = adj ? pin['2'] : pin['3'];
      const r = `${ref}#r`, b = `${ref}#b`, h = `${ref}#h`;
      out.push(
        // reference, transconductance error amplifier fed from the input, NPN pass transistor
        { kind: 'V', name: `${ref}_VREF`, p: r, n: g, dc: m.vout },
        { kind: 'G', name: `${ref}_GERR`, p: vin, n: b, cp: r, cn: vo, gm: 0.1 },
        { kind: 'R', name: `${ref}_RBE`, a: b, b: vo, r: 1e4 },
        { kind: 'Q', name: `${ref}_QP`, c: vin, b, e: vo, model: { type: 'npn', is: 1e-13, bf: 100, br: 1, nf: 1, nr: 1 }, fixedTemp: true },
        // dropout: the base cannot rise above IN − dropout + one diode drop
        { kind: 'V', name: `${ref}_VH`, p: vin, n: h, dc: m.dropout },
        { kind: 'D', name: `${ref}_DH`, a: b, k: h, model: { is: 1e-14, n: 1, rs: 0 }, fixedTemp: true },
        { kind: 'R', name: `${ref}_RMIN`, a: vo, b: g, r: 1e5 },
      );
      if (adj) out.push({ kind: 'I', name: `${ref}_IADJ`, p: vin, n: g, dc: m.iq });
      else out.push({ kind: 'R', name: `${ref}_RQ`, a: vin, b: g, r: 7 / m.iq });
      break;
    }
    case 'timer555':
      out.push({ kind: 'T', name: ref, gnd: pin['1'], trig: pin['2'], out: pin['3'], rst: pin['4'], ctrl: pin['5'], thr: pin['6'], dis: pin['7'], vcc: pin['8'] });
      break;
    case 'switch': out.push({ kind: 'R', name: ref, a: pin['1'], b: pin['2'], r: p.props.closed === 'true' ? 0.01 : 1e9 }); break;
    case 'button': out.push({ kind: 'R', name: ref, a: pin['1'], b: pin['2'], r: p.props.pressed === 'true' ? 0.01 : 1e9 }); break;
    case 'spdt': {
      const b = p.props.position === 'B';
      out.push({ kind: 'R', name: `${ref}_A`, a: pin['1'], b: pin['2'], r: b ? 1e9 : 0.01 });
      out.push({ kind: 'R', name: `${ref}_B`, a: pin['1'], b: pin['3'], r: b ? 0.01 : 1e9 });
      break;
    }
    // a terminal is a connection point: nothing to simulate
    case 'terminal': break;
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
      return { analysis: { type: 'tran', tstep: step, tstop: stop, uic: sim.start === 'zero', thin: sim.thin }, xLabel: 'Time', xUnit: 's' };
    }
    case 'ac': {
      const f0 = val(sim.fstart, 'Start frequency'), f1 = val(sim.fstop, 'Stop frequency'), pd = val(sim.perDecade, 'Points per decade');
      if (!(f0 > 0 && f1 >= f0)) errors.push('AC: the stop frequency must not be below the start frequency, both > 0 (equal gives a single frequency)');
      const ppd = Math.max(1, Math.round(pd || 20));
      return { analysis: { type: 'ac', fstart: f0, fstop: f1, perDecade: ppd }, points: f0 > 0 && f1 > f0 ? decadePoints(f0, f1, ppd) : f0 > 0 && f1 === f0 ? [f0] : [], xLabel: 'Frequency', xUnit: 'Hz' };
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
