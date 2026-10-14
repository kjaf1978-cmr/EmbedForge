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
];

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
];

/** Level-1 MOSFETs: VTO and KP fitted so that VGS(th) and RDS(on) match the datasheet roughly. */
export const MOSFETS: NamedModel<MosModel>[] = [
  { name: '2N7000', note: 'N-channel small-signal, 60 V / 200 mA (approximate level-1 model)', model: { type: 'nmos', vto: 2.1, kp: 0.1, lambda: 0.01, w: 1, l: 1, is: 1e-14 } },
  { name: 'BS170', note: 'N-channel small-signal, 60 V / 500 mA (approximate level-1 model)', model: { type: 'nmos', vto: 2.0, kp: 0.15, lambda: 0.01, w: 1, l: 1, is: 1e-14 } },
  { name: 'IRLZ44N', note: 'N-channel logic-level power, 55 V / 47 A, RDS(on) ≈ 25 mΩ at 5 V (approximate level-1 model)', model: { type: 'nmos', vto: 1.6, kp: 12, lambda: 0.005, w: 1, l: 1, is: 1e-12 } },
  { name: 'BS250', note: 'P-channel small-signal, 45 V / 230 mA (approximate level-1 model)', model: { type: 'pmos', vto: -2.0, kp: 0.05, lambda: 0.01, w: 1, l: 1, is: 1e-14 } },
  { name: 'IRF9540N', note: 'P-channel power, 100 V / 23 A, RDS(on) ≈ 0.12 Ω at 10 V (approximate level-1 model)', model: { type: 'pmos', vto: -3, kp: 1.2, lambda: 0.005, w: 1, l: 1, is: 1e-12 } },
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
