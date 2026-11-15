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

import { NB, SENSE_TR400, STAB_LADDER, type MainsStep } from './powerExamples';
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
  /** Tests: the heatsink's temperature at its NTC (°C); its NTC open. */
  theatsink?: number; ntcOpen?: boolean;
  /** Tests (DFMEA): the gate driver of tap k shorted (its LED always on with the gates enabled). */
  driverShorted?: number;
  /** Tests (DFMEA): the output relay's driver shorted (KO closed from power-up). */
  koShorted?: boolean;
}

/** Per rating: autotransformer, input breaker, aR fuse, output contactor, thyristor modules (D55:
 *  isolated base, two thyristors wired anti-parallel), the opto-triac's gate resistors, the
 *  heatsink per thyristor (K/W: half the fan-cooled shared heatsink plus the module's case to
 *  sink, D56; only the selected pair conducts), wire sizes (mm², PVC copper, IEC 60364-5-52
 *  method C at 30 °C, to be derated for the enclosure). The input current at the lowest input
 *  (140 V) is 36, 71 and 107 A; each thyristor of the conducting pair carries half of it. */
export const STABT_VARIANTS = {
  5: { at: '5 kVA 230 V, taps 150–280 V', qf: '40', far: '50', km: '32 A, coil 200–277 V AC/DC', scr: 'SKKT 106/16E', rg: '470', heatsink: '1.0', win: '6', wout: '6', wpe: '6' },
  10: { at: '10 kVA 230 V, taps 150–280 V', qf: '80', far: '100', km: '65 A, coil 200–277 V AC/DC', scr: 'SKKT 106/16E', rg: '470', heatsink: '0.6', win: '16', wout: '16', wpe: '16' },
  15: { at: '15 kVA 230 V, taps 150–280 V', qf: '125', far: '160', km: '95 A, coil 200–277 V AC/DC', scr: 'SKKT 162/16E', rg: '470', heatsink: '0.4', win: '35', wout: '25', wpe: '16' },
} as const;

export function stabiliserT(o: StabTOptions = {}): { sheet: Sheet; nb: NB } {
  const kva = o.kva ?? 5, vr = STABT_VARIANTS[kva], vin = o.vin ?? 230;
  const nb = new NB().wireUp(['+12V']);
  const V = '+12V';
  nb.para(`MAINS VOLTAGE STABILISER ${kva} kVA, thyristor-switched taps (D41). The input is connected to one tap of a ${kva} kVA autotransformer (150 … 280 V) by one of seven anti-parallel thyristor pairs; the output is taken from its 230 V tap: V_out = V_in·230/tap, within about ±6 % for 140 … 300 V in.`, -1250, -380)
    .para('A tap change is a break-before-make at the current zero: all gates off, every pair blocking (a voltage across each, seen by its own optocoupler) for 0.15 ms, then the latch takes the new tap and its pair fires (opto-triac). A shorted pair never blocks, so no second tap ever closes onto it; the stuck-change protection then opens the output contactor. LM339 comparators against a TL431 ladder choose the tap (160 / 180 / 200 / 220 / 240 / 265 V); the output contactor closes after about 8 s; an independent protection opens it outside 190 … 255 V, on a stuck change, above 70 °C at the heatsink (or an open NTC), and through its own relay KP in the coil feed of the contactor. A priority decoder lights one tap at most whatever input sticks; a second lit gate LED (their common current) takes every gate off. The thermal cut-out in the winding takes the gates and the coils off. The control is treated as live (no PELV claim); its 0 V is bonded to PE at the PE stud.', -50, -380);

  // ---- test bench: the supply (TN, neutral earthed at the transformer) — not part of the product
  nb.block('bench').note('TEST BENCH (not part of the product): mains supply with its neutral earthed at the transformer', -1250, -60);
  nb.part('VIN', 'vsin', -1150, 100, { value: String(Number((vin * Math.SQRT2).toPrecision(6))), freq: '50' }, { '1': 'L_IN', '2': o.step ? 'L_STEP' : 'N_IN' });
  if (o.step) nb.part('VS', 'vsin', -1150, 220, { value: String(Number(((o.step.to[0] - vin) * Math.SQRT2).toPrecision(6))), freq: '50', delay: String(o.step.at) }, { '1': 'L_STEP', '2': 'N_IN' });
  nb.part('RE', 'resistor', -1050, 300, { value: '0.1' }, { '1': 'N_IN', '2': 'GND' }, 1);

  // ---- input: terminals (DIN-rail blocks sized for the input current), a 2-pole breaker (fixed
  // wiring only), the thermally protected surge arrester, the thyristors' aR fuse (D55)
  nb.block('in')
    .part('X1', 'terminal', -900, 70, { value: 'L in', wire: vr.win }, { '1': 'L_IN' })
    .part('X2', 'terminal', -900, 130, { value: 'N in', wire: vr.win }, { '1': 'N_IN' })
    .part('X3', 'terminal', -900, 190, { value: 'PE', wire: vr.wpe }, { '1': 'GND' })
    .part('QF1', 'breaker2', -760, 70, { value: vr.qf, curve: 'C' }, { '1': 'L_IN', '2': 'VIN', N1: 'N_IN', N2: 'N' }, 3)
    .part('RV1', 'mov', -640, 100, { value: 'TMOV14RP300E' }, { '1': 'VIN', '2': 'N' }, 1)
    .part('FAR', 'fuse', -640, 0, { value: vr.far, r: '0.0005', fusetype: 'aR', wire: vr.win }, { '1': 'VIN', '2': 'VSW' });

  // ---- 12 V control supply (D52, as the 1 kVA unit): a wide-range AC-DC module behind a ceramic
  // fuse; the board's mains entry is fused for its tracks (1.5 kA breaking behind the large breaker)
  nb.block('aux')
    .part('F1', 'fuse', -840, 400, { value: '1', r: '0.15', fusetype: 'H' }, { '1': 'VIN', '2': 'VF' })
    .part('PS1', 'acdc', -600, 420, { value: 'IRM-15-12' }, { L: 'VF', N: 'N', '+V': V, '-V': 'GND' })
    .part('C6', 'capacitor_pol', -200, 440, { value: '100u', vmax: '25' }, { '1': V, '2': 'GND' }, 1);

  // ---- input sense (as the 1 kVA unit): a 400 V / 24 V transformer on the fused feed, bridge,
  // divider with a 25-turn trimmer (set at commissioning), mean (47 ms)
  nb.block('sense')
    .part('TR1', 'transformer', -1100, 800, SENSE_TR400, { '1': 'VF', '2': 'N', '3': 'SA', '4': 'SB' })
    .part('RS1', 'resistor', -990, 880, { value: '220' }, { '1': 'SA', '2': 'SN' }, 1)
    .part('CS1', 'capacitor', -990, 970, { value: '100n', vmax: '63' }, { '1': 'SN', '2': 'SB' }, 1)
    .part('BR1', 'bridge', -880, 820, { value: 'DB107' }, { '1': 'SA', '2': 'SB', '3': 'VSR', '4': 'GND' })
    .part('C1', 'capacitor_pol', -780, 820, { value: '4.7u', vmax: '50' }, { '1': 'VSR', '2': 'GND' }, 1)
    .part('R1', 'resistor', -700, 750, { value: '80.6k' }, { '1': 'VSR', '2': 'SENSE' })
    .part('R2', 'resistor', -630, 820, { value: '6.8k' }, { '1': 'SENSE', '2': 'STR' }, 1)
    .part('RT1C', 'potentiometer', -630, 920, { value: '5k', pmax: '0.5', position: '64' }, { '1': 'STR', '2': 'GND', '3': 'GND' }, 1)
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
    .part('UN8', 'xor2', -250, 1500, { value: V, pkg: 'XR2' }, { '1': 'OFFN', '2': V, '3': 'ALLOFF' })
    .part('RZD', 'resistor', -100, 1500, { value: '10k' }, { '1': 'ALLOFF', '2': 'ZWD' })
    .part('CZD', 'capacitor', 0, 1580, { value: '22n', vmax: '50' }, { '1': 'ZWD', '2': 'GND' }, 1)
    .part('DZD', 'diode', -40, 1420, { value: '1N4148' }, { '2': 'ZWD', '1': 'ZDK' })
    .part('RZK', 'resistor', 60, 1420, { value: '1k' }, { '1': 'ZDK', '2': 'ALLOFF' });

  // ---- the latch (three CD4013), the change detector (six XOR, a diode OR), the clock CK =
  // CHG · ZWD, the priority decoder and the gates. The decoder lights the lowest tap whose latched
  // state is high and none other, whatever input sticks: B_k (some tap below k wanted) is an OR
  // chain (CD4071), tap k = LO_k and not B_k (NOR), tap 7 = none (found in the P4b audit: the
  // first decoder, tap k = LO_k and not LO_k−1, lit two taps when one input stuck)
  nb.block('logic');
  for (let k = 1; k <= 6; k++) {
    const x = 500 + 160 * (k - 1);
    nb.part(`UL${k}`, 'dff', x, 1450, { value: V, pkg: `LT${Math.ceil(k / 2)}` }, { '1': `O${k}`, '2': 'CK', '3': `LO${k}`, '4': `LN${k}` })
      .part(`UX${k}`, 'xor2', x, 1650, { value: V, pkg: k <= 4 ? 'XR1' : 'XR2' }, { '1': `O${k}`, '2': `LO${k}`, '3': `XC${k}` })
      .part(`DX${k}`, 'diode', x + 60, 1750, { value: '1N4148' }, { '2': `XC${k}`, '1': 'CHG' }, 1)
      .part(`UN${k}`, 'nor2', x, 1850, { value: V, pkg: k <= 4 ? 'NR1' : 'NR2' }, { '1': `LN${k}`, '2': k === 1 ? 'GND' : k === 2 ? 'LO1' : `B${k}`, '3': `S${k}` });
    if (k >= 3) nb.part(`UB${k}`, 'or2', x, 1950, { value: V, pkg: 'OR1' }, { '1': k === 3 ? 'LO1' : `B${k - 1}`, '2': `LO${k - 1}`, '3': `B${k}` });
  }
  nb.part('UN9', 'nor2', 1500, 1950, { value: V, pkg: 'NR2' }, { '1': 'B6', '2': 'LO6', '3': 'S7' })
    // the spare NOR: inputs to ground
    .part('UNS', 'nor2', 1650, 1950, { value: V, pkg: 'NR2' }, { '1': 'GND', '2': 'GND', '3': 'nc_NSP' })
    .part('RCH', 'resistor', 1500, 1750, { value: '100k' }, { '1': 'CHG', '2': 'GND' }, 1)
    .part('UN7', 'xor2', 1500, 1650, { value: V, pkg: 'XR2' }, { '1': 'CHG', '2': V, '3': 'NCHG' })
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
    const x = 400 * (k - 1), t = `T${k}`, s = `S${k}`, sw = `SW${k}`, tk = `TK${k}`;
    nb.part(`UG${k}`, 'and2', x, 150, { value: V, pkg: k <= 4 ? 'AN1' : 'AN2' }, { '1': s, '2': 'NCHG', '3': `G${k}` })
      .part(`RBG${k}`, 'resistor', x + 80, 150, { value: '10k' }, { '1': `G${k}`, '2': `BG${k}` })
      .part(`QG${k}`, 'npn', x + 160, 230, { value: 'BC547B' }, { '1': `BG${k}`, '2': `LK${k}`, '3': 'EG' })
      // the pair board's two mains entries, each fused for its tracks (ceramic, 1.5 kA)
      .part(`FA${k}`, 'fuse', x + 440, 20, { value: '0.5', r: '0.6', fusetype: 'H' }, { '1': 'VSW', '2': sw })
      .part(`FB${k}`, 'fuse', x + 440, 220, { value: '0.5', r: '0.6', fusetype: 'H' }, { '1': t, '2': tk })
      .part(`RLD${k}`, 'resistor', x + 160, -20, { value: '680' }, { '1': V, '2': `LY${k}` }, 1)
      .part(`LT${k}`, 'led', x + 160, 60, { colour: 'yellow' }, { '2': `LY${k}`, '1': `LO${k}A` }, 1)
      .part(`UO${k}`, 'optotriac', x + 260, 120, { value: 'FOD4218' }, { '1': `LO${k}A`, '2': `LK${k}`, '6': `XA${k}`, '4': `YB${k}` })
      .part(`RA${k}`, 'resistor', x + 360, 20, { value: vr.rg, pmax: '0.5' }, { '1': sw, '2': `XA${k}` })
      .part(`RB${k}`, 'resistor', x + 360, 220, { value: vr.rg, pmax: '0.5' }, { '1': tk, '2': `YB${k}` })
      .part(`DA${k}`, 'diode', x + 300, 300, { value: '1N4007' }, { '2': `YB${k}`, '1': `GA${k}` })
      .part(`DB${k}`, 'diode', x + 300, -60, { value: '1N4007' }, { '2': `XA${k}`, '1': `GB${k}` })
      // the module's two thyristors (one package: pkg), anti-parallel between the fused input and tap k
      .part(`QA${k}`, 'scr', x + 200, 400, { value: vr.scr, heatsink: vr.heatsink, pkg: `M${k}` }, { '1': 'VSW', '2': t, '3': `GA${k}` })
      .part(`QB${k}`, 'scr', x + 200, 520, { value: vr.scr, heatsink: vr.heatsink, pkg: `M${k}` }, { '1': t, '2': 'VSW', '3': `GB${k}` })
      .part(`RGA${k}`, 'resistor', x + 320, 400, { value: '1k' }, { '1': `GA${k}`, '2': tk })
      .part(`RGB${k}`, 'resistor', x + 320, 520, { value: '1k' }, { '1': `GB${k}`, '2': sw })
      // the pair's voltage: 2 × 22k 1 W (0.54 W each at 300 V in), a bridge and the LED of US_k (on above about 25 V)
      .part(`RVA${k}`, 'resistor', x + 20, 820, { value: '22k', pmax: '1' }, { '1': sw, '2': `VSA${k}` })
      .part(`RVB${k}`, 'resistor', x + 20, 920, { value: '22k', pmax: '1' }, { '1': tk, '2': `VSB${k}` })
      .part(`BV${k}`, 'bridge', x + 140, 860, { value: 'DB107' }, { '1': `VSA${k}`, '2': `VSB${k}`, '3': `VSP${k}`, '4': `VSN${k}` })
      .part(`US${k}`, 'opto', x + 260, 860, { value: 'PC817' }, { '1': `VSP${k}`, '2': `VSN${k}`, '4': k === 1 ? 'OFFN' : `OC${k - 1}`, '3': k === 7 ? 'GND' : `OC${k}` })
      .part(`RSN${k}`, 'resistor', x + 100, 620, { value: '47', pmax: '2' }, { '1': sw, '2': `SNB${k}` }, 1)
      .part(`CSN${k}`, 'capacitor', x + 100, 720, { value: '100n', vmax: '1000' }, { '1': `SNB${k}`, '2': tk }, 1);
    if (o.shorted === k) nb.block('bench').part('RSHORT', 'resistor', x + 200, 620, { value: '0.005' }, { '1': 'VSW', '2': t }).block('taps');
    if (o.driverShorted === k) nb.block('bench').part('RQSH', 'resistor', x + 220, 230, { value: '1' }, { '1': `LK${k}`, '2': 'EG' }).block('taps');
  }
  // power-up hold: the drivers' emitters reach ground through QPE only once CPE (47k, 47 µF, fed
  // through the thermal cut-out) has passed VREF, about 0.5 s after the rail: the input sense has
  // settled by then. A comparator (1 M of hysteresis) switches QPE: a slow RC driving it directly
  // would ramp the opto LEDs through their trigger current (found in the P4b audit). Without the
  // hold the comparators' outputs, pulled up before the comparators work, chose tap 1 (150 V) at
  // 230 V in and the winding rang to 1 kV at its top (found in simulation). An open cut-out
  // empties CPE through DPE: no gate, the transformer is off
  nb.part('RPE', 'resistor', 2900, 300, { value: '47k' }, { '1': 'VTC', '2': 'CPE' })
    .part('CPE', 'capacitor_pol', 2900, 420, { value: '47u', vmax: '25' }, { '1': 'CPE', '2': 'GND' }, 1)
    .part('DPE', 'diode', 2980, 300, { value: '1N4148' }, { '2': 'CPE', '1': 'VTC' }, 3)
    .part('UCS', 'comparator', 3000, 420, { value: 'LM339', pkg: 'CMP2' }, { '3': 'CPE', '2': 'VREF', '1': 'OPE', '8': V, '4': 'GND' })
    .part('RHPE', 'resistor', 3000, 560, { value: '1M' }, { '1': 'OPE', '2': 'CPE' }, 1)
    .part('RPU', 'resistor', 3080, 300, { value: '2.2k' }, { '1': V, '2': 'OPE' }, 1)
    .part('RPB', 'resistor', 3080, 420, { value: '2.2k' }, { '1': 'OPE', '2': 'BPE' })
    .part('RPB2', 'resistor', 3080, 520, { value: '47k' }, { '1': 'BPE', '2': 'GND' }, 1)
    .part('QPE', 'npn', 3160, 420, { value: 'BC547B' }, { '1': 'BPE', '2': 'EG', '3': 'ESE' })
    // one gate at most: the LEDs' common current through 33 Ω (one LED about 0.5 V, two about
    // 0.9 V) against 0.70 V: a second lit gate sets a latch (UL), which holds CPE empty (every gate
    // off) and FLTS low (the output open, FAULT on) until the unit is switched off. A pair already
    // fired conducts to its current zero; a resulting short clears the aR fuse. (Without the
    // latch the enable hunted at its threshold, firing again and again: found in simulation)
    .part('RSE', 'resistor', 3160, 560, { value: '33' }, { '1': 'ESE', '2': 'GND' }, 1)
    .part('ROHA', 'resistor', 3260, 300, { value: '25.5k' }, { '1': 'VREF', '2': 'VOH' }, 1)
    .part('ROHB', 'resistor', 3260, 420, { value: '10k' }, { '1': 'VOH', '2': 'GND' }, 1)
    .part('UOH', 'comparator', 3360, 420, { value: 'LM393', pkg: 'PROT3' }, { '3': 'VOH', '2': 'ESE', '1': 'OOH', '8': V, '4': 'GND' })
    .part('DLS', 'diode', 3460, 420, { value: '1N4148' }, { '2': 'LAT', '1': 'OOH' })
    .part('RLAT', 'resistor', 3560, 300, { value: '10k' }, { '1': V, '2': 'LAT' }, 1)
    // a trip of a fraction of a microsecond empties CLAT at once; it recovers through 10k (1 ms),
    // long enough for the latch to set (without it the check fired and released again within one
    // step, and the enable hunted at its threshold: found in simulation)
    .part('CLAT', 'capacitor', 3760, 560, { value: '100n', vmax: '50' }, { '1': 'LAT', '2': 'GND' }, 1)
    // the latch's threshold rises slower than LAT at power-up (10k, 10k, 1 µF): it never sets then
    .part('RLTA', 'resistor', 3660, 300, { value: '10k' }, { '1': 'VREF', '2': 'LTH' }, 1)
    .part('RLTB', 'resistor', 3660, 420, { value: '10k' }, { '1': 'LTH', '2': 'GND' }, 1)
    .part('CLTH', 'capacitor', 3740, 420, { value: '1u', vmax: '50' }, { '1': 'LTH', '2': 'GND' }, 1)
    .part('UL', 'comparator', 3560, 520, { value: 'LM393', pkg: 'PROT3' }, { '3': 'LAT', '2': 'LTH', '1': 'OL', '8': V, '4': 'GND' })
    .part('DLH', 'diode', 3460, 640, { value: '1N4148' }, { '2': 'LAT', '1': 'OL' })
    .part('DOH1', 'diode', 3560, 640, { value: '1N4148' }, { '2': 'CPE', '1': 'OL' })
    .part('DOH2', 'diode', 3660, 640, { value: '1N4148' }, { '2': 'FLTS', '1': 'OL' })
    .part('CD4', 'capacitor', 2900, 0, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);
  nb.part('T1', 'autotransformer', 2700, 900, { value: vr.at }, { N: 'N', T1: 'T1', T2: 'T2', T3: 'T3', T4: 'T4', T5: 'T5', T6: 'T6', T7: 'T7' }, 0, true);

  // ---- output: restart delay, the relay that switches the contactor's coil, the protection's own
  // relay in series with it, the contactor, the terminals. The coil (200–277 V) is on the 250 V
  // tap, fused for the board: 233 V at 140 V in, 268 V at 300 V in (on the 230 V tap a 230 V
  // coil saw only 213 V at 140 V in). The relay coils are fed through the thermal cut-out (VTC)
  nb.block('out')
    .part('FT6', 'fuse', 3330, 700, { value: '1', r: '0.15', fusetype: 'H' }, { '1': 'T6', '2': 'T6F' })
    .part('XT1', 'terminal', 3540, 60, { value: 'thermal cut-out of T (NC)' }, { '1': V })
    .part('XT2', 'terminal', 3540, 120, { value: 'thermal cut-out of T, return' }, { '1': 'VTC' })
    .part('XPE', 'terminal', 3780, 740, { value: 'PE stud (control ground)' }, { '1': 'GND' }, 2)
    .part('RD1', 'resistor', 3030, 150, { value: '1M' }, { '1': V, '2': 'DLY' }, 1)
    .part('DDIS', 'diode', 2950, 240, { value: '1N4148' }, { '2': 'DLY', '1': V }, 3)
    .part('CD', 'capacitor', 3030, 360, { value: o.delayC ?? '4.7u', vmax: '63' }, { '1': 'DLY', '2': 'GND' }, 1)
    .part('RT1', 'resistor', 3180, 60, { value: '2.49k' }, { '1': V, '2': 'DTH' }, 1)
    .part('RT2', 'resistor', 3180, 150, { value: '10k' }, { '1': 'DTH', '2': 'GND' }, 1)
    .part('U8', 'comparator', 3180, 280, { value: 'LM339', pkg: 'CMP2' }, { '3': 'DLY', '2': 'DTH', '1': 'OD', '8': V, '4': 'GND' })
    .part('RPD', 'resistor', 3270, 230, { value: '2.2k' }, { '1': V, '2': 'OD' }, 1)
    .part('RBD', 'resistor', 3270, 380, { value: '2.2k' }, { '1': 'OD', '2': 'BD' }, 1)
    .part('QD', 'npn', 3300, 500, { value: 'BD139' }, { '1': 'BD', '2': 'KD', '3': 'GND' })
    .part('DD', 'diode', 3350, 410, { value: '1N4148', labels: 'left' }, { '2': 'KD', '1': 'VTC' }, 3)
    .part('KO', 'relay', 3400, 410, { value: '12 V 30 A', life: '100000' }, { '1': 'VTC', '2': 'KD', '3': 'T6F', '5': 'KMC1' })
    .part('LKO', 'led', 3490, 280, { colour: 'green' }, { '2': 'VTC', '1': 'LKOA' }, 1)
    .part('RLKO', 'resistor', 3490, 370, { value: '2.2k' }, { '1': 'LKOA', '2': 'KD' }, 1)
    .part('KM', 'contactor', 3600, 600, { value: vr.km }, { A1: 'KMC', A2: 'N', '1': 'T5', '2': 'OUT', '3': 'N', '4': 'NOUT' })
    .part('X4', 'terminal', 3780, 560, { value: 'L out', wire: vr.wout }, { '1': 'OUT' }, 2)
    .part('X5', 'terminal', 3780, 620, { value: 'N out', wire: vr.wout }, { '1': 'NOUT' }, 2)
    .part('X6', 'terminal', 3780, 680, { value: 'PE', wire: vr.wpe }, { '1': 'GND' }, 2);
  nb.block('in the autotransformer').part('STC', 'switch', 3640, 90, { closed: 'true' }, { '1': V, '2': 'VTC' }, 1);
  if (o.koShorted) nb.block('bench').part('RKOSH', 'resistor', 3330, 560, { value: '1' }, { '1': 'KD', '2': 'GND' });
  nb.block('out');
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
    .part('FT5', 'fuse', -80, 2270, { value: '0.5', r: '0.6', fusetype: 'H' }, { '1': 'T5', '2': 'T5F' })
    .part('TR2', 'transformer', 50, 2270, SENSE_TR400, { '1': 'T5F', '2': 'N', '3': 'SA2', '4': 'SB2' })
    .part('RS2', 'resistor', 160, 2350, { value: '220' }, { '1': 'SA2', '2': 'SN2' }, 1)
    .part('CS2', 'capacitor', 160, 2440, { value: '100n', vmax: '63' }, { '1': 'SN2', '2': 'SB2' }, 1)
    .part('BR2', 'bridge', 270, 2290, { value: 'DB107' }, { '1': 'SA2', '2': 'SB2', '3': 'VSR2', '4': 'GND' })
    .part('C3', 'capacitor_pol', 370, 2290, { value: '4.7u', vmax: '50' }, { '1': 'VSR2', '2': 'GND' }, 1)
    .part('R5', 'resistor', 450, 2220, { value: '80.6k' }, { '1': 'VSR2', '2': 'SEN2' })
    .part('R6', 'resistor', 520, 2290, { value: '6.8k' }, { '1': 'SEN2', '2': 'STR2' }, 1)
    .part('RT2C', 'potentiometer', 520, 2390, { value: '5k', pmax: '0.5', position: '64' }, { '1': 'STR2', '2': 'GND', '3': 'GND' }, 1)
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
    // the heatsink (D56): a ring-lug NTC 10k (B 3950) on the heatsink, on two terminals, against
    // 10k: 2.12 V at 70 °C (trip); an open NTC or wire reads 0 V and trips too (below 0.1 V, colder
    // than about −30 °C)
    .part('XN1', 'terminal', 700, 2700, { value: 'heatsink NTC' }, { '1': 'VREF2' })
    .part('XN2', 'terminal', 700, 2780, { value: 'heatsink NTC, return' }, { '1': 'NHS' })
    .part('RTHB', 'resistor', 800, 2870, { value: '10k' }, { '1': 'NHS', '2': 'GND' }, 1)
    .part('RT70A', 'resistor', 900, 2750, { value: '1.74k' }, { '1': 'VREF2', '2': 'VT70' }, 1)
    .part('RT70B', 'resistor', 900, 2870, { value: '10k' }, { '1': 'VT70', '2': 'GND' }, 1)
    .part('UTH', 'comparator', 1000, 2750, { value: 'LM393', pkg: 'PROT2' }, { '3': 'VT70', '2': 'NHS', '1': 'FLTS', '8': V, '4': 'GND' })
    .part('RNOA', 'resistor', 1100, 2750, { value: '240k' }, { '1': 'VREF2', '2': 'VNO' }, 1)
    .part('RNOB', 'resistor', 1100, 2870, { value: '10k' }, { '1': 'VNO', '2': 'GND' }, 1)
    .part('UNO', 'comparator', 1200, 2750, { value: 'LM393', pkg: 'PROT4' }, { '3': 'NHS', '2': 'VNO', '1': 'FLTS', '8': V, '4': 'GND' })
    // the fan (D56) on the heatsink, 230 V AC, switched by a 50 °C thermostat there: fed from the
    // 230 V tap, fused for the board
    .part('XF1', 'terminal', 1300, 2700, { value: 'heatsink fan (via its 50 °C thermostat)' }, { '1': 'T5F' })
    .part('XF2', 'terminal', 1300, 2780, { value: 'heatsink fan, return' }, { '1': 'N' })
    // the protection's own output relay KP (B2 of the P4 review, as the 1 kVA unit): in series
    // with KO in the contactor's coil feed; it closes about 0.24 s after the protection finds the
    // output in range (a comparator: never a slow RC on a coil) and opens at once on a fault
    .part('RBP', 'resistor', 1300, 2400, { value: '47k' }, { '1': V, '2': 'BPP' }, 1)
    .part('CBP', 'capacitor_pol', 1240, 2500, { value: '22u', vmax: '25' }, { '1': 'BPP', '2': 'GND' }, 1)
    .part('DPP', 'diode', 1300, 2510, { value: '1N4148' }, { '2': 'BPP', '1': 'FLTS' })
    .part('UKP', 'comparator', 1400, 2460, { value: 'LM393', pkg: 'PROT4' }, { '3': 'BPP', '2': 'VREF2', '1': 'OKP', '8': V, '4': 'GND' })
    .part('RPKP', 'resistor', 1460, 2370, { value: '2.2k' }, { '1': V, '2': 'OKP' }, 1)
    .part('RBKP', 'resistor', 1460, 2550, { value: '2.2k' }, { '1': 'OKP', '2': 'BP' }, 1)
    .part('QP', 'npn', 1520, 2460, { value: 'BD139' }, { '1': 'BP', '2': 'KPC', '3': 'GND' })
    .part('DKP', 'diode', 1580, 2380, { value: '1N4148' }, { '2': 'KPC', '1': V }, 3)
    .part('KP', 'relay', 1650, 2380, { value: '12 V 30 A', life: '100000' }, { '1': V, '2': 'KPC', '3': 'KMC1', '5': 'KMC' })
    .part('CD7', 'capacitor', 1650, 2890, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('R12', 'resistor', 620, 2460, { value: '10k' }, { '1': V, '2': 'FLTS' }, 1)
    .part('DF1', 'diode', 750, 2570, { value: '1N4148' }, { '2': 'OD', '1': 'FLTS' })
    .part('DF2', 'diode', 750, 2720, { value: '1N4148' }, { '2': 'DLY', '1': 'DF2K' })
    .part('RDF2', 'resistor', 860, 2720, { value: '2.2k' }, { '1': 'DF2K', '2': 'FLTS' })
    .part('LF', 'led', 1150, 2470, { colour: 'red' }, { '2': V, '1': 'LFA' }, 1)
    .part('RLF', 'resistor', 1150, 2570, { value: '4.7k' }, { '1': 'LFA', '2': 'FLTS' }, 1)
    .part('CD5', 'capacitor', 650, 2890, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CD6', 'capacitor', 1150, 2890, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);
  // on the heatsink (bought with it): the NTC, and the fan behind its thermostat
  nb.block('on the heatsink')
    .part('RTH', 'ntc', 600, 2740, { value: '10k', temp: String(o.theatsink ?? 50) }, { '1': 'VREF2', '2': o.ntcOpen ? 'nc_NTC' : 'NHS' }, 1)
    .part('STH', 'switch', 1800, 2700, { closed: String((o.theatsink ?? 50) >= 50) }, { '1': 'T5F', '2': 'FANL' }, 1)
    .part('RFAN', 'resistor', 1800, 2800, { value: '2.7k', pmax: '25' }, { '1': 'FANL', '2': 'N' }, 1);

  nb.v('VIN').v('OUT').v('SF').v('CHG').v('OFFN');
  nb.sim({ type: 'tran', stop: o.stop ?? '1', step: '50u', start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
