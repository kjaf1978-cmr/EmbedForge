// P9 (D24): a block moulding machine (hollow and solid concrete blocks): the system and its
// control and safety circuits. The machine: a feeder box (3 kW mixer / feeder motor) fills the
// mould, two 1.5 kW vibrator motors on the mould table compact the concrete while the hydraulic
// tamper head presses (7.5 kW hydraulic power pack, 4 solenoid valves), the mould lifts
// (demoulding) and the pallet with the fresh blocks is changed. 400 V 3-phase: the main breaker
// QS, each motor through its motor-protective breaker and a contactor (24 V DC coils); a 24 V
// DIN-rail supply; an Arduino Mega 2560 runs the cycle (firmware/block-machine).
//
// After the independent review (25 November 2026, D65 … D67):
// - D65 the E-stop and the guards on two certified safety relays (KSE, KSG: two channels each,
//   monitored start on the release, cross-short detection by their test pulses). Their enabling
//   contacts in series drive the safety contactors K1 and K2 (9 A, 24 V DC, mirror contacts to IEC
//   60947-4-1 Annex F), whose main contacts (two poles each in series) feed the safety rail V24S:
//   every contactor coil and valve of the machine is fed from it. The start loops: RESET (two NO
//   blocks) in series with the mirror (NC) contacts of K1, K2 and every motor contactor (E-stop
//   relay) and with K1's and K2's second mirror contacts (guard relay): a welded contactor
//   refuses the start;
// - D66 the 0 V bonded to PE at one point (X: 0 V – PE) and every output switched on its +24 V
//   side: an IRF9540N from the safety rail with a current limit (0.33 Ω and a BC557B: about 2 A),
//   a BC547B level shift from the controller, a bidirectional SMAJ33CA across the load (a fast
//   release of the valves and coils, which a freewheel diode would hold), and a read-back of the
//   output to the controller: an output on while commanded off refuses the start, one off while
//   commanded on (a short, a wire to the frame) is switched off. A wire to the frame now short-
//   circuits an output (limited, read back) instead of switching its load on. The eight outputs
//   take their supply V24O from the rail through a common enable switch (IRF4905) that the
//   controller turns on only with every output off and drops within 5 ms when an output reads on
//   uncommanded: a shorted output switch is found before its contactor or valve pulls in
//   (15 … 40 ms), also at the RESET that brings the rail back;
// - D67 an Arduino Mega 2560: inputs for the hydraulic pressure, the oil temperature and the
//   motor-protective breakers' auxiliary contacts, the eight read-backs, the safety rail;
// - the field 24 V (sensors, buttons, the pressure and temperature switches) behind its own 2 A
//   fuse F2; F1 8 A for the coils and the valves.
// Simulated: the safety circuit (the safety relays as a behavioural model of their certified
// function), the 24 V outputs and their faults, the inputs. The 400 V circuit is the breakers and
// contactors by their ratings (in the parts list and the wiring list).

import { NB } from './powerExamples';
import type { Sheet } from './schematic';

export interface BlockOptions {
  /** The operator: RESET pressed from `reset` for `resetFor` s (a second press at `reset2`); the
   *  E-stop pressed from `estop` to `estopTo`; the guard opened from `guard` to `guardTo`. */
  reset?: number; resetFor?: number; reset2?: number; estop?: number; estopTo?: number; guard?: number; guardTo?: number;
  /** The controller's outputs: the pump's contactor from `pump`, valve 1 from `valve` to
   *  `valveTo` (all four valves with `allValves`), the lamp from `lamp`. */
  pump?: number; valve?: number; valveTo?: number; allValves?: boolean; lamp?: number;
  /** the outputs' enable from `enable` to `enableTo` (default: on from 50 ms) */
  enable?: number; enableTo?: number;
  /** Faults: K1 welded (its armature held from the start, or from `k1WeldAt`); only channel 1 of
   *  the E-stop opens (a broken contact block in channel 2); channel 1 bridged; valve 1's MOSFET
   *  shorted; valve 1's wire shorted to the frame (0 V, PE) from `valveShortAt`. */
  k1Welded?: boolean; k1WeldAt?: number; estopCh1Only?: boolean; ch1Bridged?: boolean; qvShorted?: boolean; valveShortAt?: number;
  /** The supply rises over `rampMs` ms instead of a step; STOP pressed (its NC contact open). */
  rampMs?: number; stopPressed?: boolean;
  stop?: string;
}

// a pulse of the bench (5 V) from `at` to `to`; a contact closed except from `at` to `to`
const pulse = (at: number | undefined, to: number, v = '5') => at === undefined ? { value: '0', low: '0', freq: '0.01', duty: '0', delay: '0', edge: '1u' } : { value: v, low: '0', freq: '0.01', duty: String(Math.max(0, to - at)), delay: String(at), edge: '1u' };
const closedExcept = (at: number | undefined, to: number) => at === undefined ? { value: '34', low: '0', freq: '0.01', duty: '100', delay: '0', edge: '1u' } : { value: '0', low: '34', freq: '0.01', duty: String(Math.max(0, to - at)), delay: String(at), edge: '1u' };

// the high-side outputs: [key, the controller's command, the output net, the read-back net, what]
const OUTPUTS: [string, string, string, string, string][] = [
  ['P', 'PUMP', 'KPA', 'RBP', 'pump contactor'], ['M', 'MIXER', 'KMMA', 'RBM', 'mixer / feeder contactor'],
  ['V1', 'VIB1', 'KMV1A', 'RBV1', 'vibrator 1 contactor'], ['V2', 'VIB2', 'KMV2A', 'RBV2', 'vibrator 2 contactor'],
  ['S1', 'VALVE1', 'SV1', 'RBS1', 'valve 1 (tamper down)'], ['S2', 'VALVE2', 'SV2', 'RBS2', 'valve 2 (tamper up)'],
  ['S3', 'VALVE3', 'SV3', 'RBS3', 'valve 3 (mould up)'], ['S4', 'VALVE4', 'SV4', 'RBS4', 'valve 4 (mould down)'],
];
// the inputs (24 V through a PC817 each; low = active): [key, terminal text]
const INPUTS: [string, string][] = [
  ['1', 'proximity sensor 1: mould up (PNP out)'], ['2', 'proximity sensor 2: mould down (PNP out)'],
  ['3', 'proximity sensor 3: tamper up (PNP out)'], ['4', 'proximity sensor 4: tamper down (PNP out)'],
  ['5', 'proximity sensor 5: feeder home (PNP out)'], ['6', 'proximity sensor 6: pallet in place (PNP out)'],
  ['7', 'START (NO, 24 V)'], ['8', 'STOP (NC, 24 V)'], ['9', 'pressure switch (NO, closes at the working pressure)'],
  ['10', 'oil temperature switch (NC, opens when hot)'], ['11', 'motor breakers healthy (their auxiliary NO contacts in series)'],
];
// the Mega's pins: the inputs D22 … D32, the outputs D2 … D9, the lamp D10, the read-backs A0 … A7,
// the safety rail A8
const IN_PIN = (k: number) => `D${21 + k}`;
const OUT_PIN = ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'];

export function blockMachine(o: BlockOptions = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB().wireUp(['V24', 'V24F', 'V24I', 'V24S', 'V5'], 3);
  nb.para('BLOCK MOULDING MACHINE, safety circuit and 24 V outputs: E-stop and guards on two certified safety relays (two channels, monitored start on the release); their enabling contacts drive the safety contactors K1 and K2 in series to the safety rail V24S, which feeds every contactor coil and valve; the start loops through RESET and the mirror contacts of K1, K2 and every motor contactor (no start with a welded contact). Outputs switched on their +24 V side (IRF9540N, 2 A current limit, read back, SMAJ33CA for a fast release), 0 V bonded to PE. Arduino Mega 2560: the cycle, the pressure and oil temperature switches, the motor breakers, the read-backs.', -1200, -300);

  // ---- test bench: the supply, the operator, the controller's outputs, the field
  const stop = Number(o.stop ?? 1);
  nb.block('bench').note('TEST BENCH: the 24 V supply, the operator, the controller, the field (not part of the panel)', -1200, -150);
  if (o.rampMs) nb.part('V24', 'vpulse', -1150, 0, { value: '24', low: '0', freq: '0.01', duty: '100', delay: '0', edge: String(o.rampMs / 1000) }, { '1': 'V24R', '2': 'GND' })
    .part('RV24', 'resistor', -1150, 100, { value: '0.05' }, { '1': 'V24R', '2': 'V24' });
  else nb.part('V24', 'battery', -1150, 0, { value: '24', rint: '0.05' }, { '1': 'V24', '2': 'GND' }, 1);
  // RESET: one button, two NO blocks (one for each safety relay's start loop)
  const resetPulse = { ...pulse(o.reset, (o.reset ?? 0) + (o.resetFor ?? 0.2), '34') };
  nb.part('VRS', 'vpulse', -1050, 0, resetPulse, { '1': 'GRS', '2': 'GND' })
    .part('SRSA', 'nmos', -950, 0, { value: 'IRLZ44N' }, { '1': 'GRS', '2': 'SE33', '3': 'RSA' })
    .part('SRSB', 'nmos', -950, 100, { value: 'IRLZ44N' }, { '1': 'GRS', '2': 'SG33', '3': 'RSB' });
  if (o.reset2 !== undefined) nb.part('VRS2', 'vpulse', -1050, 200, pulse(o.reset2, o.reset2 + 0.2, '34'), { '1': 'GRS2', '2': 'GND' })
    .part('SRS2A', 'nmos', -950, 200, { value: 'IRLZ44N' }, { '1': 'GRS2', '2': 'SE33', '3': 'RSA' })
    .part('SRS2B', 'nmos', -950, 300, { value: 'IRLZ44N' }, { '1': 'GRS2', '2': 'SG33', '3': 'RSB' });
  // the E-stop's two NC contacts and the guard switch's two NC contacts
  nb.part('VES', 'vpulse', -850, 0, closedExcept(o.estop, o.estopTo ?? stop + 1), { '1': 'GES', '2': 'GND' })
    .part('SE1', 'nmos', -750, 0, { value: 'IRLZ44N' }, { '1': 'GES', '2': 'SE11', '3': 'SE12' })
    .part('VES2', 'vpulse', -850, 100, o.estopCh1Only ? closedExcept(undefined, 0) : closedExcept(o.estop, o.estopTo ?? stop + 1), { '1': 'GES2', '2': 'GND' })
    .part('SE2', 'nmos', -750, 100, { value: 'IRLZ44N' }, { '1': 'GES2', '2': 'SE21', '3': 'SE22' })
    .part('VGS', 'vpulse', -850, 200, closedExcept(o.guard, o.guardTo ?? stop + 1), { '1': 'GGS', '2': 'GND' })
    .part('SG1', 'nmos', -750, 200, { value: 'IRLZ44N' }, { '1': 'GGS', '2': 'SG11', '3': 'SG12' })
    .part('SG2', 'nmos', -750, 300, { value: 'IRLZ44N' }, { '1': 'GGS', '2': 'SG21', '3': 'SG22' });
  if (o.ch1Bridged) nb.part('SBR', 'switch', -650, 0, { closed: 'true' }, { '1': 'SE11', '2': 'SE12' });
  // K1 welded: its armature held by the bench (a second coil supply that never drops)
  if (o.k1Welded) nb.part('RWK', 'resistor', -650, 100, { value: '1' }, { '1': 'V24', '2': 'C1' });
  if (o.k1WeldAt !== undefined) nb.part('VWK', 'vpulse', -650, 200, pulse(o.k1WeldAt, stop + 1, '34'), { '1': 'GWK', '2': 'GND' })
    .part('SWK', 'nmos', -550, 200, { value: 'IRLZ44N' }, { '1': 'GWK', '2': 'V24', '3': 'C1' });
  // the controller's outputs
  nb.part('VPU', 'vpulse', -650, 400, pulse(o.pump, stop + 1), { '1': 'PUMP', '2': 'GND' })
    .part('VVA', 'vpulse', -550, 400, pulse(o.valve, o.valveTo ?? stop + 1), { '1': 'VALVE1', '2': 'GND' })
    .part('VLA', 'vpulse', -450, 400, pulse(o.lamp, stop + 1), { '1': 'LAMP', '2': 'GND' })
    .part('VEN', 'vpulse', -350, 400, pulse(o.enable ?? 0.05, o.enableTo ?? stop + 1), { '1': 'ENABLE', '2': 'GND' });
  if (o.allValves) for (const k of [2, 3, 4]) nb.part(`VVA${k}`, 'vpulse', -650 + 100 * k, 500, pulse(o.valve, o.valveTo ?? stop + 1), { '1': `VALVE${k}`, '2': 'GND' });
  // the valves (24 V 26 W: 22 Ω, 50 mH), the lamp (24 V 2.4 W), a sensor (PNP, on), STOP's NC
  for (const k of [1, 2, 3, 4]) nb.part(`RCV${k}`, 'resistor', -1150 + 100 * k, 600, { value: '22', pmax: '50' }, { '1': `SV${k}`, '2': `SVL${k}` }, 1)
    .part(`LCV${k}`, 'inductor', -1150 + 100 * k, 700, { value: '50m', imax: '3' }, { '1': `SVL${k}`, '2': 'GND' }, 1);
  nb.part('RLAM', 'resistor', -650, 700, { value: '240', pmax: '5' }, { '1': 'V24F', '2': 'LMP' }, 1)
    .part('VPX', 'battery', -550, 700, { value: '23', rint: '10' }, { '1': 'PX1', '2': 'GND' }, 1)
    .part('SSTP', 'switch', -450, 700, { closed: o.stopPressed ? 'false' : 'true' }, { '1': 'V24I', '2': 'PX8' });
  if (o.qvShorted) nb.part('RQS', 'resistor', -350, 600, { value: '0.01' }, { '1': 'V24O', '2': 'SV1' });
  if (o.valveShortAt !== undefined) nb.part('VSH', 'vpulse', -350, 700, pulse(o.valveShortAt, stop + 1, '10'), { '1': 'GSH', '2': 'GND' })
    .part('QSH', 'nmos', -250, 700, { value: 'IRLZ44N' }, { '1': 'GSH', '2': 'SV1', '3': 'GND' });

  // ---- supply: terminals, the 0 V – PE bond, F1 (coils and valves), F2 (the field 24 V), 5 V
  nb.block('supply')
    .part('XP', 'terminal', 0, -100, { value: '+24 V (panel supply)' }, { '1': 'V24' })
    .part('XN', 'terminal', 0, 0, { value: '0 V' }, { '1': 'GND' })
    .part('XPE', 'terminal', 0, 50, { value: '0 V – PE bond (the one point)' }, { '1': 'GND' })
    // 8 A time-lag: the coils (about 1.1 A) and up to four valves of 26 W (4.3 A); the firmware
    // keeps at most two valves on (about 3.5 A in all)
    .part('F1', 'fuse', 100, -100, { value: '8', r: '0.01' }, { '1': 'V24', '2': 'V24F' })
    // 2 A time-lag for the field wiring (0.25 … 0.5 mm²): the sensors, the buttons, the switches
    .part('F2', 'fuse', 100, 100, { value: '2', r: '0.05' }, { '1': 'V24F', '2': 'V24I' })
    .part('DT1', 'tvs', 200, 0, { value: 'SMAJ33A' }, { '1': 'V24F', '2': 'GND' }, 1)
    .part('U5', 'regulator', 300, -100, { value: 'R-78E5.0-1.0' }, { '1': 'V24F', '2': 'GND', '3': 'V5' })
    .part('C5I', 'capacitor_pol', 300, 0, { value: '22u', vmax: '50' }, { '1': 'V24F', '2': 'GND' }, 1)
    .part('C5', 'capacitor_pol', 400, 0, { value: '22u', vmax: '16' }, { '1': 'V5', '2': 'GND' }, 1);

  // ---- the safety circuit: the E-stop relay KSE and the guard relay KSG
  nb.block('safety')
    // F3 (1 A) in the relays' enabling circuits: a coil wire on the frame (0 V on PE) blows it
    // before both relays' contacts can weld (second review)
    .part('F3', 'fuse', 200, 200, { value: '1', r: '0.2' }, { '1': 'V24F', '2': 'V24K' })
    .part('KSE', 'safetyrelay', 300, 300, { value: '3SK1111-1AB30' }, { A1: 'V24F', A2: 'GND', S11: 'SE11', S12: 'SE12', S21: 'SE21', S22: 'SE22', S33: 'SE33', S34: 'SE34', '13': 'V24K', '14': 'E14', '23': 'V24K', '24': 'E24' })
    .part('KSG', 'safetyrelay', 300, 500, { value: '3SK1111-1AB30' }, { A1: 'V24F', A2: 'GND', S11: 'SG11', S12: 'SG12', S21: 'SG21', S22: 'SG22', S33: 'SG33', S34: 'SG34', '13': 'E14', '14': 'C1', '23': 'E24', '24': 'C2' })
    // the nodes between the two relays' enabling contacts: a DC path for the simulator only
    .part('RE14', 'resistor', 450, 250, { value: '1M', scope: 'test' }, { '1': 'E14', '2': 'GND' }, 1)
    .part('RE24', 'resistor', 500, 250, { value: '1M', scope: 'test' }, { '1': 'E24', '2': 'GND' }, 1)
    .part('XE11', 'terminal', 0, 250, { value: 'E-stop channel 1 (NC): S11' }, { '1': 'SE11' })
    .part('XE12', 'terminal', 0, 280, { value: 'E-stop channel 1: S12' }, { '1': 'SE12' })
    .part('XE21', 'terminal', 0, 310, { value: 'E-stop channel 2 (NC): S21' }, { '1': 'SE21' })
    .part('XE22', 'terminal', 0, 340, { value: 'E-stop channel 2: S22' }, { '1': 'SE22' })
    .part('XG11', 'terminal', 0, 450, { value: 'guard channel 1 (NC): S11' }, { '1': 'SG11' })
    .part('XG12', 'terminal', 0, 480, { value: 'guard channel 1: S12' }, { '1': 'SG12' })
    .part('XG21', 'terminal', 0, 510, { value: 'guard channel 2 (NC): S21' }, { '1': 'SG21' })
    .part('XG22', 'terminal', 0, 540, { value: 'guard channel 2: S22' }, { '1': 'SG22' })
    .part('XRA1', 'terminal', 0, 600, { value: 'RESET block a (NO): S33 of the E-stop relay' }, { '1': 'SE33' })
    .part('XRA2', 'terminal', 0, 630, { value: 'RESET block a' }, { '1': 'RSA' })
    .part('XRB1', 'terminal', 0, 660, { value: 'RESET block b (NO): S33 of the guard relay' }, { '1': 'SG33' })
    .part('XRB2', 'terminal', 0, 690, { value: 'RESET block b' }, { '1': 'RSB' })
    // the safety contactors: coils from the relays' enabling contacts in series; their main
    // contacts, two poles each in series (the DC load's breaking), to the safety rail
    .part('K1', 'contactor', 600, 300, { value: '9 A, coil 24 V DC', aux2: 'true' }, { A1: 'C1', A2: 'GND', '1': 'V24F', '2': 'KA', '3': 'KA', '4': 'KS', '21': 'RSA', '22': 'FB1', '31': 'RSB', '32': 'GF1' })
    .part('K2', 'contactor', 800, 300, { value: '9 A, coil 24 V DC', aux2: 'true' }, { A1: 'C2', A2: 'GND', '1': 'KS', '2': 'KB', '3': 'KB', '4': 'V24S', '21': 'FB1', '22': 'FB2', '31': 'GF1', '32': 'SG34' })
    .part('DK1', 'tvs', 600, 450, { value: 'SMAJ33CA' }, { '1': 'C1', '2': 'GND' }, 1)
    .part('DK2', 'tvs', 800, 450, { value: 'SMAJ33CA' }, { '1': 'C2', '2': 'GND' }, 1)
    // "safety rail on" lamp; the rail's state to the controller (24 V → 4.2 V)
    .part('RLS', 'resistor', 1000, 300, { value: '2.2k', pmax: '0.5' }, { '1': 'V24S', '2': 'LSA' })
    .part('LS', 'led', 1000, 400, { colour: 'green' }, { '2': 'LSA', '1': 'GND' }, 1)
    .part('RSR1', 'resistor', 1100, 300, { value: '47k' }, { '1': 'V24S', '2': 'SRS' })
    .part('RSR2', 'resistor', 1100, 400, { value: '10k' }, { '1': 'SRS', '2': 'GND' }, 1);

  // ---- the outputs' enable: an IRF4905 from the safety rail to the outputs' supply V24O, on from
  // the controller (BC547B level shift), read back
  nb.block('enable')
    .part('QEN', 'pmos', 1300, 400, { value: 'IRF4905' }, { '1': 'GEN', '2': 'V24O', '3': 'V24S' })
    .part('RGSE', 'resistor', 1400, 350, { value: '10k' }, { '1': 'V24S', '2': 'GEN' })
    .part('RGDE', 'resistor', 1400, 450, { value: '10k' }, { '1': 'GEN', '2': 'DEN' })
    .part('QDE', 'npn', 1500, 500, { value: 'BC547B' }, { '1': 'BEN', '2': 'DEN', '3': 'GND' })
    .part('RBE', 'resistor', 1600, 500, { value: '10k' }, { '1': 'ENABLE', '2': 'BEN' })
    .part('RBDE', 'resistor', 1600, 600, { value: '47k' }, { '1': 'BEN', '2': 'GND' }, 1)
    .part('RRE', 'resistor', 1700, 400, { value: '47k' }, { '1': 'V24O', '2': 'RBEN' })
    .part('RRDE', 'resistor', 1700, 500, { value: '10k' }, { '1': 'RBEN', '2': 'GND' }, 1);

  // ---- the outputs: each switched on its +24 V side from the outputs' supply
  nb.block('outputs');
  OUTPUTS.forEach(([k, cmd, out, rb, what], i) => {
    const x = 1300 + 200 * i, y = 700;
    nb.part(`RS${k}`, 'resistor', x, y, { value: '0.33', pmax: '2' }, { '1': 'V24O', '2': `HS${k}` })
      .part(`QI${k}`, 'pnp', x + 60, y + 60, { value: 'BC557B' }, { '1': `BI${k}`, '2': `G${k}`, '3': 'V24O' })
      .part(`RI${k}`, 'resistor', x + 30, y + 120, { value: '100' }, { '1': `HS${k}`, '2': `BI${k}` })
      .part(`QH${k}`, 'pmos', x, y + 180, { value: 'IRF9540N' }, { '1': `G${k}`, '2': out, '3': `HS${k}` })
      .part(`RGS${k}`, 'resistor', x + 100, y + 120, { value: '10k' }, { '1': `HS${k}`, '2': `G${k}` })
      .part(`RGD${k}`, 'resistor', x + 100, y + 240, { value: '10k' }, { '1': `G${k}`, '2': `D${k}` })
      .part(`QD${k}`, 'npn', x + 100, y + 320, { value: 'BC547B' }, { '1': `B${k}`, '2': `D${k}`, '3': 'GND' })
      .part(`RB${k}`, 'resistor', x, y + 320, { value: '10k' }, { '1': cmd, '2': `B${k}` })
      .part(`RBD${k}`, 'resistor', x, y + 400, { value: '47k' }, { '1': `B${k}`, '2': 'GND' }, 1)
      .part(`DT${k}`, 'tvs', x + 60, y + 400, { value: 'SMAJ33CA' }, { '1': out, '2': 'GND' }, 1)
      .part(`RR${k}`, 'resistor', x + 140, y + 400, { value: '47k' }, { '1': out, '2': rb })
      .part(`RRD${k}`, 'resistor', x + 140, y + 480, { value: '10k' }, { '1': rb, '2': 'GND' }, 1);
    if (k.startsWith('S')) nb.part(`X${out}A`, 'terminal', x, y + 560, { value: `${what} +` }, { '1': out })
      .part(`X${out}B`, 'terminal', x + 50, y + 560, { value: `${what} −` }, { '1': 'GND' });
  });

  // ---- the motors: contactors with their coils on the outputs, their mirror contacts in the
  // E-stop relay's start loop (a welded motor contactor refuses the start); each motor through its
  // motor-protective breaker (thermal set to its rated current); the main breaker QS
  nb.block('motors')
    .part('KMP', 'contactor', 300, 1500, { value: '18 A, coil 24 V DC' }, { A1: 'KPA', A2: 'GND', '1': 'LP1', '2': 'U1', '3': 'LP2', '4': 'V1', '5': 'LP3', '6': 'W1', '21': 'FB2', '22': 'FBM' });
  const motors: [string, string, string, string, string][] = [['KMM', 'KMMA', 'FBM', 'FBM1', 'mixer / feeder 3 kW'], ['KMV1', 'KMV1A', 'FBM1', 'FBM2', 'vibrator 1, 1.5 kW'], ['KMV2', 'KMV2A', 'FBM2', 'FBM3', 'vibrator 2, 1.5 kW']];
  // the feeder's and the vibrators' second contactor (second review): KMS in their common 400 V
  // feed, its coil on the safety rail itself, its mirror contact in the E-stop relay's start loop:
  // a welded feeder or vibrator contactor no longer keeps its motor running after an E-stop
  nb.part('KMS', 'contactor', 1500, 1350, { value: '18 A, coil 24 V DC' }, { A1: 'V24S', A2: 'GND', '1': 'L1', '2': 'LG1', '3': 'L2', '4': 'LG2', '5': 'L3', '6': 'LG3', '21': 'FBM3', '22': 'SE34' })
    .part('DKS', 'tvs', 1600, 1450, { value: 'SMAJ33CA' }, { '1': 'V24S', '2': 'GND' }, 1)
    .part('RLG1', 'resistor', 1650, 1450, { value: '1M', scope: 'test' }, { '1': 'LG1', '2': 'GND' }, 1);
  motors.forEach(([k, a1, fbIn, fbOut, what], i) => {
    const x = 600 + 300 * i;
    nb.part(k, 'contactor', x, 1500, { value: '9 A, coil 24 V DC' }, { A1: a1, A2: 'GND', '1': `${k}L1`, '2': `${k}U`, '3': `${k}L2`, '4': `${k}V`, '5': `${k}L3`, '6': `${k}W`, '21': fbIn, '22': fbOut })
      .part(`Q${k}F`, 'breaker3', x, 1350, { value: i === 0 ? '6' : '4', curve: 'M' }, { '1': 'LG1', '2': `${k}L1`, '3': 'LG2', '4': `${k}L2`, '5': 'LG3', '6': `${k}L3` })
      .part(`X${k}U`, 'terminal', x, 1650, { value: `${what}: U` }, { '1': `${k}U` })
      .part(`X${k}V`, 'terminal', x + 50, 1650, { value: `${what}: V` }, { '1': `${k}V` })
      .part(`X${k}W`, 'terminal', x + 100, 1650, { value: `${what}: W` }, { '1': `${k}W` })
      .part(`R${k}U`, 'resistor', x, 1750, { value: '1M', scope: 'test' }, { '1': `${k}U`, '2': 'GND' }, 1)
      .part(`R${k}V`, 'resistor', x + 50, 1750, { value: '1M', scope: 'test' }, { '1': `${k}V`, '2': 'GND' }, 1)
      .part(`R${k}W`, 'resistor', x + 100, 1750, { value: '1M', scope: 'test' }, { '1': `${k}W`, '2': 'GND' }, 1);
  });
  nb.part('XL1', 'terminal', -100, 1300, { value: 'supply L1 (400 V, 3 phases)' }, { '1': 'LIN1' })
    .part('XL2', 'terminal', -100, 1350, { value: 'supply L2' }, { '1': 'LIN2' })
    .part('XL3', 'terminal', -100, 1400, { value: 'supply L3' }, { '1': 'LIN3' })
    .part('QS', 'breaker3', 50, 1350, { value: '32', curve: 'C' }, { '1': 'LIN1', '2': 'L1', '3': 'LIN2', '4': 'L2', '5': 'LIN3', '6': 'L3' })
    .part('QP1', 'breaker3', 200, 1350, { value: '16', curve: 'M' }, { '1': 'L1', '2': 'LP1', '3': 'L2', '4': 'LP2', '5': 'L3', '6': 'LP3' })
    .part('XU', 'terminal', 300, 1650, { value: 'pump motor U' }, { '1': 'U1' })
    .part('XV', 'terminal', 350, 1650, { value: 'pump motor V' }, { '1': 'V1' })
    .part('XW', 'terminal', 400, 1650, { value: 'pump motor W' }, { '1': 'W1' })
    // the 400 V nets' 1 MΩ to ground: a DC path for the simulator only (scope test: not on the board)
    .part('RLI1', 'resistor', -100, 1450, { value: '1M', scope: 'test' }, { '1': 'LIN1', '2': 'GND' }, 1)
    .part('RLI2', 'resistor', -50, 1450, { value: '1M', scope: 'test' }, { '1': 'LIN2', '2': 'GND' }, 1)
    .part('RLI3', 'resistor', 0, 1450, { value: '1M', scope: 'test' }, { '1': 'LIN3', '2': 'GND' }, 1)
    .part('RU1', 'resistor', 300, 1750, { value: '1M', scope: 'test' }, { '1': 'U1', '2': 'GND' }, 1)
    .part('RV1', 'resistor', 350, 1750, { value: '1M', scope: 'test' }, { '1': 'V1', '2': 'GND' }, 1)
    .part('RW1', 'resistor', 400, 1750, { value: '1M', scope: 'test' }, { '1': 'W1', '2': 'GND' }, 1);

  // ---- the inputs: 24 V (from F2) through a PC817 each; low = active
  nb.block('inputs');
  INPUTS.forEach(([k, what], i) => {
    const x = 3100, y = 300 + 120 * i;
    nb.part(`XIN${k}`, 'terminal', x, y, { value: what }, { '1': `PX${k}` })
      .part(`RPX${k}`, 'resistor', x + 100, y, { value: '4.7k' }, { '1': `PX${k}`, '2': `PXA${k}` })
      .part(`UPX${k}`, 'opto', x + 200, y + 50, { value: 'PC817' }, { '1': `PXA${k}`, '2': 'GND', '4': `IN${k}`, '3': 'GND' })
      .part(`DPX${k}`, 'diode', x + 100, y + 80, { value: '1N4148' }, { '2': 'GND', '1': `PXA${k}` }, 1)
      .part(`RIN${k}`, 'resistor', x + 300, y, { value: '10k' }, { '1': 'V5', '2': `IN${k}` }, 1);
  });
  nb.part('XPS', 'terminal', 3100, 1700, { value: 'field +24 V (sensors, buttons, switches; F2)' }, { '1': 'V24I' })
    .part('XPS2', 'terminal', 3150, 1700, { value: 'field +24 V' }, { '1': 'V24I' })
    .part('XPS0', 'terminal', 3200, 1700, { value: 'field 0 V' }, { '1': 'GND' });

  // ---- the READY / FAULT lamp on the door: low side from D10 (fed from V24F, so it can show a
  // fault while the safety rail is off)
  nb.block('lamp')
    .part('XLP1', 'terminal', 2900, 1900, { value: 'lamp READY / FAULT +24 V' }, { '1': 'V24F' })
    .part('XLP2', 'terminal', 2950, 1900, { value: 'lamp READY / FAULT −' }, { '1': 'LMP' })
    .part('RGL', 'resistor', 2900, 2000, { value: '100' }, { '1': 'LAMP', '2': 'GL' })
    .part('RGLD', 'resistor', 2900, 2100, { value: '10k' }, { '1': 'GL', '2': 'GND' }, 1)
    .part('QL', 'nmos', 3000, 2000, { value: 'IRLZ44N' }, { '1': 'GL', '2': 'LMP', '3': 'GND' })
    .part('DTL', 'tvs', 3100, 2050, { value: 'SMAJ33A' }, { '1': 'LMP', '2': 'GND' }, 1);

  // ---- the controller (D67): an Arduino Mega 2560 (5 V I/O) on the board's 5 V. Not simulated:
  // the bench drives its outputs
  const mega: Record<string, string> = { '5V': 'V5', GND: 'GND', A8: 'SRS', A9: 'RBEN', D10: 'LAMP', D11: 'ENABLE' };
  INPUTS.forEach(([k]) => { mega[IN_PIN(Number(k))] = `IN${k}`; });
  OUTPUTS.forEach(([, cmd, , rb], i) => { mega[OUT_PIN[i]] = cmd; mega[`A${i}`] = rb; });
  nb.block('controller').part('UMC', 'mega', 2600, 300, { value: 'Arduino Mega 2560' }, mega);

  nb.v('V24F').v('V24S').v('V24O').v('RBEN').v('C1').v('C2').v('SV1').v('SV2').v('SV3').v('SV4').v('KPA').v('LMP').v('IN8').v('RBS1').v('GS1').v('HSS1').i('RCV1', '1').i('QHS1', '2');
  nb.sim({ type: 'tran', stop: o.stop ?? '1', step: '20u', start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
