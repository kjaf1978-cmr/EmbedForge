// Generic symbol library (UI-08 (a), ED-08): symbol graphics, pins, values and parameters.
// Coordinates are in schematic units; the grid is 10 units, and every pin lies on the grid.
// Pin numbers follow KiCad's generic symbols, so Increment 3 footprints can map pads by number.

import { ADJ_REGULATORS, AUTOTRANSFORMERS, BJTS, BREAKER_A, BRIDGES, COMPARATORS, CONTACTORS, DIODES, GATE_DRIVERS, GDTS, IGBTS, LED_COLOURS, MOSFETS, OPAMPS, OPTOS, PV_MODULES, REGULATORS, RELAYS, SHUNT_REFS, TVS, VARISTORS, ZENERS, findModel } from './models';

export interface Pt { x: number; y: number }

export type PinType = 'passive' | 'input' | 'output' | 'power_in' | 'power_out';
export interface PinDef {
  id: string; name: string; x: number; y: number; type: PinType;
  /** May be left unconnected without a rule-check warning (a tacho output, a delta winding's N). */
  optional?: boolean;
}

export type Gfx =
  | { t: 'path'; d: string; fill?: 'none' | 'fg' | 'bg' | string; w?: number }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: 'none' | 'fg' | 'bg' | string }
  | { t: 'text'; x: number; y: number; s: string; size?: number };

export interface ParamDef {
  key: string;
  label: string;
  kind: 'value' | 'select' | 'bool' | 'text';
  unit?: string;
  options?: { value: string; label: string }[];
  default: string;
  help?: string;
  /** Allowed range of a value: above gt (or from ge) and up to le; `text` says it in words. */
  limits?: { gt?: number; ge?: number; le?: number; text: string };
}

/** Why a value is outside a parameter's limits, or null when it is allowed. */
export function outOfLimits(def: ParamDef, v: number): string | null {
  const l = def.limits;
  if (!l) return null;
  if ((l.gt !== undefined && !(v > l.gt)) || (l.ge !== undefined && !(v >= l.ge)) || (l.le !== undefined && !(v <= l.le))) return l.text;
  return null;
}

export type Category = 'Passive' | 'Sources' | 'Semiconductors' | 'Integrated circuits' | 'Logic' | 'Switches' | 'Motors' | 'Installation' | 'Power';

export interface SymbolDef {
  id: string;
  name: string;
  category: Category;
  keywords: string[];
  /** Reference prefix (R, C, D, Q, U, V, SW…); power symbols use "#PWR". */
  prefix: string;
  description: string;
  pins: PinDef[];
  gfx: (props: Record<string, string>) => Gfx[];
  /** The part's main value (resistance, model name…), edited in place on the schematic. */
  value: ParamDef;
  params: ParamDef[];
  refAt: Pt;
  valAt: Pt;
  /** Power and ground symbols: the value is the net name; they are not parts of the netlist. */
  power?: boolean;
  /** Logic part: supplied from the rail named by its value; every pin has a DC path. */
  logic?: boolean;
  /** Operable on the schematic while simulating (SIM-03). */
  interactive?: 'toggle' | 'momentary' | 'throw' | 'pot';
  simulated: boolean;
}

const fg = 'fg';
const circle = (cx: number, cy: number, r: number, fill = 'none'): Gfx => ({ t: 'circle', cx, cy, r, fill });
const path = (d: string, fill: string = 'none', w?: number): Gfx => ({ t: 'path', d, fill, w });
const text = (x: number, y: number, s: string, size = 9): Gfx => ({ t: 'text', x, y, s, size });

/** Filled arrow head with its tip at (x2, y2), pointing from (x1, y1). */
function arrowHead(x1: number, y1: number, x2: number, y2: number, len = 6, half = 3): Gfx {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l, bx = x2 - ux * len, by = y2 - uy * len;
  const r = (v: number) => Math.round(v * 100) / 100;
  return path(`M ${r(x2)} ${r(y2)} L ${r(bx - uy * half)} ${r(by + ux * half)} L ${r(bx + uy * half)} ${r(by - ux * half)} Z`, fg);
}

const two = (a: string, b: string, type: PinType = 'passive'): PinDef[] => [
  { id: '1', name: a, x: -30, y: 0, type }, { id: '2', name: b, x: 30, y: 0, type },
];
const vert = (type: PinType = 'power_out'): PinDef[] => [
  { id: '1', name: '+', x: 0, y: -30, type }, { id: '2', name: '−', x: 0, y: 30, type },
];

const opts = (names: string[]) => names.map((n) => ({ value: n, label: n }));
/** Servo horn from the hub (4, −8), 14 long, at `deg` degrees from straight up (clockwise). */
function servoHorn(deg: number): Gfx {
  const a = (Math.max(-90, Math.min(90, deg)) * Math.PI) / 180, x = 4 + 14 * Math.sin(a), y = -8 - 14 * Math.cos(a);
  return path(`M 4 -8 L ${x.toFixed(1)} ${y.toFixed(1)}`, 'none', 2);
}
const H = { refAt: { x: 0, y: -14 }, valAt: { x: 0, y: 18 } };
/** Heatsink of a power semiconductor: thermal resistance from its case to the air (pad and
 *  heatsink together). Empty: the part stands in free air. The stress check then rates its power
 *  from the junction temperature limit. */
const HEATSINK: ParamDef = { key: 'heatsink', label: 'Heatsink (case to air)', kind: 'value', unit: 'K/W', default: '', help: 'Thermal resistance from the case to the surrounding air, with the insulating pad (e.g. 0.5 K/W pad + 1.2 K/W heatsink = 1.7). Empty: no heatsink.' };

const VV = { refAt: { x: 22, y: -6 }, valAt: { x: 22, y: 8 } };

const RAIL: ParamDef = { key: 'value', label: 'Supply rail', kind: 'text', default: '+5V', help: 'the gate is supplied from this rail (hidden supply pins, as on most schematics); thresholds are half of it' };
const AND_BODY = 'M -20 -20 H 0 A 20 20 0 0 1 0 20 H -20 Z';
const OR_BODY = 'M -24 -20 Q -12 0 -24 20 Q 8 20 22 0 Q 8 -20 -24 -20 Z';
function gate(id: string, name: string, desc: string, body: string, bubble: boolean, extra: Gfx[] = [], keywords: string[] = []): SymbolDef {
  const outX = bubble ? 28 : 22;
  return {
    id, name, category: 'Logic', keywords: ['u', 'logic', 'gate', '74hc', 'digital', name.toLowerCase(), ...keywords], prefix: 'U', logic: true,
    description: `${desc} CMOS-like: inputs switch at half the supply rail, the output drives the rail or ground through 50 Ω; no propagation delay.`,
    pins: [{ id: '1', name: 'A', x: -40, y: -10, type: 'input' }, { id: '2', name: 'B', x: -40, y: 10, type: 'input' }, { id: '3', name: 'Y', x: 40, y: 0, type: 'output' }],
    refAt: { x: 0, y: -26 }, valAt: { x: 0, y: 32 }, simulated: true,
    gfx: () => [path(`M -40 -10 H -20 M -40 10 H -20 M ${outX} 0 H 40`), path(body, 'bg'), ...extra, ...(bubble ? [circle(25, 0, 3, 'bg')] : [])],
    value: RAIL, params: [],
  };
}
const LOGIC: SymbolDef[] = [
  gate('and2', 'AND gate', 'Two-input AND: the output is high when both inputs are high.', AND_BODY, false, [], ['and', '7408']),
  gate('nand2', 'NAND gate', 'Two-input NAND: the output is low when both inputs are high.', AND_BODY, true, [], ['nand', '7400']),
  gate('or2', 'OR gate', 'Two-input OR: the output is high when either input is high.', OR_BODY, false, [], ['or', '7432']),
  gate('nor2', 'NOR gate', 'Two-input NOR: the output is low when either input is high.', OR_BODY, true, [], ['nor', '7402']),
  gate('xor2', 'XOR gate', 'Two-input exclusive OR: the output is high when the inputs differ.', OR_BODY, false, [path('M -30 -20 Q -18 0 -30 20')], ['xor', '7486']),
  {
    id: 'not', name: 'Inverter (NOT)', category: 'Logic', keywords: ['u', 'not', 'inverter', 'logic', '7404', 'digital'], prefix: 'U', logic: true,
    description: 'Inverter: the output is the opposite of the input. CMOS-like: switches at half the supply rail, output through 50 Ω; no propagation delay.',
    pins: [{ id: '1', name: 'A', x: -40, y: 0, type: 'input' }, { id: '2', name: 'Y', x: 40, y: 0, type: 'output' }],
    refAt: { x: 0, y: -22 }, valAt: { x: 0, y: 28 }, simulated: true,
    gfx: () => [path('M -40 0 H -16 M 22 0 H 40'), path('M -16 -14 L 14 0 L -16 14 Z', 'bg'), circle(17, 0, 3, 'bg')],
    value: RAIL, params: [],
  },
  {
    id: 'schmitt', name: 'Schmitt-trigger inverter', category: 'Logic', keywords: ['u', 'schmitt', 'inverter', 'logic', '74hc14', '40106', 'debounce', 'hysteresis'], prefix: 'U', logic: true,
    description: 'Inverter with hysteresis (74HC14-like): the input switches up at 60 % and down at 40 % of the supply rail, so slow or noisy signals give clean edges. Output through 50 Ω; no propagation delay.',
    pins: [{ id: '1', name: 'A', x: -40, y: 0, type: 'input' }, { id: '2', name: 'Y', x: 40, y: 0, type: 'output' }],
    refAt: { x: 0, y: -22 }, valAt: { x: 0, y: 28 }, simulated: true,
    gfx: () => [path('M -40 0 H -16 M 22 0 H 40'), path('M -16 -14 L 14 0 L -16 14 Z', 'bg'), circle(17, 0, 3, 'bg'), path('M -11 3 H -5 V -3 M -8 3 V -3 H -2')],
    value: RAIL, params: [],
  },
  {
    id: 'dff', name: 'D flip-flop', category: 'Logic', keywords: ['u', 'flip-flop', 'flipflop', 'd-type', 'latch', '7474', 'register', 'divider', 'logic'], prefix: 'U', logic: true,
    description: 'D-type flip-flop (one half of a 74HC74, or of a CD4013 on a rail above 6 V; set and reset are not drawn): on each rising edge of CLK, Q takes the level of D; Q̄ is its opposite. Q starts low. Switches at half the supply rail; outputs through 50 Ω.',
    pins: [{ id: '1', name: 'D', x: -40, y: -10, type: 'input' }, { id: '2', name: 'CLK', x: -40, y: 10, type: 'input' },
      { id: '3', name: 'Q', x: 40, y: -10, type: 'output' }, { id: '4', name: 'Q̄', x: 40, y: 10, type: 'output' }],
    refAt: { x: 0, y: -30 }, valAt: { x: 0, y: 36 }, simulated: true,
    gfx: () => [path('M -40 -10 H -20 M -40 10 H -20 M 20 -10 H 40 M 20 10 H 40'), path('M -20 -22 H 20 V 22 H -20 Z', 'bg'), path('M -20 5 L -13 10 L -20 15'),
      text(-13, -7, 'D', 7), text(13, -7, 'Q', 7), text(13, 13, 'Q̄', 7)],
    value: RAIL, params: [],
  },
];

export const SYMBOLS: SymbolDef[] = [
  {
    id: 'resistor', name: 'Resistor', category: 'Passive', keywords: ['r', 'ohm', 'resistance'], prefix: 'R',
    description: 'Fixed resistor.', pins: two('1', '2'), ...H, simulated: true,
    gfx: () => [path('M -30 0 H -15 M 15 0 H 30'), path('M -15 -6 H 15 V 6 H -15 Z', 'bg')],
    value: { key: 'value', label: 'Resistance', kind: 'value', unit: 'Ω', default: '1k' }, params: [{ key: 'pmax', label: 'Power rating', kind: 'value', unit: 'W', default: '0.25', help: 'for the stress check (smoke analysis)', limits: { gt: 0, text: 'must be above 0' } }, { key: 'tc', label: 'Temperature coefficient', kind: 'value', unit: 'ppm/K', default: '0', help: 'change per kelvin from 27 °C (metal film about 50, carbon film about −500)', limits: { ge: -1e4, le: 1e4, text: 'must be from −10 000 to 10 000 ppm/K' } }],
  },
  {
    id: 'capacitor', name: 'Capacitor', category: 'Passive', keywords: ['c', 'cap', 'ceramic', 'farad'], prefix: 'C',
    description: 'Non-polarised capacitor (ceramic, film).', pins: two('1', '2'), ...H, simulated: true,
    gfx: () => [path('M -30 0 H -4 M 4 0 H 30 M -4 -12 V 12 M 4 -12 V 12', 'none', 2)],
    value: { key: 'value', label: 'Capacitance', kind: 'value', unit: 'F', default: '100n' }, params: [{ key: 'vmax', label: 'Voltage rating', kind: 'value', unit: 'V', default: '50', help: 'for the stress check (smoke analysis)', limits: { gt: 0, text: 'must be above 0' } }, { key: 'ic', label: 'Initial voltage', kind: 'value', unit: 'V', default: '', help: 'only for a transient that starts with discharged capacitors ("zero"): the capacitor starts at this voltage instead of 0 V (SPICE IC=)' }],
  },
  {
    id: 'capacitor_pol', name: 'Electrolytic capacitor', category: 'Passive', keywords: ['c', 'elko', 'polarised', 'polarized', 'electrolytic'], prefix: 'C',
    description: 'Polarised capacitor; pin 1 is positive.', pins: two('+', '−'), ...H, simulated: true,
    gfx: () => [path('M -30 0 H -4 M 6 0 H 30 M -4 -12 V 12', 'none', 2), path('M 9 -12 Q 3 0 9 12', 'none', 2), text(-12, -8, '+', 10)],
    value: { key: 'value', label: 'Capacitance', kind: 'value', unit: 'F', default: '10u' }, params: [{ key: 'vmax', label: 'Voltage rating', kind: 'value', unit: 'V', default: '25', help: 'for the stress check (smoke analysis)', limits: { gt: 0, text: 'must be above 0' } }, { key: 'ic', label: 'Initial voltage', kind: 'value', unit: 'V', default: '', help: 'only for a transient that starts with discharged capacitors ("zero"): the capacitor starts at this voltage instead of 0 V (SPICE IC=)' }, { key: 'esr', label: 'ESR', kind: 'value', unit: 'Ω', default: '', help: 'equivalent series resistance, from the datasheet (empty: none); it damps resonances with wiring inductance' }],
  },
  {
    id: 'inductor', name: 'Inductor', category: 'Passive', keywords: ['l', 'coil', 'choke', 'henry'], prefix: 'L',
    description: 'Inductor (ideal, no series resistance).', pins: two('1', '2'), ...H, simulated: true,
    gfx: () => [path('M -30 0 H -20 A 5 5 0 0 1 -10 0 A 5 5 0 0 1 0 0 A 5 5 0 0 1 10 0 A 5 5 0 0 1 20 0 H 30')],
    value: { key: 'value', label: 'Inductance', kind: 'value', unit: 'H', default: '10m' }, params: [{ key: 'imax', label: 'Current rating', kind: 'value', unit: 'A', default: '1', help: 'for the stress check (smoke analysis)', limits: { gt: 0, text: 'must be above 0' } },
      { key: 'rloss', label: 'Core loss resistance', kind: 'value', unit: 'Ω', default: '', help: 'optional: the core losses as a resistance across the inductor (V² / core loss); empty = none. It damps the ringing of a switched inductor with the diodes\' capacitance' },
      { key: 'isat', label: 'Saturation current', kind: 'value', unit: 'A', default: '', help: 'optional: the current at which the inductance has fallen by 20 % (datasheet); the simulation then saturates the core, and the stress check flags a peak above it. Empty = linear' }],
  },
  {
    id: 'transformer', name: 'Transformer', category: 'Passive', keywords: ['t', 'transformer', 'mains', 'isolation', 'coupled inductors', 'tr'], prefix: 'T',
    description: 'Two coupled windings (dots mark pins 1 and 3). The secondary inductance is the primary inductance times the turns ratio squared; winding resistances included.',
    pins: [{ id: '1', name: 'P1', x: -30, y: -20, type: 'passive' }, { id: '2', name: 'P2', x: -30, y: 20, type: 'passive' },
      { id: '3', name: 'S1', x: 30, y: -20, type: 'passive' }, { id: '4', name: 'S2', x: 30, y: 20, type: 'passive' }],
    refAt: { x: 0, y: -30 }, valAt: { x: 0, y: 34 }, simulated: true,
    gfx: () => [
      path('M -30 -20 H -10 A 5 5 0 0 0 -10 -10 A 5 5 0 0 0 -10 0 A 5 5 0 0 0 -10 10 A 5 5 0 0 0 -10 20 H -30'),
      path('M 30 -20 H 10 A 5 5 0 0 1 10 -10 A 5 5 0 0 1 10 0 A 5 5 0 0 1 10 10 A 5 5 0 0 1 10 20 H 30'),
      path('M -2 -22 V 22 M 2 -22 V 22'), circle(-18, -14, 1.8, fg), circle(18, -14, 1.8, fg),
    ],
    value: { key: 'value', label: 'Turns ratio (secondary : primary)', kind: 'value', default: '0.1', help: '0.1 = 10:1 step-down; 2 = 1:2 step-up', limits: { gt: 0, text: 'must be above 0' } },
    params: [
      { key: 'lp', label: 'Primary inductance', kind: 'value', unit: 'H', default: '1' },
      { key: 'k', label: 'Coupling', kind: 'value', default: '0.999', help: 'from above 0 to 1; 1 = no leakage', limits: { gt: 0, le: 1, text: 'must be above 0 and at most 1' } },
      { key: 'rp', label: 'Primary resistance', kind: 'value', unit: 'Ω', default: '1' },
      { key: 'rs', label: 'Secondary resistance', kind: 'value', unit: 'Ω', default: '0.1' },
      { key: 'rc', label: 'Core loss resistance', kind: 'value', unit: 'Ω', default: '', help: 'optional: the core losses as a resistance across the primary (V² / core loss at the rated voltage); empty = no core loss. It damps the ringing of a ferrite transformer with the switches\' capacitance' },
      { key: 'isat', label: 'Saturation (magnetising current)', kind: 'value', unit: 'A', default: '', help: 'optional: the primary-referred magnetising current at which the core\'s inductance has fallen by 20 % (from the core\'s saturation flux: B_sat·A_e·N_p / L_p); the simulation then saturates the core (overvoltage, DC, inrush). Empty = linear' },
    ],
  },
  {
    id: 'transformer3', name: 'Three-phase transformer', category: 'Passive', keywords: ['3 phase', 'three phase', 'three-phase', 'transformer', 'dyn', 'yyn', 'distribution', 'delta', 'star', 'wye'], prefix: 'T',
    description: 'Three-phase transformer, modelled as three coupled single-phase windings. Connection: D = delta, Y = star, n = secondary neutral brought out (Dyn and Yd shift the phase by 30°). Pins 1U 1V 1W 1N primary, 2U 2V 2W 2N secondary; N pins of delta windings are not used.',
    pins: [
      { id: '1', name: '1U', x: -40, y: -30, type: 'passive' }, { id: '2', name: '1V', x: -40, y: -10, type: 'passive' },
      { id: '3', name: '1W', x: -40, y: 10, type: 'passive' }, { id: '4', name: '1N', x: -40, y: 30, type: 'passive', optional: true },
      { id: '5', name: '2U', x: 40, y: -30, type: 'passive' }, { id: '6', name: '2V', x: 40, y: -10, type: 'passive' },
      { id: '7', name: '2W', x: 40, y: 10, type: 'passive' }, { id: '8', name: '2N', x: 40, y: 30, type: 'passive', optional: true },
    ],
    refAt: { x: 0, y: -48 }, valAt: { x: 0, y: 52 }, simulated: true,
    gfx: (p) => {
      const c = p.value ?? 'Dyn', pri = c[0] === 'D' ? 'Δ' : 'Y', sec = c.slice(1).toLowerCase().startsWith('d') ? 'Δ' : 'Y';
      return [
        path('M -40 -30 H -25 M -40 -10 H -25 M -40 10 H -25 M -40 30 H -25 M 25 -30 H 40 M 25 -10 H 40 M 25 10 H 40 M 25 30 H 40'),
        path('M -25 -40 H 25 V 40 H -25 Z', 'bg'), circle(-6, 0, 14), circle(6, 0, 14),
        text(-10, 4, pri, 10), text(10, 4, sec, 10), text(0, -26, '3~', 7),
        text(-19, -28, 'U', 5), text(-19, -8, 'V', 5), text(-19, 12, 'W', 5), text(-19, 32, 'N', 5),
        text(19, -28, 'u', 5), text(19, -8, 'v', 5), text(19, 12, 'w', 5), text(19, 32, 'n', 5),
      ];
    },
    value: { key: 'value', label: 'Connection', kind: 'select', options: opts(['Dyn', 'Yyn', 'Yd', 'Dd']), default: 'Dyn' },
    params: [
      { key: 'vp', label: 'Primary line voltage', kind: 'value', unit: 'V', default: '400', limits: { gt: 0, text: 'must be above 0' } },
      { key: 'vs', label: 'Secondary line voltage', kind: 'value', unit: 'V', default: '400', limits: { gt: 0, text: 'must be above 0' } },
      { key: 'lp', label: 'Primary winding inductance', kind: 'value', unit: 'H', default: '10', help: 'magnetising inductance of each primary winding' },
      { key: 'k', label: 'Coupling', kind: 'value', default: '0.999', limits: { gt: 0, le: 1, text: 'must be above 0 and at most 1' } },
      { key: 'rp', label: 'Primary winding resistance', kind: 'value', unit: 'Ω', default: '0.5' },
      { key: 'rs', label: 'Secondary winding resistance', kind: 'value', unit: 'Ω', default: '0.5' },
    ],
  },
  {
    id: 'potentiometer', name: 'Potentiometer', category: 'Passive', keywords: ['pot', 'trimmer', 'variable resistor', 'rv'], prefix: 'RV',
    description: 'Potentiometer; pin 2 is the wiper. Drag the wiper arrow on the sheet, turn the mouse wheel over it, or use the slider in Properties.',
    pins: [{ id: '1', name: '1', x: -30, y: 0, type: 'passive' }, { id: '2', name: 'W', x: 0, y: -30, type: 'passive' }, { id: '3', name: '3', x: 30, y: 0, type: 'passive' }],
    refAt: { x: 16, y: -20 }, valAt: { x: 0, y: 18 }, simulated: true, interactive: 'pot',
    // the wiper arrow sits at its position along the track (0 % at pin 1, 100 % at pin 3)
    gfx: (p) => {
      const pos = Math.min(100, Math.max(0, Number.parseFloat(p.position ?? '50') || 0)) / 100;
      const ax = Math.round((-13 + 26 * pos) * 10) / 10;
      return [path('M -30 0 H -15 M 15 0 H 30'), path(`M 0 -30 V -20 H ${ax} V -13`), path('M -15 -6 H 15 V 6 H -15 Z', 'bg'), arrowHead(ax, -14, ax, -7)];
    },
    value: { key: 'value', label: 'Resistance', kind: 'value', unit: 'Ω', default: '10k' },
    params: [{ key: 'pmax', label: 'Power rating', kind: 'value', unit: 'W', default: '0.5', help: 'for the stress check (smoke analysis)', limits: { gt: 0, text: 'must be above 0' } }, { key: 'position', label: 'Wiper position', kind: 'value', unit: '%', default: '50', help: '0 % = at pin 1, 100 % = at pin 3', limits: { ge: 0, le: 100, text: 'must be from 0 to 100 %' } }],
  },
  {
    id: 'vdc', name: 'DC voltage source', category: 'Sources', keywords: ['v', 'supply', 'dc', 'power supply', 'voltage'], prefix: 'V',
    description: 'Ideal DC voltage source; pin 1 is positive.', pins: vert(), ...VV, simulated: true,
    gfx: () => [path('M 0 -30 V -15 M 0 15 V 30'), circle(0, 0, 15, 'bg'), text(0, -4, '+', 11), text(0, 10, '−', 11)],
    value: { key: 'value', label: 'Voltage', kind: 'value', unit: 'V', default: '5' },
    params: [{ key: 'ac', label: 'AC magnitude', kind: 'value', unit: 'V', default: '0', help: 'Amplitude used by the AC analysis' }],
  },
  {
    id: 'battery', name: 'Battery', category: 'Sources', keywords: ['cell', 'battery', 'aa', '9v', 'lipo'], prefix: 'BT',
    description: 'Battery as an ideal voltage source with internal resistance; pin 1 is positive.', pins: vert(), ...VV, simulated: true,
    gfx: () => [path('M 0 -30 V -6 M 0 6 V 30 M -12 -6 H 12 M -12 2 H 12'), path('M -6 -2 H 6 M -6 6 H 6', 'none', 3), text(14, -14, '+', 10)],
    value: { key: 'value', label: 'Voltage', kind: 'value', unit: 'V', default: '9' },
    params: [{ key: 'rint', label: 'Internal resistance', kind: 'value', unit: 'Ω', default: '0.5' }],
  },
  {
    id: 'vsin', name: 'Sine voltage source', category: 'Sources', keywords: ['ac', 'sine', 'signal generator', 'function generator', 'mains'], prefix: 'V',
    description: 'Sine wave: offset + amplitude·sin(2π·f·t). Also the AC-analysis source.', pins: vert(), ...VV, simulated: true,
    gfx: () => [path('M 0 -30 V -15 M 0 15 V 30'), circle(0, 0, 15, 'bg'), path('M -9 0 C -6 -10 -3 -10 0 0 C 3 10 6 10 9 0')],
    value: { key: 'value', label: 'Amplitude', kind: 'value', unit: 'V', default: '1' },
    params: [
      { key: 'freq', label: 'Frequency', kind: 'value', unit: 'Hz', default: '1k', limits: { gt: 0, text: 'must be above 0' } },
      { key: 'offset', label: 'Offset', kind: 'value', unit: 'V', default: '0' },
      { key: 'phase', label: 'Phase', kind: 'value', unit: '°', default: '0' },
      { key: 'delay', label: 'Delay', kind: 'value', unit: 's', default: '0', help: 'Before the delay the source holds offset + amplitude·sin(phase) (SPICE TD)' },
      { key: 'ac', label: 'AC magnitude', kind: 'value', unit: 'V', default: '1', help: 'Amplitude used by the AC analysis' },
    ],
  },
  {
    id: 'vsin3', name: 'Three-phase source', category: 'Sources', keywords: ['3 phase', 'three phase', 'three-phase', 'mains', 'grid', '400v', 'l1 l2 l3', '3~'], prefix: 'V',
    description: 'Balanced three-phase supply in star: L1, L2 and L3 lag each other by 120°, measured from N. Set the RMS phase voltage (line to neutral); the line voltage is √3 times larger (230 V → 400 V).',
    pins: [{ id: '1', name: 'L1', x: 40, y: -20, type: 'power_out' }, { id: '2', name: 'L2', x: 40, y: 0, type: 'power_out' },
      { id: '3', name: 'L3', x: 40, y: 20, type: 'power_out' }, { id: '4', name: 'N', x: 0, y: 40, type: 'power_out' }],
    refAt: { x: -22, y: -14 }, valAt: { x: -22, y: 26 }, simulated: true,
    gfx: () => [path('M 15 -9 L 26 -20 H 40 M 18 0 H 40 M 15 9 L 26 20 H 40 M 0 18 V 40'), circle(0, 0, 18, 'bg'),
      path('M -9 -2 C -6 -12 -3 -12 0 -2 C 3 8 6 8 9 -2'), text(0, 12, '3~', 8), text(34, -23, 'L1', 6), text(34, -3, 'L2', 6), text(34, 17, 'L3', 6)],
    value: { key: 'value', label: 'Phase voltage (RMS)', kind: 'value', unit: 'V', default: '230' },
    params: [
      { key: 'freq', label: 'Frequency', kind: 'value', unit: 'Hz', default: '50', limits: { gt: 0, text: 'must be above 0' } },
      { key: 'ac', label: 'AC magnitude', kind: 'value', unit: 'V', default: '0', help: 'Per phase, for the AC analysis (phases 0°, −120°, +120°)' },
    ],
  },
  {
    id: 'vpulse', name: 'Pulse voltage source', category: 'Sources', keywords: ['square', 'pulse', 'clock', 'pwm', 'step'], prefix: 'V',
    description: 'Square wave or single step: low/high level, period and duty cycle.', pins: vert(), ...VV, simulated: true,
    gfx: () => [path('M 0 -30 V -15 M 0 15 V 30'), circle(0, 0, 15, 'bg'), path('M -9 5 H -4 V -5 H 4 V 5 H 9')],
    value: { key: 'value', label: 'High level', kind: 'value', unit: 'V', default: '5' },
    params: [
      { key: 'low', label: 'Low level', kind: 'value', unit: 'V', default: '0' },
      { key: 'freq', label: 'Frequency', kind: 'value', unit: 'Hz', default: '1k', limits: { gt: 0, text: 'must be above 0' } },
      { key: 'duty', label: 'Duty cycle', kind: 'value', unit: '%', default: '50', limits: { ge: 0, le: 100, text: 'must be from 0 to 100 %' } },
      { key: 'delay', label: 'Delay', kind: 'value', unit: 's', default: '0' },
      { key: 'edge', label: 'Rise/fall time', kind: 'value', unit: 's', default: '1u' },
    ],
  },
  {
    id: 'idc', name: 'DC current source', category: 'Sources', keywords: ['i', 'current', 'constant current'], prefix: 'I',
    description: 'Ideal current source; the current leaves at pin 1 (arrow).',
    pins: [{ id: '1', name: 'out', x: 0, y: -30, type: 'power_out' }, { id: '2', name: 'in', x: 0, y: 30, type: 'power_out' }], ...VV, simulated: true,
    gfx: () => [path('M 0 -30 V -15 M 0 15 V 30'), circle(0, 0, 15, 'bg'), path('M 0 9 V -4'), arrowHead(0, 0, 0, -10)],
    value: { key: 'value', label: 'Current', kind: 'value', unit: 'A', default: '1m' }, params: [],
  },
  {
    id: 'ntc', name: 'NTC thermistor', category: 'Passive', keywords: ['rt', 'ntc', 'thermistor', 'temperature sensor', 'inrush'], prefix: 'RT',
    description: 'NTC thermistor: R = R25·exp(B·(1/T − 1/298.15 K)) at the circuit temperature (Simulation tab), so it follows a temperature sweep. Self-heating is not modelled.',
    pins: two('1', '2'), ...H, simulated: true,
    gfx: () => [path('M -30 0 H -15 M 15 0 H 30'), path('M -15 -6 H 15 V 6 H -15 Z', 'bg'), path('M -14 11 L 12 -11 H 18'), text(-20, -11, '−t°', 7)],
    value: { key: 'value', label: 'Resistance at 25 °C', kind: 'value', unit: 'Ω', default: '10k', limits: { gt: 0, text: 'must be above 0' } },
    params: [
      { key: 'beta', label: 'B value', kind: 'value', unit: 'K', default: '3950', help: 'B25/85 from the datasheet (typically 3000 to 4500 K)', limits: { gt: 0, le: 20000, text: 'must be above 0 and at most 20 000 K' } },
      { key: 'pmax', label: 'Power rating', kind: 'value', unit: 'W', default: '0.5', help: 'for the stress check (smoke analysis)', limits: { gt: 0, text: 'must be above 0' } },
      { key: 'temp', label: 'Sensed temperature', kind: 'value', unit: '°C', default: '', help: 'Empty: the simulation temperature. Set it for a sensor on something hotter or colder than the air, such as a battery or a heatsink.' },
    ],
  },
  {
    id: 'fuse', name: 'Fuse', category: 'Passive', keywords: ['f', 'fuse', 'protection', 'overcurrent'], prefix: 'F',
    description: 'Fuse: its cold resistance in the circuit. The stress check reports when the RMS current exceeds the rated current (the fuse would blow); the simulation does not open it.',
    pins: two('1', '2'), ...H, simulated: true,
    gfx: () => [path('M -30 0 H -15 M 15 0 H 30'), path('M -15 -5 H 15 V 5 H -15 Z', 'bg'), path('M -15 0 H 15')],
    value: { key: 'value', label: 'Rated current', kind: 'value', unit: 'A', default: '1', limits: { gt: 0, text: 'must be above 0' } },
    params: [{ key: 'r', label: 'Cold resistance', kind: 'value', unit: 'Ω', default: '0.1', help: 'from the datasheet (a 1 A fast fuse is about 0.1 Ω)', limits: { gt: 0, text: 'must be above 0' } }],
  },
  {
    id: 'diode', name: 'Diode', category: 'Semiconductors', keywords: ['d', 'rectifier', '1n4148', '1n4007', 'schottky'], prefix: 'D',
    description: 'Diode; current flows from anode (left) to cathode (bar).',
    pins: [{ id: '2', name: 'A', x: -30, y: 0, type: 'passive' }, { id: '1', name: 'K', x: 30, y: 0, type: 'passive' }], ...H, simulated: true,
    gfx: () => [path('M -30 0 H -8 M 8 0 H 30 M 8 -9 V 9', 'none', 2), path('M -8 -9 L 8 0 L -8 9 Z', fg)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(DIODES.map((m) => m.name)), default: '1N4148' }, params: [HEATSINK, { key: 'spice', label: 'SPICE model (optional)', kind: 'text', default: '', help: 'Paste a .model line from a datasheet or vendor library; it replaces the model above.' }],
  },
  {
    id: 'zener', name: 'Zener diode', category: 'Semiconductors', keywords: ['z', 'zener', 'reference', 'regulator'], prefix: 'D',
    description: 'Zener diode; conducts in reverse at its Zener voltage.',
    pins: [{ id: '2', name: 'A', x: -30, y: 0, type: 'passive' }, { id: '1', name: 'K', x: 30, y: 0, type: 'passive' }], ...H, simulated: true,
    gfx: () => [path('M -30 0 H -8 M 8 0 H 30 M 4 -11 L 8 -9 V 9 L 12 11', 'none', 2), path('M -8 -9 L 8 0 L -8 9 Z', fg)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(ZENERS.map((m) => m.name)), default: 'BZX55C5V1' }, params: [{ key: 'spice', label: 'SPICE model (optional)', kind: 'text', default: '', help: 'Paste a .model line from a datasheet or vendor library; it replaces the model above.' }],
  },
  {
    id: 'led', name: 'LED', category: 'Semiconductors', keywords: ['led', 'light', 'lamp', 'indicator'], prefix: 'D',
    description: 'Light-emitting diode; lights up in the simulation according to its current (20 mA = full).',
    pins: [{ id: '2', name: 'A', x: -30, y: 0, type: 'passive' }, { id: '1', name: 'K', x: 30, y: 0, type: 'passive' }], ...H, simulated: true,
    gfx: (p) => {
      const css = LED_COLOURS.find((c) => c.name === p.colour)?.css ?? LED_COLOURS[0].css;
      return [
        path('M -30 0 H -8 M 8 0 H 30 M 8 -9 V 9', 'none', 2), path('M -8 -9 L 8 0 L -8 9 Z', css),
        path('M 0 -11 L 7 -18 M 6 -9 L 13 -16'), arrowHead(0, -11, 8, -19, 4, 2), arrowHead(6, -9, 14, -17, 4, 2),
      ];
    },
    value: { key: 'colour', label: 'Colour', kind: 'select', options: opts(LED_COLOURS.map((c) => c.name)), default: 'red' }, params: [],
  },
  {
    id: 'npn', name: 'NPN transistor', category: 'Semiconductors', keywords: ['q', 'bjt', 'transistor', 'bc547', '2n3904', '2n2222'], prefix: 'Q',
    description: 'NPN bipolar transistor (B left, C top, E bottom).',
    pins: [{ id: '1', name: 'B', x: -30, y: 0, type: 'input' }, { id: '2', name: 'C', x: 10, y: -30, type: 'passive' }, { id: '3', name: 'E', x: 10, y: 30, type: 'passive' }],
    refAt: { x: 30, y: -6 }, valAt: { x: 30, y: 8 }, simulated: true,
    gfx: () => [circle(2, 0, 20), path('M -30 0 H -6 M -6 -12 V 12', 'none', 2), path('M -6 -5 L 10 -18 V -30 M -6 5 L 10 18 V 30'), arrowHead(-6, 5, 7, 15.6)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(BJTS.filter((m) => m.model.type === 'npn').map((m) => m.name)), default: '2N3904' }, params: [HEATSINK, { key: 'spice', label: 'SPICE model (optional)', kind: 'text', default: '', help: 'Paste a .model line from a datasheet or vendor library; it replaces the model above.' }],
  },
  {
    id: 'pnp', name: 'PNP transistor', category: 'Semiconductors', keywords: ['q', 'bjt', 'transistor', 'bc557', '2n3906'], prefix: 'Q',
    description: 'PNP bipolar transistor (B left, E top, C bottom).',
    pins: [{ id: '1', name: 'B', x: -30, y: 0, type: 'input' }, { id: '2', name: 'C', x: 10, y: 30, type: 'passive' }, { id: '3', name: 'E', x: 10, y: -30, type: 'passive' }],
    refAt: { x: 30, y: -6 }, valAt: { x: 30, y: 8 }, simulated: true,
    gfx: () => [circle(2, 0, 20), path('M -30 0 H -6 M -6 -12 V 12', 'none', 2), path('M -6 -5 L 10 -18 V -30 M -6 5 L 10 18 V 30'), arrowHead(10, -18, -3, -7.4)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(BJTS.filter((m) => m.model.type === 'pnp').map((m) => m.name)), default: '2N3906' }, params: [HEATSINK, { key: 'spice', label: 'SPICE model (optional)', kind: 'text', default: '', help: 'Paste a .model line from a datasheet or vendor library; it replaces the model above.' }],
  },
  {
    id: 'nmos', name: 'N-channel MOSFET', category: 'Semiconductors', keywords: ['m', 'mosfet', 'fet', 'transistor', '2n7000', 'irlz44n', 'logic level'], prefix: 'Q',
    description: 'N-channel enhancement MOSFET (G left, D top, S bottom), with body diode.',
    pins: [{ id: '1', name: 'G', x: -30, y: 0, type: 'input' }, { id: '2', name: 'D', x: 10, y: -30, type: 'passive' }, { id: '3', name: 'S', x: 10, y: 30, type: 'passive' }],
    refAt: { x: 30, y: -6 }, valAt: { x: 30, y: 8 }, simulated: true,
    gfx: () => [circle(2, 0, 20), path('M -30 0 H -10 M -10 -12 V 12', 'none', 2), path('M -4 -14 V -7 M -4 -3 V 3 M -4 7 V 14', 'none', 2),
      path('M -4 -11 H 10 V -30 M -4 11 H 10 V 30 M 10 0 V 11'), path('M 10 0 H 2'), arrowHead(10, 0, -3, 0, 6, 3)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(MOSFETS.filter((m) => m.model.type === 'nmos').map((m) => m.name)), default: '2N7000' }, params: [HEATSINK, { key: 'spice', label: 'SPICE model (optional)', kind: 'text', default: '', help: 'Paste a .model line from a datasheet or vendor library; it replaces the model above.' }],
  },
  {
    id: 'pmos', name: 'P-channel MOSFET', category: 'Semiconductors', keywords: ['m', 'mosfet', 'fet', 'transistor', 'high side', 'bs250'], prefix: 'Q',
    description: 'P-channel enhancement MOSFET (G left, S top, D bottom), with body diode.',
    pins: [{ id: '1', name: 'G', x: -30, y: 0, type: 'input' }, { id: '2', name: 'D', x: 10, y: 30, type: 'passive' }, { id: '3', name: 'S', x: 10, y: -30, type: 'passive' }],
    refAt: { x: 30, y: -6 }, valAt: { x: 30, y: 8 }, simulated: true,
    gfx: () => [circle(2, 0, 20), path('M -30 0 H -10 M -10 -12 V 12', 'none', 2), path('M -4 -14 V -7 M -4 -3 V 3 M -4 7 V 14', 'none', 2),
      path('M -4 -11 H 10 V -30 M -4 11 H 10 V 30 M 10 0 V -11'), path('M -3 0 H 4'), arrowHead(-4, 0, 9, 0, 6, 3)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(MOSFETS.filter((m) => m.model.type === 'pmos').map((m) => m.name)), default: 'BS250' }, params: [HEATSINK, { key: 'spice', label: 'SPICE model (optional)', kind: 'text', default: '', help: 'Paste a .model line from a datasheet or vendor library; it replaces the model above.' }],
  },
  {
    id: 'tvs', name: 'TVS diode', category: 'Semiconductors', keywords: ['d', 'tvs', 'transient', 'suppressor', 'esd', 'surge', 'protection', 'smaj', 'transil'], prefix: 'D',
    description: 'Transient voltage suppressor: blocks up to its stand-off voltage and clamps surges at its breakdown voltage. "A" types are unidirectional (cathode to the protected line), "CA" types bidirectional.',
    pins: [{ id: '2', name: 'A', x: -30, y: 0, type: 'passive' }, { id: '1', name: 'K', x: 30, y: 0, type: 'passive' }], ...H, simulated: true,
    gfx: (p) => findModel(TVS, p.value ?? '').model.bidirectional
      ? [path('M -30 0 H -16 M 16 0 H 30 M -4 -12 L 0 -9 V 9 L 4 12', 'none', 2), path('M -16 -9 L 0 0 L -16 9 Z', fg), path('M 16 -9 L 0 0 L 16 9 Z', fg)]
      : [path('M -30 0 H -8 M 8 0 H 30 M 3 -12 L 8 -9 V 9 L 13 12', 'none', 2), path('M -8 -9 L 8 0 L -8 9 Z', fg)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(TVS.map((m) => m.name)), default: 'SMAJ12A' }, params: [],
  },
  {
    id: 'bridge', name: 'Bridge rectifier', category: 'Semiconductors', keywords: ['br', 'bridge', 'rectifier', 'graetz', 'full wave', 'db107', 'kbp', 'gbu'], prefix: 'BR',
    description: 'Full-wave bridge rectifier: four diodes; the AC goes to the two ~ pins, the DC comes out between + and −.',
    pins: [{ id: '1', name: '~', x: -40, y: 0, type: 'passive' }, { id: '2', name: '~', x: 40, y: 0, type: 'passive' }, { id: '3', name: '+', x: 0, y: -40, type: 'passive' }, { id: '4', name: '−', x: 0, y: 40, type: 'passive' }],
    refAt: { x: 30, y: -26 }, valAt: { x: 30, y: 30 }, simulated: true,
    gfx: () => [path('M -40 0 H -20 M 20 0 H 40 M 0 -40 V -20 M 0 20 V 40'), path('M -20 0 L 0 -20 L 20 0 L 0 20 Z', 'bg'),
      arrowHead(-14, -6, -6, -14), arrowHead(14, -6, 6, -14), arrowHead(-6, 14, -14, 6), arrowHead(6, 14, 14, 6),
      text(8, -30, '+', 8), text(8, 34, '−', 8), text(-30, -6, '~', 8), text(30, -6, '~', 8)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(BRIDGES.map((m) => m.name)), default: 'DB107' }, params: [],
  },
  {
    id: 'igbt', name: 'IGBT', category: 'Semiconductors', keywords: ['q', 'igbt', 'insulated gate', 'inverter', 'motor drive', 'power switch'], prefix: 'Q',
    description: 'N-channel IGBT (G left, C top, E bottom): a voltage-controlled power switch for high voltages; on above its gate threshold, about VCE(sat) across it when on. Models with "diode" have the usual anti-parallel diode.',
    pins: [{ id: '1', name: 'G', x: -30, y: 0, type: 'input' }, { id: '2', name: 'C', x: 10, y: -30, type: 'passive' }, { id: '3', name: 'E', x: 10, y: 30, type: 'passive' }],
    refAt: { x: 36, y: -6 }, valAt: { x: 36, y: 8 }, simulated: true,
    gfx: (p) => [circle(2, 0, 20), path('M -30 0 H -12 M -12 -10 V 10', 'none', 2), path('M -7 -12 V 12', 'none', 2),
      path('M -7 -6 L 10 -18 V -30 M -7 6 L 10 18 V 30'), arrowHead(-7, 6, 7, 15.6),
      ...(findModel(IGBTS, p.value ?? '').model.diode ? [path('M 10 -24 H 26 V 24 H 10'), path('M 20 6 H 32 L 26 -4 Z', fg), path('M 20 -4 H 32')] : [])],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(IGBTS.map((m) => m.name)), default: 'IKW30N60T' }, params: [HEATSINK, ],
  },
  {
    id: 'opto', name: 'Optocoupler', category: 'Semiconductors', keywords: ['u', 'opto', 'optocoupler', 'optoisolator', 'pc817', 'isolation', 'phototransistor'], prefix: 'U',
    description: 'Optocoupler (PC817 pin-out: 1 anode, 2 cathode, 3 emitter, 4 collector): the LED current, times the current transfer ratio, flows into the phototransistor\'s collector until it saturates. Input and output are isolated.',
    pins: [{ id: '1', name: 'A', x: -40, y: -10, type: 'passive' }, { id: '2', name: 'K', x: -40, y: 10, type: 'passive' }, { id: '4', name: 'C', x: 40, y: -10, type: 'passive' }, { id: '3', name: 'E', x: 40, y: 10, type: 'passive' }],
    refAt: { x: 0, y: -30 }, valAt: { x: 0, y: 36 }, simulated: true,
    gfx: () => [path('M -28 -22 H 28 V 22 H -28 Z', 'bg'), path('M -40 -10 H -14 V -6 M -14 6 V 10 H -40'), path('M -20 -6 H -8 L -14 6 Z', fg), path('M -20 6 H -8'),
      path('M -4 -4 L 4 0 M -4 4 L 4 8'), arrowHead(-4, -4, 4, 0, 4, 2), arrowHead(-4, 4, 4, 8, 4, 2),
      path('M 10 -9 V 9', 'none', 2), path('M 10 -4 L 22 -10 H 40 M 10 4 L 22 10 H 40'), arrowHead(10, 4, 20.5, 9.2, 5, 2.5)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(OPTOS.map((m) => m.name)), default: 'PC817' },
    params: [{ key: 'ctr', label: 'Current transfer ratio', kind: 'value', unit: '%', default: '100', help: 'IC/IF before saturation: PC817 rank A 80–160 %, B 130–260 %, C 200–400 %', limits: { gt: 0, le: 1000, text: 'must be above 0 and at most 1000 %' } }],
  },
  {
    id: 'opamp', name: 'Op-amp', category: 'Integrated circuits', keywords: ['u', 'opamp', 'operational amplifier', 'lm358', 'tl072', 'comparator'], prefix: 'U',
    description: 'Operational amplifier with supply pins (pin numbers of a single op-amp in DIP-8).',
    pins: [
      { id: '3', name: '+', x: -50, y: -10, type: 'input' }, { id: '2', name: '−', x: -50, y: 10, type: 'input' },
      { id: '6', name: 'OUT', x: 40, y: 0, type: 'output' },
      { id: '7', name: 'V+', x: -10, y: -40, type: 'power_in' }, { id: '4', name: 'V−', x: -10, y: 40, type: 'power_in' },
    ],
    refAt: { x: 10, y: -24 }, valAt: { x: 10, y: 28 }, simulated: true,
    gfx: () => [path('M -50 -10 H -30 M -50 10 H -30 M 30 0 H 40 M -10 -40 V -20 M -10 40 V 20'), path('M -30 -30 L 30 0 L -30 30 Z', 'bg'),
      text(-24, -6, '+', 11), text(-24, 14, '−', 11)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(OPAMPS.map((m) => m.name)), default: 'generic' }, params: [],
  },
  {
    id: 'regulator', name: 'Voltage regulator', category: 'Integrated circuits', keywords: ['u', 'regulator', 'ldo', '7805', 'lm7805', '78xx', 'ams1117', 'supply', 'linear'], prefix: 'U',
    description: 'Fixed linear voltage regulator (pins as TO-220 78xx: 1 IN, 2 GND, 3 OUT). Needs about 2 V more at the input than at the output (1.1 V for the AMS1117).',
    pins: [{ id: '1', name: 'IN', x: -40, y: 0, type: 'power_in' }, { id: '2', name: 'GND', x: 0, y: 30, type: 'power_in' }, { id: '3', name: 'OUT', x: 40, y: 0, type: 'power_out' }],
    refAt: { x: 0, y: -20 }, valAt: { x: 12, y: 26 }, simulated: true,
    gfx: () => [path('M -40 0 H -25 M 25 0 H 40 M 0 10 V 30'), path('M -25 -10 H 25 V 10 H -25 Z', 'bg'), text(-14, 3, 'IN', 7), text(13, 3, 'OUT', 7), text(0, 8, 'GND', 6)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(REGULATORS.map((m) => m.name)), default: '7805' }, params: [HEATSINK],
  },
  {
    id: 'tl431', name: 'Shunt reference', category: 'Integrated circuits', keywords: ['u', 'tl431', 'tlv431', 'shunt', 'reference', 'programmable zener', 'feedback'], prefix: 'U',
    description: 'Adjustable shunt regulator (TL431): the cathode sinks the current that holds REF at the reference voltage above the anode; with REF tied to the cathode it is a 2.495 V reference, with a divider any voltage up to 36 V (Vout = Vref × (1 + R1/R2)).',
    pins: [{ id: '2', name: 'A', x: -30, y: 0, type: 'passive' }, { id: '3', name: 'K', x: 30, y: 0, type: 'passive' }, { id: '1', name: 'REF', x: 0, y: 30, type: 'input' }],
    refAt: { x: 0, y: -14 }, valAt: { x: 26, y: 20 }, simulated: true,
    gfx: () => [path('M -30 0 H -8 M 8 0 H 30 M 4 -11 L 8 -9 V 9 L 12 11', 'none', 2), path('M -8 -9 L 8 0 L -8 9 Z', fg), path('M 0 5 V 30')],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(SHUNT_REFS.map((m) => m.name)), default: 'TL431' }, params: [],
  },
  {
    id: 'comparator', name: 'Comparator', category: 'Integrated circuits', keywords: ['u', 'comparator', 'lm393', 'lm339', 'window', 'threshold', 'open collector'], prefix: 'U',
    description: 'Voltage comparator with an open-collector output (LM393 pin-out: 3 +, 2 −, 1 OUT, 8 V+, 4 GND): the output transistor pulls OUT to GND while − is above +; a pull-up resistor gives the high level.',
    pins: [{ id: '3', name: '+', x: -40, y: -10, type: 'input' }, { id: '2', name: '−', x: -40, y: 10, type: 'input' }, { id: '1', name: 'OUT', x: 40, y: 0, type: 'output' },
      { id: '8', name: 'V+', x: 0, y: -30, type: 'power_in' }, { id: '4', name: 'GND', x: 0, y: 30, type: 'power_in' }],
    refAt: { x: 16, y: -20 }, valAt: { x: 16, y: 26 }, simulated: true,
    gfx: () => [path('M -40 -10 H -20 M -40 10 H -20 M 20 0 H 40 M 0 -30 V -10 M 0 30 V 10'), path('M -20 -20 L 20 0 L -20 20 Z', 'bg'), text(-14, -6, '+', 9), text(-14, 13, '−', 9),
      path('M 6 -3 L 10 0 L 6 3', 'none', 0.8)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(COMPARATORS.map((m) => m.name)), default: 'LM393' }, params: [],
  },
  {
    id: 'hbdriver', name: 'Half-bridge gate driver', category: 'Integrated circuits', keywords: ['u', 'gate driver', 'half bridge', 'bootstrap', 'ir2184', 'ir2110', 'mosfet driver', 'igbt driver', 'inverter'], prefix: 'U',
    description: 'Half-bridge gate driver (IR2184 pin-out: 1 IN, 2 SD, 3 COM, 4 LO, 5 VS, 6 HO, 7 VB, 8 VCC): HO (between VB and VS, supplied by a bootstrap diode and capacitor) follows IN, LO the inverse, with a dead time of 0.5 µs between them. Logic high above 3.3 V. SD (optional) low turns both outputs off.',
    pins: [{ id: '1', name: 'IN', x: -40, y: 0, type: 'input' }, { id: '2', name: 'SD', x: -40, y: 20, type: 'input', optional: true }, { id: '8', name: 'VCC', x: -20, y: -40, type: 'power_in' }, { id: '3', name: 'COM', x: -20, y: 40, type: 'power_in' },
      { id: '7', name: 'VB', x: 40, y: -30, type: 'power_in' }, { id: '6', name: 'HO', x: 40, y: -10, type: 'output' }, { id: '5', name: 'VS', x: 40, y: 10, type: 'passive' }, { id: '4', name: 'LO', x: 40, y: 30, type: 'output', optional: true }],
    refAt: { x: 0, y: -46 }, valAt: { x: 12, y: 50 }, simulated: true,
    gfx: () => [path('M -40 0 H -26 M -40 20 H -26 M -20 -40 V -34 M -20 40 V 34 M 26 -30 H 40 M 26 -10 H 40 M 26 10 H 40 M 26 30 H 40'), path('M -26 -34 H 26 V 34 H -26 Z', 'bg'),
      text(-16, 3, 'IN', 6), text(-16, 23, 'SD', 5), text(-20, -27, 'VCC', 5), text(-20, 31, 'COM', 5), text(18, -27, 'VB', 5), text(18, -7, 'HO', 5), text(18, 13, 'VS', 5), text(18, 33, 'LO', 5)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(GATE_DRIVERS.map((m) => m.name)), default: GATE_DRIVERS[0].name }, params: [],
  },
  {
    id: 'lm317', name: 'Adjustable regulator', category: 'Integrated circuits', keywords: ['u', 'lm317', 'adjustable', 'regulator', 'variable supply'], prefix: 'U',
    description: 'Adjustable linear regulator (pins as TO-220 LM317: 1 ADJ, 2 OUT, 3 IN). OUT stays 1.25 V above ADJ: Vout = 1.25 V × (1 + R2/R1) with R1 from OUT to ADJ and R2 from ADJ to ground.',
    pins: [{ id: '3', name: 'IN', x: -40, y: 0, type: 'power_in' }, { id: '1', name: 'ADJ', x: 0, y: 30, type: 'input' }, { id: '2', name: 'OUT', x: 40, y: 0, type: 'power_out' }],
    refAt: { x: 0, y: -20 }, valAt: { x: 12, y: 26 }, simulated: true,
    gfx: () => [path('M -40 0 H -25 M 25 0 H 40 M 0 10 V 30'), path('M -25 -10 H 25 V 10 H -25 Z', 'bg'), text(-14, 3, 'IN', 7), text(13, 3, 'OUT', 7), text(0, 8, 'ADJ', 6)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(ADJ_REGULATORS.map((m) => m.name)), default: 'LM317' }, params: [HEATSINK],
  },
  {
    id: 'timer555', name: '555 timer', category: 'Integrated circuits', keywords: ['u', '555', 'ne555', 'timer', 'oscillator', 'astable', 'monostable', 'blinker'], prefix: 'U',
    description: '555 timer (DIP-8 pin numbers). Behavioural model: comparators at 2/3 and 1/3 of VCC, latch, output and discharge stages, NE555 output levels. Not exported to SPICE.',
    pins: [
      { id: '8', name: 'VCC', x: -10, y: -50, type: 'power_in' }, { id: '4', name: 'RESET', x: 10, y: -50, type: 'input' },
      { id: '7', name: 'DIS', x: -40, y: -20, type: 'passive' }, { id: '6', name: 'THR', x: -40, y: 0, type: 'input' }, { id: '2', name: 'TRIG', x: -40, y: 20, type: 'input' },
      { id: '3', name: 'OUT', x: 40, y: 0, type: 'output' }, { id: '5', name: 'CTRL', x: 40, y: 20, type: 'passive' },
      { id: '1', name: 'GND', x: 0, y: 50, type: 'power_in' },
    ],
    refAt: { x: -24, y: -42 }, valAt: { x: 46, y: 46 }, simulated: true,
    gfx: () => [
      path('M -10 -50 V -35 M 10 -50 V -35 M -40 -20 H -25 M -40 0 H -25 M -40 20 H -25 M 25 0 H 40 M 25 20 H 40 M 0 35 V 50'),
      path('M -25 -35 H 25 V 35 H -25 Z', 'bg'),
      text(-10, -27, 'VCC', 6), text(10, -27, 'RST', 6), text(-15, -18, 'DIS', 6), text(-15, 2, 'THR', 6), text(-15, 22, 'TRG', 6), text(15, 2, 'OUT', 6), text(14, 22, 'CV', 6), text(0, 32, 'GND', 6), text(0, -8, '555', 9),
    ],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(['NE555']), default: 'NE555' }, params: [],
  },
  {
    id: 'switch', name: 'Switch', category: 'Switches', keywords: ['sw', 'toggle', 'spst', 'on off'], prefix: 'SW',
    description: 'On/off switch (SPST). Click it while simulating to toggle.', pins: two('1', '2'), ...H, simulated: true, interactive: 'toggle',
    gfx: (p) => [path('M -30 0 H -12 M 12 0 H 30'), circle(-12, 0, 2, 'bg'), circle(12, 0, 2, 'bg'),
      path(p.closed === 'true' ? 'M -11 -1 L 12 -3' : 'M -11 -1 L 9 -13', 'none', 2)],
    value: { key: 'closed', label: 'Closed', kind: 'bool', default: 'false' }, params: [{ key: 'imax', label: 'Current rating', kind: 'value', unit: 'A', default: '1', help: 'for the stress check (smoke analysis)', limits: { gt: 0, text: 'must be above 0' } }],
  },
  {
    id: 'button', name: 'Push-button', category: 'Switches', keywords: ['button', 'push', 'tactile', 'momentary', 'key'], prefix: 'SW',
    description: 'Momentary push-button (normally open). Hold it down with the mouse or Space while simulating.', pins: two('1', '2'), ...H, simulated: true, interactive: 'momentary',
    gfx: (p) => {
      const y = p.pressed === 'true' ? -3 : -9;
      return [path('M -30 0 H -12 M 12 0 H 30'), circle(-12, 0, 2, 'bg'), circle(12, 0, 2, 'bg'), path(`M -14 ${y} H 14`, 'none', 2), path(`M 0 ${y} V ${y - 8} M -5 ${y - 8} H 5`)];
    },
    value: { key: 'pressed', label: 'Pressed', kind: 'bool', default: 'false' }, params: [{ key: 'imax', label: 'Current rating', kind: 'value', unit: 'A', default: '1', help: 'for the stress check (smoke analysis)', limits: { gt: 0, text: 'must be above 0' } }],
  },
  {
    id: 'spdt', name: 'Changeover switch', category: 'Switches', keywords: ['spdt', 'changeover', 'selector', 'toggle'], prefix: 'SW',
    description: 'Changeover switch (SPDT); pin 1 is common. Click it while simulating to change over.',
    pins: [{ id: '1', name: 'C', x: -30, y: 0, type: 'passive' }, { id: '2', name: 'A', x: 30, y: -10, type: 'passive' }, { id: '3', name: 'B', x: 30, y: 10, type: 'passive' }],
    refAt: { x: 0, y: -22 }, valAt: { x: 0, y: 26 }, simulated: true, interactive: 'throw',
    gfx: (p) => [path('M -30 0 H -12 M 12 -10 H 30 M 12 10 H 30'), circle(-12, 0, 2, 'bg'), circle(12, -10, 2, 'bg'), circle(12, 10, 2, 'bg'),
      path(p.position === 'B' ? 'M -11 1 L 11 9' : 'M -11 -1 L 11 -9', 'none', 2)],
    value: { key: 'position', label: 'Position', kind: 'select', options: opts(['A', 'B']), default: 'A' }, params: [{ key: 'imax', label: 'Current rating', kind: 'value', unit: 'A', default: '1', help: 'for the stress check (smoke analysis)', limits: { gt: 0, text: 'must be above 0' } }],
  },
  {
    id: 'relay', name: 'Relay', category: 'Switches', keywords: ['k', 'relay', 'coil', 'contactor', 'changeover'], prefix: 'K',
    description: 'Relay with a changeover contact: COM connects to NC at rest and to NO while the coil is energised (pull-in at 75 %, drop-out at 25 % of the nominal coil current). The coil is inductive: switch it with a flyback diode.',
    pins: [{ id: '1', name: 'A1', x: -20, y: -30, type: 'passive' }, { id: '2', name: 'A2', x: -20, y: 30, type: 'passive' },
      { id: '3', name: 'COM', x: 10, y: 30, type: 'passive' }, { id: '4', name: 'NC', x: 40, y: -10, type: 'passive', optional: true }, { id: '5', name: 'NO', x: 40, y: 10, type: 'passive', optional: true }],
    refAt: { x: 22, y: -32 }, valAt: { x: 22, y: -21 }, simulated: true,
    gfx: () => [
      path('M -20 -30 V -10 M -20 10 V 30'), path('M -28 -10 H -12 V 10 H -28 Z', 'bg'), path('M -28 10 L -12 -10'),
      path('M 10 30 V 10 M 30 -10 H 40 M 30 10 H 40'), circle(10, 10, 2, 'bg'), path('M 10 10 L 29 -8', 'none', 2),
      path('M 26 -10 H 30 M 26 10 H 30', 'none', 2), path('M -10 0 H -6 M -2 0 H 2 M 6 0 H 10'),
      text(36, -13, 'NC', 6), text(36, 18, 'NO', 6),
    ],
    value: { key: 'value', label: 'Coil', kind: 'select', options: opts(RELAYS.map((m) => m.name)), default: '5 V' }, params: [],
  },
  {
    id: 'dcmotor', name: 'DC motor', category: 'Motors', keywords: ['m', 'motor', 'dc motor', 'brushed', 'fan', 'pump'], prefix: 'M',
    description: 'Brushed DC motor: armature resistance and inductance, back-EMF and torque constant k, rotor inertia, friction and a load torque. Pin 3 (optional) gives the speed: 1 V per 1000 rpm, through 100 Ω. Start-up: run a transient with "discharged capacitors" (the rotor starts at rest).',
    pins: [{ id: '1', name: '+', x: 0, y: -30, type: 'passive' }, { id: '2', name: '−', x: 0, y: 30, type: 'passive' }, { id: '3', name: 'SPD', x: 30, y: 0, type: 'output', optional: true }],
    refAt: { x: -20, y: -4 }, valAt: { x: -20, y: 9 }, simulated: true,
    gfx: () => [path('M 0 -30 V -15 M 0 15 V 30 M 15 0 H 30'), circle(0, 0, 15, 'bg'), text(0, 2, 'M', 11), path('M -5 7 H 5 M -5 10 H -3 M -1 10 H 1 M 3 10 H 5'), text(-5, -20, '+', 8)],
    value: { key: 'value', label: 'Back-EMF / torque constant k', kind: 'value', unit: 'V·s/rad', default: '10m', help: 'no-load speed ≈ V / k rad/s (12 V, 10m → 11 500 rpm)', limits: { gt: 0, text: 'must be above 0' } },
    params: [
      { key: 'ra', label: 'Armature resistance', kind: 'value', unit: 'Ω', default: '2' },
      { key: 'la', label: 'Armature inductance', kind: 'value', unit: 'H', default: '1m' },
      { key: 'j', label: 'Rotor inertia', kind: 'value', unit: 'kg·m²', default: '10u', limits: { gt: 0, text: 'must be above 0' } },
      { key: 'b', label: 'Friction', kind: 'value', unit: 'N·m·s/rad', default: '1u' },
      { key: 'tl', label: 'Load torque', kind: 'value', unit: 'N·m', default: '0' },
    ],
  },
  {
    id: 'motor1', name: 'AC motor, single-phase', category: 'Motors', keywords: ['m', 'motor', 'ac motor', 'induction', 'single phase', '1 phase', 'capacitor run', 'fan'], prefix: 'M',
    description: 'Single-phase induction motor while running: the main winding\'s equivalent circuit at the set slip (stator resistance and leakage, magnetising inductance, rotor resistance / slip). It draws the running current and power factor; start-up and speed changes are not modelled.',
    pins: [{ id: '1', name: 'L', x: 0, y: -30, type: 'passive' }, { id: '2', name: 'N', x: 0, y: 30, type: 'passive' }],
    refAt: { x: -20, y: -4 }, valAt: { x: -20, y: 9 }, simulated: true,
    gfx: () => [path('M 0 -30 V -15 M 0 15 V 30'), circle(0, 0, 15, 'bg'), text(0, 0, 'M', 11), text(0, 10, '1~', 7)],
    value: { key: 'value', label: 'Slip', kind: 'value', default: '0.05', help: '0.05 = 5 % below synchronous speed (rated load); 1 = locked rotor', limits: { gt: 0, le: 1, text: 'must be above 0 and at most 1' } },
    params: [
      { key: 'rs', label: 'Stator resistance', kind: 'value', unit: 'Ω', default: '3' },
      { key: 'rr', label: 'Rotor resistance (referred)', kind: 'value', unit: 'Ω', default: '3' },
      { key: 'ls', label: 'Leakage inductance (each side)', kind: 'value', unit: 'H', default: '20m' },
      { key: 'lm', label: 'Magnetising inductance', kind: 'value', unit: 'H', default: '0.5' },
      { key: 'poles', label: 'Poles', kind: 'value', default: '4', help: 'sets the synchronous speed 120·f/poles rpm (4 poles at 50 Hz: 1500 rpm) and with it the torque shown', limits: { ge: 2, le: 48, text: 'must be from 2 to 48' } },
    ],
  },
  {
    id: 'motor3', name: 'AC motor, three-phase', category: 'Motors', keywords: ['m', 'motor', 'ac motor', 'induction', 'three phase', '3 phase', 'asynchronous', 'squirrel cage'], prefix: 'M',
    description: 'Three-phase induction motor in star while running: per phase the equivalent circuit at the set slip. Pin 4 (optional) is the star point. Start-up and speed changes are not modelled.',
    pins: [{ id: '1', name: 'U', x: -20, y: -30, type: 'passive' }, { id: '2', name: 'V', x: 0, y: -30, type: 'passive' }, { id: '3', name: 'W', x: 20, y: -30, type: 'passive' },
      { id: '4', name: 'N', x: 0, y: 30, type: 'passive', optional: true }],
    refAt: { x: -23, y: 4 }, valAt: { x: -23, y: 17 }, simulated: true,
    gfx: () => [path('M -20 -30 V -20 L -10 -13 M 0 -30 V -18 M 20 -30 V -20 L 10 -13 M 0 18 V 30'), circle(0, 0, 18, 'bg'), text(0, 1, 'M', 12), text(0, 12, '3~', 7)],
    value: { key: 'value', label: 'Slip', kind: 'value', default: '0.04', help: '0.04 = 4 % below synchronous speed (rated load); 1 = locked rotor', limits: { gt: 0, le: 1, text: 'must be above 0 and at most 1' } },
    params: [
      { key: 'rs', label: 'Stator resistance', kind: 'value', unit: 'Ω', default: '1.5' },
      { key: 'rr', label: 'Rotor resistance (referred)', kind: 'value', unit: 'Ω', default: '1.2' },
      { key: 'ls', label: 'Leakage inductance (each side)', kind: 'value', unit: 'H', default: '6m' },
      { key: 'lm', label: 'Magnetising inductance', kind: 'value', unit: 'H', default: '0.2' },
      { key: 'poles', label: 'Poles', kind: 'value', default: '4', help: 'sets the synchronous speed 120·f/poles rpm (4 poles at 50 Hz: 1500 rpm) and with it the torque shown', limits: { ge: 2, le: 48, text: 'must be from 2 to 48' } },
    ],
  },
  {
    id: 'servo', name: 'Servo (hobby, PWM)', category: 'Motors', keywords: ['servo', 'rc servo', 'sg90', 'mg996', 'pwm', 'actuator', 'positioner'], prefix: 'M',
    description: 'Hobby RC servo: pulses of 1.0 to 2.0 ms on PWM (above 1.5 V, typically every 20 ms) set the angle from −90° to +90°; 1.5 ms is the centre. The horn turns at the set speed. Pin 4 (optional) gives the angle: 1 V per 100°, through 100 Ω. The supply draws a steady 10 mA at 5 V. Not exported to SPICE.',
    pins: [{ id: '1', name: 'PWM', x: -30, y: -20, type: 'input' }, { id: '2', name: '+', x: -30, y: 0, type: 'power_in' }, { id: '3', name: '−', x: -30, y: 20, type: 'power_in' },
      { id: '4', name: 'POS', x: 30, y: 0, type: 'output', optional: true }],
    refAt: { x: 0, y: -36 }, valAt: { x: 0, y: 40 }, simulated: true,
    // the horn points at the angle (0° up, +90° right); after a simulation at the simulated one
    gfx: (p) => [path('M -30 -20 H -20 M -30 0 H -20 M -30 20 H -20 M 20 0 H 30'), path('M -20 -28 H 20 V 28 H -20 Z', 'bg'), circle(4, -8, 7), servoHorn(Number(p.__angle ?? 45)),
      text(-14, -17, 'PWM', 5), text(-16, 3, '+', 7), text(-16, 23, '−', 7), text(2, 18, 'SERVO', 6)],
    value: { key: 'value', label: 'Speed', kind: 'value', unit: '°/s', default: '600', help: '600 °/s = 0.1 s per 60° (SG90)' },
    params: [],
  },
  {
    id: 'terminal', name: 'Screw terminal', category: 'Installation', keywords: ['x', 'terminal', 'screw terminal', 'connector', 'terminal block', 'clamp', 'wire', 'input', 'output'], prefix: 'X',
    description: 'One pole of a screw terminal block, where an external wire (mains, load, battery, PV, sensor) lands on the board. Its value names the function (L in, N out, PE, BAT+…). Electrically a connection point.',
    pins: [{ id: '1', name: '1', x: 20, y: 0, type: 'passive' }], refAt: { x: -2, y: -12 }, valAt: { x: -12, y: 4 }, simulated: true,
    gfx: () => [circle(0, 0, 6, 'bg'), path('M -4 4 L 4 -4'), path('M 6 0 H 20')],
    value: { key: 'value', label: 'Function', kind: 'text', default: 'L' }, params: [],
  },
  {
    id: 'mov', name: 'Varistor (MOV)', category: 'Installation', keywords: ['rv', 'mov', 'varistor', 'surge', 'spd', 'overvoltage', 'protection', 'lightning'], prefix: 'RV',
    description: 'Metal-oxide varistor or type 2/3 surge protective device: almost no current up to its continuous voltage, then a steep rise that clamps the surge (i = 1 mA·(v/Vn)^α, α from the datasheet clamping voltage).',
    pins: two('1', '2'), ...H, simulated: true,
    gfx: () => [path('M -30 0 H -14 M 14 0 H 30'), path('M -14 -6 H 14 V 6 H -14 Z', 'bg'), path('M -16 9 L -10 9 L 12 -9', 'none', 1.2), text(12, -12, 'U', 6)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(VARISTORS.map((m) => m.name)), default: '14D471K' }, params: [],
  },
  {
    id: 'gdt', name: 'Gas discharge tube / spark gap', category: 'Installation', keywords: ['gdt', 'gas discharge', 'arrester', 'spark gap', 'surge', 'lightning', 'type 1', 'n-pe'], prefix: 'GDT',
    description: 'Gas discharge tube or type 1 spark gap: open until the voltage exceeds its spark-over voltage, then an arc of about 20 V until the current falls below the holdover current.',
    pins: two('1', '2'), ...H, simulated: true,
    gfx: () => [path('M -30 0 H -6 M 6 0 H 30 M -6 -7 V 7 M 6 -7 V 7', 'none', 1.6), circle(0, 0, 11), circle(-2, 4, 0.8, fg), circle(2, -3, 0.8, fg)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(GDTS.map((m) => m.name)), default: 'GDT 230 V' }, params: [],
  },
  {
    id: 'breaker1', name: 'Circuit breaker 1-pole', category: 'Installation', keywords: ['q', 'f', 'mcb', 'breaker', 'circuit breaker', 'protection', 'overcurrent'], prefix: 'Q',
    description: 'Miniature circuit breaker, 1-pole: closed until it trips. Magnetic trip at the guaranteed instantaneous value of the curve (B 5 × In, C 10 × In, D 20 × In; r.m.s. of a sine), thermal trip by an I² integrator (2.55 × In after about 20 s, never at 1.13 × In, as IEC 60898). Click it while simulating to switch it on again.',
    pins: [{ id: '1', name: 'L1 in', x: 0.0, y: -30, type: 'passive' }, { id: '2', name: 'L1 out', x: 0.0, y: 30, type: 'passive' }],
    refAt: { x: 14.0, y: -6 }, valAt: { x: 14.0, y: 8 }, simulated: true, interactive: 'toggle',
    gfx: () => [path('M 0.0 -30 V -12 M 0.0 12 V 30 M 0.0 12 L -8.0 -10', 'none', 1.6), path('M -3.0 -15 L 3.0 -9 M 3.0 -15 L -3.0 -9'), path('M -6.0 0 H -4.0', 'none', 0.8)],
    value: { key: 'value', label: 'Rated current In', kind: 'select', unit: 'A', options: BREAKER_A.map((a) => ({ value: String(a), label: `${a} A` })), default: '16' },
    params: [{ key: 'curve', label: 'Trip curve', kind: 'select', options: [{ value: 'B', label: 'B (3–5 × In: resistive loads, long cables)' }, { value: 'C', label: 'C (5–10 × In: general, motors)' }, { value: 'D', label: 'D (10–20 × In: transformers, high inrush)' }], default: 'C' }, { key: 'closed', label: 'Switched on', kind: 'bool', default: 'true' }],
  },
  {
    id: 'breaker2', name: 'Circuit breaker 1-pole + N', category: 'Installation', keywords: ['q', 'f', 'mcb', 'breaker', 'circuit breaker', 'protection', 'overcurrent', 'rcd', 'rcbo', 'residual'], prefix: 'Q',
    description: 'Miniature circuit breaker, 1-pole + N: closed until it trips. Magnetic trip at the guaranteed instantaneous value of the curve (B 5 × In, C 10 × In, D 20 × In; r.m.s. of a sine), thermal trip by an I² integrator (2.55 × In after about 20 s, never at 1.13 × In, as IEC 60898); with a residual-current trip on the sum of the pole currents. Click it while simulating to switch it on again.',
    pins: [{ id: '1', name: 'L1 in', x: -10.0, y: -30, type: 'passive' }, { id: '2', name: 'L1 out', x: -10.0, y: 30, type: 'passive' }, { id: 'N1', name: 'N in', x: 10.0, y: -30, type: 'passive' }, { id: 'N2', name: 'N out', x: 10.0, y: 30, type: 'passive' }],
    refAt: { x: 24.0, y: -6 }, valAt: { x: 24.0, y: 8 }, simulated: true, interactive: 'toggle',
    gfx: () => [path('M -10.0 -30 V -12 M -10.0 12 V 30 M -10.0 12 L -18.0 -10', 'none', 1.6), path('M -13.0 -15 L -7.0 -9 M -7.0 -15 L -13.0 -9'), path('M 10.0 -30 V -12 M 10.0 12 V 30 M 10.0 12 L 2.0 -10', 'none', 1.6), path('M 7.0 -15 L 13.0 -9 M 13.0 -15 L 7.0 -9'), path('M -16.0 0 H 6.0', 'none', 0.8)],
    value: { key: 'value', label: 'Rated current In', kind: 'select', unit: 'A', options: BREAKER_A.map((a) => ({ value: String(a), label: `${a} A` })), default: '16' },
    params: [{ key: 'curve', label: 'Trip curve', kind: 'select', options: [{ value: 'B', label: 'B (3–5 × In: resistive loads, long cables)' }, { value: 'C', label: 'C (5–10 × In: general, motors)' }, { value: 'D', label: 'D (10–20 × In: transformers, high inrush)' }], default: 'C' }, { key: 'rcd', label: 'Residual current trip (RCD)', kind: 'select', options: [{ value: '0', label: 'none (MCB only)' }, { value: '30m', label: '30 mA (personal protection)' }, { value: '100m', label: '100 mA' }, { value: '300m', label: '300 mA (fire protection)' }], default: '30m' }, { key: 'closed', label: 'Switched on', kind: 'bool', default: 'true' }],
  },
  {
    id: 'breaker3', name: 'Circuit breaker 3-pole', category: 'Installation', keywords: ['q', 'f', 'mcb', 'breaker', 'circuit breaker', 'protection', 'overcurrent', 'three phase', '3 phase'], prefix: 'Q',
    description: 'Miniature circuit breaker, 3-pole: closed until it trips. Magnetic trip at the guaranteed instantaneous value of the curve (B 5 × In, C 10 × In, D 20 × In; r.m.s. of a sine), thermal trip by an I² integrator (2.55 × In after about 20 s, never at 1.13 × In, as IEC 60898). Click it while simulating to switch it on again.',
    pins: [{ id: '1', name: 'L1 in', x: -20.0, y: -30, type: 'passive' }, { id: '2', name: 'L1 out', x: -20.0, y: 30, type: 'passive' }, { id: '3', name: 'L2 in', x: 0.0, y: -30, type: 'passive' }, { id: '4', name: 'L2 out', x: 0.0, y: 30, type: 'passive' }, { id: '5', name: 'L3 in', x: 20.0, y: -30, type: 'passive' }, { id: '6', name: 'L3 out', x: 20.0, y: 30, type: 'passive' }],
    refAt: { x: 34.0, y: -6 }, valAt: { x: 34.0, y: 8 }, simulated: true, interactive: 'toggle',
    gfx: () => [path('M -20.0 -30 V -12 M -20.0 12 V 30 M -20.0 12 L -28.0 -10', 'none', 1.6), path('M -23.0 -15 L -17.0 -9 M -17.0 -15 L -23.0 -9'), path('M 0.0 -30 V -12 M 0.0 12 V 30 M 0.0 12 L -8.0 -10', 'none', 1.6), path('M -3.0 -15 L 3.0 -9 M 3.0 -15 L -3.0 -9'), path('M 20.0 -30 V -12 M 20.0 12 V 30 M 20.0 12 L 12.0 -10', 'none', 1.6), path('M 17.0 -15 L 23.0 -9 M 23.0 -15 L 17.0 -9'), path('M -26.0 0 H 16.0', 'none', 0.8)],
    value: { key: 'value', label: 'Rated current In', kind: 'select', unit: 'A', options: BREAKER_A.map((a) => ({ value: String(a), label: `${a} A` })), default: '16' },
    params: [{ key: 'curve', label: 'Trip curve', kind: 'select', options: [{ value: 'B', label: 'B (3–5 × In: resistive loads, long cables)' }, { value: 'C', label: 'C (5–10 × In: general, motors)' }, { value: 'D', label: 'D (10–20 × In: transformers, high inrush)' }], default: 'C' }, { key: 'closed', label: 'Switched on', kind: 'bool', default: 'true' }],
  },
  {
    id: 'breaker4', name: 'Circuit breaker 3-pole + N', category: 'Installation', keywords: ['q', 'f', 'mcb', 'breaker', 'circuit breaker', 'protection', 'overcurrent', 'rcd', 'rcbo', 'residual', 'three phase', '3 phase'], prefix: 'Q',
    description: 'Miniature circuit breaker, 3-pole + N: closed until it trips. Magnetic trip at the guaranteed instantaneous value of the curve (B 5 × In, C 10 × In, D 20 × In; r.m.s. of a sine), thermal trip by an I² integrator (2.55 × In after about 20 s, never at 1.13 × In, as IEC 60898); with a residual-current trip on the sum of the pole currents. Click it while simulating to switch it on again.',
    pins: [{ id: '1', name: 'L1 in', x: -30.0, y: -30, type: 'passive' }, { id: '2', name: 'L1 out', x: -30.0, y: 30, type: 'passive' }, { id: '3', name: 'L2 in', x: -10.0, y: -30, type: 'passive' }, { id: '4', name: 'L2 out', x: -10.0, y: 30, type: 'passive' }, { id: '5', name: 'L3 in', x: 10.0, y: -30, type: 'passive' }, { id: '6', name: 'L3 out', x: 10.0, y: 30, type: 'passive' }, { id: 'N1', name: 'N in', x: 30.0, y: -30, type: 'passive' }, { id: 'N2', name: 'N out', x: 30.0, y: 30, type: 'passive' }],
    refAt: { x: 44.0, y: -6 }, valAt: { x: 44.0, y: 8 }, simulated: true, interactive: 'toggle',
    gfx: () => [path('M -30.0 -30 V -12 M -30.0 12 V 30 M -30.0 12 L -38.0 -10', 'none', 1.6), path('M -33.0 -15 L -27.0 -9 M -27.0 -15 L -33.0 -9'), path('M -10.0 -30 V -12 M -10.0 12 V 30 M -10.0 12 L -18.0 -10', 'none', 1.6), path('M -13.0 -15 L -7.0 -9 M -7.0 -15 L -13.0 -9'), path('M 10.0 -30 V -12 M 10.0 12 V 30 M 10.0 12 L 2.0 -10', 'none', 1.6), path('M 7.0 -15 L 13.0 -9 M 13.0 -15 L 7.0 -9'), path('M 30.0 -30 V -12 M 30.0 12 V 30 M 30.0 12 L 22.0 -10', 'none', 1.6), path('M 27.0 -15 L 33.0 -9 M 33.0 -15 L 27.0 -9'), path('M -36.0 0 H 26.0', 'none', 0.8)],
    value: { key: 'value', label: 'Rated current In', kind: 'select', unit: 'A', options: BREAKER_A.map((a) => ({ value: String(a), label: `${a} A` })), default: '16' },
    params: [{ key: 'curve', label: 'Trip curve', kind: 'select', options: [{ value: 'B', label: 'B (3–5 × In: resistive loads, long cables)' }, { value: 'C', label: 'C (5–10 × In: general, motors)' }, { value: 'D', label: 'D (10–20 × In: transformers, high inrush)' }], default: 'C' }, { key: 'rcd', label: 'Residual current trip (RCD)', kind: 'select', options: [{ value: '0', label: 'none (MCB only)' }, { value: '30m', label: '30 mA (personal protection)' }, { value: '100m', label: '100 mA' }, { value: '300m', label: '300 mA (fire protection)' }], default: '30m' }, { key: 'closed', label: 'Switched on', kind: 'bool', default: 'true' }],
  },
  {
    id: 'contactor', name: 'Contactor', category: 'Installation', keywords: ['k', 'km', 'contactor', 'three phase', 'motor starter', 'change-over', 'ats', 'power relay'], prefix: 'K',
    description: 'Contactor: four main contacts (1–2, 3–4, 5–6, and 7–8 for N in a 4-pole change-over) and auxiliary contacts 13–14 (NO) and 21–22 (NC), closed while the coil A1–A2 is energised. Pull-in at 85 %, drop-out at 40 % of the rated coil current, with the armature\'s inertia (an AC coil holds through the zero crossings).',
    pins: [{ id: 'A1', name: 'A1', x: -60, y: -20, type: 'passive' }, { id: 'A2', name: 'A2', x: -60, y: 20, type: 'passive' },
      { id: '1', name: '1/L1', x: -30, y: -30, type: 'passive' }, { id: '2', name: '2/T1', x: -30, y: 30, type: 'passive' },
      { id: '3', name: '3/L2', x: -10, y: -30, type: 'passive', optional: true }, { id: '4', name: '4/T2', x: -10, y: 30, type: 'passive', optional: true },
      { id: '5', name: '5/L3', x: 10, y: -30, type: 'passive', optional: true }, { id: '6', name: '6/T3', x: 10, y: 30, type: 'passive', optional: true },
      { id: '7', name: '7/N', x: 30, y: -30, type: 'passive', optional: true }, { id: '8', name: '8/N', x: 30, y: 30, type: 'passive', optional: true },
      { id: '13', name: '13', x: 50, y: -30, type: 'passive', optional: true }, { id: '14', name: '14 NO', x: 50, y: 30, type: 'passive', optional: true },
      { id: '21', name: '21', x: 70, y: -30, type: 'passive', optional: true }, { id: '22', name: '22 NC', x: 70, y: 30, type: 'passive', optional: true }],
    refAt: { x: 80, y: -6 }, valAt: { x: 80, y: 8 }, simulated: true,
    gfx: () => [path('M -60 -20 H -50 V -8 M -60 20 H -50 V 8'), path('M -56 -8 H -44 V 8 H -56 Z', 'bg'),
      ...[-30, -10, 10, 30, 50].map((x) => path(`M ${x} -30 V -8 M ${x} 8 V 30 M ${x} 8 L ${x - 7} -7`, 'none', 1.6)),
      path('M 70 -30 V -8 M 70 8 V 30 M 70 -8 L 64 8', 'none', 1.6), path('M -44 0 H 66', 'none', 0.8)],
    value: { key: 'value', label: 'Size and coil', kind: 'select', options: opts(CONTACTORS.map((m) => m.name)), default: CONTACTORS[0].name }, params: [],
  },
  {
    id: 'pv', name: 'Solar (PV) module', category: 'Installation', keywords: ['pv', 'solar', 'photovoltaic', 'panel', 'module', 'array', 'string'], prefix: 'PV',
    description: 'Photovoltaic module or array: single-diode model fitted to the datasheet values at standard test conditions (Voc, Isc, Vmp, Imp); the current follows the irradiance and the cells follow the circuit temperature. Several modules in series (string) and strings in parallel make an array.',
    pins: vert(), ...VV, simulated: true,
    gfx: () => [path('M 0 -30 V -18 M 0 18 V 30'), path('M -16 -18 H 16 V 18 H -16 Z', 'bg'), path('M -16 -6 H 16 M -16 6 H 16 M -5 -18 V 18 M 5 -18 V 18', 'none', 0.6),
      path('M -26 -26 L -18 -18 M -22 -28 L -14 -20', 'none', 1), text(-8, -22, '+', 8)],
    value: { key: 'value', label: 'Module', kind: 'select', options: opts(PV_MODULES.map((m) => m.name)), default: PV_MODULES[2].name },
    params: [
      { key: 'g', label: 'Irradiance', kind: 'value', unit: 'W/m²', default: '1000', help: '1000 W/m² = full sun (standard test conditions)', limits: { ge: 0, le: 1400, text: 'must be from 0 to 1400 W/m²' } },
      { key: 'ns', label: 'Modules in series (string)', kind: 'value', default: '1', limits: { ge: 1, le: 40, text: 'must be from 1 to 40' } },
      { key: 'np', label: 'Strings in parallel', kind: 'value', default: '1', limits: { ge: 1, le: 40, text: 'must be from 1 to 40' } },
    ],
  },
  {
    id: 'autotransformer', name: 'Autotransformer, tapped', category: 'Installation', keywords: ['t', 'autotransformer', 'tapped', 'taps', 'stabiliser', 'stabilizer', 'avr', 'variac'], prefix: 'T',
    description: 'Tapped autotransformer: one winding from N with taps T1–T7 at the voltages of the model (at nominal flux). A relay-switched mains stabiliser connects the input to one tap and takes the output from another.',
    pins: [{ id: 'N', name: 'N', x: -20, y: 40, type: 'passive' }, ...[1, 2, 3, 4, 5, 6, 7].map((k) => ({ id: `T${k}`, name: `T${k}`, x: 20, y: 40 - k * 10, type: 'passive' as const }))],
    refAt: { x: -28, y: -24 }, valAt: { x: -28, y: -12 }, simulated: true,
    gfx: () => [path('M -20 40 V 30 H 0'), path('M 0 34 Q 8 30 0 26 Q 8 22 0 18 Q 8 14 0 10 Q 8 6 0 2 Q 8 -2 0 -6 Q 8 -10 0 -14 Q 8 -18 0 -22 Q 8 -26 0 -30'),
      path('M -6 34 V -32 M -9 34 V -32', 'none', 0.8), ...[1, 2, 3, 4, 5, 6, 7].map((k) => path(`M 4 ${40 - k * 10} H 20`, 'none', 1))],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(AUTOTRANSFORMERS.map((m) => m.name)), default: AUTOTRANSFORMERS[0].name }, params: [],
  },
  {
    id: 'vsurge', name: 'Surge generator, voltage 1.2/50 µs', category: 'Sources', keywords: ['surge', 'impulse', 'lightning', 'combination wave', '1.2/50', 'iec 61000-4-5', 'test'], prefix: 'VS',
    description: 'Surge test generator (IEC 61000-4-5 combination wave, open-circuit voltage 1.2/50 µs) with its source impedance: 2 Ω line to line, 12 Ω line to earth. A test source: not a part of the product.',
    pins: vert(), ...VV, simulated: true,
    gfx: () => [path('M 0 -30 V -15 M 0 15 V 30'), circle(0, 0, 15, 'bg'), path('M -9 6 L -6 -8 L 9 6', 'none', 1.4), text(0, -18, '+', 8)],
    value: { key: 'value', label: 'Open-circuit peak voltage', kind: 'value', unit: 'V', default: '4k', limits: { gt: 0, le: 30e3, text: 'must be above 0 and at most 30 kV' } },
    params: [
      { key: 'rsrc', label: 'Source impedance', kind: 'select', options: [{ value: '2', label: '2 Ω (line to line)' }, { value: '12', label: '12 Ω (line to earth)' }, { value: '42', label: '42 Ω (data lines)' }], default: '2' },
      { key: 'delay', label: 'Delay', kind: 'value', unit: 's', default: '0' },
    ],
  },
  {
    id: 'isurge', name: 'Surge generator, current 8/20 or 10/350 µs', category: 'Sources', keywords: ['surge', 'impulse current', 'lightning', '8/20', '10/350', 'iimp', 'in', 'test'], prefix: 'IS',
    description: 'Impulse current generator: 8/20 µs (IEC 61000-4-5, the nominal discharge current of type 2 SPDs) or 10/350 µs (the lightning impulse current of type 1 SPDs). Current flows out of "out". A test source: not a part of the product.',
    pins: two('out', 'in', 'power_out').map((p) => ({ ...p, id: p.name === 'out' ? '1' : '2' })), ...H, simulated: true,
    gfx: () => [path('M -30 0 H -15 M 15 0 H 30'), circle(0, 0, 15, 'bg'), path('M -8 6 L -5 -8 L 8 6', 'none', 1.4), path('M 18 -6 L 26 -6'), arrowHead(18, -6, 27, -6, 4, 2)],
    value: { key: 'value', label: 'Peak current', kind: 'value', unit: 'A', default: '20k', limits: { gt: 0, le: 200e3, text: 'must be above 0 and at most 200 kA' } },
    params: [
      { key: 'wave', label: 'Wave shape', kind: 'select', options: [{ value: '8/20', label: '8/20 µs (induced surge, In / Imax)' }, { value: '10/350', label: '10/350 µs (direct lightning, Iimp)' }], default: '8/20' },
      { key: 'delay', label: 'Delay', kind: 'value', unit: 's', default: '0' },
    ],
  },
  {
    id: 'gnd', name: 'Ground', category: 'Power', keywords: ['gnd', 'ground', '0v', 'earth', 'common'], prefix: '#PWR',
    description: 'Ground (0 V). Every circuit needs one; all ground symbols are connected.',
    pins: [{ id: '1', name: 'GND', x: 0, y: 0, type: 'power_in' }], refAt: { x: 0, y: 40 }, valAt: { x: 0, y: 32 }, power: true, simulated: true,
    gfx: () => [path('M 0 0 V 10 M -12 10 H 12 M -7 15 H 7 M -2 20 H 2')],
    value: { key: 'value', label: 'Net', kind: 'text', default: 'GND' }, params: [],
  },
  {
    id: 'power', name: 'Power rail', category: 'Power', keywords: ['vcc', 'vdd', '+5v', '+3v3', '+12v', 'supply', 'rail', 'power'], prefix: '#PWR',
    description: 'Named supply rail (+5V, +3V3, +12V…). All rails with the same name are connected. If no source drives the rail, the simulator supplies its voltage from the name.',
    pins: [{ id: '1', name: 'PWR', x: 0, y: 0, type: 'power_in' }], refAt: { x: 0, y: -40 }, valAt: { x: 0, y: -16 }, power: true, simulated: true,
    gfx: () => [path('M 0 0 V -8 M -8 -8 H 8')],
    value: { key: 'value', label: 'Rail', kind: 'text', default: '+5V' }, params: [],
  },
  ...LOGIC,
];

export const SYMBOL = new Map(SYMBOLS.map((s) => [s.id, s]));

export function symbolOf(id: string): SymbolDef {
  const s = SYMBOL.get(id);
  if (!s) throw new Error(`unknown symbol ${id}`);
  return s;
}

export const CATEGORIES: Category[] = ['Passive', 'Sources', 'Semiconductors', 'Integrated circuits', 'Logic', 'Switches', 'Motors', 'Installation', 'Power'];

/** Part picker search (UI-08 (a)): every word must match name, keywords, category or a model. */
export function searchSymbols(q: string): SymbolDef[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return SYMBOLS.filter((s) => {
    const hay = [s.name, s.category, s.prefix, s.description, ...s.keywords, ...(s.value.options?.map((o) => o.value) ?? [])].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Rail voltage from a power-port name: "+5V" → 5, "+3V3" → 3.3, "-12V" → −12, "VCC" → null. */
export function railVoltage(name: string): number | null {
  const m = name.trim().match(/^([+-]?)(\d+)(?:[Vv.,](\d+))?[Vv]?$/);
  if (!m) return null;
  const v = Number(`${m[2]}${m[3] ? `.${m[3]}` : ''}`);
  return m[1] === '-' ? -v : v;
}
