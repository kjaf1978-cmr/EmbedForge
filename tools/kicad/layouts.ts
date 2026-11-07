// The worked designs' boards (decision D43): which schematic, the board's title and revision,
// its size where it is fixed, and the net classes: the power paths' widths (IPC-2221 for their
// current) and the clearances of the mains and high-voltage nets (IEC 62368-1 / IEC 60664-1,
// pollution degree 2, material group IIIb, basic insulation, overvoltage category II).
import type { Part, Sheet } from '../../app/ui/src/eda/schematic';
import { potentialGroup, classFor, type NetClass } from '../../app/ui/src/pcb/kicad';
import { stabiliser, changeover1, changeover3, mpptCharger } from '../../app/ui/src/eda/powerExamples';

export interface Design { panel?: (p: Part) => boolean; sheet: () => Sheet; title: string; revision: string; classes: (s: Sheet) => NetClass[]; w?: number; h?: number; copperOz?: number; fill?: number }

// 230 V mains (300 V r.m.s. working voltage): 3.2 mm, the creepage of basic insulation (IEC
// 62368-1 table 17, pollution degree 2, material group IIIb), taken as the copper clearance on
// the board between a mains net and any other net. The control side is earthed (PE), so basic
// insulation suffices between it and the mains. Tracks 1.6 mm: 7 A at 20 K rise in 2 oz copper
// (IPC-2221 gives 1.45 mm; the stabiliser's highest current, 1 kVA at 140 V in)
const mains = (seeds: string[], track = 1.6) => (s: Sheet): NetClass[] => [classFor('Mains', potentialGroup(s, seeds), track, 3.2)];

export const DESIGNS: Record<string, Design> = {
  stabiliser: { sheet: () => stabiliser().sheet, title: 'Mains voltage stabiliser 1 kVA', revision: 'A', classes: mains(['L_IN', 'N']), fill: 2.8 },
  'changeover-1p': { sheet: () => changeover1().sheet, title: 'Mains change-over 1P', revision: 'A', classes: () => [] },
  'changeover-3p': { sheet: () => changeover3().sheet, title: 'Mains change-over 3P+N', revision: 'A', classes: () => [] },
  'mppt-charger': { sheet: () => mpptCharger().sheet, title: 'MPPT solar charger 48 V', revision: 'A', classes: () => [] },
};
