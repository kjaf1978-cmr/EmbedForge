// P9 (D24): an electric grass and brush trimmer, cordless: a 36 V Li-ion pack (10 cells,
// 25 … 42 V) and a brushed DC motor (about 500 W: 13 A cutting, a jammed head several hundred
// amperes without a limit). Purely discrete: the trigger switch's main contact feeds the motor and
// the electronics (no standby drain) and its pot sets the speed; releasing it brakes the motor
// (the switch's brake contact shorts it) and resets every protection.
// - Drive: an IRFP4110 below the motor, 20 kHz PWM, an STTH6003 freewheel diode across the motor.
// - PWM: an NE555 clock and ramp (4 … 8 V); a CD4001 NOR latch is set at the start of each
//   period and reset when the ramp passes the set point (the trigger, through a soft start of
//   about 0.5 s) or when the motor current passes 40 A (cycle-by-cycle limit: a jammed head
//   cannot destroy the MOSFET or the motor's brushes).
// - Protections, latched until the trigger is released (an LM339 and an LM393 onto FLTN, a PNP
//   holding it): a jam (the current limit acting for about 1 s), the battery below 27.5 V
//   (the cells' 2.75 V; the pack's BMS is the second line), the MOSFET's heatsink and the motor
//   above 85 °C (an NTC each).
// - Supply: LM317HV to 12 V, TL431 2.5 V reference.

import { NB } from './powerExamples';
import type { Sheet } from './schematic';

export interface TrimmerOptions {
  /** The trigger: the speed pot's position 0 … 1 (1: full), pulled at 0, released at `release`. */
  trigger?: number; release?: number;
  /** The battery's voltage (36 V nominal). */
  vbat?: number;
  /** The head jammed (held still) from `jamAt`; the heatsink's and the motor's temperature. */
  jamAt?: number; tHeatsink?: number; tMotor?: number;
  /** Test timing: the soft-start, jam-timer and power-up capacitors (product 4.7 µF, 6.8 µF, 1 µF). */
  softC?: string; jamC?: string; porC?: string;
  stop?: string;
}

export function trimmer(o: TrimmerOptions = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const V = 'V12', trig = o.trigger ?? 1;
  nb.para('TRIMMER DRIVE (cordless, 36 V Li-ion, brushed motor about 500 W): trigger switch (main contact, speed pot, brake contact); IRFP4110 at 20 kHz with STTH6003 freewheel; NE555 ramp and CD4001 latch set each period, reset by the set point (soft start 0.5 s) or by 40 A (cycle-by-cycle limit); latched stops for a jam (the current limit acting for 1 s), battery below 27.5 V and above 85 °C at the heatsink or the motor; released trigger resets.', -1200, -300);

  // ---- test bench: the pack, the trigger switch (main and brake contacts as MOSFETs), the motor
  nb.block('bench').note('TEST BENCH: the battery pack, the trigger switch, the motor and its load (not part of the board)', -1200, -150)
    .part('VB', 'battery', -1150, 0, { value: String(o.vbat ?? 36), rint: '0.05' }, { '1': 'BAT', '2': 'GND' }, 1)
    // the main contact closes at 0 and opens at `release`; the brake contact closes 5 ms later
    // (the switch's travel between them: break before make)
    .part('VTM', 'vpulse', -1050, 0, { value: '60', low: '0', freq: '1', duty: String(Math.min(99.99, (o.release ?? 10) * 100)), delay: '0', edge: '1u' }, { '1': 'GTM', '2': 'GND' })
    .part('STM', 'nmos', -950, 0, { value: 'IRFP4468' }, { '1': 'GTM', '2': 'BAT', '3': 'VB' })
    .part('VTB', 'vpulse', -1050, 200, { value: '60', low: '0', freq: '1', duty: '99', delay: String((o.release ?? 10) + 5e-3), edge: '1u' }, { '1': 'GTB', '2': 'GND' })
    .part('STB', 'nmos', -950, 200, { value: 'IRFP4468' }, { '1': 'GTB', '2': 'VB', '3': 'DRN' })
    // the speed pot (5k) as its two halves
    .part('RPA', 'resistor', -850, 0, { value: String(Math.max(1, 5000 * (1 - trig))) }, { '1': 'PH', '2': 'WIP' })
    .part('RPB', 'resistor', -850, 100, { value: String(Math.max(1, 5000 * trig)) }, { '1': 'WIP', '2': 'PL' })
    // the motor: 36 V, 9000 rpm no load, 0.12 Ω, 60 µH; the line head's inertia and the grass
    // (a torque rising with speed: 13 A at full speed)
    .part('M1', 'dcmotor', -700, 300, { value: '0.036', ra: '0.12', la: '60u', j: '1.5e-4', b: '6.2e-4', ...(o.jamAt !== undefined ? { obstacle: String(o.jamAt) } : {}) }, { '1': 'VB', '2': 'DRN', '3': 'SPD' });

  // ---- power: input capacitors, the MOSFET, the freewheel diode, the shunt
  nb.block('power')
    .part('XB1', 'terminal', 0, -100, { value: 'battery + (from the trigger\'s main contact)' }, { '1': 'VB' })
    .part('XB2', 'terminal', 0, 0, { value: 'battery −' }, { '1': 'GND' })
    .part('XM1', 'terminal', 0, 100, { value: 'motor +' }, { '1': 'VB' })
    .part('XM2', 'terminal', 0, 200, { value: 'motor − (and the trigger\'s brake contact)' }, { '1': 'DRN' })
    .part('CB1', 'capacitor_pol', 100, 0, { value: '470u', vmax: '63' }, { '1': 'VB', '2': 'GND' }, 1)
    .part('CB2', 'capacitor_pol', 200, 0, { value: '470u', vmax: '63' }, { '1': 'VB', '2': 'GND' }, 1)
    .part('CB3', 'capacitor', 300, 0, { value: '1u', vmax: '100' }, { '1': 'VB', '2': 'GND' }, 1)
    .part('DFW', 'diode', 400, 100, { value: 'STTH6003' }, { '2': 'DRN', '1': 'VB' }, 3)
    .part('QM', 'nmos', 500, 200, { value: 'IRFP4110' }, { '1': 'GM', '2': 'DRN', '3': 'SRC' })
    .part('RGS', 'resistor', 450, 300, { value: '10k' }, { '1': 'GM', '2': 'SRC' }, 1)
    .part('RSH', 'resistor', 600, 300, { value: '0.005', pmax: '3' }, { '1': 'SRC', '2': 'GND' }, 1);

  // ---- supply: 12 V and the 2.5 V reference; the trigger's pot between 8.7 V and 3.8 V
  nb.block('supply')
    .part('U1', 'lm317', 0, 500, { value: 'LM317HV' }, { '3': 'VB', '1': 'ADJ', '2': V })
    .part('RA1', 'resistor', 100, 600, { value: '240' }, { '1': V, '2': 'ADJ' }, 1)
    .part('RA2', 'resistor', 100, 700, { value: '2.05k' }, { '1': 'ADJ', '2': 'GND' }, 1)
    .part('CV1', 'capacitor_pol', 200, 600, { value: '47u', vmax: '25' }, { '1': V, '2': 'GND' }, 1)
    .part('RREF', 'resistor', 300, 500, { value: '2.2k' }, { '1': V, '2': 'VREF' })
    .part('UREF', 'tl431', 300, 650, { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' })
    .part('RPH', 'resistor', 400, 500, { value: '3.3k' }, { '1': V, '2': 'PH' }, 1)
    .part('RPL', 'resistor', 400, 700, { value: '3.9k' }, { '1': 'PL', '2': 'GND' }, 1)
    .part('XT1', 'terminal', 500, 500, { value: 'speed pot (trigger) top' }, { '1': 'PH' })
    .part('XT2', 'terminal', 500, 550, { value: 'speed pot wiper' }, { '1': 'WIP' })
    .part('XT3', 'terminal', 500, 600, { value: 'speed pot bottom' }, { '1': 'PL' })
    // soft start: the set point follows the wiper through 100k into CSS; CSS empties into the
    // 12 V rail when the trigger is released (DSS)
    .part('RSS', 'resistor', 600, 500, { value: '100k' }, { '1': 'WIP', '2': 'SP' })
    .part('CSS', 'capacitor', 650, 600, { value: o.softC ?? '4.7u', vmax: '25' }, { '1': 'SP', '2': 'GND' }, 1)
    .part('DSS', 'diode', 700, 450, { value: '1N4148' }, { '2': 'SP', '1': V }, 3);

  // ---- PWM: NE555 at 20 kHz (ramp on CT, 4 … 8 V; its output low for 2 µs at the end of each
  // period), the CD4001 latch: SET = NOR(555 out, fault), RESET = the ramp above the set point,
// 40 A or a fault
  nb.block('pwm')
    .part('U2', 'timer555', 800, 500, { value: 'NE555' }, { '8': V, '4': V, '1': 'GND', '7': 'DIS', '6': 'CT', '2': 'CT', '3': 'CLK', '5': 'CV' })
    .part('RTA', 'resistor', 900, 400, { value: '6.8k' }, { '1': V, '2': 'DIS' })
    .part('RTB', 'resistor', 900, 500, { value: '330' }, { '1': 'DIS', '2': 'CT' })
    .part('CTT', 'capacitor', 900, 600, { value: '10n', vmax: '50' }, { '1': 'CT', '2': 'GND' }, 1)
    .part('CCV', 'capacitor', 800, 650, { value: '10n', vmax: '50' }, { '1': 'CV', '2': 'GND' }, 1)
    .part('UN1', 'nor2', 1000, 400, { value: V, pkg: 'NR' }, { '1': 'CLK', '2': 'FLT', '3': 'SET' })
    .part('UN2', 'nor2', 1100, 400, { value: V, pkg: 'NR' }, { '1': 'RST', '2': 'QN', '3': 'Q' })
    .part('UN3', 'nor2', 1100, 550, { value: V, pkg: 'NR' }, { '1': 'SET', '2': 'Q', '3': 'QN' })
    // the drive: NOR(QN, SET) = Q, and off while SET is high (a NOR latch has both outputs low
    // while SET and RESET are both high; driving from QN alone gave a 2 µs pulse every period at
    // zero duty, found in simulation). A fault stops the sets and holds the reset
    .part('UN4', 'nor2', 1200, 450, { value: V, pkg: 'NR' }, { '1': 'QN', '2': 'SET', '3': 'DRV' })
    .part('DR3', 'diode', 1250, 750, { value: '1N4148' }, { '2': 'FLT', '1': 'RST' })
    .part('UC1', 'comparator', 1000, 700, { value: 'LM339', pkg: 'CA' }, { '3': 'CT', '2': 'SP', '1': 'RPW', '8': V, '4': 'GND' })
    .part('RPW', 'resistor', 1100, 700, { value: '10k' }, { '1': V, '2': 'RPW' }, 1)
    .part('DR1', 'diode', 1200, 700, { value: '1N4148' }, { '2': 'RPW', '1': 'RST' })
    .part('RSF', 'resistor', 700, 800, { value: '1k' }, { '1': 'SRC', '2': 'SRF' })
    .part('CSF', 'capacitor', 750, 900, { value: '1n', vmax: '50' }, { '1': 'SRF', '2': 'GND' }, 1)
    .part('RCL1', 'resistor', 850, 800, { value: '11.5k' }, { '1': 'VREF', '2': 'VCL' }, 1)
    .part('RCL2', 'resistor', 850, 900, { value: '1k' }, { '1': 'VCL', '2': 'GND' }, 1)
    .part('UC2', 'comparator', 1000, 850, { value: 'LM339', pkg: 'CA' }, { '3': 'SRF', '2': 'VCL', '1': 'RCLO', '8': V, '4': 'GND' })
    .part('RCLP', 'resistor', 1100, 850, { value: '10k' }, { '1': V, '2': 'RCLO' }, 1)
    .part('DR2', 'diode', 1200, 850, { value: '1N4148' }, { '2': 'RCLO', '1': 'RST' })
    .part('RRS', 'resistor', 1300, 800, { value: '100k' }, { '1': 'RST', '2': 'GND' }, 1)
    // gate driver: BD139/BD140 emitter followers, 10 Ω into the gate
    .part('QDH', 'npn', 1300, 450, { value: 'BD139' }, { '1': 'DRV', '2': V, '3': 'GD' })
    .part('QDL', 'pnp', 1300, 550, { value: 'BD140' }, { '1': 'DRV', '2': 'GND', '3': 'GD' })
    .part('RGD', 'resistor', 1400, 500, { value: '10' }, { '1': 'GD', '2': 'GM' })
    .part('CDV', 'capacitor', 1400, 400, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- protections onto FLTN (open collector), latched by QFL (FLT high holds the jam
  // comparator's input up through RLT/DLT); FLT blocks the drive (UN4)
  nb.block('protections')
    // jam: the cycle-by-cycle limit acting period after period for about 1 s. Each limited period
    // charges CLF (DJ, RJS; held by CLS, RJD between periods), RJ/CJ integrate it, and IAV above
    // 2.5 V trips. (The mean shunt current stayed near 7 A in a jam: the limit holds the duty at
    // 18 % and the motor current circulates through the freewheel diode, found in simulation.)
    // through an emitter follower (QJ): 1k straight from RCLO loaded its 10k pull-up below the
    // latch's reset threshold and the limit stopped working (110 A, found in simulation)
    .part('QJ', 'npn', 600, 1000, { value: 'BC547B' }, { '1': 'RCLO', '2': V, '3': 'CLE' })
    .part('DJ', 'diode', 650, 1000, { value: '1N4148' }, { '2': 'CLE', '1': 'CLJ' })
    .part('RJS', 'resistor', 650, 1050, { value: '1k' }, { '1': 'CLJ', '2': 'CLF' })
    .part('CLS', 'capacitor', 600, 1150, { value: '100n', vmax: '25' }, { '1': 'CLF', '2': 'GND' }, 1)
    .part('RJD', 'resistor', 650, 1150, { value: '1M' }, { '1': 'CLF', '2': 'GND' }, 1)
    .part('RJ', 'resistor', 700, 1050, { value: '100k' }, { '1': 'CLF', '2': 'IAV' })
    .part('CJ', 'capacitor', 750, 1150, { value: o.jamC ?? '6.8u', vmax: '16' }, { '1': 'IAV', '2': 'GND' }, 1)
    .part('UC3', 'comparator', 1000, 1050, { value: 'LM339', pkg: 'CA' }, { '3': 'VREF', '2': 'IAV', '1': 'FLTN', '8': V, '4': 'GND' })
    // the battery below 27.5 V (100k/10k: 2.5 V). Also the trigger's release: the input
    // capacitors fall within a millisecond once the main contact opens, so the drive is off before
    // the brake contact closes (with the drive still on, the capacitors discharged through the
    // brake contact and the MOSFET: 836 A, found in simulation)
    .part('RUV1', 'resistor', 700, 1250, { value: '100k' }, { '1': 'VB', '2': 'VBD' })
    .part('RUV2', 'resistor', 700, 1350, { value: '10k' }, { '1': 'VBD', '2': 'GND' }, 1)
    .part('CUV', 'capacitor', 750, 1350, { value: '10n', vmax: '16' }, { '1': 'VBD', '2': 'GND' }, 1)
    .part('UC4', 'comparator', 1000, 1250, { value: 'LM339', pkg: 'CA' }, { '3': 'VBD', '2': 'VREF', '1': 'FLTN', '8': V, '4': 'GND' })
    // above 85 °C: NTC 10k (B 3950) from 10k on VREF: 0.244 V at 85 °C
    .part('RNH', 'resistor', 600, 1450, { value: '10k' }, { '1': 'VREF', '2': 'NTH' })
    .part('RTH', 'ntc', 600, 1550, { value: '10k', temp: String(o.tHeatsink ?? 50) }, { '1': 'NTH', '2': 'GND' }, 1)
    .part('RNM', 'resistor', 700, 1450, { value: '10k' }, { '1': 'VREF', '2': 'NTM' })
    .part('RTM', 'ntc', 700, 1550, { value: '10k', temp: String(o.tMotor ?? 50) }, { '1': 'NTM', '2': 'GND' }, 1)
    .part('ROT1', 'resistor', 850, 1450, { value: '9.31k' }, { '1': 'VREF', '2': 'VOT' }, 1)
    .part('ROT2', 'resistor', 850, 1550, { value: '1k' }, { '1': 'VOT', '2': 'GND' }, 1)
    .part('UC5', 'comparator', 1000, 1450, { value: 'LM393', pkg: 'CB' }, { '3': 'NTH', '2': 'VOT', '1': 'FLTN', '8': V, '4': 'GND' })
    .part('UC6', 'comparator', 1000, 1600, { value: 'LM393', pkg: 'CB' }, { '3': 'NTM', '2': 'VOT', '1': 'FLTN', '8': V, '4': 'GND' })
    .part('RFP', 'resistor', 1150, 1050, { value: '10k' }, { '1': V, '2': 'FLTN' }, 1)
    .part('RFB', 'resistor', 1200, 1150, { value: '10k' }, { '1': 'FLTN', '2': 'BFL' })
    .part('QFL', 'pnp', 1300, 1150, { value: 'BC557B' }, { '1': 'BFL', '2': 'FLT', '3': V })
    .part('ROF', 'resistor', 1300, 1270, { value: '10k' }, { '1': 'FLT', '2': 'GND' }, 1)
    .part('RLT', 'resistor', 1400, 1150, { value: '4.7k' }, { '1': 'FLT', '2': 'LTA' })
    .part('DLT', 'diode', 1400, 1250, { value: '1N4148' }, { '2': 'LTA', '1': 'IAV' })
    // power-up: the latch's feed held off for about 50 ms (QPR), so a comparator settling as the
    // rails rise does not latch a fault
    .part('CPR', 'capacitor', 1500, 1300, { value: o.porC ?? '1u', vmax: '25' }, { '1': V, '2': 'PRA' })
    .part('RPRS', 'resistor', 1550, 1350, { value: '47k' }, { '1': 'PRA', '2': 'BPR' })
    .part('DPR', 'diode', 1500, 1400, { value: '1N4148' }, { '2': 'GND', '1': 'PRA' }, 1)
    .part('RPRB', 'resistor', 1600, 1450, { value: '100k' }, { '1': 'BPR', '2': 'GND' }, 1)
    .part('QPR', 'npn', 1650, 1350, { value: 'BC547B' }, { '1': 'BPR', '2': 'LTA', '3': 'GND' })
    .part('RLF', 'resistor', 1500, 1100, { value: '2.2k' }, { '1': 'FLT', '2': 'LFA' })
    .part('LF', 'led', 1500, 1200, { colour: 'red' }, { '2': 'LFA', '1': 'GND' }, 1)
    .part('CC1', 'capacitor', 1150, 1350, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);
  nb.v('VB').v('DRN').v('GM').v('SP').v('FLTN').v('FLT').v('IAV').v('CLF').v('SPD').v('CT').v('Q').v('RST').v('SET').v('CLK').v('VBD').v('VREF').v('V12').v('NTH').v('NTM').i('QM', '2').i('M1', '1');
  // about 1 µs steps: 20 points a PWM period at 0.1 s, under the 100 000 output points
  const stop = o.stop ?? '0.08';
  nb.sim({ type: 'tran', stop, step: String(Math.max(1e-6, Number(stop) / 90000)), start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
