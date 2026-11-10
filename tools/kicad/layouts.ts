// The worked designs' boards (decision D43): which schematic, the board's title and revision,
// its size where it is fixed, and the net classes: the power paths' widths (IPC-2221 for their
// current) and the clearances of the mains and high-voltage nets (IEC 62368-1 / IEC 60664-1,
// pollution degree 2, material group IIIb, basic insulation, overvoltage category II).
import { gateController } from '../../app/ui/src/eda/gate';
import { pumpControl } from '../../app/ui/src/eda/pumpControl';
import { trimmer } from '../../app/ui/src/eda/trimmer';
import { blockMachine } from '../../app/ui/src/eda/blockMachine';
import { stabiliserT } from '../../app/ui/src/eda/stabiliserT';
import { irrigationMain, irrigationModule } from '../../app/ui/src/eda/irrigationBoards';
import type { Part, Sheet } from '../../app/ui/src/eda/schematic';
import { connectivity } from '../../app/ui/src/eda/connectivity';
import { potentialGroup, classFor, type NetClass, type Placed, type PlanTrack, type PlanZone } from '../../app/ui/src/pcb/kicad';
import { stabiliser, changeover1, changeover3, mpptCharger } from '../../app/ui/src/eda/powerExamples';
import { inverterLF, inverterHF } from '../../app/ui/src/eda/inverters';

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
  /** Copper added after the autorouter (route.py, before the zone fill and DRC): pours and tracks
   *  that close what Freerouting left, laid where the routed board has room. */
  post?: { zones?: PlanZone[]; tracks?: PlanTrack[]; vias?: { net: string; at: [number, number] }[] };
  /** Poles a panel connector block has at most (default 14). */
  block?: number;
  /** Route in one pass with the insulation rules (a board almost all high voltage: the staged
   *  routing, without the class-to-class rules, left 74 clearance errors). */
  oneStage?: boolean;
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
const MPPT_PWR = ['XPVP', 'XPVN', 'RVPV', 'DTVP', 'QPV', 'QPV2', 'RGPV', 'DZPV', 'OPV', 'RZA', 'DZA', 'CZA', 'QA', 'CAUX', 'CIN1', 'CIN2', 'CIN3', 'CIN4', 'Q1', 'D1', 'RSN', 'CSN',
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
  // the PV input's 5 kW TVS (P5): beside the varistor, across PV+ and PV−
  ['DTVP', 38, 62, 90],
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
// the 12 V unit's six bus capacitors (4700 µF 35 V snap-in, 25 mm): three each side of the film
// capacitors, where the 48 V unit has its two 35 mm ones
const LF12_CE: [string, number, number, Placed['rot']][] = [['CE1', 42, 28, 0], ['CE3', 72, 28, 0], ['CE5', 57, 62, 0], ['CE2', 212, 28, 0], ['CE4', 242, 28, 0], ['CE6', 227, 62, 0]];
const lfPlan = (cells: 4 | 8 | 16 = 16): Placed[] => {
  const { ref } = lfRefs(cells);
  const fix = cells === 4 ? [...LF_FIX.filter(([k]) => !k.startsWith('CE')), ...LF12_CE] : LF_FIX;
  return [...LF_ROW.map(([k, x]) => ({ ref: ref(k), x, y: 118, rot: 0 as const })),
    // the gate resistors standing under their gates (pad 2, the gate, up)
    ...LF_ROW.map(([k, x]) => ({ ref: ref(`RG${k.slice(1)}`), x: x - 5.45, y: 131, rot: 90 as const })),
    ...fix.map(([k, x, y, rot]) => ({ ref: ref(k), x, y, rot })), ...LF_LUGS.map(([k, x, y]) => ({ ref: k, x, y, rot: 0 as const }))];
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

// ---- the high-frequency inverter (P7b): power board (DC-DC bridge, bus, rectifier, high-voltage
// bus, sine bridge) and one control board for both sides: its high-voltage side (everything
// from HVG and HBUS up to the optocouplers and transformers) 2.5 mm from the rest (IPC-2221 B2,
// 500 V: the battery side is no separated circuit, its negative is bonded to PE with the
// output's N and the sine bridge's leg B joins the two sides; 8 mm, a reinforced barrier, could
// not be routed in 80 minutes), the output line 3.2 mm
const HF_PWR_BLOCKS = new Set(['dc-dc bridge', 'bus', 'current sense', 'dc-dc output', 'bridge']);
// TCT: the bus current transformer is a window type on the busbar from J_BUS to J_BUSD
const HF_OFF = ['F1', 'K1', 'RPC', 'DPC', 'TR1', 'LF1', 'TCT'];
const HF_PANEL = ['COUT', 'RVO', 'X1', 'X3', 'X4', 'X5'];
type HfRefs = { pwr: Set<string>; lv: Set<string>; hvp: Set<string>; off: Set<string>; panel: Set<string>; hv: Set<string>; ctlHv: Set<string>; ref: (k: string) => string };
const hfCache = new Map<number, HfRefs>();
const hfRefs = (cells: 4 | 8 | 16 = 16): HfRefs => { let r = hfCache.get(cells); if (!r) { r = hfRefsOf(cells); hfCache.set(cells, r); } return r; };
const hfRefsOf = (cells: 4 | 8 | 16): HfRefs => {
  const { sheet, nb } = inverterHF({ cells, load: '0' }), ref = (k: string) => nb.refOf(sheet, k);
  const off = new Set(HF_OFF.map(ref));
  const pwr = new Set(sheet.parts.filter((p) => HF_PWR_BLOCKS.has(nb.blockOf(p.id)) && !off.has(p.ref)).map((p) => p.ref));
  pwr.add(ref('X2'));
  const lv = new Set(sheet.parts.filter((p) => ['dc-dc bridge', 'bus', 'current sense'].includes(nb.blockOf(p.id)) && !off.has(p.ref)).map((p) => p.ref));
  lv.add(ref('X2'));
  const hvp = new Set([...pwr].filter((r) => !lv.has(r)));
  const sub = { ...sheet, parts: sheet.parts.filter((p) => !HF_PWR_BLOCKS.has(nb.blockOf(p.id)) && !['output', 'bench', 'load', 'battery'].includes(nb.blockOf(p.id))) };
  const hv = potentialGroup(sub, ['HVG', 'HBUS'], new Set(['GND', 'OUTL'])), panel = new Set(HF_PANEL.map(ref));
  // the control parts with a pin on the 380 V side (the optocouplers and pulse transformers that
  // span the barrier among them): the 380 V control board; the others the battery-side one
  const c = connectivity(sheet);
  const ctlHv = new Set(sub.parts.filter((p) => !pwr.has(p.ref) && !off.has(p.ref) && !panel.has(p.ref) && p.props.scope !== 'test'
    && [...c.pinNet.entries()].some(([k, n]) => k.startsWith(`${p.ref}.`) && hv.has(n))).map((p) => p.ref));
  return { pwr, lv, hvp, off, panel, hv, ctlHv, ref };
};
// the power board (D44/D45): the DC-DC bridge's eight TO-247 (each leg: its low pair, then its
// high pair; leg B mirrored) and the sine bridge's four IGBTs in one row (y 150); the switch
// nodes LA, LB (F.Cu) and the drains BUSD (B.Cu) as 8 mm bars above it; above them the battery
// bus as planes (BUS on F.Cu over GND on B.Cu) with its capacitors and the bus current
// transformer, and on the right, 10 mm away, the 380 V bus as planes (HVG on F.Cu over HBUS on
// B.Cu) with its capacitors and shunt. The board is conformal-coated (IPC-CC-830): the high-voltage
// nets keep 0.8 mm among themselves (IPC-2221 B4, 301–500 V) and 1.5 mm to the battery side (2.5 mm
// uncoated could not be met at the drivers' own 2.54 mm pins: 129 connections left unrouted)
const HF_LV_HEAVY = ['BUS', 'BUSD', 'GND', 'LA', 'LB'];
const hfPowerHv = (cells: 4 | 8 | 16 = 16) => { const { sheet } = { sheet: inverterHF({ cells, load: '0' }).sheet }; return [...potentialGroup(sheet, ['HVG', 'HBUS'], new Set(['GND', 'OUTL']))].filter((n) => !HF_LV_HEAVY.includes(n)); };
const HF_ROW: [string, number][] = [['QLA1', 20], ['QLA2', 40], ['QHA1', 60], ['QHA2', 80], ['QHB2', 100], ['QHB1', 120], ['QLB1', 140], ['QLB2', 160],
  ['QIHA', 200], ['QILA', 222], ['QIHB', 248], ['QILB', 276]];
const HF_FIX: [string, number, number, Placed['rot']][] = [['CE1', 55, 30, 0], ['CE2', 55, 80, 0], ['CB1', 105, 20, 0], ['CB2', 105, 50, 0], ['CB3', 105, 80, 0],
  ['CB4', 150, 20, 0], ['CB5', 150, 50, 0], ['CB6', 150, 80, 0], ['CBD1', 75, 126, 0], ['CBD2', 105, 126, 0], ['X2', 15, 40, 0],
  ['CH1', 210, 25, 0], ['CH2', 255, 25, 0], ['CH3', 210, 68, 0], ['CH4', 255, 68, 0], ['CHF1', 225, 92, 0], ['CHF2', 270, 92, 0], ['RSHI', 245, 110, 180]];
const HF_LUGS: [string, number, number][] = [['J_BUS', 15, 15], ['J_GND', 15, 65], ['J_LA', 40, 110], ['J_LB', 130, 110], ['J_SWA', 214, 112], ['J_GND', 290, 112], ['J_BUSD', 86.19, 108]];
const hfPlan = (cells: 4 | 8 | 16 = 16): Placed[] => {
  const { ref } = hfRefs(cells);
  const gate = (k: string) => `RG${k.slice(1)}`;
  return [...HF_ROW.map(([k, x]) => ({ ref: ref(k), x, y: 150, rot: 0 as const })),
    ...HF_ROW.map(([k, x]) => ({ ref: ref(gate(k)), x: x - 5.45, y: 163, rot: 90 as const })),
    ...HF_FIX.map(([k, x, y, rot]) => ({ ref: ref(k), x, y, rot })), ...HF_LUGS.map(([k, x, y]) => ({ ref: k, x, y, rot: 0 as const }))];
};
const HF_BARS: PlanTrack[] = (() => {
  const t: PlanTrack[] = [], stub = (net: string, layer: 'F.Cu' | 'B.Cu', x: number, y1: number, w = 4) => t.push({ net, layer, width: w, pts: [[x, 150], [x, y1]] });
  for (const x of [20, 40, 65.45, 85.45]) stub('LA', 'F.Cu', x, 137);
  for (const x of [105.45, 125.45, 140, 160]) stub('LB', 'F.Cu', x, 137);
  for (const x of [60, 80, 100, 120]) stub('BUSD', 'B.Cu', x, 137);
  for (const x of [25.45, 45.45, 145.45, 165.45]) stub('GND', 'B.Cu', x, 119);
  t.push({ net: 'LA', layer: 'F.Cu', width: 8, pts: [[20, 137], [85.45, 137]] }, { net: 'LA', layer: 'F.Cu', width: 6, pts: [[40, 137], [40, 110]] },
    { net: 'LB', layer: 'F.Cu', width: 8, pts: [[105.45, 137], [160, 137]] }, { net: 'LB', layer: 'F.Cu', width: 6, pts: [[130, 137], [130, 110]] },
    { net: 'BUSD', layer: 'B.Cu', width: 8, pts: [[60, 137], [120, 137]] }, { net: 'BUSD', layer: 'B.Cu', width: 6, pts: [[86.19, 137], [86.19, 110]] },
    { net: 'BUSD', layer: 'B.Cu', width: 3, pts: [[70, 126], [70, 137]] }, { net: 'BUSD', layer: 'B.Cu', width: 3, pts: [[100, 126], [100, 137]] });
  // the sine bridge (3 mm stubs: 2.45 mm between a collector's and its emitter's): HBUS (B.Cu)
  // from the high collectors into its plane; SWA (F.Cu) to its lug; SRC (F.Cu) to the shunt; GND
  // (B.Cu) to the N lug. Leg B's high side first, so GND and HBUS never cross
  for (const x of [200, 248]) stub('HBUS', 'B.Cu', x, 117, 3);
  for (const x of [205.45, 222]) stub('SWA', 'F.Cu', x, 137, 3);
  for (const x of [227.45, 281.45]) stub('SRC', 'F.Cu', x, 143, 3);
  for (const x of [253.45, 276]) stub('GND', 'B.Cu', x, 140, 3);
  t.push({ net: 'SWA', layer: 'F.Cu', width: 4, pts: [[205.45, 137], [222, 137]] }, { net: 'SWA', layer: 'F.Cu', width: 4, pts: [[214, 137], [214, 112]] },
    { net: 'SRC', layer: 'F.Cu', width: 4, pts: [[227.45, 143], [281.45, 143]] }, { net: 'SRC', layer: 'F.Cu', width: 4, pts: [[255, 143], [255, 110]] },
    { net: 'GND', layer: 'B.Cu', width: 4, pts: [[253.45, 140], [290, 140]] }, { net: 'GND', layer: 'B.Cu', width: 4, pts: [[290, 140], [290, 112]] });
  return t;
})();
const HF_PLANES: PlanZone[] = [
  { net: 'BUS', layer: 'F.Cu', pts: [[3, 3], [175, 3], [175, 120], [3, 120]] },
  { net: 'GND', layer: 'B.Cu', pts: [[3, 3], [175, 3], [175, 120], [3, 120]] },
  { net: 'HVG', layer: 'F.Cu', pts: [[186, 3], [297, 3], [297, 118], [186, 118]] },
  { net: 'HBUS', layer: 'B.Cu', pts: [[186, 3], [297, 3], [297, 118], [186, 118]] },
];
// the 12 V unit's battery-side power board (260 mm): three MOSFETs per switch, twelve in the row
// (each leg: its low trio, then its high trio; leg B mirrored), the bars drawn the same way as the
// 48 V board's over the longer row, six 25 mm bus capacitors and the film capacitors spread over the
// two legs
const HF12_ROW: [string, number][] = [['QLA1', 20], ['QLA2', 40], ['QLA3', 60], ['QHA1', 80], ['QHA2', 100], ['QHA3', 120],
  ['QHB3', 140], ['QHB2', 160], ['QHB1', 180], ['QLB1', 200], ['QLB2', 220], ['QLB3', 240]];
const HF12_FIX: [string, number, number, Placed['rot']][] = [['CE1', 38, 22, 0], ['CE2', 68, 22, 0], ['CE3', 38, 52, 0], ['CE4', 68, 52, 0], ['CE5', 38, 84, 0], ['CE6', 68, 84, 0],
  ['CB1', 110, 20, 0], ['CB2', 110, 50, 0], ['CB3', 110, 80, 0], ['CB4', 190, 20, 0], ['CB5', 190, 50, 0], ['CB6', 190, 80, 0],
  ['CBD1', 115, 126, 0], ['CBD2', 145, 126, 0], ['X2', 15, 40, 0]];
const HF12_LUGS: [string, number, number][] = [['J_BUS', 15, 15], ['J_GND', 15, 65], ['J_LA', 40, 110], ['J_LB', 215, 110], ['J_BUSD', 126.19, 108]];
const hfPlanLv = (cells: 4 | 8 | 16): Placed[] => {
  if (cells !== 4) return hfPlan(cells).filter((q) => q.x < 180);
  const { ref } = hfRefs(cells);
  return [...HF12_ROW.map(([k, x]) => ({ ref: ref(k), x, y: 150, rot: 0 as const })),
    ...HF12_ROW.map(([k, x]) => ({ ref: ref(`RG${k.slice(1)}`), x: x - 5.45, y: 163, rot: 90 as const })),
    ...HF12_FIX.map(([k, x, y, rot]) => ({ ref: ref(k), x, y, rot })), ...HF12_LUGS.map(([k, x, y]) => ({ ref: k, x, y, rot: 0 as const }))];
};
const hfBarsLv = (cells: 4 | 8 | 16): PlanTrack[] => {
  if (cells !== 4) return HF_BARS.filter((t) => t.pts[0][0] < 180);
  const t: PlanTrack[] = [], stub = (net: string, layer: 'F.Cu' | 'B.Cu', x: number, y1: number) => t.push({ net, layer, width: 4, pts: [[x, 150], [x, y1]] });
  for (const x of [20, 40, 60, 85.45, 105.45, 125.45]) stub('LA', 'F.Cu', x, 137);
  for (const x of [145.45, 165.45, 185.45, 200, 220, 240]) stub('LB', 'F.Cu', x, 137);
  for (const x of [80, 100, 120, 140, 160, 180]) stub('BUSD', 'B.Cu', x, 137);
  for (const x of [25.45, 45.45, 65.45, 205.45, 225.45, 245.45]) stub('GND', 'B.Cu', x, 119);
  t.push({ net: 'LA', layer: 'F.Cu', width: 8, pts: [[20, 137], [125.45, 137]] }, { net: 'LA', layer: 'F.Cu', width: 6, pts: [[40, 137], [40, 110]] },
    { net: 'LB', layer: 'F.Cu', width: 8, pts: [[145.45, 137], [240, 137]] }, { net: 'LB', layer: 'F.Cu', width: 6, pts: [[215, 137], [215, 110]] },
    { net: 'BUSD', layer: 'B.Cu', width: 8, pts: [[80, 137], [180, 137]] }, { net: 'BUSD', layer: 'B.Cu', width: 6, pts: [[126.19, 137], [126.19, 110]] },
    { net: 'BUSD', layer: 'B.Cu', width: 3, pts: [[110, 126], [110, 137]] }, { net: 'BUSD', layer: 'B.Cu', width: 3, pts: [[140, 126], [140, 137]] });
  return t;
};
const hfPlanesLv = (cells: 4 | 8 | 16): PlanZone[] => cells !== 4 ? HF_PLANES.filter((z) => z.pts[0][0] < 180)
  : [{ net: 'BUS', layer: 'F.Cu', pts: [[3, 3], [257, 3], [257, 120], [3, 120]] }, { net: 'GND', layer: 'B.Cu', pts: [[3, 3], [257, 3], [257, 120], [3, 120]] }];
const hfControlClasses = (cells: 4 | 8 | 16 = 16): NetClass[] => [{ ...classFor('HV', hfRefs(cells).hv, 0.3, 0.5), apart: 2.5 }, { ...classFor('Mains', ['OUTL'], 0.5, 1.5), apart: 3.2 }];

// the pair driver's plan (120 × 80 mm): the mains parts in rows on the left, the mains connector
// (to the thyristors and the input/tap leads) along the bottom, the two optocouplers across the
// zone boundary (x 75: their mains pins at 71.2, their control pins at 78.8), the control
// connector on the right
const STABT_PAIR_PLAN: [string, number, number, Placed['rot']][] = [
  ['RA1', 15, 10, 0], ['DB1', 36, 10, 0], ['RGB1', 55, 10, 0],
  ['RB1', 15, 20, 0], ['DA1', 36, 20, 0], ['RGA1', 55, 20, 0],
  ['RSN1', 17, 32, 0], ['CSN1', 42, 32, 0],
  ['RVA1', 15, 44, 0], ['RVB1', 38, 44, 0],
  ['BV1', 57, 56, 0],
  ['UO1', 75, 15, 180], ['US1', 75, 44, 0],
];
// the P4b pair drivers' parts (by schematic key): pair 1 and all seven
const STABT_PAIR = ['UO', 'RA', 'RB', 'DA', 'DB', 'RGA', 'RGB', 'RVA', 'RVB', 'BV', 'US', 'RSN', 'CSN'];
let stabTCache: { pair1: Set<string>; pairs: Set<string>; ref: (k: string) => string } | undefined;
const stabTRefs = () => stabTCache ??= (() => {
  const { sheet, nb } = stabiliserT({ kva: 10 }), ref = (k: string) => nb.refOf(sheet, k);
  const all = [1, 2, 3, 4, 5, 6, 7].flatMap((k) => STABT_PAIR.map((x) => ref(`${x}${k}`)));
  return { pair1: new Set(STABT_PAIR.map((x) => ref(`${x}1`))), pairs: new Set(all), ref };
})();

// the inverters' boards (P7) for 16, 8 and 4 cells (48, 24, 12 V): the same boards; the 12 V
// unit's battery-side power board is wider (three MOSFETs per switch, six bus capacitors). The 24 V
// unit's parts fit the 48 V boards (tools/kicad/variant.ts checks it): its boards are the 48 V ones
// with the 24 V parts list
function inverterBoards(cells: 4 | 8 | 16, v: string): Record<string, Design> {
  const kw = cells === 16 ? 5 : cells === 8 ? 3 : 1.5, lvW = cells === 4 ? 260 : 180;
  return {
  // two power boards: the battery side (DC-DC bridge, bus, current transformer) and the 380 V side
  // (rectifier, bus, sine bridge), each from its part of the plan (the 380 V side moved 180 mm
  // left); on one board the two sections' drivers and gate parts crowded one band and 86
  // connections stayed unrouted
  [`inverter-hf-${v}-power-lv`]: { sheet: () => inverterHF({ cells, load: '0' }).sheet, title: `Inverter ${v} V ${kw} kW, high-frequency: battery-side power board`, revision: 'A',
    classes: () => [POWER(HF_LV_HEAVY)], copperOz: 4, heavy: HF_LV_HEAVY, panel: (p) => !hfRefs(cells).lv.has(p.ref), bolted: (p) => hfRefs(cells).off.has(p.ref), w: lvW, h: 230,
    plan: () => hfPlanLv(cells), tracks: hfBarsLv(cells), zones: hfPlanesLv(cells), region: { x0: 0, x1: lvW, y0: 160, y1: 230 },
    // 12 V: the panel connector's BUS pin (the supply's feed) to the bus plane, which Freerouting
    // left: on B.Cu up the left edge, a via into the plane
    post: cells === 4 ? { tracks: [{ net: 'BUS', layer: 'B.Cu', width: 1, pts: [[14.88, 189.5], [14.88, 184], [10, 179.12], [10, 115]] }], vias: [{ net: 'BUS', at: [10, 115] }] } : undefined },
  [`inverter-hf-${v}-power-hv`]: { sheet: () => inverterHF({ cells, load: '0' }).sheet, title: `Inverter ${v} V ${kw} kW, high-frequency: 380 V power board`, revision: 'A',
    classes: () => [classFor('HV', [...hfPowerHv(cells), 'GND'], 0.6, 0.8)], copperOz: 4, heavy: ['HBUS', 'HVG', 'SWA', 'RP', 'S1', 'S2', 'GND'],
    panel: (p) => !hfRefs(cells).hvp.has(p.ref), bolted: (p) => hfRefs(cells).off.has(p.ref), w: 140, h: 270,
    plan: () => hfPlan(cells).filter((q) => q.x >= 180).map((q) => ({ ...q, x: q.x - 180 })),
    tracks: HF_BARS.filter((t) => t.pts[0][0] >= 180).map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [x - 180, y] as [number, number]) })),
    zones: HF_PLANES.filter((z) => z.pts[0][0] >= 180).map((z) => ({ ...z, pts: z.pts.map(([x, y]) => [x - 180, y] as [number, number]) })), region: { x0: 0, x1: 140, y0: 160, y1: 270 },
    // the drivers' HVG (below the IGBT row) as pours on both layers, joined to the HVG plane by a
    // track along the right edge: the routed gate and source tracks close the gap in the IGBT row
    post: { zones: [{ net: 'HVG', layer: 'B.Cu', pts: [[2, 150], [50, 150], [50, 107], [60, 107], [60, 150], [138, 150], [138, 268], [2, 268]] }, { net: 'HVG', layer: 'F.Cu', pts: [[2, 150], [138, 150], [138, 268], [2, 268]] }],
      tracks: [{ net: 'HVG', layer: 'F.Cu', width: 1, pts: [[112, 100], [133, 100], [133, 245.75], [118.79, 245.75]] }] } },
  // two control boards, split at the isolation barrier (on one board, 276 parts with the 380 V
  // nets 2.5 mm apart left 300 connections unrouted): the battery side, and the 380 V side with
  // the optocouplers and pulse transformers that cross the barrier
  [`inverter-hf-${v}-control-lv`]: { sheet: () => inverterHF({ cells, load: '0' }).sheet, title: `Inverter ${v} V ${kw} kW, high-frequency: battery-side control board`, revision: 'A', classes: () => hfControlClasses(cells), fill: 2.6, w: 220, h: 160,
    panel: (p) => { const r = hfRefs(cells); return r.pwr.has(p.ref) || r.off.has(p.ref) || r.panel.has(p.ref) || r.ctlHv.has(p.ref); } },
  [`inverter-hf-${v}-control-hv`]: { sheet: () => inverterHF({ cells, load: '0' }).sheet, title: `Inverter ${v} V ${kw} kW, high-frequency: 380 V control board`, revision: 'A', classes: () => hfControlClasses(cells), fill: 2.6, w: 280, h: 200, block: 6, oneStage: true,
    panel: (p) => { const r = hfRefs(cells); return r.pwr.has(p.ref) || r.off.has(p.ref) || r.panel.has(p.ref) || !r.ctlHv.has(p.ref); } },
  [`inverter-lf-${v}-power`]: { sheet: () => inverterLF({ cells, load: '0' }).sheet, title: `Inverter ${v} V ${kw} kW, 50 Hz transformer: power board`, revision: 'A', classes: () => [POWER(LF_HEAVY)], copperOz: 4,
    heavy: LF_HEAVY, panel: (p) => !lfRefs(cells).pwr.has(p.ref), bolted: (p) => lfRefs(cells).off.has(p.ref), w: 280, h: 170,
    plan: () => lfPlan(cells), tracks: LF_BARS, zones: LF_PLANES, region: { x0: 0, x1: 280, y0: 124, y1: 170 } },
  [`inverter-lf-${v}-control`]: { sheet: () => inverterLF({ cells, load: '0' }).sheet, title: `Inverter ${v} V ${kw} kW, 50 Hz transformer: control board`, revision: 'A', classes: lfMains, fill: 2.6, w: 200, h: 150,
    panel: (p) => { const r = lfRefs(cells); return r.pwr.has(p.ref) || r.off.has(p.ref) || r.panel.has(p.ref); },
    // 12 V: the one link Freerouting left (the DC servo's feedback), found by link.py and checked
    // through route.py --post-only
    post: cells === 4 ? { tracks: [{ net: 'VFX', layer: 'F.Cu', width: 0.3, pts: [[113.42, 94.0], [113.5, 94.0], [121.25, 94.0], [123.5, 96.25]] },
        { net: 'VFX', layer: 'B.Cu', width: 0.3, pts: [[123.5, 96.25], [133.5, 96.25]] },
        { net: 'VFX', layer: 'F.Cu', width: 0.3, pts: [[133.5, 96.25], [136.5, 93.25], [137.75, 93.25], [139.0, 94.5], [139.0, 95.25], [145.75, 95.25]] },
        { net: 'VFX', layer: 'B.Cu', width: 0.3, pts: [[145.75, 95.25], [147.0, 96.5], [151.5, 96.5]] },
        { net: 'VFX', layer: 'F.Cu', width: 0.3, pts: [[151.5, 96.5], [152.75, 97.75], [160.25, 97.75], [165.0, 93.0]] },
        { net: 'VFX', layer: 'B.Cu', width: 0.3, pts: [[165.0, 93.0], [167.0, 91.0], [167.0, 90.75]] },
        { net: 'VFX', layer: 'F.Cu', width: 0.3, pts: [[167.0, 90.75], [170.25, 90.75], [170.29, 90.75]] }],
      vias: [{ net: 'VFX', at: [123.5,  96.25] }, { net: 'VFX', at: [133.5,  96.25] }, { net: 'VFX', at: [145.75,  95.25] }, { net: 'VFX', at: [151.5,  96.5] }, { net: 'VFX', at: [165.0,  93.0] }, { net: 'VFX', at: [167.0,  90.75] }] } : undefined },
  };
}

// P9 irrigation (D24): the channel module's field terminals in one row along its bottom edge, per
// zone the valve's two poles and the sensor's three (+3.3 V, out, 0 V), single-pole blocks 5.6 mm
// apart (at 5.08 their courtyards overlap); the bus headers at the top
// corners (in left, out right, so the modules chain left to right). The main board: the ESP32
// module at the top edge, its antenna over the edge (no copper under it), the 24 V terminals on the
// left, the bus header at the bottom right
const IRR_TERMS = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((k) => [`XVC${k}`, `XV${k}`, `XSP${k}`, `XS${k}`, `XSG${k}`]);
const irrModulePlan = (): Placed[] => {
  const { sheet, nb } = irrigationModule(), ref = (k: string) => nb.refOf(sheet, k);
  return [...IRR_TERMS.map((k, i) => ({ ref: ref(k), x: 6 + 5.6 * i, y: 88, rot: 0 as const })),
    { ref: ref('J_IN'), x: 24, y: 8, rot: 0 }, { ref: ref('J_OUT'), x: 206, y: 8, rot: 0 }];
};
const irrMainPlan = (): Placed[] => {
  const { sheet, nb } = irrigationMain(), ref = (k: string) => nb.refOf(sheet, k);
  return [{ ref: ref('U7'), x: 70, y: 26, rot: 0 }, { ref: ref('X24P'), x: 6, y: 60, rot: 90 }, { ref: ref('X24N'), x: 6, y: 66, rot: 90 }, { ref: ref('J_BUS'), x: 106, y: 92, rot: 0 }];
};
const IRR_POWER: NetClass = { name: 'Power', patterns: ['^V24$', '^SRET$', '^VIN$', '^VFU$'], track: 1, clearance: 0.3 };

export const DESIGNS: Record<string, Design> = {
  ...inverterBoards(16, '48'), ...inverterBoards(8, '24'), ...inverterBoards(4, '12'),
  stabiliser: { sheet: () => stabiliser().sheet, title: 'Mains voltage stabiliser 1 kVA', revision: 'A', classes: mains(['L_IN', 'N']), w: 230, h: 212, plan: STAB_PLAN, tracks: STAB_TRACKS, region: { x0: 105, x1: 230 }, edge: 99,
    keep1: [0, 1, 2, 3, 4, 5, 6].map((k): [number, number, number, number] => { const y = k < 6 ? 70 + 20 * k : 192; return [88, y - 9, 99, y + 9]; }) },
  // the change-overs switch 32 A: the contactors, breakers and power terminals sit on the DIN rail
  // (panel.csv is their wiring); the board carries the sense and auxiliary transformers' fuses and
  // connectors, the MOVs (after the breakers) and the control, its mains and its control nets on
  // two connectors to the panel
  // P9: the pump controller's board (supply, electrodes, timers, logic, the pilot relay); the
  // contactor, breaker and terminals on the DIN rail
  'pump-control': { sheet: () => pumpControl().sheet, title: 'Pump controller (tank level, dry source, timers)', revision: 'A', classes: mains(['L', 'N']), panel: (p) => PANEL.has(p.sym),
    // the one connection Freerouting left: the pilot relay's fused mains feed (F2 to K5's contact)
    post: { tracks: [{ net: 'LF2', layer: 'F.Cu', width: 1.6, pts: [[36.29, 82.5], [36.29, 100.25], [46.75, 100.25]] }] } },
  // P9: the trimmer's drive, one board in the handle (the MOSFET and the diode on a small
  // heatsink at the edge); the motor current (40 A peaks) on 3 mm tracks in 4 oz copper
  'trimmer-drive': { sheet: () => trimmer().sheet, title: 'Cordless trimmer drive 36 V', revision: 'A',
    classes: () => [{ name: 'Power', patterns: ['VB', 'DRN', 'SRC', 'GND'].map((n) => `^${n}$`), track: 3, clearance: 0.6 }], copperOz: 4, w: 160, h: 100,
    // 160 × 100 mm (on 130 × 90 and 150 × 100 mm connections stayed open; a ground plane while routing was cut
    // into islands by the B.Cu tracks); ground poured on both layers after routing
    post: { zones: [{ net: 'GND', layer: 'B.Cu', pts: [[2, 2], [158, 2], [158, 98], [2, 98]], clearance: 0.6, solid: true }, { net: 'GND', layer: 'F.Cu', pts: [[2, 2], [158, 2], [158, 98], [2, 98]], clearance: 0.6, solid: true }] } },
  // P4b: the thyristor-tap stabilisers, for 5, 10 and 15 kVA alike (the ratings differ only in
  // panel parts): a driver board per thyristor pair (7, the same board: opto-triac, gate parts,
  // snubber, the pair's voltage sense) mounted at the heatsink beside its pair, and a logic board
  // (supply, sense, comparators, logic, protection, the output relay). One control board of
  // 240 parts, its mains zone holding all seven drivers, left 48 … 75 connections open
  'stabiliser-t-pair': { sheet: () => stabiliserT({ kva: 10 }).sheet, title: 'Mains stabiliser 5/10/15 kVA: thyristor pair driver (7 per unit)', revision: 'A',
    classes: mains(['L_IN', 'N'], 0.5), panel: (p) => !stabTRefs().pair1.has(p.ref), w: 120, h: 80,
    plan: () => [...STABT_PAIR_PLAN.map(([k, x, y, rot]) => ({ ref: stabTRefs().ref(k), x, y, rot })), { ref: 'J_MAINS', x: 25, y: 70, rot: 0 }, { ref: 'J_PANEL', x: 100, y: 30, rot: 0 }],
    region: { x0: 78, x1: 120 },
    // the bridge's two outputs to the optocoupler, which Freerouting left (paths checked through
    // route.py --post-only: VSN1 straight on F.Cu; VSP1 below the bridge, a via, up on B.Cu)
    post: { tracks: [{ net: 'VSN1', layer: 'F.Cu', width: 0.5, pts: [[64.62, 56], [64.62, 45.27], [71.19, 45.27]] },
      { net: 'VSP1', layer: 'F.Cu', width: 0.5, pts: [[49.38, 56], [49.38, 61], [68, 61]] },
      { net: 'VSP1', layer: 'B.Cu', width: 0.5, pts: [[68, 61], [68, 42.73], [71.19, 42.73]] }],
      vias: [{ net: 'VSP1', at: [68, 61] }] } },
  'stabiliser-t-logic': { sheet: () => stabiliserT({ kva: 10 }).sheet, title: 'Mains stabiliser 5/10/15 kVA, thyristor taps: logic board', revision: 'A',
    classes: mains(['L_IN', 'N'], 0.5), panel: (p) => PANEL.has(p.sym) || p.sym === 'scr' || p.sym === 'autotransformer' || stabTRefs().pairs.has(p.ref),
    // the one connection Freerouting left: the output relay's contact to the 230 V tap terminal,
    // round below the terminal row and up between the relay's pads (3.2 mm kept from each)
    post: { tracks: [{ net: 'T5', layer: 'F.Cu', width: 0.5, pts: [[20.81, 82], [20.81, 88], [41, 88], [41, 64.5], [48.75, 64.5]] }] } },
  // P9: the block moulding machine's safety and output board (the reset relay, the valve and
  // contactor drivers, the sensor input); the safety contactors, the pump's contactor and the
  // terminals on the DIN rail
  'block-machine': { sheet: () => blockMachine().sheet, title: 'Block moulding machine: safety circuit, 24 V outputs, inputs and Arduino Nano', revision: 'A',
    classes: () => [POWER(['V24', 'V24F', 'V24S', 'KPD', 'SVD', 'SVD2', 'SVD3', 'SVD4', 'GND'])], panel: (p) => PANEL.has(p.sym), w: 170, h: 120,
    // the coil-drive link Freerouting left (link.py, checked through route.py --post-only)
    post: { tracks: [{ net: 'KMV1D', layer: 'B.Cu', width: 0.3, pts: [[79.02,  91.55],  [79.0,  91.5],  [80.5,  90.0],  [80.5,  89.75]] }, { net: 'KMV1D', layer: 'F.Cu', width: 0.3, pts: [[80.5,  89.75],  [83.5,  89.75]] }, { net: 'KMV1D', layer: 'B.Cu', width: 0.3, pts: [[83.5,  89.75],  [84.25,  90.5],  [84.25,  92.75],  [84.25,  92.75]] }], vias: [{ net: 'KMV1D', at: [80.5,  89.75] }, { net: 'KMV1D', at: [83.5,  89.75] }] } },
  // P9 (D25): the gate controller, one board (the relays, the MOSFET and the cut-off; the motor,
  // limit switches, beam and the microcontroller board on terminals). The motor's 12 A stall on
  // 2 mm tracks in 2 oz copper
  'irrigation-module': { sheet: () => irrigationModule().sheet, title: 'Irrigation controller: 8-zone channel module (up to 8 per controller)', revision: 'A',
    classes: () => [IRR_POWER], w: 230, h: 95, plan: irrModulePlan, region: { x0: 0, x1: 230, y0: 16, y1: 80 } },
  'irrigation-main': { sheet: () => irrigationMain().sheet, title: 'Irrigation controller: main board (supplies, ESP32, overcurrent cut-off, bus)', revision: 'A',
    classes: () => [IRR_POWER], w: 130, h: 100,
    plan: irrMainPlan,
    region: { x0: 0, x1: 130, y0: 54, y1: 100 } },
  'gate-controller': { sheet: () => gateController().sheet, title: 'Gate controller 24 V: motor drive, protections, Arduino Nano and IR receiver', revision: 'A',
    classes: () => [{ name: 'Power', patterns: ['V24', 'V24F', 'MA', 'MB', 'SW', 'SRET', 'GND'].map((n) => `^${n}$`), track: 2, clearance: 0.6 }], copperOz: 2, w: 160, h: 110,
    // the supply link Freerouting left (link.py, checked through route.py --post-only)
    post: { tracks: [{ net: 'V24F', layer: 'B.Cu', width: 2, pts: [[42.65,  13.0],  [42.75,  13.0],  [39.5,  9.75],  [33.5,  9.75],  [28.25,  15.0],  [28.25,  16.5],  [28.23,  16.58]] }] } },
  'changeover-1p': { sheet: () => changeover1().sheet, title: 'Mains change-over 1P (control board)', revision: 'A', classes: mains(['LM_IN', 'NM', 'LB_IN', 'NB']), panel: (p) => PANEL.has(p.sym), wire: coWire },
  'changeover-3p': { sheet: () => changeover3().sheet, title: 'Mains change-over 3P+N (control board)', revision: 'A', classes: mains(['LM1', 'LM2', 'LM3', 'NM', 'LB1', 'LB2', 'LB3', 'NB']), panel: (p) => PANEL.has(p.sym), wire: coWire, fill: 3.0 },
  'mppt-power': { sheet: () => mppt().sheet, title: 'MPPT solar charger 48 V, 80 A: power board', revision: 'A', classes: () => [POWER(MPPT_HEAVY)], copperOz: 4,
    heavy: MPPT_HEAVY, panel: (p) => !mpptRefs().pwr.has(p.ref), bolted: (p) => mpptRefs().off.has(p.ref), w: 280, h: 160,
    plan: mpptPlan, tracks: MPPT_BARS, region: { x0: 0, x1: 280 } },
  'mppt-control': { sheet: () => mppt().sheet, title: 'MPPT solar charger 48 V, 80 A: control board', revision: 'A', classes: () => [], fill: 2.6, panel: (p) => mpptRefs().pwr.has(p.ref) || mpptRefs().off.has(p.ref) },
};

