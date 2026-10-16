// Footprints (PCB-02): the copper pads, drill holes, silkscreen and courtyard of a part on a
// board. All sizes in mm; the origin is the footprint's reference point, y grows downwards.
// The footprints are generated from package parameters (original work for NETApps, licensed
// CC-BY-SA 4.0 with the KiCad library design exception: designs made with them are yours).
// Pad numbering follows the packages' datasheets and the KiCad conventions: pad 1 is pin 1 of
// an IC, the cathode of a diode or LED, and the positive pin of an electrolytic capacitor.

export type PadShape = 'circle' | 'rect' | 'oval';

export interface Pad {
  /** Pad number as on the package ("1", "2" …; a tab or a second pad of one pin has its own). */
  id: string;
  x: number;
  y: number;
  shape: PadShape;
  w: number;
  h: number;
  /** Plated drill diameter for a through-hole pad; absent for a surface-mount pad (top layer). */
  drill?: number;
}

/** A silkscreen stroke: a line or a circle. */
export type Silk = { t: 'line'; x1: number; y1: number; x2: number; y2: number } | { t: 'circle'; x: number; y: number; r: number };

export interface Footprint {
  id: string;
  name: string;
  description: string;
  pads: Pad[];
  silk: Silk[];
  /** Courtyard: the area kept free of other parts (pads, body and 0.25 mm). */
  courtyard: { x0: number; y0: number; x1: number; y1: number };
  /** Body outline and height for the assembly drawing and the 3D view. */
  body: { x0: number; y0: number; x1: number; y1: number; h: number; round?: boolean };
  smd: boolean;
}

const r2 = (v: number) => Math.round(v * 1000) / 1000;

function make(id: string, name: string, description: string, pads: Pad[], silk: Silk[], body: Footprint['body']): Footprint {
  let x0 = body.x0, y0 = body.y0, x1 = body.x1, y1 = body.y1;
  for (const p of pads) { x0 = Math.min(x0, p.x - p.w / 2); x1 = Math.max(x1, p.x + p.w / 2); y0 = Math.min(y0, p.y - p.h / 2); y1 = Math.max(y1, p.y + p.h / 2); }
  const m = 0.25;
  return { id, name, description, pads, silk, body, smd: pads.every((p) => p.drill === undefined), courtyard: { x0: r2(x0 - m), y0: r2(y0 - m), x1: r2(x1 + m), y1: r2(y1 + m) } };
}

const tht = (id: string, x: number, y: number, d: number, drill: number, shape: PadShape = 'circle', h = d): Pad => ({ id, x: r2(x), y: r2(y), shape, w: d, h, drill });
const smd = (id: string, x: number, y: number, w: number, h: number): Pad => ({ id, x: r2(x), y: r2(y), shape: 'rect', w, h });
const line = (x1: number, y1: number, x2: number, y2: number): Silk => ({ t: 'line', x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2) });
const box = (x0: number, y0: number, x1: number, y1: number): Silk[] => [line(x0, y0, x1, y0), line(x1, y0, x1, y1), line(x1, y1, x0, y1), line(x0, y1, x0, y0)];

/** Axial part lying flat: pads `pitch` apart, a body L × D between them. */
export function axial(id: string, name: string, pitch: number, drill: number, pad: number, L: number, D: number, h: number, band = false): Footprint {
  const s = [...box(-L / 2, -D / 2, L / 2, D / 2), line(-pitch / 2 + pad / 2 + 0.3, 0, -L / 2, 0), line(L / 2, 0, pitch / 2 - pad / 2 - 0.3, 0)];
  // cathode band at pad 1 (left)
  if (band) s.push(line(-L / 2 + 0.6, -D / 2, -L / 2 + 0.6, D / 2));
  return make(id, name, `axial, pitch ${pitch} mm, body ${L} × ${D} mm`, [tht('1', -pitch / 2, 0, pad, drill, 'rect'), tht('2', pitch / 2, 0, pad, drill)], s,
    { x0: -L / 2, y0: -D / 2, x1: L / 2, y1: D / 2, h, round: true });
}

/** Radial two-lead part standing up: pads `pitch` apart, round body of diameter D. */
export function radial(id: string, name: string, pitch: number, drill: number, pad: number, D: number, h: number, plusMark = false): Footprint {
  const s: Silk[] = [{ t: 'circle', x: 0, y: 0, r: r2(D / 2 + 0.12) }];
  // "+" beside pad 1 (the positive lead of an electrolytic)
  if (plusMark) { const cx = -D / 2 - 1.2, cy = -D / 2 + 0.6; s.push(line(cx - 0.6, cy, cx + 0.6, cy), line(cx, cy - 0.6, cx, cy + 0.6)); }
  return make(id, name, `radial, pitch ${pitch} mm, Ø ${D} mm`, [tht('1', -pitch / 2, 0, pad, drill, 'rect'), tht('2', pitch / 2, 0, pad, drill)], s,
    { x0: -D / 2, y0: -D / 2, x1: D / 2, y1: D / 2, h, round: true });
}

/** A row of n through-hole pads `pitch` apart (headers, terminal blocks, TO packages standing up). */
export function inline(id: string, name: string, n: number, pitch: number, drill: number, w: number, h: number, body: { d: number; back: number; height: number }, shape: PadShape = 'oval'): Footprint {
  const x0 = -((n - 1) * pitch) / 2;
  const pads = Array.from({ length: n }, (_, k) => tht(String(k + 1), x0 + k * pitch, 0, w, drill, k === 0 ? 'rect' : shape, h));
  const bx0 = x0 - pitch / 2, bx1 = -x0 + pitch / 2, by0 = -body.back, by1 = body.d - body.back;
  return make(id, name, `${n} pins, pitch ${pitch} mm`, pads, box(bx0, by0, bx1, by1), { x0: bx0, y0: by0, x1: bx1, y1: by1, h: body.height });
}

/** Dual in-line package: n pins, rows `rows` apart, numbered anticlockwise from pin 1 top left. */
export function dip(id: string, name: string, n: number, rows = 7.62, pitch = 2.54): Footprint {
  const half = n / 2, y0 = -((half - 1) * pitch) / 2;
  const pads: Pad[] = [];
  for (let k = 0; k < half; k++) pads.push(tht(String(k + 1), -rows / 2, y0 + k * pitch, 1.6, 0.8, k === 0 ? 'rect' : 'oval', 1.6));
  for (let k = 0; k < half; k++) pads.push(tht(String(half + k + 1), rows / 2, -y0 - k * pitch, 1.6, 0.8, 'oval', 1.6));
  const bx = rows / 2 - 1.27, by = -y0 + 1.27;
  const s = [...box(-bx, -by, bx, by), line(-1, -by, 0, -by + 1), line(0, -by + 1, 1, -by)];
  return make(id, name, `DIP-${n}, ${rows} mm rows`, pads, s, { x0: -bx, y0: -by, x1: bx, y1: by, h: 3.5 });
}

/** Small-outline package with gull-wing leads on two sides (SOIC). */
export function soic(id: string, name: string, n: number, pitch = 1.27, span = 5.4): Footprint {
  const half = n / 2, y0 = -((half - 1) * pitch) / 2;
  const pads: Pad[] = [];
  for (let k = 0; k < half; k++) pads.push(smd(String(k + 1), -span / 2, y0 + k * pitch, 1.55, 0.6));
  for (let k = 0; k < half; k++) pads.push(smd(String(half + k + 1), span / 2, -y0 - k * pitch, 1.55, 0.6));
  const by = -y0 + 0.75;
  return make(id, name, `SOIC-${n}, pitch ${pitch} mm`, pads, [line(-1.95, -by, 1.95, -by), line(-1.95, by, 1.95, by), line(-3.6, y0 - 0.6, -2.4, y0 - 0.6)],
    { x0: -1.95, y0: -by, x1: 1.95, y1: by, h: 1.75 });
}

export const FOOTPRINTS: Record<string, Footprint> = {};
const add = (f: Footprint) => { FOOTPRINTS[f.id] = f; return f; };

// passives
add(axial('R_Axial_0207', 'Resistor, axial 0207 (¼ W), 10.16 mm', 10.16, 0.8, 1.6, 6.3, 2.5, 2.5));
add(axial('R_Axial_0309', 'Resistor, axial 0309 (½–1 W), 15.24 mm', 15.24, 1.0, 2.0, 9, 3.2, 3.2));
add(make('Chip_0805', 'Resistor or capacitor, SMD 0805', 'chip 2.0 × 1.25 mm', [smd('1', -0.95, 0, 1.0, 1.25), smd('2', 0.95, 0, 1.0, 1.25)],
  [line(-0.25, -0.85, 0.25, -0.85), line(-0.25, 0.85, 0.25, 0.85)], { x0: -1, y0: -0.625, x1: 1, y1: 0.625, h: 0.6 }));
add(make('C_Disc_5.08', 'Capacitor, ceramic disc or film, 5.08 mm', 'radial, pitch 5.08 mm, body 6 × 3 mm', [tht('1', -2.54, 0, 1.6, 0.8), tht('2', 2.54, 0, 1.6, 0.8)],
  box(-3.6, -1.6, 3.6, 1.6), { x0: -3.5, y0: -1.5, x1: 3.5, y1: 1.5, h: 6 }));
add(radial('CP_Radial_D6.3', 'Electrolytic capacitor, Ø 6.3 mm, 2.5 mm', 2.5, 0.8, 1.6, 6.3, 11, true));
add(radial('CP_Radial_D10', 'Electrolytic capacitor, Ø 10 mm, 5.0 mm', 5.0, 1.0, 2.0, 10, 16, true));
add(radial('L_Radial_D8', 'Inductor, radial Ø 8 mm, 5.08 mm', 5.08, 1.0, 2.0, 8, 10));
add(make('RT_Disc_5.08', 'Thermistor, disc, 5.08 mm', 'radial disc, pitch 5.08 mm', [tht('1', -2.54, 0, 1.6, 0.8, 'rect'), tht('2', 2.54, 0, 1.6, 0.8)],
  box(-3.6, -1.6, 3.6, 1.6), { x0: -3.5, y0: -1.5, x1: 3.5, y1: 1.5, h: 7 }));
add(radial('F_TR5', 'Fuse, TR5 radial, 5.08 mm', 5.08, 0.9, 1.8, 8.5, 7.5));
add(inline('Pot_Trimmer_3', 'Potentiometer, trimmer 3 pins, 2.54 mm', 3, 2.54, 0.9, 1.6, 1.6, { d: 4.8, back: 2.4, height: 5 }));
add(inline('Pot_9mm', 'Potentiometer, 9 mm panel, 5.0 mm', 3, 5.0, 1.3, 2.4, 2.4, { d: 10, back: 7, height: 12 }));
// diodes
add(axial('D_DO-35', 'Diode, DO-35 (glass), 7.62 mm', 7.62, 0.8, 1.6, 4, 2, 2, true));
add(axial('D_DO-41', 'Diode, DO-41, 10.16 mm', 10.16, 1.0, 2.0, 5.2, 2.7, 2.7, true));
add(axial('D_P600', 'Diode, P600 (5 kW TVS, 6 A rectifiers), 15.24 mm', 15.24, 1.5, 2.8, 9.1, 9.1, 9.1, true));
add(make('D_SMA', 'Diode, SMA (DO-214AC)', 'pad 1 = cathode', [smd('1', -2.15, 0, 1.8, 1.7), smd('2', 2.15, 0, 1.8, 1.7)],
  [line(-1, -1.4, 1, -1.4), line(-1, 1.4, 1, 1.4), line(-0.9, -1.4, -0.9, 1.4)], { x0: -2.2, y0: -1.3, x1: 2.2, y1: 1.3, h: 2.3 }));
add(make('D_SMC', 'Diode, SMC (DO-214AB)', 'pad 1 = cathode', [smd('1', -3.4, 0, 2.4, 3.3), smd('2', 3.4, 0, 2.4, 3.3)],
  [line(-1.9, -3.2, 1.9, -3.2), line(-1.9, 3.2, 1.9, 3.2), line(-1.7, -3.2, -1.7, 3.2)], { x0: -3.5, y0: -3.0, x1: 3.5, y1: 3.0, h: 2.6 }));
add(radial('LED_D5.0', 'LED, Ø 5 mm, 2.54 mm', 2.54, 0.9, 1.8, 5, 8.6));
add(make('SOT-23', 'SOT-23 (3 pins)', 'pins 1, 2 at the bottom, 3 at the top', [smd('1', -0.95, 1.1, 0.9, 0.8), smd('2', 0.95, 1.1, 0.9, 0.8), smd('3', 0, -1.1, 0.9, 0.8)],
  [line(-1.6, -0.75, -0.75, -0.75), line(0.75, -0.75, 1.6, -0.75), line(-0.2, 0.75, 0.2, 0.75)], { x0: -1.45, y0: -0.65, x1: 1.45, y1: 0.65, h: 1.1 }));
add(make('SOT-223', 'SOT-223 (3 pins and tab)', 'tab = pin 2', [smd('1', -2.3, 3.15, 1.2, 2.0), smd('2', 0, 3.15, 1.2, 2.0), smd('3', 2.3, 3.15, 1.2, 2.0), smd('4', 0, -3.15, 3.6, 2.0)],
  [line(-3.5, -1.85, -3.5, 1.85), line(3.5, -1.85, 3.5, 1.85)], { x0: -3.25, y0: -1.75, x1: 3.25, y1: 1.75, h: 1.8 }));
// transistors and regulators standing up, legs in a row
add(inline('TO-92_Wide', 'TO-92, legs bent to 2.54 mm', 3, 2.54, 0.8, 1.4, 1.4, { d: 3.8, back: 1.9, height: 4.9 }, 'circle'));
add(inline('TO-126_Vertical', 'TO-126 standing, 2.28 mm', 3, 2.28, 1.1, 1.7, 2.2, { d: 3.4, back: 1.5, height: 11 }));
add(inline('TO-220_Vertical', 'TO-220 standing, 2.54 mm', 3, 2.54, 1.2, 1.8, 2.4, { d: 5.0, back: 3.4, height: 16 }));
add(inline('TO-247_Vertical', 'TO-247 standing, 5.45 mm', 3, 5.45, 1.4, 2.5, 3.0, { d: 5.4, back: 3.3, height: 21 }));
// integrated circuits
add(dip('DIP-4', 'DIP-4 (optocoupler)', 4));
add(dip('DIP-8', 'DIP-8', 8));
add(dip('DIP-14', 'DIP-14', 14));
add(soic('SOIC-8', 'SOIC-8', 8));
// connectors: parts that are off the board are wired to a connector
add(inline('PinHeader_1x2', 'Pin header 1 × 2, 2.54 mm', 2, 2.54, 1.0, 1.7, 1.7, { d: 2.54, back: 1.27, height: 8.5 }));
add(inline('PinHeader_1x3', 'Pin header 1 × 3, 2.54 mm (servo: S, +, −)', 3, 2.54, 1.0, 1.7, 1.7, { d: 2.54, back: 1.27, height: 8.5 }));
for (const n of [1, 2, 3, 4, 6, 8, 12, 14]) add(inline(`TerminalBlock_1x${n}`, `Screw terminal ${n} poles, 5.08 mm`, n, 5.08, 1.3, 2.6, 2.6, { d: 8, back: 4, height: 10 }));
add(make('Bridge_Inline_4', 'Bridge rectifier, 4 inline legs 5.08 mm (+ ~ ~ −)', 'check the marking on the body: + ~ ~ −', [1, 2, 3, 4].map((k) => tht(String(k), -7.62 + (k - 1) * 5.08, 0, 2.2, 1.2, k === 1 ? 'rect' : 'circle')),
  box(-10, -2, 10, 2), { x0: -10, y0: -1.9, x1: 10, y1: 1.9, h: 15 }));
// switches and relays
add(inline('Switch_Toggle_2', 'Toggle or slide switch, 2 pins 5.0 mm', 2, 5.0, 1.2, 2.2, 2.2, { d: 6, back: 3, height: 9 }));
add(inline('Switch_Slide_3', 'Slide switch SPDT, 3 pins 2.54 mm', 3, 2.54, 0.9, 1.6, 1.6, { d: 4.4, back: 2.2, height: 6 }));
add(make('SW_Tactile_6mm', 'Push-button, tactile 6 × 6 mm', 'pads 1a/1b are one contact, 2a/2b the other', [tht('1a', -3.25, -2.25, 2.0, 1.0), tht('1b', 3.25, -2.25, 2.0, 1.0), tht('2a', -3.25, 2.25, 2.0, 1.0), tht('2b', 3.25, 2.25, 2.0, 1.0)],
  [line(-1.9, -3.1, 1.9, -3.1), line(-1.9, 3.1, 1.9, 3.1), line(-3.1, -0.9, -3.1, 0.9), line(3.1, -0.9, 3.1, 0.9)],
  { x0: -3, y0: -3, x1: 3, y1: 3, h: 5 }));
add(make('Relay_SPDT_SRD', 'Relay SPDT, SRD style (12 mm rows)', 'coil A1/A2, contacts COM, NC, NO', [tht('1', 2, -6, 2.5, 1.3), tht('2', 2, 6, 2.5, 1.3), tht('3', 0, 0, 2.5, 1.3, 'rect'), tht('4', 14.2, -6, 2.5, 1.3), tht('5', 14.2, 6, 2.5, 1.3)],
  box(-1.6, -8, 17.4, 8), { x0: -1.5, y0: -7.9, x1: 17.3, y1: 7.9, h: 15.5 }));
// protection parts
const movDisc = (id: string, name: string, pitch: number, D: number, t: number) =>
  add(make(id, name, `varistor disc Ø ${D} mm, pitch ${pitch} mm`, [tht('1', -pitch / 2, 0, 2.0, 1.0, 'rect'), tht('2', pitch / 2, 0, 2.0, 1.0)],
    box(-D / 2 - 0.2, -t / 2 - 0.2, D / 2 + 0.2, t / 2 + 0.2), { x0: -D / 2, y0: -t / 2, x1: D / 2, y1: t / 2, h: D + 3 }));
movDisc('MOV_Disc_10', 'Varistor disc Ø 10 mm, 7.5 mm', 7.5, 12, 5);
movDisc('MOV_Disc_14', 'Varistor disc Ø 14 mm, 7.5 mm', 7.5, 16, 6);
movDisc('MOV_Disc_20', 'Varistor disc Ø 20 mm, 10 mm', 10, 22, 6.5);
add(axial('GDT_Axial_8x6', 'Gas discharge tube 8 × 6 mm, axial, 15.24 mm', 15.24, 1.0, 2.0, 6, 8, 8));
