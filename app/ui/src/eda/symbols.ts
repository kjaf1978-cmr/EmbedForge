// Generic symbol library (UI-08 (a), ED-08): symbol graphics, pins, values and parameters.
// Coordinates are in schematic units; the grid is 10 units, and every pin lies on the grid.
// Pin numbers follow KiCad's generic symbols, so Increment 3 footprints can map pads by number.

import { ADJ_REGULATORS, BJTS, DIODES, LED_COLOURS, MOSFETS, OPAMPS, REGULATORS, ZENERS } from './models';

export interface Pt { x: number; y: number }

export type PinType = 'passive' | 'input' | 'output' | 'power_in' | 'power_out';
export interface PinDef { id: string; name: string; x: number; y: number; type: PinType }

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
}

export type Category = 'Passive' | 'Sources' | 'Semiconductors' | 'Integrated circuits' | 'Switches' | 'Power';

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
const H = { refAt: { x: 0, y: -14 }, valAt: { x: 0, y: 18 } };
const VV = { refAt: { x: 22, y: -6 }, valAt: { x: 22, y: 8 } };

export const SYMBOLS: SymbolDef[] = [
  {
    id: 'resistor', name: 'Resistor', category: 'Passive', keywords: ['r', 'ohm', 'resistance'], prefix: 'R',
    description: 'Fixed resistor.', pins: two('1', '2'), ...H, simulated: true,
    gfx: () => [path('M -30 0 H -15 M 15 0 H 30'), path('M -15 -6 H 15 V 6 H -15 Z', 'bg')],
    value: { key: 'value', label: 'Resistance', kind: 'value', unit: 'Ω', default: '1k' }, params: [],
  },
  {
    id: 'capacitor', name: 'Capacitor', category: 'Passive', keywords: ['c', 'cap', 'ceramic', 'farad'], prefix: 'C',
    description: 'Non-polarised capacitor (ceramic, film).', pins: two('1', '2'), ...H, simulated: true,
    gfx: () => [path('M -30 0 H -4 M 4 0 H 30 M -4 -12 V 12 M 4 -12 V 12', 'none', 2)],
    value: { key: 'value', label: 'Capacitance', kind: 'value', unit: 'F', default: '100n' }, params: [],
  },
  {
    id: 'capacitor_pol', name: 'Electrolytic capacitor', category: 'Passive', keywords: ['c', 'elko', 'polarised', 'polarized', 'electrolytic'], prefix: 'C',
    description: 'Polarised capacitor; pin 1 is positive.', pins: two('+', '−'), ...H, simulated: true,
    gfx: () => [path('M -30 0 H -4 M 6 0 H 30 M -4 -12 V 12', 'none', 2), path('M 9 -12 Q 3 0 9 12', 'none', 2), text(-12, -8, '+', 10)],
    value: { key: 'value', label: 'Capacitance', kind: 'value', unit: 'F', default: '10u' }, params: [],
  },
  {
    id: 'inductor', name: 'Inductor', category: 'Passive', keywords: ['l', 'coil', 'choke', 'henry'], prefix: 'L',
    description: 'Inductor (ideal, no series resistance).', pins: two('1', '2'), ...H, simulated: true,
    gfx: () => [path('M -30 0 H -20 A 5 5 0 0 1 -10 0 A 5 5 0 0 1 0 0 A 5 5 0 0 1 10 0 A 5 5 0 0 1 20 0 H 30')],
    value: { key: 'value', label: 'Inductance', kind: 'value', unit: 'H', default: '10m' }, params: [],
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
    params: [{ key: 'position', label: 'Wiper position', kind: 'value', unit: '%', default: '50', help: '0 % = at pin 1, 100 % = at pin 3' }],
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
      { key: 'freq', label: 'Frequency', kind: 'value', unit: 'Hz', default: '1k' },
      { key: 'offset', label: 'Offset', kind: 'value', unit: 'V', default: '0' },
      { key: 'ac', label: 'AC magnitude', kind: 'value', unit: 'V', default: '1', help: 'Amplitude used by the AC analysis' },
    ],
  },
  {
    id: 'vpulse', name: 'Pulse voltage source', category: 'Sources', keywords: ['square', 'pulse', 'clock', 'pwm', 'step'], prefix: 'V',
    description: 'Square wave or single step: low/high level, period and duty cycle.', pins: vert(), ...VV, simulated: true,
    gfx: () => [path('M 0 -30 V -15 M 0 15 V 30'), circle(0, 0, 15, 'bg'), path('M -9 5 H -4 V -5 H 4 V 5 H 9')],
    value: { key: 'value', label: 'High level', kind: 'value', unit: 'V', default: '5' },
    params: [
      { key: 'low', label: 'Low level', kind: 'value', unit: 'V', default: '0' },
      { key: 'freq', label: 'Frequency', kind: 'value', unit: 'Hz', default: '1k' },
      { key: 'duty', label: 'Duty cycle', kind: 'value', unit: '%', default: '50' },
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
    id: 'diode', name: 'Diode', category: 'Semiconductors', keywords: ['d', 'rectifier', '1n4148', '1n4007', 'schottky'], prefix: 'D',
    description: 'Diode; current flows from anode (left) to cathode (bar).',
    pins: [{ id: '2', name: 'A', x: -30, y: 0, type: 'passive' }, { id: '1', name: 'K', x: 30, y: 0, type: 'passive' }], ...H, simulated: true,
    gfx: () => [path('M -30 0 H -8 M 8 0 H 30 M 8 -9 V 9', 'none', 2), path('M -8 -9 L 8 0 L -8 9 Z', fg)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(DIODES.map((m) => m.name)), default: '1N4148' }, params: [],
  },
  {
    id: 'zener', name: 'Zener diode', category: 'Semiconductors', keywords: ['z', 'zener', 'reference', 'regulator'], prefix: 'D',
    description: 'Zener diode; conducts in reverse at its Zener voltage.',
    pins: [{ id: '2', name: 'A', x: -30, y: 0, type: 'passive' }, { id: '1', name: 'K', x: 30, y: 0, type: 'passive' }], ...H, simulated: true,
    gfx: () => [path('M -30 0 H -8 M 8 0 H 30 M 4 -11 L 8 -9 V 9 L 12 11', 'none', 2), path('M -8 -9 L 8 0 L -8 9 Z', fg)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(ZENERS.map((m) => m.name)), default: 'BZX55C5V1' }, params: [],
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
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(BJTS.filter((m) => m.model.type === 'npn').map((m) => m.name)), default: '2N3904' }, params: [],
  },
  {
    id: 'pnp', name: 'PNP transistor', category: 'Semiconductors', keywords: ['q', 'bjt', 'transistor', 'bc557', '2n3906'], prefix: 'Q',
    description: 'PNP bipolar transistor (B left, E top, C bottom).',
    pins: [{ id: '1', name: 'B', x: -30, y: 0, type: 'input' }, { id: '2', name: 'C', x: 10, y: 30, type: 'passive' }, { id: '3', name: 'E', x: 10, y: -30, type: 'passive' }],
    refAt: { x: 30, y: -6 }, valAt: { x: 30, y: 8 }, simulated: true,
    gfx: () => [circle(2, 0, 20), path('M -30 0 H -6 M -6 -12 V 12', 'none', 2), path('M -6 -5 L 10 -18 V -30 M -6 5 L 10 18 V 30'), arrowHead(10, -18, -3, -7.4)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(BJTS.filter((m) => m.model.type === 'pnp').map((m) => m.name)), default: '2N3906' }, params: [],
  },
  {
    id: 'nmos', name: 'N-channel MOSFET', category: 'Semiconductors', keywords: ['m', 'mosfet', 'fet', 'transistor', '2n7000', 'irlz44n', 'logic level'], prefix: 'Q',
    description: 'N-channel enhancement MOSFET (G left, D top, S bottom), with body diode.',
    pins: [{ id: '1', name: 'G', x: -30, y: 0, type: 'input' }, { id: '2', name: 'D', x: 10, y: -30, type: 'passive' }, { id: '3', name: 'S', x: 10, y: 30, type: 'passive' }],
    refAt: { x: 30, y: -6 }, valAt: { x: 30, y: 8 }, simulated: true,
    gfx: () => [circle(2, 0, 20), path('M -30 0 H -10 M -10 -12 V 12', 'none', 2), path('M -4 -14 V -7 M -4 -3 V 3 M -4 7 V 14', 'none', 2),
      path('M -4 -11 H 10 V -30 M -4 11 H 10 V 30 M 10 0 V 11'), path('M 10 0 H 2'), arrowHead(10, 0, -3, 0, 6, 3)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(MOSFETS.filter((m) => m.model.type === 'nmos').map((m) => m.name)), default: '2N7000' }, params: [],
  },
  {
    id: 'pmos', name: 'P-channel MOSFET', category: 'Semiconductors', keywords: ['m', 'mosfet', 'fet', 'transistor', 'high side', 'bs250'], prefix: 'Q',
    description: 'P-channel enhancement MOSFET (G left, S top, D bottom), with body diode.',
    pins: [{ id: '1', name: 'G', x: -30, y: 0, type: 'input' }, { id: '2', name: 'D', x: 10, y: 30, type: 'passive' }, { id: '3', name: 'S', x: 10, y: -30, type: 'passive' }],
    refAt: { x: 30, y: -6 }, valAt: { x: 30, y: 8 }, simulated: true,
    gfx: () => [circle(2, 0, 20), path('M -30 0 H -10 M -10 -12 V 12', 'none', 2), path('M -4 -14 V -7 M -4 -3 V 3 M -4 7 V 14', 'none', 2),
      path('M -4 -11 H 10 V -30 M -4 11 H 10 V 30 M 10 0 V -11'), path('M -3 0 H 4'), arrowHead(-4, 0, 9, 0, 6, 3)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(MOSFETS.filter((m) => m.model.type === 'pmos').map((m) => m.name)), default: 'BS250' }, params: [],
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
    refAt: { x: 0, y: -20 }, valAt: { x: 0, y: 44 }, simulated: true,
    gfx: () => [path('M -40 0 H -25 M 25 0 H 40 M 0 10 V 30'), path('M -25 -10 H 25 V 10 H -25 Z', 'bg'), text(-14, 3, 'IN', 7), text(13, 3, 'OUT', 7), text(0, 8, 'GND', 6)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(REGULATORS.map((m) => m.name)), default: '7805' }, params: [],
  },
  {
    id: 'lm317', name: 'Adjustable regulator', category: 'Integrated circuits', keywords: ['u', 'lm317', 'adjustable', 'regulator', 'variable supply'], prefix: 'U',
    description: 'Adjustable linear regulator (pins as TO-220 LM317: 1 ADJ, 2 OUT, 3 IN). OUT stays 1.25 V above ADJ: Vout = 1.25 V × (1 + R2/R1) with R1 from OUT to ADJ and R2 from ADJ to ground.',
    pins: [{ id: '3', name: 'IN', x: -40, y: 0, type: 'power_in' }, { id: '1', name: 'ADJ', x: 0, y: 30, type: 'input' }, { id: '2', name: 'OUT', x: 40, y: 0, type: 'power_out' }],
    refAt: { x: 0, y: -20 }, valAt: { x: 0, y: 44 }, simulated: true,
    gfx: () => [path('M -40 0 H -25 M 25 0 H 40 M 0 10 V 30'), path('M -25 -10 H 25 V 10 H -25 Z', 'bg'), text(-14, 3, 'IN', 7), text(13, 3, 'OUT', 7), text(0, 8, 'ADJ', 6)],
    value: { key: 'value', label: 'Model', kind: 'select', options: opts(ADJ_REGULATORS.map((m) => m.name)), default: 'LM317' }, params: [],
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
    refAt: { x: 0, y: -60 }, valAt: { x: 46, y: 46 }, simulated: true,
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
    value: { key: 'closed', label: 'Closed', kind: 'bool', default: 'false' }, params: [],
  },
  {
    id: 'button', name: 'Push-button', category: 'Switches', keywords: ['button', 'push', 'tactile', 'momentary', 'key'], prefix: 'SW',
    description: 'Momentary push-button (normally open). Hold it down with the mouse or Space while simulating.', pins: two('1', '2'), ...H, simulated: true, interactive: 'momentary',
    gfx: (p) => {
      const y = p.pressed === 'true' ? -3 : -9;
      return [path('M -30 0 H -12 M 12 0 H 30'), circle(-12, 0, 2, 'bg'), circle(12, 0, 2, 'bg'), path(`M -14 ${y} H 14`, 'none', 2), path(`M 0 ${y} V ${y - 8} M -5 ${y - 8} H 5`)];
    },
    value: { key: 'pressed', label: 'Pressed', kind: 'bool', default: 'false' }, params: [],
  },
  {
    id: 'spdt', name: 'Changeover switch', category: 'Switches', keywords: ['spdt', 'changeover', 'selector', 'toggle'], prefix: 'SW',
    description: 'Changeover switch (SPDT); pin 1 is common. Click it while simulating to change over.',
    pins: [{ id: '1', name: 'C', x: -30, y: 0, type: 'passive' }, { id: '2', name: 'A', x: 30, y: -10, type: 'passive' }, { id: '3', name: 'B', x: 30, y: 10, type: 'passive' }],
    refAt: { x: 0, y: -22 }, valAt: { x: 0, y: 26 }, simulated: true, interactive: 'throw',
    gfx: (p) => [path('M -30 0 H -12 M 12 -10 H 30 M 12 10 H 30'), circle(-12, 0, 2, 'bg'), circle(12, -10, 2, 'bg'), circle(12, 10, 2, 'bg'),
      path(p.position === 'B' ? 'M -11 1 L 11 9' : 'M -11 -1 L 11 -9', 'none', 2)],
    value: { key: 'position', label: 'Position', kind: 'select', options: opts(['A', 'B']), default: 'A' }, params: [],
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
];

export const SYMBOL = new Map(SYMBOLS.map((s) => [s.id, s]));

export function symbolOf(id: string): SymbolDef {
  const s = SYMBOL.get(id);
  if (!s) throw new Error(`unknown symbol ${id}`);
  return s;
}

export const CATEGORIES: Category[] = ['Passive', 'Sources', 'Semiconductors', 'Integrated circuits', 'Switches', 'Power'];

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
