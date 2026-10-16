// Inverters (P7, decision D30). This file: the low-frequency (50 Hz transformer) unit, 48 V
// LiFePO4 battery to 230 V 50 Hz, 5 kW, designed against the DFMEA (DFMEA.md section 5) from
// discrete catalogue parts and drawn as the product (D28: wired, terminals, real supplies).

import { NB } from './powerExamples';
import type { Sheet } from './schematic';

/** Options of the 50 Hz-transformer inverter: battery voltage (V), load (Ω at 230 V; 0: none),
 *  air and heatsink temperatures (°C), simulated time, and short timings for tests. */
export interface InverterLfOptions {
  vbat?: number; load?: string; stop?: string; temp?: number; theatsink?: number;
  /** Tests: the bus capacitors start charged to the battery voltage (the pre-charge itself has
   *  its own test), so a run reaches the output sooner. */
  precharged?: boolean;
  /** Tests: a smaller soft-start capacitor (the product's 220 nF ramps in about 0.1 s). */
  softC?: string;
  /** Tests: the battery connected the wrong way round (DFMEA I-2). */
  reversed?: boolean;
  /** Tests: the voltage loop's sense transformer sees nothing (winding open, DFMEA I-10). */
  senseOpen?: boolean;
}

/** The sense transformer of the voltage loop and of the independent protection: a 1 VA 230/12 V
 *  PCB type (as the other power designs). */
const SENSE_TR = { value: '0.052', lp: '100', rp: '2k', rs: '20', k: '0.99' };

/**
 * Inverter, one 5 kW unit, 50 Hz transformer type.
 *
 * Power: battery terminals → 200 A class T fuse → battery contactor (closes when the DC bus is
 * pre-charged through 22 Ω and a diode, so a reversed battery charges nothing and never closes
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
  const V = 'V12';
  nb.wired = { rails: [V], labelled: ['BF', 'AXA', 'VME', 'BUS', 'SWA', 'SWB', 'SRC', 'INA', 'INB', 'EN', 'ENN', 'VREF', 'VMID', 'VA', 'SINE', 'SINEB', 'TRI', 'ISA', 'OUTL', 'VBS', 'Q50', 'KEN', 'STOP'] };
  nb.para('INVERTER, one 5 kW unit, 50 Hz transformer type: 48 V LiFePO4 battery (16 cells, 42 … 58.4 V) to 230 V 50 Hz. MOSFET full bridge (3 × IRFP4468 per switch) with unipolar sine PWM at 20 kHz; 50 Hz transformer 27.5/230 V 5 kVA; its leakage inductance and a 10 µF X2 capacitor filter the output. Surge: twice the rated current for motor starts, cycle by cycle limited.', -1400, -420)
    .para('Protections (DFMEA section 5): pre-charge before the battery contactor closes (a reversed battery closes nothing); cycle-by-cycle current limit; battery low cut-out 42 V (restart 47 V) and high cut-out 61 V; heatsink above 90 °C; output overvoltage from its own sense transformer and reference (latched). Every fault stops the bridge and the soft start begins again when it clears.', -1400, -340);

  // ---- battery (test bench) and the battery input
  nb.block('battery').note('TEST BENCH (not part of the product): the battery', -1400, -220)
    .part('BAT', 'battery', -1350, -100, { value: String(o.vbat ?? 52), rint: '0.01' }, o.reversed ? { '1': 'GND', '2': 'BP' } : { '1': 'BP', '2': 'GND' }, 1);
  nb.block('dcin')
    .part('X1', 'terminal', -1200, -160, { value: 'BAT+' }, { '1': 'BP' })
    // the battery negative is the control ground (bonded to PE with the output's N)
    .part('X2', 'terminal', -1200, -40, { value: 'BAT−' }, { '1': 'GND' })
    .part('F1', 'fuse', -1050, -160, { value: '200', r: '0.3m' }, { '1': 'BP', '2': 'BF' })
    // pre-charge: diode (a reversed battery charges nothing) and 22 Ω, 25 W
    .part('DPC', 'diode', -900, -260, { value: '1N4007' }, { '2': 'BF', '1': 'PCA' })
    .part('RPC', 'resistor', -780, -260, { value: '22', pmax: '25' }, { '1': 'PCA', '2': 'BUS' })
    // the contactor's 48 V coil from the battery after the input diode DAUX: a reversed battery
    // cannot energise it through QK's body diode
    .part('K1', 'contactor', -820, -100, { value: '150 A DC, coil 48 V' }, { A1: 'AXA', A2: 'KC', '1': 'BF', '2': 'BUS', '13': 'BKA', '14': 'GND' })
    .part('DK', 'diode', -950, -20, { value: '1N4007' }, { '2': 'KC', '1': 'AXA' }, 3)
    .part('QK', 'nmos', -900, 90, { value: 'IRF540N' }, { '1': 'KEN', '2': 'KC', '3': 'GND' });
  // the film DC bus
  nb.block('bus');
  for (let k = 0; k < 6; k++) nb.part(`CB${k + 1}`, 'capacitor', -600 + 70 * k, -60, { value: '47u', vmax: '100', ...(o.precharged ? { ic: String((o.vbat ?? 52) - 0.7) } : {}) }, { '1': 'BUS', '2': 'GND' }, 1);

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
    nb.part(`UD${leg}`, 'hbdriver', x0 + 120, 330, { value: 'IR2184-type 600 V' }, { '1': `IN${leg}`, '8': V, '3': 'GND', '7': `VB${leg}`, '6': `HO${leg}`, '5': `SW${leg}`, '4': `LO${leg}` })
      .part(`DB${leg}`, 'diode', x0 + 240, 250, { value: '1N4148' }, { '2': V, '1': `VB${leg}` })
      .part(`CBS${leg}`, 'capacitor', x0 + 300, 330, { value: '2.2u', vmax: '25' }, { '1': `VB${leg}`, '2': `SW${leg}` }, 1)
      // high-side buffer between VB and SW, low-side buffer between 12 V and ground
      .part(`QBH${leg}`, 'npn', x0 + 400, -260, { value: 'D44H11' }, { '1': `HO${leg}`, '2': `VB${leg}`, '3': `EH${leg}` })
      .part(`QBHP${leg}`, 'pnp', x0 + 400, -140, { value: 'D45H11' }, { '1': `HO${leg}`, '2': `SW${leg}`, '3': `EH${leg}` })
      .part(`QBL${leg}`, 'npn', x0 + 400, 60, { value: 'D44H11' }, { '1': `LO${leg}`, '2': V, '3': `EL${leg}` })
      .part(`QBLP${leg}`, 'pnp', x0 + 400, 180, { value: 'D45H11' }, { '1': `LO${leg}`, '2': 'GND', '3': `EL${leg}` })
      .part(`RHS${leg}`, 'resistor', x0 + 500, -200, { value: '10k' }, { '1': `EH${leg}`, '2': `SW${leg}` }, 1)
      .part(`RLS${leg}`, 'resistor', x0 + 500, 120, { value: '10k' }, { '1': `EL${leg}`, '2': 'GND' }, 1)
      .part(`CDD${leg}`, 'capacitor', x0 + 20, 410, { value: '1u', vmax: '25' }, { '1': V, '2': 'GND' }, 1);
  });
  // current shunt in the bridge return (both directions)
  nb.part('RSH', 'resistor', 500, 260, { value: '0.2m', pmax: '10' }, { '1': 'SRC', '2': 'GND' }, 1);

  // ---- transformer, output filter, surge protection, output terminals
  nb.block('output')
    .part('TR1', 'transformer', 1400, -60, { value: '8.36', lp: '15m', rp: '3m', rs: '0.25', k: '0.999' }, { '1': 'SWA', '2': 'SWB', '3': 'OUTL', '4': 'GND' })
    .part('COUT', 'capacitor', 1550, -60, { value: '10u', vmax: '630' }, { '1': 'OUTL', '2': 'GND' }, 1)
    .part('RVO', 'mov', 1650, -60, { value: '14D471K' }, { '1': 'OUTL', '2': 'GND' }, 1)
    .part('X3', 'terminal', 1800, -140, { value: 'L out' }, { '1': 'OUTL' }, 2)
    .part('X4', 'terminal', 1800, -80, { value: 'N out' }, { '1': 'GND' }, 2)
    .part('X5', 'terminal', 1800, -20, { value: 'PE' }, { '1': 'GND' }, 2);
  if (o.load !== '0') nb.block('load').note('TEST LOAD (not part of the product)', 1900, -220)
    .part('RLOAD', 'resistor', 1950, -60, { value: o.load ?? '10.7', pmax: '1.5k' }, { '1': 'OUTL', '2': 'GND' }, 1);

  // ---- 12 V control supply from the battery (after the fuse; a diode against reversal)
  nb.block('aux')
    .part('DAUX', 'diode', -1300, 300, { value: '1N4007' }, { '2': 'BF', '1': 'AXA' })
    .part('RAUX', 'resistor', -1200, 300, { value: '220', pmax: '5' }, { '1': 'AXA', '2': 'VRAW' })
    .part('CRAW', 'capacitor', -1100, 380, { value: '2.2u', vmax: '100' }, { '1': 'VRAW', '2': 'GND' }, 1)
    .part('UAX', 'lm317', -1000, 300, { value: 'LM317HV', heatsink: '8' }, { '3': 'VRAW', '1': 'ADJ', '2': V })
    .part('RA1', 'resistor', -900, 380, { value: '240' }, { '1': V, '2': 'ADJ' }, 1)
    .part('RA2', 'resistor', -1000, 460, { value: '2.05k' }, { '1': 'ADJ', '2': 'GND' }, 1)
    .part('CAX', 'capacitor', -820, 380, { value: '10u', vmax: '25' }, { '1': V, '2': 'GND' }, 1)
    // the band-gap reference and the mid-rail (6 V) for the AC signals
    .part('RREF', 'resistor', -700, 300, { value: '2.2k' }, { '1': V, '2': 'VREF' }, 1)
    .part('UREF', 'tl431', -700, 420, { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' }, 3)
    .part('RM1', 'resistor', -560, 300, { value: '10k' }, { '1': V, '2': 'VMR' }, 1)
    .part('RM2', 'resistor', -560, 420, { value: '10k' }, { '1': 'VMR', '2': 'GND' }, 1)
    .part('UM', 'opamp', -420, 360, { value: 'TL074', pkg: 'SIG2' }, { '3': 'VMR', '2': 'VMID', '6': 'VMID', '7': V, '4': 'GND' })
    .part('CDS1', 'capacitor', -420, 480, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- battery contactor: closes when the bus is above 90 % of the battery (pre-charged)
  nb.block('precharge')
    .part('RPB1', 'resistor', -1300, 620, { value: '200k' }, { '1': 'AXA', '2': 'VBF' }, 1)
    .part('RPB2', 'resistor', -1300, 740, { value: '10k' }, { '1': 'VBF', '2': 'GND' }, 1)
    .part('RPU1', 'resistor', -1180, 620, { value: '182k' }, { '1': 'BUS', '2': 'VBU' }, 1)
    .part('RPU2', 'resistor', -1180, 740, { value: '10k' }, { '1': 'VBU', '2': 'GND' }, 1)
    .part('UPC', 'comparator', -1000, 680, { value: 'LM339', pkg: 'CMP1' }, { '3': 'VBU', '2': 'VBF', '1': 'KEN', '8': V, '4': 'GND' })
    .part('RKEN', 'resistor', -900, 600, { value: '10k' }, { '1': V, '2': 'KEN' }, 1)
    // hysteresis: once closed it stays closed while the bus follows the battery
    .part('RPH', 'resistor', -1000, 780, { value: '1M' }, { '1': 'KEN', '2': 'VBU' });

  // ---- battery window (dividers after DAUX, 0.7 V below the battery): low cut-out at 42 V,
  // restart at 47 V (hysteresis from EN: any fault restarts only above 47 V); high cut-out at
  // 61 V with its own output HVN and hysteresis
  nb.block('battery window')
    .part('RBS1', 'resistor', -760, 620, { value: '200k' }, { '1': 'AXA', '2': 'VBS' }, 1)
    .part('RBS2', 'resistor', -760, 740, { value: '10k' }, { '1': 'VBS', '2': 'GND' }, 1)
    .part('RLV1', 'resistor', -620, 620, { value: '1.54k' }, { '1': 'VREF', '2': 'VLO' }, 1)
    .part('RLV2', 'resistor', -620, 740, { value: '10k' }, { '1': 'VLO', '2': 'GND' }, 1)
    .part('ULV', 'comparator', -480, 680, { value: 'LM339', pkg: 'CMP1' }, { '3': 'VBS', '2': 'VLO', '1': 'EN', '8': V, '4': 'GND' })
    .part('RLVH', 'resistor', -480, 800, { value: '475k' }, { '1': 'EN', '2': 'VBS' })
    .part('RBH1', 'resistor', -340, 620, { value: '249k' }, { '1': 'AXA', '2': 'VBH' }, 1)
    .part('RBH2', 'resistor', -340, 740, { value: '10k' }, { '1': 'VBH', '2': 'GND' }, 1)
    .part('RHV1', 'resistor', -220, 620, { value: '715' }, { '1': 'VREF', '2': 'VHI' }, 1)
    .part('RHV2', 'resistor', -220, 740, { value: '10k' }, { '1': 'VHI', '2': 'GND' }, 1)
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
    .part('RENN', 'resistor', 340, 600, { value: '10k' }, { '1': V, '2': 'ENN' }, 1)
    .part('CDC1', 'capacitor', 120, 840, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- heatsink temperature: EN low above 90 °C (NTC 10k at 25 °C on the heatsink), with its
  // own output THN and about 3 °C hysteresis
  nb.block('thermal')
    .part('RTH', 'ntc', 500, 620, { value: '10k', temp: String(o.theatsink ?? 50) }, { '1': 'VREF', '2': 'NHS' }, 1)
    .part('RTHB', 'resistor', 500, 740, { value: '10k' }, { '1': 'NHS', '2': 'GND' }, 1)
    .part('RT90', 'resistor', 620, 620, { value: '3.74k' }, { '1': 'VREF', '2': 'T90' }, 1)
    .part('RT90B', 'resistor', 620, 740, { value: '40.2k' }, { '1': 'T90', '2': 'GND' }, 1)
    .part('UTH', 'comparator', 760, 680, { value: 'LM339', pkg: 'CMP1' }, { '3': 'T90', '2': 'NHS', '1': 'THN', '8': V, '4': 'GND' })
    .part('RTHN', 'resistor', 860, 600, { value: '10k' }, { '1': V, '2': 'THN' }, 1)
    .part('RTHH', 'resistor', 760, 800, { value: '100k' }, { '1': 'THN', '2': 'T90' })
    .part('DTH', 'diode', 860, 800, { value: '1N4148' }, { '2': 'EN', '1': 'THN' });

  // ---- 50 Hz: 555 at 200 Hz and both flip-flops of a CD4013 (÷4): an exact 50 % square Q50
  nb.block('50 Hz')
    .part('U50', 'timer555', -1300, 1050, { value: 'NE555' }, { '8': V, '4': V, '7': 'D50', '6': 'T50', '2': 'T50', '3': 'C200', '5': 'K50', '1': 'GND' })
    .part('RA50', 'resistor', -1420, 960, { value: '10k' }, { '1': V, '2': 'D50' }, 1)
    .part('RB50', 'resistor', -1420, 1080, { value: '30.9k' }, { '1': 'D50', '2': 'T50' }, 1)
    .part('CT50', 'capacitor', -1420, 1200, { value: '100n', vmax: '50' }, { '1': 'T50', '2': 'GND' }, 1)
    .part('CK50', 'capacitor', -1180, 1180, { value: '10n', vmax: '50' }, { '1': 'K50', '2': 'GND' }, 1)
    .part('UFF1', 'dff', -1050, 1040, { value: V }, { '1': 'Q100N', '2': 'C200', '3': 'Q100', '4': 'Q100N' })
    .part('UFF2', 'dff', -850, 1040, { value: V }, { '1': 'Q50N', '2': 'Q100', '3': 'Q50', '4': 'Q50N' })
    .part('CD50', 'capacitor', -950, 1180, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- the square VME ± VA/2: H = VMID + VA/2, L = 2·VME − H; QSQ connects SQ to L while Q50
  // is high, RSQ to H otherwise. VME = VMID + the DC servo's correction: the square's mean, and
  // with it the sine's DC, follows VME
  nb.block('sine')
    // H = 1.5 × (2·VMID + VA)/3 = VMID + VA/2: a weighted sum straight into the high-impedance
    // input (a 10k VA/2 divider here was loaded by the sum and gave H = VMID + 1.5 V with VA = 0:
    // the bridge started at 45 % modulation and the OV latch tripped, found in simulation)
    .part('RH1', 'resistor', -700, 960, { value: '100k' }, { '1': 'VMID', '2': 'HP' })
    .part('RH2', 'resistor', -700, 1060, { value: '200k' }, { '1': 'VA', '2': 'HP' })
    .part('UH', 'opamp', -560, 1000, { value: 'TL074', pkg: 'SIG1' }, { '3': 'HP', '2': 'HN', '6': 'H', '7': V, '4': 'GND' })
    .part('RHF', 'resistor', -560, 900, { value: '4.99k' }, { '1': 'HN', '2': 'H' })
    .part('RHG', 'resistor', -660, 1140, { value: '10k' }, { '1': 'HN', '2': 'GND' }, 1)
    // L: H mirrored about VMID (inverting, gain 1, around VMID)
    .part('UL', 'opamp', -400, 1150, { value: 'TL074', pkg: 'SIG1' }, { '3': 'VME', '2': 'LN', '6': 'L', '7': V, '4': 'GND' })
    .part('RL1', 'resistor', -480, 1240, { value: '10k' }, { '1': 'H', '2': 'LN' })
    .part('RL2', 'resistor', -380, 1260, { value: '10k' }, { '1': 'LN', '2': 'L' })
    .part('RSQ', 'resistor', -300, 960, { value: '1k' }, { '1': 'H', '2': 'SQ' })
    .part('QSQ', 'nmos', -260, 1080, { value: '2N7000' }, { '1': 'Q50', '2': 'SQ', '3': 'L' })
    // 4th-order Butterworth low-pass, 70 Hz: two unity-gain Sallen–Key stages (Q 0.54, 1.31)
    .part('RF1', 'resistor', -150, 1000, { value: '22.1k' }, { '1': 'SQ', '2': 'F1A' })
    .part('RF2', 'resistor', -50, 1000, { value: '22.1k' }, { '1': 'F1A', '2': 'F1B' })
    .part('CF1', 'capacitor', -50, 900, { value: '110n', vmax: '50' }, { '1': 'F1A', '2': 'F1O' })
    .part('CF2', 'capacitor', 30, 1100, { value: '100n', vmax: '50' }, { '1': 'F1B', '2': 'VMID' }, 1)
    .part('UF1', 'opamp', 120, 1000, { value: 'TL074', pkg: 'SIG1' }, { '3': 'F1B', '2': 'F1O', '6': 'F1O', '7': V, '4': 'GND' })
    .part('RF3', 'resistor', 240, 1000, { value: '22.1k' }, { '1': 'F1O', '2': 'F2A' })
    .part('RF4', 'resistor', 340, 1000, { value: '22.1k' }, { '1': 'F2A', '2': 'F2B' })
    .part('CF3', 'capacitor', 340, 900, { value: '270n', vmax: '50' }, { '1': 'F2A', '2': 'SINE' })
    .part('CF4', 'capacitor', 420, 1100, { value: '39n', vmax: '50' }, { '1': 'F2B', '2': 'VMID' }, 1)
    .part('UF2', 'opamp', 520, 1000, { value: 'TL074', pkg: 'SIG2' }, { '3': 'F2B', '2': 'SINE', '6': 'SINE', '7': V, '4': 'GND' })
    // the inverted sine for leg B: 2·VMID − SINE
    .part('RN1', 'resistor', 640, 1000, { value: '10k' }, { '1': 'SINE', '2': 'NSB' })
    .part('RN2', 'resistor', 740, 1100, { value: '10k' }, { '1': 'NSB', '2': 'SINEB' })
    .part('UNB', 'opamp', 760, 1000, { value: 'TL074', pkg: 'SIG2' }, { '3': 'VMID', '2': 'NSB', '6': 'SINEB', '7': V, '4': 'GND' })
    .part('CDS2', 'capacitor', 860, 1160, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- DC servo (FF 5.1.6: DC saturates the transformer): a JFET differential integrator of
  // SWA − SWB (÷11 dividers around VMID, 470k / 10 µF) moves VME until the primary's mean
  // voltage is zero; QDC resets it while the bridge is stopped
  nb.block('dc servo')
    .part('RDA1', 'resistor', 1000, 900, { value: '470k' }, { '1': 'SWA', '2': 'NDC' })
    .part('RDA2', 'resistor', 1000, 1000, { value: '47k' }, { '1': 'NDC', '2': 'VMID' })
    .part('RDB1', 'resistor', 1000, 1150, { value: '470k' }, { '1': 'SWB', '2': 'PDC' })
    .part('RDB2', 'resistor', 1100, 1250, { value: '47k' }, { '1': 'PDC', '2': 'VMID' }, 1)
    .part('CDB', 'capacitor', 1000, 1250, { value: '10u', vmax: '25' }, { '1': 'PDC', '2': 'VMID' }, 1)
    .part('UDC', 'opamp', 1200, 1050, { value: 'TL074', pkg: 'SIG1' }, { '3': 'PDC', '2': 'NDC', '6': 'VME', '7': V, '4': 'GND' })
    .part('CDI', 'capacitor', 1200, 900, { value: '10u', vmax: '25' }, { '1': 'NDC', '2': 'VME' })
    .part('QDC', 'nmos', 1350, 950, { value: '2N7000' }, { '1': 'ENN', '2': 'VME', '3': 'NDC' });

  // ---- 20 kHz triangle: integrator (13.3k / 3.3 nF) and a comparator Schmitt trigger (1k
  // pull-up: its square swings about VMID ± 5.8 V, the triangle VMID ± 1.5 V): 21.9 kHz from the
  // RC, 20 kHz with the LM339's response time at each turn (15k gave 17.7 kHz in simulation).
  // An op-amp as the Schmitt trigger slewed rail to rail every 25 µs (it set most of the
  // simulation's steps)
  nb.block('pwm')
    .part('UTI', 'opamp', -1300, 1500, { value: 'TL074', pkg: 'SIG2' }, { '3': 'VMID', '2': 'NTI', '6': 'TRI', '7': V, '4': 'GND' })
    .part('RTI', 'resistor', -1420, 1420, { value: '13.3k' }, { '1': 'SQT', '2': 'NTI' })
    .part('CTI', 'capacitor', -1300, 1400, { value: '3.3n', vmax: '50' }, { '1': 'NTI', '2': 'TRI' })
    .part('UST', 'comparator', -1100, 1500, { value: 'LM339', pkg: 'CMP1' }, { '3': 'PST', '2': 'VMID', '1': 'SQT', '8': V, '4': 'GND' })
    .part('RSTU', 'resistor', -1000, 1400, { value: '1k' }, { '1': V, '2': 'SQT' }, 1)
    .part('RSA', 'resistor', -1100, 1400, { value: '10k' }, { '1': 'TRI', '2': 'PST' })
    .part('RSB', 'resistor', -1000, 1600, { value: '38.3k' }, { '1': 'SQT', '2': 'PST' })
    // leg A on while SINE is above the triangle, leg B while SINEB is
    .part('UPA', 'comparator', -850, 1500, { value: 'LM339', pkg: 'CMP2' }, { '3': 'SINE', '2': 'TRI', '1': 'INA', '8': V, '4': 'GND' })
    .part('RPA', 'resistor', -750, 1420, { value: '4.7k' }, { '1': V, '2': 'INA' }, 1)
    .part('UPB', 'comparator', -650, 1500, { value: 'LM339', pkg: 'CMP2' }, { '3': 'SINEB', '2': 'TRI', '1': 'INB', '8': V, '4': 'GND' })
    .part('RPB', 'resistor', -550, 1420, { value: '4.7k' }, { '1': V, '2': 'INB' }, 1)
    // STOP (EN low, or an overcurrent) pulls both driver inputs to ground with a FET each: a
    // comparator output and a diode would leave about 1.3 V, above the driver's 0.8 V low level
    .part('QIA', 'nmos', -750, 1620, { value: '2N7000' }, { '1': 'STOP', '2': 'INA', '3': 'GND' })
    .part('QIB', 'nmos', -550, 1620, { value: '2N7000' }, { '1': 'STOP', '2': 'INB', '3': 'GND' })
    .part('DSE', 'diode', -650, 1700, { value: '1N4148' }, { '2': 'ENN', '1': 'STOP' })
    .part('RSTP', 'resistor', -450, 1720, { value: '100k' }, { '1': 'STOP', '2': 'GND' }, 1)
    .part('CDC2', 'capacitor', -450, 1600, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- cycle-by-cycle current limit: ISA = VMID-referred ×24 of the shunt; outside ± 1.44 V
  // (±300 A in the bridge: twice the rated peak) OCP or OCN goes high and STOP holds both
  // driver inputs low for the moment
  nb.block('current')
    .part('UI', 'opamp', -250, 1500, { value: 'LM358', pkg: 'AMP' }, { '3': 'VIB', '2': 'NIS', '6': 'ISA', '7': V, '4': 'GND' })
    .part('RIB1', 'resistor', -350, 1400, { value: '24k' }, { '1': 'VMID', '2': 'VIB' }, 1)
    .part('RIB2', 'resistor', -350, 1600, { value: '1k' }, { '1': 'VIB', '2': 'GND' }, 1)
    .part('RIS1', 'resistor', -250, 1640, { value: '1k' }, { '1': 'SRC', '2': 'NIS' })
    .part('RIS2', 'resistor', -150, 1640, { value: '24k' }, { '1': 'NIS', '2': 'ISA' })
    .part('ROC1', 'resistor', 0, 1400, { value: '3.83k' }, { '1': V, '2': 'OCH' }, 1)
    .part('ROC2', 'resistor', 0, 1500, { value: '2.37k' }, { '1': 'OCH', '2': 'OCL' }, 1)
    .part('ROC3', 'resistor', 0, 1600, { value: '3.83k' }, { '1': 'OCL', '2': 'GND' }, 1)
    .part('UOC1', 'comparator', 150, 1450, { value: 'LM339', pkg: 'CMP2' }, { '3': 'ISA', '2': 'OCH', '1': 'OCP', '8': V, '4': 'GND' })
    .part('UOC2', 'comparator', 150, 1600, { value: 'LM339', pkg: 'CMP2' }, { '3': 'OCL', '2': 'ISA', '1': 'OCN', '8': V, '4': 'GND' })
    .part('ROCP', 'resistor', 280, 1400, { value: '10k' }, { '1': V, '2': 'OCP' }, 1)
    .part('ROCN', 'resistor', 280, 1550, { value: '10k' }, { '1': V, '2': 'OCN' }, 1)
    .part('DSP', 'diode', 380, 1450, { value: '1N4148' }, { '2': 'OCP', '1': 'STOP' })
    .part('DSN', 'diode', 380, 1600, { value: '1N4148' }, { '2': 'OCN', '1': 'STOP' })
    .part('CDA', 'capacitor', -150, 1400, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- voltage loop: the output's rectified average (sense transformer, bridge, 10k / 1 µF:
  // about 9 ms; a peak detector here decayed in 180 ms and the start-up overshot to 370 V peak,
  // found in simulation) against the soft-start reference VSS (22 ms); PI amplifier (P 0.47,
  // integral 45 /s) → VA, clamped at 3.3 V (full modulation) through 1k, stiff against the 200k summer
  nb.block('voltage loop')
    .part('TRS', 'transformer', -1300, 1950, SENSE_TR, { '1': o.senseOpen ? 'GND' : 'OUTL', '2': 'GND', '3': 'SAO', '4': 'SBO' })
    .part('RSO', 'resistor', -1180, 2050, { value: '220' }, { '1': 'SAO', '2': 'SNO' }, 1)
    .part('CSO', 'capacitor', -1180, 2150, { value: '100n', vmax: '63' }, { '1': 'SNO', '2': 'SBO' }, 1)
    .part('BRO', 'bridge', -1050, 1950, { value: 'DB107' }, { '1': 'SAO', '2': 'SBO', '3': 'VRO', '4': 'GND' })
    // RLO keeps the bridge conducting all the cycle: without a load it fed CVO only near the
    // peaks and the sense read 1.35 × high (the output settled at 171 V, found in simulation)
    .part('RLO', 'resistor', -980, 2050, { value: '1k', pmax: '0.25' }, { '1': 'VRO', '2': 'GND' }, 1)
    .part('RAV', 'resistor', -920, 1950, { value: '10k' }, { '1': 'VRO', '2': 'VSO' })
    .part('CVO', 'capacitor', -820, 2050, { value: '1u', vmax: '35' }, { '1': 'VSO', '2': 'GND' }, 1)
    .part('RVO1', 'resistor', -720, 1950, { value: '57.6k' }, { '1': 'VSO', '2': 'SO' })
    .part('RVO2', 'resistor', -620, 2050, { value: '25.5k' }, { '1': 'SO', '2': 'GND' }, 1)
    .part('RSS', 'resistor', -560, 1880, { value: '100k' }, { '1': 'VREF', '2': 'VSS' }, 1)
    .part('CSS', 'capacitor', -480, 2000, { value: o.softC ?? '220n', vmax: '50' }, { '1': 'VSS', '2': 'GND' }, 1)
    .part('QSS', 'npn', -400, 2080, { value: 'BC547B' }, { '1': 'BSS', '2': 'VSS', '3': 'GND' })
    .part('RQS', 'resistor', -400, 2200, { value: '10k' }, { '1': 'ENN', '2': 'BSS' })
    .part('UEA', 'opamp', -260, 1950, { value: 'LM358', pkg: 'AMP' }, { '3': 'VSS', '2': 'NEA', '6': 'VAO', '7': V, '4': 'GND' })
    .part('REA', 'resistor', -380, 1880, { value: '100k' }, { '1': 'SO', '2': 'NEA' })
    .part('RFEA', 'resistor', -260, 1840, { value: '47k' }, { '1': 'NEA', '2': 'FEA' })
    .part('CFEA', 'capacitor', -140, 1840, { value: '220n', vmax: '25' }, { '1': 'FEA', '2': 'VAO' })
    // while stopped, QEA empties the integrator: the bridge always starts from VA = 0 (without it
    // VA rested at 0.8 V and the start jumped to 207 V while the reference was at 16 %: found in
    // simulation)
    .part('QEA', 'nmos', -40, 1760, { value: '2N7000' }, { '1': 'ENN', '2': 'FEA', '3': 'VAO' })
    .part('RVA', 'resistor', -120, 1950, { value: '1k' }, { '1': 'VAO', '2': 'VA' })
    .part('DZVA', 'zener', -20, 2050, { value: 'BZX55C3V3' }, { '1': 'VA', '2': 'GND' }, 1);

  // ---- independent output overvoltage (own sense transformer and reference, latched): EN low
  // above 262 V (2.5 V at SP); once tripped it holds itself until the battery is disconnected
  nb.block('protection')
    .part('TRS2', 'transformer', 150, 1950, SENSE_TR, { '1': 'OUTL', '2': 'GND', '3': 'SAP', '4': 'SBP' })
    .part('RSP', 'resistor', 270, 2050, { value: '220' }, { '1': 'SAP', '2': 'SNP' }, 1)
    .part('CSP', 'capacitor', 270, 2150, { value: '100n', vmax: '63' }, { '1': 'SNP', '2': 'SBP' }, 1)
    .part('BRP', 'bridge', 400, 1950, { value: 'DB107' }, { '1': 'SAP', '2': 'SBP', '3': 'VSP', '4': 'GND' })
    .part('CVP', 'capacitor', 530, 2050, { value: '2.2u', vmax: '35' }, { '1': 'VSP', '2': 'GND' }, 1)
    .part('RVP1', 'resistor', 650, 1950, { value: '68k' }, { '1': 'VSP', '2': 'SP' })
    .part('RVP2', 'resistor', 750, 2050, { value: '11.0k' }, { '1': 'SP', '2': 'GND' }, 1)
    .part('RREF2', 'resistor', 850, 1850, { value: '2.2k' }, { '1': V, '2': 'VREF2' }, 1)
    .part('UREF2', 'tl431', 850, 1980, { value: 'TL431' }, { '1': 'VREF2', '2': 'GND', '3': 'VREF2' }, 3)
    .part('UOV', 'comparator', 1000, 1950, { value: 'LM393', pkg: 'PROT' }, { '3': 'SP', '2': 'VREF2', '1': 'FLT', '8': V, '4': 'GND' })
    .part('RFLT', 'resistor', 1100, 1850, { value: '2.2k' }, { '1': V, '2': 'FLT' }, 1)
    // the latch: FLT high (7.3 V with the LED and QFL's base) holds SP at 3.5 V through DLAT and
    // RLAT with the sense at zero (4.7k and 47k held only 0.6 V: the trip released itself when
    // CVP had discharged, found in simulation)
    .part('DLAT', 'diode', 1100, 2050, { value: '1N4148' }, { '2': 'FLT', '1': 'LAT' })
    .part('RLAT', 'resistor', 1000, 2120, { value: '10k' }, { '1': 'LAT', '2': 'SP' })
    .part('RBFL', 'resistor', 1220, 1880, { value: '10k' }, { '1': 'FLT', '2': 'BFL' })
    .part('QFL', 'npn', 1320, 1950, { value: 'BC547B' }, { '1': 'BFL', '2': 'EN', '3': 'GND' })
    .part('LFLT', 'led', 1220, 2060, { colour: 'red' }, { '2': 'FLT', '1': 'LFA' }, 1)
    .part('RLF', 'resistor', 1220, 2170, { value: '1k' }, { '1': 'LFA', '2': 'GND' }, 1)
    .part('CDP', 'capacitor', 1300, 2050, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  nb.v('OUTL').v('SINE').v('VA').v('BUS').v('EN').i('TR1', '3');
  nb.sim({ type: 'tran', stop: o.stop ?? '200m', step: '5u', start: 'zero', thin: true });
  const sheet = nb.done();
  if (o.temp !== undefined) sheet.temp = String(o.temp);
  return { sheet, nb };
}
