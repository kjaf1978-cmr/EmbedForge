// The worked designs' boards (decision D43): which schematic, the board's title and revision,
// its size where it is fixed, and the net classes: the power paths' widths (IPC-2221 for their
// current) and the clearances of the mains and high-voltage nets (IEC 62368-1 / IEC 60664-1,
// pollution degree 2, material group IIIb, basic insulation, overvoltage category II).
import type { Part, Sheet } from '../../app/ui/src/eda/schematic';
import { potentialGroup, classFor, type NetClass, type Placed, type PlanTrack, type PlanZone } from '../../app/ui/src/pcb/kicad';
import { stabiliser, changeover1, changeover3, mpptCharger } from '../../app/ui/src/eda/powerExamples';
import { inverterLF } from '../../app/ui/src/eda/inverters';

export interface Design {
  /** The placement plan of the power section (D44): fixed positions (mm) and rotations; the other
   *  parts go into `region` (x range), and the mains routing stays left of `edge` but for the
   *  boundary column of parts with pads on both sides. */
  plan?: Placed[] | (() => Placed[]); tracks?: PlanTrack[]; region?: { x0: number; x1: number; y0?: number; y1?: number }; edge?: number; zones?: PlanZone[];
  /** Areas (mm) the mains routing (stage 1) keeps out of: the relays' coil pins and COM. */
  keep1?: [number, number, number, number][];
  panel?: (p: Part) => boolean;
  /** High-current nets (D45): tracks of the Power class with the solder mask open for a soldered
   *  copper bar; terminals on them become M5 lugs. */
  heavy?: string[];
  /** Off-board parts bolted to this board (lugs for their heavy nets). */
  bolted?: (p: Part) => boolean;
  /** The panel's wire for a net: cross-section and type (wiring list, panel.csv). */
  wire?: (net: string, toBoard: boolean, isMains: boolean) => string;
  sheet: () => Sheet; title: string; revision: string; classes: (s: Sheet) => NetClass[]; w?: number; h?: number; copperOz?: number; fill?: number }

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
    t.push({ net: '+12V', layer: 'B.Cu', width: 0.5, pts: [[93, y + 6], [102, y + 6]] }, { net: coil, layer: 'F.Cu', width: 0.3, pts: [[93, y - 6], [100.5, y - 6]] });
  }
  // the coils' +12V as one rail on the bottom layer (x 102, 5.5 mm from the COM pins); the coil
  // drives cross it on the top layer
  t.push({ net: '+12V', layer: 'B.Cu', width: 0.8, pts: [[102, 76], [102, 198]] });
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
  // each relay's COM net (VIN for K1, the ladder links after it) from its two snubber resistors'
  // pins (1 W, 15.24 mm: 71.62, Y ∓ 4) into COM along Y, between NO and NC (3.95 mm from them and the coil pins)
  // VIN from the input sense transformer's primary (T3 pin 1) down to K1's COM on the bottom
  // layer, right of the tap bundle: 1.5 mm from T3's and T4's N pins, 3.2 mm from K1's coil pins
  t.push({ net: 'VIN', layer: 'B.Cu', width: 1.6, pts: [[77.76, 27], [81, 31], [89, 39], [89, 58], [87, 62], [87, 70], [95, 70]] });
  const com = ['VIN', 'C2N', 'C3N', 'C4N', 'C5N', 'C6N'];
  com.forEach((n, k) => {
    const y = 70 + 20 * k;
    t.push({ net: n, layer: 'F.Cu', width: 1.6, pts: [[71.62, y - 4], [75.62, y], [95, y]] }, { net: n, layer: 'F.Cu', width: 1.6, pts: [[71.62, y + 4], [75.62, y]] });
    if (k > 0) t.push({ net: n, layer: 'F.Cu', width: 1.6, pts: [[80.8, y - 14], [87, y - 8], [87, y]] });
  });
  return t;
})();

const STAB_PLAN: Placed[] = (() => {
  const p: Placed[] = [];
  for (let k = 0; k < 6; k++) {
    const y = 70 + 20 * k;
    p.push({ ref: `K${k + 1}`, x: 95, y, rot: 180 },
      // turned 180°: each resistor's COM pin (1) towards the relay at x 71.62 (1 W, 15.24 mm), the
      // snubber's mid node on the two inner pads (51.75, 56.38), the capacitor's NO / NC pin
      // outside at 44.25 (100 nF 630 V film, 7.5 mm)
      { ref: `C${7 + 2 * k}`, x: 48, y: y - 4, rot: 180 }, { ref: `R${35 + 2 * k}`, x: 64, y: y - 4, rot: 180 },
      { ref: `C${6 + 2 * k}`, x: 48, y: y + 4, rot: 180 }, { ref: `R${34 + 2 * k}`, x: 64, y: y + 4, rot: 180 });
  }
  p.push({ ref: 'K7', x: 95, y: 192, rot: 180 },
    { ref: 'T2', x: 14, y: 120, rot: 270 },
    { ref: 'X1', x: 10, y: 12, rot: 0 }, { ref: 'X2', x: 10, y: 26, rot: 0 }, { ref: 'Q1', x: 30, y: 12, rot: 0 },
    { ref: 'RV1', x: 34, y: 34, rot: 0 }, { ref: 'F1', x: 55, y: 12, rot: 0 },
    { ref: 'T1', x: 93, y: 12, rot: 0 }, { ref: 'T3', x: 93, y: 27, rot: 0 }, { ref: 'T4', x: 93, y: 42, rot: 0 },
    { ref: 'X4', x: 10, y: 192, rot: 0 }, { ref: 'X5', x: 10, y: 204, rot: 0 });
  return p;
})();

/** DIN-rail and chassis parts: on the panel, wired, not on the board. */
const PANEL = new Set(['contactor', 'breaker1', 'breaker2', 'breaker3', 'breaker4', 'terminal']);
// the change-overs' panel wiring: the 32 A circuits in 6 mm² (IEC 60364-5-52, method B2, 30 °C,
// two loaded conductors: 36 A; derate in a hot enclosure), the board's mains feeds (behind the
// breakers, its fuses at 0.2 A) in 1.5 mm², the control in 0.75 mm²; PE green-yellow
const coWire = (net: string, toBoard: boolean, isMains: boolean) =>
  net === 'GND' ? '6 mm² H07V-K green-yellow (PE)' : isMains ? (toBoard ? '1.5 mm² H07V-K' : '6 mm² H07V-K, ferrules') : '0.75 mm² H05V-K';

// The MPPT charger (D45): a power board (4 oz copper) and a control board. The power board
// carries the PV input protection, the buck stage, the battery switch, the shunt, the gate
// driver and the auxiliary supply; the 56 µH 100 A inductor and the 100 A fuse sit off the board,
// bolted to M5 lugs, as are the PV and battery cables. Its high-current nets run as 4 mm tracks
// with the solder mask open, a 4 × 3 mm copper bar soldered along them (12 mm²: 80 A); the
// TO-247 and TO-126 parts stand in a row along the bottom edge, their tabs to the heatsink.
const mppt = () => mpptCharger();
const MPPT_PWR = ['XPVP', 'XPVN', 'RVPV', 'QPV', 'QPV2', 'RGPV', 'DZPV', 'OPV', 'RZA', 'DZA', 'CZA', 'QA', 'CAUX', 'CIN1', 'CIN2', 'CIN3', 'CIN4', 'Q1', 'D1', 'RSN', 'CSN',
  'COUT1', 'COUT2', 'COUT3', 'DTV', 'XBP', 'XBN', 'QB2', 'QB', 'RSH', 'RGB2', 'RGS2', 'DZB2', 'OPB', 'RGS', 'DZB', 'U8', 'DB', 'CB', 'RG', 'CDD'];
const MPPT_OFF = ['L1', 'FB'];
const MPPT_SINK = ['QPV', 'QPV2', 'QA', 'Q1', 'D1', 'QB', 'QB2'];
const MPPT_HEAVY = ['PVP', 'PVN', 'SPV', 'GND', 'SW', 'VO', 'BATP', 'BNB', 'BN', 'BF'];
let mpptCache: { pwr: Set<string>; off: Set<string>; sink: string[]; ref: (k: string) => string } | undefined;
const mpptRefs = () => mpptCache ??= (() => { const { sheet, nb } = mppt(); const ref = (k: string) => nb.refOf(sheet, k); const r = (ks: string[]) => ks.map(ref); return { pwr: new Set(r(MPPT_PWR)), off: new Set(r(MPPT_OFF)), sink: r(MPPT_SINK), ref }; })();
// The power board's plan (by schematic key; mm, 280 × 160): left to right the PV input, the
// auxiliary supply, the buck stage, the output, the battery side. The heatsink row along the bottom
// (y 153, turned 180°: tabs to the edge). The buck's hot loop is short: D1 and Q1 side by side in
// the row, the four input film capacitors stacked right above them, the switch node's lug beside
// them for the inductor's cable; the shunt above the battery MOSFETs; the control connector along
// the top edge
const MPPT_PLAN: [string, number, number, Placed['rot']][] = [
  // heatsink row (y 153): PV protection, auxiliary, buck (D1 left of Q1), battery switch
  ['QPV', 20, 153, 180], ['QPV2', 40, 153, 180], ['QA', 58, 153, 180], ['D1', 80, 153, 180], ['Q1', 100, 153, 180], ['QB', 235, 153, 180], ['QB2', 257, 153, 180],
  ['XPVP', 15, 22, 0], ['XPVN', 15, 47, 0], ['RVPV', 38, 34, 0],
  // the input DC-link capacitors (47 µF 450 V, 57.5 × 35 mm) stacked over D1 and Q1, GND pins to
  // the left (towards D1's anode), PV+ to the right (towards Q1's drain)
  ['CIN1', 95, 130, 180], ['CIN2', 95, 93, 180], ['CIN3', 95, 56, 180], ['CIN4', 95, 19, 180],
  ['COUT1', 170, 135, 0], ['COUT2', 170, 115, 0], ['COUT3', 170, 95, 0], ['DTV', 170, 75, 0],
  ['RSH', 240, 132, 0], ['XBN', 270, 50, 0],
];
const MPPT_LUGS: [string, number, number][] = [['J_SW', 55, 135], ['J_VO', 145, 128], ['J_BATP', 200, 20], ['XBP', 225, 20]];
const mpptPlan = (): Placed[] => { const { ref } = mpptRefs(); return [...MPPT_PLAN.map(([k, x, y, rot]) => ({ ref: ref(k), x, y, rot })), ...MPPT_LUGS.map(([k, x, y]) => ({ ref: k.startsWith('J_') ? k : ref(k), x, y, rot: 0 as const }))]; };
// the high-current paths drawn by the plan (4 mm, the solder mask open for a soldered 4 × 3 mm
// copper bar; F = top, B = bottom layer), at least 0.75 mm from any other pin; the router joins the
// rest at 1 mm
const bar = (net: string, layer: 'F.Cu' | 'B.Cu', pts: [number, number][]): PlanTrack => ({ net, layer, width: 4, pts });
const MPPT_BARS: PlanTrack[] = [
  // PV+: the input lug over the top to the four input capacitors' PV+ pins, down to Q1's drain
  bar('PVP', 'F.Cu', [[15, 22], [22, 8], [121.25, 8], [121.25, 130], [110, 140], [100, 145], [100, 153]]),
  // PV−: its lug down the left edge to QPV's drain; QPV and QPV2 back to back (sources joined)
  bar('PVN', 'F.Cu', [[15, 47], [8, 55], [8, 140], [20, 145], [20, 153]]),
  bar('SPV', 'B.Cu', [[14.55, 153], [14.55, 147], [34.55, 147], [34.55, 153]]),
  // the buck's ground: the input capacitors' GND pins, D1's anode, QPV2's drain, the output
  // capacitors, the TVS and the shunt (bottom layer, under the PV+ bar)
  bar('GND', 'B.Cu', [[68.75, 19], [68.75, 145]]),
  bar('GND', 'B.Cu', [[40, 153], [40, 145], [183.75, 145], [183.75, 95]]),
  bar('GND', 'B.Cu', [[85.45, 145], [85.45, 153]]),
  bar('GND', 'B.Cu', [[183.75, 95], [177.62, 80], [177.62, 75]]),
  bar('GND', 'B.Cu', [[183.75, 135], [230, 132]]),
  // the switch node: D1's cathode and Q1's source to its lug (the inductor's cable)
  bar('SW', 'F.Cu', [[80, 153], [80, 148.5], [94.55, 148.5], [94.55, 153]]),
  bar('SW', 'F.Cu', [[80, 148.5], [62, 148.5], [55, 142], [55, 135]]),
  // the output: its lug (the inductor's and the fuse's cables) to the output capacitors and the TVS
  bar('VO', 'F.Cu', [[145, 128], [150, 128], [156.25, 135], [156.25, 95], [162.38, 80], [162.38, 75]]),
  // the battery: BAT+ (after the fuse) to its lug; BAT− to QB2's drain; the two sources joined;
  // QB's drain to the shunt
  bar('BATP', 'F.Cu', [[200, 20], [225, 20]]),
  bar('BNB', 'F.Cu', [[270, 50], [270, 140], [257, 145], [257, 153]]),
  bar('BN', 'F.Cu', [[229.55, 153], [229.55, 147], [251.55, 147], [251.55, 153]]),
  bar('BF', 'B.Cu', [[235, 153], [235, 140], [250, 132]]),
];
// 0.6 mm: IPC-2221 B2 (outer layers, uncoated) up to 150 V; the PV side reaches 114 V
const POWER = (nets: string[]): NetClass => ({ name: 'Power', patterns: nets.map((n) => `^${n}$`), track: 1, clearance: 0.6 });

// ---- the 50 Hz-transformer inverter (P7a/P7c): a power board (bridge, drivers, bus, shunt) and a
// control board; the battery fuse, contactor, pre-charge resistor and transformer are bolted to
// the chassis, the output filter capacitor, surge arrester and terminals on the output's DIN rail
const LF_OFF = ['F1', 'K1', 'TR1', 'RPC', 'DPC'];
const LF_PANEL = ['COUT', 'RVO', 'X1', 'X3', 'X4', 'X5'];
const lfCache = new Map<number, { pwr: Set<string>; off: Set<string>; panel: Set<string>; ref: (k: string) => string }>();
const lfRefs = (cells: 4 | 8 | 16) => {
  let c = lfCache.get(cells);
  if (!c) {
    const { sheet, nb } = inverterLF({ cells, load: '0' }), ref = (k: string) => nb.refOf(sheet, k);
    const pwr = new Set(sheet.parts.filter((p) => ['bridge', 'bus'].includes(nb.blockOf(p.id))).map((p) => p.ref));
    pwr.add(ref('X2'));
    c = { pwr, off: new Set(LF_OFF.map(ref)), panel: new Set(LF_PANEL.map(ref)), ref };
    lfCache.set(cells, c);
  }
  return c;
};
/** The output line and the divider's middle: 230 V against the control (whose ground is N). */
const lfMains = (): NetClass[] => [{ ...classFor('Mains', ['OUTL', 'DV1'], 0.5, 1.5), apart: 3.2 }];

const LF_HEAVY = ['BUS', 'GND', 'SRC', 'SWA', 'SWB'];
// the power board (D44/D45): twelve TO-247 standing in one row (y 118) on the heatsink, each leg's
// high sides together and its low sides together, the low sides of both legs in the middle;
// above the row the switch nodes (F.Cu) and the shunt's side (B.Cu) as 10 mm copper bars, and
// above them the bus as two planes, ground on F.Cu over the bus on B.Cu (4 oz), with the bus
// capacitors, the shunt and the M5 lugs in them; below the row the gate resistors and drivers
const LF_ROW: [string, number][] = [['QHA1', 20], ['QHA2', 42], ['QHA3', 64], ['QLA1', 86], ['QLA2', 108], ['QLA3', 130],
  ['QLB1', 150], ['QLB2', 172], ['QLB3', 194], ['QHB1', 216], ['QHB2', 238], ['QHB3', 260]];
const LF_FIX: [string, number, number, Placed['rot']][] = [['CE1', 60, 40, 0], ['CE2', 220, 40, 0], ['CB1', 110, 22, 0], ['CB2', 110, 50, 0], ['CB3', 110, 78, 0],
  ['CB4', 180, 22, 0], ['CB5', 180, 50, 0], ['CB6', 180, 78, 0], ['RSH', 145, 88, 0], ['X2', 20, 40, 0]];
const LF_LUGS: [string, number, number][] = [['J_BUS', 20, 15], ['J_GND', 20, 66], ['J_SWA', 70, 88], ['J_SWB', 210, 88]];
const lfPlan = (): Placed[] => {
  const { ref } = lfRefs(16);
  return [...LF_ROW.map(([k, x]) => ({ ref: ref(k), x, y: 118, rot: 0 as const })),
    // the gate resistors standing under their gates (pad 2, the gate, up)
    ...LF_ROW.map(([k, x]) => ({ ref: ref(`RG${k.slice(1)}`), x: x - 5.45, y: 131, rot: 90 as const })),
    ...LF_FIX.map(([k, x, y, rot]) => ({ ref: ref(k), x, y, rot })), ...LF_LUGS.map(([k, x, y]) => ({ ref: k, x, y, rot: 0 as const }))];
};
const LF_BARS: PlanTrack[] = (() => {
  const t: PlanTrack[] = [], stub = (net: string, layer: 'F.Cu' | 'B.Cu', x: number, y1: number) => t.push({ net, layer, width: 4, pts: [[x, 118], [x, y1]] });
  for (const x of [25.45, 47.45, 69.45, 86, 108, 130]) stub('SWA', 'F.Cu', x, 105);
  for (const x of [150, 172, 194, 221.45, 243.45, 265.45]) stub('SWB', 'F.Cu', x, 105);
  for (const x of [91.45, 113.45, 135.45, 155.45, 177.45, 199.45]) stub('SRC', 'B.Cu', x, 105);
  for (const x of [20, 42, 64, 216, 238, 260]) stub('BUS', 'B.Cu', x, 97);
  t.push({ net: 'SWA', layer: 'F.Cu', width: 10, pts: [[25.45, 105], [130, 105]] }, { net: 'SWA', layer: 'F.Cu', width: 6, pts: [[70, 105], [70, 88]] },
    { net: 'SWB', layer: 'F.Cu', width: 10, pts: [[150, 105], [265.45, 105]] }, { net: 'SWB', layer: 'F.Cu', width: 6, pts: [[210, 105], [210, 88]] },
    { net: 'SRC', layer: 'B.Cu', width: 10, pts: [[91.45, 105], [199.45, 105]] }, { net: 'SRC', layer: 'B.Cu', width: 6, pts: [[135, 105], [135, 88]] });
  return t;
})();
const LF_PLANES: PlanZone[] = [
  { net: 'GND', layer: 'F.Cu', pts: [[3, 3], [277, 3], [277, 98.5], [3, 98.5]] },
  { net: 'BUS', layer: 'B.Cu', pts: [[3, 3], [277, 3], [277, 98.5], [3, 98.5]] },
];

export const DESIGNS: Record<string, Design> = {
  'inverter-lf-48-power': { sheet: () => inverterLF({ load: '0' }).sheet, title: 'Inverter 48 V 5 kW, 50 Hz transformer: power board', revision: 'A', classes: () => [POWER(LF_HEAVY)], copperOz: 4,
    heavy: LF_HEAVY, panel: (p) => !lfRefs(16).pwr.has(p.ref), bolted: (p) => lfRefs(16).off.has(p.ref), w: 280, h: 170,
    plan: lfPlan, tracks: LF_BARS, zones: LF_PLANES, region: { x0: 0, x1: 280, y0: 124, y1: 170 } },
  'inverter-lf-48-control': { sheet: () => inverterLF({ load: '0' }).sheet, title: 'Inverter 48 V 5 kW, 50 Hz transformer: control board', revision: 'A', classes: lfMains, fill: 2.6, w: 260, h: 190,
    panel: (p) => { const r = lfRefs(16); return r.pwr.has(p.ref) || r.off.has(p.ref) || r.panel.has(p.ref); } },
  stabiliser: { sheet: () => stabiliser().sheet, title: 'Mains voltage stabiliser 1 kVA', revision: 'A', classes: mains(['L_IN', 'N']), w: 230, h: 212, plan: STAB_PLAN, tracks: STAB_TRACKS, region: { x0: 105, x1: 230 }, edge: 99,
    keep1: [0, 1, 2, 3, 4, 5, 6].map((k): [number, number, number, number] => { const y = k < 6 ? 70 + 20 * k : 192; return [88, y - 9, 99, y + 9]; }) },
  // the change-overs switch 32 A: the contactors, breakers and power terminals sit on the DIN rail
  // (panel.csv is their wiring); the board carries the sense and auxiliary transformers' fuses and
  // connectors, the MOVs (after the breakers) and the control, its mains and its control nets on
  // two connectors to the panel
  'changeover-1p': { sheet: () => changeover1().sheet, title: 'Mains change-over 1P (control board)', revision: 'A', classes: mains(['LM_IN', 'NM', 'LB_IN', 'NB']), panel: (p) => PANEL.has(p.sym), wire: coWire },
  'changeover-3p': { sheet: () => changeover3().sheet, title: 'Mains change-over 3P+N (control board)', revision: 'A', classes: mains(['LM1', 'LM2', 'LM3', 'NM', 'LB1', 'LB2', 'LB3', 'NB']), panel: (p) => PANEL.has(p.sym), wire: coWire, fill: 3.0 },
  'mppt-power': { sheet: () => mppt().sheet, title: 'MPPT solar charger 48 V, 80 A: power board', revision: 'A', classes: () => [POWER(MPPT_HEAVY)], copperOz: 4,
    heavy: MPPT_HEAVY, panel: (p) => !mpptRefs().pwr.has(p.ref), bolted: (p) => mpptRefs().off.has(p.ref), w: 280, h: 160,
    plan: mpptPlan, tracks: MPPT_BARS, region: { x0: 0, x1: 280 } },
  'mppt-control': { sheet: () => mppt().sheet, title: 'MPPT solar charger 48 V, 80 A: control board', revision: 'A', classes: () => [], fill: 2.6, panel: (p) => mpptRefs().pwr.has(p.ref) || mpptRefs().off.has(p.ref) },
};
