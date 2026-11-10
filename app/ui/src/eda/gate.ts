// P9 (D25): an electrically operated gate (sliding or swing, one 24 V DC gear motor up to about
// 100 W) with an infrared remote command. The microcontroller board (D24: simulated with the
// board emulation of Increment 4) decodes the remote (a TSOP38238 38 kHz receiver on its own
// filtered 5 V) and sequences open / stop / close; everything that keeps the gate safe is discrete
// and simulated here, and works whatever the firmware does:
// - direction: two SPDT power relays (24 V coil, 30 A contacts). Released, both motor terminals
//   sit on the switch node: the motor is shorted, a brake. Both energised: both terminals on 24 V,
//   no current, so no command can short the supply;
// - on/off: an IRLZ44N in the switch node's return, a 0.01 Ω shunt, an MBR20100CT freewheel diode
//   to 24 V and an SMAJ33A at each motor terminal (long motor cables);
// - the open and close limit switches (NC, opened by the gate at its end) in series with their
//   relay's coil, and the photo-beam's NC contact in series with the close relay's coil: the end
//   stops and the beam stop the motor in hardware;
// - a latching cut-off (LM393): a short circuit (above 25 A, within microseconds) or an obstacle
//   (above 7 A for about 0.1 s, blanked for the first 0.5 s of a run, the motor's start) turns the
//   MOSFET off and tells the microcontroller, which clears it (CLR) and reverses briefly. It also
//   trips itself at power-up: the motor cannot move until the firmware has cleared it.
// Supply: 24 V 150 W DIN-rail supply (fused), a 7805 for the 5 V logic.

import { NB } from './powerExamples';
import type { Sheet } from './schematic';

export interface GateOptions {
  /** The firmware's commands (s): a relay energised from `open` / `close`, the MOSFET from
   *  `run` (each until `stopAt`), CLR pulsed at `clrAt`. */
  open?: number; close?: number; run?: number; stopAt?: number; clrAt?: number;
  /** The field: the open limit switch opens at `limitAt` (the gate reached its end), the beam is
   *  broken at `beamAt`, an obstacle stops the gate at `obstacleAt`, the motor cable shorted at
   *  `shortAt`. */
  limitAt?: number; beamAt?: number; obstacleAt?: number; shortAt?: number;
  stop?: string;
}

// the firmware's outputs (5 V): a pulse from `at` to `to` (or none)
const cmd = (at: number | undefined, to: number) => at === undefined ? { value: '0', low: '0', freq: '1', duty: '0', delay: '0', edge: '1u' } : { value: '5', low: '0', freq: '0.01', duty: String(Math.max(0, to - at) * 1), delay: String(at), edge: '1u' };
// a contact of the field that opens at `at` (a bench MOSFET on the 24 V side: its gate at 34 V
// until then)
const opens = (at: number | undefined) => ({ value: '34', low: '0', freq: '0.01', duty: at === undefined ? '100' : String(at * 1), delay: '0', edge: '1u' });

export function gateController(o: GateOptions = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const stopAt = o.stopAt ?? 10;
  nb.para('GATE CONTROLLER, motor drive and protections: 24 V DC gear motor (2.6 A running, 12 A stalled). Direction by two SPDT relays (released: motor shorted, braking); IRLZ44N on/off with freewheel diode; limit switches and photo-beam in the relay coils (hardware stops); latching cut-off for short circuit (25 A) and obstacle (7 A for 0.1 s after a 0.5 s start blanking), tripped at power-up until the microcontroller clears it. IR receiver TSOP38238 and decoding on the microcontroller board.', -1200, -300);

  // ---- test bench: the supply, the microcontroller's outputs, the field (switches, beam, motor)
  nb.block('bench').note('TEST BENCH: the 24 V supply, the microcontroller\'s outputs, the field (not part of the board)', -1200, -150)
    .part('V24', 'battery', -1150, 0, { value: '24', rint: '0.05' }, { '1': 'V24', '2': 'GND' }, 1)
    .part('VOP', 'vpulse', -1050, 0, cmd(o.open, stopAt), { '1': 'OPEN', '2': 'GND' })
    .part('VCLS', 'vpulse', -950, 0, cmd(o.close, stopAt), { '1': 'CLOSE', '2': 'GND' })
    .part('VRUN', 'vpulse', -850, 0, cmd(o.run, stopAt), { '1': 'RUN', '2': 'GND' })
    .part('VCLR', 'vpulse', -750, 0, cmd(o.clrAt, (o.clrAt ?? 0) + 0.002), { '1': 'CLR', '2': 'GND' })
    // the limit switches and the beam's contact as MOSFETs (closed until they open)
    .part('VLO', 'vpulse', -1050, 200, opens(o.limitAt), { '1': 'GLO', '2': 'GND' })
    .part('SLO', 'nmos', -950, 200, { value: 'IRLZ44N' }, { '1': 'GLO', '2': 'V24F', '3': 'LSO' })
    .part('SLC', 'switch', -850, 200, { closed: 'true' }, { '1': 'V24F', '2': 'LSC' })
    .part('VBM', 'vpulse', -1050, 350, opens(o.beamAt), { '1': 'GBM', '2': 'GND' })
    .part('SBM', 'nmos', -950, 350, { value: 'IRLZ44N' }, { '1': 'GBM', '2': 'LSC', '3': 'BMC' })
    // the motor: 24 V, 3000 rpm no load, 2 Ω, 2 mH; the gate's inertia and friction through the
    // gearbox (2.6 A running)
    .part('M1', 'dcmotor', -700, 400, { value: '0.07', ra: '2', la: '2m', j: '3e-4', b: '6.7e-4', ...(o.obstacleAt !== undefined ? { obstacle: String(o.obstacleAt) } : {}) }, { '1': 'MA', '2': 'MB', '3': 'SPD' });
  if (o.shortAt !== undefined) nb.part('VSH', 'vpulse', -600, 400, { value: '10', low: '0', freq: '0.01', duty: '90', delay: String(o.shortAt), edge: '1u' }, { '1': 'GSH', '2': 'GND' })
    .part('QSH', 'nmos', -500, 400, { value: 'IRLZ44N' }, { '1': 'GSH', '2': 'MA', '3': 'MB' });

  // ---- supply: 5 V for the logic (the microcontroller board has its own 3.3 V)
  nb.block('supply')
    .part('XP', 'terminal', 0, -100, { value: '+24 V' }, { '1': 'V24' })
    .part('XN', 'terminal', 0, 0, { value: '0 V' }, { '1': 'GND' })
    .part('F1', 'fuse', 100, -100, { value: '10' }, { '1': 'V24', '2': 'V24F' })
    .part('DT0', 'tvs', 200, 0, { value: 'SMAJ33A' }, { '1': 'V24F', '2': 'GND' }, 1)
    .part('C0', 'capacitor_pol', 300, 0, { value: '470u', vmax: '50' }, { '1': 'V24F', '2': 'GND' }, 1)
    .part('U1', 'regulator', 400, -100, { value: '7805' }, { '1': 'V24F', '2': 'GND', '3': 'V5' })
    .part('C1', 'capacitor', 500, 0, { value: '100n', vmax: '50' }, { '1': 'V24F', '2': 'GND' }, 1)
    .part('C2', 'capacitor_pol', 600, 0, { value: '47u', vmax: '16' }, { '1': 'V5', '2': 'GND' }, 1);

  // ---- direction relays: coils through the limit switches (and the beam), driven by BC547B
  // from the microcontroller; contacts: COM to the motor, NO to 24 V, NC to the switch node
  nb.block('relays')
    .part('XLO', 'terminal', 0, 200, { value: 'open limit (NC)' }, { '1': 'LSO' })
    // the close limit and the beam's contact in series in the field: one return to the board
    .part('XBM', 'terminal', 0, 400, { value: 'close limit and photo-beam (NC, in series)' }, { '1': 'BMC' })
    .part('XLV', 'terminal', 0, 500, { value: 'limit / beam common +24 V' }, { '1': 'V24F' })
    .part('KO', 'relay', 200, 250, { value: '24 V 30 A' }, { '1': 'LSO', '2': 'KOC', '3': 'MA', '4': 'SW', '5': 'V24F' })
    .part('DKO', 'diode', 150, 350, { value: '1N4148' }, { '2': 'KOC', '1': 'LSO' }, 3)
    .part('RBO', 'resistor', 300, 450, { value: '10k' }, { '1': 'OPEN', '2': 'BO' })
    .part('RBOD', 'resistor', 300, 550, { value: '47k' }, { '1': 'BO', '2': 'GND' }, 1)
    .part('QO', 'npn', 400, 450, { value: 'BC547B' }, { '1': 'BO', '2': 'KOC', '3': 'GND' })
    .part('KC', 'relay', 500, 250, { value: '24 V 30 A' }, { '1': 'BMC', '2': 'KCC', '3': 'MB', '4': 'SW', '5': 'V24F' })
    .part('DKC', 'diode', 450, 350, { value: '1N4148' }, { '2': 'KCC', '1': 'BMC' }, 3)
    .part('RBC', 'resistor', 600, 450, { value: '10k' }, { '1': 'CLOSE', '2': 'BC' })
    .part('RBCD', 'resistor', 600, 550, { value: '47k' }, { '1': 'BC', '2': 'GND' }, 1)
    .part('QC', 'npn', 700, 450, { value: 'BC547B' }, { '1': 'BC', '2': 'KCC', '3': 'GND' })
    // the limit switches and the beam to the microcontroller (24 V → 4.2 V; 0 V: at the end / broken)
    .part('RLO1', 'resistor', 800, 200, { value: '47k' }, { '1': 'LSO', '2': 'LOI' })
    .part('RLO2', 'resistor', 800, 300, { value: '10k' }, { '1': 'LOI', '2': 'GND' }, 1)
    .part('RLC1', 'resistor', 900, 200, { value: '47k' }, { '1': 'BMC', '2': 'LCI' })
    .part('RLC2', 'resistor', 900, 300, { value: '10k' }, { '1': 'LCI', '2': 'GND' }, 1)
    .part('XM1', 'terminal', 1000, 200, { value: 'motor 1' }, { '1': 'MA' })
    .part('XM2', 'terminal', 1000, 300, { value: 'motor 2' }, { '1': 'MB' })
    .part('DTA', 'tvs', 1100, 350, { value: 'SMAJ33A' }, { '1': 'MA', '2': 'GND' }, 1)
    .part('DTB', 'tvs', 1200, 350, { value: 'SMAJ33A' }, { '1': 'MB', '2': 'GND' }, 1);

  // ---- on/off: IRLZ44N, gate from RUN through 1k (the cut-off's clamp sinks 5 mA at most)
  nb.block('switch')
    .part('DFW', 'diode', 200, 650, { value: 'MBR20100CT' }, { '2': 'SW', '1': 'V24F' }, 3)
    .part('RGM', 'resistor', 300, 750, { value: '1k' }, { '1': 'RUN', '2': 'GM' })
    .part('RGMD', 'resistor', 300, 850, { value: '10k' }, { '1': 'GM', '2': 'GND' }, 1)
    .part('QM', 'nmos', 400, 750, { value: 'IRLZ44N' }, { '1': 'GM', '2': 'SW', '3': 'SRET' })
    .part('DGF', 'diode', 400, 650, { value: 'BAT54' }, { '2': 'GM', '1': 'FCL' })
    .part('RSH', 'resistor', 500, 850, { value: '0.01', pmax: '3' }, { '1': 'SRET', '2': 'GND' }, 1);

  // ---- the cut-off: A (short circuit, 0.25 V = 25 A) and B (obstacle, 0.07 V = 7 A, filtered
  // 0.1 s, blanked 0.5 s from RUN) open-collector onto FLTN; FLTN low switches QFL on: FLT high
  // holds A tripped (RLT, DLT), pulls the gate down (QF, DGF) and interrupts the microcontroller
  nb.block('cut-off')
    .part('RSF', 'resistor', 600, 700, { value: '1k' }, { '1': 'SRET', '2': 'SRF' })
    .part('CSF', 'capacitor', 650, 800, { value: '1n', vmax: '50' }, { '1': 'SRF', '2': 'GND' }, 1)
    .part('RSC1', 'resistor', 700, 600, { value: '19.1k' }, { '1': 'V5', '2': 'VSC' }, 1)
    .part('RSC2', 'resistor', 700, 700, { value: '1k' }, { '1': 'VSC', '2': 'GND' }, 1)
    .part('UC', 'comparator', 850, 700, { value: 'LM393', pkg: 'OC' }, { '3': 'VSC', '2': 'SRF', '1': 'FLTN', '8': 'V5', '4': 'GND' })
    .part('RIF', 'resistor', 600, 900, { value: '10k' }, { '1': 'SRET', '2': 'ISF' })
    .part('CIF', 'capacitor', 650, 1000, { value: '10u', vmax: '16' }, { '1': 'ISF', '2': 'GND' }, 1)
    .part('ROB1', 'resistor', 700, 850, { value: '69.8k' }, { '1': 'V5', '2': 'VOB' }, 1)
    .part('ROB2', 'resistor', 700, 950, { value: '1k' }, { '1': 'VOB', '2': 'GND' }, 1)
    .part('UC2', 'comparator', 850, 900, { value: 'LM393', pkg: 'OC' }, { '3': 'VOB', '2': 'ISF', '1': 'FLTN', '8': 'V5', '4': 'GND' })
    // start blanking: RUN's rising edge through CBL and RBS holds ISF at 0 V for about 0.5 s
    .part('CBL', 'capacitor', 500, 1100, { value: '4.7u', vmax: '16' }, { '1': 'RUN', '2': 'BLA' })
    .part('RBS', 'resistor', 600, 1100, { value: '47k' }, { '1': 'BLA', '2': 'BBL' })
    .part('DBL', 'diode', 550, 1200, { value: 'BAT54' }, { '2': 'GND', '1': 'BLA' }, 1)
    .part('RBB', 'resistor', 650, 1200, { value: '100k' }, { '1': 'BBL', '2': 'GND' }, 1)
    .part('QBL', 'npn', 750, 1100, { value: 'BC547B' }, { '1': 'BBL', '2': 'ISF', '3': 'GND' })
    .part('RFP', 'resistor', 950, 600, { value: '10k' }, { '1': 'V5', '2': 'FLTN' }, 1)
    .part('RFB', 'resistor', 1000, 700, { value: '10k' }, { '1': 'FLTN', '2': 'BFL' })
    .part('QFL', 'pnp', 1100, 700, { value: 'BC557B' }, { '1': 'BFL', '2': 'FLT', '3': 'V5' })
    .part('ROF', 'resistor', 1100, 820, { value: '10k' }, { '1': 'FLT', '2': 'GND' }, 1)
    .part('RFQ', 'resistor', 1200, 600, { value: '4.7k' }, { '1': 'FLT', '2': 'BFQ' })
    .part('QF', 'npn', 1300, 600, { value: 'BC547B' }, { '1': 'BFQ', '2': 'FCL', '3': 'GND' })
    .part('RLT', 'resistor', 1200, 750, { value: '10k' }, { '1': 'FLT', '2': 'LTA' })
    .part('DLT', 'diode', 1200, 850, { value: '1N4148' }, { '2': 'LTA', '1': 'SRF' })
    // power-up: the cut-off trips itself (CPOR lifts the latch feed for about 1 ms)
    .part('CPOR', 'capacitor', 1300, 750, { value: '10n', vmax: '50' }, { '1': 'V5', '2': 'POR' })
    .part('RPOR', 'resistor', 1400, 800, { value: '100k' }, { '1': 'POR', '2': 'GND' }, 1)
    .part('DPOR', 'diode', 1350, 700, { value: '1N4148' }, { '2': 'POR', '1': 'LTA' })
    // CLR from the microcontroller releases it
    .part('RCL', 'resistor', 1300, 950, { value: '10k' }, { '1': 'CLR', '2': 'BCL' })
    .part('RCLD', 'resistor', 1300, 1050, { value: '100k' }, { '1': 'CLR', '2': 'GND' }, 1)
    .part('QCL', 'npn', 1400, 950, { value: 'BC547B' }, { '1': 'BCL', '2': 'SRF', '3': 'GND' })
    .part('COC', 'capacitor', 950, 800, { value: '100n', vmax: '50' }, { '1': 'V5', '2': 'GND' }, 1);
  // ---- the microcontroller (D24): an Arduino Nano on sockets (5 V I/O, as the commands above are
  // simulated), on the board's 5 V; the IR receiver (TSOP38238, 38 kHz) on its own filtered 5 V
  // (100 Ω, 4.7 µF), behind the enclosure's window. Not simulated: the bench drives its outputs.
  // FAULT (FLTN) on D2 and the receiver on D3 (the two interrupt pins); OPEN D5, CLOSE D6, CLR D7,
  // RUN D9; the limit and beam inputs on A0, A1
  nb.block('microcontroller')
    .part('UMC', 'nano', 1600, 500, { value: 'Arduino Nano' }, { '4': 'GND', '29': 'GND', '27': 'V5', '5': 'FLTN', '6': 'IRO', '8': 'OPEN', '9': 'CLOSE', '10': 'CLR', '12': 'RUN', '19': 'LOI', '20': 'LCI' })
    .part('RIR', 'resistor', 1450, 900, { value: '100' }, { '1': 'V5', '2': 'VIR' })
    .part('CIR', 'capacitor_pol', 1500, 1000, { value: '4.7u', vmax: '16' }, { '1': 'VIR', '2': 'GND' }, 1)
    .part('UIR', 'irrx', 1650, 950, { value: 'TSOP38238' }, { '3': 'VIR', '2': 'GND', '1': 'IRO' })
    .part('RIRP', 'resistor', 1750, 900, { value: '10k' }, { '1': 'V5', '2': 'IRO' }, 1);
  nb.v('MA').v('MB').v('SW').v('FLTN').v('FLT').v('ISF').v('SRF').v('SPD').v('GM').i('QM', '2').i('M1', '1');
  nb.sim({ type: 'tran', stop: o.stop ?? '2', step: '20u', start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
