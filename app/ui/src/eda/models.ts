// Simulation models of the generic parts (SIM-05). Parameters are typical datasheet-derived
// SPICE values; power MOSFETs use a level-1 approximation fitted to threshold voltage and
// on-resistance, and say so. Every model lists what it is good for.

import type { BjtModel, DiodeModel, MosModel } from '../sim/circuit';
import { TNOM, VT } from '../sim/engine';

export interface NamedModel<T> { name: string; note: string; model: T }

export const DIODES: NamedModel<DiodeModel>[] = [
  { name: '1N4148', note: 'small-signal switching diode, 100 V / 200 mA', model: { is: 2.52e-9, n: 1.752, rs: 0.568, bv: 100, ibv: 100e-6 } },
  { name: '1N4007', note: 'rectifier diode, 1000 V / 1 A', model: { is: 7.03e-9, n: 1.808, rs: 0.0342, bv: 1000, ibv: 5e-6 } },
  { name: '1N5819', note: 'Schottky diode, 40 V / 1 A, low forward voltage', model: { is: 31.7e-6, n: 1.373, rs: 0.051, bv: 40, ibv: 1e-3, xti: 2, eg: 0.69 } },
  // fitted to the datasheet forward curve: 0.32 V at 1 mA, 0.8 V at 100 mA
  { name: 'BAT54', note: 'small-signal Schottky diode, 30 V / 200 mA', model: { is: 9.7e-8, n: 1.34, rs: 3.2, bv: 30, ibv: 2e-6, xti: 2, eg: 0.69 } },
  // 0.5 V at 3 A
  { name: 'SS34', note: 'power Schottky diode, 40 V / 3 A (SMC)', model: { is: 5.5e-6, n: 1.2, rs: 0.03, bv: 40, ibv: 0.5e-3, xti: 2, eg: 0.69 } },
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
];

/** The junction of a TVS: breakdown at VBR with 10 mA, series resistance (VC − VBR)/IPP. */
export function tvsJunction(m: TvsModel, vbr = m.vbr): DiodeModel {
  return { is: 1e-12, n: 1, rs: (m.vc - m.vbr) / m.ipp, bv: vbr, ibv: 10e-3 };
}

export const ZENERS: NamedModel<DiodeModel>[] = ([['BZX55C3V3', 3.3], ['BZX55C4V7', 4.7], ['BZX55C5V1', 5.1], ['BZX55C9V1', 9.1], ['BZX55C12', 12]] as [string, number][])
  .map(([name, v]) => ({ name, note: `Zener diode ${v} V, 500 mW`, model: { is: 1e-14, n: 1, rs: 2, bv: v, ibv: 5e-3 } }));

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
 *  current. `diode`: the co-packed anti-parallel diode from E to C. */
export interface IgbtModel { vto: number; kp: number; bf: number; is: number; diode?: DiodeModel }

export const IGBTS: NamedModel<IgbtModel>[] = [
  { name: 'IKW30N60T', note: 'IGBT 600 V / 30 A with anti-parallel diode, VCE(sat) ≈ 1.5 V, VGE(th) ≈ 4.9 V (TO-247, approximate)', model: { vto: 4.9, kp: 1.89, bf: 1, is: 1e-10, diode: { is: 1e-9, n: 1.5, rs: 0.02 } } },
  { name: 'IKW40N120T2', note: 'IGBT 1200 V / 40 A with anti-parallel diode, VCE(sat) ≈ 1.75 V, VGE(th) ≈ 5.8 V (TO-247, approximate)', model: { vto: 5.8, kp: 2.16, bf: 1, is: 1e-10, diode: { is: 1e-9, n: 1.5, rs: 0.02 } } },
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
  { name: 'TL431', note: 'adjustable shunt regulator, 2.495 V reference, 2.5 to 36 V, 1 to 100 mA', model: { vref: 2.495 } },
  { name: 'TLV431', note: 'low-voltage adjustable shunt regulator, 1.24 V reference, 1.24 to 6 V', model: { vref: 1.24 } },
];

/** Bridge rectifiers: four identical diodes. */
export const BRIDGES: NamedModel<DiodeModel>[] = [
  { name: 'DB107', note: 'bridge rectifier 1000 V / 1 A', model: { is: 7.03e-9, n: 1.808, rs: 0.0342, bv: 1000, ibv: 5e-6 } },
  { name: 'KBP206', note: 'bridge rectifier 600 V / 2 A', model: { is: 1.4e-8, n: 1.8, rs: 0.02, bv: 600, ibv: 5e-6 } },
  { name: 'GBU8K', note: 'bridge rectifier 800 V / 8 A', model: { is: 5e-8, n: 1.8, rs: 0.008, bv: 800, ibv: 5e-6 } },
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
  { name: '7812', note: 'fixed 12 V, 1 A, dropout 2 V', model: { vout: 12, dropout: 2, iq: 5e-3 } },
  { name: 'AMS1117-3.3', note: 'fixed 3.3 V, 1 A low-dropout (1.1 V)', model: { vout: 3.3, dropout: 1.1, iq: 5e-3 } },
  { name: 'AMS1117-5.0', note: 'fixed 5 V, 1 A low-dropout (1.1 V)', model: { vout: 5, dropout: 1.1, iq: 5e-3 } },
  { name: 'MCP1700-3.3', note: 'fixed 3.3 V, 250 mA low-dropout (0.18 V), input up to 6 V', model: { vout: 3.3, dropout: 0.18, iq: 1.6e-6 } },
  { name: 'L78L05', note: 'fixed 5 V, 100 mA (TO-92), dropout 1.7 V', model: { vout: 5, dropout: 1.7, iq: 3e-3 } },
];

export const ADJ_REGULATORS: NamedModel<RegulatorModel>[] = [
  { name: 'LM317', note: 'adjustable, 1.25 V between OUT and ADJ, 1.5 A, dropout about 2 V; Vout = 1.25 V × (1 + R2/R1)', model: { vout: 1.25, dropout: 2, iq: 50e-6, adjustable: true } },
];

/** Relays: coil as resistance and inductance; the contact pulls in at 75 % and drops out at
 *  25 % of the nominal coil current (typical small signal and power relays). */
export interface RelayModel { vcoil: number; rcoil: number; lcoil: number }

export const RELAYS: NamedModel<RelayModel>[] = [
  { name: '5 V', note: '5 V coil, 70 Ω (about 70 mA), changeover contact', model: { vcoil: 5, rcoil: 70, lcoil: 0.14 } },
  { name: '12 V', note: '12 V coil, 400 Ω (30 mA), changeover contact', model: { vcoil: 12, rcoil: 400, lcoil: 0.8 } },
  { name: '24 V', note: '24 V coil, 1.6 kΩ (15 mA), changeover contact', model: { vcoil: 24, rcoil: 1600, lcoil: 3.2 } },
];
