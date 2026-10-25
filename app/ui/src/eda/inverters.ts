// Inverters (P7, decision D30). This file: the low-frequency (50 Hz transformer) unit, 48 V
// LiFePO4 battery to 230 V 50 Hz, 5 kW, designed against the DFMEA (DFMEA.md section 5) from
// discrete catalogue parts and drawn as the product (D28: wired, terminals, real supplies).

import { NB } from './powerExamples';
import type { Sheet } from './schematic';
import { connectivity } from './connectivity';
import { parseValue } from './units';

/** Options of the 50 Hz-transformer inverter: battery voltage (V), load (Ω at 230 V; 0: none),
 *  air and heatsink temperatures (°C), simulated time, and short timings for tests. */
export interface InverterLfOptions {
  /** The battery: 16 LiFePO4 cells (48 V, 5 kW, the default), 8 (24 V, 3 kW) or 4 (12 V,
   *  1.5 kW): decision D30's ratings by battery voltage (P7c, D33). */
  cells?: 4 | 8 | 16;
  vbat?: number; load?: string; stop?: string; temp?: number; theatsink?: number;
  /** Tests: the bus capacitors and the battery-sense filters start at their settled voltages, as
   *  after the pre-charge (it has its own test), so a run reaches the output sooner. */
  precharged?: boolean;
  /** Tests: a smaller soft-start capacitor (the product's 220 nF ramps in about 0.1 s). */
  softC?: string;
  /** Tests: the battery connected the wrong way round (DFMEA I-2). */
  reversed?: boolean;
  /** Tests: the voltage loop's sense transformer sees nothing (winding open, DFMEA I-10). */
  senseOpen?: boolean;
  /** Tests: a smaller overload-timer capacitor (the product's 22 µF trips after about 0.9 s
   *  at the current limit). */
  overloadC?: string;
  /** Tests (D32 temperature corners): the junction temperature of every part on a heatsink
   *  (the power semiconductors), heated by their losses; `temp` sets the ambient for the rest. */
  tj?: number;
  /** Tests (D32 ageing): the electrolytic capacitors at their end of life: 80 % of their
   *  capacitance and twice their ESR (the usual end-of-life criteria). */
  aged?: boolean;
  /** Tests: a motor start, the worst part of it: a locked-rotor induction motor (about 85 A at
   *  230 V, six times the rating of a 2.2 kW motor) connected by a relay from `at` for `for`
   *  seconds. */
  motorStart?: { at: number; for: number };
}

/** The sense transformer of the voltage loop and of the independent protection: a 1 VA 230/12 V
 *  PCB type (as the other power designs). */
// 12 mA: a small mains transformer's core reaches its knee at about 115 % of the rated flux
// (230 V: 1.03 Wb·turn in 100 H, 10 mA)
const SENSE_TR = { value: '0.052', lp: '100', rp: '2k', rs: '20', k: '0.99', isat: '0.012' };

/** The 50 Hz unit's battery-dependent parts (P7c). The bridge (3 × IRFP4468 per switch) and the
 *  0.2 mΩ shunt serve all three: the rated primary current is about 182 A at 48 V and 218 A at
 *  24 and 12 V. The transformer keeps the 48 V design's flux margin (knee at 110 % of the
 *  rated flux, magnetising current 4.5 % of the rated primary current), its leakage referred to
 *  the output (the filter with COUT) and its copper losses (2 % on each side). The battery
 *  window keeps the per-cell levels (2.625 V cut-out, 2.94 V restart, 3.81 V high cut-out),
 *  its resistors solved for each (the sense diode's drop does not scale); the current limit is
 *  twice the rated peak. */
export const LF_VARIANTS = {
  16: { vbat: 52, kw: 5, bat: '48 V LiFePO4 battery (16 cells, 42 … 58.4 V)', cut: [42, 47, 61], tr: { value: '8.36', lp: '15m', rp: '3m', rs: '0.25', k: '0.999', isat: '9.1' }, vprim: '27.5', rbs1: '200k', rlvh: '475k', rbh1: '243k', rpb1: '200k', rpu1: '182k', k1: '150 A DC, coil 48 V', fuse: '200', aux: 'lm317' as const, raux: '220', oc: ['86.6k', '7.5k', '6.19k'], ilim: 519, rdc1: '470k', rpc: '10', rload: '32.4', motor: { rs: '0.5', rr: '0.6', ls: '4m', lm: '0.15' } },
  8: { vbat: 26, kw: 3, bat: '24 V LiFePO4 battery (8 cells, 21 … 29.2 V)', cut: [21, 23.5, 30.5], tr: { value: '16.7', lp: '6.25m', rp: '1.26m', rs: '0.42', k: '0.9994', isat: '10.9' }, vprim: '13.75', rbs1: '93.1k', rlvh: '442k', rbh1: '115k', rpb1: '100k', rpu1: '90.9k', k1: '150 A DC, coil 24 V', fuse: '200', aux: 'lm317' as const, raux: '22', oc: ['86.6k', '8.87k', '5.62k'], ilim: 607, rdc1: '237k', rpc: '10', rload: '52.3', motor: { rs: '0.83', rr: '1', ls: '6.67m', lm: '0.25' } },
  4: { vbat: 13, kw: 1.5, bat: '12 V LiFePO4 battery (4 cells, 10.5 … 14.6 V)', cut: [10.5, 11.75, 15.5], tr: { value: '33.5', lp: '3.13m', rp: '0.63m', rs: '0.85', k: '0.9997', isat: '10.9' }, vprim: '6.9', rbs1: '39.2k', rlvh: '332k', rbh1: '51.1k', rpb1: '49.9k', rpu1: '45.3k', k1: '200 A DC, coil 12 V', fuse: '250', aux: 'direct' as const, raux: '1', oc: ['86.6k', '8.87k', '5.62k'], ilim: 607, rdc1: '118k', rpc: '4.7', rload: '105', motor: { rs: '1.67', rr: '2', ls: '13.3m', lm: '0.5' } },
};

/**
 * Inverter, one 5 kW unit, 50 Hz transformer type (the 24 V 3 kW and 12 V 1.5 kW units from
 * the same drawing, `cells`).
 *
 * Power: battery terminals → 200 A class T fuse → battery contactor (closes when the DC bus is
 * pre-charged through 10 Ω and a diode, so a reversed battery charges nothing and never closes
 * it) → film DC bus → MOSFET full bridge (3 × IRFP4468 per switch) with unipolar sine PWM at
 * 20 kHz → 50 Hz transformer 27.5/230 V 5 kVA, whose leakage inductance and a 10 µF X2
 * capacitor filter the PWM → 230 V 50 Hz terminals (N bonded to PE at the source).
 *
 * Control (12 V from the battery, LM317HV): 555 at 200 Hz and both flip-flops of a CD4013
 * divide to an exact 50 % 50 Hz square; it switches between VMID ± VA/2 (VA from the voltage
 * loop), a 4th-order Butterworth low-pass turns it into a sine without DC offset (DC would
 * saturate the transformer); a 20 kHz triangle and two comparators make the PWM; the
 * half-bridge drivers have their own dead time.
 */
export function inverterLF(o: InverterLfOptions = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const vr = LF_VARIANTS[o.cells ?? 16], vbat = o.vbat ?? vr.vbat;
  // the control rail (V) and the bridge drivers' rail (VD): the same 12 V from the LM317HV, or,
  // in the 12 V unit, the battery itself for the drivers and 9 V from an LDO for the control
  const direct = vr.aux === 'direct', V = direct ? 'V9' : 'V12', VD = 'V12';
  nb.wired = { rails: direct ? [V, VD] : [V], labelled: ['BF', 'AXA', 'VME', 'BUS', 'SWA', 'SWB', 'SRC', 'INA', 'INB', 'EN', 'ENN', 'VREF', 'VMID', 'VA', 'SINE', 'SINEB', 'TRI', 'SRS', 'OUTL', 'VBS', 'Q50', 'KEN', 'STOP', 'SD'] };
  nb.para(`INVERTER, one ${vr.kw} kW unit, 50 Hz transformer type: ${vr.bat} to 230 V 50 Hz. MOSFET full bridge (3 × IRFP4468 per switch) with unipolar sine PWM at 20 kHz; 50 Hz transformer ${vr.vprim}/230 V ${vr.kw} kVA; its leakage inductance and a 10 µF X2 capacitor filter the output. Surge: twice the rated current for motor starts, cycle by cycle limited.`, -1400, -420)
    .para(`Protections (DFMEA section 5): pre-charge before the battery contactor closes (a reversed battery closes nothing); cycle-by-cycle current limit; battery low cut-out ${vr.cut[0]} V (restart ${vr.cut[1]} V) and high cut-out ${vr.cut[2]} V; heatsink above 90 °C; output overvoltage from its own sense transformer and reference (latched). Every fault stops the bridge and the soft start begins again when it clears.`, -1400, -340);

  // ---- battery (test bench) and the battery input
  // its internal resistance about 0.6 mΩ a cell (10 mΩ for 16); the cables (2 µH: about 1 m
  // each way; they do not saturate, hence the high rating) keep the
  // PWM ripple in the bus capacitors, as in the installation (an ideal battery took most of it)
  nb.block('battery').note('TEST BENCH (not part of the product): the battery and its cables', -1400, -220)
    .part('BAT', 'battery', -1350, -100, { value: String(vbat), rint: String(0.01 * (o.cells ?? 16) / 16) }, o.reversed ? { '1': 'GND', '2': 'BC' } : { '1': 'BC', '2': 'GND' }, 1)
    .part('LBAT', 'inductor', -1290, -200, { value: '2u', imax: '1000' }, { '1': 'BC', '2': 'BP' });
  nb.block('dcin')
    .part('X1', 'terminal', -1200, -160, { value: 'BAT+' }, { '1': 'BP' })
    // the battery negative is the control ground (bonded to PE with the output's N)
    .part('X2', 'terminal', -1200, -40, { value: 'BAT−' }, { '1': 'GND' })
    .part('F1', 'fuse', -1050, -160, { value: vr.fuse, r: '0.3m' }, { '1': 'BP', '2': 'BF' })
    // pre-charge: diode (a reversed battery charges nothing) and 10 Ω, 50 W aluminium-housed
    // (4.7 mF: 91 % in 0.11 s, 6.4 J, 5.2 A at most). The 12 V unit 4.7 Ω (2.8 A): its
    // diode's 0.8 V is 6 % of the battery, the bus approached only 12.2 V and through 10 Ω it
    // reached the 90 % threshold (11.7 V) after 0.15 s, past the contactor's window (found in
    // simulation); with 4.7 Ω it does so in about 70 ms
    .part('DPC', 'diode', -900, -260, { value: '1N5408' }, { '2': 'BF', '1': 'PCA' })
    .part('RPC', 'resistor', -780, -260, { value: vr.rpc, pmax: '50' }, { '1': 'PCA', '2': 'BUS' })
    // the contactor's coil (the battery's voltage) from the battery after the input diode DAUX:
    // a reversed battery cannot energise it through QK's body diode
    .part('K1', 'contactor', -820, -100, { value: vr.k1 }, { A1: 'AXA', A2: 'KC', '1': 'BF', '2': 'BUS', '13': 'BKA', '14': 'GND' })
    .part('DK', 'diode', -950, -20, { value: '1N4007' }, { '2': 'KC', '1': 'AXA' }, 3)
    .part('QK', 'nmos', -900, 90, { value: 'IRF540N' }, { '1': 'KEN', '2': 'KC', '3': 'GND' });
  // the DC bus: film capacitors at the bridge, electrolytics for the bulk
  nb.block('bus');
  const pre: Record<string, string> = o.precharged ? { ic: String(vbat - 0.7) } : {};
  for (let k = 0; k < 6; k++) nb.part(`CB${k + 1}`, 'capacitor', -600 + 70 * k, -60, { value: '47u', vmax: '100', ...pre }, { '1': 'BUS', '2': 'GND' }, 1);
  // bulk: two low-ESR electrolytics, 20 mΩ together: they damp the battery cables' inductance
  // against the bus (√(2 µH / 4.7 mF) = 20 mΩ). With the film capacitors alone a short circuit
  // rang the bus between 0 and 113 V, above the MOSFETs' 100 V (found in simulation)
  for (let k = 0; k < 2; k++) nb.part(`CE${k + 1}`, 'capacitor_pol', -600 + 70 * k, 60, { value: '2200u', vmax: '100', esr: '0.04', ...pre }, { '1': 'BUS', '2': 'GND' }, 1);

  // ---- full bridge: 3 MOSFETs per switch, a gate resistor each. A D44H11/D45H11 emitter
  // follower per switch drives the three gates (58 nF): the driver alone (10 Ω) would turn them
  // off in 0.9 µs, longer than its 0.5 µs dead time, and the leg would shoot through (found in
  // simulation: 617 A). 10k hold the gates off while the 12 V is missing
  nb.block('bridge');
  ([['A', -150], ['B', 650]] as const).forEach(([leg, x0]) => {
    for (let k = 0; k < 3; k++) {
      const x = x0 + 120 * k;
      nb.part(`QH${leg}${k + 1}`, 'nmos', x, -160, { value: 'IRFP4468', heatsink: '0.5' }, { '1': `GH${leg}${k + 1}`, '2': 'BUS', '3': `SW${leg}` })
        .part(`RGH${leg}${k + 1}`, 'resistor', x - 60, -240, { value: '4.7' }, { '1': `EH${leg}`, '2': `GH${leg}${k + 1}` })
        .part(`QL${leg}${k + 1}`, 'nmos', x, 40, { value: 'IRFP4468', heatsink: '0.5' }, { '1': `GL${leg}${k + 1}`, '2': `SW${leg}`, '3': 'SRC' })
        .part(`RGL${leg}${k + 1}`, 'resistor', x - 60, 120, { value: '4.7' }, { '1': `EL${leg}`, '2': `GL${leg}${k + 1}` });
    }
    nb.part(`UD${leg}`, 'hbdriver', x0 + 120, 330, { value: 'IR2184-type 600 V' }, { '1': `IN${leg}`, '2': 'SD', '8': VD, '3': 'GND', '7': `VB${leg}`, '6': `HO${leg}`, '5': `SW${leg}`, '4': `LO${leg}` })
      .part(`DB${leg}`, 'diode', x0 + 240, 250, { value: '1N4148' }, { '2': VD, '1': `VB${leg}` })
      .part(`CBS${leg}`, 'capacitor', x0 + 300, 330, { value: '2.2u', vmax: '25' }, { '1': `VB${leg}`, '2': `SW${leg}` }, 1)
      // high-side buffer between VB and SW, low-side buffer between 12 V and ground
      .part(`QBH${leg}`, 'npn', x0 + 400, -260, { value: 'D44H11' }, { '1': `HO${leg}`, '2': `VB${leg}`, '3': `EH${leg}` })
      .part(`QBHP${leg}`, 'pnp', x0 + 400, -140, { value: 'D45H11' }, { '1': `HO${leg}`, '2': `SW${leg}`, '3': `EH${leg}` })
      .part(`QBL${leg}`, 'npn', x0 + 400, 60, { value: 'D44H11' }, { '1': `LO${leg}`, '2': VD, '3': `EL${leg}` })
      .part(`QBLP${leg}`, 'pnp', x0 + 400, 180, { value: 'D45H11' }, { '1': `LO${leg}`, '2': 'GND', '3': `EL${leg}` })
      .part(`RHS${leg}`, 'resistor', x0 + 500, -200, { value: '10k' }, { '1': `EH${leg}`, '2': `SW${leg}` }, 1)
      .part(`RLS${leg}`, 'resistor', x0 + 500, 120, { value: '10k' }, { '1': `EL${leg}`, '2': 'GND' }, 1)
      .part(`CDD${leg}`, 'capacitor', x0 + 20, 410, { value: '1u', vmax: '25' }, { '1': VD, '2': 'GND' }, 1);
  });
  // current shunt in the bridge return (both directions)
  nb.part('RSH', 'resistor', 500, 260, { value: '0.2m', pmax: '10' }, { '1': 'SRC', '2': 'GND' }, 1);

  // ---- transformer, output filter, surge protection, output terminals
  nb.block('output')
    // the core's knee at 110 % of the rated flux (27.5 V r.m.s.: 0.124 Wb·turn in 15 mH,
    // 8.3 A magnetising; a 1.5 T design saturating towards 1.9 T): a DC offset or a lasting
    // overvoltage of the primary saturates it (DFMEA I-5). After a motor start it saturated
    // (580 A) until the output voltage limit kept the bridge from the full-duty half cycles
    // that the loop's late amplitude allowed (found in simulation, D32: I-4 checks it)
    .part('TR1', 'transformer', 1400, -60, { ...vr.tr }, { '1': 'SWA', '2': 'SWB', '3': 'OUTL', '4': 'GND' })
    .part('COUT', 'capacitor', 1550, -60, { value: '10u', vmax: '630' }, { '1': 'OUTL', '2': 'GND' }, 1)
    .part('RVO', 'mov', 1650, -60, { value: '14D471K' }, { '1': 'OUTL', '2': 'GND' }, 1)
    .part('X3', 'terminal', 1800, -140, { value: 'L out' }, { '1': 'OUTL' }, 2)
    .part('X4', 'terminal', 1800, -80, { value: 'N out' }, { '1': 'GND' }, 2)
    .part('X5', 'terminal', 1800, -20, { value: 'PE' }, { '1': 'GND' }, 2);
  if (o.load !== '0') nb.block('load').note('TEST LOAD (not part of the product)', 1900, -220)
    // three 2 kW resistors in parallel at the rated power (48 V: 10.8 Ω, 4.9 kW; `load` is the total)
    .part('RLOAD', 'resistor', 1950, -60, { value: o.load ? String(3 * Number(o.load)) : vr.rload, pmax: '2k' }, { '1': 'OUTL', '2': 'GND' }, 1)
    .part('RLOAD2', 'resistor', 2070, -60, { value: o.load ? String(3 * Number(o.load)) : vr.rload, pmax: '2k' }, { '1': 'OUTL', '2': 'GND' }, 1)
    .part('RLOAD3', 'resistor', 2190, -60, { value: o.load ? String(3 * Number(o.load)) : vr.rload, pmax: '2k' }, { '1': 'OUTL', '2': 'GND' }, 1);
  if (o.motorStart) nb.block('bench').note('TEST BENCH: a motor start (locked rotor)', 2350, -220)
    .part('DMS', 'diode', 2330, 120, { value: '1N4007' }, { '2': 'GND', '1': 'MSC' }, 3)
    .part('VMS', 'vpulse', 2500, 120, { value: '12', low: '0', freq: '1', duty: String(o.motorStart.for * 100), delay: String(o.motorStart.at), edge: '10u' }, { '1': 'MSC', '2': 'GND' })
    .part('KMS', 'relay', 2400, 40, { value: '12 V 30 A', zc: 'true' }, { '1': 'MSC', '2': 'GND', '3': 'OUTL', '5': 'MSL' })
    .part('MST', 'motor1', 2600, -40, { value: '1', ...vr.motor }, { '1': 'MSL', '2': 'GND' });

  // ---- 12 V control supply from the battery (after the fuse; a diode against reversal). The
  // 12 V unit's control runs on the battery itself (10 … 14.6 V; an LM317 cannot make 12 V from
  // 10.5 V): through a Schottky diode and 1 Ω, so the drivers keep at least 9.9 V, above their
  // 8.9 V lockout, at the 10.5 V cut-out
  nb.block('aux');
  if (vr.aux === 'lm317') nb
    .part('DAUX', 'diode', -1300, 300, { value: '1N4007' }, { '2': 'BF', '1': 'AXA' })
    .part('RAUX', 'resistor', -1200, 300, { value: vr.raux, pmax: '5' }, { '1': 'AXA', '2': 'VRAW' })
    .part('CRAW', 'capacitor', -1100, 380, { value: '2.2u', vmax: '100' }, { '1': 'VRAW', '2': 'GND' }, 1)
    .part('UAX', 'lm317', -1000, 300, { value: 'LM317HV', heatsink: '8' }, { '3': 'VRAW', '1': 'ADJ', '2': V })
    .part('RA1', 'resistor', -900, 380, { value: '240' }, { '1': V, '2': 'ADJ' }, 1)
    .part('RA2', 'resistor', -1000, 460, { value: '2.05k' }, { '1': 'ADJ', '2': 'GND' }, 1);
  else nb
    .part('DAUX', 'diode', -1300, 300, { value: 'SS34' }, { '2': 'BF', '1': 'AXA' })
    .part('RAUX', 'resistor', -1100, 300, { value: vr.raux, pmax: '1' }, { '1': 'AXA', '2': VD })
    .part('CAXD', 'capacitor', -1100, 420, { value: '10u', vmax: '25' }, { '1': VD, '2': 'GND' }, 1)
    // the control's own 9 V: on the battery directly, the PWM triangle (its amplitude follows
    // the rail), the mid-rail and every threshold moved with the bus ripple and the battery,
    // and single cycles of the output carried up to 15 V mean (6 %; found in simulation)
    .part('UAX', 'regulator', -1000, 300, { value: 'LM2940-9.0' }, { '1': VD, '2': 'GND', '3': V });
  nb
    .part('CAX', 'capacitor', -820, 380, { value: direct ? '22u' : '10u', vmax: '25' }, { '1': V, '2': 'GND' }, 1)
    // the band-gap reference and the mid-rail (6 V) for the AC signals
    .part('RREF', 'resistor', -700, 300, { value: '2.2k' }, { '1': V, '2': 'VREF' }, 1)
    .part('UREF', 'tl431', -700, 420, { value: 'TL431B' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' }, 3)
    .part('RM1', 'resistor', -560, 300, { value: '10k' }, { '1': V, '2': 'VMR' }, 1)
    .part('RM2', 'resistor', -560, 420, { value: '10k' }, { '1': 'VMR', '2': 'GND' }, 1)
    .part('UM', 'opamp', -420, 360, { value: 'TL074', pkg: 'SIG2' }, { '3': 'VMR', '2': 'VMID', '6': 'VMID', '7': V, '4': 'GND' })
    .part('CDS1', 'capacitor', -420, 480, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- battery contactor: closes when the bus is above 90 % of the battery (pre-charged)
  nb.block('precharge')
    .part('RPB1', 'resistor', -1300, 620, { value: vr.rpb1 }, { '1': 'AXA', '2': 'VBF' }, 1)
    .part('RPB2', 'resistor', -1300, 740, { value: '10k' }, { '1': 'VBF', '2': 'GND' }, 1)
    .part('RPU1', 'resistor', -1180, 620, { value: vr.rpu1 }, { '1': 'BUS', '2': 'VBU' }, 1)
    .part('RPU2', 'resistor', -1180, 740, { value: '10k' }, { '1': 'VBU', '2': 'GND' }, 1)
    .part('UPC', 'comparator', -1000, 680, { value: 'LM339', pkg: 'CMP1' }, { '3': 'VBU', '2': 'VBF', '1': 'KEN', '8': V, '4': 'GND' })
    .part('RKEN', 'resistor', -900, 600, { value: '10k' }, { '1': V, '2': 'KEN' }, 1)
    // hysteresis: once closed it stays closed while the bus follows the battery
    .part('RPH', 'resistor', -1000, 780, { value: '1M' }, { '1': 'KEN', '2': 'VBU' });

  // ---- battery window (dividers after DAUX, 0.7 V below the battery): low cut-out (48 V unit:
  // 42 V), restart (47 V; hysteresis from EN: any fault restarts only above it); high cut-out
  // (61 V) with its own output HVN and hysteresis
  nb.block('battery window')
    .part('RBS1', 'resistor', -760, 620, { value: vr.rbs1 }, { '1': 'AXA', '2': 'VBS' }, 1)
    .part('RBS2', 'resistor', -760, 740, { value: '10k' }, { '1': 'VBS', '2': 'GND' }, 1)
    // 4.5 ms: the cut-out follows the battery, not the bus sag at each current-limit cycle
    // (that stopped and restarted the bridge every 20–30 ms in a short: found in simulation)
    .part('CBS', 'capacitor', -700, 800, { value: '470n', vmax: '25', ...(o.precharged ? { ic: ((vbat - 0.85) * 10e3 / (parseValue(vr.rbs1)! + 10e3)).toFixed(3) } : {}) }, { '1': 'VBS', '2': 'GND' }, 1)
    .part('RLV1', 'resistor', -620, 620, { value: '1.54k' }, { '1': 'VREF', '2': 'VLO' }, 1)
    .part('RLV2', 'resistor', -620, 740, { value: '10k' }, { '1': 'VLO', '2': 'GND' }, 1)
    .part('ULV', 'comparator', -480, 680, { value: 'LM339', pkg: 'CMP1' }, { '3': 'VBS', '2': 'VLO', '1': 'EN', '8': V, '4': 'GND' })
    .part('RLVH', 'resistor', -480, 800, { value: vr.rlvh }, { '1': 'EN', '2': 'VBS' })
    .part('RBH1', 'resistor', -340, 620, { value: vr.rbh1, tol: '0.1' }, { '1': 'AXA', '2': 'VBH' }, 1)
    .part('RBH2', 'resistor', -340, 740, { value: '10k', tol: '0.1' }, { '1': 'VBH', '2': 'GND' }, 1)
    // 4.5 ms as on VBS: the bus jumps by 10–15 V for microseconds when the bridge turns off a
    // current-limit peak, and that tripped the high cut-out (found in simulation)
    .part('CBH', 'capacitor', -280, 800, { value: '470n', vmax: '25', ...(o.precharged ? { ic: ((vbat - 0.85) * 10e3 / (parseValue(vr.rbh1)! + 10e3)).toFixed(3) } : {}) }, { '1': 'VBH', '2': 'GND' }, 1)
    .part('RHV1', 'resistor', -220, 620, { value: '715', tol: '0.1' }, { '1': 'VREF', '2': 'VHI' }, 1)
    .part('RHV2', 'resistor', -220, 740, { value: '10k', tol: '0.1' }, { '1': 'VHI', '2': 'GND' }, 1)
    .part('UHV', 'comparator', -80, 680, { value: 'LM393', pkg: 'PROT' }, { '3': 'VHI', '2': 'VBH', '1': 'HVN', '8': V, '4': 'GND' })
    .part('RHVN', 'resistor', 20, 600, { value: '10k' }, { '1': V, '2': 'HVN' }, 1)
    .part('RHVH', 'resistor', -80, 800, { value: '100k' }, { '1': 'HVN', '2': 'VHI' })
    .part('DHV', 'diode', 20, 800, { value: '1N4148' }, { '2': 'EN', '1': 'HVN' })
    .part('REN', 'resistor', 120, 600, { value: '10k' }, { '1': V, '2': 'EN' }, 1)
    // EN low until the contactor has really closed: its auxiliary contact 13–14 shorts QKA's base
    // (the bridge must not start on the pre-charge resistor: found in simulation, it pulled the
    // bus down and the contactor never closed); a contactor that does not close keeps it off
    .part('RKA', 'resistor', -900, 820, { value: '22k' }, { '1': V, '2': 'BKA' }, 1)
    .part('QKA', 'npn', -780, 900, { value: 'BC547B' }, { '1': 'BKA', '2': 'EN', '3': 'GND' })
    // EN low also holds the PWM inputs low (STOP); ENN (EN inverted) restarts the soft start
    // and the DC servo
    .part('RQE', 'resistor', 240, 680, { value: '47k' }, { '1': 'EN', '2': 'BQE' })
    .part('QEN', 'npn', 340, 740, { value: 'BC547B' }, { '1': 'BQE', '2': 'ENN', '3': 'GND' })
    // the protections pull EN low through diodes, to about 0.64 V: the divider keeps QEN off
    // there (alone, 0.64 V on its base left it half on)
    .part('RQE2', 'resistor', 280, 820, { value: '47k' }, { '1': 'BQE', '2': 'GND' }, 1)
    .part('RENN', 'resistor', 340, 600, { value: '10k' }, { '1': V, '2': 'ENN' }, 1)
    .part('CDC1', 'capacitor', 120, 840, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- heatsink temperature: EN low above 90 °C (NTC 10k at 25 °C on the heatsink), with its
  // own output THN and 3 °C hysteresis: trips at 90.7 °C, restarts at 87.5 °C (the NTC divider
  // moves only 6 mV/°C there: a 100k feedback lifted the threshold by 0.29 V, out of the NTC's
  // reach, and the cut-out never tripped: found in simulation)
  nb.block('thermal')
    .part('RTH', 'ntc', 500, 620, { value: '10k', temp: String(o.theatsink ?? 50) }, { '1': 'VREF', '2': 'NHS' }, 1)
    .part('RTHB', 'resistor', 500, 740, { value: '10k' }, { '1': 'NHS', '2': 'GND' }, 1)
    .part('RT90', 'resistor', 620, 620, { value: '3.92k' }, { '1': 'VREF', '2': 'T90' }, 1)
    .part('RT90B', 'resistor', 620, 740, { value: '40.2k' }, { '1': 'T90', '2': 'GND' }, 1)
    .part('UTH', 'comparator', 760, 680, { value: 'LM339', pkg: 'CMP1' }, { '3': 'T90', '2': 'NHS', '1': 'THN', '8': V, '4': 'GND' })
    .part('RTHN', 'resistor', 860, 600, { value: '10k' }, { '1': V, '2': 'THN' }, 1)
    .part('RTHH', 'resistor', 760, 800, { value: '2.2M' }, { '1': 'THN', '2': 'T90' })
    .part('DTH', 'diode', 860, 800, { value: '1N4148' }, { '2': 'EN', '1': 'THN' });

  // ---- 50 Hz: 555 at 200 Hz and both flip-flops of a CD4013 (÷4): an exact 50 % square Q50
  nb.block('50 Hz')
    .part('U50', 'timer555', -1300, 1050, { value: 'NE555' }, { '8': V, '4': V, '7': 'D50', '6': 'T50', '2': 'T50', '3': 'C200', '5': 'K50', '1': 'GND' })
    .part('RA50', 'resistor', -1420, 960, { value: '10k' }, { '1': V, '2': 'D50' }, 1)
    .part('RB50', 'resistor', -1420, 1080, { value: '30.9k' }, { '1': 'D50', '2': 'T50' }, 1)
    .part('CT50', 'capacitor', -1420, 1200, { value: '100n', vmax: '50' }, { '1': 'T50', '2': 'GND' }, 1)
    .part('CK50', 'capacitor', -1180, 1180, { value: '10n', vmax: '50' }, { '1': 'K50', '2': 'GND' }, 1)
    .part('UFF1', 'dff', -1050, 1040, { value: V , pkg: 'FF' }, { '1': 'Q100N', '2': 'C200', '3': 'Q100', '4': 'Q100N' })
    .part('UFF2', 'dff', -850, 1040, { value: V , pkg: 'FF' }, { '1': 'Q50N', '2': 'Q100', '3': 'Q50', '4': 'Q50N' })
    .part('CD50', 'capacitor', -950, 1180, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  inverterControl(nb, o, { V, G: 'GND', q50: 'Q50', cmpT: { value: 'LM339', pkg: 'CMP1' }, cmpV: { value: 'LM358', pkg: 'OVL' }, oc: vr.oc, rdc1: vr.rdc1, flux: true, ...(direct ? { tri: ['10k', '28.7k'] as [string, string] } : {}) });

  nb.v('OUTL').v('SINE').v('VA').v('BUS').v('EN').i('TR1', '3');
  nb.sim({ type: 'tran', stop: o.stop ?? '200m', step: '5u', start: 'zero', thin: true });
  const sheet = nb.done();
  if (o.temp !== undefined) sheet.temp = String(o.temp);
  if (o.tj !== undefined) for (const p of sheet.parts) if (p.props.heatsink?.trim()) p.props = { ...p.props, tj: String(o.tj) };
  if (o.aged) for (const p of sheet.parts) if (p.sym === 'capacitor_pol') {
    const c = parseValue(p.props.value), r = p.props.esr?.trim() ? parseValue(p.props.esr) : null;
    p.props = { ...p.props, value: String(0.8 * (c ?? 0)), ...(r !== null ? { esr: String(2 * r) } : {}) };
  }
  return { sheet, nb };
}

/** The control of the sine bridge, shared by both inverters (drawn below the power section): the
 *  square VME ± VA/2 and its 4th-order Butterworth sine, the DC servo, the 20 kHz triangle and the
 *  PWM comparators, the cycle-by-cycle current window and the overload timer, the voltage loop
 *  and the independent latched output overvoltage protection. `V` is its supply rail, `G` its
 *  ground, `q50` the 50 Hz square that switches the sine's square; `cmpT` the package of the
 *  triangle's comparator; `hybrid`: leg B switches at 50 Hz, leg A carries the PWM (else
 *  unipolar: leg B from the inverted sine); `swb` the net of leg B's node (default SWB). */
export function inverterControl(nb: NB, o: { softC?: string; overloadC?: string; senseOpen?: boolean }, c: { V: string; G: string; q50: string; cmpT: Record<string, string>; cmpV: Record<string, string>; hybrid?: boolean; swb?: string; oc?: string[]; rdc1?: string; flux?: boolean; tri?: [string, string] }) {
  const { V, G } = c;
  // ---- the square VME ± VA/2: H = VMID + VA/2, L = 2·VME − H; QSQ connects SQ to L while Q50
  // is high, RSQ to H otherwise. VME = VMID + the DC servo's correction: the square's mean, and
  // with it the sine's DC, follows VME
  nb.block('sine')
    // H = 1.5 × (2·VMID + VA)/3 = VMID + VA/2: a weighted sum straight into the high-impedance
    // input (a 10k VA/2 divider here was loaded by the sum and gave H = VMID + 1.5 V with VA = 0:
    // the bridge started at 45 % modulation and the OV latch tripped, found in simulation)
    // 50 Hz unit: from VME, so H = VME + VA/2 and the servo's correction shifts the whole square.
    // From VMID it entered L alone (three times, with the flux servo), and its 80 mV of 50 Hz
    // ripple modulated the square's amplitude: 1.2 % second harmonic at the output (12 V unit,
    // THD 3.4 %; found in simulation, D34)
    .part('RH1', 'resistor', -700, 960, { value: '100k' }, { '1': c.flux ? 'VME' : 'VMID', '2': 'HP' })
    .part('RH2', 'resistor', -700, 1060, { value: '200k' }, { '1': 'VA', '2': 'HP' })
    .part('UH', 'opamp', -560, 1000, { value: 'TL074', pkg: 'SIG1' }, { '3': 'HP', '2': 'HN', '6': 'H', '7': V, '4': G })
    .part('RHF', 'resistor', -560, 900, { value: '4.99k' }, { '1': 'HN', '2': 'H' })
    .part('RHG', 'resistor', -660, 1140, { value: '10k' }, { '1': 'HN', '2': G }, 1)
    // L: H mirrored about VMID (inverting, gain 1, around VMID)
    .part('UL', 'opamp', -400, 1150, { value: 'TL074', pkg: 'SIG1' }, { '3': 'VME', '2': 'LN', '6': 'L', '7': V, '4': G })
    .part('RL1', 'resistor', -480, 1240, { value: '10k' }, { '1': 'H', '2': 'LN' })
    .part('RL2', 'resistor', -380, 1260, { value: '10k' }, { '1': 'LN', '2': 'L' })
    // 220 Ω: the filter's 22k input loads SQ when it comes from H through RSQ; through 1k the
    // square's mean sat 70 mV below VME, and the DC servo had to correct it after every start
    // (the primary saw −1.4 V for the first 40 ms: found in simulation)
    .part('RSQ', 'resistor', -300, 960, { value: '220' }, { '1': 'H', '2': 'SQ' })
    .part('QSQ', 'nmos', -260, 1080, { value: '2N7000' }, { '1': c.q50, '2': 'SQ', '3': 'L' })
    // 4th-order Butterworth low-pass, 70 Hz: two unity-gain Sallen–Key stages (Q 0.54, 1.31)
    .part('RF1', 'resistor', -150, 1000, { value: '22.1k' }, { '1': 'SQ', '2': 'F1A' })
    .part('RF2', 'resistor', -50, 1000, { value: '22.1k' }, { '1': 'F1A', '2': 'F1B' })
    .part('CF1', 'capacitor', -50, 900, { value: '110n', vmax: '50' }, { '1': 'F1A', '2': 'F1O' })
    .part('CF2', 'capacitor', 30, 1100, { value: '100n', vmax: '50' }, { '1': 'F1B', '2': 'VMID' }, 1)
    .part('UF1', 'opamp', 120, 1000, { value: 'TL074', pkg: 'SIG1' }, { '3': 'F1B', '2': 'F1O', '6': 'F1O', '7': V, '4': G })
    .part('RF3', 'resistor', 240, 1000, { value: '22.1k' }, { '1': 'F1O', '2': 'F2A' })
    .part('RF4', 'resistor', 340, 1000, { value: '22.1k' }, { '1': 'F2A', '2': 'F2B' })
    .part('CF3', 'capacitor', 340, 900, { value: '270n', vmax: '50' }, { '1': 'F2A', '2': 'SINE' })
    .part('CF4', 'capacitor', 420, 1100, { value: '39n', vmax: '50' }, { '1': 'F2B', '2': 'VMID' }, 1)
    .part('UF2', 'opamp', 520, 1000, { value: 'TL074', pkg: 'SIG2' }, { '3': 'F2B', '2': 'SINE', '6': 'SINE', '7': V, '4': G });
  // unipolar PWM: the inverted sine for leg B, 2·VMID − SINE. Hybrid (leg B at 50 Hz, leg A
  // the PWM with the duty m·|sin|): leg A compares REF = (B ? the triangle's peak : its valley)
  // + 2·(SINE − VMID) with the triangle (the same gain as the unipolar bridge); precision peak
  // and valley detectors give the triangle's real extremes, so the half cycles join without a
  // step at the zero crossing
  if (c.hybrid) nb.block('hybrid modulation').part('UPK', 'opamp', -1250, 2450, { value: 'TL072', pkg: 'SIG3' }, { '3': 'TRI', '2': 'PKN', '6': 'PKD', '7': V, '4': G })
    .part('DPK', 'diode', -1130, 2410, { value: '1N4148' }, { '2': 'PKD', '1': 'PKR' })
    // 1k: the op-amp charges 1 µF at power-up (0.22 A without it, found in the stress check).
    // The peak's capacitor on the ground, the valley's on the 15 V: each starts on the side its
    // op-amp drives it from, and both hold the triangle's extremes within a few periods. The
    // valley's on the ground started 7.5 V low and rose only through 1M (1 s): the positive
    // half cycles had no pulses and the output carried −85 V DC; on VMID the two loaded its
    // buffer with 2 µF and it oscillated (found in simulation)
    .part('RPKS', 'resistor', -1080, 2350, { value: '1k' }, { '1': 'PKR', '2': 'PKV' })
    .part('CPK', 'capacitor', -1030, 2530, { value: '1u', vmax: '25' }, { '1': 'PKV', '2': G }, 1)
    .part('RPK', 'resistor', -950, 2530, { value: '1M' }, { '1': 'PKV', '2': 'PKN' }, 1)
    // between the peaks DPK2 holds the op-amp in its loop, 0.6 V below the triangle, and 1M from
    // the capacitor closes it (the slow droop of the reading): at the next peak the output only
    // has 1.3 V to slew. From its rail (10 V, 0.8 µs) the reading stayed 0.2 V inside the
    // triangle, the duty could not reach 0 or 1 at the zero crossings, and each crossing
    // stepped by 40 V and rang: THD 5 % (found in simulation)
    .part('DPK2', 'diode', -1130, 2510, { value: '1N4148' }, { '2': 'PKN', '1': 'PKD' })
    .part('UVL', 'opamp', -850, 2450, { value: 'TL072', pkg: 'SIG3' }, { '3': 'TRI', '2': 'VLN', '6': 'VLD', '7': V, '4': G })
    .part('DVL', 'diode', -730, 2410, { value: '1N4148' }, { '2': 'VLR', '1': 'VLD' })
    .part('RVLS', 'resistor', -680, 2350, { value: '1k' }, { '1': 'VLV', '2': 'VLR' })
    .part('CVL', 'capacitor', -630, 2530, { value: '1u', vmax: '25' }, { '1': 'VLV', '2': V }, 1)
    .part('RVL', 'resistor', -550, 2530, { value: '1M' }, { '1': 'VLV', '2': 'VLN' }, 1)
    .part('DVL2', 'diode', -730, 2510, { value: '1N4148' }, { '2': 'VLD', '1': 'VLN' })
    // SEL: the peak while INB is high (negative half cycle), else the valley; 470 Ω in each
    // path: while INB and INBN overlap at a zero crossing the two switches joined the
    // detectors' capacitors, 3.4 V apart, with 0.34 A (found in the stress check)
    .part('QSP', 'nmos', -450, 2430, { value: '2N7000' }, { '1': 'INB', '2': 'PKV', '3': 'SELP' })
    .part('RSLP', 'resistor', -380, 2480, { value: '470' }, { '1': 'SELP', '2': 'SEL' }, 1)
    .part('QSV', 'nmos', -450, 2620, { value: '2N7000' }, { '1': 'INBN', '2': 'SELV', '3': 'VLV' })
    .part('RSLV', 'resistor', -380, 2570, { value: '470' }, { '1': 'SEL', '2': 'SELV' }, 1)
    .part('RBB', 'resistor', -330, 2680, { value: '47k' }, { '1': 'INB', '2': 'BIB' })
    .part('QBI', 'npn', -230, 2720, { value: 'BC547B' }, { '1': 'BIB', '2': 'INBN', '3': G })
    .part('RCB', 'resistor', -230, 2590, { value: '10k' }, { '1': V, '2': 'INBN' }, 1)
    // REF = SEL + 2·SINE − 2·VMID: (SEL + 2·SINE)/3 at +, gain 3 about VMID; 200k/100k: the
    // selected detector's capacitor is loaded by 10 µA (20k took 0.1 mA, 5 nC to restore per
    // period)
    .part('RS1', 'resistor', -100, 2420, { value: '200k' }, { '1': 'SEL', '2': 'SUMP' })
    .part('RS2', 'resistor', -100, 2500, { value: '100k' }, { '1': 'SINE', '2': 'SUMP' })
    .part('USUM', 'opamp', 20, 2450, { value: 'TL074', pkg: 'SIG2' }, { '3': 'SUMP', '2': 'SUMN', '6': 'REF', '7': V, '4': G })
    .part('RSG', 'resistor', 120, 2560, { value: '100k' }, { '1': 'SUMN', '2': 'VMID' }, 1)
    .part('RSF', 'resistor', 120, 2350, { value: '200k' }, { '1': 'SUMN', '2': 'REF' });
  else nb.part('RN1', 'resistor', 640, 1000, { value: '10k' }, { '1': 'SINE', '2': 'NSB' })
    .part('RN2', 'resistor', 740, 1100, { value: '10k' }, { '1': 'NSB', '2': 'SINEB' })
    .part('UNB', 'opamp', 760, 1000, { value: 'TL074', pkg: 'SIG2' }, { '3': 'VMID', '2': 'NSB', '6': 'SINEB', '7': V, '4': G });
  nb.block('sine').part('CDS2', 'capacitor', 860, 1160, { value: '100n', vmax: '50' }, { '1': V, '2': G }, 1);

  // ---- DC servo (FF 5.1.6: DC saturates the transformer): a JFET differential integrator of
  // SWA − SWB (÷11 dividers around VMID, 470k / 2.2 µF: loop time constant about 30 ms) moves
  // VME until the primary's mean voltage is zero; QDC resets it while the bridge is stopped.
  // With 10 µF (0.135 s) a 1 % start-up asymmetry held for 0.1 s: 25–60 mVs, a fifth to a
  // half of the core's peak flux (found in simulation)
  // Hybrid: the legs swing 0 … 380 V about the control's ground, and their mean is 190 V: two
  // 2.2M in series (190 V each) keep the inputs at about 9.4 V, inside the TL074's range (÷11
  // put them at 24 V, above its supply, and the servo ran away: the output carried up to 250 V
  // DC and the overvoltage latch tripped, found in simulation); the loop's gain is 7 times the
  // 50 Hz unit's (the whole bus per volt of VME), and 4.4 MΩ bring its time constant back to
  // about 40 ms, far below 50 Hz. The integrator's gain is 1/(RDA1·CDI) whatever RDA2, and the
  // primary's volts per volt of VME follow the bus: the 24 and 12 V units scale RDA1/RDB1 with
  // it (237k, 118k) to keep the 48 V loop. With 470k at 24 V the primary still carried 12.5 A DC
  // at 300 ms, and at 12 V the flux walked until the core saturated every other half cycle
  // (667 A) and the current limit tripped (found in simulation)
  nb.block('dc servo');
  if (c.hybrid) nb.part('RDA1', 'resistor', 900, 900, { value: '2.2M' }, { '1': 'SWA', '2': 'NDA' })
    .part('RDA1B', 'resistor', 1000, 900, { value: '2.2M' }, { '1': 'NDA', '2': 'NDC' });
  else nb.part('RDA1', 'resistor', 1000, 900, { value: c.rdc1 ?? '470k' }, { '1': 'SWA', '2': 'NDC' });
  nb.part('RDA2', 'resistor', 1000, 1000, { value: '47k' }, { '1': 'NDC', '2': 'VMID' });
  if (c.hybrid) nb.part('RDB1', 'resistor', 920, 1230, { value: '2.2M' }, { '1': c.swb ?? 'SWB', '2': 'PDA' })
    .part('RDB1B', 'resistor', 1000, 1150, { value: '2.2M' }, { '1': 'PDA', '2': 'PDC' });
  else nb.part('RDB1', 'resistor', 1000, 1150, { value: c.rdc1 ?? '470k' }, { '1': c.swb ?? 'SWB', '2': 'PDC' });
  nb.part('RDB2', 'resistor', 1100, 1250, { value: '47k' }, { '1': 'PDC', '2': 'VMID' }, 1)
    .part('CDB', 'capacitor', 1000, 1250, { value: c.flux ? '3.3u' : '2.2u', vmax: '25' }, { '1': 'PDC', '2': 'VMID' }, 1)
    .part('UDC', 'opamp', 1200, 1050, { value: 'TL074', pkg: 'SIG1' }, { '3': 'PDC', '2': 'NDC', '6': 'VME', '7': V, '4': G })
    .part('CDI', 'capacitor', 1200, 900, { value: c.flux ? '3.3u' : '2.2u', vmax: '25' }, { '1': 'NDC', '2': 'VME' })
    // source at VME: its body diode then points from VME to NDC, which runs about 1.8 V above
    // VME (the dividers carry the bridge's 26 V mean). The other way round the diode
    // conducted, held VME 0.6 V below NDC and the servo drove the primary to 14 V DC instead of
    // zero (found in simulation)
    .part('QDC', 'nmos', 1350, 950, { value: '2N7000' }, { '1': 'ENN', '2': 'NDC', '3': 'VME' });
  // QDB empties CDB with CDI, so the servo restarts at VME = VMID. QDC alone left CDB at the
  // stopped legs' divider voltage, and VME restarted that far above VMID, a starting offset the
  // integrator then only held: the 12 V unit's square started 7 % off its triangle, the primary
  // saw +1.2 V for the first 10 ms (a 40 % flux offset) and the core saturated every other half
  // cycle (found in simulation). PDC stays above VMID, so QDB's body diode never conducts
  if (!c.hybrid) nb.part('QDB', 'nmos', 1350, 1250, { value: '2N7000' }, { '1': 'ENN', '2': 'PDC', '3': 'VMID' });
  // the flux servo (50 Hz unit): UDC holds the primary's mean voltage at zero, which only keeps
  // whatever flux offset the start left; its DC current then decays with the winding's L/R
  // (0.5 s: the 12 V unit still carried 4.3 A, 2 % of its rated current, at 0.3 s; the 24 V unit
  // 12 A, found in simulation). VME − VMID is the flux since the start, so UFX integrates it
  // (33k / 1 µF) and adds it to the square's mean through UL (RL3): a PI loop on the flux, zero
  // at 10 rad/s, which drives the offset itself to zero. The extra input raises the servo's gain
  // by 1.5, and CDI/CDB (3.3 µF) restore its crossover (and the 50 Hz ripple on VME). QFX
  // empties CFX while the bridge is stopped. LM358: its other half is the output voltage limit
  if (c.flux) nb
    .part('RFX', 'resistor', 1650, 1250, { value: '33k' }, { '1': 'VME', '2': 'NFX' })
    .part('CFX', 'capacitor', 1780, 1130, { value: '1u', vmax: '25' }, { '1': 'NFX', '2': 'VFX' })
    .part('UFX', 'opamp', 1800, 1250, { value: 'LM358', pkg: 'OVL' }, { '3': 'VMID', '2': 'NFX', '6': 'VFX', '7': V, '4': G })
    .part('QFX', 'nmos', 1950, 1130, { value: '2N7000' }, { '1': 'ENN', '2': 'NFX', '3': 'VFX' })
    .part('RL3', 'resistor', -250, 1250, { value: '10k' }, { '1': 'VFX', '2': 'LN' });

  // (the 12 V unit's control on 9 V: 10k and 28.7k keep the same ±1.6 V and 20 kHz)
  // ---- 20 kHz triangle: integrator (13.3k / 3.3 nF) and a comparator Schmitt trigger (1k
  // pull-up: its square swings about VMID ± 5.8 V, the triangle VMID ± 1.5 V): 21.9 kHz from the
  // RC, 20 kHz with the LM339's response time at each turn (15k gave 17.7 kHz in simulation).
  // An op-amp as the Schmitt trigger slewed rail to rail every 25 µs (it set most of the
  // simulation's steps)
  nb.block('pwm')
    .part('UTI', 'opamp', -1300, 1500, { value: 'TL074', pkg: 'SIG2' }, { '3': 'VMID', '2': 'NTI', '6': 'TRI', '7': V, '4': G })
    .part('RTI', 'resistor', -1420, 1420, { value: c.tri?.[0] ?? '13.3k' }, { '1': 'SQT', '2': 'NTI' })
    .part('CTI', 'capacitor', -1300, 1400, { value: '3.3n', vmax: '50' }, { '1': 'NTI', '2': 'TRI' })
    .part('UST', 'comparator', -1100, 1500, c.cmpT, { '3': 'PST', '2': 'VMID', '1': 'SQT', '8': V, '4': G })
    .part('RSTU', 'resistor', -1000, 1400, { value: '1k' }, { '1': V, '2': 'SQT' }, 1)
    .part('RSA', 'resistor', -1100, 1400, { value: '10k' }, { '1': 'TRI', '2': 'PST' })
    .part('RSB', 'resistor', -1000, 1600, { value: c.tri?.[1] ?? '38.3k' }, { '1': 'SQT', '2': 'PST' })
    // leg A on while SINE (unipolar) or REF (hybrid) is above the triangle; leg B while SINEB is
    // above it (unipolar), or in the negative half cycle (hybrid)
    .part('UPA', 'comparator', -850, 1500, { value: 'LM339', pkg: 'CMP2' }, { '3': c.hybrid ? 'REF' : 'SINE', '2': 'TRI', '1': 'INA', '8': V, '4': G })
    .part('RPA', 'resistor', -750, 1420, { value: '4.7k' }, { '1': V, '2': 'INA' }, 1)
    // hybrid: leg B high in the negative half cycle (SINE below VMID), 30 mV of hysteresis
    .part('UPB', 'comparator', -650, 1500, { value: 'LM339', pkg: 'CMP2' }, c.hybrid ? { '3': 'BHY', '2': 'SINE', '1': 'INB', '8': V, '4': G } : { '3': 'SINEB', '2': 'TRI', '1': 'INB', '8': V, '4': G })
    .part('RPB', 'resistor', -550, 1420, { value: '4.7k' }, { '1': V, '2': 'INB' }, 1);
  if (c.hybrid) nb.part('RBI', 'resistor', -650, 1380, { value: '2.2k' }, { '1': 'VMID', '2': 'BHY' })
    .part('RBH', 'resistor', -560, 1620, { value: '1M' }, { '1': 'INB', '2': 'BHY' });
  nb
    // STOP (EN low, or an overcurrent) pulls both drivers' SD low with QSD: all four switches
    // off, so a fault current returns to the bus through the body diodes, where the shunt sees
    // it (inputs held low turned both low sides on: a short-circuit current freewheeled past the
    // shunt and rose every PWM period, to 215 kA in simulation)
    .part('QSD', 'nmos', -750, 1620, { value: '2N7000' }, { '1': 'STOP', '2': 'SD', '3': G })
    .part('RSD', 'resistor', -950, 1700, { value: '10k' }, { '1': V, '2': 'SD' }, 1)
    .part('DSE', 'diode', -650, 1700, { value: '1N4148' }, { '2': 'ENN', '1': 'STOP' })
    .part('RSTP', 'resistor', -450, 1720, { value: '100k' }, { '1': 'STOP', '2': G }, 1)
    .part('CDC2', 'capacitor', -450, 1600, { value: '100n', vmax: '50' }, { '1': V, '2': G }, 1);

  // ---- cycle-by-cycle current limit, the shunt straight into a window comparator: SRS =
  // 0.9 × SRC + 0.25 V (shifted up from VREF so both directions stay above 0 V); outside
  // 0.154 … 0.341 V (±519 A in the bridge: twice the rated 257 A peak, for motor starts) OCP or
  // OCN goes high and STOP turns all four switches off for at least 25 µs. An LM358 amplifier
  // (×24) here took about 9 µs and a short circuit overshot the limit by 217 A (found in
  // simulation); 47 pF keep the switching edges out (0.4 µs)
  nb.block('current')
    .part('RLS1', 'resistor', -250, 1400, { value: '90.9k' }, { '1': 'VREF', '2': 'SRS' }, 1)
    .part('RLS2', 'resistor', -250, 1600, { value: '10k' }, { '1': 'SRC', '2': 'SRS' }, 1)
    .part('CSRS', 'capacitor', -150, 1600, { value: '47p', vmax: '50' }, { '1': 'SRS', '2': G }, 1)
    .part('ROC1', 'resistor', 0, 1400, { value: c.oc?.[0] ?? '86.6k' }, { '1': 'VREF', '2': 'OCH' }, 1)
    .part('ROC2', 'resistor', 0, 1500, { value: c.oc?.[1] ?? '7.5k' }, { '1': 'OCH', '2': 'OCL' }, 1)
    .part('ROC3', 'resistor', 0, 1600, { value: c.oc?.[2] ?? '6.19k' }, { '1': 'OCL', '2': G }, 1)
    .part('UOC1', 'comparator', 150, 1450, { value: 'LM339', pkg: 'CMP2' }, { '3': 'SRS', '2': 'OCH', '1': 'OCP', '8': V, '4': G })
    .part('UOC2', 'comparator', 150, 1600, { value: 'LM339', pkg: 'CMP2' }, { '3': 'OCL', '2': 'SRS', '1': 'OCN', '8': V, '4': G })
    .part('ROCP', 'resistor', 280, 1400, { value: '2.2k' }, { '1': V, '2': 'OCP' }, 1)
    .part('ROCN', 'resistor', 280, 1550, { value: '2.2k' }, { '1': V, '2': 'OCN' }, 1)
    // OCS: either overcurrent, held 20 µs by CSTP (the bridge stays off for about half a PWM
    // period), turns the bridge off through DOS and STOP. 2.2k pull-ups: the comparator's
    // pulses last about 1 µs, and through 10k CSTP reached only 4.5 V (found in simulation)
    .part('DSP', 'diode', 380, 1450, { value: '1N4148' }, { '2': 'OCP', '1': 'OCS' })
    .part('DSN', 'diode', 380, 1600, { value: '1N4148' }, { '2': 'OCN', '1': 'OCS' })
    .part('CSTP', 'capacitor', 460, 1700, { value: '150p', vmax: '50' }, { '1': 'OCS', '2': G }, 1)
    .part('ROCS', 'resistor', 540, 1700, { value: '100k' }, { '1': 'OCS', '2': G }, 1)
    .part('DOS', 'diode', 480, 1380, { value: '1N4148' }, { '2': 'OCS', '1': 'STOP' })
    // instantaneous output voltage limit: the rectified sense VRO, ahead of every filter, above
    // about 355 V peak (109 %; the highest regulation, 230 V + 3 %, is 6 % below) releases OVC
    // and stops the bridge through OCS as an overcurrent does. The loop alone cannot catch a load
    // dump: its amplitude VA passes the sine's 70 Hz filter, half a cycle late, and when a
    // motor dropped out the old full-amplitude sine held the bridge at 100 % for 3 ms (407 V),
    // the loop overcorrected and swung back to 408 V, and the overvoltage protection latched
    // the bridge off (found in simulation, D32)
    .part('RVL1', 'resistor', 1200, 1380, { value: '54.9k' }, { '1': 'VRO', '2': 'VLC' }, 1)
    .part('RVL2', 'resistor', 1200, 1500, { value: '10k' }, { '1': 'VLC', '2': G }, 1)
  // LM358 (50 Hz unit, with the flux integrator): its push-pull output drives DOV itself, and its
  // inputs work down to ground (VREF 2.5 V)
  if (c.flux) nb.part('UOV', 'opamp', 1320, 1440, c.cmpV, { '3': 'VLC', '2': 'VREF', '6': 'OVC', '7': V, '4': G });
  else nb.part('UOV', 'comparator', 1320, 1440, c.cmpV, { '3': 'VLC', '2': 'VREF', '1': 'OVC', '8': V, '4': G })
    .part('ROVC', 'resistor', 1440, 1380, { value: '2.2k' }, { '1': V, '2': 'OVC' }, 1);
  nb
    .part('DOV', 'diode', 1440, 1520, { value: '1N4148' }, { '2': 'OVC', '1': 'OCS' })
    // overload timer: COL follows the mean of OCS (ROL, 4.8 s), which is 1.5 … 2.5 V while the
    // limit acts and 0 V otherwise; above OCH (0.34 V) after about 0.9 s at the limit, longer
    // than a motor start; UOT then lifts SP over the overvoltage
    // threshold, so the protection latch stops the bridge until the battery is disconnected
    // (FAULT LED). At the limit for good, the shunt and the switches would overheat long before
    // the heatsink sensor reacts (found in simulation: a sustained short)
    .part('ROL', 'resistor', 580, 1520, { value: '220k' }, { '1': 'OCS', '2': 'OLC' })
    .part('COL', 'capacitor_pol', 660, 1620, { value: o.overloadC ?? '22u', vmax: '25' }, { '1': 'OLC', '2': G }, 1)
    .part('UOT', 'opamp', 840, 1500, { value: 'LM358', pkg: 'AMP' }, { '3': 'OLC', '2': 'OCH', '6': 'OLO', '7': V, '4': G })
    .part('DOT', 'diode', 960, 1500, { value: '1N4148' }, { '2': 'OLO', '1': 'OLS' })
    .part('ROT', 'resistor', 1060, 1500, { value: '4.7k' }, { '1': 'OLS', '2': 'SP' })
    .part('CDA', 'capacitor', -150, 1400, { value: '100n', vmax: '50' }, { '1': V, '2': G }, 1);

  // ---- voltage loop (the sense transformers' primaries are on the output, L to N): the output's rectified average (sense transformer, bridge, 10k / 1 µF:
  // about 9 ms; a peak detector here decayed in 180 ms and the start-up overshot to 370 V peak,
  // found in simulation) against the soft-start reference VSS (47 ms: with 22 ms it rose faster than
  // the averaged sense could follow, the output overshot to 348 V peak at 27 °C and 355 V at −10 °C
  // with the peak limiter taking over and dipping to 224 V behind it, found in simulation, D32;
  // the output reaches 99 % in about 0.22 s, as usual for an inverter); PI amplifier (P 0.47,
  // integral 45 /s) → VA, clamped at 3.3 V (full modulation) through 1k, stiff against the 200k summer
  nb.block('voltage loop')
    .part('TRS', 'transformer', -1300, 1950, SENSE_TR, { '1': o.senseOpen ? 'GND' : 'OUTL', '2': 'GND', '3': 'SAO', '4': 'SBO' })
    .part('RSO', 'resistor', -1180, 2050, { value: '220' }, { '1': 'SAO', '2': 'SNO' }, 1)
    .part('CSO', 'capacitor', -1180, 2150, { value: '100n', vmax: '63' }, { '1': 'SNO', '2': 'SBO' }, 1)
    .part('BRO', 'bridge', -1050, 1950, { value: 'DB107' }, { '1': 'SAO', '2': 'SBO', '3': 'VRO', '4': G })
    // RLO keeps the bridge conducting all the cycle: without a load it fed CVO only near the
    // peaks and the sense read 1.35 × high (the output settled at 171 V, found in simulation)
    .part('RLO', 'resistor', -980, 2050, { value: '1k', pmax: '0.25' }, { '1': 'VRO', '2': G }, 1)
    .part('RAV', 'resistor', -920, 1950, { value: '10k' }, { '1': 'VRO', '2': 'VSO' })
    .part('CVO', 'capacitor', -820, 2050, { value: '1u', vmax: '35' }, { '1': 'VSO', '2': G }, 1)
    .part('RVO1', 'resistor', -720, 1950, { value: '57.6k' }, { '1': 'VSO', '2': 'SO' })
    .part('RVO2', 'resistor', -620, 2050, { value: '25.5k' }, { '1': 'SO', '2': G }, 1)
    .part('RSS', 'resistor', -560, 1880, { value: '100k' }, { '1': 'VREF', '2': 'VSS' }, 1)
    .part('CSS', 'capacitor', -480, 2000, { value: o.softC ?? '470n', vmax: '50' }, { '1': 'VSS', '2': G }, 1)
    .part('QSS', 'npn', -400, 2080, { value: 'BC547B' }, { '1': 'BSS', '2': 'VSS', '3': G })
    // 100k: QSS empties CSS with its collector current alone (β × Ib); through 10k that was
    // above the BC547's 100 mA (found in the stress check)
    .part('RQS', 'resistor', -400, 2200, { value: '100k' }, { '1': 'ENN', '2': 'BSS' })
    .part('UEA', 'opamp', -260, 1950, { value: 'LM358', pkg: 'AMP' }, { '3': 'VSS', '2': 'NEA', '6': 'VAO', '7': V, '4': G })
    .part('REA', 'resistor', -380, 1880, { value: '100k' }, { '1': 'SO', '2': 'NEA' })
    // peak limiter: from about 245 V (hard towards the 262 V trip) DPL drives current into NEA
    // and pulls VA down within the half cycle; its current also unwinds the integrator (a 3.3 V
    // Zener across it for anti-windup leaked below its knee and upset the start-up). 47.5k: at
    // 230 V the diode stays 0.1 V below conduction (with 44.2k it already took a few µA there
    // and held the output at 221 V)
    // A motor start wound the loop up to full modulation behind the current limit, and when the
    // motor dropped the output jumped towards 307 V and the overvoltage latch tripped (found in
    // simulation)
    .part('RPL1', 'resistor', -1100, 2200, { value: '47.5k' }, { '1': 'VRO', '2': 'PLA' })
    .part('RPL2', 'resistor', -1000, 2300, { value: '10k' }, { '1': 'PLA', '2': G }, 1)
    .part('DPL', 'diode', -900, 2200, { value: '1N4148' }, { '2': 'PLA', '1': 'NEA' })
    .part('RFEA', 'resistor', -260, 1840, { value: '47k' }, { '1': 'NEA', '2': 'FEA' })
    // the integrator's capacitor (and its reset QEA) on VA, the clamped side of RVA: its charge
    // then cannot run past the 3.3 V clamp. On VAO it wound up to the op amp's rail behind the
    // current limit during a motor start, and when the motor dropped the output stayed at 127 %
    // for 15 ms until the overvoltage protection latched the bridge off (found in simulation,
    // D32); VA follows VAO within millivolts otherwise (1k against the 200k summer)
    .part('CFEA', 'capacitor', -140, 1840, { value: '220n', vmax: '25' }, { '1': 'FEA', '2': 'VA' })
    // while stopped, QEA empties the integrator: the bridge always starts from VA = 0 (without it
    // VA rested at 0.8 V and the start jumped to 207 V while the reference was at 16 %: found in
    // simulation)
    .part('QEA', 'nmos', -40, 1760, { value: '2N7000' }, { '1': 'ENN', '2': 'FEA', '3': 'VA' })
    .part('RVA', 'resistor', -120, 1950, { value: '1k' }, { '1': 'VAO', '2': 'VA' })
    .part('DZVA', 'zener', -20, 2050, { value: 'BZX55C3V3' }, { '1': 'VA', '2': G }, 1);

  // ---- independent output overvoltage (own sense transformer and reference, latched): EN low
  // above 262 V (2.5 V at SP); once tripped it holds itself until the battery is disconnected
  nb.block('protection')
    .part('TRS2', 'transformer', 150, 1950, SENSE_TR, { '1': 'OUTL', '2': 'GND', '3': 'SAP', '4': 'SBP' })
    .part('RSP', 'resistor', 270, 2050, { value: '220' }, { '1': 'SAP', '2': 'SNP' }, 1)
    .part('CSP', 'capacitor', 270, 2150, { value: '100n', vmax: '63' }, { '1': 'SNP', '2': 'SBP' }, 1)
    .part('BRP', 'bridge', 400, 1950, { value: 'DB107' }, { '1': 'SAP', '2': 'SBP', '3': 'VSP', '4': G })
    .part('CVP', 'capacitor', 530, 2050, { value: '2.2u', vmax: '35' }, { '1': 'VSP', '2': G }, 1)
    .part('RVP1', 'resistor', 650, 1950, { value: '68k' }, { '1': 'VSP', '2': 'SP' })
    .part('RVP2', 'resistor', 750, 2050, { value: '11.3k' }, { '1': 'SP', '2': G }, 1)
    // 21 ms: it trips on an overvoltage that lasts (a failed loop), not on the one half cycle at
    // up to 380 V peak (117 %, within the ITIC curve) when a large load is switched off (that
    // tripped it at the end of a motor start: found in simulation)
    .part('CSPF', 'capacitor', 820, 2150, { value: '2.2u', vmax: '25' }, { '1': 'SP', '2': G }, 1)
    .part('RREF2', 'resistor', 850, 1850, { value: '2.2k' }, { '1': V, '2': 'VREF2' }, 1)
    .part('UREF2', 'tl431', 850, 1980, { value: 'TL431' }, { '1': 'VREF2', '2': G, '3': 'VREF2' }, 3)
    .part('UOV', 'comparator', 1000, 1950, { value: 'LM393', pkg: 'PROT' }, { '3': 'SP', '2': 'VREF2', '1': 'FLT', '8': V, '4': G })
    .part('RFLT', 'resistor', 1100, 1850, { value: '2.2k' }, { '1': V, '2': 'FLT' }, 1)
    // the latch: FLT high (7.3 V with the LED and QFL's base) holds SP at 3.5 V through DLAT and
    // RLAT with the sense at zero (4.7k and 47k held only 0.6 V: the trip released itself when
    // CVP had discharged, found in simulation)
    .part('DLAT', 'diode', 1100, 2050, { value: '1N4148' }, { '2': 'FLT', '1': 'LAT' })
    .part('RLAT', 'resistor', 1000, 2120, { value: '10k' }, { '1': 'LAT', '2': 'SP' })
    .part('RBFL', 'resistor', 1220, 1880, { value: '10k' }, { '1': 'FLT', '2': 'BFL' })
    .part('QFL', 'npn', 1320, 1950, { value: 'BC547B' }, { '1': 'BFL', '2': 'EN', '3': G })
    .part('LFLT', 'led', 1220, 2060, { colour: 'red' }, { '2': 'FLT', '1': 'LFA' }, 1)
    .part('RLF', 'resistor', 1220, 2170, { value: '4.7k' }, { '1': 'LFA', '2': G }, 1)
    .part('CDP', 'capacitor', 1300, 2050, { value: '100n', vmax: '50' }, { '1': V, '2': G }, 1);
}

/** Options of the high-frequency inverter: as the 50 Hz-transformer unit, and for tests the DC-DC
 *  converter alone (`stage: 'dcdc'`: no sine bridge, a resistor `busLoad` on the 380 V bus) or the
 *  sine bridge alone (`stage: 'sine'`: the bus and the 15 V from bench sources). */
export interface InverterHfOptions extends InverterLfOptions {
  stage?: 'dcdc' | 'sine';
  /** Tests: a smaller capacitor for the DC-DC converter's overload timer (the product's 220 nF
   *  latches it off about 0.5 s after it reaches its current limit for good). */
  dcOverloadC?: string;
  busLoad?: string;
  /** Tests: the bus voltage feedback has failed (the optocoupler's LED open, DFMEA H-3). */
  feedbackOpen?: boolean;
}

/**
 * Inverter, one 5 kW unit, high-frequency type: 48 V LiFePO4 battery → isolated DC-DC converter
 * to a 380 V bus → IGBT sine bridge and LC filter → 230 V 50 Hz.
 *
 * DC-DC converter: MOSFET full bridge (2 × IRFP4468 per switch) at 20 kHz, phase-shifted: leg A
 * a 50 % square, leg B the same square shifted, so the ferrite transformer (1 : 12, gapped) gets
 * ±V(battery) from leg A's edge until leg B follows and freewheels for the rest. Leg B follows
 * when the primary current reaches the command (peak current-mode control: each half period
 * ends at the same current, so the transformer's flux stays balanced, and the current command
 * is also the cycle-by-cycle limit). SiC Schottky bridge (no reverse recovery), 470 µH, 4 × 470 µF 450 V. The
 * bus is regulated to 380 V by a TL431 on the high-voltage side through an optocoupler.
 *
 * The low-voltage side (battery, contactor, battery window, heatsink, the DC-DC control) is
 * referenced to the battery negative, bonded to PE with the output's N. The high-voltage side
 * (the bus, the sine bridge and its control) floats on the transformer; its 15 V come from an
 * auxiliary transformer on the bridge, and only optocouplers cross between the sides: the bus
 * feedback, the bus overvoltage stop and the 50 Hz square.
 *
 * Sine bridge: 4 × IKW50N60T, hybrid modulation: leg A switches at 20 kHz with the duty m·|sin|
 * (470 µH and 10 µF filter it), leg B at 50 Hz and its node is N, bonded to PE, so the floating
 * high-voltage side is tied to N through a conducting switch and does not move at the switching
 * frequency. The control is the 50 Hz-transformer unit's (inverterControl): sine from a
 * filtered exact 50 Hz square, DC servo (no DC at the output), averaging voltage loop with soft
 * start and peak limiter, current window at twice the rated peak, overload timer, independent
 * latched output overvoltage.
 */
export function inverterHF(o: InverterHfOptions = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const V = 'V12', VH = 'V15H', G = 'HVG';
  const inv = o.stage !== 'dcdc';
  const vb = o.vbat ?? 52;
  nb.wired = { rails: [V, VH, G], labelled: ['BF', 'AXA', 'BUS', 'LA', 'LB', 'BUSD', 'CSR', 'Q50H', 'REF', 'FBA', 'FBK', 'OVA', 'OVK', 'ENL', 'ENNL', 'VREFL', 'SDL', 'STOPL', 'BLK', 'AN', 'A', 'B', 'KEN', 'Q50',
    'HBUS', 'SWA', 'SWB', 'SRC', 'INA', 'INB', 'EN', 'ENN', 'VREF', 'VMID', 'VA', 'SINE', 'SINEB', 'TRI', 'SRS', 'OUTL', 'VME', 'STOP', 'SD', 'SP', 'FLT'] };
  nb.para('INVERTER, one 5 kW unit, high-frequency type: 48 V LiFePO4 battery (16 cells, 42 … 58.4 V) to 230 V 50 Hz. Isolated DC-DC converter (phase-shifted MOSFET full bridge at 20 kHz, peak current-mode, ferrite transformer 1 : 12, SiC rectifier) to a 380 V bus; IGBT full bridge, one leg at 20 kHz with an LC filter, the other at 50 Hz (N bonded to PE). Surge: twice the rated current for motor starts, cycle by cycle limited.', -1400, -420)
    .para('Protections (DFMEA section 6): pre-charge before the battery contactor closes; battery low cut-out 42 V (restart 47 V) and high cut-out 61 V; heatsink above 90 °C; bus overvoltage (own divider, reference and optocoupler) stops the DC-DC converter; bus undervoltage stops the sine bridge; cycle-by-cycle current limits in both converters; output overvoltage from its own sense transformer and reference (latched). WARNING: the bus holds 380 V for minutes after switch-off (bleeder 94 kΩ): wait 10 minutes.', -1400, -340);

  // ---- battery (test bench), input, pre-charge and contactor: as the 50 Hz-transformer unit
  nb.block('battery').note('TEST BENCH (not part of the product): the battery and its cables', -1400, -220)
    .part('BAT', 'battery', -1350, -100, { value: String(vb), rint: '0.01' }, o.reversed ? { '1': 'GND', '2': 'BC' } : { '1': 'BC', '2': 'GND' }, 1)
    .part('LBAT', 'inductor', -1290, -200, { value: '2u', imax: '1000' }, { '1': 'BC', '2': 'BP' });
  nb.block('dcin')
    .part('X1', 'terminal', -1200, -160, { value: 'BAT+' }, { '1': 'BP' })
    .part('X2', 'terminal', -1200, -40, { value: 'BAT−' }, { '1': 'GND' })
    .part('F1', 'fuse', -1050, -160, { value: '200', r: '0.3m' }, { '1': 'BP', '2': 'BF' })
    .part('DPC', 'diode', -900, -260, { value: '1N5408' }, { '2': 'BF', '1': 'PCA' })
    .part('RPC', 'resistor', -780, -260, { value: '10', pmax: '50' }, { '1': 'PCA', '2': 'BUS' })
    .part('K1', 'contactor', -820, -100, { value: '150 A DC, coil 48 V', ...(o.precharged ? { closed: 'true' } : {}) }, { A1: 'AXA', A2: 'KC', '1': 'BF', '2': 'BUS', '13': 'BKA', '14': 'GND' })
    .part('DK', 'diode', -950, -20, { value: '1N4007' }, { '2': 'KC', '1': 'AXA' }, 3)
    .part('QK', 'nmos', -900, 90, { value: 'IRF540N' }, { '1': 'KEN', '2': 'KC', '3': 'GND' });
  nb.block('bus');
  const pre: Record<string, string> = o.precharged ? { ic: String(vb - 0.7) } : {};
  for (let k = 0; k < 6; k++) nb.part(`CB${k + 1}`, 'capacitor', -600 + 70 * k, -60, { value: '47u', vmax: '100', ...pre }, { '1': 'BUS', '2': 'GND' }, 1);
  for (let k = 0; k < 2; k++) nb.part(`CE${k + 1}`, 'capacitor_pol', -600 + 70 * k, 60, { value: '2200u', vmax: '100', esr: '0.04', ...pre }, { '1': 'BUS', '2': 'GND' }, 1);

  // ---- DC-DC full bridge: 2 MOSFETs per switch, emitter-follower gate buffers as in the 50 Hz
  // unit (the drivers alone are too slow for 39 nF within their 0.5 µs dead time)
  nb.block('dc-dc bridge');
  ([['A', -150, 'LA'], ['B', 550, 'LB']] as const).forEach(([leg, x0, sw]) => {
    for (let k = 0; k < 2; k++) {
      const x = x0 + 120 * k;
      nb.part(`QH${leg}${k + 1}`, 'nmos', x, -160, { value: 'IRFP4468', heatsink: '0.5' }, { '1': `GH${leg}${k + 1}`, '2': 'BUSD', '3': sw })
        .part(`RGH${leg}${k + 1}`, 'resistor', x - 60, -240, { value: '4.7' }, { '1': `EH${leg}`, '2': `GH${leg}${k + 1}` })
        .part(`QL${leg}${k + 1}`, 'nmos', x, 40, { value: 'IRFP4468', heatsink: '0.5' }, { '1': `GL${leg}${k + 1}`, '2': sw, '3': 'GND' })
        .part(`RGL${leg}${k + 1}`, 'resistor', x - 60, 120, { value: '4.7' }, { '1': `EL${leg}`, '2': `GL${leg}${k + 1}` });
    }
    nb.part(`UD${leg}`, 'hbdriver', x0 + 120, 330, { value: 'IR2184-type 600 V' }, { '1': leg, '2': 'SDL', '8': V, '3': 'GND', '7': `VB${leg}`, '6': `HO${leg}`, '5': sw, '4': `LO${leg}` })
      .part(`DB${leg}`, 'diode', x0 + 240, 250, { value: '1N4148' }, { '2': V, '1': `VB${leg}` })
      .part(`CBS${leg}`, 'capacitor', x0 + 300, 330, { value: '2.2u', vmax: '25' }, { '1': `VB${leg}`, '2': sw }, 1)
      .part(`QBH${leg}`, 'npn', x0 + 400, -260, { value: 'D44H11' }, { '1': `HO${leg}`, '2': `VB${leg}`, '3': `EH${leg}` })
      .part(`QBHP${leg}`, 'pnp', x0 + 400, -140, { value: 'D45H11' }, { '1': `HO${leg}`, '2': sw, '3': `EH${leg}` })
      .part(`QBL${leg}`, 'npn', x0 + 400, 60, { value: 'D44H11' }, { '1': `LO${leg}`, '2': V, '3': `EL${leg}` })
      .part(`QBLP${leg}`, 'pnp', x0 + 400, 180, { value: 'D45H11' }, { '1': `LO${leg}`, '2': 'GND', '3': `EL${leg}` })
      .part(`RHS${leg}`, 'resistor', x0 + 500, -200, { value: '10k' }, { '1': `EH${leg}`, '2': sw }, 1)
      .part(`RLS${leg}`, 'resistor', x0 + 500, 120, { value: '10k' }, { '1': `EL${leg}`, '2': 'GND' }, 1)
      .part(`CDD${leg}`, 'capacitor', x0 + 20, 410, { value: '1u', vmax: '25' }, { '1': V, '2': 'GND' }, 1);
  });

  // 2 × 2.2 µF film right across the bridge: the commutation loop closes through them, not
  // through the current transformer's leakage (without them the drains rang at each edge with
  // the MOSFETs' capacitance, and the simulation took six times as long); the transformer still
  // sees the pulse current, which they cannot supply for more than a fraction of a microsecond
  for (let k = 0; k < 2; k++) nb.part(`CBD${k + 1}`, 'capacitor', 250 + 70 * k, -60, { value: '2.2u', vmax: '100' }, { '1': 'BUSD', '2': 'GND' }, 1);
  // the current in the bridge's supply, between the bus capacitors and the high-side drains: a
  // current transformer (1 turn : 200, one fast diode, UF4007: the reset swing reverses it by
  // 40 V, a 1N5819's rating; 1.2 Ω: 6 mV/A; 1k reset it between the pulses: 4.7k, reflected
  // 0.12 Ω, gave −17 V spikes on the bridge when the dead time returns current through it). In
  // the return its few nH of leakage carried the commutating current: the low-side sources
  // jumped −16 … +6 V against the drivers' ground, the gates and the bootstraps saw 21 V, and
  // the spikes ended the pulses early (5 kW held the bus at only 300 V; found in simulation).
  // It sees the transformer's current while
  // the bridge drives it, from zero, offset included (not the freewheeling current inside the
  // bridge), so a half period with a DC offset ends sooner: the flux stays balanced. In series
  // with the winding (bipolar, never zero) it could not see the offset, and 18 A of DC built up
  // in the primary; a 0.47 mΩ shunt gave 40 mV at 90 A, too little for the comparator (found in
  // simulation)
  nb.block('current sense')
    // its core saturates at 1.5 A primary-referred magnetising current, ten times what a half
    // period builds (about 0.14 A)
    .part('TCT', 'transformer', -520, 200, { value: '200', lp: '2u', rp: '0.1m', rs: '2', k: '0.999', isat: '1.5' }, { '1': 'BUS', '2': 'BUSD', '3': 'CTA', '4': 'GND' })
    .part('RCR', 'resistor', -440, 280, { value: '1k' }, { '1': 'CTA', '2': 'GND' }, 1)
    .part('DC1', 'diode', -380, 180, { value: 'UF4007' }, { '2': 'CTA', '1': 'CSR' })
    .part('RBD', 'resistor', -300, 260, { value: '1.2', pmax: '2' }, { '1': 'CSR', '2': 'GND' }, 1)
    // the reverse clamp: while the dead time returns current to the bus (360 A when the bus is
    // shorted) the diode DC1 blocks and the secondary current had only the 1k: 1.8 kV on the
    // secondary. DCR and a 24 V 5 W Zener take it, and the same 24 V resets the core within the
    // 4 µs blanking (through 4.7 Ω the reset stayed below 1 V, the core saturated at high duty
    // and the current limit failed: 47 A in the output inductor, found in simulation). With the
    // bus shorted the clamp carries about 0.7 A r.m.s. until the overload timer stops the
    // converter (a 13 V 1 W Zener and a 2 W resistor were over their ratings there)
    .part('DCR', 'diode', -440, 400, { value: 'UF4007' }, { '2': 'CZC', '1': 'CTA' }, 3)
    .part('DZC', 'zener', -380, 460, { value: '1N5359B' }, { '1': 'GND', '2': 'CZC' }, 3);

  // ---- transformer, auxiliary transformer, SiC rectifier, filter, the 380 V bus
  nb.block('dc-dc output')
    // gapped ferrite core: 100 µH magnetising, about 0.1 µH leakage (primary side), core losses
    // about 15 W (150 Ω: they also damp the ringing with the switches' capacitance)
    // the core saturates at 12 A magnetising current: ferrite at 100 °C (about 0.35 T), 1.64 ×
    // the 7.3 A a 25 µs half period builds at 58.4 V; the margin is for the offset the
    // current-mode limit allows before it corrects it (DFMEA H-5)
    .part('TR1', 'transformer', 1250, -60, { value: '12', lp: '100u', rp: '1m', rs: '0.15', k: '0.9995', rc: '150', isat: '12' }, { '1': 'LA', '2': 'LB', '3': 'S1', '4': 'S2' })
    // the snubber damps the ringing of the leakage inductance with the diodes' capacitance
    .part('RSN', 'resistor', 1370, -220, { value: '470', pmax: '10' }, { '1': 'S1', '2': 'SNB' })
    .part('CSN', 'capacitor', 1470, -220, { value: '220p', vmax: '2000' }, { '1': 'SNB', '2': 'S2' })
    .part('DR1', 'diode', 1400, -160, { value: 'C4D20120A', heatsink: '2' }, { '2': 'S1', '1': 'RP' }, 3)
    .part('DR2', 'diode', 1520, -160, { value: 'C4D20120A', heatsink: '2' }, { '2': 'S2', '1': 'RP' }, 3)
    .part('DR3', 'diode', 1400, 40, { value: 'C4D20120A', heatsink: '2' }, { '2': G, '1': 'S1' }, 3)
    .part('DR4', 'diode', 1520, 40, { value: 'C4D20120A', heatsink: '2' }, { '2': G, '1': 'S2' }, 3)
    // its core losses (about 6 W) damp its ringing with the diodes while the current is zero
    .part('LOB', 'inductor', 1650, -160, { value: '470u', imax: '40', rloss: '15k', isat: '40' }, { '1': 'RP', '2': 'HBUS' });
  const hpre: Record<string, string> = o.precharged ? { ic: '380' } : {};
  for (let k = 0; k < 4; k++) nb.part(`CH${k + 1}`, 'capacitor_pol', 1750 + 70 * k, -60, { value: '470u', vmax: '450', esr: '0.15', ...hpre }, { '1': 'HBUS', '2': G }, 1);
  for (let k = 0; k < 2; k++) nb.part(`CHF${k + 1}`, 'capacitor', 2030 + 70 * k, -60, { value: '2.2u', vmax: '630', ...hpre }, { '1': 'HBUS', '2': G }, 1);
  nb.part('RBL1', 'resistor', 2170, -100, { value: '47k', pmax: '3' }, { '1': 'HBUS', '2': 'BLM' }, 1)
    .part('RBL2', 'resistor', 2170, 20, { value: '47k', pmax: '3' }, { '1': 'BLM', '2': G }, 1)
    // Y2 capacitors from the bus to PE (EMI). With the hybrid modulation the bus is tied to N
    // through leg B and moves by 380 V only at the zero crossings; with unipolar PWM it jumped
    // at every switching edge, and with bipolar PWM at every dead time at light load: through
    // the capacitance to PE the high-voltage side rang to ±1 kV (found in simulation). 220 Ω in
    // series damp the edge at each zero crossing
    .part('CY1', 'capacitor', 2060, 160, { value: '2.2n', vmax: '1600', ...(o.precharged ? { ic: inv ? '190' : '380' } : {}) }, { '1': 'HBUS', '2': 'YD1' }, 1)
    .part('RY1', 'resistor', 2060, 280, { value: '220', pmax: '2' }, { '1': 'YD1', '2': 'GND' }, 1)
    .part('CY2', 'capacitor', 2170, 160, { value: '2.2n', vmax: '1600', ...(o.precharged ? { ic: inv ? '-190' : '0' } : {}) }, { '1': G, '2': 'YD2' }, 1)
    .part('RY2', 'resistor', 2170, 280, { value: '220', pmax: '2' }, { '1': 'YD2', '2': 'GND' }, 1);
  // the auxiliary transformer on leg A, a 50 % square whatever the load (between the drive
  // pulses too: across both legs it got almost nothing at no load, and the 15 V fell to 4 V,
  // found in simulation), through a blocking capacitor: ±V(battery)/2, rectified 19.6 … 27.8 V,
  // regulated to 15 V for the high-voltage side
  nb.block('hv supply')
    .part('CXB', 'capacitor', 1150, 300, { value: '2.2u', vmax: '100' }, { '1': 'XB', '2': 'GND' }, 1)
    // saturates at 50 mA magnetising current, 2.7 × the 18 mA of ±29 V for 12.5 µs
    .part('TRA', 'transformer', 1250, 200, { value: '1', lp: '20m', rp: '0.5', rs: '0.5', k: '0.99', rc: '4.7k', isat: '0.05' }, { '1': 'LA', '2': 'XB', '3': 'XA1', '4': 'XA2' })
    // 10k across the winding damp the ringing of its leakage with the bridge's capacitance
    .part('RXA', 'resistor', 1330, 400, { value: '10k' }, { '1': 'XA1', '2': 'XA2' }, 1)
    .part('BRA', 'bridge', 1380, 300, { value: 'DB107' }, { '1': 'XA1', '2': 'XA2', '3': 'VXH', '4': G })
    .part('CXA', 'capacitor_pol', 1440, 400, { value: '47u', vmax: '50', ...(o.precharged ? { ic: (0.5 * vb - 1.4).toFixed(1) } : {}) }, { '1': 'VXH', '2': G }, 1)
    .part('UAH', 'lm317', 1580, 300, { value: 'LM317HV', heatsink: '8' }, { '3': 'VXH', '1': 'ADJH', '2': VH })
    .part('RA1H', 'resistor', 1680, 380, { value: '240' }, { '1': VH, '2': 'ADJH' }, 1)
    .part('RA2H', 'resistor', 1580, 460, { value: '2.61k' }, { '1': 'ADJH', '2': G }, 1)
    .part('CAXH', 'capacitor', 1760, 380, { value: '10u', vmax: '25', ...(o.precharged ? { ic: '14.8' } : {}) }, { '1': VH, '2': G }, 1);

  // ---- 12 V control supply (low-voltage side), the reference
  nb.block('aux')
    .part('DAUX', 'diode', -1300, 300, { value: '1N4007' }, { '2': 'BF', '1': 'AXA' })
    .part('RAUX', 'resistor', -1200, 300, { value: '220', pmax: '5' }, { '1': 'AXA', '2': 'VRAW' })
    .part('CRAW', 'capacitor', -1100, 380, { value: '2.2u', vmax: '100' }, { '1': 'VRAW', '2': 'GND' }, 1)
    .part('UAX', 'lm317', -1000, 300, { value: 'LM317HV', heatsink: '8' }, { '3': 'VRAW', '1': 'ADJ', '2': V })
    .part('RA1', 'resistor', -900, 380, { value: '240' }, { '1': V, '2': 'ADJ' }, 1)
    .part('RA2', 'resistor', -1000, 460, { value: '2.05k' }, { '1': 'ADJ', '2': 'GND' }, 1)
    .part('CAX', 'capacitor', -820, 380, { value: '10u', vmax: '25' }, { '1': V, '2': 'GND' }, 1)
    .part('RREFL', 'resistor', -700, 300, { value: '2.2k' }, { '1': V, '2': 'VREFL' }, 1)
    .part('UREFL', 'tl431', -700, 420, { value: 'TL431B' }, { '1': 'VREFL', '2': 'GND', '3': 'VREFL' }, 3);

  // ---- battery contactor (as the 50 Hz unit)
  nb.block('precharge')
    .part('RPB1', 'resistor', -1300, 620, { value: '200k' }, { '1': 'AXA', '2': 'VBF' }, 1)
    .part('RPB2', 'resistor', -1300, 740, { value: '10k' }, { '1': 'VBF', '2': 'GND' }, 1)
    .part('RPU1', 'resistor', -1180, 620, { value: '182k' }, { '1': 'BUS', '2': 'VBU' }, 1)
    .part('RPU2', 'resistor', -1180, 740, { value: '10k' }, { '1': 'VBU', '2': 'GND' }, 1)
    .part('UPC', 'comparator', -1000, 680, { value: 'LM339', pkg: 'CMPL' }, { '3': 'VBU', '2': 'VBF', '1': 'KEN', '8': V, '4': 'GND' })
    .part('RKEN', 'resistor', -900, 600, { value: '10k' }, { '1': V, '2': 'KEN' }, 1)
    .part('RPH', 'resistor', -1000, 780, { value: '1M' }, { '1': 'KEN', '2': 'VBU' });

  // ---- battery window and the enable of the DC-DC converter (as the 50 Hz unit); the bus
  // overvoltage optocoupler U2 also pulls ENL low
  nb.block('battery window')
    .part('RBS1', 'resistor', -760, 620, { value: '200k' }, { '1': 'AXA', '2': 'VBS' }, 1)
    .part('RBS2', 'resistor', -760, 740, { value: '10k' }, { '1': 'VBS', '2': 'GND' }, 1)
    .part('CBS', 'capacitor', -700, 800, { value: '470n', vmax: '25', ...(o.precharged ? { ic: ((vb - 0.85) / 21).toFixed(3) } : {}) }, { '1': 'VBS', '2': 'GND' }, 1)
    .part('RLV1', 'resistor', -620, 620, { value: '1.54k' }, { '1': 'VREFL', '2': 'VLO' }, 1)
    .part('RLV2', 'resistor', -620, 740, { value: '10k' }, { '1': 'VLO', '2': 'GND' }, 1)
    .part('ULV', 'comparator', -480, 680, { value: 'LM339', pkg: 'CMPL' }, { '3': 'VBS', '2': 'VLO', '1': 'ENL', '8': V, '4': 'GND' })
    .part('RLVH', 'resistor', -480, 800, { value: '475k' }, { '1': 'ENL', '2': 'VBS' })
    .part('RBH1', 'resistor', -340, 620, { value: '243k', tol: '0.1' }, { '1': 'AXA', '2': 'VBH' }, 1)
    .part('RBH2', 'resistor', -340, 740, { value: '10k', tol: '0.1' }, { '1': 'VBH', '2': 'GND' }, 1)
    .part('CBH', 'capacitor', -280, 800, { value: '470n', vmax: '25', ...(o.precharged ? { ic: ((vb - 0.85) / 25.3).toFixed(3) } : {}) }, { '1': 'VBH', '2': 'GND' }, 1)
    .part('RHV1', 'resistor', -220, 620, { value: '715', tol: '0.1' }, { '1': 'VREFL', '2': 'VHI' }, 1)
    .part('RHV2', 'resistor', -220, 740, { value: '10k', tol: '0.1' }, { '1': 'VHI', '2': 'GND' }, 1)
    .part('UHV', 'comparator', -80, 680, { value: 'LM393', pkg: 'PROTL' }, { '3': 'VHI', '2': 'VBH', '1': 'HVN', '8': V, '4': 'GND' })
    .part('RHVN', 'resistor', 20, 600, { value: '10k' }, { '1': V, '2': 'HVN' }, 1)
    .part('RHVH', 'resistor', -80, 800, { value: '100k' }, { '1': 'HVN', '2': 'VHI' })
    .part('DHV', 'diode', 20, 800, { value: '1N4148' }, { '2': 'ENL', '1': 'HVN' })
    .part('REN', 'resistor', 120, 600, { value: '10k' }, { '1': V, '2': 'ENL' }, 1)
    .part('RKA', 'resistor', -900, 820, { value: '22k' }, { '1': V, '2': 'BKA' }, 1)
    .part('QKA', 'npn', -780, 900, { value: 'BC547B' }, { '1': 'BKA', '2': 'ENL', '3': 'GND' })
    .part('RQE', 'resistor', 240, 680, { value: '47k' }, { '1': 'ENL', '2': 'BQE' })
    .part('QEN', 'npn', 340, 740, { value: 'BC547B' }, { '1': 'BQE', '2': 'ENNL', '3': 'GND' })
    .part('RQE2', 'resistor', 280, 820, { value: '47k' }, { '1': 'BQE', '2': 'GND' }, 1)
    .part('RENN', 'resistor', 340, 600, { value: '10k' }, { '1': V, '2': 'ENNL' }, 1)
    .part('CDC1', 'capacitor', 120, 840, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- the DC-DC converter's overload timer (the second comparator of the battery window's
  // LM393): the command VC averaged over 0.22 s against 1.87 V, just below its 1.92 V ceiling,
  // where it rests only while the current limit holds a lasting overload (5 kW at 42 V needs
  // about 1.78 V; the bus's charge at the start and a motor start last too briefly). Then OLL
  // rises, QOL pulls ENL low and DOLF holds the average up: the converter stays off until the
  // battery is disconnected. Without it a shorted bus held the converter at its limit, the
  // current transformer's clamp dissipating 2.3 W, until the heatsink cut-out (found in
  // simulation)
  nb.block('dc-dc overload')
    .part('ROTA', 'resistor', -1420, 1380, { value: '10k', tol: '0.1' }, { '1': 'VREFL', '2': 'VOT' }, 1)
    .part('ROTB', 'resistor', -1420, 1500, { value: '30.1k', tol: '0.1' }, { '1': 'VOT', '2': 'GND' }, 1)
    .part('ROT', 'resistor', -1300, 1560, { value: '1M' }, { '1': 'VC', '2': 'VCF' })
    .part('COT', 'capacitor', -1200, 1660, { value: o.dcOverloadC ?? '220n', vmax: '25' }, { '1': 'VCF', '2': 'GND' }, 1)
    .part('USP', 'comparator', -1080, 1460, { value: 'LM393', pkg: 'PROTL' }, { '3': 'VCF', '2': 'VOT', '1': 'OLL', '8': V, '4': 'GND' })
    .part('ROLP', 'resistor', -980, 1380, { value: '10k' }, { '1': V, '2': 'OLL' }, 1)
    .part('DOLF', 'diode', -980, 1620, { value: '1N4148' }, { '2': 'OLL', '1': 'OLF' }, 1)
    .part('ROLF', 'resistor', -1080, 1720, { value: '10k' }, { '1': 'OLF', '2': 'VCF' })
    .part('ROLB', 'resistor', -900, 1440, { value: '47k' }, { '1': 'OLL', '2': 'BOL' })
    .part('QOL', 'npn', -830, 1480, { value: 'BC547B' }, { '1': 'BOL', '2': 'ENL', '3': 'GND' });

  // ---- heatsink (MOSFETs and IGBTs on one heatsink): ENL low above 90 °C; the DC-DC converter
  // stops, and the sine bridge stops when the bus falls below its undervoltage level
  nb.block('thermal')
    .part('RTH', 'ntc', 500, 620, { value: '10k', temp: String(o.theatsink ?? 50) }, { '1': 'VREFL', '2': 'NHS' }, 1)
    .part('RTHB', 'resistor', 500, 740, { value: '10k' }, { '1': 'NHS', '2': 'GND' }, 1)
    .part('RT90', 'resistor', 620, 620, { value: '3.92k' }, { '1': 'VREFL', '2': 'T90' }, 1)
    .part('RT90B', 'resistor', 620, 740, { value: '40.2k' }, { '1': 'T90', '2': 'GND' }, 1)
    .part('UTH', 'comparator', 760, 680, { value: 'LM339', pkg: 'CMPL' }, { '3': 'T90', '2': 'NHS', '1': 'THN', '8': V, '4': 'GND' })
    .part('RTHN', 'resistor', 860, 600, { value: '10k' }, { '1': V, '2': 'THN' }, 1)
    .part('RTHH', 'resistor', 760, 800, { value: '2.2M' }, { '1': 'THN', '2': 'T90' })
    .part('DTH', 'diode', 860, 800, { value: '1N4148' }, { '2': 'ENL', '1': 'THN' });

  // ---- 50 Hz (low-voltage side, as the 50 Hz unit), to the high-voltage side through U3
  nb.block('50 Hz')
    .part('U50', 'timer555', -1300, 1050, { value: 'NE555' }, { '8': V, '4': V, '7': 'D50', '6': 'T50', '2': 'T50', '3': 'C200', '5': 'K50', '1': 'GND' })
    .part('RA50', 'resistor', -1420, 960, { value: '10k' }, { '1': V, '2': 'D50' }, 1)
    .part('RB50', 'resistor', -1420, 1080, { value: '30.9k' }, { '1': 'D50', '2': 'T50' }, 1)
    .part('CT50', 'capacitor', -1420, 1200, { value: '100n', vmax: '50' }, { '1': 'T50', '2': 'GND' }, 1)
    .part('CK50', 'capacitor', -1180, 1180, { value: '10n', vmax: '50' }, { '1': 'K50', '2': 'GND' }, 1)
    .part('UFF1', 'dff', -1050, 1040, { value: V , pkg: 'FF' }, { '1': 'Q100N', '2': 'C200', '3': 'Q100', '4': 'Q100N' })
    .part('UFF2', 'dff', -850, 1040, { value: V , pkg: 'FF' }, { '1': 'Q50N', '2': 'Q100', '3': 'Q50', '4': 'Q50N' })
    .part('CD50', 'capacitor', -950, 1180, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    // 4.7 mA in the LED; on the high-voltage side the phototransistor pulls Q50H low (2.2k from
    // 15 V: 6.8 mA, saturated with the PC817's CTR of 80 % or more)
    .part('R50', 'resistor', -750, 1040, { value: '2.2k' }, { '1': 'Q50', '2': 'L50A' })
    .part('U3', 'opto', -620, 1060, { value: 'PC817' }, { '1': 'L50A', '2': 'GND', '4': 'Q50H', '3': G })
    .part('R50H', 'resistor', -660, 940, { value: '2.2k' }, { '1': VH, '2': 'Q50H' }, 1);

  // ---- DC-DC control, a phase-shifted bridge with peak current-mode: a 555 at 40 kHz (84 %
  // charge, 4 µs discharge: the blanking BLK between the half periods, which is also the
  // current transformer's reset time: at most 84 % on, 24 V × 4 µs resets the 4.2 V × 21 µs of
  // a full pulse; with 1.7 µs the core walked into saturation at high duty, the limit failed and
  // the output inductor reached 47 A, found in simulation with the saturating core). Leg A toggles at the
  // end of each blanking (CD4013: 20 kHz, 50 %), which starts the power pulse; leg B takes A's
  // level when the primary current reaches the command (latch of two CD4001 gates, set by OC,
  // reset during the blanking), or at the next blanking: the pulse ends and the bridge
  // freewheels. Each leg switches once per half period. With B = A ⊕ PA (both legs flipping
  // together at each blanking, leg B three times per half period) the dead times differed
  // between the two directions and 8 A of DC stayed in the transformer (found in simulation)
  nb.block('dc-dc control')
    .part('U40', 'timer555', -400, 1100, { value: 'NE555' }, { '8': V, '4': V, '7': 'D40', '6': 'T40', '2': 'T40', '3': 'O40', '5': 'K40', '1': 'GND' })
    .part('RA40', 'resistor', -520, 1010, { value: '24.3k' }, { '1': V, '2': 'D40' }, 1)
    .part('RB40', 'resistor', -520, 1130, { value: '5.76k' }, { '1': 'D40', '2': 'T40' }, 1)
    .part('CT40', 'capacitor', -520, 1250, { value: '1n', vmax: '50' }, { '1': 'T40', '2': 'GND' }, 1)
    .part('CK40', 'capacitor', -280, 1230, { value: '10n', vmax: '50' }, { '1': 'K40', '2': 'GND' }, 1)
    // BLK = O40 inverted (a transistor: the four gates of one CD4001 are taken)
    .part('RBK', 'resistor', -200, 1000, { value: '10k' }, { '1': 'O40', '2': 'BBK' })
    .part('QBK', 'npn', -100, 1060, { value: 'BC547B' }, { '1': 'BBK', '2': 'BLK', '3': 'GND' })
    .part('RCK', 'resistor', -100, 960, { value: '4.7k' }, { '1': V, '2': 'BLK' }, 1)
    .part('UFA', 'dff', 20, 1000, { value: V, pkg: 'FFA' }, { '1': 'AN', '2': 'O40', '3': 'A', '4': 'AN' })
    // the latch: OC sets it, the blanking resets it
    .part('G2', 'nor2', -20, 1150, { value: V, pkg: 'NOR1' }, { '1': 'BLK', '2': 'QCN', '3': 'QC' })
    .part('G3', 'nor2', -20, 1270, { value: V, pkg: 'NOR1' }, { '1': 'OC', '2': 'QC', '3': 'QCN' })
    // CKB = QC or BLK: B follows A at the current trip, at the latest at the blanking
    .part('G4', 'nor2', 160, 1200, { value: V, pkg: 'NOR1' }, { '1': 'QC', '2': 'BLK', '3': 'CKN' })
    .part('G5', 'nor2', 300, 1200, { value: V, pkg: 'NOR1' }, { '1': 'CKN', '2': 'CKN', '3': 'CKB' })
    .part('UFB', 'dff', 440, 1060, { value: V, pkg: 'FFA' }, { '1': 'A', '2': 'CKB', '3': 'B', '4': 'BN' })
    .part('CDL', 'capacitor', 120, 1320, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    // peak current: the current transformer's signal (0.5 µs filter against the turn-on spike)
    // plus the slope compensation (the 555 ramp, AC-coupled, 0.68 V; biased 0.34 V up from
    // VREFL so it stays above 0 V) against the command VC
    .part('RCF', 'resistor', -500, 1400, { value: '1k' }, { '1': 'CSR', '2': 'CSF' })
    .part('CCF', 'capacitor', -400, 1500, { value: '470p', vmax: '50' }, { '1': 'CSF', '2': 'GND' }, 1)
    .part('RCB', 'resistor', -400, 1300, { value: '5.23k' }, { '1': 'VREFL', '2': 'CSF' })
    // the ramp through an emitter follower (68k straight on the 1 nF timing capacitor slowed the
    // oscillator to 23 kHz)
    .part('QSLF', 'npn', -640, 1380, { value: 'BC547B' }, { '1': 'T40', '2': V, '3': 'T40E' })
    .part('RSLE', 'resistor', -700, 1500, { value: '4.7k' }, { '1': 'T40E', '2': 'GND' }, 1)
    .part('CSL', 'capacitor', -600, 1500, { value: '100n', vmax: '50' }, { '1': 'T40E', '2': 'SLP' }, 1)
    .part('RSL', 'resistor', -500, 1560, { value: '4.99k' }, { '1': 'SLP', '2': 'CSF' })
    .part('UCS', 'comparator', -280, 1450, { value: 'LM339', pkg: 'CMPL' }, { '3': 'CSF', '2': 'VC', '1': 'OC', '8': V, '4': 'GND' })
    .part('ROC', 'resistor', -180, 1380, { value: '4.7k' }, { '1': V, '2': 'OC' }, 1)
    // the command: at most 1.92 V from VREFL (the current limit: about 220 A at the end of a long
    // pulse, more at the start), pulled down by the feedback optocoupler U1; the soft start QSC
    // holds it below VSSL + 0.6 V
    .part('RVC', 'resistor', 0, 1380, { value: '10k', tol: '0.1' }, { '1': 'VREFL', '2': 'VC' }, 1)
    .part('RVC2', 'resistor', -100, 1620, { value: '33k', tol: '0.1' }, { '1': 'VC', '2': 'GND' }, 1)
    .part('U1', 'opto', 140, 1500, { value: 'PC817' }, { '1': 'FBA', '2': 'FBK', '4': 'VC', '3': 'GND' })
    .part('QSC', 'pnp', 280, 1450, { value: 'BC557B' }, { '1': 'VSSL', '2': 'GND', '3': 'VC' })
    .part('RSSL', 'resistor', 380, 1380, { value: '100k' }, { '1': 'VREFL', '2': 'VSSL' }, 1)
    .part('CSSL', 'capacitor', 380, 1500, { value: '220n', vmax: '25', ...(o.precharged ? { ic: '2.5' } : {}) }, { '1': 'VSSL', '2': 'GND' }, 1)
    .part('QSSL', 'npn', 480, 1580, { value: 'BC547B' }, { '1': 'BSSL', '2': 'VSSL', '3': 'GND' })
    .part('RQSL', 'resistor', 480, 1680, { value: '100k' }, { '1': 'ENNL', '2': 'BSSL' })
    // ENL low (or the bus overvoltage) turns all four switches off through both drivers' SD
    .part('QSDL', 'nmos', -300, 1800, { value: '2N7000' }, { '1': 'STOPL', '2': 'SDL', '3': 'GND' })
    .part('RSDL', 'resistor', -300, 1700, { value: '10k' }, { '1': V, '2': 'SDL' }, 1)
    .part('DSEL', 'diode', -180, 1880, { value: '1N4148' }, { '2': 'ENNL', '1': 'STOPL' })
    .part('RSTL', 'resistor', -80, 1880, { value: '100k' }, { '1': 'STOPL', '2': 'GND' }, 1)
    .part('U2', 'opto', 120, 1800, { value: 'PC817' }, { '1': 'OVA', '2': 'OVK', '4': 'ENL', '3': 'GND' });

  // ---- high-voltage side: reference, mid-rail, bus voltage feedback and bus overvoltage
  nb.block('hv reference')
    .part('RREF', 'resistor', 1000, 560, { value: '2.2k' }, { '1': VH, '2': 'VREF' }, 1)
    .part('UREF', 'tl431', 1000, 680, { value: 'TL431B' }, { '1': 'VREF', '2': G, '3': 'VREF' }, 3)
    .part('RM1', 'resistor', 1120, 560, { value: '10k' }, { '1': VH, '2': 'VMR' }, 1)
    .part('RM2', 'resistor', 1120, 680, { value: '10k' }, { '1': 'VMR', '2': G }, 1)
    .part('UM', 'opamp', 1260, 620, { value: 'TL074', pkg: 'SIG2' }, { '3': 'VMR', '2': 'VMID', '6': 'VMID', '7': VH, '4': G })
    .part('CDS1', 'capacitor', 1260, 740, { value: '100n', vmax: '50' }, { '1': VH, '2': G }, 1);
  // 381 V: 1.48 MΩ (750k + 732k) and 9.76k on the TL431 (its own, not the reference above); the LED
  // current pulls the command down; 1k across the LED keeps the TL431 above its 1 mA minimum
  nb.block('bus feedback')
    .part('RFB1', 'resistor', 1400, 520, { value: '750k', tol: '0.1' }, { '1': 'HBUS', '2': 'FBM' }, 1)
    .part('RFB2', 'resistor', 1400, 620, { value: '732k', tol: '0.1' }, { '1': 'FBM', '2': 'FBS' }, 1)
    .part('RFB3', 'resistor', 1400, 740, { value: '9.76k', tol: '0.1' }, { '1': 'FBS', '2': G }, 1)
    .part('UFB', 'tl431', 1520, 700, { value: 'TL431B' }, { '1': 'FBS', '2': G, '3': 'FBK' }, 3)
    .part('RFC', 'resistor', 1620, 640, { value: '33k' }, { '1': 'FBK', '2': 'FBC' })
    .part('CFC', 'capacitor', 1620, 740, { value: '100n', vmax: '50', ...(o.precharged ? { ic: '11' } : {}) }, { '1': 'FBC', '2': 'FBS' })
    .part('RFL', 'resistor', 1500, 440, { value: '1k' }, { '1': VH, '2': o.feedbackOpen ? 'FBX' : 'FBA' })
    .part('RFBI', 'resistor', 1640, 520, { value: '1k' }, { '1': VH, '2': 'FBK' });
  // independent bus overvoltage: own divider, the HV reference, LM393 with hysteresis; above 425 V
  // its output pulls U2's LED on and the DC-DC converter stops until the bus is below 404 V
  // (17.4k/100k from VREF: 2.125 V through 14.8 kΩ; 2M from the output moves it ±0.05 V). With
  // 12k/100k and 200k the hysteresis lifted the trip to 550 V while the output was high: with the
  // feedback lost the bus reached 548 V (H-3, found in simulation). The
  // output has its own pull-up and the hysteresis is high-impedance, so the LED
  // stays dark while the comparator is off (with 20k straight from the LED's cathode the LED
  // carried 0.45 mA through the hysteresis and held the converter's enable half low, found in
  // simulation)
  nb.block('bus overvoltage')
    .part('RBO1', 'resistor', 1800, 520, { value: '750k', tol: '0.1' }, { '1': 'HBUS', '2': 'BOM' }, 1)
    .part('RBO2', 'resistor', 1800, 620, { value: '750k', tol: '0.1' }, { '1': 'BOM', '2': 'BOS' }, 1)
    .part('RBO3', 'resistor', 1800, 740, { value: '7.87k', tol: '0.1' }, { '1': 'BOS', '2': G }, 1)
    .part('RBV1', 'resistor', 1920, 560, { value: '17.4k', tol: '0.1' }, { '1': 'VREF', '2': 'BOR' }, 1)
    .part('RBV2', 'resistor', 1920, 680, { value: '100k', tol: '0.1' }, { '1': 'BOR', '2': G }, 1)
    .part('UBOV', 'comparator', 2060, 620, { value: 'LM393', pkg: 'PROT' }, { '3': 'BOR', '2': 'BOS', '1': 'OVK', '8': VH, '4': G })
    .part('RBOH', 'resistor', 2060, 740, { value: '2M' }, { '1': 'OVK', '2': 'BOR' })
    .part('ROVL', 'resistor', 2180, 520, { value: '4.7k' }, { '1': VH, '2': 'OVA' })
    .part('ROVP', 'resistor', 2180, 640, { value: '2.2k' }, { '1': VH, '2': 'OVK' }, 1);

  if (!inv) {
    nb.block('load').note('TEST LOAD (not part of the product): the bus', 2300, -220)
      .part('RBUS', 'resistor', 2350, -60, { value: o.busLoad ?? '28.9', pmax: '6k' }, { '1': 'HBUS', '2': G }, 1)
      // without the sine bridge (whose leg B ties the bus to N) the bench earths the bus negative
      .part('RISO', 'resistor', 2450, 60, { value: '1' }, { '1': G, '2': 'GND' }, 1);
  } else {
    // ---- sine bridge: one IKW50N60T per switch, driven directly (310 nC)
    nb.block('bridge');
    // leg B is N itself (bonded to PE): it switches at 50 Hz, so the high-voltage side is tied
    // to N through a conducting IGBT and moves only at the zero crossings
    ([['A', 2350, 'SWA'], ['B', 2750, 'GND']] as const).forEach(([leg, x0, sw]) => {
      nb.part(`QIH${leg}`, 'igbt', x0, -160, { value: 'IKW50N60T', heatsink: '1' }, { '1': `GIH${leg}`, '2': 'HBUS', '3': sw })
        .part(`RGIH${leg}`, 'resistor', x0 - 70, -240, { value: '10' }, { '1': `HOI${leg}`, '2': `GIH${leg}` })
        .part(`RGEH${leg}`, 'resistor', x0 + 70, -240, { value: '10k' }, { '1': `GIH${leg}`, '2': sw }, 1)
        .part(`QIL${leg}`, 'igbt', x0, 40, { value: 'IKW50N60T', heatsink: '1' }, { '1': `GIL${leg}`, '2': sw, '3': 'SRC' })
        .part(`RGIL${leg}`, 'resistor', x0 - 70, 120, { value: '10' }, { '1': `LOI${leg}`, '2': `GIL${leg}` })
        .part(`RGEL${leg}`, 'resistor', x0 + 70, 120, { value: '10k' }, { '1': `GIL${leg}`, '2': 'SRC' }, 1)
        .part(`UDI${leg}`, 'hbdriver', x0, 300, { value: 'IR2184-type 600 V' }, { '1': `IN${leg}`, '2': 'SD', '8': VH, '3': G, '7': `VBI${leg}`, '6': `HOI${leg}`, '5': sw, '4': `LOI${leg}` })
        .part(`DBI${leg}`, 'diode', x0 + 120, 220, { value: 'UF4007' }, { '2': leg === 'B' ? 'VBRB' : VH, '1': `VBI${leg}` })
        // leg B's high side conducts for a whole negative half cycle (10 ms) on its bootstrap:
        // the 10k gate resistor and the driver take about 1.6 mA, which emptied 2.2 µF by 7 V,
        // below the driver's undervoltage lockout; 22 µF lose 0.7 V, charged through 10 Ω
        .part(`CBI${leg}`, 'capacitor', x0 + 160, 300, { value: leg === 'B' ? '22u' : '2.2u', vmax: '25' }, { '1': `VBI${leg}`, '2': sw }, 1)
        .part(`CDI${leg}`, 'capacitor', x0 - 100, 380, { value: '1u', vmax: '25' }, { '1': VH, '2': G }, 1);
    });
    nb.part('RBSB', 'resistor', 2840, 190, { value: '10' }, { '1': VH, '2': 'VBRB' });
    // shunt in the bridge return: ±104 mV is the current window's limit (±69 A, 2.2 × the rated
    // peak of 31 A)
    nb.part('RSHI', 'resistor', 2570, 180, { value: '1.5m', pmax: '3' }, { '1': 'SRC', '2': G }, 1);
    nb.block('output')
      .part('LF1', 'inductor', 3000, -160, { value: '470u', imax: '80', isat: '80' }, { '1': 'SWA', '2': 'OUTL' })
      .part('COUT', 'capacitor', 3130, -60, { value: '10u', vmax: '630' }, { '1': 'OUTL', '2': 'GND' }, 1)
      .part('RVO', 'mov', 3230, -60, { value: '14D471K' }, { '1': 'OUTL', '2': 'GND' }, 1)
      .part('X3', 'terminal', 3350, -140, { value: 'L out' }, { '1': 'OUTL' }, 2)
      .part('X4', 'terminal', 3350, -80, { value: 'N out' }, { '1': 'GND' }, 2)
      .part('X5', 'terminal', 3350, -20, { value: 'PE' }, { '1': 'GND' }, 2);
    if (o.load !== '0') nb.block('load').note('TEST LOAD (not part of the product)', 2980, 160)
      .part('RLOAD', 'resistor', 3000, 260, { value: o.load ? String(3 * Number(o.load)) : '32.4', pmax: '2k' }, { '1': 'OUTL', '2': 'GND' }, 1)
      .part('RLOAD2', 'resistor', 3120, 260, { value: o.load ? String(3 * Number(o.load)) : '32.4', pmax: '2k' }, { '1': 'OUTL', '2': 'GND' }, 1)
      .part('RLOAD3', 'resistor', 3240, 260, { value: o.load ? String(3 * Number(o.load)) : '32.4', pmax: '2k' }, { '1': 'OUTL', '2': 'GND' }, 1);
    if (o.motorStart) nb.block('bench').note('TEST BENCH: a motor start (locked rotor)', 3900, -220)
      .part('DMS', 'diode', 3880, 120, { value: '1N4007' }, { '2': 'GND', '1': 'MSC' }, 3)
      .part('VMS', 'vpulse', 4050, 120, { value: '12', low: '0', freq: '1', duty: String(o.motorStart.for * 100), delay: String(o.motorStart.at), edge: '10u' }, { '1': 'MSC', '2': 'GND' })
      .part('KMS', 'relay', 3950, 40, { value: '12 V 30 A', zc: 'true' }, { '1': 'MSC', '2': 'GND', '3': 'OUTL', '5': 'MSL' })
      .part('MST', 'motor1', 4150, -40, { value: '1', rs: '0.5', rr: '0.6', ls: '4m', lm: '0.15' }, { '1': 'MSL', '2': 'GND' });

    // ---- bus window and the enable of the sine bridge: EN high above 355 V, low below 325 V
    // (the hysteresis from EN: any fault restarts only above 355 V); the output protections pull
    // EN low as in the 50 Hz unit
    nb.block('bus window')
      .part('RUV1', 'resistor', 2300, 520, { value: '750k', tol: '0.1' }, { '1': 'HBUS', '2': 'UVM' }, 1)
      .part('RUV2', 'resistor', 2300, 620, { value: '750k', tol: '0.1' }, { '1': 'UVM', '2': 'BUV' }, 1)
      .part('RUV3', 'resistor', 2300, 740, { value: '9.31k', tol: '0.1' }, { '1': 'BUV', '2': G }, 1)
      .part('RLH1', 'resistor', 2420, 560, { value: '1.54k', tol: '0.1' }, { '1': 'VREF', '2': 'VLOH' }, 1)
      .part('RLH2', 'resistor', 2420, 680, { value: '10k', tol: '0.1' }, { '1': 'VLOH', '2': G }, 1)
      .part('ULVH', 'comparator', 2560, 620, { value: 'LM393', pkg: 'CMPH' }, { '3': 'BUV', '2': 'VLOH', '1': 'EN', '8': VH, '4': G })
      .part('RUVH', 'resistor', 2560, 740, { value: '750k' }, { '1': 'EN', '2': 'BUV' })
      .part('RENH', 'resistor', 2680, 520, { value: '10k' }, { '1': VH, '2': 'EN' }, 1)
      .part('RQEH', 'resistor', 2680, 640, { value: '47k' }, { '1': 'EN', '2': 'BQEH' })
      .part('QENH', 'npn', 2780, 700, { value: 'BC547B' }, { '1': 'BQEH', '2': 'ENN', '3': G })
      .part('RQEH2', 'resistor', 2720, 780, { value: '47k' }, { '1': 'BQEH', '2': G }, 1)
      .part('RENNH', 'resistor', 2800, 560, { value: '10k' }, { '1': VH, '2': 'ENN' }, 1)
      .part('CDCH', 'capacitor', 2880, 700, { value: '100n', vmax: '50' }, { '1': VH, '2': G }, 1)
      // undervoltage lockout of the 15 V: EN low below 13 V (the 15 V decays within milliseconds
      // once the converter stops, while the bus may still be charged: the control must not run on
      // a failing supply); the second comparator of this LM393 is the output voltage limit (in
      // inverterControl)
      .part('RUL1', 'resistor', 2980, 520, { value: '42.2k' }, { '1': VH, '2': 'ULS' }, 1)
      .part('RUL2', 'resistor', 2980, 640, { value: '10k' }, { '1': 'ULS', '2': G }, 1)
      .part('UUV', 'comparator', 3100, 600, { value: 'LM393', pkg: 'UVH' }, { '3': 'ULS', '2': 'VREF', '1': 'EN', '8': VH, '4': G });

    // ---- the control of the sine bridge (shared with the 50 Hz unit), drawn below
    nb.ox = 2050;
    inverterControl(nb, o, { V: VH, G, q50: 'Q50H', cmpT: { value: 'LM393', pkg: 'CMPH' }, cmpV: { value: 'LM393', pkg: 'UVH' }, hybrid: true, swb: 'GND' });
    nb.ox = 0;
  }

  // the installation's insulation resistance from the high-voltage side to PE
  nb.block('bench').note('TEST BENCH: insulation resistance', 1880, 360)
    .part('RINS', 'resistor', 1960, 440, { value: '10M' }, { '1': G, '2': 'GND' }, 1);

  if (inv) nb.v('OUTL').v('SINE').v('VA').v('HBUS').v('EN').i('LF1', '1');
  else nb.v('HBUS').v('VC').v('ENL').i('TR1', '1');
  nb.sim({ type: 'tran', stop: o.stop ?? '200m', step: '5u', start: 'zero', thin: true });
  // the sine bridge alone (`stage: 'sine'`, for tests): the bench feeds the bus and the 15 V of
  // the high-voltage side; the DC-DC converter and its control are left out
  if (o.stage === 'sine') nb.block('bench').note('TEST BENCH: the bus and the 15 V from sources', 1880, 860)
    .part('VBSB', 'battery', 1960, 940, { value: '381', rint: '0.05' }, { '1': 'HBUS', '2': G }, 1)
    .part('V15B', 'battery', 2060, 940, { value: '15', rint: '0.05' }, { '1': VH, '2': G }, 1);
  const sheet = nb.done();
  if (o.stage === 'sine') {
    const gone = new Set(['dc-dc bridge', 'current sense', 'dc-dc output', 'hv supply', 'dc-dc control', 'bus feedback', 'bus overvoltage']);
    const drop = new Set([...nb.ids.values()].filter((id) => gone.has(nb.blockOf(id))));
    sheet.parts = sheet.parts.filter((p) => !drop.has(p.id));
  }
  if (o.temp !== undefined) sheet.temp = String(o.temp);
  if (o.tj !== undefined) for (const p of sheet.parts) if (p.props.heatsink?.trim()) p.props = { ...p.props, tj: String(o.tj) };
  if (o.aged) for (const p of sheet.parts) if (p.sym === 'capacitor_pol') {
    const c = parseValue(p.props.value), r = p.props.esr?.trim() ? parseValue(p.props.esr) : null;
    p.props = { ...p.props, value: String(0.8 * (c ?? 0)), ...(r !== null ? { esr: String(2 * r) } : {}) };
  }
  // a run that starts with the bus charged: every capacitor of the high-voltage side's 15 V rail
  // starts charged with it (the decoupling at 0 V pulled the rail down to 1.5 V at the start)
  if (o.precharged) {
    const c = connectivity(sheet);
    for (const p of sheet.parts) if ((p.sym === 'capacitor' || p.sym === 'capacitor_pol') && !p.props.ic) {
      const nets = new Set([c.pinNet.get(`${p.ref}.1`), c.pinNet.get(`${p.ref}.2`)]);
      if (nets.has(VH) && nets.has(G)) p.props = { ...p.props, ic: '14.8' };
    }
  }
  return { sheet, nb };
}
