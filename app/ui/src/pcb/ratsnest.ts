// Copper connectivity and the ratsnest (UI-10, VER-08): which pads the tracks and vias
// already join, which connections of each net are still missing (drawn as straight "air
// wires", the shortest set that would complete the net), and copper that joins two nets.

import type { Board, BoardPad, Layer, Track, Via } from './board';

export type Pt = [number, number];

/** Distance from point p to segment ab. */
export function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Smallest distance between segments ab and cd (0 when they cross). */
export function segSegDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const cross = (o: Pt, p: Pt, q: Pt) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
}

/** Distance from a point to a pad's copper edge (negative inside). */
export function padDist(p: Pt, pad: BoardPad): number {
  const rr = pad.pad.shape === 'rect' ? 0 : Math.min(pad.w, pad.h) / 2;
  const dx = Math.max(0, Math.abs(p[0] - pad.x) - (pad.w / 2 - rr)), dy = Math.max(0, Math.abs(p[1] - pad.y) - (pad.h / 2 - rr));
  const out = Math.hypot(dx, dy) - rr;
  if (out > 0 || rr > 0) return out;
  return -Math.min(pad.w / 2 - Math.abs(p[0] - pad.x), pad.h / 2 - Math.abs(p[1] - pad.y));
}

/** Distance from a segment (with its width) to a pad's copper. */
export function segPadGap(a: Pt, b: Pt, width: number, pad: BoardPad): number {
  // sample along the segment; pads are small against the 0.05 mm steps used here
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.05));
  let best = Infinity;
  for (let k = 0; k <= n; k++) best = Math.min(best, padDist([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n], pad));
  return best - width / 2;
}

export const segments = (t: Track): [Pt, Pt][] => t.pts.slice(1).map((p, k) => [t.pts[k], p] as [Pt, Pt]);

type Item = { kind: 'pad'; pad: BoardPad } | { kind: 'track'; t: Track } | { kind: 'via'; v: Via };

/** Copper islands: groups of pads, tracks and vias joined by copper (touching on a common layer). */
export function islands(pads: BoardPad[], board: Board): Item[][] {
  const items: Item[] = [...pads.map((pad) => ({ kind: 'pad' as const, pad })), ...board.tracks.map((t) => ({ kind: 'track' as const, t })), ...board.vias.map((v) => ({ kind: 'via' as const, v }))];
  const parent = items.map((_, k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  const join = (a: number, b: number) => { parent[find(a)] = find(b); };
  const layersOf = (it: Item): Layer[] => (it.kind === 'pad' ? it.pad.layers : it.kind === 'track' ? [it.t.layer] : ['F', 'B']);
  const touch = (a: Item, b: Item): boolean => {
    if (!layersOf(a).some((l) => layersOf(b).includes(l))) return false;
    if (a.kind === 'pad' && b.kind === 'pad') return false; // pads never overlap in a valid footprint
    if (a.kind === 'track' || b.kind === 'track') {
      const [t, o] = a.kind === 'track' ? [a.t, b] : [(b as { t: Track }).t, a];
      for (const [p, q] of segments(t)) {
        if (o.kind === 'pad' && segPadGap(p, q, t.width, o.pad) <= 1e-6) return true;
        if (o.kind === 'via' && segDist([o.v.x, o.v.y], p, q) <= t.width / 2 + o.v.pad / 2 + 1e-6) return true;
        if (o.kind === 'track') for (const [r, s] of segments(o.t)) if (segSegDist(p, q, r, s) <= (t.width + o.t.width) / 2 + 1e-6) return true;
      }
      return false;
    }
    const [v, o] = a.kind === 'via' ? [a.v, b] : [(b as { v: Via }).v, a];
    if (o.kind === 'pad') return padDist([v.x, v.y], o.pad) <= v.pad / 2 + 1e-6;
    if (o.kind === 'via') return Math.hypot(v.x - o.v.x, v.y - o.v.y) <= (v.pad + o.v.pad) / 2 + 1e-6;
    return false;
  };
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (touch(items[i], items[j])) join(i, j);
  const groups = new Map<number, Item[]>();
  items.forEach((it, k) => { const r = find(k); groups.set(r, [...(groups.get(r) ?? []), it]); });
  return [...groups.values()];
}

export interface Airwire { net: string; a: BoardPad; b: BoardPad; length: number }
export interface Connectivity { airwires: Airwire[]; shorts: { nets: string[]; at: Pt }[] }

/** Missing connections of every net (a minimum spanning tree between its copper islands,
 *  Prim's algorithm on the shortest pad-to-pad distances) and copper joining several nets. */
export function ratsnest(pads: BoardPad[], board: Board): Connectivity {
  const groups = islands(pads, board);
  const groupOf = new Map<BoardPad, number>();
  groups.forEach((g, k) => g.forEach((it) => { if (it.kind === 'pad') groupOf.set(it.pad, k); }));
  const shorts: Connectivity['shorts'] = [];
  for (const g of groups) {
    const nets = [...new Set(g.flatMap((it) => (it.kind === 'pad' && it.pad.net ? [it.pad.net] : [])))];
    if (nets.length > 1) { const p = g.find((it) => it.kind === 'pad') as { pad: BoardPad }; shorts.push({ nets: nets.sort(), at: [p.pad.x, p.pad.y] }); }
  }
  const airwires: Airwire[] = [];
  const byNet = new Map<string, BoardPad[]>();
  for (const p of pads) if (p.net) byNet.set(p.net, [...(byNet.get(p.net) ?? []), p]);
  for (const [net, ps] of byNet) {
    const comps = [...new Set(ps.map((p) => groupOf.get(p)!))];
    if (comps.length < 2) continue;
    const padsOf = comps.map((c) => ps.filter((p) => groupOf.get(p) === c));
    const inTree = new Set([0]);
    while (inTree.size < comps.length) {
      let best: Airwire | null = null, bestC = -1;
      for (const i of inTree) for (let j = 0; j < comps.length; j++) {
        if (inTree.has(j)) continue;
        for (const a of padsOf[i]) for (const b of padsOf[j]) {
          const l = Math.hypot(a.x - b.x, a.y - b.y);
          if (!best || l < best.length) { best = { net, a, b, length: l }; bestC = j; }
        }
      }
      airwires.push(best!);
      inTree.add(bestC);
    }
  }
  return { airwires, shorts };
}
