// Schematic editing operations (UI-08 (b)–(f)). Pure functions: each takes a sheet and returns
// a new one, so every edit is one undoable command.

import { symbolOf, type Pt } from './symbols';
import {
  cleanWires, defaultProps, key, newId, nextRef, onSegment, orthoRoute, partBounds, pinPositions, samePt, segDist, snap, toWorld,
  type Label, type Part, type Rot, type Sheet, type Wire,
} from './schematic';

export interface Selection { parts: string[]; wires: string[]; labels: string[] }
export const noSelection = (): Selection => ({ parts: [], wires: [], labels: [] });
export const isEmpty = (s: Selection) => !s.parts.length && !s.wires.length && !s.labels.length;

export type Hit =
  | { kind: 'pin'; part: string; pin: string; at: Pt }
  | { kind: 'part'; part: string }
  | { kind: 'wire'; wire: string; at: Pt }
  | { kind: 'label'; label: string }
  | { kind: 'probe'; probe: string };

/** What is under the point; pins first, then labels, wires, part bodies. */
export function hitTest(sheet: Sheet, p: Pt, tol: number): Hit | null {
  for (const pr of sheet.probes) {
    const at = pr.kind === 'i' ? null : pr.at;
    if (at && Math.hypot(at.x - p.x, at.y - p.y) <= tol) return { kind: 'probe', probe: pr.id };
  }
  for (const part of [...sheet.parts].reverse()) {
    for (const pp of pinPositions(part)) if (Math.hypot(pp.at.x - p.x, pp.at.y - p.y) <= tol) return { kind: 'pin', part: part.id, pin: pp.pin, at: pp.at };
  }
  for (const l of sheet.labels) {
    const w = Math.max(20, l.name.length * 6 + 6);
    if (p.x >= l.x - 2 && p.x <= l.x + w && p.y >= l.y - 10 && p.y <= l.y + 4) return { kind: 'label', label: l.id };
  }
  let best: { w: Wire; d: number } | null = null;
  for (const w of sheet.wires) {
    const d = segDist(p, w.a, w.b);
    if (d <= tol && (!best || d < best.d)) best = { w, d };
  }
  if (best) return { kind: 'wire', wire: best.w.id, at: p };
  for (const part of [...sheet.parts].reverse()) {
    const b = partBounds(part);
    if (p.x >= b.x0 - 2 && p.x <= b.x1 + 2 && p.y >= b.y0 - 2 && p.y <= b.y1 + 2) return { kind: 'part', part: part.id };
  }
  return null;
}

/** Everything inside a rectangle (box selection). */
export function inRect(sheet: Sheet, a: Pt, b: Pt): Selection {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const inside = (p: Pt) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  return {
    parts: sheet.parts.filter((p) => { const r = partBounds(p); return inside({ x: r.x0, y: r.y0 }) && inside({ x: r.x1, y: r.y1 }); }).map((p) => p.id),
    wires: sheet.wires.filter((w) => inside(w.a) && inside(w.b)).map((w) => w.id),
    labels: sheet.labels.filter((l) => inside({ x: l.x, y: l.y })).map((l) => l.id),
  };
}

export function placePart(sheet: Sheet, sym: string, at: Pt, rot: Rot = 0, mirror = false, props?: Record<string, string>): { sheet: Sheet; id: string } {
  const s = symbolOf(sym);
  const id = newId('p');
  const part: Part = { id, ref: nextRef(sheet, s.prefix), sym, x: snap(at.x), y: snap(at.y), rot, mirror, props: { ...defaultProps(s), ...(props ?? {}) } };
  return { sheet: { ...sheet, parts: [...sheet.parts, part] }, id };
}

/** Adds an orthogonal wire path through the given points (UI-08 (b)). */
export function addWire(sheet: Sheet, pts: Pt[], verticalFirst = false): Sheet {
  const wires: Wire[] = [];
  for (let i = 1; i < pts.length; i++) for (const [a, b] of orthoRoute(pts[i - 1], pts[i], verticalFirst)) wires.push({ id: newId('w'), a, b });
  return { ...sheet, wires: cleanWires(mergeCollinear([...sheet.wires, ...wires], sheet)) };
}

/** Joins wire segments that continue each other in a straight line with nothing else at the joint. */
function mergeCollinear(wires: Wire[], sheet: Sheet): Wire[] {
  const pinKeys = new Set(sheet.parts.flatMap((p) => pinPositions(p).map((pp) => key(pp.at))));
  const labelKeys = new Set(sheet.labels.map((l) => key({ x: l.x, y: l.y })));
  let changed = true;
  let ws = [...wires];
  while (changed) {
    changed = false;
    const ends = new Map<string, Wire[]>();
    for (const w of ws) for (const e of [w.a, w.b]) ends.set(key(e), [...(ends.get(key(e)) ?? []), w]);
    for (const [k, list] of ends) {
      if (list.length !== 2 || pinKeys.has(k) || labelKeys.has(k)) continue;
      const [u, v] = list;
      // a wire ending on the middle of another at this point would make it a junction
      if (ws.some((w) => w !== u && w !== v && onSegment(parseKey(k), w.a, w.b))) continue;
      const hu = u.a.y === u.b.y, hv = v.a.y === v.b.y, vu = u.a.x === u.b.x, vv = v.a.x === v.b.x;
      if (!((hu && hv) || (vu && vv))) continue;
      const pu = samePt(u.a, parseKey(k)) ? u.b : u.a, pv = samePt(v.a, parseKey(k)) ? v.b : v.a;
      ws = ws.filter((w) => w !== u && w !== v);
      ws.push({ id: u.id, a: pu, b: pv });
      changed = true;
      break;
    }
  }
  return ws;
}

function parseKey(k: string): Pt { const [x, y] = k.split(',').map(Number); return { x, y }; }

export function addLabel(sheet: Sheet, name: string, at: Pt): { sheet: Sheet; id: string } {
  const id = newId('l');
  const l: Label = { id, name, x: snap(at.x), y: snap(at.y) };
  return { sheet: { ...sheet, labels: [...sheet.labels, l] }, id };
}

export function deleteSelection(sheet: Sheet, sel: Selection): Sheet {
  const parts = new Set(sel.parts), wires = new Set(sel.wires), labels = new Set(sel.labels);
  return {
    ...sheet,
    parts: sheet.parts.filter((p) => !parts.has(p.id)),
    wires: sheet.wires.filter((w) => !wires.has(w.id)),
    labels: sheet.labels.filter((l) => !labels.has(l.id)),
    probes: sheet.probes.filter((p) => !(p.kind === 'i' && parts.has(p.part))),
  };
}

/** Moves the selection by (dx, dy); wires attached to moved pins follow (rubber band). */
export function moveSelection(sheet: Sheet, sel: Selection, dx: number, dy: number): Sheet {
  if (!dx && !dy) return sheet;
  const ps = new Set(sel.parts), ws = new Set(sel.wires), ls = new Set(sel.labels);
  const moving = new Set<string>();
  for (const p of sheet.parts) if (ps.has(p.id)) for (const pp of pinPositions(p)) moving.add(key(pp.at));
  for (const w of sheet.wires) if (ws.has(w.id)) { moving.add(key(w.a)); moving.add(key(w.b)); }
  for (const l of sheet.labels) if (ls.has(l.id)) moving.add(key({ x: l.x, y: l.y }));
  const mv = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy });
  const wires: Wire[] = [];
  for (const w of sheet.wires) {
    if (ws.has(w.id)) { wires.push({ ...w, a: mv(w.a), b: mv(w.b) }); continue; }
    const ma = moving.has(key(w.a)), mb = moving.has(key(w.b));
    if (!ma && !mb) { wires.push(w); continue; }
    if (ma && mb) { wires.push({ ...w, a: mv(w.a), b: mv(w.b) }); continue; }
    const a = ma ? mv(w.a) : w.a, b = mb ? mv(w.b) : w.b;
    if (a.x === b.x || a.y === b.y) wires.push({ ...w, a, b });
    else {
      // keep the wire orthogonal: bend it, the fixed end keeps its direction
      const horiz = w.a.y === w.b.y;
      const fixed = ma ? b : a, moved = ma ? a : b;
      for (const [s, e] of orthoRoute(fixed, moved, !horiz)) wires.push({ id: newId('w'), a: s, b: e });
    }
  }
  return {
    ...sheet,
    parts: sheet.parts.map((p) => (ps.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
    wires: cleanWires(wires),
    labels: sheet.labels.map((l) => (ls.has(l.id) ? { ...l, x: l.x + dx, y: l.y + dy } : l)),
    probes: sheet.probes.map((pr) => (pr.kind === 'i' ? pr : moving.has(key(pr.at)) ? { ...pr, at: mv(pr.at) } : pr)),
  };
}

/** Rotates the selection a quarter turn clockwise about its centre (UI-08 (d)). */
export function rotateSelection(sheet: Sheet, sel: Selection): Sheet {
  return transformSelection(sheet, sel, (p, c) => ({ x: c.x - (p.y - c.y), y: c.y + (p.x - c.x) }), (p) => ({ ...p, rot: ((p.rot + 1) % 4) as Rot }));
}

/** Mirrors the selection left–right about its centre. */
export function mirrorSelection(sheet: Sheet, sel: Selection): Sheet {
  return transformSelection(sheet, sel, (p, c) => ({ x: 2 * c.x - p.x, y: p.y }), (p) => ({ ...p, mirror: !p.mirror, rot: ((4 - p.rot) % 4) as Rot }));
}

function transformSelection(sheet: Sheet, sel: Selection, f: (p: Pt, c: Pt) => Pt, fp: (p: Part) => Part): Sheet {
  const ps = new Set(sel.parts), ws = new Set(sel.wires), ls = new Set(sel.labels);
  const pts: Pt[] = [
    ...sheet.parts.filter((p) => ps.has(p.id)).map((p) => ({ x: p.x, y: p.y })),
    ...sheet.wires.filter((w) => ws.has(w.id)).flatMap((w) => [w.a, w.b]),
    ...sheet.labels.filter((l) => ls.has(l.id)).map((l) => ({ x: l.x, y: l.y })),
  ];
  if (!pts.length) return sheet;
  const c = { x: snap((Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2), y: snap((Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2) };
  // pins before, to carry attached wire ends along
  const before = new Map<string, Pt>();
  for (const p of sheet.parts) if (ps.has(p.id)) for (const pp of pinPositions(p)) before.set(`${p.id}:${pp.pin}`, pp.at);
  const parts = sheet.parts.map((p) => (ps.has(p.id) ? fp({ ...p, ...f({ x: p.x, y: p.y }, c) }) : p));
  const remap = new Map<string, Pt>();
  for (const p of parts) if (ps.has(p.id)) for (const pp of pinPositions(p)) remap.set(key(before.get(`${p.id}:${pp.pin}`)!), pp.at);
  const wires: Wire[] = [];
  for (const w of sheet.wires) {
    if (ws.has(w.id)) { wires.push({ ...w, a: f(w.a, c), b: f(w.b, c) }); continue; }
    const na = remap.get(key(w.a)), nb = remap.get(key(w.b));
    if (!na && !nb) { wires.push(w); continue; }
    const a = na ?? w.a, b = nb ?? w.b;
    if (a.x === b.x || a.y === b.y) wires.push({ ...w, a, b });
    else for (const [s, e] of orthoRoute(na ? b : a, na ? a : b, w.a.y !== w.b.y)) wires.push({ id: newId('w'), a: s, b: e });
  }
  return { ...sheet, parts, wires: cleanWires(wires), labels: sheet.labels.map((l) => (ls.has(l.id) ? { ...l, ...f({ x: l.x, y: l.y }, c) } : l)) };
}

export interface Clip { parts: Part[]; wires: Wire[]; labels: Label[] }

export function copySelection(sheet: Sheet, sel: Selection): Clip {
  const ps = new Set(sel.parts), ws = new Set(sel.wires), ls = new Set(sel.labels);
  return {
    parts: sheet.parts.filter((p) => ps.has(p.id)).map((p) => ({ ...p, props: { ...p.props } })),
    wires: sheet.wires.filter((w) => ws.has(w.id)).map((w) => ({ ...w })),
    labels: sheet.labels.filter((l) => ls.has(l.id)).map((l) => ({ ...l })),
  };
}

/** Pastes with new ids and the next free references, offset by (dx, dy). Returns the new selection. */
export function paste(sheet: Sheet, clip: Clip, dx: number, dy: number): { sheet: Sheet; sel: Selection } {
  let s = sheet;
  const sel = noSelection();
  for (const p of clip.parts) {
    const sym = symbolOf(p.sym);
    const id = newId('p');
    const part: Part = { ...p, id, ref: nextRef(s, sym.prefix), x: p.x + dx, y: p.y + dy, props: { ...p.props } };
    s = { ...s, parts: [...s.parts, part] };
    sel.parts.push(id);
  }
  const wires = clip.wires.map((w) => ({ id: newId('w'), a: { x: w.a.x + dx, y: w.a.y + dy }, b: { x: w.b.x + dx, y: w.b.y + dy } }));
  const labels = clip.labels.map((l) => ({ ...l, id: newId('l'), x: l.x + dx, y: l.y + dy }));
  sel.wires.push(...wires.map((w) => w.id));
  sel.labels.push(...labels.map((l) => l.id));
  return { sheet: { ...s, wires: cleanWires([...s.wires, ...wires]), labels: [...s.labels, ...labels] }, sel };
}

export function setProps(sheet: Sheet, partId: string, props: Record<string, string>): Sheet {
  return { ...sheet, parts: sheet.parts.map((p) => (p.id === partId ? { ...p, props: { ...p.props, ...props } } : p)) };
}

export function setRef(sheet: Sheet, partId: string, ref: string): Sheet {
  return { ...sheet, parts: sheet.parts.map((p) => (p.id === partId ? { ...p, ref } : p)) };
}

/** Connection points a wire may snap to or end on: pins, wire ends and wire bodies. */
export function connectionAt(sheet: Sheet, p: Pt, tol: number): Pt | null {
  for (const part of sheet.parts) for (const pp of pinPositions(part)) if (Math.hypot(pp.at.x - p.x, pp.at.y - p.y) <= tol) return pp.at;
  for (const w of sheet.wires) for (const e of [w.a, w.b]) if (Math.hypot(e.x - p.x, e.y - p.y) <= tol) return e;
  for (const l of sheet.labels) if (Math.hypot(l.x - p.x, l.y - p.y) <= tol) return { x: l.x, y: l.y };
  for (const w of sheet.wires) if (segDist(p, w.a, w.b) <= tol) {
    const q = { x: snap(p.x), y: snap(p.y) };
    if (onSegment(q, w.a, w.b)) return q;
  }
  return null;
}

/** Bounding box of everything on the sheet (zoom to fit). */
export function sheetBounds(sheet: Sheet): { x0: number; y0: number; x1: number; y1: number } | null {
  const xs: number[] = [], ys: number[] = [];
  for (const p of sheet.parts) { const b = partBounds(p); xs.push(b.x0, b.x1); ys.push(b.y0, b.y1); }
  for (const w of sheet.wires) { xs.push(w.a.x, w.b.x); ys.push(w.a.y, w.b.y); }
  for (const l of sheet.labels) { xs.push(l.x, l.x + l.name.length * 6); ys.push(l.y - 10, l.y); }
  if (!xs.length) return null;
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Pin label text position helper for the renderer: labels stay upright. */
export function labelPos(p: Part, which: 'ref' | 'val'): { at: Pt; anchor: 'start' | 'middle' } {
  const s = symbolOf(p.sym);
  if (p.rot % 2 === 1 && !s.power) {
    const b = partBounds(p);
    return { at: { x: Math.max(b.x1 + 4, p.x + 22), y: p.y + (which === 'ref' ? -4 : 9) }, anchor: 'start' };
  }
  const local = which === 'ref' ? s.refAt : s.valAt;
  return { at: toWorld({ ...p, rot: s.power ? p.rot : 0, mirror: false }, local.x === 0 ? local : { x: p.mirror ? -local.x : local.x, y: local.y }), anchor: local.x > 10 ? 'start' : 'middle' };
}
