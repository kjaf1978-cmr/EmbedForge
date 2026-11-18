// P9 (D25): an electrically operated gate (sliding or swing, one 24 V DC gear motor up to about
// 100 W) with an infrared remote command. The microcontroller board (D24: simulated with the
// board emulation of Increment 4) decodes the remote (a TSOP38238 38 kHz receiver on its own
// filtered 5 V) and sequences open / stop / close; the end stops, the beam, STOP and the cut-off
// are discrete and simulated here (what they still need from the firmware: DFMEA GC-10, GC-11):
// - direction: two SPDT power relays (24 V coil, 30 A contacts). Released, both motor terminals
//   sit on the switch node: the motor is shorted, a brake. Both energised: both terminals on 24 V,
//   no current, so no command can short the supply;
// - on/off: an IRLZ44N in the switch node's return, a 0.01 Ω shunt, an MBR20100CT freewheel diode
//   to 24 V and an SMAJ33A at each motor terminal (long motor cables);
// - the open and close limit switches (NC, opened by the gate at its end) in series with their
//   relay's coil, and the photo-beam's NC contact in series with the close relay's coil: the end
//   stops and the beam stop the motor in hardware;
// - a latching cut-off (LM393): a short circuit (above 25 A, within microseconds) or an obstacle
//   (above 7 A through a 0.1 s filter: 0.1 s at 12 A, 0.27 s at 7.5 A; blanked for about 0.1 s
//   at each start, the motor's start current) turns the MOSFET off, drops both relays (so a
//   shorted MOSFET cannot keep the motor running) and tells the microcontroller, which clears it
//   (CLR, its rising edge only) and reverses. A power-on reset trips it at power-up: the motor
//   cannot move until the firmware has cleared it.
// Supply: 24 V DIN-rail supply of at least 10 A (240 W) without fold-back up to the stall current
// (the cut-off's 7 A must be reachable), fused 10 A on the board; a 7805 for the 5 V logic.
// After the P9 audit (D47, 18 November 2026): the close limit and the photo-beam each on their own
// terminals and their own input (in series to the close relay's coil as before), so the firmware
// tells "closed" from "beam broken" and reopens on the beam; a LEARN button pairs the remotes.
// After the independent review (18 November 2026, docs/products/P9-gate-controller/REVIEW.md): a
// power-on reset that works with a real supply's rise; CLR by its edge; a trip drops the relays;
// the blanking shortened from about 0.5 s to 0.1 s; a STOP input in the limit switches' feed; the
// photo-beam transmitter's supply switched for a test before each close; a push-button or
// key-switch input; a CUT-OFF indicator.

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
  /** the close limit switch opens at `closeLimitAt`; the STOP button is pressed at `stopPressAt` */
  closeLimitAt?: number; stopPressAt?: number;
  /** CLR held high from `clrAt` (a stuck output) instead of a 2 ms pulse */
  clrStuck?: boolean;
  /** the supply rises over `rampMs` ms (a real DIN-rail supply) instead of a step */
  rampMs?: number;
  /** Q7 (the MOSFET) failed short */
  qmShort?: boolean;
  /** the beam test output (the transmitter's supply) on from `beamTxAt` */
  beamTxAt?: number;
  stop?: string;
}

// the firmware's outputs (5 V): a pulse from `at` to `to` (or none)
const cmd = (at: number | undefined, to: number) => at === undefined ? { value: '0', low: '0', freq: '1', duty: '0', delay: '0', edge: '1u' } : { value: '5', low: '0', freq: '0.01', duty: String(Math.max(0, to - at) * 1), delay: String(at), edge: '1u' };
// a contact of the field that opens at `at` (a bench MOSFET on the 24 V side: its gate at 34 V
// until then)
const opens = (at: number | undefined) => ({ value: '34', low: '0', freq: '0.01', duty: at === undefined ? '100' : String(at * 1), delay: '0', edge: '1u' });

export function gateController(o: GateOptions = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB().wireUp(['V24', 'V24F', 'V5']);
  const stopAt = o.stopAt ?? 10;
  nb.para('GATE CONTROLLER, motor drive and protections: 24 V DC gear motor (2.6 A running, 12 A stalled). Direction by two SPDT relays (released: motor shorted, braking); IRLZ44N on/off with freewheel diode; limit switches and photo-beam in the relay coils (hardware stops); latching cut-off for short circuit (25 A) and obstacle (7 A through a 0.1 s filter after a 0.1 s start blanking), a trip also drops both relays; power-on reset; STOP input; photo-beam tested before each close. IR receiver TSOP38238 and decoding on the microcontroller board.', -1200, -300);

  // ---- test bench: the supply, the microcontroller's outputs, the field (switches, beam, motor)
  nb.block('bench').note('TEST BENCH: the 24 V supply, the microcontroller\'s outputs, the field (not part of the board)', -1200, -150)
    .part('V24', ...(o.rampMs ? ['vpulse', -1150, 0, { value: '24', low: '0', freq: '0.01', duty: '100', delay: '0', edge: String(o.rampMs / 1000) }, { '1': 'V24R', '2': 'GND' }] as const
      : ['battery', -1150, 0, { value: '24', rint: '0.05' }, { '1': 'V24', '2': 'GND' }, 1] as const))
    .part('VOP', 'vpulse', -1050, 0, cmd(o.open, stopAt), { '1': 'OPEN', '2': 'GND' })
    .part('VCLS', 'vpulse', -950, 0, cmd(o.close, stopAt), { '1': 'CLOSE', '2': 'GND' })
    .part('VRUN', 'vpulse', -850, 0, cmd(o.run, stopAt), { '1': 'RUN', '2': 'GND' })
    .part('VCLR', 'vpulse', -750, 0, cmd(o.clrAt, (o.clrAt ?? 0) + (o.clrStuck ? 100 : 0.005)), { '1': 'CLR', '2': 'GND' })
    .part('VTX', 'vpulse', -650, 0, cmd(o.beamTxAt, stopAt), { '1': 'BTX', '2': 'GND' })
    // the STOP button (NC) as a MOSFET, closed until pressed
    .part('VST', 'vpulse', -650, 100, opens(o.stopPressAt), { '1': 'GST', '2': 'GND' })
    .part('SST', 'nmos', -550, 100, { value: 'IRLZ44N' }, { '1': 'GST', '2': 'V24F', '3': 'VLIM' })
    .part('RTXL', 'resistor', -450, 100, { value: '240' }, { '1': 'VTX', '2': 'GND' })
    // the limit switches and the beam's contact as MOSFETs (closed until they open)
    .part('VLO', 'vpulse', -1050, 200, opens(o.limitAt), { '1': 'GLO', '2': 'GND' })
    .part('SLO', 'nmos', -950, 200, { value: 'IRLZ44N' }, { '1': 'GLO', '2': 'VLIM', '3': 'LSO' })
    .part('VLC', 'vpulse', -850, 100, opens(o.closeLimitAt), { '1': 'GLC', '2': 'GND' })
    .part('SLC', 'nmos', -850, 200, { value: 'IRLZ44N' }, { '1': 'GLC', '2': 'VLIM', '3': 'BML' })
    .part('VBM', 'vpulse', -1050, 350, opens(o.beamAt), { '1': 'GBM', '2': 'GND' })
    .part('SBM', 'nmos', -950, 350, { value: 'IRLZ44N' }, { '1': 'GBM', '2': 'BML', '3': 'BMC' })
    // the motor: 24 V, 3000 rpm no load, 2 Ω, 2 mH; the gate's inertia and friction through the
    // gearbox (2.6 A running)
    .part('M1', 'dcmotor', -700, 400, { value: '0.07', ra: '2', la: '2m', j: '3e-4', b: '6.7e-4', ...(o.obstacleAt !== undefined ? { obstacle: String(o.obstacleAt) } : {}) }, { '1': 'MA', '2': 'MB', '3': 'SPD' });
  if (o.rampMs) nb.part('RV24', 'resistor', -1150, 100, { value: '0.05' }, { '1': 'V24R', '2': 'V24' });
  if (o.qmShort) nb.part('RQS', 'resistor', -450, 500, { value: '0.005' }, { '1': 'SW', '2': 'SRET' });
  if (o.shortAt !== undefined) nb.part('VSH', 'vpulse', -600, 400, { value: '10', low: '0', freq: '0.01', duty: '90', delay: String(o.shortAt), edge: '1u' }, { '1': 'GSH', '2': 'GND' })
    .part('QSH', 'nmos', -500, 400, { value: 'IRLZ44N' }, { '1': 'GSH', '2': 'MA', '3': 'MB' });

  // ---- supply: 5 V for the logic (the microcontroller board has its own 3.3 V)
  nb.block('supply')
    .part('XP', 'terminal', 0, -100, { value: '+24 V' }, { '1': 'V24' })
    .part('XN', 'terminal', 0, 0, { value: '0 V' }, { '1': 'GND' })
    .part('F1', 'fuse', 100, -100, { value: '10', r: '0.01' }, { '1': 'V24', '2': 'V24F' })
    .part('DT0', 'tvs', 200, 0, { value: 'SMAJ33A' }, { '1': 'V24F', '2': 'GND' }, 1)
    .part('C0', 'capacitor_pol', 300, 0, { value: '470u', vmax: '50' }, { '1': 'V24F', '2': 'GND' }, 1)
    .part('U1', 'regulator', 400, -100, { value: '7805' }, { '1': 'V24F', '2': 'GND', '3': 'V5' })
    .part('C1', 'capacitor', 500, 0, { value: '100n', vmax: '50' }, { '1': 'V24F', '2': 'GND' }, 1)
    .part('C2', 'capacitor_pol', 600, 0, { value: '47u', vmax: '16' }, { '1': 'V5', '2': 'GND' }, 1);

  // ---- direction relays: coils through the limit switches (and the beam), driven by BC547B
  // from the microcontroller; contacts: COM to the motor, NO to 24 V, NC to the switch node
  nb.block('relays')
    .part('XLO', 'terminal', 0, 200, { value: 'open limit (NC)' }, { '1': 'LSO' })
    // the close limit returns to the board (BML); the board feeds it on to the photo-beam's NC
    // contact (XBI) and takes the beam's return (XBO) to the close relay's coil
    .part('XLC', 'terminal', 0, 350, { value: 'close limit (NC), return' }, { '1': 'BML' })
    .part('XBI', 'terminal', 0, 400, { value: 'photo-beam contact (NC), feed' }, { '1': 'BML' })
    .part('XBO', 'terminal', 0, 450, { value: 'photo-beam contact (NC), return' }, { '1': 'BMC' })
    .part('XLV', 'terminal', 0, 520, { value: 'limit switches common +24 V' }, { '1': 'VLIM' })
    // the STOP button (NC; a link when none is fitted) feeds the limit switches: pressed, both
    // relays drop in hardware
    .part('XST1', 'terminal', 0, 580, { value: 'STOP button (NC), feed' }, { '1': 'V24F' })
    .part('XST2', 'terminal', 0, 640, { value: 'STOP button (NC), return' }, { '1': 'VLIM' })
    .part('KO', 'relay', 200, 250, { value: '24 V 30 A' }, { '1': 'LSO', '2': 'KOC', '3': 'MA', '4': 'SW', '5': 'V24F' })
    .part('DKO', 'diode', 150, 350, { value: '1N4148' }, { '2': 'KOC', '1': 'LSO' }, 3)
    .part('RBO', 'resistor', 300, 450, { value: '10k' }, { '1': 'OPEN', '2': 'BO' })
    .part('RBOD', 'resistor', 300, 550, { value: '47k' }, { '1': 'BO', '2': 'GND' }, 1)
    .part('QO', 'npn', 400, 450, { value: 'BC547B' }, { '1': 'BO', '2': 'KOC', '3': 'GND' })
    .part('DBO', 'diode', 350, 500, { value: 'BAT54' }, { '2': 'BO', '1': 'FCL' }, 1)
    .part('KC', 'relay', 500, 250, { value: '24 V 30 A' }, { '1': 'BMC', '2': 'KCC', '3': 'MB', '4': 'SW', '5': 'V24F' })
    .part('DKC', 'diode', 450, 350, { value: '1N4148' }, { '2': 'KCC', '1': 'BMC' }, 3)
    .part('RBC', 'resistor', 600, 450, { value: '10k' }, { '1': 'CLOSE', '2': 'BC' })
    .part('RBCD', 'resistor', 600, 550, { value: '47k' }, { '1': 'BC', '2': 'GND' }, 1)
    .part('QC', 'npn', 700, 450, { value: 'BC547B' }, { '1': 'BC', '2': 'KCC', '3': 'GND' })
    .part('DBC', 'diode', 650, 500, { value: 'BAT54' }, { '2': 'BC', '1': 'FCL' }, 1)
    // the limit switches and the beam to the microcontroller (24 V → 4.2 V; 0 V: at the end / broken)
    .part('RLO1', 'resistor', 800, 200, { value: '47k' }, { '1': 'LSO', '2': 'LOI' })
    .part('RLO2', 'resistor', 800, 300, { value: '10k' }, { '1': 'LOI', '2': 'GND' }, 1)
    .part('RLC1', 'resistor', 900, 200, { value: '47k' }, { '1': 'BMC', '2': 'LCI' })
    .part('RLC2', 'resistor', 900, 300, { value: '10k' }, { '1': 'LCI', '2': 'GND' }, 1)
    // the close limit alone (before the beam): with LCI it tells closed from beam broken
    .part('RLB1', 'resistor', 1000, 400, { value: '47k' }, { '1': 'BML', '2': 'LBI' })
    .part('RLB2', 'resistor', 1000, 500, { value: '10k' }, { '1': 'LBI', '2': 'GND' }, 1)
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
  // 0.1 s, blanked about 0.1 s from RUN's rising edge) open-collector onto FLTN; FLTN low switches QFL on: FLT high
  // holds A tripped (RLT, DLT), pulls the gate down (QF, DGF) and interrupts the microcontroller
  nb.block('cut-off')
    .part('RSF', 'resistor', 600, 700, { value: '1k' }, { '1': 'SRET', '2': 'SRF' })
    .part('CSF', 'capacitor', 650, 800, { value: '1n', vmax: '50' }, { '1': 'SRF', '2': 'GND' }, 1)
    .part('RSC1', 'resistor', 700, 600, { value: '19.1k' }, { '1': 'V5', '2': 'VSC' }, 1)
    .part('RSC2', 'resistor', 700, 700, { value: '1k' }, { '1': 'VSC', '2': 'GND' }, 1)
    .part('UC', 'comparator', 850, 700, { value: 'LM393', pkg: 'OC' }, { '3': 'VSC', '2': 'SRF', '1': 'FLTN', '8': 'V5', '4': 'GND' })
    .part('RIF', 'resistor', 600, 900, { value: '100k' }, { '1': 'SRET', '2': 'ISF' })
    .part('CIF', 'capacitor', 650, 1000, { value: '1u', vmax: '50' }, { '1': 'ISF', '2': 'GND' }, 1)
    .part('ROB1', 'resistor', 700, 850, { value: '69.8k' }, { '1': 'V5', '2': 'VOB' }, 1)
    .part('ROB2', 'resistor', 700, 950, { value: '1k' }, { '1': 'VOB', '2': 'GND' }, 1)
    .part('UC2', 'comparator', 850, 900, { value: 'LM393', pkg: 'OC' }, { '3': 'VOB', '2': 'ISF', '1': 'FLTN', '8': 'V5', '4': 'GND' })
    // start blanking: RUN's rising edge through CBL and RBS holds ISF at 0 V for about 0.1 s (the
    // start current is below 7 A after 65 ms; a stall from the start trips 0.24 s after it)
    .part('CBL', 'capacitor', 500, 1100, { value: '1u', vmax: '16' }, { '1': 'RUN', '2': 'BLA' })
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
    // power-on reset (a second LM393): FLTN held low until the RC (470k, 100 nF) has followed the
    // 5 V to 80 % of it, about 75 ms after the 5 V settles; it acts while the 5 V rises faster
    // than in about 0.25 s (a DIN-rail supply: well under 0.1 s). The diode empties the RC when
    // the supply goes. The latch then holds the cut-off tripped until CLR.
    .part('RPC', 'resistor', 1300, 700, { value: '470k' }, { '1': 'V5', '2': 'PRC' })
    .part('CPC', 'capacitor', 1350, 800, { value: '100n', vmax: '50' }, { '1': 'PRC', '2': 'GND' }, 1)
    .part('DPC', 'diode', 1400, 700, { value: '1N4148' }, { '2': 'PRC', '1': 'V5' })
    .part('RPD1', 'resistor', 1450, 700, { value: '10k' }, { '1': 'V5', '2': 'PRD' })
    .part('RPD2', 'resistor', 1450, 800, { value: '39k' }, { '1': 'PRD', '2': 'GND' }, 1)
    .part('UPC', 'comparator', 1550, 750, { value: 'LM393', pkg: 'POR' }, { '3': 'PRC', '2': 'PRD', '1': 'FLTN', '8': 'V5', '4': 'GND' })
    // CLR from the microcontroller releases it: its rising edge only (CCL), so a CLR stuck high
    // cannot hold the cut-off released
    .part('CCL', 'capacitor', 1250, 950, { value: '100n', vmax: '50' }, { '1': 'CLR', '2': 'CLP' })
    .part('DCL', 'diode', 1250, 1050, { value: 'BAT54' }, { '2': 'GND', '1': 'CLP' }, 1)
    .part('RCL', 'resistor', 1300, 950, { value: '10k' }, { '1': 'CLP', '2': 'BCL' })
    .part('RCLB', 'resistor', 1350, 1050, { value: '47k' }, { '1': 'BCL', '2': 'GND' }, 1)
    .part('RCLD', 'resistor', 1300, 1050, { value: '100k' }, { '1': 'CLR', '2': 'GND' }, 1)
    .part('QCL', 'npn', 1400, 950, { value: 'BC547B' }, { '1': 'BCL', '2': 'SRF', '3': 'GND' })
    .part('COC', 'capacitor', 950, 800, { value: '100n', vmax: '50' }, { '1': 'V5', '2': 'GND' }, 1)
    // CUT-OFF indicator (red): lit while the cut-off is tripped
    .part('RLF', 'resistor', 1200, 1150, { value: '1k' }, { '1': 'FLT', '2': 'LFA' })
    .part('LFT', 'led', 1250, 1250, { colour: 'red' }, { '2': 'LFA', '1': 'GND' }, 1);
  // ---- the microcontroller (D24): an Arduino Nano on sockets (5 V I/O, as the commands above are
  // simulated), on the board's 5 V; the IR receiver (TSOP38238, 38 kHz) on its own filtered 5 V
  // (100 Ω, 4.7 µF), behind the enclosure's window. Not simulated: the bench drives its outputs.
  // FAULT (FLTN) on D2 and the receiver on D3 (the two interrupt pins); OPEN D5, CLOSE D6, CLR D7,
  // RUN D9; the open limit A0, the close limit and beam chain A1, the close limit alone A2; the
  // LEARN button D4 (pairs a remote: firmware/gate-controller)
  nb.block('microcontroller')
    .part('UMC', 'nano', 1600, 500, { value: 'Arduino Nano' }, { '4': 'GND', '29': 'GND', '27': 'V5', '5': 'FLTN', '6': 'IRO', '7': 'LRN', '8': 'OPEN', '9': 'CLOSE', '10': 'CLR', '12': 'RUN', '11': 'BTX', '19': 'LOI', '20': 'LCI', '21': 'LBI', '22': 'KSI' })
    .part('SLRN', 'button', 1750, 650, { pressed: 'false' }, { '1': 'LRN', '2': 'GND' })
    .part('RLRN', 'resistor', 1750, 560, { value: '10k' }, { '1': 'V5', '2': 'LRN' }, 1)
    .part('RIR', 'resistor', 1450, 900, { value: '100' }, { '1': 'V5', '2': 'VIR' })
    .part('CIR', 'capacitor_pol', 1500, 1000, { value: '4.7u', vmax: '16' }, { '1': 'VIR', '2': 'GND' }, 1)
    .part('UIR', 'irrx', 1650, 950, { value: 'TSOP38238' }, { '3': 'VIR', '2': 'GND', '1': 'IRO' })
    .part('RIRP', 'resistor', 1750, 900, { value: '10k' }, { '1': 'V5', '2': 'IRO' }, 1)
    // a push-button or key-switch (NO, to 0 V) as a second command input: A3
    .part('XKS', 'terminal', 1900, 700, { value: 'push-button / key-switch (NO)' }, { '1': 'KSW' })
    .part('XKS0', 'terminal', 1900, 760, { value: 'push-button / key-switch, 0 V' }, { '1': 'GND' })
    .part('RKS1', 'resistor', 1850, 600, { value: '10k' }, { '1': 'V5', '2': 'KSW' }, 1)
    .part('RKS2', 'resistor', 1950, 600, { value: '1k' }, { '1': 'KSW', '2': 'KSI' })
    .part('CKS', 'capacitor', 2000, 700, { value: '100n', vmax: '50' }, { '1': 'KSI', '2': 'GND' }, 1);
  // ---- the beam test: the photo-beam transmitter's supply switched from D8 (BD140 from 24 V), so
  // the firmware sees the beam break when it turns it off before each close (a bridged or stuck
  // receiver contact is found); off when the program is not running, so the gate cannot close
  nb.block('beam test')
    .part('RTX1', 'resistor', 1600, 1150, { value: '10k' }, { '1': 'BTX', '2': 'BTB' })
    .part('RTXD', 'resistor', 1600, 1250, { value: '47k' }, { '1': 'BTB', '2': 'GND' }, 1)
    .part('QTX', 'npn', 1700, 1150, { value: 'BC547B' }, { '1': 'BTB', '2': 'TXC', '3': 'GND' })
    .part('RTX2', 'resistor', 1800, 1100, { value: '4.7k' }, { '1': 'TXC', '2': 'BTP' })
    .part('RTXP', 'resistor', 1850, 1000, { value: '10k' }, { '1': 'V24F', '2': 'BTP' }, 1)
    .part('QTP', 'pnp', 1900, 1100, { value: 'BD140' }, { '1': 'BTP', '2': 'VTX', '3': 'V24F' })
    .part('DTX', 'tvs', 2000, 1200, { value: 'SMAJ33A' }, { '1': 'VTX', '2': 'GND' }, 1)
    .part('XTX', 'terminal', 2100, 1100, { value: 'photo-beam transmitter +24 V (tested)' }, { '1': 'VTX' });
  nb.v('MA').v('MB').v('SW').v('FLTN').v('FLT').v('ISF').v('SRF').v('SPD').v('GM').v('LOI').v('LCI').v('LBI').v('VTX').i('QM', '2').i('M1', '1');
  nb.sim({ type: 'tran', stop: o.stop ?? '2', step: '20u', start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
