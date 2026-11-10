// Footprint assignment (PCB-02): every schematic part gets a footprint and a map from its
// symbol pins to the footprint's pads. The map follows the datasheet pin-out of the chosen
// model (a 2N3904 is E-B-C, a BC547B C-B-E, a 2N7000 S-G-D), so the board connects the
// right legs. Parts that do not sit on the board (motors, transformers, supplies) get a
// connector their wires go to. Logic gates sit in a 74HC package (a CD4000 package when their
// rail is above the 74HC's 6 V) whose supply pins connect to the gate's supply rail and to ground.

import { FOOTPRINTS, type Footprint } from './footprint';
import { railVoltage, symbolOf } from '../eda/symbols';
import type { Part } from '../eda/schematic';
import { parseValue } from '../eda/units';

/** A numeric property ("2", "630"), or undefined. */
const num = (x: string | undefined): number | undefined => { const n = parseValue(x ?? ''); return n === null || n === undefined || Number.isNaN(n) ? undefined : n; };

export interface FootprintChoice {
  footprint: string;
  /** Symbol pin → the pads it connects to (a pin may have several pads; a pad no pin). */
  pins: Record<string, string[]>;
  /** Pads connected to the part's supply rail and to ground (logic packages). */
  rail?: string[];
  gnd?: string[];
  /** What the choice means or what to check. */
  note?: string;
}

const same = (footprint: string, pins: string[], note?: string): FootprintChoice => ({ footprint, pins: Object.fromEntries(pins.map((p) => [p, [p]])), note });
const map = (footprint: string, m: Record<string, string | string[]>, extra: Partial<FootprintChoice> = {}): FootprintChoice =>
  ({ footprint, pins: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Array.isArray(v) ? v : [v]])), ...extra });

/** TO-92 / TO-220 / SOT-23 legs of a three-terminal part: `order` lists the symbol pins on pads 1, 2, 3. */
const legs = (footprint: string, order: [string, string, string], note?: string) => map(footprint, { [order[0]]: '1', [order[1]]: '2', [order[2]]: '3' }, note ? { note } : {});

// bipolar transistors: symbol pins 1 B, 2 C, 3 E
const BJT: Record<string, FootprintChoice> = {
  '2N3904': legs('TO-92_Wide', ['3', '1', '2'], 'E-B-C'), BC547B: legs('TO-92_Wide', ['2', '1', '3'], 'C-B-E'), '2N2222A': legs('TO-92_Wide', ['3', '1', '2'], 'E-B-C (PN2222A)'),
  BD139: legs('TO-126_Vertical', ['3', '2', '1'], 'E-C-B'), D44H11: legs('TO-220_Vertical', ['1', '2', '3'], 'B-C-E'), D45H11: legs('TO-220_Vertical', ['1', '2', '3'], 'B-C-E'), MJE340: legs('TO-126_Vertical', ['3', '2', '1'], 'E-C-B'), '2N3906': legs('TO-92_Wide', ['3', '1', '2'], 'E-B-C'), BC557B: legs('TO-92_Wide', ['2', '1', '3'], 'C-B-E'),
  BD140: legs('TO-126_Vertical', ['3', '2', '1'], 'E-C-B'),
};
// MOSFETs: symbol pins 1 G, 2 D, 3 S
const FET: Record<string, FootprintChoice> = {
  '2N7000': legs('TO-92_Wide', ['3', '1', '2'], 'S-G-D'), BS170: legs('TO-92_Wide', ['2', '1', '3'], 'D-G-S'), BS250: legs('TO-92_Wide', ['2', '1', '3'], 'D-G-S'),
  IRLZ44N: legs('TO-220_Vertical', ['1', '2', '3'], 'G-D-S'), IRF540N: legs('TO-220_Vertical', ['1', '2', '3'], 'G-D-S'), IRF9540N: legs('TO-220_Vertical', ['1', '2', '3'], 'G-D-S'),
  AO3400: legs('SOT-23', ['1', '3', '2'], 'G-S-D'), IRLML0060: legs('SOT-23', ['1', '3', '2'], 'G-S-D'), AO3401: legs('SOT-23', ['1', '3', '2'], 'G-S-D'),
  IRFP4468: legs('TO-247_Vertical', ['1', '2', '3'], 'G-D-S'), IRFP4110: legs('TO-247_Vertical', ['1', '2', '3'], 'G-D-S'), IPW65R041: legs('TO-247_Vertical', ['1', '2', '3'], 'G-D-S'),
  IRFB4115: legs('TO-220_Vertical', ['1', '2', '3'], 'G-D-S'), IRFP4668: legs('TO-247_Vertical', ['1', '2', '3'], 'G-D-S'),
};
// regulators: symbol pins 1 IN, 2 GND, 3 OUT
const REG: Record<string, FootprintChoice> = {
  '7805': legs('TO-220_Vertical', ['1', '2', '3'], 'IN-GND-OUT'), 'R-78E5.0-1.0': legs('TO-220_Vertical', ['1', '2', '3'], 'Recom SIP-3: VIN-GND-VOUT, 2.54 mm'), '7809': legs('TO-220_Vertical', ['1', '2', '3'], 'IN-GND-OUT'), '7812': legs('TO-220_Vertical', ['1', '2', '3'], 'IN-GND-OUT'),
  'AMS1117-3.3': map('SOT-223', { 1: '3', 2: '1', 3: ['2', '4'] }, { note: 'GND-OUT-IN, tab OUT' }), 'AMS1117-5.0': map('SOT-223', { 1: '3', 2: '1', 3: ['2', '4'] }, { note: 'GND-OUT-IN, tab OUT' }),
  'MCP1700-3.3': legs('TO-92_Wide', ['2', '1', '3'], 'GND-IN-OUT'), L78L05: legs('TO-92_Wide', ['3', '2', '1'], 'OUT-GND-IN'),
};
// op-amps: symbol pins 2 −, 3 +, 4 V−, 6 OUT, 7 V+ (the single op-amp pin-out)
const DUAL = map('DIP-8', { 2: '2', 3: '3', 4: '4', 6: '1', 7: '8' }, { note: 'amplifier A of the dual package; B unused' });
const OPAMP: Record<string, FootprintChoice[]> = {
  generic: [same('DIP-8', ['2', '3', '4', '6', '7'], 'single op-amp pin-out (741, TL071)')], ideal: [same('DIP-8', ['2', '3', '4', '6', '7'], 'single op-amp pin-out')],
  LM358: [DUAL, { ...DUAL, footprint: 'SOIC-8' }], TL072: [DUAL, { ...DUAL, footprint: 'SOIC-8' }], MCP6002: [DUAL, { ...DUAL, footprint: 'SOIC-8' }], NE5532: [DUAL, { ...DUAL, footprint: 'SOIC-8' }],
  LM324: [map('DIP-14', { 2: '2', 3: '3', 4: '11', 6: '1', 7: '4' }, { note: 'amplifier A of the quad package; B, C, D unused' })],
};
// 74HC logic, one gate of the package; supply pins to the gate's rail and to ground
const HC = (chip: string, m: Record<string, string>, extra: Partial<FootprintChoice> = {}): FootprintChoice =>
  map('DIP-14', m, { rail: ['14'], gnd: ['7'], note: `gate 1 of a 74HC${chip}; tie the inputs of the unused gates to ground`, ...extra });
const LOGIC: Record<string, FootprintChoice> = {
  and2: HC('08', { 1: '1', 2: '2', 3: '3' }), nand2: HC('00', { 1: '1', 2: '2', 3: '3' }), or2: HC('32', { 1: '1', 2: '2', 3: '3' }), xor2: HC('86', { 1: '1', 2: '2', 3: '3' }),
  nor2: HC('02', { 1: '2', 2: '3', 3: '1' }), not: HC('04', { 1: '1', 2: '2' }), schmitt: HC('14', { 1: '1', 2: '2' }),
  dff: HC('74', { 1: '2', 2: '3', 3: '5', 4: '6' }, { rail: ['14', '1', '4'], note: 'flip-flop 1 of a 74HC74; CLR and PRE (pins 1, 4) tied high' }),
  cd4020: map('DIP-16', Object.fromEntries(['10', '11', '9', '7', '5', '4', '6', '13', '12', '14', '15', '1', '2', '3'].map((k) => [k, k])), { rail: ['16'], gnd: ['8'], note: '74HC4020: VCC 16, GND 8' }),
};
// CD4000 logic for rails above 6 V (3–18 V): VDD on 14, VSS on 7
const CD = (chip: string, m: Record<string, string>, extra: Partial<FootprintChoice> = {}): FootprintChoice =>
  map('DIP-14', m, { rail: ['14'], gnd: ['7'], note: `gate 1 of a CD${chip}; tie the inputs of the unused gates to VSS`, ...extra });
const LOGIC_CD: Record<string, FootprintChoice> = {
  and2: CD('4081', { 1: '1', 2: '2', 3: '3' }), nand2: CD('4011', { 1: '1', 2: '2', 3: '3' }), or2: CD('4071', { 1: '1', 2: '2', 3: '3' }), xor2: CD('4070', { 1: '1', 2: '2', 3: '3' }),
  nor2: CD('4001', { 1: '1', 2: '2', 3: '3' }), not: CD('4069UB', { 1: '1', 2: '2' }), schmitt: CD('40106', { 1: '1', 2: '2' }),
  // RESET and SET are active high, so they go to VSS (the 74HC74's CLR and PRE go to VCC)
  dff: CD('4013', { 1: '5', 2: '3', 3: '1', 4: '2' }, { gnd: ['7', '4', '6'], note: 'flip-flop 1 of a CD4013; RESET and SET (pins 4, 6) tied to VSS' }),
  cd4020: map('DIP-16', Object.fromEntries(['10', '11', '9', '7', '5', '4', '6', '13', '12', '14', '15', '1', '2', '3'].map((k) => [k, k])), { rail: ['16'], gnd: ['8'], note: 'CD4020BE: VDD 16, VSS 8' }),
};
/** Highest supply the 74HC family is rated for. */
const HC_VMAX = 6;

/** Voltage of a logic part's supply rail from its name: "+5V", "3V3" (as `railVoltage`) or
 *  "V12", "V15H" (V, the volts, an optional letter); null when the name gives none. */
export function logicRailVoltage(name: string): number | null {
  const v = railVoltage(name);
  if (v !== null) return v;
  const m = name.trim().match(/^V(\d+)(?:[Vv.,](\d+))?[A-Za-z]?$/);
  return m ? Number(`${m[1]}${m[2] ? `.${m[2]}` : ''}`) : null;
}

/** The logic family for a supply rail: CD4000 above 6 V, else 74HC. */
export function logicFamily(rail: string): 'HC' | 'CD' {
  const v = logicRailVoltage(rail);
  return v !== null && Math.abs(v) > HC_VMAX ? 'CD' : 'HC';
}

/** The logic package for a gate on its rail. */
function logicChoice(id: string, rail: string): FootprintChoice | undefined {
  return (logicFamily(rail) === 'CD' ? LOGIC_CD : LOGIC)[id];
}

/** The footprints a part may have, the default first. */
export function footprintChoices(p: Part): FootprintChoice[] {
  const s = symbolOf(p.sym), v = p.props[s.value.key] ?? s.value.default;
  const pins = s.pins.map((x) => x.id);
  switch (s.id) {
    case 'resistor': {
      // by power (pmax) and, for shunts, value: the part the parts list orders must fit
      const w = num(p.props.pmax) ?? 0.25, r = parseValue(v) ?? 1e3;
      if (r <= 0.01 && w >= 3) return [map('R_Shunt_4T', { 1: ['1', '3'], 2: ['2', '4'] }, { note: 'four-terminal shunt: sense on pads 3, 4' })];
      if (w > 10) return [same('TerminalBlock_1x2', pins, `power resistor ${w} W on the heatsink (TO-247 / TO-220 or wirewound), wired`)];
      const by = w <= 0.25 ? 'R_Axial_0207' : w <= 1 ? 'R_Axial_0309' : w <= 3 ? 'R_Axial_P20' : w <= 5 ? 'R_Cement_5W' : 'R_Cement_10W';
      return [same(by, pins), ...(w <= 0.25 ? [same('R_Axial_0309', pins), same('Chip_0805', pins)] : [])];
    }
    case 'capacitor': {
      // ceramic up to 1 µF at up to 63 V; film by C·V (WIMA/KEMET box sizes); Y and HV discs
      const c = (parseValue(v) ?? 1e-7) * 1e6, vm = num(p.props.vmax) ?? 50, cv = c * vm;
      if (vm >= 1000 && c <= 0.01) return [same('C_Disc_P10', pins)];
      if (c <= 1 && vm <= 63) return [same('C_Disc_5.08', pins), same('Chip_0805', pins)];
      // DC-link film of 20 µF and more above 200 V: the parts list orders a 450 V part (catalogue)
      if (c >= 20 && vm > 200) return [same('C_Film_P52.5', pins)];
      // the box for C·V first, then the larger boxes (a board shared by variants takes the largest)
      const film = ['C_Film_P7.5', 'C_Film_P10', 'C_Film_P15', 'C_Film_P22.5', 'C_Film_P27.5', 'C_Film_P37.5'];
      const by = cv <= 100 ? 0 : cv <= 300 ? 1 : cv <= 1000 ? 2 : cv <= 3000 ? 3 : cv <= 7000 ? 4 : 5;
      return film.slice(by).map((f) => same(f, pins));
    }
    case 'capacitor_pol': {
      // radial or snap-in can by C·V (Panasonic FR/FC, Nichicon UHE/UCY case sizes)
      const c = (parseValue(v) ?? 1e-6) * 1e6, vm = num(p.props.vmax) ?? 25, cv = c * vm;
      const lo = [[300, 'CP_Radial_D5'], [700, 'CP_Radial_D6.3'], [1500, 'CP_Radial_D8'], [3500, 'CP_Radial_D10'], [8000, 'CP_Radial_D12.5'], [20000, 'CP_Radial_D16'], [110000, 'CP_Radial_D18'], [250000, 'CP_SnapIn_D25'], [Infinity, 'CP_SnapIn_D30']] as const;
      const hi = [[2000, 'CP_Radial_D10'], [5000, 'CP_Radial_D12.5'], [12000, 'CP_Radial_D16'], [25000, 'CP_Radial_D18'], [60000, 'CP_SnapIn_D22'], [110000, 'CP_SnapIn_D25'], [180000, 'CP_SnapIn_D30'], [Infinity, 'CP_SnapIn_D35']] as const;
      const by = (vm <= 63 ? lo : hi).find(([lim]) => cv <= lim)![1];
      return [same(by, pins)];
    }
    case 'inductor': {
      const i = num(p.props.imax) ?? 1;
      if (i > 10) return [same('TerminalBlock_1x2', pins, `power inductor ${i} A off the board (on the chassis), wired or bolted`)];
      return [same(i <= 2 ? 'L_Radial_D8' : 'L_Toroid_D25', pins)];
    }
    case 'ntc': return [same('RT_Disc_5.08', pins)];
    case 'fuse': {
      const a = parseValue(v) ?? 1;
      if (a > 10) return [same('TerminalBlock_1x2', pins, `fuse ${a} A in its holder off the board (class T, ANL or MEGA, bolted)`)];
      return [same(a <= 6.3 ? 'F_TR5' : 'Fuseholder_5x20', pins)];
    }
    case 'potentiometer': return [same('Pot_Trimmer_3', pins), same('Pot_9mm', pins)];
    case 'transformer': return [same('TerminalBlock_1x4', pins, 'off-board transformer: P1, P2, S1, S2')];
    case 'transformer3': return [same('TerminalBlock_1x8', pins, 'off-board transformer: 1U 1V 1W 1N 2U 2V 2W 2N')];
    case 'vdc': case 'battery': case 'vsin': return [same('TerminalBlock_1x2', pins, 'supply input: + on pad 1'), same('PinHeader_1x2', pins)];
    case 'vpulse': case 'idc': return [same('PinHeader_1x2', pins, 'signal input: pad 1 is the + / out side')];
    case 'vsin3': return [same('TerminalBlock_1x4', pins, 'three-phase input L1 L2 L3 N')];
    case 'diode': {
      const k = map('D_DO-41', { 1: '1', 2: '2' });
      if (v === '1N4148') return [map('D_DO-35', { 1: '1', 2: '2' }), k];
      if (v === 'BAT54') return [map('SOT-23', { 2: '1', 1: '3' }, { note: 'single BAT54: A pin 1, K pin 3' })];
      if (v === 'SS34') return [map('D_SMC', { 1: '1', 2: '2' })];
      if (v === '1N5408') return [map('D_DO-201AD', { 1: '1', 2: '2' })];
      if (v === 'C4D20120A' || v === 'C4D02120A') return [map('TO-220-2_Vertical', { 1: '1', 2: '2' }, { note: 'TO-220-2: cathode on pad 1 and the tab, anode on pad 2' })];
      if (v === 'MBR20100CT') return [map('TO-220_Vertical', { 1: '2', 2: '1' }, { note: 'anode on pad 1, cathode on the centre pad and the tab; pad 3 (the second diode) unused' })];
      if (v === 'STTH6003') return [map('TO-247_Vertical', { 1: '2', 2: '1' }, { note: 'anode on pad 1, cathode on the centre pad and the tab; pad 3 unused' })];
      return [k];
    }
    case 'zener': return [map(v.startsWith('1N53') ? 'D_DO-201AD' : v.startsWith('1N47') ? 'D_DO-41' : 'D_DO-35', { 1: '1', 2: '2' })];
    case 'led': return [map('LED_D5.0', { 1: '1', 2: '2' }, { note: 'pad 1 (square) is the cathode, the short leg' })];
    case 'tvs': return [map(v.startsWith('5KP') ? 'D_P600' : 'D_SMA', { 1: '1', 2: '2' }, { note: v.endsWith('CA') ? 'bidirectional: either way round' : 'pad 1 (band) is the cathode, on the protected line' })];
    case 'bridge': return [map('Bridge_Inline_4', { 3: '1', 1: '2', 2: '3', 4: '4' }, { note: 'inline + ~ ~ −: check the marking on the body' })];
    case 'npn': case 'pnp': return [BJT[v] ?? legs('TO-92_Wide', ['3', '1', '2'], 'E-B-C')];
    case 'nmos': case 'pmos': return [FET[v] ?? legs('TO-92_Wide', ['3', '1', '2'], 'S-G-D')];
    // thyristors: TO-247AC (1 K, 2 A and tab, 3 G); the SKKT modules sit on the heatsink, wired
    case 'scr': return v.startsWith('SKKT') ? [same('TerminalBlock_1x3', pins, 'thyristor module on its heatsink: A, K, G wired to the board')] : [legs('TO-247_Vertical', ['2', '1', '3'], 'K-A-G')];
    case 'igbt': return v.startsWith('Module') ? [same('TerminalBlock_1x3', pins, 'module on its heatsink: G, C, E wired to the board')] : [legs('TO-247_Vertical', ['1', '2', '3'], 'G-C-E')];
    case 'mov': return v.startsWith('SPD') ? [same('TerminalBlock_1x2', pins, 'DIN-rail surge protective device, wired')] : [same(v.startsWith('20D') ? 'MOV_Disc_20' : v.startsWith('10D') ? 'MOV_Disc_10' : 'MOV_Disc_14', pins)];
    case 'gdt': return v.startsWith('Spark') ? [same('TerminalBlock_1x2', pins, 'DIN-rail type 1 arrester, wired')] : [same('GDT_Axial_8x6', pins)];
    case 'breaker1': return [same('TerminalBlock_1x2', pins, 'DIN-rail device: its terminals on the board')];
    case 'breaker2': return [map('TerminalBlock_1x4', { 1: '1', 2: '2', N1: '3', N2: '4' }, { note: 'DIN-rail device: L in, L out, N in, N out' })];
    case 'breaker3': return [same('TerminalBlock_1x6', pins, 'DIN-rail device: L1 in/out, L2 in/out, L3 in/out')];
    case 'breaker4': return [map('TerminalBlock_1x8', { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', N1: '7', N2: '8' }, { note: 'DIN-rail device: L1, L2, L3, N in/out' })];
    case 'contactor': return [map('TerminalBlock_1x14', Object.fromEntries(['A1', 'A2', '1', '2', '3', '4', '5', '6', '7', '8', '13', '14', '21', '22'].map((x, k) => [x, String(k + 1)])), { note: 'DIN-rail contactor: A1 A2 1 2 3 4 5 6 7 8 13 14 21 22' })];
    case 'terminal': return [same('TerminalBlock_1x1', pins, 'one pole; poles of one function group sit side by side in one block')];
    case 'hc595': return [same('DIP-16', pins, '74HC595: VCC 16, GND 8'), same('SOIC-16', pins, '74HC595D: VCC 16, GND 8')];
    case 'hc4051': return [same('DIP-16', pins, '74HC4051: VCC 16, VEE 7, GND 8'), same('SOIC-16', pins, '74HC4051D: VCC 16, VEE 7, GND 8')];
    case 'mcu': return [same('ESP32_DevKitC', pins, 'the module on two 1 × 19 female headers, 2.54 mm')];
    case 'idc20': return [same('IDC_Header_2x10', pins, 'box header; the ribbon cable with IDC sockets between the boards')];
    case 'pv': return [same('TerminalBlock_1x2', pins, 'PV cable (via MC4 connectors): + and −')];
    case 'autotransformer': return [map('TerminalBlock_1x8', { N: '1', T1: '2', T2: '3', T3: '4', T4: '5', T5: '6', T6: '7', T7: '8' }, { note: 'off-board autotransformer: N, T1 … T7' })];
    case 'comparator': return v === 'LM339' ? [map('DIP-14', { 3: '5', 2: '4', 1: '2', 8: '3', 4: '12' }, { note: 'comparator 1 of the LM339; tie the inputs of the unused ones to GND' })] : [same('DIP-8', pins, 'comparator A of the LM393'), same('SOIC-8', pins)];
    case 'hbdriver': return [map('DIP-8', { 1: '1', 2: '2', 8: '8', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7' }, { note: 'IR2184 pin-out; SD (pin 2) low turns both outputs off: wire it to VCC when unused' })];
    case 'vsurge': case 'isurge': return [same('PinHeader_1x2', pins, 'test generator: not a part of the board')];
    case 'optotriac': return [same('DIP-6_NoPin5', pins.filter((x) => x !== '5'), '1 A, 2 K, 4 MT1, 6 MT2 (3 not connected, 5 left out for the creepage)')];
    case 'opto': return [same('DIP-4', pins, '1 A, 2 K, 3 E, 4 C')];
    case 'opamp': return OPAMP[v] ?? OPAMP.generic;
    case 'regulator': return [REG[v] ?? legs('TO-220_Vertical', ['1', '2', '3'], 'IN-GND-OUT')];
    case 'lm317': return [legs('TO-220_Vertical', ['1', '2', '3'], 'ADJ-OUT-IN')];
    case 'tl431': return [legs('TO-92_Wide', ['1', '2', '3'], 'REF-A-K')];
    case 'timer555': return [same('DIP-8', pins), same('SOIC-8', pins)];
    case 'switch': return [same('Switch_Toggle_2', pins)];
    case 'button': return [map('SW_Tactile_6mm', { 1: ['1a', '1b'], 2: ['2a', '2b'] })];
    // a jumper (props.jumper): a 3-pin header and a shunt, the common in the middle
    case 'spdt': if (p.props.jumper === 'true') return [map('PinHeader_1x3', { 2: '1', 1: '2', 3: '3' }, { note: 'jumper: A, C (common), B; shunt on C–B for a linked unit' })];
      return [map('Switch_Slide_3', { 2: '1', 1: '2', 3: '3' }, { note: 'A, C (common), B' })];
    case 'relay': return [same('Relay_SPDT_SRD', pins, 'A1, A2 (coil), COM, NC, NO')];
    case 'dcmotor': return [map('TerminalBlock_1x2', { 1: '1', 2: '2' }, { note: 'motor wires; the speed output is simulation only' })];
    case 'motor1': return [same('TerminalBlock_1x2', pins, 'motor wires L, N')];
    case 'motor3': return [same('TerminalBlock_1x4', pins, 'motor wires U, V, W, N')];
    case 'servo': return [map('PinHeader_1x3', { 1: '1', 2: '2', 3: '3' }, { note: 'servo plug S, +, −; the angle output is simulation only' })];
    default: { const c = s.logic ? logicChoice(s.id, v) : undefined; return c ? [c] : []; }
  }
}

/** The part's footprint: the one chosen in its "footprint" property, else the default. */
export function footprintOf(p: Part): { choice: FootprintChoice; fp: Footprint } | null {
  const c = footprintChoices(p);
  if (!c.length) return null;
  const choice = c.find((x) => x.footprint === p.props.footprint) ?? c[0];
  return { choice, fp: FOOTPRINTS[choice.footprint] };
}

/** Pins of a part that have no pad (simulation-only outputs). */
export function pinsWithoutPad(p: Part, c: FootprintChoice): string[] {
  return symbolOf(p.sym).pins.map((x) => x.id).filter((id) => !c.pins[id]?.length);
}
