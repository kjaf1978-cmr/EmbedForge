// Simulation models of the generic parts (SIM-05). Parameters are typical datasheet-derived
// SPICE values; power MOSFETs use a level-1 approximation fitted to threshold voltage and
// on-resistance, and say so. Every model lists what it is good for.

import type { BjtModel, DiodeModel, MosModel } from '../sim/circuit';
import { TNOM, VT } from '../sim/engine';

export interface NamedModel<T> { name: string; note: string; model: T }

export const DIODES: NamedModel<DiodeModel>[] = [
  { name: '1N4148', note: 'small-signal switching diode, 100 V / 200 mA', model: { is: 2.52e-9, n: 1.752, rs: 0.568, bv: 100, ibv: 100e-6 } },
  { name: '1N5408', note: 'rectifier diode, 1000 V / 3 A (approximate model)', model: { is: 2e-8, n: 1.9, rs: 0.012, bv: 1000, ibv: 1e-5, cj: 40e-12 } },
  { name: '1N4007', note: 'rectifier diode, 1000 V / 1 A', model: { is: 7.03e-9, n: 1.808, rs: 0.0342, bv: 1000, ibv: 5e-6, cj: 15e-12 } },
  { name: 'UF4007', note: 'ultrafast rectifier diode, 1000 V / 1 A, 75 ns: bootstrap diode of high-voltage gate drivers', model: { is: 7.03e-9, n: 1.808, rs: 0.0342, bv: 1000, ibv: 5e-6, cj: 17e-12 } },
  { name: '1N5819', note: 'Schottky diode, 40 V / 1 A, low forward voltage', model: { is: 31.7e-6, n: 1.373, rs: 0.051, bv: 40, ibv: 1e-3, xti: 2, eg: 0.69 } },
  // fitted to the datasheet forward curve: 0.32 V at 1 mA, 0.8 V at 100 mA
  { name: 'BAT54', note: 'small-signal Schottky diode, 30 V / 200 mA', model: { is: 9.7e-8, n: 1.34, rs: 3.2, bv: 30, ibv: 2e-6, xti: 2, eg: 0.69 } },
  // 0.5 V at 3 A
  { name: 'SS34', note: 'power Schottky diode, 40 V / 3 A (SMC)', model: { is: 5.5e-6, n: 1.2, rs: 0.03, bv: 40, ibv: 0.5e-3, xti: 2, eg: 0.69 } },
  // fitted to the datasheet forward curve at 25 °C: 0.95 V at 30 A, 1.15 V at 60 A
  // SiC Schottky: no reverse recovery (no ringing at the turn-off of a high-voltage rectifier);
  // fitted to 1.0 V at 1 A and 1.5 V at 20 A (25 °C)
  { name: 'C4D20120A', note: 'SiC Schottky diode, 1200 V / 20 A (TO-220-2): high-voltage rectifier of converters, no reverse recovery (approximate model)', model: { is: 2e-12, n: 1.4, rs: 0.025, bv: 1200, ibv: 1e-4, cj: 100e-12 } },
  { name: 'C4D02120A', note: 'SiC Schottky diode, 1200 V / 2 A (TO-220-2): clamp and snubber diode of high-voltage converters, no reverse recovery (approximate model)', model: { is: 2e-13, n: 1.4, rs: 0.25, bv: 1200, ibv: 1e-5, cj: 15e-12 } },
  { name: 'STTH6003', note: 'ultrafast power rectifier, 300 V / 60 A (TO-247): freewheeling diode of converters', model: { is: 2.05e-7, n: 1.6, rs: 0.0057, bv: 300, ibv: 1e-4, cj: 100e-12 } },
];

/** Transient voltage suppressors (SMAJ family, 400 W peak pulse): breakdown at the nominal VBR
 *  (10 mA), and a series resistance that gives the datasheet clamping voltage VC at the peak
 *  pulse current IPP. "CA" types are bidirectional (two junctions in anti-series). */
export interface TvsModel { vrwm: number; vbr: number; vc: number; ipp: number; bidirectional: boolean }

const tvs = (name: string, vrwm: number, vbr: number, vc: number, ipp: number): NamedModel<TvsModel>[] => [
  { name: `${name}A`, note: `TVS diode, unidirectional: stand-off ${vrwm} V, breakdown ${vbr} V, clamps at ${vc} V with ${ipp} A (400 W)`, model: { vrwm, vbr, vc, ipp, bidirectional: false } },
  { name: `${name}CA`, note: `TVS diode, bidirectional: stand-off ±${vrwm} V, breakdown ${vbr} V, clamps at ${vc} V with ${ipp} A (400 W)`, model: { vrwm, vbr, vc, ipp, bidirectional: true } },
];
export const TVS: NamedModel<TvsModel>[] = [
  ...tvs('SMAJ5.0', 5, 6.7, 9.2, 43.5), ...tvs('SMAJ12', 12, 14, 19.9, 20.1), ...tvs('SMAJ24', 24, 28.1, 38.9, 10.3), ...tvs('SMAJ33', 33, 38.7, 53.3, 7.5),
  // 5 kW (10/1000 µs), P600 case: absorbs the inductor energy of a converter when its battery is cut off
  { name: '5KP64A', note: 'TVS diode 5 kW (P600), unidirectional: stand-off 64 V, breakdown 71.1 V, clamps at 103 V with 48.5 A', model: { vrwm: 64, vbr: 71.1, vc: 103, ipp: 48.5, bidirectional: false } },
];

/** The junction of a TVS: breakdown at VBR with 10 mA, series resistance (VC − VBR)/IPP. */
export function tvsJunction(m: TvsModel, vbr = m.vbr): DiodeModel {
  return { is: 1e-12, n: 1, rs: (m.vc - m.vbr) / m.ipp, bv: vbr, ibv: 10e-3 };
}

export const ZENERS: NamedModel<DiodeModel>[] = ([['BZX55C3V3', 3.3], ['BZX55C4V7', 4.7], ['BZX55C5V1', 5.1], ['BZX55C9V1', 9.1], ['BZX55C12', 12], ['BZX55C13', 13], ['1N4743A', 13, 1], ['1N5359B', 24, 5]] as [string, number, number?][])
  .map(([name, v, w]) => ({ name, note: `Zener diode ${v} V, ${w ? `${w} W` : '500 mW'}`, model: { is: 1e-14, n: 1, rs: w ? 0.5 : 2, bv: v, ibv: 5e-3 } }));

/** LED model from its forward voltage at 20 mA (N = 1.9, RS = 5 Ω). The junction voltage of
 *  a diode at a fixed current changes by (V_j − EG − XTI·V_T)/T per kelvin; EG is chosen so
 *  that the forward voltage falls by 2 mV/K, as LEDs typically do (SPICE's silicon default
 *  EG = 1.11 eV would make it rise). */
export function ledModel(vf: number): DiodeModel {
  const n = 1.9, rs = 5, i = 0.02, vj = vf - i * rs, xti = 3;
  return { is: i / Math.exp(vj / (n * VT)), n, rs, bv: 5, ibv: 10e-6, xti, eg: vj + 2e-3 * TNOM - xti * VT };
}

export const LED_COLOURS: { name: string; vf: number; css: string }[] = [
  { name: 'red', vf: 2.0, css: '#ff2a2a' },
  { name: 'yellow', vf: 2.1, css: '#ffd400' },
  { name: 'green', vf: 2.2, css: '#22d43a' },
  { name: 'blue', vf: 3.1, css: '#2a7bff' },
  { name: 'white', vf: 3.1, css: '#ffffff' },
];

export const BJTS: NamedModel<BjtModel>[] = [
  { name: '2N3904', note: 'NPN general purpose, 40 V / 200 mA', model: { type: 'npn', is: 6.734e-15, bf: 416.4, br: 0.7371, nf: 1, nr: 1, vaf: 74.03 } },
  { name: 'BC547B', note: 'NPN general purpose, 45 V / 100 mA', model: { type: 'npn', is: 7.049e-15, bf: 374.5, br: 1.811, nf: 1, nr: 1, vaf: 62.79 } },
  { name: '2N2222A', note: 'NPN switching, 40 V / 800 mA', model: { type: 'npn', is: 14.34e-15, bf: 255.9, br: 6.092, nf: 1, nr: 1, vaf: 74.03 } },
  { name: '2N3906', note: 'PNP general purpose, 40 V / 200 mA', model: { type: 'pnp', is: 1.41e-15, bf: 180.7, br: 4.977, nf: 1, nr: 1, vaf: 18.7 } },
  { name: 'BC557B', note: 'PNP general purpose, 45 V / 100 mA', model: { type: 'pnp', is: 1.02e-14, bf: 290, br: 4, nf: 1, nr: 1, vaf: 40 } },
  { name: 'BD139', note: 'NPN medium power, 80 V / 1.5 A (TO-126, approximate)', model: { type: 'npn', is: 2.1e-13, bf: 100, br: 5, nf: 1, nr: 1, vaf: 100 } },
  { name: 'BD140', note: 'PNP medium power, 80 V / 1.5 A (TO-126, approximate)', model: { type: 'pnp', is: 2.1e-13, bf: 100, br: 5, nf: 1, nr: 1, vaf: 100 } },
  { name: 'D44H11', note: 'NPN power switching, 80 V / 10 A (20 A peak), fT 50 MHz (TO-220, approximate): gate buffers of MOSFET banks', model: { type: 'npn', is: 1e-12, bf: 60, br: 5, nf: 1, nr: 1, vaf: 100 } },
  { name: 'D45H11', note: 'PNP power switching, 80 V / 10 A (20 A peak), fT 40 MHz (TO-220, approximate): gate buffers of MOSFET banks', model: { type: 'pnp', is: 1e-12, bf: 60, br: 5, nf: 1, nr: 1, vaf: 100 } },
  { name: 'MJE340', note: 'NPN high voltage, 300 V / 0.5 A, hFE 30–240 (TO-126, approximate)', model: { type: 'npn', is: 1e-13, bf: 80, br: 3, nf: 1, nr: 1, vaf: 200 } },
];

/** Level-1 MOSFETs: VTO and KP fitted so that VGS(th) and RDS(on) match the datasheet roughly. */
export const MOSFETS: NamedModel<MosModel>[] = [
  { name: '2N7000', note: 'N-channel small-signal, 60 V / 200 mA (approximate level-1 model)', model: { type: 'nmos', vto: 2.1, kp: 0.1, lambda: 0.01, w: 1, l: 1, is: 1e-14 } },
  { name: 'BS170', note: 'N-channel small-signal, 60 V / 500 mA (approximate level-1 model)', model: { type: 'nmos', vto: 2.0, kp: 0.15, lambda: 0.01, w: 1, l: 1, is: 1e-14 } },
  { name: 'IRLZ44N', note: 'N-channel logic-level power, 55 V / 47 A, RDS(on) ≈ 25 mΩ at 5 V (approximate level-1 model)', model: { type: 'nmos', vto: 1.6, kp: 12, lambda: 0.005, w: 1, l: 1, is: 1e-12 } },
  // RDS(on) = 1/(KP·(VGS − VTO)) in the linear region
  { name: 'AO3400', note: 'N-channel logic-level, 30 V / 5.8 A, RDS(on) ≈ 28 mΩ at 4.5 V (SOT-23, approximate level-1 model)', model: { type: 'nmos', vto: 1.05, kp: 10.4, lambda: 0.005, w: 1, l: 1, is: 1e-12 } },
  { name: 'IRF540N', note: 'N-channel power, 100 V / 33 A, RDS(on) ≈ 44 mΩ at 10 V (approximate level-1 model)', model: { type: 'nmos', vto: 3, kp: 3.25, lambda: 0.005, w: 1, l: 1, is: 1e-12 } },
  { name: 'BS250', note: 'P-channel small-signal, 45 V / 230 mA (approximate level-1 model)', model: { type: 'pmos', vto: -2.0, kp: 0.05, lambda: 0.01, w: 1, l: 1, is: 1e-14 } },
  { name: 'IRF9540N', note: 'P-channel power, 100 V / 23 A, RDS(on) ≈ 0.12 Ω at 10 V (approximate level-1 model)', model: { type: 'pmos', vto: -3, kp: 1.2, lambda: 0.005, w: 1, l: 1, is: 1e-12 } },
  { name: 'AO3401', note: 'P-channel logic-level, 30 V / 4 A, RDS(on) ≈ 50 mΩ at 4.5 V (SOT-23, approximate level-1 model)', model: { type: 'pmos', vto: -0.9, kp: 5.6, lambda: 0.005, w: 1, l: 1, is: 1e-12 } },
];

/** IGBT macro model: an N-channel MOSFET drives the base of a wide-base PNP (the classic
 *  equivalent circuit). The collector current is (1 + BF)·I_MOS; VCE(sat) = VEB(PNP) + VDS(MOS).
 *  Fitted to VGE(th) and VCE(sat) at the rated current with VGE = 15 V; no gate charge or tail
 *  current. `diode`: the co-packed anti-parallel diode from E to C. cge, cgc, cce: constant
 *  terminal capacitances (F) from the datasheet's Cies − Cres, Cres and Coes − Cres at 25 V. */
export interface IgbtModel { vto: number; kp: number; bf: number; is: number; diode?: DiodeModel; cge?: number; cgc?: number; cce?: number }

export const IGBTS: NamedModel<IgbtModel>[] = [
  { name: 'IKW30N60T', note: 'IGBT 600 V / 30 A with anti-parallel diode, VCE(sat) ≈ 1.5 V, VGE(th) ≈ 4.9 V (TO-247, approximate)', model: { vto: 4.9, kp: 1.89, bf: 1, is: 1e-10, diode: { is: 1e-9, n: 1.5, rs: 0.02 }, cge: 1580e-12, cgc: 50e-12, cce: 58e-12 } },
  { name: 'IKW50N60T', note: 'IGBT 600 V / 50 A with anti-parallel diode, VCE(sat) ≈ 1.5 V, VGE(th) ≈ 4.9 V (TO-247, approximate)', model: { vto: 4.9, kp: 3.15, bf: 1, is: 1.7e-10, diode: { is: 1.7e-9, n: 1.5, rs: 0.012 }, cge: 3047e-12, cgc: 93e-12, cce: 107e-12 } },
  { name: 'IKW40N120T2', note: 'IGBT 1200 V / 40 A with anti-parallel diode, VCE(sat) ≈ 1.75 V, VGE(th) ≈ 5.8 V (TO-247, approximate)', model: { vto: 5.8, kp: 2.16, bf: 1, is: 1e-10, diode: { is: 1e-9, n: 1.5, rs: 0.02 }, cge: 2390e-12, cgc: 110e-12, cce: 90e-12 } },
  { name: 'generic 600 V 20 A', note: 'IGBT 600 V / 20 A without diode (reverse blocking), VCE(sat) ≈ 1.8 V, VGE(th) ≈ 5.5 V', model: { vto: 5.5, kp: 0.95, bf: 1, is: 1e-10 } },
];

/** Optocoupler: infrared LED, and a phototransistor whose base current is CTR/BF times the
 *  LED current (current transfer ratio CTR = IC/IF before saturation). */
export interface OptoModel { vf: number; bf: number }
export const OPTOS: NamedModel<OptoModel>[] = [
  { name: 'PC817', note: 'phototransistor optocoupler (DIP-4): LED 1.2 V at 20 mA, CTR 50–600 % (set below), output 35 V / 50 mA', model: { vf: 1.2, bf: 500 } },
];

/** Shunt references: reference voltage between REF and anode; the cathode sinks what holds REF there. */
export interface ShuntRefModel { vref: number }
export const SHUNT_REFS: NamedModel<ShuntRefModel>[] = [
  { name: 'TL431', note: 'adjustable shunt regulator, 2.495 V reference (1 %), 2.5 to 36 V, 1 to 100 mA', model: { vref: 2.495 } },
  { name: 'TL431B', note: 'adjustable shunt regulator, 2.495 V reference (0.5 %), 2.5 to 36 V, 1 to 100 mA', model: { vref: 2.495 } },
  { name: 'TLV431', note: 'low-voltage adjustable shunt regulator, 1.24 V reference, 1.24 to 6 V', model: { vref: 1.24 } },
];

/** Bridge rectifiers: four identical diodes; cj: typical junction capacitance of each (datasheet, at 4 V). */
export const BRIDGES: NamedModel<DiodeModel>[] = [
  { name: 'DB107', note: 'bridge rectifier 1000 V / 1 A', model: { is: 7.03e-9, n: 1.808, rs: 0.0342, bv: 1000, ibv: 5e-6, cj: 15e-12 } },
  { name: 'KBP206', note: 'bridge rectifier 600 V / 2 A', model: { is: 1.4e-8, n: 1.8, rs: 0.02, bv: 600, ibv: 5e-6, cj: 25e-12 } },
  { name: 'GBU8K', note: 'bridge rectifier 800 V / 8 A', model: { is: 5e-8, n: 1.8, rs: 0.008, bv: 800, ibv: 5e-6, cj: 55e-12 } },
];

/** Op-amp macro model: single pole, rail clamps, output resistance. */
export interface OpampModel {
  gain: number; gbw: number; rin: number; rout: number;
  /** output swing limit from V+ (and from V− unless railDropLow is given) */
  railDrop: number; railDropLow?: number;
}

export const OPAMPS: NamedModel<OpampModel>[] = [
  { name: 'generic', note: 'general-purpose op-amp: 100 dB, 1 MHz, output 1.5 V from each rail', model: { gain: 1e5, gbw: 1e6, rin: 10e6, rout: 50, railDrop: 1.5 } },
  { name: 'LM358', note: 'LM358-like: 100 dB, 1 MHz, output from V− + 0.1 V to V+ − 1.5 V (single supply)', model: { gain: 1e5, gbw: 1e6, rin: 10e6, rout: 50, railDrop: 1.5, railDropLow: 0.1 } },
  { name: 'TL071', note: 'TL071-like single JFET input: 106 dB, 3 MHz, output 1.5 V from each rail', model: { gain: 2e5, gbw: 3e6, rin: 1e12, rout: 50, railDrop: 1.5 } },
  { name: 'TL072', note: 'TL072-like JFET input: 106 dB, 3 MHz, output 1.5 V from each rail', model: { gain: 2e5, gbw: 3e6, rin: 1e12, rout: 50, railDrop: 1.5 } },
  { name: 'LM324', note: 'LM324-like quad (one amplifier): 100 dB, 1 MHz, output from V− + 0.1 V to V+ − 1.5 V (single supply)', model: { gain: 1e5, gbw: 1e6, rin: 10e6, rout: 50, railDrop: 1.5, railDropLow: 0.1 } },
  { name: 'MCP6002', note: 'MCP6002-like CMOS rail-to-rail: 112 dB, 1 MHz, output 25 mV from each rail, supply up to 6 V', model: { gain: 4e5, gbw: 1e6, rin: 1e13, rout: 50, railDrop: 0.025 } },
  { name: 'NE5532', note: 'NE5532-like low-noise audio: 100 dB, 10 MHz, output 1.5 V from each rail', model: { gain: 1e5, gbw: 10e6, rin: 300e3, rout: 30, railDrop: 1.5 } },
  { name: 'ideal', note: 'near-ideal: 120 dB, 100 MHz, rail-to-rail output', model: { gain: 1e6, gbw: 100e6, rin: 1e12, rout: 1, railDrop: 0.05 } },
];

export function findModel<T>(list: NamedModel<T>[], name: string): NamedModel<T> {
  return list.find((m) => m.name.toLowerCase() === name.toLowerCase()) ?? list[0];
}

/** Linear regulators: macro model with reference, error amplifier, NPN pass transistor and a
 *  dropout clamp (no current limit, no thermal model). */
export interface RegulatorModel { vout: number; dropout: number; iq: number; adjustable?: boolean }

export const REGULATORS: NamedModel<RegulatorModel>[] = [
  { name: '7805', note: 'fixed 5 V, 1 A, dropout 2 V (L7805/LM7805 family)', model: { vout: 5, dropout: 2, iq: 5e-3 } },
  { name: '7809', note: 'fixed 9 V, 1 A, dropout 2 V', model: { vout: 9, dropout: 2, iq: 5e-3 } },
  { name: 'LM2940-9.0', note: 'fixed 9 V, 1 A low-dropout (0.5 V at 1 A), input up to 26 V; 22 µF at its output', model: { vout: 9, dropout: 0.5, iq: 10e-3 } },
  { name: '7812', note: 'fixed 12 V, 1 A, dropout 2 V', model: { vout: 12, dropout: 2, iq: 5e-3 } },
  { name: 'AMS1117-3.3', note: 'fixed 3.3 V, 1 A low-dropout (1.1 V)', model: { vout: 3.3, dropout: 1.1, iq: 5e-3 } },
  { name: 'AMS1117-5.0', note: 'fixed 5 V, 1 A low-dropout (1.1 V)', model: { vout: 5, dropout: 1.1, iq: 5e-3 } },
  { name: 'MCP1700-3.3', note: 'fixed 3.3 V, 250 mA low-dropout (0.18 V), input up to 6 V', model: { vout: 3.3, dropout: 0.18, iq: 1.6e-6 } },
  { name: 'L78L05', note: 'fixed 5 V, 100 mA (TO-92), dropout 1.7 V', model: { vout: 5, dropout: 1.7, iq: 3e-3 } },
];

export const ADJ_REGULATORS: NamedModel<RegulatorModel>[] = [
  { name: 'LM317', note: 'adjustable, 1.25 V between OUT and ADJ, 1.5 A, dropout about 2 V; Vout = 1.25 V × (1 + R2/R1)', model: { vout: 1.25, dropout: 2, iq: 50e-6, adjustable: true } },
  { name: 'LM317HV', note: 'as the LM317, for up to 60 V between input and output (LM317HVT)', model: { vout: 1.25, dropout: 2, iq: 50e-6, adjustable: true } },
];

/** Relays: coil as resistance and inductance; the contact pulls in at 75 % and drops out at
 *  25 % of the nominal coil current (typical small signal and power relays). */
export interface RelayModel { vcoil: number; rcoil: number; lcoil: number }

export const RELAYS: NamedModel<RelayModel>[] = [
  { name: '5 V', note: '5 V coil, 70 Ω (about 70 mA), changeover contact', model: { vcoil: 5, rcoil: 70, lcoil: 0.14 } },
  { name: '12 V', note: '12 V coil, 400 Ω (30 mA), changeover contact', model: { vcoil: 12, rcoil: 400, lcoil: 0.8 } },
  { name: '24 V', note: '24 V coil, 1.6 kΩ (15 mA), changeover contact', model: { vcoil: 24, rcoil: 1600, lcoil: 3.2 } },
  { name: '12 V 30 A', note: '12 V coil, 160 Ω (75 mA, 0.9 W), changeover contact 30 A / 250 V AC (power relay, AgSnO2): mains loads with inrush', model: { vcoil: 12, rcoil: 160, lcoil: 0.4 } },
];

// ---- power and installation parts (decision D20) -------------------------------------------

/** Metal-oxide varistors: varistor voltage Vn at 1 mA, clamping voltage Vc at Ic (8/20 µs),
 *  maximum surge current, energy (2 ms) and continuous AC voltage, from the typical datasheet
 *  values of each disc size. α = ln(Ic / 1 mA) / ln(Vc / Vn). */
export interface VaristorModel { vn: number; vc: number; ic: number; imax: number; energy: number; vac: number }
export const varistorAlpha = (m: VaristorModel) => Math.log(m.ic / 1e-3) / Math.log(m.vc / m.vn);
export const VARISTORS: NamedModel<VaristorModel>[] = [
  { name: '10D471K', note: 'Ø 10 mm disc, 300 V AC (470 V at 1 mA), clamps 775 V at 25 A, 3.5 kA, 70 J', model: { vn: 470, vc: 775, ic: 25, imax: 3500, energy: 70, vac: 300 } },
  { name: '14D471K', note: 'Ø 14 mm disc, 300 V AC, clamps 775 V at 50 A, 6 kA, 140 J', model: { vn: 470, vc: 775, ic: 50, imax: 6000, energy: 140, vac: 300 } },
  { name: '20D471K', note: 'Ø 20 mm disc, 300 V AC, clamps 775 V at 100 A, 10 kA, 270 J', model: { vn: 470, vc: 775, ic: 100, imax: 10000, energy: 270, vac: 300 } },
  { name: '14D431K', note: 'Ø 14 mm disc, 275 V AC (430 V at 1 mA), clamps 710 V at 50 A, 6 kA, 125 J', model: { vn: 430, vc: 710, ic: 50, imax: 6000, energy: 125, vac: 275 } },
  { name: '14D681K', note: 'Ø 14 mm disc, 420 V AC, for 400 V line voltage: clamps 1120 V at 50 A, 6 kA, 190 J', model: { vn: 680, vc: 1120, ic: 50, imax: 6000, energy: 190, vac: 420 } },
  { name: '14D201K', note: 'Ø 14 mm disc, 130 V AC / 170 V DC (200 V at 1 mA), clamps 340 V at 50 A, 6 kA, 60 J: inputs of PV chargers up to 150 V', model: { vn: 200, vc: 340, ic: 50, imax: 6000, energy: 60, vac: 130 } },
  { name: '14D121K', note: 'Ø 14 mm disc, 75 V AC / 100 V DC (120 V at 1 mA), clamps 200 V at 50 A, 4.5 kA, 30 J', model: { vn: 120, vc: 200, ic: 50, imax: 4500, energy: 30, vac: 75 } },
  { name: 'SPD-T2 275', note: 'surge protective device type 2, 275 V AC, In 20 kA, Imax 40 kA (8/20 µs), Up ≤ 1.3 kV: a 40 kA MOV block', model: { vn: 430, vc: 1300, ic: 20000, imax: 40000, energy: 1200, vac: 275 } },
  { name: 'SPD-T2 PV 1000', note: 'surge protective device type 2 for PV, 1000 V DC, In 20 kA, Imax 40 kA, Up ≤ 3.8 kV: MOV blocks in series', model: { vn: 1250, vc: 3800, ic: 20000, imax: 40000, energy: 2400, vac: 700 } },
  { name: 'SPD-T3 275', note: 'surge protective device type 3 (socket level), 275 V AC, Uoc 6 kV, Up ≤ 1.2 kV: a 14 mm MOV with its thermal fuse', model: { vn: 430, vc: 1200, ic: 3000, imax: 6000, energy: 125, vac: 275 } },
];

/** Gas discharge tubes and spark gaps: DC spark-over voltage, arc voltage, holdover current
 *  and the impulse current rating (8/20 µs; 10/350 µs for the type 1 spark gap). */
export interface GdtModel { vspark: number; varc: number; ihold: number; imax: number }
export const GDTS: NamedModel<GdtModel>[] = [
  { name: 'GDT 90 V', note: '2-electrode gas discharge tube, 90 V DC spark-over, 10 kA (8/20 µs): data and telecom lines', model: { vspark: 90, varc: 15, ihold: 0.15, imax: 10000 } },
  { name: 'GDT 230 V', note: '2-electrode gas discharge tube, 230 V DC spark-over, 10 kA', model: { vspark: 230, varc: 20, ihold: 0.2, imax: 10000 } },
  { name: 'GDT 600 V', note: '2-electrode gas discharge tube, 600 V DC spark-over, 20 kA: N–PE in a "3 + 1" SPD', model: { vspark: 600, varc: 25, ihold: 0.3, imax: 20000 } },
  { name: 'Spark gap T1 255', note: 'type 1 lightning current arrester (encapsulated spark gap), 255 V AC, Iimp 25 kA (10/350 µs), Up ≤ 4 kV', model: { vspark: 4000, varc: 30, ihold: 0.5, imax: 25000 } },
];

/** Miniature circuit breakers (IEC 60898): rated current; the curve sets the magnetic trip. */
export const BREAKER_A = [2, 4, 6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250];
/** Instantaneous (magnetic) trip in multiples of In: the guaranteed value of each curve (B 3–5, C 5–10, D 10–20). */
export const CURVE_MAG: Record<string, number> = { B: 5, C: 10, D: 20 };

/** Contactors: AC-3 rated current (IEC 60947-4-1) and coil. Pull-in at 85 %, drop-out at 40 %
 *  of the coil's rated current (peak-detected over ~20 ms, as the armature's inertia does). */
export interface ContactorModel { ac3: number; coil: 'dc' | 'ac'; vcoil: number; rcoil: number; lcoil: number }
const ctr = (ac3: number, coil: 'dc' | 'ac', vcoil: number, rcoil: number, lcoil: number): NamedModel<ContactorModel> => ({
  name: `${ac3} A, coil ${vcoil} V ${coil.toUpperCase()}`, note: `3 poles AC-3 ${ac3} A (about ${(ac3 * 0.4 * 1.732 * 0.85).toFixed(1)} kW at 400 V), 1 NO + 1 NC auxiliary; coil ${vcoil} V ${coil === 'ac' ? 'AC 50 Hz' : 'DC'}`,
  model: { ac3, coil, vcoil, rcoil, lcoil },
});
export const CONTACTORS: NamedModel<ContactorModel>[] = [
  ctr(9, 'ac', 230, 600, 20), ctr(18, 'ac', 230, 450, 16), ctr(32, 'ac', 230, 300, 12), ctr(65, 'ac', 230, 150, 6), ctr(95, 'ac', 230, 100, 4),
  ctr(9, 'dc', 24, 190, 0.6), ctr(18, 'dc', 24, 120, 0.4), ctr(32, 'dc', 24, 80, 0.3),
  // DC power contactor for battery circuits (pole 1–2 only; rated current on DC, not AC-3)
  { name: '150 A DC, coil 48 V', note: 'single-pole DC contactor 150 A continuous, 80 V DC (battery isolation of 48 V inverters); coil 48 V DC, 190 Ω (12 W), fed from the battery itself', model: { ac3: 150, coil: 'dc', vcoil: 48, rcoil: 190, lcoil: 0.8 } },
  { name: '150 A DC, coil 24 V', note: 'single-pole DC contactor 150 A continuous, 80 V DC (battery isolation of 24 V inverters); coil 24 V DC, 48 Ω (12 W), fed from the battery itself', model: { ac3: 150, coil: 'dc', vcoil: 24, rcoil: 48, lcoil: 0.2 } },
  { name: '200 A DC, coil 12 V', note: 'single-pole DC contactor 200 A continuous, 80 V DC (battery isolation of 12 V inverters: 159 A at the 10.5 V cut-out); coil 12 V DC, 12 Ω (12 W), fed from the battery itself', model: { ac3: 200, coil: 'dc', vcoil: 12, rcoil: 12, lcoil: 0.05 } },
  { name: '150 A DC, coil 12 V', note: 'single-pole DC contactor 150 A continuous, 80 V DC (battery isolation, inverter pre-charge bypass); coil 12 V DC, 12 Ω', model: { ac3: 150, coil: 'dc', vcoil: 12, rcoil: 12, lcoil: 0.05 } },
];

/** Comparators with open-collector outputs. */
export const COMPARATORS: NamedModel<{ gain: number; tresp: number; isink: number }>[] = [
  { name: 'LM393', note: 'dual comparator, open collector, 2 to 36 V, gain 200 V/mV, 1.3 µs', model: { gain: 2e5, tresp: 1.3e-6, isink: 0.016 } },
  { name: 'LM339', note: 'quad comparator, open collector, 2 to 36 V, gain 200 V/mV, 1.3 µs', model: { gain: 2e5, tresp: 1.3e-6, isink: 0.016 } },
];

/** PV modules at standard test conditions (1000 W/m², 25 °C cells, AM 1.5): typical datasheet
 *  values of each module class. The single-diode model is fitted to them (pvFit). */
export interface PvModel { cells: number; voc: number; isc: number; vmp: number; imp: number; kIsc: number; kVoc: number }
export const PV_MODULES: NamedModel<PvModel>[] = [
  { name: '100 Wp, 36 cells', note: '12 V class module: Voc 22.0 V, Isc 5.90 A, Vmp 18.0 V, Imp 5.56 A', model: { cells: 36, voc: 22.0, isc: 5.90, vmp: 18.0, imp: 5.56, kIsc: 0.0005, kVoc: -0.0031 } },
  { name: '280 Wp, 60 cells poly', note: 'Voc 38.5 V, Isc 9.40 A, Vmp 31.5 V, Imp 8.89 A', model: { cells: 60, voc: 38.5, isc: 9.40, vmp: 31.5, imp: 8.89, kIsc: 0.0005, kVoc: -0.0031 } },
  { name: '410 Wp, 108 half-cells mono', note: 'Voc 37.4 V, Isc 13.9 A, Vmp 31.3 V, Imp 13.1 A', model: { cells: 54, voc: 37.4, isc: 13.9, vmp: 31.3, imp: 13.1, kIsc: 0.00048, kVoc: -0.0027 } },
  { name: '550 Wp, 144 half-cells mono', note: 'Voc 49.6 V, Isc 14.0 A, Vmp 41.6 V, Imp 13.2 A', model: { cells: 72, voc: 49.6, isc: 14.0, vmp: 41.6, imp: 13.2, kIsc: 0.00048, kVoc: -0.0027 } },
];

/** Single-diode PV model at 25 °C fitted to Voc, Isc and the maximum power point: the diode
 *  ideality n (per cell) and series resistance Rs are chosen so that the curve passes through
 *  (Vmp, Imp) with dP/dV = 0 there; Rsh = 50 Ω per cell (typical shunt of crystalline cells). */
export function pvFit(m: PvModel): { n: number; rs: number; rsh: number; is: number } {
  const vt = (1.38064852e-23 * 298.15) / 1.6021766208e-19, rsh = 50 * m.cells;
  const at = (n: number) => {
    const a = n * m.cells * vt;
    const is = (m.isc - m.voc / rsh) / (Math.exp(m.voc / a) - 1);
    // Imp = Isc − Is(e^((Vmp + Imp·Rs)/a) − 1) − (Vmp + Imp·Rs)/Rsh, solved for Rs by bisection
    const f = (rs: number) => m.isc - is * (Math.exp((m.vmp + m.imp * rs) / a) - 1) - (m.vmp + m.imp * rs) / rsh - m.imp;
    let lo = 0, hi = 2;
    for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
    const rs = (lo + hi) / 2;
    // dI/dV of the model at the MPP, from the implicit equation
    const e = (is / a) * Math.exp((m.vmp + m.imp * rs) / a) + 1 / rsh;
    const dIdV = -e / (1 + e * rs);
    return { is, rs, dPdV: m.imp + m.vmp * dIdV, f0: f(0) };
  };
  // the largest n with a positive Rs (above it the curve cannot reach Imp at Vmp) …
  let lo = 0.8, hi = 3;
  for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2; if (at(mid).f0 > 0) lo = mid; else hi = mid; }
  // … and below it the n where the maximum power point lies at Vmp (dP/dV rises with n)
  hi = lo; lo = 0.8;
  for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2; if (at(mid).dPdV > 0) hi = mid; else lo = mid; }
  const n = (lo + hi) / 2, r = at(n);
  return { n, rs: r.rs, rsh, is: r.is };
}

/** Tapped autotransformers (core and winding): rated power, the tap voltages at nominal flux
 *  (the common N end is 0 V), magnetising current about 2 % of the rated current. */
export interface AutoTransformerModel { va: number; taps: number[]; f: number }
export const AUTOTRANSFORMERS: NamedModel<AutoTransformerModel>[] = [
  { name: '1 kVA 230 V, taps 150–280 V', note: 'toroidal autotransformer for a relay-switched stabiliser: taps 150, 170, 190, 210, 230, 250, 280 V', model: { va: 1000, taps: [150, 170, 190, 210, 230, 250, 280], f: 50 } },
  { name: '5 kVA 230 V, taps 150–280 V', note: 'as above, 5 kVA', model: { va: 5000, taps: [150, 170, 190, 210, 230, 250, 280], f: 50 } },
];

/** Half-bridge gate drivers: one input, high and low outputs with a fixed dead time. */
export const GATE_DRIVERS: NamedModel<{ ron: number; dead: number; vbmax: number }>[] = [
  { name: 'IR2184-type 600 V', note: 'half-bridge driver, 600 V bootstrap, 1.4/1.8 A, 0.5 µs dead time, input IN (HO follows it, LO the inverse)', model: { ron: 10, dead: 0.5e-6, vbmax: 600 } },
];

/** Power semiconductors for inverters and chargers (datasheet ratings). */
export const POWER_MOSFETS: NamedModel<MosModel>[] = [
  // RDS(on) = 1/(KP·(VGS − VTO)) at VGS = 10 V; capacitances from the datasheet Ciss, Coss and
  // Crss (typical, at the datasheet test voltage; the real ones fall as the voltage rises)
  { name: 'IRFP4468', note: 'N-channel 100 V / 195 A (TO-247), RDS(on) ≈ 2.0 mΩ: 24–48 V inverter and charger bridges (approximate level-1 model)', model: { type: 'nmos', vto: 3.0, kp: 71, lambda: 0.002, w: 1, l: 1, is: 1e-11, cgs: 19460e-12, cgd: 520e-12, cds: 530e-12 } },
  { name: 'IRFP4110', note: 'N-channel 100 V / 120 A (TO-247), RDS(on) ≈ 3.7 mΩ (approximate level-1 model)', model: { type: 'nmos', vto: 3.0, kp: 39, lambda: 0.002, w: 1, l: 1, is: 1e-11, cgs: 9370e-12, cgd: 250e-12, cds: 420e-12 } },
  { name: 'IRFP4668', note: 'N-channel 200 V / 130 A (TO-247), RDS(on) ≈ 8 mΩ: PV chargers up to 150 V Voc with surge margin (approximate level-1 model)', model: { type: 'nmos', vto: 3.0, kp: 17.9, lambda: 0.002, w: 1, l: 1, is: 1e-11, cgs: 10560e-12, cgd: 160e-12, cds: 650e-12 } },
  { name: 'IRFB4115', note: 'N-channel 150 V / 104 A (TO-220), RDS(on) ≈ 9.3 mΩ (approximate level-1 model)', model: { type: 'nmos', vto: 3.0, kp: 15.4, lambda: 0.002, w: 1, l: 1, is: 1e-11, cgs: 5165e-12, cgd: 105e-12, cds: 385e-12 } },
  { name: 'IPW65R041', note: 'N-channel 650 V / 68 A superjunction (TO-247), RDS(on) ≈ 41 mΩ: 400 V bus bridges (approximate level-1 model)', model: { type: 'nmos', vto: 3.5, kp: 3.8, lambda: 0.002, w: 1, l: 1, is: 1e-11, cgs: 8380e-12, cgd: 20e-12, cds: 230e-12 } },
];
MOSFETS.push(...POWER_MOSFETS);

// IGBT modules for 400 V three-phase inverters (DC bus 650–700 V): one switch of a half-bridge
// module, VCE(sat) ≈ 1.75 V at the rated current with VGE = 15 V
const module = (a: number): NamedModel<IgbtModel> => ({
  name: `Module 1200 V ${a} A`, note: `one switch (with its anti-parallel diode) of a 1200 V / ${a} A half-bridge IGBT module; VCE(sat) ≈ 1.75 V, VGE(th) ≈ 5.8 V`,
  model: { vto: 5.8, kp: Number((a / 2 / (1.05 * (9.2 - 0.525))).toFixed(3)), bf: 1, is: 1e-10 * (a / 40), diode: { is: 1e-9 * (a / 40), n: 1.5, rs: 0.8 / a } },
});
IGBTS.push(module(100), module(200), module(450));
