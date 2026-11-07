// KiCad export of a design's board (decision D43): the parts that sit on the board, one
// footprint per package (the units of a multi-unit IC on their own pins), every pad with its
// net, the net classes for power and for mains clearances, and a first placement taken from
// the schematic. The board is then placed and routed in KiCad (tools/kicad), checked with
// KiCad's design rule check, and its fabrication files come from kicad-cli.

import type { Part, Sheet } from '../eda/schematic';
import { packageRef } from '../eda/schematic';
import { symbolOf } from '../eda/symbols';
import { connectivity, GND_NET } from '../eda/connectivity';
import { footprintOf, logicFamily, pinsWithoutPad } from './library';
import { FOOTPRINTS, type Footprint, type Pad } from './footprint';

/** The pads of each unit of a multi-unit IC, by the symbol's pin ids (unit A first), and the
 *  package's supply pads (by the symbol pin that carries them in every unit). From the
 *  datasheets' pin-outs. */
interface UnitTable { footprint: string; units: Record<string, string>[]; supply: Record<string, string[]> }
const LM339: UnitTable = { footprint: 'DIP-14', units: [{ 1: '2', 2: '4', 3: '5' }, { 1: '1', 2: '6', 3: '7' }, { 1: '14', 2: '8', 3: '9' }, { 1: '13', 2: '10', 3: '11' }], supply: { 8: ['3'], 4: ['12'] } };
const LM393: UnitTable = { footprint: 'DIP-8', units: [{ 1: '1', 2: '2', 3: '3' }, { 1: '7', 2: '6', 3: '5' }], supply: { 8: ['8'], 4: ['4'] } };
// op-amps: symbol pins 2 −, 3 +, 6 OUT; supplies 7 V+, 4 V−
const DUAL_OA: UnitTable = { footprint: 'DIP-8', units: [{ 6: '1', 2: '2', 3: '3' }, { 6: '7', 2: '6', 3: '5' }], supply: { 7: ['8'], 4: ['4'] } };
const QUAD_OA: UnitTable = { footprint: 'DIP-14', units: [{ 6: '1', 2: '2', 3: '3' }, { 6: '7', 2: '6', 3: '5' }, { 6: '8', 2: '9', 3: '10' }, { 6: '14', 2: '13', 3: '12' }], supply: { 7: ['4'], 4: ['11'] } };
// CD4000 logic (VDD 14, VSS 7): the gates' pins 1, 2 in and 3 out (nor2 …), the flip-flops' 1 D,
// 2 CLK, 3 Q, 4 Q̄ with RESET and SET to VSS
const CD_GATES4 = (u: [string, string, string][]): Record<string, string>[] => u.map(([a, b, y]) => ({ 1: a, 2: b, 3: y }));
const CD: Record<string, { units: Record<string, string>[]; vss?: string[] }> = {
  nor2: { units: CD_GATES4([['1', '2', '3'], ['5', '6', '4'], ['8', '9', '10'], ['12', '13', '11']]) }, // CD4001
  or2: { units: CD_GATES4([['1', '2', '3'], ['5', '6', '4'], ['8', '9', '10'], ['12', '13', '11']]) }, // CD4071
  and2: { units: CD_GATES4([['1', '2', '3'], ['5', '6', '4'], ['8', '9', '10'], ['12', '13', '11']]) }, // CD4081
  nand2: { units: CD_GATES4([['1', '2', '3'], ['5', '6', '4'], ['8', '9', '10'], ['12', '13', '11']]) }, // CD4011
  xor2: { units: CD_GATES4([['1', '2', '3'], ['5', '6', '4'], ['8', '9', '10'], ['12', '13', '11']]) }, // CD4070
  not: { units: [['1', '2'], ['3', '4'], ['5', '6'], ['9', '8'], ['11', '10'], ['13', '12']].map(([a, y]) => ({ 1: a, 2: y })) }, // CD4069UB
  schmitt: { units: [['1', '2'], ['3', '4'], ['5', '6'], ['9', '8'], ['11', '10'], ['13', '12']].map(([a, y]) => ({ 1: a, 2: y })) }, // CD40106
  dff: { units: [{ 1: '5', 2: '3', 3: '1', 4: '2' }, { 1: '9', 2: '11', 3: '13', 4: '12' }], vss: ['4', '6', '10', '8'] }, // CD4013
};
// 74HC logic (VCC 14, GND 7)
const HC: Record<string, { units: Record<string, string>[]; vcc?: string[] }> = {
  nor2: { units: CD_GATES4([['2', '3', '1'], ['5', '6', '4'], ['8', '9', '10'], ['11', '12', '13']]) }, // 74HC02
  and2: { units: CD_GATES4([['1', '2', '3'], ['4', '5', '6'], ['9', '10', '8'], ['12', '13', '11']]) },
  nand2: { units: CD_GATES4([['1', '2', '3'], ['4', '5', '6'], ['9', '10', '8'], ['12', '13', '11']]) },
  or2: { units: CD_GATES4([['1', '2', '3'], ['4', '5', '6'], ['9', '10', '8'], ['12', '13', '11']]) },
  xor2: { units: CD_GATES4([['1', '2', '3'], ['4', '5', '6'], ['9', '10', '8'], ['12', '13', '11']]) },
  not: { units: [['1', '2'], ['3', '4'], ['5', '6'], ['9', '8'], ['11', '10'], ['13', '12']].map(([a, y]) => ({ 1: a, 2: y })) },
  schmitt: { units: [['1', '2'], ['3', '4'], ['5', '6'], ['9', '8'], ['11', '10'], ['13', '12']].map(([a, y]) => ({ 1: a, 2: y })) },
  dff: { units: [{ 1: '2', 2: '3', 3: '5', 4: '6' }, { 1: '12', 2: '11', 3: '9', 4: '8' }], vcc: ['1', '4', '13', '10'] }, // 74HC74
};

function unitTable(p: Part): UnitTable | null {
  const s = symbolOf(p.sym), v = p.props[s.value.key] ?? s.value.default;
  if (s.id === 'comparator') return v === 'LM339' ? LM339 : LM393;
  if (s.id === 'opamp') return v === 'TL074' || v === 'LM324' ? QUAD_OA : DUAL_OA;
  if (s.logic) {
    if (logicFamily(v) === 'CD') { const t = CD[s.id]; return t ? { footprint: 'DIP-14', units: t.units, supply: { __rail: ['14'], __gnd: ['7', ...(t.vss ?? [])] } } : null; }
    const t = HC[s.id];
    return t ? { footprint: 'DIP-14', units: t.units, supply: { __rail: ['14', ...(t.vcc ?? [])], __gnd: ['7'] } } : null;
  }
  return null;
}

/** A part as it sits on the board: one per package. */
export interface BoardPart {
  ref: string;
  value: string;
  footprint: Footprint;
  /** Pad id → net (pads absent here are not connected). */
  pads: Record<string, string>;
  /** Mean position of its units on the schematic (drawing units). */
  sx: number;
  sy: number;
  note?: string;
}

/** One wire of the panel: a net between panel devices' terminals and, where the control board
 *  takes part, the pole of the board's panel connector. */
export interface PanelWire { net: string; ends: string[]; board?: string }

export interface BoardNetlist { parts: BoardPart[]; nets: string[]; warnings: string[]; panel: PanelWire[] }

export interface BoardOptions {
  /** Parts that sit on the panel (DIN rail, heatsink, chassis), wired with cable, not on the
   *  board: breakers, contactors, power terminals, high-current parts. Their nets that reach the
   *  board end on a generated screw-terminal connector (J_PANEL, 5.08 mm). */
  panel?: (p: Part) => boolean;
  /** Mains nets: a terminal block or an off-board transformer with one of them on a pad takes
   *  the 7.62 mm variant of its footprint (the pads 5 mm apart). */
  mains?: Set<string>;
}

/** The mains variant of a footprint for a part with a mains net on a pad. */
function mainsVariant(f: Footprint, sym: string): Footprint {
  if (sym === 'transformer' && f.id === 'TerminalBlock_1x4') return FOOTPRINTS['Transformer_Wires_P7.62'];
  return FOOTPRINTS[`${f.id}_P7.62`] ?? f;
}

/** The board's parts and nets from the schematic: test-bench parts (scope "test") are left out,
 *  so their nets end at the product's connectors; the units of one package become one part. */
export function boardNetlist(sheet: Sheet, o: BoardOptions = {}): BoardNetlist {
  const c = connectivity(sheet);
  const net = (ref: string, pin: string) => c.pinNet.get(`${ref}.${pin}`);
  const warnings: string[] = [];
  const parts: BoardPart[] = [];
  const all = sheet.parts.filter((p) => p.props.scope !== 'test' && !symbolOf(p.sym).power && symbolOf(p.sym).id !== 'netlabel');
  const onPanel = all.filter((p) => o.panel?.(p));
  const product = all.filter((p) => !o.panel?.(p));
  const pkgs = new Map<string, Part[]>();
  for (const p of product) {
    const t = p.props.pkg ? unitTable(p) : null;
    if (t) { const k = packageRef(p); pkgs.set(k, [...(pkgs.get(k) ?? []), p]); continue; }
    const f = footprintOf(p);
    if (!f) { warnings.push(`${p.ref} (${p.sym}): no footprint, left off the board`); continue; }
    // an IC without a pkg property that a table knows sits alone in its package (unit A)
    const pads: Record<string, string> = {};
    for (const [pin, ps] of Object.entries(f.choice.pins)) { const n = net(p.ref, pin); if (n) for (const pad of ps) pads[pad] = n; }
    const s = symbolOf(p.sym), v = p.props[s.value.key] ?? s.value.default;
    if (f.choice.rail?.length) for (const pad of f.choice.rail) pads[pad] = v;
    if (f.choice.gnd?.length) for (const pad of f.choice.gnd) pads[pad] = GND_NET;
    const lost = pinsWithoutPad(p, f.choice).filter((pin) => { const n = net(p.ref, pin); return n && !n.startsWith('nc_'); });
    if (lost.length && !['dcmotor', 'servo'].includes(p.sym)) warnings.push(`${p.ref}: pins ${lost.join(', ')} have no pad`);
    const fp = o.mains && Object.values(pads).some((n) => o.mains!.has(n)) ? mainsVariant(f.fp, p.sym) : f.fp;
    parts.push({ ref: p.ref, value: v, footprint: fp, pads, sx: p.x, sy: p.y, note: f.choice.note });
  }
  for (const [ref, units] of pkgs) {
    const t = unitTable(units[0])!;
    const s = symbolOf(units[0].sym), v = units[0].props[s.value.key] ?? s.value.default;
    // units in reference order (U3A, U3B …): the annotation lettered them in drawing order
    units.sort((a, b) => a.ref.localeCompare(b.ref));
    if (units.length > t.units.length) warnings.push(`${ref}: ${units.length} units in a package of ${t.units.length}`);
    const pads: Record<string, string> = {};
    units.slice(0, t.units.length).forEach((u, k) => { for (const [pin, pad] of Object.entries(t.units[k])) { const n = net(u.ref, pin); if (n) pads[pad] = n; } });
    // supply pins: the nets the units' supply pins are on (all units agree), or the logic rail
    for (const [pin, ps] of Object.entries(t.supply)) {
      const n = pin === '__rail' ? v : pin === '__gnd' ? GND_NET : net(units[0].ref, pin);
      if (!n) continue;
      for (const u of units) { const m: string | undefined = pin.startsWith('__') ? n : net(u.ref, pin); if (m !== n) warnings.push(`${ref}: units on different supplies (${n}, ${m})`); }
      for (const pad of ps) pads[pad] = n;
    }
    // the inputs of an unused unit go to the package's negative supply (no floating input)
    const low = pads[t.supply['4']?.[0] ?? t.supply.__gnd?.[0] ?? ''] ?? GND_NET;
    for (let k = units.length; k < t.units.length; k++) for (const [pin, pad] of Object.entries(t.units[k])) {
      const isOut = (s.id === 'comparator' && pin === '1') || (s.id === 'opamp' && pin === '6') || (s.logic && ((t.units[k]['3'] && pin === '3') || (!t.units[k]['3'] && pin === '2') || (s.id === 'dff' && pin === '4')));
      if (s.id === 'opamp' && pin === '2') pads[pad] = `${ref}_SPARE${k}`; // follower: − to its output
      else if (s.id === 'opamp' && pin === '6') pads[pad] = `${ref}_SPARE${k}`;
      else if (!isOut) pads[pad] = low;
    }
    parts.push({ ref, value: v, footprint: FOOTPRINTS[t.footprint], pads, sx: units.reduce((a, u) => a + u.x, 0) / units.length, sy: units.reduce((a, u) => a + u.y, 0) / units.length, note: `${units.length} of ${t.units.length} units` });
  }
  // the panel: its devices' terminals per net, and a connector pole where the board takes part
  const panel: PanelWire[] = [];
  if (onPanel.length) {
    const ends = new Map<string, string[]>();
    for (const p of onPanel) for (const pin of symbolOf(p.sym).pins) {
      const n = net(p.ref, pin.id);
      if (n && !n.startsWith('nc_')) ends.set(n, [...(ends.get(n) ?? []), `${p.ref}:${pin.name || pin.id}`]);
    }
    const onBoard = new Set(parts.flatMap((p) => Object.values(p.pads)));
    const shared = [...ends.keys()].filter((n) => onBoard.has(n)).sort();
    if (shared.length) {
      const poles = [1, 2, 3, 4, 6, 8, 12, 14].find((k) => k >= shared.length) ?? 14;
      const fp = FOOTPRINTS[`TerminalBlock_1x${poles}${shared.some((n) => o.mains?.has(n)) ? '_P7.62' : ''}`];
      if (shared.length > 14) warnings.push(`panel connector: ${shared.length} poles, more than one 14-pole block`);
      const pads: Record<string, string> = {};
      shared.slice(0, 14).forEach((n, k) => { pads[String(k + 1)] = n; });
      const sx = Math.min(...product.map((p) => p.x)), sy = product.reduce((a, p) => a + p.y, 0) / Math.max(product.length, 1);
      parts.push({ ref: 'J_PANEL', value: 'to the panel', footprint: fp, pads, sx, sy, note: 'screw terminals to the panel wiring' });
    }
    for (const [n, e] of [...ends].sort(([a], [b]) => a.localeCompare(b))) {
      const k = shared.indexOf(n);
      panel.push({ net: n, ends: e, ...(k >= 0 && k < 14 ? { board: `J_PANEL:${k + 1}` } : {}) });
    }
  }
  const nets = [...new Set(parts.flatMap((p) => Object.values(p.pads)))].sort();
  // a net on one pad only is a dangling end on the board (a test-bench connection, a probe)
  const count = new Map<string, number>();
  for (const p of parts) for (const n of Object.values(p.pads)) count.set(n, (count.get(n) ?? 0) + 1);
  for (const [n, k] of count) if (k === 1 && !n.startsWith('nc_')) warnings.push(`net ${n} reaches one pad only`);
  return { parts, nets, warnings, panel };
}

/** The pins of a part that are galvanically one side of it: an isolating part (transformer,
 *  optocoupler, relay, contactor) has several sides, every other part one. */
function sides(p: Part): string[][] | null {
  const pins = symbolOf(p.sym).pins.map((x) => x.id);
  switch (p.sym) {
    case 'transformer': return [['1', '2'], ['3', '4']];
    case 'transformer3': return [pins.filter((x) => x.startsWith('1')), pins.filter((x) => x.startsWith('2'))];
    case 'opto': return [['1', '2'], ['3', '4']];
    case 'relay': return [['1', '2'], ['3', '4', '5']];
    case 'contactor': return [['A1', 'A2'], ['1', '2'], ['3', '4'], ['5', '6'], ['7', '8'], ['13', '14'], ['21', '22']];
    default: return null;
  }
}

/** The nets at the potential of the seed nets: everything reached from them through the parts
 *  on the board, a transformer, optocoupler, relay or contactor only within one of its sides
 *  (its insulation is the barrier). Test-bench parts are not on the board and do not join. */
export function potentialGroup(sheet: Sheet, seeds: string[]): Set<string> {
  const c = connectivity(sheet);
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => { if (a === b) return; adj.set(a, (adj.get(a) ?? new Set()).add(b)); adj.set(b, (adj.get(b) ?? new Set()).add(a)); };
  for (const p of sheet.parts) {
    if (p.props.scope === 'test' || symbolOf(p.sym).power) continue;
    const groups = sides(p) ?? [symbolOf(p.sym).pins.map((x) => x.id)];
    for (const g of groups) {
      const nets = g.map((pin) => c.pinNet.get(`${p.ref}.${pin}`)).filter((n): n is string => !!n && !n.startsWith('nc_'));
      for (const n of nets) link(nets[0], n);
    }
  }
  const seen = new Set<string>(), todo = [...seeds];
  while (todo.length) { const n = todo.pop()!; if (seen.has(n)) continue; seen.add(n); for (const m of adj.get(n) ?? []) todo.push(m); }
  return seen;
}

/** A net class for the nets of a potential group (exact names). */
export function classFor(name: string, nets: Iterable<string>, track: number, clearance: number): NetClass {
  return { name, patterns: [...nets].map((n) => `^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), track, clearance };
}

// ---------------------------------------------------------------- KiCad files

const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const f3 = (v: number) => (Math.round(v * 1000) / 1000).toString();
let uuidN = 0;
const uuid = () => { uuidN++; const h = uuidN.toString(16).padStart(12, '0'); return `00000000-0000-4000-8000-${h}`; };

function padSexpr(p: Pad, netNo: Map<string, number>, net?: string): string {
  const shape = p.shape === 'rect' ? 'rect' : p.shape === 'oval' ? 'oval' : 'circle';
  const kind = p.drill ? 'thru_hole' : 'smd';
  const layers = p.drill ? '"*.Cu" "*.Mask"' : '"F.Cu" "F.Paste" "F.Mask"';
  const drill = p.drill ? ` (drill ${f3(p.drill)})` : '';
  const n = net !== undefined ? ` (net ${netNo.get(net)} ${q(net)})` : '';
  return `    (pad ${q(p.id)} ${kind} ${shape} (at ${f3(p.x)} ${f3(p.y)}) (size ${f3(p.w)} ${f3(p.h)})${drill} (layers ${layers})${n} (tstamp ${uuid()}))`;
}

/** A footprint as a KiCad footprint block placed at (x, y), rotated by rot degrees. */
function footprintSexpr(bp: BoardPart, x: number, y: number, rot: number, netNo: Map<string, number>): string {
  const f = bp.footprint;
  const out: string[] = [];
  out.push(`  (footprint ${q(`NETApps:${f.id}`)} (layer "F.Cu") (tstamp ${uuid()})`);
  out.push(`    (at ${f3(x)} ${f3(y)}${rot ? ` ${rot}` : ''})`);
  out.push(`    (descr ${q(f.description)})`);
  if (bp.note) out.push(`    (property "Note" ${q(bp.note)})`);
  out.push(`    (fp_text reference ${q(bp.ref)} (at 0 ${f3(f.courtyard.y0 - 1)}${rot ? ` ${rot}` : ''}) (layer "F.SilkS") (tstamp ${uuid()}) (effects (font (size 1 1) (thickness 0.15))))`);
  out.push(`    (fp_text value ${q(bp.value)} (at 0 ${f3(f.courtyard.y1 + 1)}${rot ? ` ${rot}` : ''}) (layer "F.Fab") (tstamp ${uuid()}) (effects (font (size 1 1) (thickness 0.15))))`);
  for (const s of f.silk) {
    if (s.t === 'line') out.push(`    (fp_line (start ${f3(s.x1)} ${f3(s.y1)}) (end ${f3(s.x2)} ${f3(s.y2)}) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (tstamp ${uuid()}))`);
    else out.push(`    (fp_circle (center ${f3(s.x)} ${f3(s.y)}) (end ${f3(s.x + s.r)} ${f3(s.y)}) (stroke (width 0.12) (type solid)) (fill none) (layer "F.SilkS") (tstamp ${uuid()}))`);
  }
  const c = f.courtyard, b = f.body;
  out.push(`    (fp_rect (start ${f3(c.x0)} ${f3(c.y0)}) (end ${f3(c.x1)} ${f3(c.y1)}) (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd") (tstamp ${uuid()}))`);
  out.push(`    (fp_rect (start ${f3(b.x0)} ${f3(b.y0)}) (end ${f3(b.x1)} ${f3(b.y1)}) (stroke (width 0.1) (type solid)) (fill none) (layer "F.Fab") (tstamp ${uuid()}))`);
  for (const p of f.pads) out.push(padSexpr(p, netNo, bp.pads[p.id]));
  out.push('  )');
  return out.join('\n');
}

/** A footprint alone, as a .kicad_mod file (for a KiCad library of the app's footprints). */
export function kicadMod(f: Footprint): string {
  const bp: BoardPart = { ref: 'REF**', value: f.id, footprint: f, pads: {}, sx: 0, sy: 0 };
  return footprintSexpr(bp, 0, 0, 0, new Map()).replace(/^ {2}\(footprint "NETApps:([^"]+)" \(layer "F.Cu"\) \(tstamp [^)]+\)\n {4}\(at 0 0\)/, '(footprint "$1" (version 20221018) (generator "netapps") (layer "F.Cu")');
}

/** Net classes: patterns on net names (regular expressions), widths and clearances in mm. */
export interface NetClass { name: string; patterns: string[]; track: number; clearance: number; via?: { d: number; drill: number } }

export interface Placed { ref: string; x: number; y: number; rot: 0 | 90 | 180 | 270 }

export interface KicadBoardOptions {
  title: string;
  revision?: string;
  classes?: NetClass[];
  /** Board size (mm); from the parts' area when absent. */
  w?: number;
  h?: number;
  /** Positions (mm) from an earlier placement; the rest are placed from the schematic. */
  placed?: Placed[];
  /** Copper weight in oz (1 or 2). */
  copperOz?: number;
  /** Board area over the parts' courtyard area (when no size is given). */
  fill?: number;
}

/** First placement: the schematic's arrangement scaled onto the board, then each part moved
 *  to the nearest free spot (courtyards 1 mm apart), largest parts first. */
export function placeFromSchematic(parts: BoardPart[], w: number, h: number, margin = 5): Placed[] {
  const xs = parts.map((p) => p.sx), ys = parts.map((p) => p.sy);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (w - 2 * margin) / Math.max(x1 - x0, 1), sy = (h - 2 * margin) / Math.max(y1 - y0, 1);
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const out: Placed[] = [];
  const order = [...parts].sort((a, b) => area(b.footprint) - area(a.footprint));
  for (const p of order) {
    const c = p.footprint.courtyard;
    const tx = margin + (p.sx - x0) * sx, ty = margin + (p.sy - y0) * sy;
    let best: [number, number] | null = null;
    for (let r = 0; r < Math.max(w, h) && !best; r += 0.5) {
      const steps = Math.max(1, Math.ceil((2 * Math.PI * r) / 0.5));
      for (let k = 0; k < steps; k++) {
        const x = Math.round((tx + r * Math.cos((2 * Math.PI * k) / steps)) * 4) / 4, y = Math.round((ty + r * Math.sin((2 * Math.PI * k) / steps)) * 4) / 4;
        const b = { x0: x + c.x0 - 0.5, y0: y + c.y0 - 0.5, x1: x + c.x1 + 0.5, y1: y + c.y1 + 0.5 };
        if (b.x0 < 1 || b.y0 < 1 || b.x1 > w - 1 || b.y1 > h - 1) continue;
        if (boxes.some((o) => b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1)) continue;
        best = [x, y]; break;
      }
    }
    if (!best) throw new Error(`placement: no room for ${p.ref} on ${w} × ${h} mm`);
    boxes.push({ x0: best[0] + c.x0 - 0.5, y0: best[1] + c.y0 - 0.5, x1: best[0] + c.x1 + 0.5, y1: best[1] + c.y1 + 0.5 });
    out.push({ ref: p.ref, x: best[0], y: best[1], rot: 0 });
  }
  return out;
}

const area = (f: Footprint) => (f.courtyard.x1 - f.courtyard.x0 + 1) * (f.courtyard.y1 - f.courtyard.y0 + 1);

/** The board size for a set of parts: their courtyard area times `fill`, at 3 : 2. */
export function boardSize(parts: BoardPart[], fill = 2.2): { w: number; h: number } {
  const a = parts.reduce((s, p) => s + area(p.footprint), 0) * fill;
  const h = Math.ceil(Math.sqrt(a / 1.5) / 5) * 5, w = Math.ceil((a / h) / 5) * 5;
  return { w: Math.max(w, 40), h: Math.max(h, 30) };
}

/** The .kicad_pcb file and the .kicad_pro with its net classes. */
export function kicadBoard(nl: BoardNetlist, o: KicadBoardOptions): { pcb: string; pro: string; placed: Placed[]; w: number; h: number } {
  uuidN = 0;
  const { w, h } = o.w && o.h ? { w: o.w, h: o.h } : boardSize(nl.parts, o.fill);
  const known = new Map((o.placed ?? []).map((p) => [p.ref, p]));
  const rest = nl.parts.filter((p) => !known.has(p.ref));
  const placed = [...(o.placed ?? []).filter((p) => nl.parts.some((b) => b.ref === p.ref)), ...(rest.length ? placeFromSchematic(rest, w, h) : [])];
  const netNo = new Map<string, number>([['', 0]]);
  nl.nets.forEach((n, k) => netNo.set(n, k + 1));
  const oz = o.copperOz ?? 2, cu = oz * 0.035;
  const L: string[] = [];
  L.push('(kicad_pcb (version 20221018) (generator "netapps")');
  L.push(`  (general (thickness 1.6))`);
  L.push(`  (paper "A3")`);
  L.push(`  (title_block (title ${q(o.title)}) (rev ${q(o.revision ?? 'A')}) (company "NETApps worked design"))`);
  L.push(`  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (32 "B.Adhes" user "B.Adhesive") (33 "F.Adhes" user "F.Adhesive") (34 "B.Paste" user) (35 "F.Paste" user) (36 "B.SilkS" user "B.Silkscreen") (37 "F.SilkS" user "F.Silkscreen") (38 "B.Mask" user) (39 "F.Mask" user) (40 "Dwgs.User" user "User.Drawings") (41 "Cmts.User" user "User.Comments") (44 "Edge.Cuts" user) (45 "Margin" user) (46 "B.CrtYd" user "B.Courtyard") (47 "F.CrtYd" user "F.Courtyard") (48 "B.Fab" user) (49 "F.Fab" user))`);
  L.push(`  (setup (stackup (layer "F.SilkS" (type "Top Silk Screen")) (layer "F.Paste" (type "Top Solder Paste")) (layer "F.Mask" (type "Top Solder Mask") (thickness 0.01)) (layer "F.Cu" (type "copper") (thickness ${f3(cu)})) (layer "dielectric 1" (type "core") (thickness ${f3(1.6 - 2 * cu - 0.02)}) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02)) (layer "B.Cu" (type "copper") (thickness ${f3(cu)})) (layer "B.Mask" (type "Bottom Solder Mask") (thickness 0.01)) (layer "B.Paste" (type "Bottom Solder Paste")) (layer "B.SilkS" (type "Bottom Silk Screen")) (copper_finish "HAL lead-free") (dielectric_constraints no)) (pad_to_mask_clearance 0) (pcbplotparams (layerselection 0x00010fc_ffffffff) (outputdirectory "gerber/")))`);
  L.push(`  (net 0 "")`);
  nl.nets.forEach((n, k) => L.push(`  (net ${k + 1} ${q(n)})`));
  // outline
  const e = (x1: number, y1: number, x2: number, y2: number) => L.push(`  (gr_line (start ${f3(x1)} ${f3(y1)}) (end ${f3(x2)} ${f3(y2)}) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts") (tstamp ${uuid()}))`);
  e(0, 0, w, 0); e(w, 0, w, h); e(w, h, 0, h); e(0, h, 0, 0);
  L.push(`  (gr_text ${q(`${o.title} rev ${o.revision ?? 'A'}`)} (at ${f3(w / 2)} ${f3(h - 1.5)}) (layer "F.SilkS") (tstamp ${uuid()}) (effects (font (size 1.5 1.5) (thickness 0.2))))`);
  const byRef = new Map(nl.parts.map((p) => [p.ref, p]));
  for (const pl of placed) L.push(footprintSexpr(byRef.get(pl.ref)!, pl.x, pl.y, pl.rot, netNo));
  L.push(')');
  const classes = o.classes ?? [];
  const pro = {
    board: { design_settings: { defaults: { board_outline_line_width: 0.1, copper_line_width: 0.2, silk_line_width: 0.12 }, rules: { min_clearance: 0.2, min_track_width: 0.2, min_via_diameter: 0.6, min_through_hole_diameter: 0.3, min_hole_clearance: 0.25, min_copper_edge_clearance: 0.5 }, track_widths: [0, ...classes.map((c) => c.track)], via_dimensions: [] } },
    meta: { filename: 'board.kicad_pro', version: 1 },
    net_settings: {
      classes: [
        { name: 'Default', clearance: 0.25, track_width: 0.3, via_diameter: 0.8, via_drill: 0.4, diff_pair_gap: 0.25, diff_pair_width: 0.2, microvia_diameter: 0.3, microvia_drill: 0.1, wire_width: 6, bus_width: 12, line_style: 0, pcb_color: 'rgba(0, 0, 0, 0.000)', schematic_color: 'rgba(0, 0, 0, 0.000)' },
        ...classes.map((c) => ({ name: c.name, clearance: c.clearance, track_width: c.track, via_diameter: c.via?.d ?? Math.max(0.8, Math.min(c.track, 2.5)), via_drill: c.via?.drill ?? Math.max(0.4, Math.min(c.track, 2.5) / 2), diff_pair_gap: 0.25, diff_pair_width: 0.2, microvia_diameter: 0.3, microvia_drill: 0.1, wire_width: 6, bus_width: 12, line_style: 0, pcb_color: 'rgba(0, 0, 0, 0.000)', schematic_color: 'rgba(0, 0, 0, 0.000)' })),
      ],
      meta: { version: 3 },
      netclass_patterns: classes.flatMap((c) => c.patterns.map((p) => ({ netclass: c.name, pattern: p }))),
    },
  };
  return { pcb: L.join('\n') + '\n', pro: JSON.stringify(pro, null, 2), placed, w, h };
}

/** IPC-2221 external track width (mm) for a current (A) and temperature rise (K) in copper of
 *  `oz` ounces: I = 0.048 · ΔT^0.44 · A^0.725, A in mil². */
export function ipc2221Width(current: number, rise = 20, oz = 2): number {
  const areaMil2 = (current / (0.048 * rise ** 0.44)) ** (1 / 0.725);
  const thickMil = 1.378 * oz;
  return Math.ceil((areaMil2 / thickMil) * 0.0254 * 10) / 10;
}
