// The worked designs' boards (decision D43): which schematic, the board's title and revision,
// its size where it is fixed, and the net classes: the power paths' widths (IPC-2221 for their
// current) and the clearances of the mains and high-voltage nets (IEC 62368-1 / IEC 60664-1,
// pollution degree 2, material group IIIb, basic insulation, overvoltage category II).
import type { Part, Sheet } from '../../app/ui/src/eda/schematic';
import { potentialGroup, classFor, type NetClass, type Placed, type PlanTrack } from '../../app/ui/src/pcb/kicad';
import { stabiliser, changeover1, changeover3, mpptCharger } from '../../app/ui/src/eda/powerExamples';

export interface Design {
  /** The placement plan of the power section (D44): fixed positions (mm) and rotations; the other
   *  parts go into `region` (x range), and the mains routing stays left of `edge` but for the
   *  boundary column of parts with pads on both sides. */
  plan?: Placed[]; tracks?: PlanTrack[]; region?: { x0: number; x1: number }; edge?: number;
  panel?: (p: Part) => boolean; sheet: () => Sheet; title: string; revision: string; classes: (s: Sheet) => NetClass[]; w?: number; h?: number; copperOz?: number; fill?: number }

// 230 V mains (300 V r.m.s. working voltage): 3.2 mm, the creepage of basic insulation (IEC
// 62368-1 table 17, pollution degree 2, material group IIIb), taken as the copper clearance on
// the board between a mains net and any other net. The control side is earthed (PE), so basic
// insulation suffices between it and the mains. Tracks 1.6 mm: 7 A at 20 K rise in 2 oz copper
// (IPC-2221 gives 1.45 mm; the stabiliser's highest current, 1 kVA at 140 V in)
// Between two mains nets 1.5 mm (functional insulation: the taps differ by 20 … 40 V, L and N by
// 230 V, which 1.5 mm in pollution degree 2 carries; IEC 62368-1 needs only that a short there
// is safe, and the breaker and fuse cover it); the 3.2 mm hold between the mains and every other
// net (the rule in board.kicad_dru for KiCad's check, a class-to-class rule for the router)
const mains = (seeds: string[], track = 1.6) => (s: Sheet): NetClass[] => [{ ...classFor('Mains', potentialGroup(s, seeds), track, 1.5), apart: 3.2 }];

// The stabiliser's power section (D44): the relay ladder K1 … K6 in a column at x 95, 20 mm apart,
// contacts to the left (rotated 180°: COM at x 95, NC and NO 14.2 mm left, the coil's pads 2 mm
// left of COM, reached from the control side above and below COM); each relay's two snubbers
// (COM–NO above, COM–NC below) in two rows to its left, with an 8.8 mm channel between relays for
// the tap tracks; the tap block on the left edge (N at the top, then T1 … T7 in the relays'
// order); input terminals, breaker, MOV and fuse at the top left; the three transformer
// connectors at the top of the boundary, primaries left, secondaries right; the output relay K7
// and the output terminals at the bottom. The control circuits fill x 100 … 210.
// The relay's pin-out puts COM 2 mm from its coil pins (6 mm above and below it): the plan draws
// the coil pins' stubs straight out to the control zone (x 100), 4.6 mm from COM, and each link of
// the ladder (NC of one relay to COM of the next) down the middle of the 9.5 mm between the next
// relay's coil pins (3.95 mm from them); the control routing then stays right of x 99
const STAB_TRACKS: PlanTrack[] = (() => {
  const t: PlanTrack[] = [];
  for (let k = 0; k < 7; k++) {
    const y = k < 6 ? 70 + 20 * k : 192, coil = k < 6 ? `K${k + 1}` : 'KD';
    t.push({ net: '+12V', layer: 'F.Cu', width: 0.5, pts: [[93, y + 6], [100.5, y + 6]] }, { net: coil, layer: 'F.Cu', width: 0.3, pts: [[93, y - 6], [100.5, y - 6]] });
  }
  // the taps: relay k's NO (80.8, Y − 6) through the channel between relays (Y − 10) to its own
  // vertical (x 22 … 32.5, 3.5 mm apart, inner to outer in the order the taps are reached, so no two
  // cross) and along to its pad on the tap block (x 14, T1 at 100.95 mm, 7.62 mm apart); on the
  // bottom layer, the ladder links on the top. T7 (K6's NC) below the last relay. T5 also feeds the
  // output relay K7 (into its COM between NO and NC, 3.95 mm from its coil pins) and the output
  // sense transformer T4 (top layer, x 40)
  const tapY = (k: number) => 100.95 + 7.62 * (k - 1);
  const vx = [22, 25.5, 29, 32.5, 25.5, 22];
  for (let k = 1; k <= 6; k++) {
    const y = 70 + 20 * (k - 1), ch = y - 10;
    t.push({ net: `T${k}`, layer: 'B.Cu', width: 1.6, pts: [[80.8, y - 6], [76.8, ch], [vx[k - 1], ch], [vx[k - 1], tapY(k)], [14, tapY(k)]] });
  }
  t.push({ net: 'T7', layer: 'B.Cu', width: 1.6, pts: [[80.8, 176], [76.8, 180], [18.5, 180], [18.5, tapY(7)], [14, tapY(7)]] });
  t.push({ net: 'T5', layer: 'F.Cu', width: 1.6, pts: [[14, tapY(5)], [8, tapY(5) + 6], [8, 176], [40, 184], [40, 192], [95, 192]] });
  t.push({ net: 'T5', layer: 'F.Cu', width: 1.6, pts: [[77.76, 42], [77.76, 50], [40, 50], [40, tapY(5)], [14, tapY(5)]] });
  // VIN into K1's COM the same way as the ladder links, from its snubber resistor R35 (top layer)
  t.push({ net: 'VIN', layer: 'F.Cu', width: 1.6, pts: [[58.92, 66], [62.92, 70], [95, 70]] });
  const chain = ['C2N', 'C3N', 'C4N', 'C5N', 'C6N'];
  chain.forEach((n, k) => { const y = 70 + 20 * k; t.push({ net: n, layer: 'F.Cu', width: 1.6, pts: [[80.8, y + 6], [87, y + 12], [87, y + 20], [95, y + 20]] }); });
  return t;
})();

const STAB_PLAN: Placed[] = (() => {
  const p: Placed[] = [];
  for (let k = 0; k < 6; k++) {
    const y = 70 + 20 * k;
    p.push({ ref: `K${k + 1}`, x: 95, y, rot: 180 },
      { ref: `C${7 + 2 * k}`, x: 50, y: y - 4, rot: 0 }, { ref: `R${35 + 2 * k}`, x: 64, y: y - 4, rot: 0 },
      { ref: `C${6 + 2 * k}`, x: 50, y: y + 4, rot: 0 }, { ref: `R${34 + 2 * k}`, x: 64, y: y + 4, rot: 0 });
  }
  p.push({ ref: 'K7', x: 95, y: 192, rot: 180 },
    { ref: 'T2', x: 14, y: 120, rot: 270 },
    { ref: 'X1', x: 10, y: 12, rot: 0 }, { ref: 'X2', x: 10, y: 26, rot: 0 }, { ref: 'Q1', x: 30, y: 12, rot: 0 },
    { ref: 'RV1', x: 34, y: 34, rot: 0 }, { ref: 'F1', x: 55, y: 12, rot: 0 },
    { ref: 'T1', x: 93, y: 12, rot: 0 }, { ref: 'T3', x: 93, y: 27, rot: 0 }, { ref: 'T4', x: 93, y: 42, rot: 0 },
    { ref: 'X4', x: 10, y: 192, rot: 0 }, { ref: 'X5', x: 10, y: 204, rot: 0 });
  return p;
})();

export const DESIGNS: Record<string, Design> = {
  stabiliser: { sheet: () => stabiliser().sheet, title: 'Mains voltage stabiliser 1 kVA', revision: 'A', classes: mains(['L_IN', 'N']), w: 210, h: 212, plan: STAB_PLAN, tracks: STAB_TRACKS, region: { x0: 100, x1: 210 }, edge: 99 },
  'changeover-1p': { sheet: () => changeover1().sheet, title: 'Mains change-over 1P', revision: 'A', classes: () => [] },
  'changeover-3p': { sheet: () => changeover3().sheet, title: 'Mains change-over 3P+N', revision: 'A', classes: () => [] },
  'mppt-charger': { sheet: () => mpptCharger().sheet, title: 'MPPT solar charger 48 V', revision: 'A', classes: () => [] },
};
