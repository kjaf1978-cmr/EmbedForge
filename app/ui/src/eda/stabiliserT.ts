// P4b (D27, D41): mains voltage stabilisers for 5, 10 and 15 kVA whose taps are switched by
// anti-parallel thyristors at the current zero, not by relays: no contact wear, no interruption
// beyond a fraction of a millisecond per tap change, and never two taps at once.
//
// The rule that makes the thyristors safe: a thyristor pair keeps conducting until its current
// passes zero, whatever its gate. So a tap change is a break-before-make in three steps: (1) the
// wanted tap (the comparators, latched input states O1 … O6) differs from the latched one: CHG
// goes high and every gate is taken off; (2) every pair blocks: each pair's voltage lights the LED
// of its own optocoupler (through a bridge, above about 25 V either way), and the seven
// phototransistors in series pull OFFN low only when all seven block, for 0.15 ms; (3) the latch
// takes the new states, CHG falls and the new pair's gate comes on. A pair that has failed short
// never shows a voltage, so step 2 never comes: the unit stays on that tap and never closes a
// second one onto it (a short of a winding section); after 0.12 s the stuck-change protection
// opens the output. (A window on the input current, the first design, could not tell a pair that
// had stopped from a slow zero crossing: with a shorted pair it fired a second tap and 1.5 kA
// flowed in the section, found in simulation.)

import { NB, SENSE_TR, STAB_LADDER, type MainsStep } from './powerExamples';
import type { Sheet } from './schematic';

export interface StabTOptions {
  kva?: 5 | 10 | 15;
  /** Input r.m.s. voltage and a step of it during the run. */
  vin?: number; step?: MainsStep;
  stop?: string;
  /** Tests: the restart delay's capacitor (product 4.7 µF: about 7.6 s). */
  delayC?: string;
  /** The test load: its power factor (1: resistive; below 1: R and L in series), its share of
   *  the rating (1: full load), or none. */
  pf?: number; share?: number; noLoad?: boolean;
  /** Tests (DFMEA): the thyristor pair of tap k (1 … 7) failed short. */
  shorted?: number;
  /** Tests: the heatsink's temperature at its NTC (°C). */
  theatsink?: number;
}

/** Per rating: autotransformer, input breaker, output contactor, thyristors, the opto-triac's
 *  gate resistors. The input current at the lowest input (140 V) is 36, 71 and 107 A; each
 *  thyristor of the conducting pair carries half of it (r.m.s. I/√2). */
export const STABT_VARIANTS = {
  5: { at: '5 kVA 230 V, taps 150–280 V', qf: '40', km: '32 A, coil 200–277 V AC/DC', scr: 'VS-40TPS12', rg: '470', heatsink: '0.6' },
  10: { at: '10 kVA 230 V, taps 150–280 V', qf: '80', km: '65 A, coil 200–277 V AC/DC', scr: 'VS-70TPS16', rg: '470', heatsink: '0.3' },
  15: { at: '15 kVA 230 V, taps 150–280 V', qf: '125', km: '95 A, coil 200–277 V AC/DC', scr: 'VS-70TPS16', rg: '470', heatsink: '0.2' },
} as const;

export function stabiliserT(o: StabTOptions = {}): { sheet: Sheet; nb: NB } {
  const kva = o.kva ?? 5, vr = STABT_VARIANTS[kva], vin = o.vin ?? 230;
  const nb = new NB();
  const V = '+12V';
  nb.para(`MAINS VOLTAGE STABILISER ${kva} kVA, thyristor-switched taps (D41). The input is connected to one tap of a ${kva} kVA autotransformer (150 … 280 V) by one of seven anti-parallel thyristor pairs; the output is taken from its 230 V tap: V_out = V_in·230/tap, within about ±6 % for 140 … 300 V in.`, -1250, -380)
    .para('A tap change is a break-before-make at the current zero: all gates off, every pair blocking (a voltage across each, seen by its own optocoupler) for 0.15 ms, then the latch takes the new tap and its pair fires (opto-triac). A shorted pair never blocks, so no second tap ever closes onto it; the stuck-change protection then opens the output contactor. LM339 comparators against a TL431 ladder choose the tap (160 / 180 / 200 / 220 / 240 / 265 V); the output contactor closes after about 8 s; an independent protection opens it outside 190 … 255 V, on a stuck change and above 85 °C at the heatsink.', -50, -380);

  // ---- test bench: the supply (TN, neutral earthed at the transformer) — not part of the product
  nb.block('bench').note('TEST BENCH (not part of the product): mains supply with its neutral earthed at the transformer', -1250, -60);
  nb.part('VIN', 'vsin', -1150, 100, { value: String(Number((vin * Math.SQRT2).toPrecision(6))), freq: '50' }, { '1': 'L_IN', '2': o.step ? 'L_STEP' : 'N' });
  if (o.step) nb.part('VS', 'vsin', -1150, 220, { value: String(Number(((o.step.to[0] - vin) * Math.SQRT2).toPrecision(6))), freq: '50', delay: String(o.step.at) }, { '1': 'L_STEP', '2': 'N' });
  nb.part('RE', 'resistor', -1050, 300, { value: '0.1' }, { '1': 'N', '2': 'GND' }, 1);

  // ---- input: terminals, breaker, surge arrester, the input current transformer
  nb.block('in')
    .part('X1', 'terminal', -900, 70, { value: 'L in' }, { '1': 'L_IN' })
    .part('X2', 'terminal', -900, 130, { value: 'N in' }, { '1': 'N' })
    .part('X3', 'terminal', -900, 190, { value: 'PE' }, { '1': 'GND' })
    .part('QF1', 'breaker1', -760, 70, { value: vr.qf, curve: 'C' }, { '1': 'L_IN', '2': 'VIN' }, 3)
    .part('RV1', 'mov', -640, 100, { value: '20D471K' }, { '1': 'VIN', '2': 'N' }, 1);

  // ---- 12 V control supply from the input (as the 1 kVA unit)
  nb.block('aux')
    .part('F1', 'fuse', -840, 400, { value: '0.2', r: '2' }, { '1': 'VIN', '2': 'VF' })
    .part('TR3', 'transformer', -700, 420, { value: '0.13', lp: '20', rp: '140', rs: '1.5', k: '0.995' }, { '1': 'VF', '2': 'N', '3': 'AA', '4': 'AB' })
    .part('RS3', 'resistor', -610, 530, { value: '47', pmax: '0.5' }, { '1': 'AA', '2': 'SN3' }, 1)
    .part('CS3', 'capacitor', -610, 620, { value: '1u', vmax: '100' }, { '1': 'SN3', '2': 'AB' }, 1)
    .part('BR3', 'bridge', -560, 440, { value: 'DB107' }, { '1': 'AA', '2': 'AB', '3': 'VRAW', '4': 'GND' })
    .part('C5', 'capacitor_pol', -470, 440, { value: '2200u', vmax: '63' }, { '1': 'VRAW', '2': 'GND' }, 1)
    .part('U5', 'lm317', -360, 400, { value: 'LM317HV', heatsink: '8' }, { '3': 'VRAW', '1': 'ADJ', '2': V })
    .part('R13', 'resistor', -280, 430, { value: '240' }, { '1': V, '2': 'ADJ' }, 1)
    .part('R14', 'resistor', -360, 490, { value: '2.05k' }, { '1': 'ADJ', '2': 'GND' }, 1)
    .part('C6', 'capacitor_pol', -200, 440, { value: '100u', vmax: '25' }, { '1': V, '2': 'GND' }, 1);

  // ---- input sense (as the 1 kVA unit): isolating transformer, bridge, divider, mean (47 ms)
  nb.block('sense')
    .part('TR1', 'transformer', -1100, 800, SENSE_TR, { '1': 'VIN', '2': 'N', '3': 'SA', '4': 'SB' })
    .part('RS1', 'resistor', -990, 880, { value: '220' }, { '1': 'SA', '2': 'SN' }, 1)
    .part('CS1', 'capacitor', -990, 970, { value: '100n', vmax: '63' }, { '1': 'SN', '2': 'SB' }, 1)
    .part('BR1', 'bridge', -880, 820, { value: 'DB107' }, { '1': 'SA', '2': 'SB', '3': 'VSR', '4': 'GND' })
    .part('C1', 'capacitor_pol', -780, 820, { value: '4.7u', vmax: '35' }, { '1': 'VSR', '2': 'GND' }, 1)
    .part('R1', 'resistor', -700, 750, { value: '68k' }, { '1': 'VSR', '2': 'SENSE' })
    .part('R2', 'resistor', -630, 820, { value: '10k' }, { '1': 'SENSE', '2': 'GND' }, 1)
    .part('R3', 'resistor', -560, 750, { value: '100k' }, { '1': 'SENSE', '2': 'SF' })
    .part('C2', 'capacitor', -490, 820, { value: '470n', vmax: '50' }, { '1': 'SF', '2': 'GND' }, 1);

  // ---- reference and threshold ladder
  nb.block('ref')
    .part('R4', 'resistor', -1100, 1110, { value: '2.2k' }, { '1': V, '2': 'VREF' })
    .part('U1REF', 'tl431', -1000, 1200, { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' }, 3);
  const lad = ['GND', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'VREF'];
  STAB_LADDER.forEach((r, k) => nb.part(`RL${k + 1}`, 'resistor', -880 + 90 * k, 1270, { value: r }, { '1': lad[k], '2': lad[k + 1] }));

  // ---- the wanted tap: O_k high while the input is below threshold k (1 M of hysteresis)
  nb.block('compare');
  for (let k = 0; k < 6; k++) {
    const n = k + 1, x = 200 * k;
    nb.part(`UC${n}`, 'comparator', x, 1150, { value: 'LM339', pkg: k < 4 ? 'CMP1' : 'CMP2' }, { '3': `N${n}`, '2': 'SF', '1': `O${n}`, '8': V, '4': 'GND' })
      .part(`RF${n}`, 'resistor', x, 1060, { value: '1M' }, { '1': `N${n}`, '2': `O${n}` })
      .part(`RP${n}`, 'resistor', x + 90, 1090, { value: '2.2k' }, { '1': V, '2': `O${n}` }, 1);
  }
  nb.part('CD1', 'capacitor', 1250, 1150, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- all pairs blocking: OFFN low (the seven phototransistors in series, 47k pull-up) → ALLOFF
  // (a NOR as inverter) → ALLOFFD after 0.15 ms (10k, 22 nF; it falls at once through 1k)
  nb.block('all off')
    .part('ROFF', 'resistor', -400, 1420, { value: '47k' }, { '1': V, '2': 'OFFN' }, 1)
    .part('UN8', 'nor2', -250, 1500, { value: V, pkg: 'NR2' }, { '1': 'OFFN', '2': 'OFFN', '3': 'ALLOFF' })
    .part('RZD', 'resistor', -100, 1500, { value: '10k' }, { '1': 'ALLOFF', '2': 'ZWD' })
    .part('CZD', 'capacitor', 0, 1580, { value: '22n', vmax: '50' }, { '1': 'ZWD', '2': 'GND' }, 1)
    .part('DZD', 'diode', -40, 1420, { value: '1N4148' }, { '2': 'ZWD', '1': 'ZDK' })
    .part('RZK', 'resistor', 60, 1420, { value: '1k' }, { '1': 'ZDK', '2': 'ALLOFF' })
    // the spare comparator: + to ground, − to the reference, its output held low
    .part('UCS', 'comparator', 200, 1500, { value: 'LM339', pkg: 'CMP2' }, { '3': 'GND', '2': 'VREF', '1': 'GND', '8': V, '4': 'GND' });

  // ---- the latch (three CD4013), the change detector (six XOR, a diode OR), the clock CK =
  // CHG · ZWD, the decoder (NOR: tap k when O_k and not O_k−1, tap 7 when none) and the gates
  nb.block('logic');
  for (let k = 1; k <= 6; k++) {
    const x = 500 + 160 * (k - 1);
    nb.part(`UL${k}`, 'dff', x, 1450, { value: V, pkg: `LT${Math.ceil(k / 2)}` }, { '1': `O${k}`, '2': 'CK', '3': `LO${k}`, '4': `LN${k}` })
      .part(`UX${k}`, 'xor2', x, 1650, { value: V, pkg: k <= 4 ? 'XR1' : 'XR2' }, { '1': `O${k}`, '2': `LO${k}`, '3': `XC${k}` })
      .part(`DX${k}`, 'diode', x + 60, 1750, { value: '1N4148' }, { '2': `XC${k}`, '1': 'CHG' }, 1)
      .part(`UN${k}`, 'nor2', x, 1850, { value: V, pkg: k <= 4 ? 'NR1' : 'NR2' }, { '1': `LN${k}`, '2': k > 1 ? `LO${k - 1}` : 'GND', '3': `S${k}` });
  }
  nb.part('RCH', 'resistor', 1500, 1750, { value: '100k' }, { '1': 'CHG', '2': 'GND' }, 1)
    .part('UN7', 'nor2', 1500, 1850, { value: V, pkg: 'NR2' }, { '1': 'CHG', '2': 'CHG', '3': 'NCHG' })
    .part('UX7', 'xor2', 1500, 1650, { value: V, pkg: 'XR2' }, { '1': 'GND', '2': 'GND', '3': 'XSP1' })
    .part('UX8', 'xor2', 1650, 1650, { value: V, pkg: 'XR2' }, { '1': 'GND', '2': 'GND', '3': 'XSP2' })
    .part('UCK', 'and2', 1500, 1450, { value: V, pkg: 'AN2' }, { '1': 'CHG', '2': 'ZWD', '3': 'CK' })
    .part('CD2', 'capacitor', 1650, 1450, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CD3', 'capacitor', 1750, 1450, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- per tap: the gate (S_k · NCHG), its driver, the opto-triac (LED and a yellow indicator
  // in series, 13 mA) and the thyristor pair between the input and tap k with its snubber.
  // The opto-triac fires whichever thyristor is forward biased: VIN → RA → MT2–MT1 → DA → gate
  // of QA (cathode at the tap), or tap → RB → MT1–MT2 → DB → gate of QB (cathode at the input).
  // RA/RB: 470 Ω keep the opto-triac (FOD4218, 800 V) within its 1 A peak when it fires at up to
  // 470 V (300 V in on the highest tap: with 330 Ω and a 600 V MOC3052 both ratings were exceeded,
  // found in simulation).
  nb.block('taps');
  for (let k = 1; k <= 7; k++) {
    const x = 400 * (k - 1), t = `T${k}`, s = k <= 6 ? `S${k}` : 'LN6';
    nb.part(`UG${k}`, 'and2', x, 150, { value: V, pkg: k <= 4 ? 'AN1' : 'AN2' }, { '1': s, '2': 'NCHG', '3': `G${k}` })
      .part(`RBG${k}`, 'resistor', x + 80, 150, { value: '10k' }, { '1': `G${k}`, '2': `BG${k}` })
      .part(`QG${k}`, 'npn', x + 160, 230, { value: 'BC547B' }, { '1': `BG${k}`, '2': `LK${k}`, '3': 'EG' })
      .part(`RLD${k}`, 'resistor', x + 160, -20, { value: '680' }, { '1': V, '2': `LY${k}` }, 1)
      .part(`LT${k}`, 'led', x + 160, 60, { colour: 'yellow' }, { '2': `LY${k}`, '1': `LO${k}A` }, 1)
      .part(`UO${k}`, 'optotriac', x + 260, 120, { value: 'FOD4218' }, { '1': `LO${k}A`, '2': `LK${k}`, '6': `XA${k}`, '4': `YB${k}` })
      .part(`RA${k}`, 'resistor', x + 360, 20, { value: vr.rg, pmax: '0.5' }, { '1': 'VIN', '2': `XA${k}` })
      .part(`RB${k}`, 'resistor', x + 360, 220, { value: vr.rg, pmax: '0.5' }, { '1': t, '2': `YB${k}` })
      .part(`DA${k}`, 'diode', x + 300, 300, { value: '1N4007' }, { '2': `YB${k}`, '1': `GA${k}` })
      .part(`DB${k}`, 'diode', x + 300, -60, { value: '1N4007' }, { '2': `XA${k}`, '1': `GB${k}` })
      .part(`QA${k}`, 'scr', x + 200, 400, { value: vr.scr, heatsink: vr.heatsink }, { '1': 'VIN', '2': t, '3': `GA${k}` })
      .part(`QB${k}`, 'scr', x + 200, 520, { value: vr.scr, heatsink: vr.heatsink }, { '1': t, '2': 'VIN', '3': `GB${k}` })
      .part(`RGA${k}`, 'resistor', x + 320, 400, { value: '1k' }, { '1': `GA${k}`, '2': t })
      .part(`RGB${k}`, 'resistor', x + 320, 520, { value: '1k' }, { '1': `GB${k}`, '2': 'VIN' })
      // the pair's voltage: 2 × 22k 1 W (0.54 W each at 300 V in), a bridge and the LED of US_k (on above about 25 V)
      .part(`RVA${k}`, 'resistor', x + 20, 820, { value: '22k', pmax: '1' }, { '1': 'VIN', '2': `VSA${k}` })
      .part(`RVB${k}`, 'resistor', x + 20, 920, { value: '22k', pmax: '1' }, { '1': t, '2': `VSB${k}` })
      .part(`BV${k}`, 'bridge', x + 140, 860, { value: 'DB107' }, { '1': `VSA${k}`, '2': `VSB${k}`, '3': `VSP${k}`, '4': `VSN${k}` })
      .part(`US${k}`, 'opto', x + 260, 860, { value: 'PC817' }, { '1': `VSP${k}`, '2': `VSN${k}`, '4': k === 1 ? 'OFFN' : `OC${k - 1}`, '3': k === 7 ? 'GND' : `OC${k}` })
      .part(`RSN${k}`, 'resistor', x + 100, 620, { value: '47', pmax: '2' }, { '1': 'VIN', '2': `SNB${k}` }, 1)
      .part(`CSN${k}`, 'capacitor', x + 100, 720, { value: '100n', vmax: '1000' }, { '1': `SNB${k}`, '2': t }, 1);
    if (o.shorted === k) nb.block('bench').part('RSHORT', 'resistor', x + 200, 620, { value: '0.005' }, { '1': 'VIN', '2': t }).block('taps');
  }
  // power-up hold: the drivers' emitters reach ground through QPE only once CPE (10k, 47 µF) has
  // passed the 5.1 V Zener (about 0.3 s after the 12 V rail): the input sense has settled by then. Without
  // it the comparators' outputs, pulled up before the comparators work, chose tap 1 (150 V) at
  // 230 V in and the winding rang to 1 kV at its top (found in simulation)
  nb.part('RPE', 'resistor', 2900, 300, { value: '10k' }, { '1': V, '2': 'CPE' })
    .part('CPE', 'capacitor_pol', 2900, 420, { value: '47u', vmax: '25' }, { '1': 'CPE', '2': 'GND' }, 1)
    .part('DPE', 'diode', 2980, 300, { value: '1N4148' }, { '2': 'CPE', '1': V }, 3)
    .part('DZPE', 'zener', 3000, 420, { value: 'BZX55C5V1' }, { '1': 'CPE', '2': 'ZPE' })
    .part('RPB', 'resistor', 3080, 420, { value: '2.2k' }, { '1': 'ZPE', '2': 'BPE' })
    .part('RPB2', 'resistor', 3080, 520, { value: '47k' }, { '1': 'BPE', '2': 'GND' }, 1)
    .part('QPE', 'npn', 3160, 420, { value: 'BC547B' }, { '1': 'BPE', '2': 'EG', '3': 'GND' })
    .part('CD4', 'capacitor', 2900, 0, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);
  nb.part('T1', 'autotransformer', 2700, 900, { value: vr.at }, { N: 'N', T1: 'T1', T2: 'T2', T3: 'T3', T4: 'T4', T5: 'T5', T6: 'T6', T7: 'T7' }, 0, true);

  // ---- output: restart delay, the relay that switches the contactor's coil, the contactor, the
  // terminals. The coil is on the 230 V tap: no output, no coil
  nb.block('out')
    .part('RD1', 'resistor', 3030, 150, { value: '1M' }, { '1': V, '2': 'DLY' }, 1)
    .part('DDIS', 'diode', 2950, 240, { value: '1N4148' }, { '2': 'DLY', '1': V }, 3)
    .part('CD', 'capacitor', 3030, 360, { value: o.delayC ?? '4.7u', vmax: '63' }, { '1': 'DLY', '2': 'GND' }, 1)
    .part('RT1', 'resistor', 3180, 60, { value: '2.49k' }, { '1': V, '2': 'DTH' }, 1)
    .part('RT2', 'resistor', 3180, 150, { value: '10k' }, { '1': 'DTH', '2': 'GND' }, 1)
    .part('U8', 'comparator', 3180, 280, { value: 'LM339', pkg: 'CMP2' }, { '3': 'DLY', '2': 'DTH', '1': 'OD', '8': V, '4': 'GND' })
    .part('RPD', 'resistor', 3270, 230, { value: '2.2k' }, { '1': V, '2': 'OD' }, 1)
    .part('RBD', 'resistor', 3270, 380, { value: '2.2k' }, { '1': 'OD', '2': 'BD' }, 1)
    .part('QD', 'npn', 3300, 500, { value: 'BD139' }, { '1': 'BD', '2': 'KD', '3': 'GND' })
    .part('DD', 'diode', 3350, 410, { value: '1N4148', labels: 'left' }, { '2': 'KD', '1': V }, 3)
    .part('KO', 'relay', 3400, 410, { value: '12 V 30 A', life: '4400000' }, { '1': V, '2': 'KD', '3': 'T5', '5': 'KMC' })
    .part('LKO', 'led', 3490, 280, { colour: 'green' }, { '2': V, '1': 'LKOA' }, 1)
    .part('RLKO', 'resistor', 3490, 370, { value: '2.2k' }, { '1': 'LKOA', '2': 'KD' }, 1)
    .part('KM', 'contactor', 3600, 600, { value: vr.km }, { A1: 'KMC', A2: 'N', '1': 'T5', '2': 'OUT', '3': 'N', '4': 'NOUT' })
    .part('X4', 'terminal', 3780, 560, { value: 'L out' }, { '1': 'OUT' }, 2)
    .part('X5', 'terminal', 3780, 620, { value: 'N out' }, { '1': 'NOUT' }, 2)
    .part('X6', 'terminal', 3780, 680, { value: 'PE' }, { '1': 'GND' }, 2);
  if (!o.noLoad) {
    const r = (230 * 230) / (kva * 1000 * (o.share ?? 1)), pf = o.pf ?? 1;
    nb.block('load').note('TEST LOAD (not part of the product)', 3880, 540);
    if (pf >= 1) nb.part('RLOAD', 'resistor', 3930, 640, { value: String(r), pmax: '20k' }, { '1': 'OUT', '2': 'NOUT' }, 1);
    else nb.part('RLOAD', 'resistor', 3930, 640, { value: String(r * pf), pmax: '20k' }, { '1': 'OUT', '2': 'LDM' }, 1)
      .part('LLOAD', 'inductor', 3930, 760, { value: String((r * Math.sqrt(1 - pf * pf)) / (2 * Math.PI * 50)), imax: '200' }, { '1': 'LDM', '2': 'NOUT' }, 1);
  }

  // ---- independent protection (own sense transformer, reference, LM393s): outside 190 …
  // 255 V at the 230 V tap, a tap change stuck for 0.12 s, or the heatsink above 85 °C pulls
  // FLTS low: the contactor opens and the restart delay starts again
  nb.block('prot').note('OUTPUT PROTECTION (independent of the control)', 0, 2150)
    .part('TR2', 'transformer', 50, 2270, SENSE_TR, { '1': 'T5', '2': 'N', '3': 'SA2', '4': 'SB2' })
    .part('RS2', 'resistor', 160, 2350, { value: '220' }, { '1': 'SA2', '2': 'SN2' }, 1)
    .part('CS2', 'capacitor', 160, 2440, { value: '100n', vmax: '63' }, { '1': 'SN2', '2': 'SB2' }, 1)
    .part('BR2', 'bridge', 270, 2290, { value: 'DB107' }, { '1': 'SA2', '2': 'SB2', '3': 'VSR2', '4': 'GND' })
    .part('C3', 'capacitor_pol', 370, 2290, { value: '4.7u', vmax: '35' }, { '1': 'VSR2', '2': 'GND' }, 1)
    .part('R5', 'resistor', 450, 2220, { value: '68k' }, { '1': 'VSR2', '2': 'SEN2' })
    .part('R6', 'resistor', 520, 2290, { value: '10k' }, { '1': 'SEN2', '2': 'GND' }, 1)
    .part('R7', 'resistor', 590, 2220, { value: '100k' }, { '1': 'SEN2', '2': 'SF2' })
    .part('C4', 'capacitor', 660, 2290, { value: '470n', vmax: '50' }, { '1': 'SF2', '2': 'GND' }, 1)
    .part('R8', 'resistor', 50, 2550, { value: '2.2k' }, { '1': V, '2': 'VREF2' })
    .part('U9', 'tl431', 150, 2640, { value: 'TL431' }, { '1': 'VREF2', '2': 'GND', '3': 'VREF2' }, 3)
    .part('R9', 'resistor', 250, 2610, { value: '1.82k' }, { '1': 'VREF2', '2': 'VOV' }, 1)
    .part('R10', 'resistor', 250, 2700, { value: '3.65k' }, { '1': 'VOV', '2': 'VUV' }, 1)
    .part('R11', 'resistor', 250, 2790, { value: '10k' }, { '1': 'VUV', '2': 'GND' }, 1)
    .part('U10', 'comparator', 500, 2520, { value: 'LM393', pkg: 'PROT' }, { '3': 'VOV', '2': 'SF2', '1': 'FLTS', '8': V, '4': 'GND' })
    .part('U11', 'comparator', 500, 2700, { value: 'LM393', pkg: 'PROT' }, { '3': 'SF2', '2': 'VUV', '1': 'FLTS', '8': V, '4': 'GND' })
    // stuck change: CHG high charges CST (1 MΩ, 470 nF: past VREF2 after 0.12 s); DST empties it
    // when CHG falls. A normal change takes at most a half cycle and a bit
    .part('RST', 'resistor', 800, 2520, { value: '1M' }, { '1': 'CHG', '2': 'CST' })
    .part('CST', 'capacitor', 900, 2600, { value: '470n', vmax: '50' }, { '1': 'CST', '2': 'GND' }, 1)
    .part('DST', 'diode', 850, 2440, { value: '1N4148' }, { '2': 'CST', '1': 'CHG' })
    .part('UST', 'comparator', 1000, 2520, { value: 'LM393', pkg: 'PROT2' }, { '3': 'VREF2', '2': 'CST', '1': 'FLTS', '8': V, '4': 'GND' })
    // the heatsink: NTC 10k (B 3950) against 1.5k: 1.44 V at 85 °C
    .part('RTH', 'ntc', 800, 2750, { value: '10k', temp: String(o.theatsink ?? 50) }, { '1': 'VREF2', '2': 'NHS' }, 1)
    .part('RTHB', 'resistor', 800, 2870, { value: '1.5k' }, { '1': 'NHS', '2': 'GND' }, 1)
    .part('RT85A', 'resistor', 900, 2750, { value: '7.32k' }, { '1': 'VREF2', '2': 'VT85' }, 1)
    .part('RT85B', 'resistor', 900, 2870, { value: '10k' }, { '1': 'VT85', '2': 'GND' }, 1)
    .part('UTH', 'comparator', 1000, 2750, { value: 'LM393', pkg: 'PROT2' }, { '3': 'VT85', '2': 'NHS', '1': 'FLTS', '8': V, '4': 'GND' })
    .part('R12', 'resistor', 620, 2460, { value: '10k' }, { '1': V, '2': 'FLTS' }, 1)
    .part('DF1', 'diode', 750, 2570, { value: '1N4148' }, { '2': 'OD', '1': 'FLTS' })
    .part('DF2', 'diode', 750, 2720, { value: '1N4148' }, { '2': 'DLY', '1': 'DF2K' })
    .part('RDF2', 'resistor', 860, 2720, { value: '2.2k' }, { '1': 'DF2K', '2': 'FLTS' })
    .part('LF', 'led', 1150, 2470, { colour: 'red' }, { '2': V, '1': 'LFA' }, 1)
    .part('RLF', 'resistor', 1150, 2570, { value: '4.7k' }, { '1': 'LFA', '2': 'FLTS' }, 1)
    .part('CD5', 'capacitor', 650, 2890, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CD6', 'capacitor', 1150, 2890, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  nb.v('VIN').v('OUT').v('SF').v('CHG').v('OFFN');
  nb.sim({ type: 'tran', stop: o.stop ?? '1', step: '50u', start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
