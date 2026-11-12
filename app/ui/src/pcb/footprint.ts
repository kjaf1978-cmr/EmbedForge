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
add(axial('D_DO-201AD', 'Diode, DO-201AD (3 A rectifier), 15.24 mm', 15.24, 1.4, 2.6, 9.5, 5.3, 5.3, true));
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
add(inline('TO-126_Vertical', 'TO-126 standing, 2.28 mm', 3, 2.28, 1.0, 1.6, 2.2, { d: 3.4, back: 1.5, height: 11 }));
add(inline('TO-220_Vertical', 'TO-220 standing, 2.54 mm', 3, 2.54, 1.2, 1.8, 2.4, { d: 5.0, back: 3.4, height: 16 }));
// two-lead TO-220 (SiC diodes): the leads 5.08 mm apart, no middle pad
add(inline('TO-220-2_Vertical', 'TO-220-2 standing, 5.08 mm', 2, 5.08, 1.2, 1.8, 2.4, { d: 5.0, back: 3.4, height: 16 }));
add(inline('TO-247_Vertical', 'TO-247 standing, 5.45 mm', 3, 5.45, 1.4, 2.5, 3.0, { d: 5.4, back: 3.3, height: 21 }));
// integrated circuits
add(dip('DIP-4', 'DIP-4 (optocoupler)', 4));
add(dip('DIP-6', 'DIP-6', 6));
// opto-triacs (FOD4218, MOC30xx): pin 5 is not to be connected, and its pad sat 0.94 mm from the
// mains pins 4 and 6 on either side; without it they are 5.08 mm apart
{ const f = dip('DIP-6_NoPin5', 'DIP-6 without pin 5 (opto-triac)', 6); add({ ...f, pads: f.pads.filter((q) => q.id !== '5') }); }
add(dip('DIP-8', 'DIP-8', 8));
add(dip('DIP-16', 'DIP-16', 16));
add(dip('DIP-14', 'DIP-14', 14));
add(soic('SOIC-8', 'SOIC-8', 8));
// SOIC-8 wide body (TI DWV, 7.5 mm body): 8.6 mm between the pad rows for a reinforced barrier
{ const pads: Pad[] = [];
  for (let k = 0; k < 4; k++) pads.push(smd(String(k + 1), -5.25, -1.905 + k * 1.27, 1.9, 0.6));
  for (let k = 0; k < 4; k++) pads.push(smd(String(8 - k), 5.25, -1.905 + k * 1.27, 1.9, 0.6));
  add(make('SOIC-8W', 'SOIC-8 wide body (isolated amplifier, 8.5 mm creepage)', 'SOIC-8 wide, pitch 1.27 mm, body 7.5 × 5.85 mm', pads,
    [line(-3.75, -2.93, 3.75, -2.93), line(-3.75, 2.93, 3.75, 2.93), line(-6.6, -2.5, -5.0, -2.5)], { x0: -3.75, y0: -2.93, x1: 3.75, y1: 2.93, h: 2.65 })); }
// connectors: parts that are off the board are wired to a connector
add(inline('PinHeader_1x2', 'Pin header 1 × 2, 2.54 mm', 2, 2.54, 1.0, 1.7, 1.7, { d: 2.54, back: 1.27, height: 8.5 }));
add(inline('PinHeader_1x3', 'Pin header 1 × 3, 2.54 mm (servo: S, +, −)', 3, 2.54, 1.0, 1.7, 1.7, { d: 2.54, back: 1.27, height: 8.5 }));
for (const n of [1, 2, 3, 4, 6, 8, 12, 14]) add(inline(`TerminalBlock_1x${n}`, `Screw terminal ${n} poles, 5.08 mm`, n, 5.08, 1.3, 2.6, 2.6, { d: 8, back: 4, height: 10 }));
// sized parts (the footprint follows the part's value and rating, as the parts list orders it)
// radial electrolytics: Ø × pitch of the common series (Panasonic FR/FC, Nichicon UHE/UCY);
// snap-in cans (two leads, 10 mm) from Ø 22 mm
for (const [D, P, H] of [[5, 2.0, 11], [8, 3.5, 12], [12.5, 5.0, 20], [16, 7.5, 25], [18, 7.5, 36]] as const)
  add(radial(`CP_Radial_D${D}`, `Electrolytic capacitor, Ø ${D} mm, ${P} mm`, P, D >= 12.5 ? 1.0 : D <= 5 ? 0.7 : 0.8, D >= 12.5 ? 2.0 : D <= 5 ? 1.3 : 1.6, D, H, true));
for (const [D, H] of [[22, 30], [25, 40], [30, 45], [35, 50]] as const)
  add(radial(`CP_SnapIn_D${D}`, `Electrolytic capacitor, snap-in Ø ${D} mm, 10 mm`, 10, 2.0, 3.5, D, H, true));
// film capacitors (box, two leads): pitch, width × thickness of the WIMA/KEMET MKP series
const film = (P: number, L: number, T: number, H: number) => add(make(`C_Film_P${P}`, `Film capacitor, pitch ${P} mm (${L} × ${T} mm)`, `box ${L} × ${T} mm`,
  [tht('1', -P / 2, 0, P >= 22.5 ? 2.4 : 1.8, P >= 22.5 ? 1.2 : 0.9), tht('2', P / 2, 0, P >= 22.5 ? 2.4 : 1.8, P >= 22.5 ? 1.2 : 0.9)], box(-L / 2, -T / 2, L / 2, T / 2), { x0: -L / 2, y0: -T / 2, x1: L / 2, y1: T / 2, h: H }));
film(7.5, 10, 5, 10); film(10, 13, 6, 12); film(15, 18, 8, 15); film(22.5, 26.5, 12, 22); film(27.5, 31.5, 15, 26); film(37.5, 41.5, 24, 45);
// DC-link film (KEMET C4AE / Vishay MKP1848 47 µF 450 V): 52.5 mm, 57.5 × 35 mm
film(52.5, 57.5, 35, 50);
// ceramic disc for Y capacitors and high voltages, 10 mm
add(make('C_Disc_P10', 'Capacitor, ceramic disc (Y2, high voltage), 10 mm', 'radial, pitch 10 mm, body 12 × 5 mm', [tht('1', -5, 0, 2.0, 1.0), tht('2', 5, 0, 2.0, 1.0)],
  box(-6.6, -2.7, 6.6, 2.7), { x0: -6.5, y0: -2.5, x1: 6.5, y1: 2.5, h: 14 }));
// resistors by power: 2 W metal film (0617), 5 W and 10 W cement (horizontal), a four-terminal
// shunt (Isabellenhütte BVN/BVR style: two power pads, two sense pins)
add(axial('R_Axial_P20', 'Resistor, axial 2–3 W (0617), 20.32 mm', 20.32, 1.0, 2.0, 17, 6, 6));
add(axial('R_Cement_5W', 'Resistor, 5 W cement, horizontal, 30 mm', 30, 1.0, 2.2, 22, 10, 10));
add(axial('R_Cement_10W', 'Resistor, 10 W cement, horizontal, 55 mm', 55, 1.2, 2.4, 48, 10, 10));
add(make('R_Shunt_4T', 'Current shunt, four-terminal, 10 W (power pads 1, 2; sense 3, 4)', 'Kelvin sense on pads 3, 4 next to the power pads',
  [tht('1', -10, 0, 4.5, 2.0, 'rect'), tht('2', 10, 0, 4.5, 2.0), tht('3', -6, 4, 1.8, 0.9), tht('4', 6, 4, 1.8, 0.9)],
  box(-12.5, -3, 12.5, 6), { x0: -12.5, y0: -3, x1: 12.5, y1: 6, h: 5 }));
// fuse holder 5 × 20 mm, PCB (up to 10 A)
add(make('Fuseholder_5x20', 'Fuse holder 5 × 20 mm, PCB, 22.6 mm', 'clips for a 5 × 20 mm fuse', [tht('1', -11.3, 0, 3.0, 1.5, 'rect'), tht('2', 11.3, 0, 3.0, 1.5)],
  box(-13.6, -4.5, 13.6, 4.5), { x0: -13.5, y0: -4.5, x1: 13.5, y1: 4.5, h: 10 }));
// inductor, toroid standing on the board (to 10 A), 10 mm
add(radial('L_Toroid_D25', 'Inductor, toroid Ø 25 mm vertical, 10 mm', 10, 1.4, 2.6, 25, 14));

// high current (D45): an M5 bolt through a plated hole with a 12 mm ring, for a busbar or a cable
// lug (100 A and more with the board's copper pour; the bolt, its washers and the busbar carry
// the current; M5, not M6: the fab profile's largest plated drill is 5.5 mm)
add(make('Lug_M5', 'Bolt terminal M5 (busbar or cable lug)', 'one plated M5 hole, 12 mm ring', [tht('1', 0, 0, 12, 5.3)],
  [{ t: 'circle', x: 0, y: 0, r: 6.5 }], { x0: -6.5, y0: -6.5, x1: 6.5, y1: 6.5, h: 8 }));
// mains: 7.62 mm pitch (5 mm between the pads, more than the 3.2 mm of basic insulation at 300 V)
for (const n of [1, 2, 3, 4, 6, 8, 12, 14]) add(inline(`TerminalBlock_1x${n}_P7.62`, `Screw terminal ${n} poles, 7.62 mm (mains)`, n, 7.62, 1.3, 2.6, 2.6, { d: 10, back: 5, height: 12 }));
// an off-board transformer with a mains winding: its primary (pads 1, 2) and secondary (3, 4) on
// one 7.62 mm block with an empty pole between them (12.6 mm between the windings' pads)
add(make('Transformer_Wires_P7.62', 'Transformer wires, primary and secondary 7.62 mm, one pole apart', 'pads 1, 2 primary; 3, 4 secondary',
  [tht('1', -15.24, 0, 2.6, 1.3, 'rect', 2.6), tht('2', -7.62, 0, 2.6, 1.3, 'oval', 2.6), tht('3', 7.62, 0, 2.6, 1.3, 'oval', 2.6), tht('4', 15.24, 0, 2.6, 1.3, 'oval', 2.6)],
  box(-19.05, -5, 19.05, 5), { x0: -19.05, y0: -5, x1: 19.05, y1: 5, h: 12 }));
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
// P9 irrigation: the 74HC595 and 74HC4051 also in SOIC-16; the ribbon-cable bus; the ESP32 module
add(soic('SOIC-16', 'SOIC-16', 16));
add(dip('Arduino_Nano', 'Arduino Nano on two 1 × 15 sockets (DIP-30, 15.24 mm rows)', 30, 15.24));
add(inline('IR_Receiver_TSOP382', 'IR receiver TSOP382xx, 3 pins 2.54 mm (OUT, GND, VS)', 3, 2.54, 0.8, 1.5, 1.5, { d: 5.8, back: 1.5, height: 12 }));
add((() => {
  // shrouded box header 2 × 10, 2.54 mm: odd pins in the top row (1 left), even below
  const pads: Pad[] = [];
  for (let k = 0; k < 10; k++) { pads.push(tht(String(2 * k + 1), (k - 4.5) * 2.54, -1.27, 1.7, 1.0, k === 0 ? 'rect' : 'circle')); pads.push(tht(String(2 * k + 2), (k - 4.5) * 2.54, 1.27, 1.7, 1.0)); }
  const bx = 16.6, by = 4.45;
  return make('IDC_Header_2x10', 'Box header 2 × 10, 2.54 mm (IDC ribbon cable)', 'shrouded, keyed; pin 1 top left', pads,
    [...box(-bx, -by, bx, by), line(-2.2, by, -2.2, by - 1), line(2.2, by, 2.2, by - 1), line(-bx - 1, -2.5, -bx - 1, -0.5)], { x0: -bx, y0: -by, x1: bx, y1: by, h: 9 });
})());
add((() => {
  // ESP32-DevKitC: two rows of 19 pins, 2.54 mm, 25.4 mm apart, into 1 × 19 female headers (the
  // module stands on them, its antenna beyond the top edge of the rows)
  const pads: Pad[] = [];
  for (let k = 0; k < 19; k++) { pads.push(tht(`J1-${k + 1}`, -12.7, (k - 9) * 2.54, 1.7, 1.0, k === 0 ? 'rect' : 'circle')); pads.push(tht(`J3-${k + 1}`, 12.7, (k - 9) * 2.54, 1.7, 1.0, k === 0 ? 'rect' : 'circle')); }
  return make('ESP32_DevKitC', 'ESP32-DevKitC module on two 1 × 19 sockets', 'rows 25.4 mm apart; the module 28 × 54 mm, its antenna up (keep copper away from it)', pads,
    [...box(-14, -29, 14, 25), line(-14, -25, 14, -25)], { x0: -14, y0: -29, x1: 14, y1: 25, h: 18 });
})());
add(axial('GDT_Axial_8x6', 'Gas discharge tube 8 × 6 mm, axial, 15.24 mm', 15.24, 1.0, 2.0, 6, 8, 8));
