// P9 (D26, D46): the drive of a grinding machine, 2.5 kW, for every kind the owner names (angle
// and bench grinders, grain mills, meat mincers), from 240 V single-phase or a 24 V battery.
//
// Motor: a brushed permanent-magnet DC motor (180 V for the mains drive, 24 V for the battery
// drive, 2.5 kW at 3000 rpm): full torque from standstill (torque ∝ armature current, held by the
// current limit), speed by its armature voltage, no inverter. The kind of machine is a matter of
// the belt or gearbox (an angle grinder's 6000–10 000 rpm up, a mill's or mincer's 100–300 rpm
// down) and of four trimmers: maximum speed, minimum speed, acceleration time and the current
// (torque) limit; a fifth adds IR compensation (speed held under load). FAQ: the settings per kind.
//
// Power stage: a half-bridge with the motor from its switch node to ground through a shunt, so the
// shunt carries the motor's current at all times (in the switch and in the freewheel path):
// - 240 V: the mains through a C16 breaker (panel), a 14D471K varistor, X2 capacitor, the main
//   contactor KM and a GBPC3510 bridge onto a 20 µF film bus (small: the line current follows the
//   motor's, power factor about 0.9 at full load, where a large electrolytic bus would draw 17 A
//   r.m.s. in peaks). The high side an IKW50N60T IGBT driven by an IR2184-type bootstrap driver;
//   the low side an IKW50N60T held off, its diode the freewheel path (the small bus cannot take
//   the motor's energy back: no synchronous rectification, no regeneration).
// - 24 V: the battery through a 200 A fuse and a 250 A DC contactor KM; three IRFP4468 high and
//   three low (synchronous: the low side switched too, the motor's energy on deceleration goes back
//   to the battery), 8 × 2200 µF and film.
// - The shunt: 10 mΩ (240 V) or 0.5 mΩ four-terminal (24 V), amplified to 1.5 V at the rated
//   current (15.5 A / 120 A).
//
// Control (12 V, the same board for both; the scaling resistors differ):
// - Run chain (24 V, hardware): E-STOP (NC), STOP (NC), the motor's thermal switch (NC), on 240 V
//   the reversing switch's auxiliary contact (open in its middle position), then START (NO) in
//   parallel with K1's holding contact into the coils of K1 and KM, their return through QEN.
//   No restart after a power cut or a stop without pressing START again. A latched fault switches
//   QEN off, which drops K1 and KM; the latch clears when K1 is off, and START is needed.
// - Speed: the speed pot between the MIN and MAX trimmers' levels, through the ACCEL trimmer into
//   4.7 µF (0.1 … 5 s ramp; held at zero while K1 is off: every start is a soft start); the
//   armature voltage (divided, 1 ms filter) is the feedback; a PI amplifier (LM358) sets the duty.
// - Torque: the motor current, cycle by cycle against the CURRENT LIMIT trimmer (up to 150 % of
//   the rated current): the motor delivers full torque at any speed and cannot be overloaded at
//   standstill.
// - PWM: an NE555 ramp at 20 kHz and a CD4001 latch (set each period, reset by the duty or by the
//   current limit), as in the trimmer drive; the driver's SD holds both switches off while K1 is
//   off or a fault is latched.
// - Faults (LM339/LM393 onto FLTN, latched by a CD4001): stall (the current limit acting for about
//   3 s), overload (the mean motor current above 115 % of rated for about 20 s), the heatsink above
//   85 °C (NTC), and on 24 V the battery below 21 V.
// - Supplies: 240 V: a 230/18 V 10 VA transformer (before KM) and a bridge for the 24 V coils,
//   a 7812 for the control; 24 V: the battery through the key switch, a 7812.
// The control is not isolated from the mains on the 240 V drive (its ground is the bridge's
// negative): the speed pot and the buttons are mains-rated with insulated actuators, the enclosure
// is closed (DFMEA GR-9).

import { NB } from './powerExamples';
import type { Sheet } from './schematic';

export interface GrinderOptions {
  /** The supply: 240 V single-phase (default) or a 24 V battery. */
  supply?: '240' | '24';
  /** START pressed at `start` (for 0.1 s); STOP at `stopAt`; the E-stop from `estop`; the mains
   *  (or the key switch) off from `powerOff` and back at `powerOn`. */
  start?: number; stopAt?: number; estop?: number; powerOff?: number; powerOn?: number;
  /** The speed pot's position 0 … 1 and the trimmers (0 … 100 %): maximum and minimum speed,
   *  acceleration, current limit, IR compensation. */
  speed?: number; maxSpeed?: number; minSpeed?: number; accel?: number; currentLimit?: number; irComp?: number;
  /** The load: torque in N·m rising with speed (`load` at the rated speed); the shaft held still
   *  from `jamAt`; the heatsink's temperature; the battery's voltage. */
  load?: number; jamAt?: number; tHeatsink?: number; vbat?: number;
  /** Test timing (the product values in brackets): the ramp capacitor (4.7 µF), the stall timer
   *  (10 µF), the overload filter (22 µF), the inertia of motor and tool (kg·m²). */
  accelC?: string; stallC?: string; overloadC?: string; inertia?: number;
  stop?: string;
}

/** The two drives' motors and scaling. */
export const GRINDER = {
  '240': { vmot: 180, irated: 15.5, k: 0.534, ra: 0.8, la: '8m', rsh: '0.01', gain: 10, fb: ['453k', '453k', '10k'] as const },
  '24': { vmot: 24, irated: 120, k: 0.0718, ra: 0.012, la: '60u', rsh: '0.0005', gain: 25, fb: ['110k', '0', '10k'] as const },
};

export function grinder(o: GrinderOptions = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const mains = (o.supply ?? '240') === '240', G = GRINDER[mains ? '240' : '24'], V = 'V12';
  const pos = (x: number | undefined, d: number) => String(Math.round(Math.min(100, Math.max(0, (x ?? d) * 100)) * 10) / 10);
  nb.para(`GRINDER DRIVE 2.5 kW (D26), ${mains ? '240 V single-phase, 180 V DC motor' : '24 V battery, 24 V DC motor'}: half-bridge with the motor through a shunt to ground; speed by armature voltage and PI, torque by a cycle-by-cycle current limit; trimmers for maximum and minimum speed, acceleration, current limit and IR compensation; run chain E-STOP, STOP, motor thermal switch, START with a holding contact (no restart without START); latched stall, overload and heatsink faults.`, -1200, -300);

  // ---- test bench: the supply, the operator's buttons, the motor and its load
  const stopT = Number(o.stop ?? 0.3);
  const win = (from: number | undefined, to: number | undefined, high = '34') => from === undefined
    ? { value: high, low: '0', freq: '0.1', duty: '100', delay: '0', edge: '1u' }
    : { value: '0', low: high, freq: '0.1', duty: String(Math.max(0.0001, ((to ?? stopT + 1) - from) * 10)), delay: String(from), edge: '1u' };
  nb.block('bench').note('TEST BENCH: the supply, the operator, the motor and its load (not part of the board)', -1200, -150);
  if (mains) {
    // the mains through the breaker; switched off (a power cut) from powerOff to powerOn
    nb.part('VM', 'vsin', -1150, 0, { value: '339.4', freq: '50' }, { '1': 'LS', '2': 'N' })
      .part('VPC', 'vpulse', -1050, 0, win(o.powerOff, o.powerOn, '24'), { '1': 'GPC', '2': 'GND' })
      .part('SPC', 'relay', -950, 0, { value: '24 V 30 A' }, { '1': 'GPC', '2': 'GND', '3': 'LS', '5': 'LB' })
      .part('RLB', 'resistor', -950, 100, { value: '0.05' }, { '1': 'LB', '2': 'L' })
      // the supply's neutral earthed (a DC path for the simulator: N is not the drive's ground)
      .part('RNE', 'resistor', -1050, 150, { value: '1M' }, { '1': 'N', '2': 'GND' }, 1);
  } else {
    nb.part('VB', 'battery', -1150, 0, { value: String(o.vbat ?? 26), rint: '0.008' }, { '1': 'BATS', '2': 'GND' }, 1)
      .part('VPC', 'vpulse', -1050, 0, win(o.powerOff, o.powerOn, '45'), { '1': 'GPC', '2': 'GND' })
      .part('SPC', 'nmos', -950, 0, { value: 'IRFP4468' }, { '1': 'GPC', '2': 'BATS', '3': 'BAT' });
  }
  // START (NO): pressed for 0.1 s from `start`; STOP (NC) opens at stopAt; the E-stop (NC) at estop
  const pulse = (at: number | undefined, len: number) => at === undefined ? { value: '0', low: '0', freq: '0.1', duty: '0', delay: '0', edge: '1u' }
    : { value: '34', low: '0', freq: '0.1', duty: String(len * 10), delay: String(at), edge: '1u' };
  nb.part('VST', 'vpulse', -850, 0, pulse(o.start ?? 0.005, 0.1), { '1': 'GST', '2': 'GND' })
    .part('SST', 'nmos', -750, 0, { value: 'IRLZ44N' }, { '1': 'GST', '2': 'RV', '3': 'CH2' })
    .part('VSP', 'vpulse', -850, 150, win(o.stopAt, undefined), { '1': 'GSP', '2': 'GND' })
    .part('SSP', 'nmos', -750, 150, { value: 'IRLZ44N' }, { '1': 'GSP', '2': 'ESO', '3': 'STO' })
    .part('VES', 'vpulse', -850, 300, win(o.estop, undefined), { '1': 'GES', '2': 'GND' })
    .part('SES', 'nmos', -750, 300, { value: 'IRLZ44N' }, { '1': 'GES', '2': 'V24', '3': 'ESO' })
    // the motor's thermal switch (closed) and, on 240 V, the reversing switch's auxiliary contact
    .part('STH', 'switch', -650, 150, { closed: 'true' }, { '1': 'STO', '2': mains ? 'THO' : 'RV' });
  if (mains) nb.part('SRV', 'switch', -650, 300, { closed: 'true' }, { '1': 'THO', '2': 'RV' });
  // the speed pot (10k) between MAX and MIN
  const sp = o.speed ?? 1;
  nb.part('RVS', 'potentiometer', -550, 0, { value: '10k', position: pos(sp, 1) }, { '1': 'SMN', '2': 'WIP', '3': 'SMX' })
    // the motor and its tool: a load torque rising with speed (b = load / rated speed)
    .part('M1', 'dcmotor', -450, 300, { value: String(G.k), ra: String(G.ra), la: G.la, j: String(o.inertia ?? 0.004), b: String(Math.max(1e-6, (o.load ?? 0) / 314)),
      ...(o.jamAt !== undefined ? { obstacle: String(o.jamAt) } : {}) }, { '1': 'SWN', '2': 'SHN', '3': 'SPD' });

  // ---- power stage
  nb.block('power');
  if (mains) {
    nb.part('XL', 'terminal', 0, -100, { value: 'L (from the C16 breaker)' }, { '1': 'L' })
      .part('XN', 'terminal', 0, 0, { value: 'N' }, { '1': 'N' })
      .part('RV1', 'mov', 100, 0, { value: '14D471K' }, { '1': 'L', '2': 'N' }, 1)
      .part('CX1', 'capacitor', 150, 0, { value: '1u', vmax: '630' }, { '1': 'L', '2': 'N' }, 1)
      // the main contactor (24 V DC coil): both poles
      .part('KM', 'contactor', 250, -50, { value: '18 A, coil 24 V DC' }, { A1: 'CH2', A2: 'CR', '1': 'L', '2': 'LK', '3': 'N', '4': 'NK' })
      .part('BR1', 'bridge', 350, 0, { value: 'GBPC3510' }, { '1': 'LK', '2': 'NK', '3': 'BUS', '4': 'GND' })
      .part('CB1', 'capacitor', 450, 0, { value: '10u', vmax: '450' }, { '1': 'BUS', '2': 'GND' }, 1)
      .part('CB2', 'capacitor', 500, 0, { value: '10u', vmax: '450' }, { '1': 'BUS', '2': 'GND' }, 1)
      .part('RBL', 'resistor', 550, 0, { value: '220k', pmax: '1' }, { '1': 'BUS', '2': 'GND' }, 1)
      .part('QH', 'igbt', 650, -50, { value: 'IKW50N60T' }, { '1': 'GH', '2': 'BUS', '3': 'SWN' })
      .part('RGH', 'resistor', 600, -100, { value: '10' }, { '1': 'HO', '2': 'GH' })
      .part('RGHE', 'resistor', 700, -100, { value: '10k' }, { '1': 'GH', '2': 'SWN' }, 1)
      // the low side held off: its diode is the freewheel path
      .part('QL', 'igbt', 650, 100, { value: 'IKW50N60T' }, { '1': 'GL', '2': 'SWN', '3': 'GND' })
      .part('RGLE', 'resistor', 600, 150, { value: '10k' }, { '1': 'GL', '2': 'GND' }, 1);
  } else {
    nb.part('XBP', 'terminal', 0, -100, { value: 'battery + (through the 200 A fuse and KM)' }, { '1': 'BUS' })
      .part('XBN', 'terminal', 0, 0, { value: 'battery −' }, { '1': 'GND' })
      .part('F1', 'fuse', 100, -100, { value: '200', r: '0.0003' }, { '1': 'BAT', '2': 'BATF' })
      .part('KM', 'contactor', 250, -50, { value: '250 A DC, coil 24 V' }, { A1: 'CH2', A2: 'CR', '1': 'BATF', '2': 'BUS' });
    for (let k = 1; k <= 8; k++) nb.part(`CB${k}`, 'capacitor_pol', 300 + 50 * k, 0, { value: '2200u', vmax: '35' }, { '1': 'BUS', '2': 'GND' }, 1);
    nb.part('CBF1', 'capacitor', 750, 0, { value: '10u', vmax: '100' }, { '1': 'BUS', '2': 'GND' }, 1)
      .part('CBF2', 'capacitor', 800, 0, { value: '10u', vmax: '100' }, { '1': 'BUS', '2': 'GND' }, 1);
    for (let k = 1; k <= 3; k++) {
      nb.part(`QH${k}`, 'nmos', 800 + 100 * k, -50, { value: 'IRFP4468' }, { '1': `GH${k}`, '2': 'BUS', '3': 'SWN' })
        .part(`RGH${k}`, 'resistor', 850 + 100 * k, -100, { value: '4.7' }, { '1': 'HO', '2': `GH${k}` })
        .part(`QL${k}`, 'nmos', 800 + 100 * k, 100, { value: 'IRFP4468' }, { '1': `GL${k}`, '2': 'SWN', '3': 'GND' })
        .part(`RGL${k}`, 'resistor', 850 + 100 * k, 150, { value: '4.7' }, { '1': 'LO', '2': `GL${k}` });
    }
    nb.part('RGHE', 'resistor', 1250, -100, { value: '10k' }, { '1': 'HO', '2': 'SWN' }, 1)
      .part('RGLE', 'resistor', 1250, 150, { value: '10k' }, { '1': 'LO', '2': 'GND' }, 1);
  }
  nb.part('XM1', 'terminal', 900, 300, { value: mains ? 'motor A+ (through the reversing switch)' : 'motor A+' }, { '1': 'SWN' })
    .part('XM2', 'terminal', 900, 350, { value: mains ? 'motor A− (through the reversing switch)' : 'motor A−' }, { '1': 'SHN' })
    .part('RSH', 'resistor', 1000, 400, { value: G.rsh, pmax: mains ? '5' : '10' }, { '1': 'SHN', '2': 'GND' }, 1)
    // the half-bridge driver and its bootstrap; SD low (K1 off or a fault) holds both off
    .part('UD', 'hbdriver', 1100, 300, { value: 'IR2184-type 600 V' }, { '1': 'DRV', '2': 'SDN', '8': V, '3': 'GND', '7': 'VBS', '6': 'HO', '5': 'SWN', '4': mains ? 'nc_LO' : 'LO' })
    .part('DBS', 'diode', 1200, 250, { value: 'UF4007' }, { '2': V, '1': 'VBS' })
    .part('CBS', 'capacitor', 1250, 350, { value: '1u', vmax: '50' }, { '1': 'VBS', '2': 'SWN' }, 1)
    .part('CDD', 'capacitor', 1150, 400, { value: '10u', vmax: '25' }, { '1': V, '2': 'GND' }, 1);

  // ---- supplies: 24 V for the coils, 12 V for the control, 2.5 V reference
  nb.block('supply');
  if (mains) {
    nb.part('F2', 'fuse', 0, 500, { value: '0.2' }, { '1': 'L', '2': 'LT' })
      .part('TR1', 'transformer', 100, 500, { value: '0.0783', lp: '10', rp: '60', rs: '0.8', k: '0.995' }, { '1': 'LT', '2': 'N', '3': 'TA', '4': 'TB' })
      .part('BR2', 'bridge', 200, 500, { value: 'KBP206' }, { '1': 'TA', '2': 'TB', '3': 'V24', '4': 'GND' })
      .part('C24', 'capacitor_pol', 300, 550, { value: '1000u', vmax: '50' }, { '1': 'V24', '2': 'GND' }, 1);
  } else {
    nb.part('XK1', 'terminal', 0, 500, { value: 'key switch (from battery +)' }, { '1': 'BAT' })
      .part('XK2', 'terminal', 0, 550, { value: 'key switch (to the drive)' }, { '1': 'VK' })
      .part('SK', 'switch', -100, 525, { closed: 'true' }, { '1': 'BAT', '2': 'VK' })
      .part('F2', 'fuse', 100, 500, { value: '2' }, { '1': 'VK', '2': 'V24' })
      .part('C24', 'capacitor_pol', 300, 550, { value: '220u', vmax: '50' }, { '1': 'V24', '2': 'GND' }, 1);
  }
  nb.part('U1', 'regulator', 400, 500, { value: '7812' }, { '1': 'V24', '2': 'GND', '3': V })
    .part('C12', 'capacitor_pol', 500, 550, { value: '47u', vmax: '25' }, { '1': V, '2': 'GND' }, 1)
    // the reference fed with 20 mA: the trimmers and dividers on it draw about 7 mA (with 2.2k the
    // TL431 starved and every threshold sagged: the current limit at 74 % of its setting, found in
    // simulation)
    .part('RREF', 'resistor', 600, 500, { value: '470', pmax: '0.5' }, { '1': V, '2': 'VREF' })
    .part('UREF', 'tl431', 600, 650, { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' });

  // ---- the run chain: E-STOP, STOP, the motor's thermal switch (and the reversing switch's
  // auxiliary contact), START or K1's holding contact, the coils of K1 and KM through QEN
  nb.block('run')
    .part('XES1', 'terminal', 0, 800, { value: 'E-STOP (NC) from +24 V' }, { '1': 'V24' })
    .part('XES2', 'terminal', 0, 850, { value: 'E-STOP (NC) return' }, { '1': 'ESO' })
    .part('XSP1', 'terminal', 0, 900, { value: 'STOP (NC)' }, { '1': 'ESO' })
    .part('XSP2', 'terminal', 0, 950, { value: 'STOP (NC) return' }, { '1': 'STO' })
    .part('XTH1', 'terminal', 0, 1000, { value: 'motor thermal switch (NC)' }, { '1': 'STO' })
    .part('XTH2', 'terminal', 0, 1050, { value: 'motor thermal switch return' }, { '1': mains ? 'THO' : 'RV' });
  if (mains) nb.part('XRV1', 'terminal', 0, 1100, { value: 'reversing switch auxiliary (closed in FWD and REV)' }, { '1': 'THO' })
    .part('XRV2', 'terminal', 0, 1150, { value: 'reversing switch auxiliary return' }, { '1': 'RV' });
  nb.part('XSA1', 'terminal', 0, 1200, { value: 'START (NO)' }, { '1': 'RV' })
    .part('XSA2', 'terminal', 0, 1250, { value: 'START (NO) return' }, { '1': 'CH2' })
    .part('K1', 'contactor', 200, 900, { value: '9 A, coil 24 V DC' }, { A1: 'CH2', A2: 'CR', '13': 'RV', '14': 'CH2', '1': V, '2': 'EN' })
    .part('DK1', 'diode', 300, 950, { value: '1N4007' }, { '2': 'CR', '1': 'CH2' }, 3)
    .part('QEN', 'nmos', 300, 1050, { value: 'IRLZ44N' }, { '1': 'OKG', '2': 'CR', '3': 'GND' })
    .part('ROK', 'resistor', 400, 1000, { value: '1k' }, { '1': 'OK', '2': 'OKG' })
    .part('ROKD', 'resistor', 400, 1100, { value: '100k' }, { '1': 'OKG', '2': 'GND' }, 1)
    .part('REN', 'resistor', 300, 850, { value: '10k' }, { '1': 'EN', '2': 'GND' }, 1)
    .part('LRN', 'led', 450, 850, { colour: 'green' }, { '2': 'ENL', '1': 'GND' }, 1)
    .part('RLR', 'resistor', 400, 800, { value: '2.2k' }, { '1': 'EN', '2': 'ENL' });

  // ---- speed: MAX and MIN set the speed pot's ends; ACCEL into 4.7 µF; the ramp held at zero
  // while K1 is off
  nb.block('speed')
    .part('RVMX', 'potentiometer', 600, 800, { value: '1k', position: pos(o.maxSpeed, 0.8) }, { '1': 'GND', '2': 'SMX', '3': 'VREF' })
    .part('RVMN', 'potentiometer', 700, 800, { value: '1k', position: pos(o.minSpeed, 0) }, { '1': 'GND', '2': 'SMN', '3': 'VMN' })
    .part('RMN', 'resistor', 700, 700, { value: '3.9k' }, { '1': 'VREF', '2': 'VMN' }, 1)
    .part('XS1', 'terminal', 800, 750, { value: 'speed pot top' }, { '1': 'SMX' })
    .part('XS2', 'terminal', 800, 800, { value: 'speed pot wiper' }, { '1': 'WIP' })
    .part('XS3', 'terminal', 800, 850, { value: 'speed pot bottom' }, { '1': 'SMN' })
    .part('RVAC', 'potentiometer', 900, 800, { value: '1M', position: pos(o.accel, 0.2) }, { '1': 'WIP', '2': 'ACW', '3': 'ACW' })
    .part('RAC', 'resistor', 1000, 800, { value: '22k' }, { '1': 'ACW', '2': 'SPR' })
    .part('CAC', 'capacitor', 1050, 900, { value: o.accelC ?? '4.7u', vmax: '25' }, { '1': 'SPR', '2': 'GND' }, 1)
    .part('QRC', 'nmos', 1100, 850, { value: '2N7000' }, { '1': 'ENN', '2': 'SPR', '3': 'GND' })
    // feedback: the armature voltage (the switch node; the shunt's few tens of mV aside), 2 V at
    // the rated 180 V or 24 V, filtered 1 ms
    .part('RFB1', 'resistor', 600, 1000, { value: G.fb[0], pmax: '0.5' }, { '1': 'SWN', '2': mains ? 'FBA' : 'FBD' });
  if (mains) nb.part('RFB2', 'resistor', 650, 1000, { value: G.fb[1], pmax: '0.5' }, { '1': 'FBA', '2': 'FBD' });
  nb.part('RFB3', 'resistor', 700, 1100, { value: G.fb[2] }, { '1': 'FBD', '2': 'GND' }, 1)
    .part('CFB', 'capacitor', 750, 1100, { value: '100n', vmax: '50' }, { '1': 'FBD', '2': 'GND' }, 1)
    // the motor current: 1.5 V at the rated current (×10 or ×25)
    .part('RIS', 'resistor', 600, 1250, { value: '1k' }, { '1': 'SHN', '2': 'ISP' })
    .part('CIS', 'capacitor', 650, 1350, { value: '1n', vmax: '50' }, { '1': 'ISP', '2': 'GND' }, 1)
    .part('UA', 'opamp', 750, 1250, { value: 'LM358' }, { '3': 'ISP', '2': 'ISN', '6': 'ISA', '7': V, '4': 'GND' })
    .part('RG1', 'resistor', 750, 1350, { value: '1k' }, { '1': 'ISN', '2': 'GND' }, 1)
    .part('RG2', 'resistor', 850, 1350, { value: mains ? '9.09k' : '24.3k' }, { '1': 'ISA', '2': 'ISN' })
    // IR compensation: the set point raised with the current (IR COMP trimmer: 10k against
    // 100k … 1.1M, up to 9 % of the current signal; MAX is set after it)
    .part('RSC', 'resistor', 1000, 1000, { value: '10k' }, { '1': 'SPB', '2': 'SPC' })
    // the ramp buffered: the IR COMP network straight on the ramp capacitor pulled the set point
    // down to 60 % (found in simulation)
    .part('UC', 'opamp', 950, 900, { value: 'LM358' }, { '3': 'SPR', '2': 'SPB', '6': 'SPB', '7': V, '4': 'GND' })
    .part('RVIR', 'potentiometer', 1000, 1100, { value: '1M', position: pos(o.irComp, 0.5) }, { '1': 'ISA', '2': 'IRW', '3': 'IRW' })
    .part('RIR', 'resistor', 1050, 1150, { value: '100k' }, { '1': 'IRW', '2': 'SPC' })
    // the speed amplifier: PI (100k; 2.2M + 100 nF: proportional gain 22, integral 0.22 s), its
    // integrator shorted while K1 is off (at a gain of 4.7 the motor lagged its ramp by half)
    .part('RIN', 'resistor', 1100, 1000, { value: '100k' }, { '1': 'FBD', '2': 'PIN' })
    .part('UB', 'opamp', 1200, 1000, { value: 'LM358' }, { '3': 'SPC', '2': 'PIN', '6': 'DUT', '7': V, '4': 'GND' })
    .part('RPI', 'resistor', 1250, 1100, { value: '2.2M' }, { '1': 'DUT', '2': 'PIX' })
    .part('CPI', 'capacitor', 1300, 1100, { value: '100n', vmax: '50' }, { '1': 'PIX', '2': 'PIN' })
    .part('QIR', 'nmos', 1350, 1150, { value: '2N7000' }, { '1': 'ENN', '2': 'PIX', '3': 'PIN' })
    .part('RVCL', 'potentiometer', 1100, 1250, { value: '1k', position: pos(o.currentLimit, 0.9) }, { '1': 'GND', '2': 'VCL', '3': 'VREF' })
    .part('CCL', 'capacitor', 1150, 1350, { value: '100n', vmax: '50' }, { '1': 'VCL', '2': 'GND' }, 1);

  // ---- PWM: NE555 ramp 4 … 8 V at 20 kHz; CD4001 latch set each period, reset by the duty or
  // the current limit; DRV = NOR(QN, SET)
  nb.block('pwm')
    .part('U2', 'timer555', 1400, 500, { value: 'NE555' }, { '8': V, '4': V, '1': 'GND', '7': 'DIS', '6': 'CT', '2': 'CT', '3': 'CLK', '5': 'CV' })
    .part('RTA', 'resistor', 1500, 400, { value: '6.8k' }, { '1': V, '2': 'DIS' })
    .part('RTB', 'resistor', 1500, 500, { value: '330' }, { '1': 'DIS', '2': 'CT' })
    .part('CTT', 'capacitor', 1500, 600, { value: '10n', vmax: '50' }, { '1': 'CT', '2': 'GND' }, 1)
    .part('CCV', 'capacitor', 1400, 650, { value: '10n', vmax: '50' }, { '1': 'CV', '2': 'GND' }, 1)
    .part('UN1', 'nor2', 1600, 400, { value: V, pkg: 'NR' }, { '1': 'CLK', '2': 'FLT', '3': 'SET' })
    .part('UN2', 'nor2', 1700, 400, { value: V, pkg: 'NR' }, { '1': 'RST', '2': 'QN', '3': 'Q' })
    .part('UN3', 'nor2', 1700, 550, { value: V, pkg: 'NR' }, { '1': 'SET', '2': 'Q', '3': 'QN' })
    .part('UN4', 'nor2', 1800, 450, { value: V, pkg: 'NR' }, { '1': 'QN', '2': 'SET', '3': 'DRV' })
    .part('UC1', 'comparator', 1600, 700, { value: 'LM339', pkg: 'CA' }, { '3': 'CT', '2': 'DUT', '1': 'RPW', '8': V, '4': 'GND' })
    .part('RPW', 'resistor', 1700, 700, { value: '10k' }, { '1': V, '2': 'RPW' }, 1)
    .part('DR1', 'diode', 1800, 700, { value: '1N4148' }, { '2': 'RPW', '1': 'RST' })
    .part('UC2', 'comparator', 1600, 850, { value: 'LM339', pkg: 'CA' }, { '3': 'ISA', '2': 'VCL', '1': 'RCLO', '8': V, '4': 'GND' })
    .part('RCLP', 'resistor', 1700, 850, { value: '10k' }, { '1': V, '2': 'RCLO' }, 1)
    .part('DR2', 'diode', 1800, 850, { value: '1N4148' }, { '2': 'RCLO', '1': 'RST' })
    .part('RRS', 'resistor', 1900, 800, { value: '100k' }, { '1': 'RST', '2': 'GND' }, 1)
    // SD: high only while K1 is on (EN) and no fault is latched (OK)
    .part('RSD', 'resistor', 1900, 300, { value: '10k' }, { '1': 'EN', '2': 'SDN' })
    .part('DSD', 'diode', 2000, 300, { value: '1N4148' }, { '2': 'SDN', '1': 'OK' })
    .part('CC1', 'capacitor', 1900, 500, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- protections onto FLTN, latched by a CD4001 (cleared while K1 is off)
  nb.block('protections')
    // stall: the current limit acting period after period (its flag through QJ), about 3 s
    .part('QJ', 'npn', 600, 1500, { value: 'BC547B' }, { '1': 'RCLO', '2': V, '3': 'CLE' })
    .part('DJ', 'diode', 650, 1500, { value: '1N4148' }, { '2': 'CLE', '1': 'CLJ' })
    .part('RJS', 'resistor', 650, 1550, { value: '1k' }, { '1': 'CLJ', '2': 'CLF' })
    .part('CLS', 'capacitor', 600, 1650, { value: '100n', vmax: '25' }, { '1': 'CLF', '2': 'GND' }, 1)
    .part('RJD', 'resistor', 650, 1650, { value: '1M' }, { '1': 'CLF', '2': 'GND' }, 1)
    .part('RJ', 'resistor', 700, 1550, { value: '330k' }, { '1': 'CLF', '2': 'IAV' })
    .part('CJ', 'capacitor', 750, 1650, { value: o.stallC ?? '10u', vmax: '16' }, { '1': 'IAV', '2': 'GND' }, 1)
    .part('RJB', 'resistor', 800, 1650, { value: '1M' }, { '1': 'IAV', '2': 'GND' }, 1)
    .part('UC3', 'comparator', 1000, 1550, { value: 'LM339', pkg: 'CA' }, { '3': 'VREF', '2': 'IAV', '1': 'FLTN', '8': V, '4': 'GND' })
    // overload: the motor current filtered 20 s above 1.73 V (115 % of rated)
    .part('ROL', 'resistor', 600, 1750, { value: '1M' }, { '1': 'ISA', '2': 'IOL' })
    .part('COL', 'capacitor', 650, 1850, { value: o.overloadC ?? '22u', vmax: '16' }, { '1': 'IOL', '2': 'GND' }, 1)
    .part('ROV1', 'resistor', 700, 1750, { value: '4.42k' }, { '1': 'VREF', '2': 'VOL' }, 1)
    .part('ROV2', 'resistor', 700, 1850, { value: '10k' }, { '1': 'VOL', '2': 'GND' }, 1)
    .part('UC4', 'comparator', 1000, 1750, { value: 'LM339', pkg: 'CA' }, { '3': 'VOL', '2': 'IOL', '1': 'FLTN', '8': V, '4': 'GND' })
    // the heatsink above 85 °C: NTC 10k from 10k on VREF, 0.244 V
    .part('RNH', 'resistor', 600, 1950, { value: '10k' }, { '1': 'VREF', '2': 'NTH' })
    .part('RTH', 'ntc', 600, 2050, { value: '10k', temp: String(o.tHeatsink ?? 40) }, { '1': 'NTH', '2': 'GND' }, 1)
    .part('ROT1', 'resistor', 700, 1950, { value: '9.31k' }, { '1': 'VREF', '2': 'VOT' }, 1)
    .part('ROT2', 'resistor', 700, 2050, { value: '1k' }, { '1': 'VOT', '2': 'GND' }, 1)
    .part('UC5', 'comparator', 1000, 1950, { value: 'LM393', pkg: 'CB' }, { '3': 'NTH', '2': 'VOT', '1': 'FLTN', '8': V, '4': 'GND' });
  if (!mains) nb.part('RUV1', 'resistor', 800, 1950, { value: '73.2k' }, { '1': 'V24', '2': 'VBD' })
    // the battery below 21 V (73.2k/10k: 2.5 V)
    .part('RUV2', 'resistor', 800, 2050, { value: '10k' }, { '1': 'VBD', '2': 'GND' }, 1)
    .part('CUV', 'capacitor', 850, 2050, { value: '100n', vmax: '16' }, { '1': 'VBD', '2': 'GND' }, 1)
    .part('UC6', 'comparator', 1000, 2100, { value: 'LM393', pkg: 'CB' }, { '3': 'VBD', '2': 'VREF', '1': 'FLTN', '8': V, '4': 'GND' });
  else nb.part('UC6', 'comparator', 1000, 2100, { value: 'LM393', pkg: 'CB' }, { '3': 'VREF', '2': 'GND', '1': 'nc_UC6', '8': V, '4': 'GND' });
  nb.part('RFP', 'resistor', 1150, 1550, { value: '10k' }, { '1': V, '2': 'FLTN' }, 1)
    // the latch: FAULT = NOT FLTN sets it; NOT EN (K1 off) clears it; OK = its Q̄
    .part('UN5', 'nor2', 1300, 1550, { value: V, pkg: 'NL' }, { '1': 'FLTN', '2': 'FLTN', '3': 'FLTH' })
    .part('UN6', 'nor2', 1300, 1700, { value: V, pkg: 'NL' }, { '1': 'EN', '2': 'EN', '3': 'ENN' })
    .part('UN7', 'nor2', 1450, 1550, { value: V, pkg: 'NL' }, { '1': 'ENN', '2': 'OK', '3': 'FLT' })
    .part('UN8', 'nor2', 1450, 1700, { value: V, pkg: 'NL' }, { '1': 'FLTH', '2': 'FLT', '3': 'OK' })
    .part('RLF', 'resistor', 1600, 1550, { value: '2.2k' }, { '1': 'FLT', '2': 'LFA' })
    .part('LF', 'led', 1600, 1650, { colour: 'red' }, { '2': 'LFA', '1': 'GND' }, 1)
    .part('CC2', 'capacitor', 1150, 1700, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  nb.v('VREF').v('VBS').v('HO').v('DRV').v('RST').v('SDN').v('SPB').v('SWN').v('SHN').v('BUS').v('ISA').v('DUT').v('SPR').v('FBD').v('EN').v('OK').v('FLT').v('FLTN').v('IAV').v('IOL').v('CH2').v('SPD').v('V24').v('V12').v('VCL')
    .i('M1', '1').i('RSH', '1');
  if (mains) nb.i('BR1', '1');
  const stop = o.stop ?? '0.3';
  nb.sim({ type: 'tran', stop, step: String(Math.max(1e-6, Number(stop) / 90000)), start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
