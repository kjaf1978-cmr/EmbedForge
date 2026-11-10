// P9 (D24): a block moulding machine (hollow and solid concrete blocks): the system and its
// control and safety circuits. The machine: a feeder box (3 kW mixer / feeder motor) fills the
// mould, two 1.5 kW vibrator motors on the mould table compact the concrete while the hydraulic
// tamper head presses (7.5 kW hydraulic power pack, 4 solenoid valves), the mould lifts
// (demoulding) and the pallet with the fresh blocks is pushed out. 400 V 3-phase: each motor
// through its motor-protective circuit breaker and a contactor (24 V DC coils), the panel's
// 24 V 10 A supply, a microcontroller board (D24: the sequence: fill, vibrate, press, demould,
// eject, with its timings and the proximity sensors' end positions).
//
// Simulated here: the safety circuit and the 24 V outputs (the 400 V power circuit is
// contactors and breakers by their ratings, listed in the parts list and the wiring list):
// - the emergency stop: two channels (an E-stop with two NC contacts) and two safety contactors
//   K1 and K2 (9 A, 24 V DC coil, mirror contacts to IEC 60947-4-1 Annex F) whose main contacts
//   in series feed the safety rail V24S: every contactor coil and valve of the machine is fed from
//   it, so the E-stop stops every motion whatever the microcontroller does;
// - reset: RESET (NO) in series with the NC mirror contacts of K1, K2 and the pump's contactor
//   (a welded contact prevents the reset), then a 100 µF capacitor into a reset relay K3: K1 and
//   K2 get a pulse of about 0.2 s only, so a held or jammed button cannot restart the machine
//   after an E-stop; K1 and K2 then hold through their own NO auxiliary contacts;
// - the hydraulic pump's contactor (18 A, 24 V DC) and a solenoid valve (24 V 26 W) switched by
//   IRLZ44Ns from the microcontroller, the valve's turn-off clamped at 38 V (SMAJ33A: it
//   releases within a few ms; a plain diode would hold it for tens);
// - a proximity sensor (PNP, 24 V) to the microcontroller through a PC817.

import { NB } from './powerExamples';
import type { Sheet } from './schematic';

export interface BlockOptions {
  /** The operator: RESET pressed from `reset` for `resetFor` s, the E-stop pressed from
   *  `estop` (to `estopTo`). The microcontroller: the pump's contactor from `pump`, the valve from
   *  `valve` to `valveTo`. Faults: K1 welded (its armature held from the start), channel 1 of the
   *  E-stop bridged (a cross short). */
  reset?: number; resetFor?: number; estop?: number; estopTo?: number; pump?: number; valve?: number; valveTo?: number;
  k1Welded?: boolean; ch1Bridged?: boolean;
  /** K1 welds while running (its armature held from then on); a second RESET press. */
  k1WeldAt?: number; reset2?: number;
  stop?: string;
}

const pulse = (at: number | undefined, to: number) => at === undefined ? { value: '0', low: '0', freq: '0.01', duty: '0', delay: '0', edge: '1u' } : { value: '5', low: '0', freq: '0.01', duty: String(Math.max(0, to - at)), delay: String(at), edge: '1u' };

export function blockMachine(o: BlockOptions = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  nb.para('BLOCK MOULDING MACHINE, safety circuit and 24 V outputs: two-channel emergency stop, safety contactors K1 and K2 with mirror contacts in series to the safety rail V24S (every contactor coil and valve of the machine); reset by a capacitor pulse (reset relay K3) through the mirror contacts of K1, K2 and the pump contactor (no restart by a held button, none with a welded contact); pump contactor and solenoid valve from the microcontroller (IRLZ44N, valve clamped at 38 V for a fast release); proximity sensor through a PC817.', -1200, -300);

  // ---- test bench: the 24 V supply, the operator's buttons, the microcontroller's outputs
  const stop = Number(o.stop ?? 1);
  nb.block('bench').note('TEST BENCH: the 24 V supply, the operator, the microcontroller (not part of the panel)', -1200, -150)
    .part('V24', 'battery', -1150, 0, { value: '24', rint: '0.05' }, { '1': 'V24', '2': 'GND' }, 1)
    // RESET (NO) and the E-stop's two NC contacts as switches driven by the bench
    .part('VRS', 'vpulse', -1050, 0, { ...pulse(o.reset, (o.reset ?? 0) + (o.resetFor ?? 0.2)), value: '34' }, { '1': 'GRS', '2': 'GND' })
    .part('SRS', 'nmos', -950, 0, { value: 'IRLZ44N' }, { '1': 'GRS', '2': 'V24F', '3': 'RS1' })
    // E-stop: closed (gate high) except from estop to estopTo
    .part('VES', 'vpulse', -1050, 150, o.estop === undefined ? { value: '10', low: '0', freq: '0.01', duty: '100', delay: '0', edge: '1u' } : { value: '0', low: '10', freq: '0.01', duty: String((o.estopTo ?? stop + 1) - o.estop), delay: String(o.estop), edge: '1u' }, { '1': 'GES', '2': 'GND' })
    .part('SE1', 'nmos', -950, 150, { value: 'IRLZ44N' }, { '1': 'GES', '2': 'E1L', '3': 'GND' })
    .part('SE2', 'nmos', -950, 250, { value: 'IRLZ44N' }, { '1': 'GES', '2': 'E2L', '3': 'GND' })
    .part('VPU', 'vpulse', -850, 0, pulse(o.pump, stop + 1), { '1': 'PUMP', '2': 'GND' })
    .part('VVA', 'vpulse', -850, 150, pulse(o.valve, o.valveTo ?? stop + 1), { '1': 'VALVE', '2': 'GND' })
    // the valve: 24 V 26 W (22 Ω, 50 mH); the proximity sensor's output (PNP, on)
    .part('RSV', 'resistor', -750, 300, { value: '22', pmax: '50' }, { '1': 'V24S', '2': 'SVA' }, 1)
    .part('LSV', 'inductor', -750, 400, { value: '50m', imax: '3' }, { '1': 'SVA', '2': 'SVD' }, 1)
    .part('VPX', 'battery', -650, 300, { value: '23', rint: '10' }, { '1': 'PX1', '2': 'GND' }, 1)
    .part('V5', 'battery', -550, 300, { value: '5', rint: '0.05' }, { '1': 'V5', '2': 'GND' }, 1);
  if (o.ch1Bridged) nb.part('SBR', 'switch', -850, 300, { closed: 'true' }, { '1': 'E1L', '2': 'GND' });
  // K1 welded: its armature held by the bench (a second coil supply that never drops)
  if (o.k1Welded) nb.part('RWK', 'resistor', -650, 450, { value: '1' }, { '1': 'V24', '2': 'C1' }).part('RWK2', 'resistor', -550, 450, { value: '1' }, { '1': 'E1L', '2': 'GND' });
  if (o.k1WeldAt !== undefined) nb.part('VWK', 'vpulse', -650, 550, { ...pulse(o.k1WeldAt, stop + 1), value: '34' }, { '1': 'GWK', '2': 'GND' })
    .part('SWK', 'nmos', -550, 550, { value: 'IRLZ44N' }, { '1': 'GWK', '2': 'V24', '3': 'C1' })
    .part('SWK2', 'nmos', -450, 550, { value: 'IRLZ44N' }, { '1': 'GWK', '2': 'E1L', '3': 'GND' });
  if (o.reset2 !== undefined) nb.part('VRS2', 'vpulse', -1050, 400, { ...pulse(o.reset2, o.reset2 + 0.2), value: '34' }, { '1': 'GRS2', '2': 'GND' })
    .part('SRS2', 'nmos', -950, 400, { value: 'IRLZ44N' }, { '1': 'GRS2', '2': 'V24F', '3': 'RS1' });

  // ---- supply terminals and fuse
  nb.block('supply')
    .part('XP', 'terminal', 0, -100, { value: '+24 V (panel supply)' }, { '1': 'V24' })
    .part('XN', 'terminal', 0, 0, { value: '0 V' }, { '1': 'GND' })
    .part('F1', 'fuse', 100, -100, { value: '4' }, { '1': 'V24', '2': 'V24F' })
    .part('DT1', 'tvs', 200, 0, { value: 'SMAJ33A' }, { '1': 'V24F', '2': 'GND' }, 1);

  // ---- the safety circuit
  nb.block('safety')
    .part('XRS1', 'terminal', 0, 200, { value: 'RESET (NO)' }, { '1': 'V24F' })
    .part('XRS2', 'terminal', 0, 250, { value: 'RESET' }, { '1': 'RS1' })
    .part('XE1', 'terminal', 0, 350, { value: 'E-stop channel 1 (NC)' }, { '1': 'E1L' })
    .part('XE2', 'terminal', 0, 400, { value: 'E-stop channel 2 (NC)' }, { '1': 'E2L' })
    .part('XE0', 'terminal', 0, 450, { value: 'E-stop common 0 V' }, { '1': 'GND' })
    // the feedback loop: RESET → NC mirror contacts of K1, K2 and the pump contactor KMP
    .part('K1', 'contactor', 300, 300, { value: '9 A, coil 24 V DC' }, { A1: 'C1', A2: 'E1L', '1': 'V24F', '2': 'KS', '13': 'V24F', '14': 'C1', '21': 'RS1', '22': 'FB1' })
    .part('K2', 'contactor', 500, 300, { value: '9 A, coil 24 V DC' }, { A1: 'C2', A2: 'E2L', '1': 'KS', '2': 'V24S', '13': 'V24F', '14': 'C2', '21': 'FB1', '22': 'FB2' })
    // the reset pulse: 100 µF into the reset relay K3 (1.6 kΩ coil: on for about 0.2 s), whose
    // contact gives K1 and K2 the full 24 V until their own contacts hold them (the capacitor
    // straight into the contactors' coils decayed before they pulled in, found in simulation)
    .part('CR', 'capacitor_pol', 700, 250, { value: '100u', vmax: '50' }, { '1': 'FB3', '2': 'K3C' })
    .part('RDR', 'resistor', 700, 350, { value: '4.7k' }, { '1': 'FB3', '2': 'GND' }, 1)
    .part('K3', 'relay', 800, 300, { value: '24 V' }, { '1': 'K3C', '2': 'GND', '3': 'V24F', '5': 'RP' })
    .part('DK3', 'diode', 850, 400, { value: '1N4148' }, { '2': 'GND', '1': 'K3C' }, 1)
    .part('RDP', 'resistor', 900, 350, { value: '10k' }, { '1': 'RP', '2': 'GND' }, 1)
    .part('DR1', 'diode', 800, 250, { value: '1N4007' }, { '2': 'RP', '1': 'C1' })
    .part('DR2', 'diode', 900, 250, { value: '1N4007' }, { '2': 'RP', '1': 'C2' })
    .part('DK1', 'diode', 300, 450, { value: '1N4007' }, { '2': 'E1L', '1': 'C1' }, 3)
    .part('DK2', 'diode', 500, 450, { value: '1N4007' }, { '2': 'E2L', '1': 'C2' }, 3)
    .part('CS', 'capacitor_pol', 1000, 350, { value: '100u', vmax: '50' }, { '1': 'V24S', '2': 'GND' }, 1);

  // ---- outputs on the safety rail: the pump's contactor and a solenoid valve
  nb.block('outputs')
    .part('KMP', 'contactor', 300, 650, { value: '18 A, coil 24 V DC' }, { A1: 'V24S', A2: 'KPD', '1': 'L1', '2': 'U1', '3': 'L2', '4': 'V1', '5': 'L3', '6': 'W1', '21': 'FB2', '22': 'FB3' })
    .part('DKP', 'diode', 400, 650, { value: '1N4007' }, { '2': 'KPD', '1': 'V24S' }, 3)
    .part('RGP', 'resistor', 300, 800, { value: '100' }, { '1': 'PUMP', '2': 'GP' })
    .part('RGPD', 'resistor', 300, 900, { value: '10k' }, { '1': 'GP', '2': 'GND' }, 1)
    .part('QP', 'nmos', 400, 800, { value: 'IRLZ44N' }, { '1': 'GP', '2': 'KPD', '3': 'GND' })
    .part('XSV1', 'terminal', 600, 600, { value: 'valve 1 +' }, { '1': 'V24S' })
    .part('XSV2', 'terminal', 600, 650, { value: 'valve 1 −' }, { '1': 'SVD' })
    .part('RGV', 'resistor', 600, 800, { value: '100' }, { '1': 'VALVE', '2': 'GV' })
    .part('RGVD', 'resistor', 600, 900, { value: '10k' }, { '1': 'GV', '2': 'GND' }, 1)
    .part('QV', 'nmos', 700, 800, { value: 'IRLZ44N' }, { '1': 'GV', '2': 'SVD', '3': 'GND' })
    .part('DTV', 'tvs', 800, 850, { value: 'SMAJ33A' }, { '1': 'SVD', '2': 'GND' }, 1)
    // the motor terminals of the power circuit (400 V: not simulated)
    .part('XL1', 'terminal', 200, 750, { value: 'L1 (from Q1, MPCB 14 … 20 A)' }, { '1': 'L1' })
    .part('XL2', 'terminal', 200, 800, { value: 'L2' }, { '1': 'L2' })
    .part('XL3', 'terminal', 200, 850, { value: 'L3' }, { '1': 'L3' })
    .part('XU', 'terminal', 400, 950, { value: 'pump motor U' }, { '1': 'U1' })
    .part('XV', 'terminal', 450, 950, { value: 'pump motor V' }, { '1': 'V1' })
    .part('XW', 'terminal', 500, 950, { value: 'pump motor W' }, { '1': 'W1' })
    .part('RL1', 'resistor', 200, 950, { value: '1M' }, { '1': 'L1', '2': 'GND' }, 1)
    .part('RL2', 'resistor', 250, 950, { value: '1M' }, { '1': 'L2', '2': 'GND' }, 1)
    .part('RL3', 'resistor', 300, 950, { value: '1M' }, { '1': 'L3', '2': 'GND' }, 1);

  // ---- a proximity sensor (PNP, 24 V) to the microcontroller (5 V) through a PC817
  nb.block('inputs')
    .part('XPX', 'terminal', 900, 600, { value: 'proximity sensor 1 (PNP out)' }, { '1': 'PX1' })
    .part('RPX', 'resistor', 1000, 600, { value: '4.7k' }, { '1': 'PX1', '2': 'PXA' })
    .part('UPX', 'opto', 1100, 650, { value: 'PC817' }, { '1': 'PXA', '2': 'GND', '4': 'IN1', '3': 'GND' })
    .part('DPX', 'diode', 1000, 700, { value: '1N4148' }, { '2': 'GND', '1': 'PXA' }, 1)
    .part('RIN', 'resistor', 1200, 650, { value: '10k' }, { '1': 'V5', '2': 'IN1' }, 1)
    .part('XIN', 'terminal', 1300, 650, { value: 'to the microcontroller: IN1 (low = target present)' }, { '1': 'IN1' });
  nb.v('V24S').v('C1').v('C2').v('RP').v('K3C').v('SVD').v('KPD').v('U1').v('IN1').v('FB3').i('RSV', '1');
  nb.sim({ type: 'tran', stop: o.stop ?? '1', step: '20u', start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
