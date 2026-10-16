// Schematic document (UI-08): parts, wires, labels and probes with their geometry. The
// connectivity derived from it is the netlist (INV-08); see connectivity.ts.

import { symbolOf, type Pt, type SymbolDef } from './symbols';
import { parseValue } from './units';
import type { Board } from '../pcb/board';

export type Rot = 0 | 1 | 2 | 3;

export interface Part {
  id: string;
  /** Reference designator (R1, C3…); power symbols use "#PWR01"… */
  ref: string;
  sym: string;
  x: number;
  y: number;
  /** Clockwise quarter turns. */
  rot: Rot;
  /** Mirrored left–right before rotation. */
  mirror: boolean;
  /** The main value under the symbol's value key, plus every parameter. */
  props: Record<string, string>;
}

export interface Wire { id: string; a: Pt; b: Pt }
/** A net label; with `note` set, a free text note that connects to nothing. */
export interface Label { id: string; name: string; x: number; y: number; note?: boolean }

/** Net labels only (text notes are not connections). */
export const netLabels = (s: { labels: Label[] }): Label[] => s.labels.filter((l) => !l.note);

export type Probe =
  | { id: string; kind: 'v'; at: Pt; colour: string }
  | { id: string; kind: 'vd'; at: Pt; at2: Pt; colour: string }
  | { id: string; kind: 'i'; part: string; pin: string; colour: string };

export type SimSettings =
  | { type: 'op' }
  | { type: 'tran'; stop: string; step: string; /** 'zero': capacitors start discharged (SPICE uic) */ start?: 'op' | 'zero' }
  | { type: 'ac'; fstart: string; fstop: string; perDecade: string; probeIsDb?: boolean }
  | { type: 'dc'; target: string; param: string; start: string; stop: string; step: string };

/** Parameter sweep (SPICE .step): the analysis runs once per value of one part property. */
export interface StepAxis {
  /** Part reference and property key (value, or a parameter such as "lp"). */
  ref: string;
  param: string;
  mode: 'list' | 'lin' | 'dec';
  list: string;
  start: string;
  stop: string;
  step: string;
}

export interface StepSweep {
  on: boolean;
  /** Further properties stepped together with this one (every combination runs). */
  more?: StepAxis[];
  /** Part reference and property key (value, or a parameter such as "lp"). */
  ref: string;
  param: string;
  /** list: values or model names separated by spaces or commas; lin: start, stop, step;
   *  dec: start, stop and points per decade in `step`. */
  mode: 'list' | 'lin' | 'dec';
  list: string;
  start: string;
  stop: string;
  step: string;
}

/** Tolerance analysis (Monte Carlo): runs with resistors, capacitors and inductors varied. */
export interface MonteCarlo {
  on: boolean;
  /** Number of runs, the nominal one included. */
  runs: string;
  /** Seed of the random numbers: the same seed gives the same runs. */
  seed: string;
  /** uniform within ±tolerance, or Gaussian with the tolerance as 3 σ (clipped at it). */
  dist: 'uniform' | 'gauss';
  /** Tolerances in % per kind of part. */
  tolR: string;
  tolC: string;
  tolL: string;
}

export interface Sheet {
  parts: Part[];
  wires: Wire[];
  labels: Label[];
  probes: Probe[];
  sim: SimSettings;
  step?: StepSweep;
  mc?: MonteCarlo;
  /** Circuit temperature in °C (SPICE .temp); empty or absent: 27 °C. */
  temp?: string;
  /** The printed circuit board made from this schematic (Increment 3), once started. */
  board?: Board;
}

/** Stepped-property reference of the circuit temperature in a parameter sweep. */
export const TEMP_REF = '@TEMP';

/** The circuit temperature in °C, or why the text is not one. */
export function sheetTemp(s: { temp?: string }): number | { error: string } {
  const t = s.temp?.trim();
  if (!t) return 27;
  const v = parseValue(t);
  if (v === null) return { error: `Temperature: "${t}" is not a number` };
  if (!(v > -273.15) || v > 1000) return { error: 'Temperature: must be above −273.15 °C and at most 1000 °C' };
  return v;
}

export const GRID = 10;
export const snap = (v: number, g = GRID) => Math.round(v / g) * g;
export const snapPt = (p: Pt, g = GRID): Pt => ({ x: snap(p.x, g), y: snap(p.y, g) });
export const samePt = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
export const key = (p: Pt) => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`;

export function emptySheet(): Sheet {
  return { parts: [], wires: [], labels: [], probes: [], sim: { type: 'op' } };
}

/** Local symbol coordinates → sheet coordinates. */
export function toWorld(p: Pick<Part, 'x' | 'y' | 'rot' | 'mirror'>, l: Pt): Pt {
  let x = p.mirror ? -l.x : l.x, y = l.y;
  for (let i = 0; i < p.rot; i++) [x, y] = [-y, x];
  return { x: p.x + x + 0, y: p.y + y + 0 };
}

/** Sheet coordinates → local symbol coordinates (inverse of toWorld). */
export function toLocal(p: Pick<Part, 'x' | 'y' | 'rot' | 'mirror'>, w: Pt): Pt {
  let x = w.x - p.x, y = w.y - p.y;
  for (let i = 0; i < p.rot; i++) [x, y] = [y, -x];
  return { x: (p.mirror ? -x : x) + 0, y: y + 0 };
}

export function pinPositions(p: Part): { pin: string; name: string; at: Pt }[] {
  const s = symbolOf(p.sym);
  return s.pins.map((pd) => ({ pin: pd.id, name: pd.name, at: toWorld(p, pd) }));
}

/** Axis-aligned bounds of a part's body and pins in sheet coordinates. */
export function partBounds(p: Part): { x0: number; y0: number; x1: number; y1: number } {
  const s = symbolOf(p.sym);
  const pts: Pt[] = s.pins.map((q) => ({ x: q.x, y: q.y }));
  const ext = bodyExtent(s);
  pts.push({ x: ext.x0, y: ext.y0 }, { x: ext.x1, y: ext.y1 });
  const w = pts.map((q) => toWorld(p, q));
  return { x0: Math.min(...w.map((q) => q.x)), y0: Math.min(...w.map((q) => q.y)), x1: Math.max(...w.map((q) => q.x)), y1: Math.max(...w.map((q) => q.y)) };
}

function bodyExtent(s: SymbolDef) {
  const xs = s.pins.map((p) => p.x), ys = s.pins.map((p) => p.y);
  const pad = 15;
  return { x0: Math.min(...xs, -pad), y0: Math.min(...ys, -pad), x1: Math.max(...xs, pad), y1: Math.max(...ys, pad) };
}

/** Is p on the segment a–b (end points included)? */
export function onSegment(p: Pt, a: Pt, b: Pt, tol = 0.01): boolean {
  const minx = Math.min(a.x, b.x) - tol, maxx = Math.max(a.x, b.x) + tol;
  const miny = Math.min(a.y, b.y) - tol, maxy = Math.max(a.y, b.y) + tol;
  if (p.x < minx || p.x > maxx || p.y < miny || p.y > maxy) return false;
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  return Math.abs(cross) <= tol * Math.hypot(b.x - a.x, b.y - a.y);
}

/** Distance from p to the segment a–b. */
export function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

let seq = 0;
export function newId(prefix: string): string {
  seq = (seq + 1) % 1e9;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Default props of a new part. */
export function defaultProps(sym: SymbolDef): Record<string, string> {
  const out: Record<string, string> = { [sym.value.key]: sym.value.default };
  for (const p of sym.params) out[p.key] = p.default;
  return out;
}

/** Next free reference for a prefix: R1, R2… (power symbols #PWR01…). */
export function nextRef(sheet: Sheet, prefix: string): string {
  const used = new Set(sheet.parts.map((p) => p.ref));
  for (let i = 1; ; i++) {
    const r = prefix === '#PWR' ? `#PWR${String(i).padStart(2, '0')}` : `${prefix}${i}`;
    if (!used.has(r)) return r;
  }
}

/** Text shown as the value on the schematic. */
export function valueText(p: Part): string {
  const s = symbolOf(p.sym);
  const v = p.props[s.value.key] ?? '';
  if (s.value.kind === 'bool' || s.interactive === 'throw') return '';
  if (s.id === 'led') return `LED ${v}`;
  if (s.id === 'vsin') return `${v} V ${p.props.freq ?? ''}Hz`;
  if (s.id === 'vpulse') return `${p.props.low ?? 0}/${v} V ${p.props.freq ?? ''}Hz`;
  if (s.value.unit && parseValue(v) !== null && !v.endsWith(s.value.unit)) return `${v}${s.value.unit}`;
  return v;
}

/** Re-numbers references by position, top to bottom then left to right (UI-08 (e)). */
/** Units per package of the multi-unit ICs: parts with the same `pkg` property are the units
 *  of one IC (U3A, U3B…), counted once in the parts list. */
export const PACKAGE_UNITS: Record<string, number> = { LM339: 4, LM393: 2, LM358: 2, TL072: 2, TL074: 4, LM324: 4 };
/** Package pin count of the multi-unit ICs (for the solder joints of the reliability count). */
export const PACKAGE_PINS: Record<string, number> = { LM339: 14, LM393: 8, LM358: 8, TL072: 8, TL074: 14, LM324: 14 };

export function annotate(sheet: Sheet): Sheet {
  const parts = sheet.parts.map((p) => ({ ...p }));
  const groups = new Map<string, Part[][]>();
  // a package's units share one number: they are numbered as one entity, at the first unit
  const pkgs = new Map<string, Part[]>();
  for (const p of parts) {
    const pre = symbolOf(p.sym).prefix;
    const k = p.props.pkg;
    if (k) {
      const id = `${pre}|${k}`;
      const list = pkgs.get(id);
      if (list) { list.push(p); continue; }
      const nl = [p];
      pkgs.set(id, nl);
      groups.set(pre, [...(groups.get(pre) ?? []), nl]);
    } else groups.set(pre, [...(groups.get(pre) ?? []), [p]]);
  }
  const pos = (u: Part[]) => u.reduce((a, b) => (b.y < a.y || (b.y === a.y && b.x < a.x) ? b : a));
  for (const [pre, list] of groups) {
    list.sort((a, b) => pos(a).y - pos(b).y || pos(a).x - pos(b).x);
    list.forEach((units, i) => {
      const base = pre === '#PWR' ? `#PWR${String(i + 1).padStart(2, '0')}` : `${pre}${i + 1}`;
      if (units.length === 1 && !units[0].props.pkg) { units[0].ref = base; return; }
      // units in the order they were placed: A, B, C, D
      units.forEach((u, k) => { u.ref = `${base}${String.fromCharCode(65 + k)}`; });
    });
  }
  return { ...sheet, parts };
}

/** The package reference of a part: U3 for the unit U3B, else the part's own reference. */
export const packageRef = (p: Part): string => (p.props.pkg ? p.ref.replace(/[A-Z]$/, '') : p.ref);

/** Removes zero-length wires and exact duplicates. */
export function cleanWires(wires: Wire[]): Wire[] {
  const seen = new Set<string>();
  return wires.filter((w) => {
    if (samePt(w.a, w.b)) return false;
    const k = [key(w.a), key(w.b)].sort().join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Orthogonal route from a to b: one or two segments, horizontal first unless vertical first is asked. */
export function orthoRoute(a: Pt, b: Pt, verticalFirst = false): [Pt, Pt][] {
  if (a.x === b.x || a.y === b.y) return samePt(a, b) ? [] : [[a, b]];
  const m = verticalFirst ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
  return [[a, m], [m, b]];
}
