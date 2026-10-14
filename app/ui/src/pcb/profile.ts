// Fabrication capability profiles (PCB-05). The shipped default is EF-PROTO-STD v1.0.0 from
// docs/phase0/f_fab_profile.md: the strictest published limits of five prototype fabs plus a
// margin. Users may add their own profiles; every profile carries a version.

import type { Footprint, Pad } from './footprint';

export interface FabProfile {
  id: string;
  version: string;
  name: string;
  /** All lengths in mm. */
  minTrack: number;
  minClearance: number;
  viaDrill: [number, number];
  minViaPad: number;
  viaRing: number;
  /** Plated component holes: at least this; none between viaDrill max and this. */
  minPthDrill: number;
  maxPthDrill: number;
  minNpthDrill: number;
  pthRing: number;
  /** Hole edge to hole edge on different nets. */
  holeToHole: number;
  copperToEdge: number;
  silkStroke: number;
  silkTextHeight: number;
  silkToPad: number;
  maskExpansion: number;
  copperUm: number;
  thickness: number;
}

export const EF_PROTO_STD: FabProfile = {
  id: 'EF-PROTO-STD', version: '1.0.0', name: 'NETApps standard prototype (FR-4 1.6 mm, 1–2 layers)',
  minTrack: 0.25, minClearance: 0.20, viaDrill: [0.35, 0.45], minViaPad: 0.75, viaRing: 0.20,
  minPthDrill: 0.60, maxPthDrill: 5.5, minNpthDrill: 0.60, pthRing: 0.30, holeToHole: 0.50,
  copperToEdge: 0.50, silkStroke: 0.15, silkTextHeight: 1.0, silkToPad: 0.15, maskExpansion: 0.05,
  copperUm: 35, thickness: 1.6,
};

export const PROFILES: FabProfile[] = [EF_PROTO_STD];

/** Annular ring of a through-hole pad: the narrowest copper around the hole. */
export const ring = (p: Pad) => (Math.min(p.w, p.h) - (p.drill ?? 0)) / 2;

/** Edge-to-edge gap between two pads (rectangles for rect, circles for circle, stadiums for oval). */
export function padGap(a: Pad, b: Pad): number {
  // approximate each pad by its rectangle with the corners rounded by min(w, h)/2 for circles
  // and ovals: the gap between two rounded rectangles
  const ra = a.shape === 'rect' ? 0 : Math.min(a.w, a.h) / 2, rb = b.shape === 'rect' ? 0 : Math.min(b.w, b.h) / 2;
  const dx = Math.max(0, Math.abs(a.x - b.x) - (a.w / 2 - ra) - (b.w / 2 - rb));
  const dy = Math.max(0, Math.abs(a.y - b.y) - (a.h / 2 - ra) - (b.h / 2 - rb));
  return Math.hypot(dx, dy) - ra - rb;
}

export interface FootprintIssue { pad: string; rule: string; message: string }

/** A footprint against a profile (PCB-02 with finding 3 of the fab-profile study): rings,
 *  drills, copper clearance and hole spacing between pads, silkscreen clear of the pads.
 *  Pads in `samePin` groups (one pin, several pads) may be closer than the clearance. */
export function checkFootprint(fp: Footprint, pr: FabProfile = EF_PROTO_STD, samePin: string[][] = []): FootprintIssue[] {
  const out: FootprintIssue[] = [];
  const same = (a: string, b: string) => samePin.some((g) => g.includes(a) && g.includes(b));
  for (const p of fp.pads) {
    if (p.drill === undefined) continue;
    if (p.drill < pr.minPthDrill) out.push({ pad: p.id, rule: 'drill', message: `pad ${p.id}: drill ${p.drill} mm is below ${pr.minPthDrill} mm` });
    if (p.drill > pr.maxPthDrill) out.push({ pad: p.id, rule: 'drill', message: `pad ${p.id}: drill ${p.drill} mm is above ${pr.maxPthDrill} mm` });
    if (ring(p) < pr.pthRing - 1e-9) out.push({ pad: p.id, rule: 'ring', message: `pad ${p.id}: annular ring ${ring(p).toFixed(3)} mm is below ${pr.pthRing} mm` });
  }
  for (let i = 0; i < fp.pads.length; i++) for (let j = i + 1; j < fp.pads.length; j++) {
    const a = fp.pads[i], b = fp.pads[j];
    if (same(a.id, b.id)) continue;
    const g = padGap(a, b);
    if (g < pr.minClearance - 1e-9) out.push({ pad: a.id, rule: 'clearance', message: `pads ${a.id} and ${b.id}: ${g.toFixed(3)} mm apart, below ${pr.minClearance} mm` });
    if (a.drill !== undefined && b.drill !== undefined) {
      const hh = Math.hypot(a.x - b.x, a.y - b.y) - a.drill / 2 - b.drill / 2;
      if (hh < pr.holeToHole - 1e-9) out.push({ pad: a.id, rule: 'hole', message: `holes of pads ${a.id} and ${b.id}: ${hh.toFixed(3)} mm apart, below ${pr.holeToHole} mm` });
    }
  }
  for (const s of fp.silk) for (const p of fp.pads) {
    const d = silkToPad(s, p);
    if (d < pr.silkToPad - 1e-9) out.push({ pad: p.id, rule: 'silk', message: `silkscreen ${d.toFixed(3)} mm from pad ${p.id}, below ${pr.silkToPad} mm` });
  }
  return out;
}

/** Distance from a silkscreen stroke (its edge, half the stroke width out) to a pad's copper. */
function silkToPad(s: import('./footprint').Silk, p: Pad, stroke = 0.15): number {
  // sample the stroke and take the smallest gap to the pad, treated as a rounded rectangle
  const pts: [number, number][] = [];
  if (s.t === 'line') for (let k = 0; k <= 40; k++) pts.push([s.x1 + ((s.x2 - s.x1) * k) / 40, s.y1 + ((s.y2 - s.y1) * k) / 40]);
  else for (let k = 0; k < 120; k++) pts.push([s.x + s.r * Math.cos((k * Math.PI) / 60), s.y + s.r * Math.sin((k * Math.PI) / 60)]);
  const rr = p.shape === 'rect' ? 0 : Math.min(p.w, p.h) / 2;
  let best = Infinity;
  for (const [x, y] of pts) {
    const dx = Math.max(0, Math.abs(x - p.x) - (p.w / 2 - rr)), dy = Math.max(0, Math.abs(y - p.y) - (p.h / 2 - rr));
    best = Math.min(best, Math.hypot(dx, dy) - rr - stroke / 2);
  }
  return best;
}
