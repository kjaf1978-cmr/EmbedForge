// The board (UI-10, PCB-01, PCB-07): outline, placed footprints, tracks and vias, stored in
// geometry.json under views.pcb. Parts come from the schematic through the netlist: adding
// or removing a part on the schematic adds or removes it on the board, and every pad takes the
// net of the symbol pin it is mapped to (VER-09). Coordinates in mm, y downwards, origin at
// the top-left corner of the outline.

import type { Sheet } from '../eda/schematic';
import { symbolOf } from '../eda/symbols';
import { connectivity, GND_NET, type Connectivity } from '../eda/connectivity';
import { footprintOf } from './library';
import type { Footprint, Pad } from './footprint';

export type Layer = 'F' | 'B';

export interface Hole { x: number; y: number; d: number }

export interface Outline {
  /** Template id (PCB-01) or "custom". */
  template: string;
  w: number;
  h: number;
  /** Mounting holes (non-plated). */
  holes: Hole[];
}

export interface Placement { ref: string; x: number; y: number; rot: 0 | 90 | 180 | 270; side: 'top' | 'bottom' }
export interface Track { id: string; net: string; layer: Layer; width: number; pts: [number, number][] }
export interface Via { id: string; net: string; x: number; y: number; drill: number; pad: number }

export interface Board {
  outline: Outline;
  /** Copper layers: 1 (made as 2 with the second empty), 2, or 4. */
  layers: 1 | 2 | 4;
  profile: string;
  parts: Placement[];
  tracks: Track[];
  vias: Via[];
  /** Hardware revision printed on the silkscreen and in fabrication file names (CM-08). */
  revision: string;
}

/** Board outlines of PCB-01, from the official mechanical drawings (mm). */
export const TEMPLATES: { id: string; name: string; w: number; h: number; holes: Hole[]; note: string }[] = [
  { id: 'custom', name: 'Custom size', w: 80, h: 50, holes: [], note: 'any size; add mounting holes as needed' },
  // Arduino Uno R3: 2.700 × 2.100 in; holes Ø 3.2 at the Uno positions (drawing origin lower left)
  { id: 'uno-shield', name: 'Arduino Uno shield', w: 68.58, h: 53.34, note: 'Uno R3 outline and holes; headers come with the board definitions (Increment 4)',
    holes: [[13.97, 2.54], [15.24, 50.8], [66.04, 7.62], [66.04, 35.56]].map(([x, y]) => ({ x, y: 53.34 - y, d: 3.2 })) },
  { id: 'mega-shield', name: 'Arduino Mega shield', w: 101.6, h: 53.34, note: 'Mega 2560 R3 outline and holes',
    holes: [[13.97, 2.54], [15.24, 50.8], [66.04, 7.62], [66.04, 35.56], [90.17, 50.8], [96.52, 2.54]].map(([x, y]) => ({ x, y: 53.34 - y, d: 3.2 })) },
  // Raspberry Pi HAT+: 65 × 56.5 mm, M2.5 holes 3.5 mm from the edges, 58 × 49 mm apart
  { id: 'rpi-hat', name: 'Raspberry Pi HAT+', w: 65, h: 56.5, note: 'HAT+ outline and holes; the 40-pin header and ID EEPROM come with the board definitions (Increment 4)',
    holes: [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]].map(([x, y]) => ({ x, y, d: 2.75 })) },
  { id: 'rpi-phat', name: 'Raspberry Pi Zero pHAT', w: 65, h: 30, note: 'Zero outline and holes, 58 × 23 mm apart',
    holes: [[3.5, 3.5], [61.5, 3.5], [3.5, 26.5], [61.5, 26.5]].map(([x, y]) => ({ x, y, d: 2.75 })) },
];

export function newBoard(template = 'custom'): Board {
  const t = TEMPLATES.find((x) => x.id === template) ?? TEMPLATES[0];
  return { outline: { template: t.id, w: t.w, h: t.h, holes: t.holes.map((h) => ({ ...h })) }, layers: 2, profile: 'EF-PROTO-STD', parts: [], tracks: [], vias: [], revision: 'A' };
}

/** A pad on the board: its footprint pad moved to the placement, with its net. */
/** `pin`: the symbol pin the pad belongs to; pads of one pin are joined inside the part (a
 *  push-button's two pads per contact, a regulator's tab). */
export interface BoardPad { ref: string; pad: Pad; x: number; y: number; w: number; h: number; net: string | null; side: 'top' | 'bottom'; layers: Layer[]; pin: string | null }

/** Position of footprint point (px, py) for a placement (rotation counter-clockwise as seen
 *  from the top; a bottom-side part is mirrored left–right). */
export function place(pl: Placement, px: number, py: number): [number, number] {
  const mx = pl.side === 'bottom' ? -px : px;
  const a = (pl.rot * Math.PI) / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return [pl.x + mx * c + py * s, pl.y - mx * s + py * c];
}

/** Every pad of the board with its net (null: not connected on the schematic). */
export function boardPads(sheet: Sheet, board: Board, conn: Connectivity = connectivity(sheet)): BoardPad[] {
  const out: BoardPad[] = [];
  for (const pl of board.parts) {
    const part = sheet.parts.find((p) => p.ref === pl.ref);
    if (!part) continue;
    const f = footprintOf(part);
    if (!f) continue;
    const netOfPad = new Map<string, string | null>(), pinOfPad = new Map<string, string>();
    for (const [pin, pads] of Object.entries(f.choice.pins)) for (const pad of pads) { netOfPad.set(pad, conn.pinNet.get(`${part.ref}.${pin}`) ?? null); pinOfPad.set(pad, pin); }
    const rail = (part.props.value ?? '+5V').trim() || '+5V';
    for (const pad of f.choice.rail ?? []) netOfPad.set(pad, rail);
    for (const pad of f.choice.gnd ?? []) netOfPad.set(pad, GND_NET);
    const turned = pl.rot === 90 || pl.rot === 270;
    for (const pad of f.fp.pads) {
      const [x, y] = place(pl, pad.x, pad.y);
      const layers: Layer[] = pad.drill !== undefined ? ['F', 'B'] : [pl.side === 'top' ? 'F' : 'B'];
      out.push({ ref: pl.ref, pad, x, y, w: turned ? pad.h : pad.w, h: turned ? pad.w : pad.h, net: netOfPad.get(pad.id) ?? null, side: pl.side, layers, pin: pinOfPad.get(pad.id) ?? null });
    }
  }
  return out;
}

/** Footprint bounding box (courtyard) of a placement on the board. */
export function courtyardOf(pl: Placement, fp: Footprint): { x0: number; y0: number; x1: number; y1: number } {
  const c = fp.courtyard;
  const pts = [place(pl, c.x0, c.y0), place(pl, c.x1, c.y1)];
  return { x0: Math.min(pts[0][0], pts[1][0]), y0: Math.min(pts[0][1], pts[1][1]), x1: Math.max(pts[0][0], pts[1][0]), y1: Math.max(pts[0][1], pts[1][1]) };
}

/** Brings the board in line with the schematic (PCB-07): parts deleted on the schematic leave
 *  the board with their tracks' pads; new parts are placed in a free row below the outline,
 *  for the user (or the automatic placement) to put on the board. Parts without a footprint
 *  (power symbols) are skipped. Returns the new board and what changed. */
export function syncBoard(sheet: Sheet, board: Board): { board: Board; added: string[]; removed: string[] } {
  const want = sheet.parts.filter((p) => !symbolOf(p.sym).power && footprintOf(p));
  const refs = new Set(want.map((p) => p.ref));
  const removed = board.parts.filter((pl) => !refs.has(pl.ref)).map((pl) => pl.ref);
  const kept = board.parts.filter((pl) => refs.has(pl.ref));
  const have = new Set(kept.map((pl) => pl.ref));
  const added: string[] = [];
  let x = 2;
  const parts = [...kept];
  for (const p of want) {
    if (have.has(p.ref)) continue;
    const fp = footprintOf(p)!.fp;
    const w = fp.courtyard.x1 - fp.courtyard.x0, h = fp.courtyard.y1 - fp.courtyard.y0;
    parts.push({ ref: p.ref, x: x - fp.courtyard.x0, y: board.outline.h + 6 + h / 2, rot: 0, side: 'top' });
    x += w + 2;
    added.push(p.ref);
  }
  return { board: { ...board, parts }, added, removed };
}

/** Is a placement inside the outline (its whole courtyard)? */
export function onBoard(pl: Placement, fp: Footprint, board: Board): boolean {
  const c = courtyardOf(pl, fp);
  return c.x0 >= 0 && c.y0 >= 0 && c.x1 <= board.outline.w && c.y1 <= board.outline.h;
}
