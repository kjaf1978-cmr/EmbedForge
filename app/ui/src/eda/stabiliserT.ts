// P4b (D27, D58): mains voltage stabilisers for 5, 10 and 15 kVA, step type, as the 1 kVA unit
// (P4): the input feeds one tap of a tapped autotransformer, the output is taken from its 230 V
// tap. D58 (revising D41, thyristor taps, after its independent review) switches the taps with
// contactors that never make or break current: an input contactor KI opens for every tap change,
// the tap contactors change while it is open, and it closes again only when exactly the commanded
// tap contactor is closed and no other.
//
// What makes two taps at once impossible with a single fault: P4's tap relays form a chain of
// changeover contacts, so one tap at most is connected by construction. Large contactors have no
// changeover power poles, so here the check is made on their auxiliary contacts (mechanically
// linked to the main poles: a welded pole keeps its NO auxiliary closed). Each tap contactor's NO
// auxiliary joins its coil's switched end (0 V when commanded, 24 V when not) through 2.2k to the
// node M, pulled up to 24 V through 2.2k: M sits at half the supply only when exactly the
// commanded contactor is closed; none closed, a welded or slow one beside it, two commanded (a
// decoder fault) or a wrong one give 24, 16, 8 or 24 V. A window on M is in the input contactor's
// command. A tap change also waits for KI's own NC auxiliary (a mirror contact): the tap states are
// clocked only once KI has opened.

import { NB, SENSE_TR400, STAB_LADDER, type MainsStep } from './powerExamples';
import type { Sheet } from './schematic';

export interface StabTOptions {
  kva?: 5 | 10 | 15;
  /** Input r.m.s. voltage and a step of it during the run. */
  vin?: number; step?: MainsStep;
  stop?: string;
  /** Tests: the restart delay's capacitor (product 4.7 µF: about 7.6 s); the power-good
   *  capacitor follows it (220 nF instead of 470 nF when set). */
  delayC?: string;
  /** The test load: its power factor (1: resistive; below 1: R and L in series), its share of
   *  the rating (1: full load), or none. */
  pf?: number; share?: number; noLoad?: boolean;
  /** Tests (DFMEA): the tap contactor k (1 … 7) welded: its armature held in (its coil's switched
   *  end tied to ground, so its main poles, NO and NC auxiliaries stay as when closed); with
   *  `noOpens`, its NO auxiliary opens all the same (IEC 60947-4-1 Annex F guarantees only the
   *  NC mirror contact). */
  welded?: number; noOpens?: boolean;
  /** Tests (DFMEA): the coil driver of tap k shorts at `at` seconds into the run (the unit already
   *  running on another tap). */
  driverShortsAt?: { k: number; at: number };
  /** Tests: the supply's source impedance (Ω, resistive), a weak rural line. */
  rs?: number;
  /** Tests (DFMEA): the coil driver of tap k shorted (its contactor always closed). */
  driverShorted?: number;
  /** Tests (DFMEA): the output relay's driver shorted (KO closed from power-up). */
  koShorted?: boolean;
  /** Tests: the autotransformer's thermal cut-out open. */
  hot?: boolean;
}

/** Per rating: autotransformer, input breaker QF1, output breaker QF2, the tap contactors (24 V DC
 *  coil; they only carry current, never make or break it: their three poles in parallel, AC-1
 *  40 / 60 / 80 A × 2.25 (the makers' factor for three poles) = 90 / 135 / 180 A for at most
 *  36 / 71 / 107 A, the lowest tap at 140 V in), the input and output contactors (24 V DC coil,
 *  one pole for KI: it makes and breaks the input current at every tap change, AC-1 60 / 125 /
 *  200 A for 36 / 71 / 107 A, about 0.55 of its rating; KM switches L and N of the output, 22 /
 *  43 / 65 A), wire sizes (mm², PVC copper, IEC 60364-5-52 method C at 30 °C, to be derated for
 *  the enclosure). */
export const STABT_VARIANTS = {
  5: { at: '5 kVA 230 V, taps 150–280 V', qf: '40', qfo: '25', kt: '25 A, coil 24 V DC', ki: '40 A, coil 24 V DC', win: '6', wout: '6', wpe: '6' },
  10: { at: '10 kVA 230 V, taps 150–280 V', qf: '80', qfo: '50', kt: '40 A, coil 24 V DC', ki: '80 A, coil 24 V DC', win: '16', wout: '16', wpe: '16' },
  15: { at: '15 kVA 230 V, taps 150–280 V', qf: '125', qfo: '80', kt: '50 A, coil 24 V DC', ki: '115 A, coil 24 V DC', win: '35', wout: '25', wpe: '16' },
} as const;

export function stabiliserT(o: StabTOptions = {}): { sheet: Sheet; nb: NB } {
  const kva = o.kva ?? 5, vr = STABT_VARIANTS[kva], vin = o.vin ?? 230;
  const nb = new NB().wireUp(['+12V', '+24V']);
  const V = '+12V', V24 = '+24V';
  nb.para(`MAINS VOLTAGE STABILISER ${kva} kVA, contactor-switched taps (D58). The input is connected to one tap of a ${kva} kVA autotransformer (150 … 280 V) by one of seven tap contactors, through the input contactor KI; the output is taken from its 230 V tap: V_out = V_in·230/tap, within about ±6 % for 140 … 300 V in.`, -1250, -380)
    .para('A tap change never makes or breaks current at a tap: KI opens, the tap states are taken over once its NC auxiliary shows it open, the tap contactors change, and KI closes only when exactly the commanded tap contactor is closed (their NO auxiliaries against their coil commands: a welded, slow or second contactor keeps KI open). LM339 comparators against a TL431 ladder choose the tap (160 / 180 / 200 / 220 / 240 / 265 V, about 5 V of hysteresis); a priority decoder commands one tap at most. The output contactor KM closes after about 8 s; an independent protection opens it outside 190 … 255 V through its own relay KP. The thermal cut-out in the winding opens KI. The control is treated as live (no PELV claim); its 0 V is bonded to PE at the PE stud.', -50, -380);

  // ---- test bench: the supply (TN, neutral earthed at the transformer) — not part of the product
  nb.block('bench').note('TEST BENCH (not part of the product): mains supply with its neutral earthed at the transformer', -1250, -60);
  nb.part('VIN', 'vsin', -1150, 100, { value: String(Number((vin * Math.SQRT2).toPrecision(6))), freq: '50' }, { '1': o.rs ? 'L_SRC' : 'L_IN', '2': o.step ? 'L_STEP' : 'N_IN' });
  if (o.step) nb.part('VS', 'vsin', -1150, 220, { value: String(Number(((o.step.to[0] - vin) * Math.SQRT2).toPrecision(6))), freq: '50', delay: String(o.step.at) }, { '1': 'L_STEP', '2': 'N_IN' });
  nb.part('RE', 'resistor', -1050, 300, { value: '0.1' }, { '1': 'N_IN', '2': 'GND' }, 1);
  if (o.rs) nb.part('RSRC', 'resistor', -1000, 20, { value: String(o.rs) }, { '1': 'L_SRC', '2': 'L_IN' });

  // ---- input: terminals (DIN-rail blocks sized for the input current), a 2-pole breaker (fixed
  // wiring only), the thermally protected surge arrester
  nb.block('in')
    .part('X1', 'terminal', -900, 70, { value: 'L in', wire: vr.win }, { '1': 'L_IN' })
    .part('X2', 'terminal', -900, 130, { value: 'N in', wire: vr.win }, { '1': 'N_IN' })
    .part('X3', 'terminal', -900, 190, { value: 'PE', wire: vr.wpe }, { '1': 'GND' })
    .part('QF1', 'breaker2', -760, 70, { value: vr.qf, curve: 'D' }, { '1': 'L_IN', '2': 'VIN', N1: 'N_IN', N2: 'N' }, 3)
    .part('RV1', 'mov', -640, 100, { value: 'TMOV14RP300E' }, { '1': 'VIN', '2': 'N' }, 1);

  // ---- control supplies from the input (before KI): 12 V for the control (D52, as the 1 kVA
  // unit) and 24 V for the contactor coils (about 22 W each; four at most at once: a tap, KI, KM
  // and, during a change, the next tap), both for 90 … 305 V AC, behind ceramic fuses (1.5 kA
  // breaking behind the large breaker); the 24 V supply is a potted panel unit with leads
  nb.block('aux')
    .part('F1', 'fuse', -840, 400, { value: '1', r: '0.15', fusetype: 'H' }, { '1': 'VIN', '2': 'VF' })
    .part('PS1', 'acdc', -600, 420, { value: 'IRM-15-12' }, { L: 'VF', N: 'N', '+V': V, '-V': 'GND' })
    .part('C6', 'capacitor_pol', -200, 440, { value: '100u', vmax: '25' }, { '1': V, '2': 'GND' }, 1)
    .part('F2', 'fuse', -840, 560, { value: '2', r: '0.08', fusetype: 'H' }, { '1': 'VIN', '2': 'VF2' })
    .part('PS2', 'acdc', -600, 580, { value: 'HLG-100H-24' }, { L: 'VF2', N: 'N', '+V': V24, '-V': 'GND' })
    .part('C7', 'capacitor_pol', -200, 600, { value: '470u', vmax: '35' }, { '1': V24, '2': 'GND' }, 1);

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
    .part('R3', 'resistor', -560, 750, { value: '100k' }, { '1': 'SENSE', '2': 'SFI' })
    // the sense is held from the start of a tap change until about 0.6 s after KI has closed
    // again (QSH off): during the gap the input is unloaded, and on a weak line (0.5 Ω at 107 A:
    // 53 V) the unloaded voltage chose another tap, and the next change chose the first again
    // (the review of 16 November). TRG empties CSH at a change, through KI's NO 43-44: only while
    // KI is closed, so never at power-up (switching on is a change too, and the sense held 0 V and
    // chose the lowest tap: found in simulation); it recharges through 4.7M. CSH from the rail: at
    // power-up QSH is on at once
    .part('QSH', 'nmos', -490, 700, { value: '2N7000' }, { '1': 'GSH', '2': 'SFI', '3': 'SF' })
    .part('CSH', 'capacitor', -400, 620, { value: '1u', vmax: '50' }, { '1': V, '2': 'GSH' }, 1)
    .part('RSH', 'resistor', -320, 620, { value: '4.7M' }, { '1': V, '2': 'GSH' }, 1)
    .part('DSH', 'diode', -320, 720, { value: '1N4148' }, { '2': 'GSH', '1': 'DSHK' })
    .part('C2', 'capacitor', -490, 820, { value: '470n', vmax: '50' }, { '1': 'SF', '2': 'GND' }, 1);

  // ---- reference and threshold ladder (as the 1 kVA unit)
  nb.block('ref')
    .part('R4', 'resistor', -1100, 1110, { value: '2.2k' }, { '1': V, '2': 'VREF' })
    .part('U1REF', 'tl431', -1000, 1200, { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' }, 3);
  const lad = ['GND', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'VREF'];
  STAB_LADDER.forEach((r, k) => nb.part(`RL${k + 1}`, 'resistor', -880 + 90 * k, 1270, { value: r }, { '1': lad[k], '2': lad[k + 1] }));

  // ---- the wanted tap: O_k high while the input is below threshold k; the hysteresis as the
  // 1 kVA unit (2 MΩ from the output, which swings the whole rail: about 5 V of input per step,
  // the thresholds where the ladder puts them); each output into the change detector (SUM)
  nb.block('compare');
  for (let k = 0; k < 6; k++) {
    const n = k + 1, x = 300 * k;
    nb.part(`UC${n}`, 'comparator', x, 1150, { value: 'LM339', pkg: k < 4 ? 'CMP1' : 'CMP2' }, { '3': `N${n}`, '2': 'SF', '1': `O${n}`, '8': V, '4': 'GND' })
      .part(`RF${n}`, 'resistor', x, 1060, { value: '1M' }, { '1': `N${n}`, '2': `NF${n}` })
      .part(`RG${n}`, 'resistor', x + 60, 1030, { value: '1M' }, { '1': `NF${n}`, '2': `O${n}` })
      .part(`RP${n}`, 'resistor', x + 90, 1090, { value: '2.2k' }, { '1': V, '2': `O${n}` }, 1)
      .part(`RSU${n}`, 'resistor', x + 150, 1150, { value: '100k' }, { '1': `O${n}`, '2': 'SUM' });
  }
  nb.part('CD1', 'capacitor', 1850, 1150, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- the latch (three CD4013, clocked by CLK only while KI is open) and the priority decoder:
  // it commands the lowest tap whose latched state is high and none other, whatever input sticks
  // (B_k: some tap below k wanted, an OR chain; tap k = LO_k and not B_k; tap 7 = none)
  nb.block('logic');
  for (let k = 1; k <= 6; k++) {
    const x = 500 + 160 * (k - 1);
    nb.part(`UL${k}`, 'dff', x, 1450, { value: V, pkg: `LT${Math.ceil(k / 2)}` }, { '1': `O${k}`, '2': 'CLK', '3': `LO${k}`, '4': `LN${k}` })
      .part(`UN${k}`, 'nor2', x, 1650, { value: V, pkg: k <= 4 ? 'NR1' : 'NR2' }, { '1': `LN${k}`, '2': k === 1 ? 'GND' : k === 2 ? 'LO1' : `B${k}`, '3': `S${k}` });
    if (k >= 3) nb.part(`UB${k}`, 'or2', x, 1850, { value: V, pkg: 'OR1' }, { '1': k === 3 ? 'LO1' : `B${k - 1}`, '2': `LO${k - 1}`, '3': `B${k}` });
  }
  nb.part('UN7', 'nor2', 1500, 1650, { value: V, pkg: 'NR2' }, { '1': 'B6', '2': 'LO6', '3': 'S7' })
    // the spare NOR and the spare OR: inputs to ground
    .part('UNS', 'nor2', 1650, 1650, { value: V, pkg: 'NR2' }, { '1': 'GND', '2': 'GND', '3': 'nc_NSP' })
    .part('CD2', 'capacitor', 1650, 1450, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CD3', 'capacitor', 1750, 1450, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- per tap: the coil driver (an IRF540N, its gate at 12 V from the decoder), the contactor's
  // coil with its suppressor (a diode and a 1500 W TVS: it opens in a few tens of ms), an
  // indicator, the NO auxiliary into the match node M, and two interlocks (the review of 16
  // November):
  //  - seal-in: the coil's feed CF_k comes from VTF (KI's second NC: live only while KI is open)
  //    through a diode, or from 24 V through its own NO 43-44: a tap contactor can pull in only
  //    while KI is open, whatever its driver does; once in, it holds itself;
  //  - mirror chain: KI's coil current runs through the NC (mirror) auxiliaries 21-22 of all seven
  //    tap contactors in series, each bridged by a MOSFET for the commanded tap only: any other
  //    tap contactor closed (welded) keeps KI open.
  // The three main poles, in parallel, join the switched input VCH to tap k
  nb.block('taps');
  for (let k = 1; k <= 7; k++) {
    const x = 400 * (k - 1), kt = `KT${k}`;
    nb.part(`RGT${k}`, 'resistor', x, 150, { value: '1k' }, { '1': `S${k}`, '2': `GT${k}` })
      .part(`RGD${k}`, 'resistor', x + 60, 240, { value: '100k' }, { '1': `GT${k}`, '2': 'GND' }, 1)
      .part(`QT${k}`, 'nmos', x + 120, 300, { value: 'IRF540N' }, { '1': `GT${k}`, '2': kt, '3': 'GND' })
      .part(`DT${k}`, 'diode', x + 200, 120, { value: '1N4007' }, { '2': kt, '1': `DZT${k}` }, 3)
      .part(`ZT${k}`, 'tvs', x + 200, 220, { value: '1.5KE27A' }, { '1': `DZT${k}`, '2': `CF${k}` }, 3)
      .part(`LT${k}`, 'led', x + 280, 60, { colour: 'yellow' }, { '2': `CF${k}`, '1': `LTA${k}` }, 1)
      .part(`DLT${k}`, 'diode', x + 240, 100, { value: '1N4148' }, { '2': `LTA${k}`, '1': `CF${k}` }, 1)
      .part(`RLT${k}`, 'resistor', x + 280, 150, { value: '4.7k' }, { '1': `LTA${k}`, '2': kt }, 1)
      .part(`DFT${k}`, 'diode', x + 360, 60, { value: '1N4007' }, { '2': 'VTF', '1': `CF${k}` })
      .part(`K${k}`, 'contactor', x + 320, 300, { value: vr.kt, aux2: 'true', opsday: '200', life: '10000000', land: 'A1 A2 13 14 21 22 43 44' },
        { A1: `CF${k}`, A2: kt, '1': 'VCH', '2': `T${k}`, '3': 'VCH', '4': `T${k}`, '5': 'VCH', '6': `T${k}`, '13': kt, '14': o.welded === k && o.noOpens ? `nc_AX${k}` : `AX${k}`, '21': (k === 1 ? 'KIS' : `KC${k - 1}`), '22': (k === 7 ? 'GND' : `KC${k}`), '43': V24, '44': `CF${k}` })
      .part(`RAX${k}`, 'resistor', x + 320, 420, { value: '2.2k' }, { '1': `AX${k}`, '2': 'M' })
      .part(`RGB${k}`, 'resistor', x + 120, 480, { value: '10k' }, { '1': `S${k}`, '2': `GB${k}` })
      // its gate held within −0.7 … +13 V of its source, which floats on the chain
      .part(`ZGB${k}`, 'zener', x + 260, 600, { value: 'BZX55C13' }, { '1': `GB${k}`, '2': (k === 7 ? 'GND' : `KC${k}`) }, 1)
      .part(`RGE${k}`, 'resistor', x + 60, 560, { value: '100k' }, { '1': `GB${k}`, '2': 'GND' }, 1)
      .part(`QB${k}`, 'nmos', x + 200, 560, { value: 'IRF540N' }, { '1': `GB${k}`, '2': (k === 1 ? 'KIS' : `KC${k - 1}`), '3': (k === 7 ? 'GND' : `KC${k}`) });
    if (o.welded === k) nb.block('bench').part('RWP', 'resistor', x + 380, 360, { value: '0.002' }, { '1': 'VCH', '2': `T${k}` }).part('RWH', 'resistor', x + 380, 440, { value: '1' }, { '1': kt, '2': 'GND' }).block('taps');
    if (o.driverShorted === k) nb.block('bench').part('RQSH', 'resistor', x + 160, 380, { value: '1' }, { '1': kt, '2': 'GND' }).block('taps');
    if (o.driverShortsAt?.k === k) nb.block('bench')
      .part('VQSH', 'vpulse', x + 120, 640, { value: '12', low: '0', freq: '0.01', duty: '99', delay: String(o.driverShortsAt.at), edge: '1u' }, { '1': 'GQSH', '2': 'GND' })
      .part('QQSH', 'nmos', x + 160, 700, { value: 'IRF540N' }, { '1': 'GQSH', '2': kt, '3': 'GND' }).block('taps');
  }
  nb.part('T1', 'autotransformer', 3100, 900, { value: vr.at }, { N: 'N', T1: 'T1', T2: 'T2', T3: 'T3', T4: 'T4', T5: 'T5', T6: 'T6', T7: 'T7' }, 0, true);

  // ---- the match check: M (2.2k to 24 V, and 2.2k per closed auxiliary to its coil's switched
  // end) is about 12 V only when exactly the commanded tap contactor is closed. Divided (100k,
  // 47k) and filtered (15 ms: auxiliary contact bounce) to MS against the window 3.17 … 4.48 V
  // (VWL, VWH from the 24 V rail, so the levels and the window scale together: the review of 16
  // November): MS is about 3.8 V then; none closed or a wrong one 7.6 V, one beside it 5.1 V,
  // two commanded 2.6 V
  nb.block('match')
    .part('RMP', 'resistor', 2850, 1250, { value: '2.2k' }, { '1': V24, '2': 'M' }, 1)
    .part('RMA', 'resistor', 2950, 1250, { value: '100k' }, { '1': 'M', '2': 'MS' })
    .part('RMB', 'resistor', 3050, 1350, { value: '47k' }, { '1': 'MS', '2': 'GND' }, 1)
    .part('CMS', 'capacitor', 3130, 1350, { value: '470n', vmax: '50' }, { '1': 'MS', '2': 'GND' }, 1)
    .part('RWA', 'resistor', 3250, 1150, { value: '26.1k' }, { '1': V24, '2': 'VWH' }, 1)
    .part('RWB', 'resistor', 3250, 1250, { value: '1.74k' }, { '1': 'VWH', '2': 'VWL' }, 1)
    .part('RWC', 'resistor', 3250, 1350, { value: '4.22k' }, { '1': 'VWL', '2': 'GND' }, 1)
    .part('UW1', 'comparator', 3400, 1200, { value: 'LM393', pkg: 'WIN' }, { '3': 'MS', '2': 'VWL', '1': 'OI', '8': V, '4': 'GND' })
    .part('UW2', 'comparator', 3400, 1360, { value: 'LM393', pkg: 'WIN' }, { '3': 'VWH', '2': 'MS', '1': 'OI', '8': V, '4': 'GND' })
    .part('CD8', 'capacitor', 3500, 1450, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- tap-change sequencer (as the 1 kVA unit, D51): any change of a tap comparator steps SUM;
  // the step, coupled into E (biased at half the rail), crosses the window VEL … VEH and empties
  // the timer MT. While MT is below VEH, KI is open. MT charges only through KI's NC auxiliary
  // (CLKP), so it starts only once KI is open: the latch is clocked when MT passes VEL, and KI
  // closes again once MT has passed VEH, the match check holds and the mirror chain is closed.
  // (Charged from the rail, MT passed VEH before a slow KI had opened and KI closed again before
  // the latch was clocked: the review of 16 November.) 10M keeps MT up while KI is closed
  nb.block('sequencer')
    .part('RSUM', 'resistor', 1700, 2120, { value: '100k' }, { '1': 'SUM', '2': 'GND' }, 1)
    .part('CE', 'capacitor', 1800, 2060, { value: '100n', vmax: '50' }, { '1': 'SUM', '2': 'E' })
    .part('RE1', 'resistor', 1900, 1980, { value: '100k' }, { '1': V, '2': 'E' }, 1)
    .part('RE2', 'resistor', 1900, 2140, { value: '100k' }, { '1': 'E', '2': 'GND' }, 1)
    .part('RW1', 'resistor', 2000, 1900, { value: '100k' }, { '1': V, '2': 'VEH' }, 1)
    .part('RW2', 'resistor', 2000, 2000, { value: '10k' }, { '1': 'VEH', '2': 'VEL' }, 1)
    .part('RW3', 'resistor', 2000, 2100, { value: '100k' }, { '1': 'VEL', '2': 'GND' }, 1)
    .part('USQ1', 'comparator', 2150, 1940, { value: 'LM339', pkg: 'SEQ' }, { '3': 'VEH', '2': 'E', '1': 'TRG', '8': V, '4': 'GND' })
    .part('USQ2', 'comparator', 2150, 2100, { value: 'LM339', pkg: 'SEQ' }, { '3': 'E', '2': 'VEL', '1': 'TRG', '8': V, '4': 'GND' })
    .part('RTRG', 'resistor', 2280, 2020, { value: '1k' }, { '1': 'MT', '2': 'TRG' })
    .part('DMT', 'diode', 2330, 1860, { value: '1N4148' }, { '2': 'CLKP', '1': 'MTP' })
    .part('RMT', 'resistor', 2380, 1920, { value: '61.9k' }, { '1': 'MTP', '2': 'MT' }, 1)
    .part('RMTH', 'resistor', 2440, 1840, { value: '10M' }, { '1': V, '2': 'MT' }, 1)
    .part('CMT', 'capacitor', 2380, 2120, { value: '1u', vmax: '50' }, { '1': 'MT', '2': 'GND' }, 1)
    .part('USQ3', 'comparator', 2500, 1940, { value: 'LM339', pkg: 'SEQ' }, { '3': 'MT', '2': 'VEL', '1': 'CLK', '8': V, '4': 'GND' })
    .part('RCLK', 'resistor', 2600, 1880, { value: '10k' }, { '1': 'CLKP', '2': 'CLK' }, 1)
    .part('RCLD', 'resistor', 2600, 2040, { value: '100k' }, { '1': 'CLK', '2': 'GND' }, 1)
    // the clock filtered (1 ms) against pick-up on its loop through KI's auxiliary; the loop
    // loaded to 5 mA (2.2k), the makers' minimum for a reliable auxiliary contact
    .part('CCLK', 'capacitor', 2680, 2040, { value: '100n', vmax: '50' }, { '1': 'CLK', '2': 'GND' }, 1)
    .part('RCLL', 'resistor', 2680, 1880, { value: '2.2k', pmax: '0.25' }, { '1': 'CLKP', '2': 'GND' }, 1)
    .part('USQ4', 'comparator', 2500, 2120, { value: 'LM339', pkg: 'SEQ' }, { '3': 'MT', '2': 'VEH', '1': 'OI', '8': V, '4': 'GND' })
    .part('RPI', 'resistor', 2600, 2160, { value: '2.2k' }, { '1': V, '2': 'OI' }, 1)
        // KI's driver above the mirror chain (the chain runs to ground): the chain's MOSFETs stay
    // near ground when QI switches off (below it, the chain rode up with the coil's 62 V and their
    // gates, driven from ground, saw −50 V: found in simulation); its own gate clamped to its source
    .part('RGI', 'resistor', 2680, 2200, { value: '10k' }, { '1': 'OI', '2': 'GI' })
    .part('QI', 'nmos', 2760, 2280, { value: 'IRF540N' }, { '1': 'GI', '2': 'KIC', '3': 'KIS' })
    .part('ZGI', 'zener', 2680, 2340, { value: 'BZX55C13' }, { '1': 'GI', '2': 'KIS' }, 1)
    .part('DI', 'diode', 2840, 2160, { value: '1N4007' }, { '2': 'KIC', '1': 'DIZ' }, 3)
    .part('DZI', 'tvs', 2840, 2260, { value: '1.5KE27A' }, { '1': 'DIZ', '2': 'V24C' }, 3)
    // the input contactor: it makes and breaks the input current at every tap change (AC-1, about
    // 0.55 of its rating). Its coil is fed through the thermal cut-out (V24C): a hot transformer
    // is switched off. Its NC auxiliary feeds CLK's pull-up and the timer; its second NC feeds the
    // tap coils (VTF) while it is open; its second NO lets a change hold the sense
    .part('KI', 'contactor', 2950, 2200, { value: vr.ki, aux2: 'true', opsday: '200', life: '1500000', land: 'A1 A2 21 22 31 32 43 44' }, { A1: 'V24C', A2: 'KIC', '1': 'VIN', '2': 'VCH', '21': V, '22': 'CLKP', '31': V24, '32': 'VTF', '43': 'DSHK', '44': 'TRG' })
    // the switched input's snubber, to N (not across the contact): opening KI interrupts the
    // autotransformer's magnetising current, which rings into it. Across the open contact it fed
    // the winding from the input through 220 nF while KI was open, and the winding rang up to
    // 380 V (found in simulation)
    // an X2 film capacitor: it is across the mains whenever KI is closed (the review of 16 November)
    .part('RSKI', 'resistor', 3050, 2300, { value: '100', pmax: '2' }, { '1': 'VCH', '2': 'SNKI' }, 1)
    .part('CSKI', 'capacitor', 3050, 2390, { value: '220n', vmax: '630' }, { '1': 'SNKI', '2': 'N' }, 1)
    .part('CDS', 'capacitor', 2380, 2260, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('XT1', 'terminal', 3150, 2000, { value: 'thermal cut-out of T (NC)' }, { '1': V24 })
    .part('XT2', 'terminal', 3150, 2060, { value: 'thermal cut-out of T, return' }, { '1': 'V24C' });
  nb.block('in the autotransformer').part('STC', 'switch', 3300, 2030, { closed: String(!o.hot) }, { '1': V24, '2': 'V24C' }, 1);

  // ---- output: restart delay, power good, the relay KO and the protection's relay KP in series
  // in the coil feed of the output contactor KM, the output breaker QF2, the terminals. Each
  // relay's unused NC pin is joined to its COM (an open pad has no net, and the board's insulation
  // rules cannot keep the mains copper away from it)
  nb.block('out')
    .part('RD1', 'resistor', 3530, 150, { value: '1M' }, { '1': V, '2': 'DLY' }, 1)
    .part('DDIS', 'diode', 3450, 240, { value: '1N4148' }, { '2': 'DLY', '1': V }, 3)
    .part('CD', 'capacitor', 3530, 360, { value: o.delayC ?? '4.7u', vmax: '63' }, { '1': 'DLY', '2': 'GND' }, 1)
    .part('RT1', 'resistor', 3680, 60, { value: '2.49k' }, { '1': V, '2': 'DTH' }, 1)
    .part('RT2', 'resistor', 3680, 150, { value: '10k' }, { '1': 'DTH', '2': 'GND' }, 1)
    .part('U8', 'comparator', 3680, 280, { value: 'LM339', pkg: 'CMP2' }, { '3': 'DLY', '2': 'DTH', '1': 'OD', '8': V, '4': 'GND' })
    .part('RPD', 'resistor', 3770, 230, { value: '2.2k' }, { '1': V, '2': 'OD' }, 1)
    .part('RBD', 'resistor', 3770, 380, { value: '2.2k' }, { '1': 'OD', '2': 'BD' }, 1)
    .part('QD', 'npn', 3800, 500, { value: 'BD139' }, { '1': 'BD', '2': 'KD', '3': 'GND' })
    .part('DD', 'diode', 3850, 470, { value: '1N4148', labels: 'left' }, { '2': 'KD', '1': V }, 3)
    .part('KO', 'relay', 3900, 410, { value: '12 V 30 A', life: '100000' }, { '1': V, '2': 'KD', '3': V24, '4': V24, '5': 'KMC1' })
    .part('LKO', 'led', 3990, 280, { colour: 'green' }, { '2': V, '1': 'LKOA' }, 1)
    .part('RLKO', 'resistor', 3990, 370, { value: '2.2k' }, { '1': 'LKOA', '2': 'KD' }, 1)
    // power good (CMP2's fourth comparator): low until the sense filter has settled (1M·470n
    // against 80 % of the rail: about 0.76 s); meanwhile the change timer is held, so KI stays
    // open and no tap is connected at power-up
    .part('RPG', 'resistor', 3280, 620, { value: '1M' }, { '1': V, '2': 'PGC' }, 1)
    .part('CPG', 'capacitor', 3280, 760, { value: o.delayC ? '220n' : '470n', vmax: '50' }, { '1': 'PGC', '2': 'GND' }, 1)
    .part('DPGD', 'diode', 3200, 700, { value: '1N4148' }, { '2': 'PGC', '1': V }, 3)
    .part('U8S', 'comparator', 3380, 700, { value: 'LM339', pkg: 'CMP2' }, { '3': 'PGC', '2': 'DTH', '1': 'PGN', '8': V, '4': 'GND' })
    .part('DPG', 'diode', 3480, 760, { value: '1N4148' }, { '2': 'MT', '1': 'PGN' })
    .part('QF2', 'breaker2', 4100, 560, { value: vr.qfo, curve: 'C' }, { '1': 'T5', '2': 'T5Q', N1: 'N', N2: 'NQ' }, 3)
    .part('KM', 'contactor', 4250, 600, { value: vr.ki, land: 'A1 A2' }, { A1: 'KMC', A2: 'GND', '1': 'T5Q', '2': 'OUT', '3': 'NQ', '4': 'NOUT' })
    .part('DKM', 'diode', 4180, 700, { value: '1N4007' }, { '2': 'GND', '1': 'DKZ' }, 3)
    .part('ZKM', 'tvs', 4180, 800, { value: '1.5KE27A' }, { '1': 'DKZ', '2': 'KMC' }, 3)
    .part('X4', 'terminal', 4400, 560, { value: 'L out', wire: vr.wout }, { '1': 'OUT' }, 2)
    .part('X5', 'terminal', 4400, 620, { value: 'N out', wire: vr.wout }, { '1': 'NOUT' }, 2)
    .part('X6', 'terminal', 4400, 680, { value: 'PE', wire: vr.wpe }, { '1': 'GND' }, 2)
    .part('XPE', 'terminal', 4400, 760, { value: 'PE stud (control ground)' }, { '1': 'GND' }, 2);
  if (o.koShorted) nb.block('bench').part('RKOSH', 'resistor', 3830, 560, { value: '1' }, { '1': 'KD', '2': 'GND' });
  if (!o.noLoad) {
    const r = (230 * 230) / (kva * 1000 * (o.share ?? 1)), pf = o.pf ?? 1;
    nb.block('load').note('TEST LOAD (not part of the product)', 4500, 540);
    if (pf >= 1) nb.part('RLOAD', 'resistor', 4550, 640, { value: String(r), pmax: '20k' }, { '1': 'OUT', '2': 'NOUT' }, 1);
    else nb.part('RLOAD', 'resistor', 4550, 640, { value: String(r * pf), pmax: '20k' }, { '1': 'OUT', '2': 'LDM' }, 1)
      .part('LLOAD', 'inductor', 4550, 760, { value: String((r * Math.sqrt(1 - pf * pf)) / (2 * Math.PI * 50)), imax: '200' }, { '1': 'LDM', '2': 'NOUT' }, 1);
  }

  // ---- independent protection (as the 1 kVA unit: own sense transformer on the 230 V tap, own
  // reference, LM393s): outside 190 … 255 V FLTS goes low, KP and KO open, the output contactor
  // opens and the restart delay starts again. The divider (806k; 68k and a 50k trimmer) holds C3's
  // peak for about 4 s, so the gap of a tap change does not trip it
  nb.block('prot').note('OUTPUT PROTECTION (independent of the control)', 0, 2450)
    .part('FT5', 'fuse', -80, 2570, { value: '0.5', r: '0.6', fusetype: 'H' }, { '1': 'T5', '2': 'T5F' })
    .part('TR2', 'transformer', 50, 2570, SENSE_TR400, { '1': 'T5F', '2': 'N', '3': 'SA2', '4': 'SB2' })
    .part('RS2', 'resistor', 160, 2650, { value: '220' }, { '1': 'SA2', '2': 'SN2' }, 1)
    .part('CS2', 'capacitor', 160, 2740, { value: '100n', vmax: '63' }, { '1': 'SN2', '2': 'SB2' }, 1)
    .part('BR2', 'bridge', 270, 2590, { value: 'DB107' }, { '1': 'SA2', '2': 'SB2', '3': 'VSR2', '4': 'GND' })
    .part('C3', 'capacitor_pol', 370, 2590, { value: '4.7u', vmax: '50' }, { '1': 'VSR2', '2': 'GND' }, 1)
    .part('R5', 'resistor', 450, 2520, { value: '806k' }, { '1': 'VSR2', '2': 'SEN2' })
    .part('R6', 'resistor', 520, 2590, { value: '68k' }, { '1': 'SEN2', '2': 'STR2' }, 1)
    .part('RT2C', 'potentiometer', 580, 2680, { value: '50k', pmax: '0.5', position: '64' }, { '1': 'STR2', '2': 'GND', '3': 'GND' })
    .part('R7', 'resistor', 590, 2520, { value: '100k' }, { '1': 'SEN2', '2': 'SF2' })
    .part('C4', 'capacitor', 660, 2590, { value: '470n', vmax: '50' }, { '1': 'SF2', '2': 'GND' }, 1)
    .part('R8', 'resistor', 50, 2850, { value: '2.2k' }, { '1': V, '2': 'VREF2' })
    .part('U9', 'tl431', 150, 2940, { value: 'TL431' }, { '1': 'VREF2', '2': 'GND', '3': 'VREF2' }, 3)
    .part('R9', 'resistor', 250, 2910, { value: '1.82k' }, { '1': 'VREF2', '2': 'VOV' }, 1)
    .part('R10', 'resistor', 250, 3000, { value: '3.65k' }, { '1': 'VOV', '2': 'VUV' }, 1)
    .part('R11', 'resistor', 250, 3090, { value: '10k' }, { '1': 'VUV', '2': 'GND' }, 1)
    .part('U10', 'comparator', 500, 2820, { value: 'LM393', pkg: 'PROT' }, { '3': 'VOV', '2': 'SF2', '1': 'FLTS', '8': V, '4': 'GND' })
    .part('U11', 'comparator', 500, 3000, { value: 'LM393', pkg: 'PROT' }, { '3': 'SF2', '2': 'VUV', '1': 'FLTS', '8': V, '4': 'GND' })
    .part('R12', 'resistor', 620, 2760, { value: '10k' }, { '1': V, '2': 'FLTS' }, 1)
    .part('DF1', 'diode', 750, 2870, { value: '1N4148' }, { '2': 'OD', '1': 'FLTS' })
    .part('DF2', 'diode', 750, 3020, { value: '1N4148' }, { '2': 'DLY', '1': 'DF2K' })
    .part('RDF2', 'resistor', 860, 3020, { value: '2.2k' }, { '1': 'DF2K', '2': 'FLTS' })
    .part('LF', 'led', 880, 2770, { colour: 'red' }, { '2': V, '1': 'LFA' }, 1)
    .part('RLF', 'resistor', 880, 2870, { value: '4.7k' }, { '1': 'LFA', '2': 'FLTS' }, 1)
    // the protection's own relay KP in series with KO in KM's coil feed: it closes about 0.24 s
    // after the protection finds the output in range (a comparator: never a slow RC on a coil)
    // and opens at once on a fault
    .part('RBP', 'resistor', 1000, 2760, { value: '47k' }, { '1': V, '2': 'BPP' }, 1)
    .part('CBP', 'capacitor_pol', 940, 2860, { value: '22u', vmax: '25' }, { '1': 'BPP', '2': 'GND' }, 1)
    .part('DPP', 'diode', 1000, 2870, { value: '1N4148' }, { '2': 'BPP', '1': 'FLTS' })
    .part('UKP', 'comparator', 1100, 2820, { value: 'LM393', pkg: 'PROT2' }, { '3': 'BPP', '2': 'VREF2', '1': 'OKP', '8': V, '4': 'GND' })
    // the package's second comparator: an overvoltage at the 230 V tap also opens KI (a lost
    // neutral: 400 V would saturate the transformer, not only harm the load)
    .part('UKPS', 'comparator', 1250, 3090, { value: 'LM393', pkg: 'PROT2' }, { '3': 'VOV', '2': 'SF2', '1': 'OI', '8': V, '4': 'GND' })
    .part('RPKP', 'resistor', 1160, 2730, { value: '2.2k' }, { '1': V, '2': 'OKP' }, 1)
    .part('RBKP', 'resistor', 1160, 2910, { value: '2.2k' }, { '1': 'OKP', '2': 'BP' }, 1)
    .part('QP', 'npn', 1220, 2820, { value: 'BD139' }, { '1': 'BP', '2': 'KPC', '3': 'GND' })
    .part('DKP', 'diode', 1300, 2730, { value: '1N4148' }, { '2': 'KPC', '1': V }, 3)
    .part('KP', 'relay', 1400, 2730, { value: '12 V 30 A', life: '100000' }, { '1': V, '2': 'KPC', '3': 'KMC1', '4': 'KMC1', '5': 'KMC' })
    .part('CD4', 'capacitor', 1120, 3110, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CD5', 'capacitor', 650, 3190, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  nb.v('VIN').v('OUT').v('SF').v('SF2').v('MS').v('MT');
  nb.sim({ type: 'tran', stop: o.stop ?? '1', step: '200u', start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
