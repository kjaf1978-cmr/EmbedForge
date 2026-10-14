// Reference circuit suite for SIM-04: each case is simulated by the built-in engine and by
// ngspice (tests/sim.ngspice.test.ts), and the results must agree within 1 % or 1 mV / 1 µA.

import type { BjtModel, Circuit, DiodeModel, MosModel } from './circuit';
import type { Analysis } from './spice';

export const D1N4148: DiodeModel = { is: 2.52e-9, n: 1.752, rs: 0.568 };
export const LED_RED: DiodeModel = { is: 1.0e-19, n: 1.9, rs: 5, xti: 3, eg: 2.42 };
export const ZENER_5V1: DiodeModel = { is: 1e-14, n: 1, rs: 1, bv: 5.1, ibv: 5e-3 };
export const Q2N3904: BjtModel = { type: 'npn', is: 6.734e-15, bf: 416.4, br: 0.7371, nf: 1, nr: 1, vaf: 74.03 };
export const Q2N3906: BjtModel = { type: 'pnp', is: 1.41e-15, bf: 180.7, br: 4.977, nf: 1, nr: 1, vaf: 18.7 };
export const M2N7000: MosModel = { type: 'nmos', vto: 2.1, kp: 0.1, lambda: 0.01, w: 1, l: 1, is: 1e-14 };
export const MPMOS: MosModel = { type: 'pmos', vto: -2, kp: 0.05, lambda: 0.01, w: 1, l: 1, is: 1e-14 };

export interface RefCase {
  id: string;
  circuit: Circuit;
  analysis: Analysis;
  /** Nodes (voltages) compared. */
  nodes: string[];
  /** Element branch currents compared: voltage sources and inductors (ngspice i(name)). */
  currents?: string[];
}

export const REFERENCE: RefCase[] = [
  {
    id: 'divider-op',
    circuit: { elements: [
      { kind: 'V', name: 'V1', p: 'in', n: '0', dc: 12 },
      { kind: 'R', name: 'R1', a: 'in', b: 'out', r: 10e3 },
      { kind: 'R', name: 'R2', a: 'out', b: '0', r: 4.7e3 },
    ] },
    analysis: { type: 'op' }, nodes: ['in', 'out'], currents: ['V1'],
  },
  {
    id: 'led-op',
    circuit: { elements: [
      { kind: 'V', name: 'V1', p: 'vcc', n: '0', dc: 5 },
      { kind: 'R', name: 'R1', a: 'vcc', b: 'a', r: 330 },
      { kind: 'D', name: 'D1', a: 'a', k: '0', model: LED_RED },
    ] },
    analysis: { type: 'op' }, nodes: ['a'], currents: ['V1'],
  },
  {
    id: 'zener-dc',
    circuit: { elements: [
      { kind: 'V', name: 'V1', p: 'in', n: '0', dc: 0 },
      { kind: 'R', name: 'R1', a: 'in', b: 'z', r: 470 },
      { kind: 'D', name: 'D1', a: '0', k: 'z', model: ZENER_5V1 },
    ] },
    analysis: { type: 'dc', source: 'V1', start: 0, stop: 12, step: 0.5 }, nodes: ['z'], currents: ['V1'],
  },
  {
    id: 'npn-switch-dc',
    circuit: { elements: [
      { kind: 'V', name: 'VCC', p: 'vcc', n: '0', dc: 5 },
      { kind: 'V', name: 'VIN', p: 'in', n: '0', dc: 0 },
      { kind: 'R', name: 'RB', a: 'in', b: 'b', r: 10e3 },
      { kind: 'R', name: 'RC', a: 'vcc', b: 'c', r: 1e3 },
      { kind: 'Q', name: 'Q1', c: 'c', b: 'b', e: '0', model: Q2N3904 },
    ] },
    analysis: { type: 'dc', source: 'VIN', start: 0, stop: 5, step: 0.1 }, nodes: ['b', 'c'], currents: ['VCC'],
  },
  {
    id: 'pnp-op',
    circuit: { elements: [
      { kind: 'V', name: 'VCC', p: 'vcc', n: '0', dc: 9 },
      { kind: 'R', name: 'RB', a: 'b', b: '0', r: 47e3 },
      { kind: 'R', name: 'RC', a: 'c', b: '0', r: 2.2e3 },
      { kind: 'R', name: 'RE', a: 'vcc', b: 'e', r: 1e3 },
      { kind: 'Q', name: 'Q1', c: 'c', b: 'b', e: 'e', model: Q2N3906 },
    ] },
    analysis: { type: 'op' }, nodes: ['b', 'c', 'e'], currents: ['VCC'],
  },
  {
    id: 'ce-amplifier-ac',
    circuit: { elements: [
      { kind: 'V', name: 'VCC', p: 'vcc', n: '0', dc: 12 },
      { kind: 'V', name: 'VS', p: 'src', n: '0', dc: 0, acMag: 1 },
      { kind: 'C', name: 'C1', a: 'src', b: 'b', c: 10e-6 },
      { kind: 'R', name: 'R1', a: 'vcc', b: 'b', r: 47e3 },
      { kind: 'R', name: 'R2', a: 'b', b: '0', r: 10e3 },
      { kind: 'R', name: 'RC', a: 'vcc', b: 'c', r: 4.7e3 },
      { kind: 'R', name: 'RE', a: 'e', b: '0', r: 1e3 },
      { kind: 'C', name: 'CE', a: 'e', b: '0', c: 100e-6 },
      { kind: 'C', name: 'C2', a: 'c', b: 'out', c: 10e-6 },
      { kind: 'R', name: 'RL', a: 'out', b: '0', r: 10e3 },
      { kind: 'Q', name: 'Q1', c: 'c', b: 'b', e: 'e', model: Q2N3904 },
    ] },
    analysis: { type: 'ac', perDecade: 10, fstart: 10, fstop: 1e6 }, nodes: ['out', 'b'],
  },
  {
    id: 'rc-lowpass-ac',
    circuit: { elements: [
      { kind: 'V', name: 'V1', p: 'in', n: '0', dc: 0, acMag: 1 },
      { kind: 'R', name: 'R1', a: 'in', b: 'out', r: 1e3 },
      { kind: 'C', name: 'C1', a: 'out', b: '0', c: 100e-9 },
    ] },
    analysis: { type: 'ac', perDecade: 20, fstart: 10, fstop: 1e6 }, nodes: ['out'],
  },
  {
    id: 'rc-step-tran',
    circuit: { elements: [
      { kind: 'V', name: 'V1', p: 'in', n: '0', dc: 0, wave: { type: 'pulse', v1: 0, v2: 5, td: 1e-4, tr: 1e-6, tf: 1e-6, pw: 4e-3, per: 1e-2 } },
      { kind: 'R', name: 'R1', a: 'in', b: 'out', r: 1e3 },
      { kind: 'C', name: 'C1', a: 'out', b: '0', c: 1e-6 },
    ] },
    analysis: { type: 'tran', tstep: 1e-5, tstop: 8e-3 }, nodes: ['out'], currents: ['V1'],
  },
  {
    id: 'rc-uic-tran',
    circuit: { elements: [
      { kind: 'V', name: 'V1', p: 'in', n: '0', dc: 5 },
      { kind: 'R', name: 'R1', a: 'in', b: 'out', r: 10e3 },
      { kind: 'C', name: 'C1', a: 'out', b: '0', c: 1e-6 },
      { kind: 'L', name: 'L1', a: 'out', b: 'x', l: 1e-3 },
      { kind: 'R', name: 'R2', a: 'x', b: '0', r: 1e4 },
    ] },
    analysis: { type: 'tran', tstep: 1e-4, tstop: 50e-3, uic: true }, nodes: ['out'],
  },
  {
    id: 'rlc-ring-tran',
    circuit: { elements: [
      { kind: 'V', name: 'V1', p: 'in', n: '0', dc: 0, wave: { type: 'pulse', v1: 0, v2: 1, td: 0, tr: 1e-7, tf: 1e-7, pw: 1, per: 2 } },
      { kind: 'R', name: 'R1', a: 'in', b: 'm', r: 10 },
      { kind: 'L', name: 'L1', a: 'm', b: 'out', l: 1e-3 },
      { kind: 'C', name: 'C1', a: 'out', b: '0', c: 1e-6 },
    ] },
    analysis: { type: 'tran', tstep: 1e-6, tstop: 1e-3 }, nodes: ['out'], currents: ['L1'],
  },
  {
    id: 'half-wave-rectifier-tran',
    circuit: { elements: [
      { kind: 'V', name: 'V1', p: 'in', n: '0', dc: 0, wave: { type: 'sin', vo: 0, va: 10, freq: 50 } },
      { kind: 'D', name: 'D1', a: 'in', k: 'out', model: D1N4148 },
      { kind: 'C', name: 'C1', a: 'out', b: '0', c: 100e-6 },
      { kind: 'R', name: 'RL', a: 'out', b: '0', r: 1e3 },
    ] },
    analysis: { type: 'tran', tstep: 2e-5, tstop: 60e-3 }, nodes: ['out'],
  },
  {
    id: 'nmos-switch-dc',
    circuit: { elements: [
      { kind: 'V', name: 'VDD', p: 'vdd', n: '0', dc: 12 },
      { kind: 'V', name: 'VG', p: 'g', n: '0', dc: 0 },
      { kind: 'R', name: 'RD', a: 'vdd', b: 'd', r: 100 },
      { kind: 'M', name: 'M1', d: 'd', g: 'g', s: '0', model: M2N7000 },
    ] },
    analysis: { type: 'dc', source: 'VG', start: 0, stop: 5, step: 0.1 }, nodes: ['d'], currents: ['VDD'],
  },
  {
    id: 'pmos-high-side-dc',
    circuit: { elements: [
      { kind: 'V', name: 'VDD', p: 'vdd', n: '0', dc: 5 },
      { kind: 'V', name: 'VG', p: 'g', n: '0', dc: 5 },
      { kind: 'M', name: 'M1', d: 'out', g: 'g', s: 'vdd', model: MPMOS },
      { kind: 'R', name: 'RL', a: 'out', b: '0', r: 220 },
    ] },
    analysis: { type: 'dc', source: 'VG', start: 0, stop: 5, step: 0.1 }, nodes: ['out'], currents: ['VDD'],
  },
  {
    id: 'opamp-noninverting-tran',
    circuit: { elements: [
      { kind: 'V', name: 'VP', p: 'vp', n: '0', dc: 12 },
      { kind: 'V', name: 'VN', p: 'vn', n: '0', dc: -12 },
      { kind: 'V', name: 'VIN', p: 'in', n: '0', dc: 0, wave: { type: 'sin', vo: 0, va: 2, freq: 1e3 } },
      // EF_OPAMP macro model (see eda/models.ts), flattened
      { kind: 'R', name: 'RIN', a: 'in', b: 'inv', r: 10e6 },
      { kind: 'G', name: 'G1', p: '0', n: 'n1', cp: 'in', cn: 'inv', gm: 1e-3 },
      { kind: 'R', name: 'R1', a: 'n1', b: '0', r: 1e8 },
      { kind: 'C', name: 'C1', a: 'n1', b: '0', c: 1.5915e-10 },
      { kind: 'V', name: 'VH', p: 'vp', n: 'nh2', dc: 2 },
      { kind: 'D', name: 'DH', a: 'n1', k: 'nh2', model: { is: 1e-15, n: 1, rs: 0 } },
      { kind: 'V', name: 'VL', p: 'nl2', n: 'vn', dc: 2 },
      { kind: 'D', name: 'DL', a: 'nl2', k: 'n1', model: { is: 1e-15, n: 1, rs: 0 } },
      { kind: 'E', name: 'EO', p: 'oi', n: '0', cp: 'n1', cn: '0', gain: 1 },
      { kind: 'R', name: 'RO', a: 'oi', b: 'out', r: 50 },
      // gain 1 + 47k/10k = 5.7 → clips at the rails
      { kind: 'R', name: 'RF', a: 'out', b: 'inv', r: 47e3 },
      { kind: 'R', name: 'RG', a: 'inv', b: '0', r: 10e3 },
      { kind: 'R', name: 'RL', a: 'out', b: '0', r: 10e3 },
    ] },
    analysis: { type: 'tran', tstep: 2e-6, tstop: 2e-3 }, nodes: ['out', 'inv'],
  },
  {
    id: 'transformer-tran',
    circuit: { elements: [
      { kind: 'V', name: 'VIN', p: 'in', n: '0', dc: 0, wave: { type: 'sin', vo: 0, va: 10, freq: 50 } },
      { kind: 'R', name: 'RP', a: 'in', b: 'p', r: 1 },
      { kind: 'L', name: 'LP', a: 'p', b: '0', l: 1 },
      { kind: 'L', name: 'LS', a: 's', b: '0', l: 0.01 },
      { kind: 'K', name: 'K1', l1: 'LP', l2: 'LS', k: 0.99 },
      { kind: 'R', name: 'RL', a: 's', b: '0', r: 100 },
    ] },
    analysis: { type: 'tran', tstep: 50e-6, tstop: 60e-3 }, nodes: ['s', 'p'], currents: ['VIN'],
  },
  {
    id: 'transformer-ac',
    circuit: { elements: [
      { kind: 'V', name: 'VIN', p: 'in', n: '0', dc: 0, acMag: 1 },
      { kind: 'R', name: 'RP', a: 'in', b: 'p', r: 10 },
      { kind: 'L', name: 'LP', a: 'p', b: '0', l: 10e-3 },
      { kind: 'L', name: 'LS', a: 's', b: '0', l: 40e-3 },
      { kind: 'K', name: 'K1', l1: 'LP', l2: 'LS', k: 0.95 },
      { kind: 'R', name: 'RL', a: 's', b: '0', r: 1e3 },
    ] },
    analysis: { type: 'ac', perDecade: 10, fstart: 10, fstop: 100e3 }, nodes: ['s', 'p'],
  },
  {
    id: 'relay-coil-dc-sweep',
    circuit: { elements: [
      { kind: 'V', name: 'VC', p: 'c', n: '0', dc: 0 },
      { kind: 'V', name: 'VS', p: 'c', n: 'a', dc: 0 },
      { kind: 'R', name: 'RC', a: 'a', b: 'b', r: 70 },
      { kind: 'L', name: 'LC', a: 'b', b: '0', l: 0.14 },
      { kind: 'V', name: 'VCOM', p: 'com', n: '0', dc: 12 },
      { kind: 'W', name: 'WNO', p: 'com', n: 'no', ctrl: 'VS', it: 0.5 * 5 / 70, ih: 0.25 * 5 / 70, ron: 0.05, roff: 1e9 },
      { kind: 'W', name: 'WNC', p: 'com', n: 'nc', ctrl: 'VS', it: 0.5 * 5 / 70, ih: 0.25 * 5 / 70, ron: 1e9, roff: 0.05 },
      { kind: 'R', name: 'RNO', a: 'no', b: '0', r: 1e3 },
      { kind: 'R', name: 'RNC', a: 'nc', b: '0', r: 1e3 },
    ] },
    // pull-in at 3.75 V: the points step past it, never onto it
    analysis: { type: 'dc', source: 'VC', start: 0, stop: 5, step: 0.2 }, nodes: ['no', 'nc'], currents: ['VS'],
  },
  {
    id: 'current-source-op',
    circuit: { elements: [
      { kind: 'I', name: 'I1', p: '0', n: 'a', dc: 2e-3 },
      { kind: 'R', name: 'R1', a: 'a', b: '0', r: 2.2e3 },
      { kind: 'D', name: 'D1', a: 'a', k: 'b', model: D1N4148 },
      { kind: 'R', name: 'R2', a: 'b', b: '0', r: 1e3 },
    ] },
    analysis: { type: 'op' }, nodes: ['a', 'b'],
  },
];

/** The same circuits at other temperatures (SPICE .temp): semiconductor equations and
 *  resistor temperature coefficients against ngspice's temperature models. */
const AT_TEMP: [string, number][] = [
  ['led-op', -20], ['led-op', 85], ['zener-dc', 85], ['npn-switch-dc', -20], ['npn-switch-dc', 85], ['pnp-op', 85],
  ['ce-amplifier-ac', 85], ['nmos-switch-dc', -20], ['nmos-switch-dc', 85], ['pmos-high-side-dc', 85],
  ['half-wave-rectifier-tran', 85], ['current-source-op', 125],
];
for (const [id, temp] of AT_TEMP) {
  const rc = REFERENCE.find((r) => r.id === id)!;
  REFERENCE.push({ ...rc, id: `${id}@${temp}C`, circuit: { ...rc.circuit, temp } });
}
REFERENCE.push(
  {
    id: 'temperature-coefficients-op@85C',
    circuit: { temp: 85, elements: [
      { kind: 'V', name: 'V1', p: 'in', n: '0', dc: 5 },
      // metal film (+100 ppm/K), carbon film (−500 ppm/K, with a square term)
      { kind: 'R', name: 'R1', a: 'in', b: 'm', r: 10e3, tc1: 100e-6 },
      { kind: 'R', name: 'R2', a: 'm', b: 'k', r: 10e3, tc1: -500e-6, tc2: 1e-6 },
      // a diode with its own XTI and EG (Schottky-like), and one kept at 27 °C (fixedTemp)
      { kind: 'D', name: 'D1', a: 'k', k: 'j', model: { is: 1e-8, n: 1.05, rs: 1, xti: 2, eg: 0.69 } },
      { kind: 'D', name: 'D2', a: 'j', k: '0', model: D1N4148, fixedTemp: true },
      { kind: 'Q', name: 'Q1', c: 'in', b: 'm', e: 'qe', model: { ...Q2N3904, xti: 4, eg: 1.2 } },
      { kind: 'R', name: 'RE', a: 'qe', b: '0', r: 4.7e3 },
    ] },
    analysis: { type: 'op' }, nodes: ['m', 'k', 'j', 'qe'], currents: ['V1'],
  },
);

// devices of the power and installation track (D20)
REFERENCE.push(
  {
    id: 'varistor-dc',
    circuit: { elements: [
      { kind: 'V', name: 'V1', p: 'in', n: '0', dc: 0 },
      { kind: 'R', name: 'R1', a: 'in', b: 'm', r: 100 },
      // a 470 V (1 mA) varistor, α fitted to 775 V at 50 A
      { kind: 'Z', name: 'Z1', a: 'm', b: '0', vn: 470, alpha: 21.6 },
    ] },
    analysis: { type: 'dc', source: 'V1', start: -900, stop: 900, step: 20 }, nodes: ['m'], currents: ['V1'],
  },
  {
    id: 'varistor-surge-tran',
    circuit: { elements: [
      // 1.2/50 µs voltage impulse of 4 kV through 2 Ω (combination-wave source impedance)
      { kind: 'V', name: 'VS', p: 's', n: '0', dc: 0, wave: { type: 'exp', v1: 0, v2: 4148, td1: 0, tau1: 0.405e-6, td2: 0, tau2: 68.2e-6 } },
      { kind: 'R', name: 'RS', a: 's', b: 'm', r: 2 },
      { kind: 'Z', name: 'Z1', a: 'm', b: '0', vn: 470, alpha: 21.6 },
    ] },
    analysis: { type: 'tran', tstep: 0.1e-6, tstop: 100e-6, tmax: 0.1e-6 }, nodes: ['m', 's'], currents: ['VS'],
  },
  {
    id: 'voltage-switch-dc',
    circuit: { elements: [
      { kind: 'V', name: 'VC', p: 'c', n: '0', dc: 0 },
      { kind: 'V', name: 'V1', p: 'a', n: '0', dc: 12 },
      { kind: 'R', name: 'RL', a: 'a', b: 'o', r: 1e3 },
      { kind: 'S', name: 'S1', p: 'o', n: '0', cp: 'c', cn: '0', vt: 2.5, vh: 0.5, ron: 1, roff: 1e9 },
    ] },
    // up and down: hysteresis between 2 V and 3 V; the points step past the thresholds
    analysis: { type: 'dc', source: 'VC', start: 0, stop: 5, step: 0.3 }, nodes: ['o'], currents: ['V1'],
  },
);
