// Worked examples of the power and installation track (decision D20): circuits designed from
// basic catalogue components, each verified by tests against its specification. The sheets are
// drawn as placed parts whose pins carry net labels (GND: a ground symbol), like a SPICE deck
// laid out on the sheet, so large designs stay readable and every connection is explicit.

import { addLabel, placePart } from './editor';
import { annotate, emptySheet, newId, pinPositions, type Probe, type Rot, type Sheet, type SimSettings, type StepSweep } from './schematic';
import type { Example } from './examples';

const COLOURS = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf'];

/** Netlist-style sheet builder: parts at given positions, nets as labels on their pins. */
export class NB {
  s = emptySheet();
  private ids = new Map<string, string>();
  private probes = 0;
  /** Places a part; `key` names it for probes and sweeps (its reference comes from annotation). */
  part(key: string, sym: string, x: number, y: number, props: Record<string, string>, nets: Record<string, string>, rot: Rot = 0): this {
    const r = placePart(this.s, sym, { x, y }, rot, false, props);
    this.s = r.sheet;
    this.ids.set(key, r.id);
    const part = this.s.parts.find((p) => p.id === r.id)!;
    for (const pin of pinPositions(part)) {
      const net = nets[pin.pin];
      if (!net) continue;
      if (net === 'GND') this.s = placePart(this.s, 'gnd', pin.at).sheet;
      else this.s = addLabel(this.s, net, pin.at).sheet;
    }
    return this;
  }
  /** A text note at (x, y). */
  note(text: string, x: number, y: number): this {
    this.s = { ...this.s, labels: [...this.s.labels, { id: newId('l'), name: text, x, y, note: true }] };
    return this;
  }
  /** A voltage probe on the first label of the net. */
  v(net: string): this {
    const l = this.s.labels.find((x) => x.name === net && !x.note);
    if (l) this.s.probes.push({ id: newId('pr'), kind: 'v', at: { x: l.x, y: l.y }, colour: COLOURS[this.probes++ % COLOURS.length] });
    return this;
  }
  /** A current probe at a part's pin. */
  i(key: string, pin: string): this {
    this.s.probes.push({ id: newId('pr'), kind: 'i', part: this.ids.get(key)!, pin, colour: COLOURS[this.probes++ % COLOURS.length] } as Probe);
    return this;
  }
  sim(s: SimSettings): this { this.s.sim = s; return this; }
  /** The annotated sheet, with an optional parameter sweep of a part property (by key). */
  done(step?: { key: string; param?: string; list: string }): Sheet {
    const s = annotate(this.s);
    if (step) {
      const ref = s.parts.find((p) => p.id === this.ids.get(step.key))!.ref;
      const sw: StepSweep = { on: true, ref, param: step.param ?? 'value', mode: 'list', list: step.list, start: '', stop: '', step: '' };
      s.step = sw;
    }
    return s;
  }
  /** Reference of a placed part after annotation. */
  refOf(sheet: Sheet, key: string): string { return sheet.parts.find((p) => p.id === this.ids.get(key))!.ref; }
}

/** The sense transformer: a 1 VA 230/12 V PCB type (magnetising inductance, winding resistances
 *  and leakage of that size). Its leakage inductance rings with the bridge's junction capacitance
 *  each time the bridge stops conducting; 220 Ω + 100 nF across the secondary damp it. */
const SENSE_TR = { value: '0.052', lp: '100', rp: '2k', rs: '20', k: '0.99' };

/** A change of the mains voltage during the run: from `at` (s) the r.m.s. voltage becomes `to`.
 *  Added as a sine source in series with the mains, phase 0 and its delay moved by the phase, so
 *  it starts from zero exactly in phase with its phase of the mains. */
export interface MainsStep { to: number[]; at: number }

/** Single-phase mains / back-up change-over with over- and undervoltage protection. */
export function changeover1(mainsPeak = '325', step?: MainsStep, stop = '1.2'): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const X = (k: number) => k * 110, Y = (k: number) => k * 110;
  nb.note('Single-phase change-over: the load runs from the mains while it is within 195 … 253 V (−15 % / +10 %), otherwise from the back-up source.', X(0), Y(-1))
    .note('Sense: 230/12 V transformer with a 220 Ω + 100 nF snubber, bridge, 4.7 µF and 68k/10k: 2.0 V at 230 V. Window comparator LM393 against a TL431 reference split by 2.1k/4.22k/12.1k (E96).', X(0), Y(-0.75))
    .note('Contactors K1 (mains) and K2 (back-up), 24 V DC coils, each fed through the other one\'s NC contact: never both closed.', X(0), Y(-0.5));
  // sources, each with its breaker
  nb.part('VM', 'vsin', X(0), Y(1), { value: mainsPeak, freq: '50' }, { '1': 'L_MAINS', '2': step ? 'L_STEP' : 'GND' });
  if (step) nb.part('VS', 'vsin', X(0), Y(2), { value: String(Number(((step.to[0] * Math.SQRT2) - Number(mainsPeak)).toPrecision(6))), freq: '50', delay: String(step.at) }, { '1': 'L_STEP', '2': 'GND' });
  nb
    .part('QF1', 'breaker1', X(1), Y(1), { value: '32', curve: 'C' }, { '1': 'L_MAINS', '2': 'L1' })
    .part('VB', 'vsin', X(0), Y(3), { value: '325', freq: '50' }, { '1': 'L_BACKUP', '2': 'GND' })
    .part('QF2', 'breaker1', X(1), Y(3), { value: '32', curve: 'C' }, { '1': 'L_BACKUP', '2': 'L2' });
  // mains sense
  nb.part('TR1', 'transformer', X(2), Y(1), SENSE_TR, { '1': 'L1', '2': 'GND', '3': 'SA', '4': 'SB' })
    .part('RS1', 'resistor', X(2.5), Y(1.5), { value: '220' }, { '1': 'SA', '2': 'SN' })
    .part('CS1', 'capacitor', X(3.5), Y(1.5), { value: '100n', vmax: '63' }, { '1': 'SN', '2': 'SB' })
    .part('BR1', 'bridge', X(3), Y(1), { value: 'DB107' }, { '1': 'SA', '2': 'SB', '3': 'VSR', '4': 'GND' })
    .part('C1', 'capacitor_pol', X(4), Y(1), { value: '4.7u', vmax: '35' }, { '1': 'VSR', '2': 'GND' }, 0)
    .part('R1', 'resistor', X(5), Y(1), { value: '68k' }, { '1': 'VSR', '2': 'SENSE' })
    .part('R2', 'resistor', X(6), Y(1), { value: '10k' }, { '1': 'SENSE', '2': 'GND' }, 1);
  // supply, reference and thresholds
  nb.part('V24', 'vdc', X(0), Y(5), { value: '24' }, { '1': 'V24', '2': 'GND' })
    .part('R3', 'resistor', X(1), Y(5), { value: '3.3k' }, { '1': 'V24', '2': 'VREF' })
    .part('U1', 'tl431', X(2), Y(5), { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' })
    // thresholds against the sense ripple: an overvoltage trip when its peaks pass 2.21 V
    // (253 V), an undervoltage trip when its minima fall below 1.64 V (195 V)
    .part('R4', 'resistor', X(3), Y(5), { value: '2.1k' }, { '1': 'VREF', '2': 'VHI' })
    .part('R5', 'resistor', X(4), Y(5), { value: '4.22k' }, { '1': 'VHI', '2': 'VLO' })
    .part('R6', 'resistor', X(5), Y(5), { value: '12.1k' }, { '1': 'VLO', '2': 'GND' }, 1);
  // window comparator: each output low on a fault; OK (diode AND of both) delayed by R7·C2.
  // Hysteresis only after a trip, through a diode: 33k pulls VHI and 100k pulls SENSE down by
  // about 0.08 V (8 V of mains), more than the 0.06 V sense ripple, so a voltage near a
  // threshold does not chatter: after a trip it reconnects only inside about 205 … 245 V
  nb.part('U2', 'comparator', X(1), Y(7), { value: 'LM393' }, { '3': 'VHI', '2': 'SENSE', '1': 'OVN', '8': 'V24', '4': 'GND' })
    .part('R11', 'resistor', X(0), Y(7), { value: '10k' }, { '1': 'V24', '2': 'OVN' }, 1)
    .part('R12', 'resistor', X(1), Y(8), { value: '33k' }, { '1': 'VHI', '2': 'HOV' })
    .part('D5', 'diode', X(2), Y(8), { value: '1N4148' }, { '2': 'HOV', '1': 'OVN' })
    .part('U3', 'comparator', X(3), Y(7), { value: 'LM393' }, { '3': 'SENSE', '2': 'VLO', '1': 'UVN', '8': 'V24', '4': 'GND' })
    .part('R13', 'resistor', X(4), Y(7), { value: '10k' }, { '1': 'V24', '2': 'UVN' }, 1)
    .part('R14', 'resistor', X(3), Y(8), { value: '100k' }, { '1': 'SENSE', '2': 'HUV' })
    .part('D6', 'diode', X(4), Y(8), { value: '1N4148' }, { '2': 'HUV', '1': 'UVN' })
    .part('D7', 'diode', X(5), Y(8), { value: '1N4148' }, { '2': 'OK', '1': 'OVN' })
    .part('D8', 'diode', X(6), Y(8), { value: '1N4148' }, { '2': 'OK', '1': 'UVN' })
    .part('R7', 'resistor', X(5), Y(7), { value: '10k' }, { '1': 'V24', '2': 'OK' })
    .part('C2', 'capacitor', X(6), Y(7), { value: '4.7u', vmax: '50' }, { '1': 'OK', '2': 'GND' }, 1);
  // drive: Q1 (mains contactor) on with OK, Q2 (back-up) on without it, gates clamped to 12 V;
  // the base divider keeps Q3 off at the 0.7 V low level of the diode AND
  nb.part('R8', 'resistor', X(0), Y(9), { value: '10k' }, { '1': 'OK', '2': 'G1' })
    .part('D1', 'zener', X(1), Y(9), { value: 'BZX55C12' }, { '1': 'G1', '2': 'GND' }, 1)
    .part('Q1', 'nmos', X(2), Y(9), { value: 'IRLZ44N' }, { '1': 'G1', '2': 'K1C', '3': 'GND' })
    .part('R9', 'resistor', X(3), Y(9), { value: '10k' }, { '1': 'OK', '2': 'B3' })
    .part('R15', 'resistor', X(3), Y(10), { value: '10k' }, { '1': 'B3', '2': 'GND' }, 1)
    .part('Q3', 'npn', X(4), Y(9), { value: 'BC547B' }, { '1': 'B3', '2': 'G2', '3': 'GND' })
    .part('R10', 'resistor', X(5), Y(9), { value: '10k' }, { '1': 'V24', '2': 'G2' })
    .part('D4', 'zener', X(6), Y(9), { value: 'BZX55C12' }, { '1': 'G2', '2': 'GND' }, 1)
    .part('Q2', 'nmos', X(7), Y(9), { value: 'IRLZ44N' }, { '1': 'G2', '2': 'K2C', '3': 'GND' });
  // contactors with flyback diodes and the mutual NC interlock
  nb.part('K1', 'contactor', X(1), Y(11), { value: '32 A, coil 24 V DC' }, { A1: 'K1A', A2: 'K1C', '1': 'L1', '2': 'LOAD', '21': 'V24', '22': 'K2A' })
    .part('D2', 'diode', X(0), Y(12), { value: '1N4007' }, { '2': 'K1C', '1': 'K1A' })
    .part('K2', 'contactor', X(4), Y(11), { value: '32 A, coil 24 V DC' }, { A1: 'K2A', A2: 'K2C', '1': 'L2', '2': 'LOAD', '21': 'V24', '22': 'K1A' })
    .part('D3', 'diode', X(3), Y(12), { value: '1N4007' }, { '2': 'K2C', '1': 'K2A' })
    .part('RL', 'resistor', X(7), Y(11), { value: '51', pmax: '1.5k' }, { '1': 'LOAD', '2': 'GND' }, 1);
  nb.v('LOAD').v('SENSE').v('OK').i('K1', '1').i('K2', '1');
  nb.sim({ type: 'tran', stop, step: '200u', start: 'zero' });
  return { sheet: nb.done({ key: 'VM', list: '255 325 382' }), nb };
}

/** Three-phase (3P+N) mains / back-up change-over: over- and undervoltage of any phase, phase
 *  loss and phase asymmetry. `phases`: the r.m.s. voltages of L1, L2, L3 (line to neutral). */
export function changeover3(phases: [number, number, number] = [230, 230, 230], step?: MainsStep, stop = '0.5'): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const X = (k: number) => k * 110, Y = (k: number) => k * 110;
  nb.note('Three-phase change-over (3P+N): the load runs from the mains while every phase is within 195 … 253 V and no phase is more than 10 % below the highest; otherwise from the back-up source.', X(0), Y(-1))
    .note('Each phase: 230/12 V transformer (220 Ω + 100 nF snubber against the leakage-inductance ringing as the bridge turns off), bridge, 4.7 µF and 68k/10k. Over- and undervoltage as in the single-phase design; the highest phase (diode OR) scaled by 768k/100k sets the asymmetry threshold.', X(0), Y(-0.75))
    .note('Nine comparators (three LM339): the overvoltage outputs share OVN, the undervoltage and asymmetry outputs share UVN (open collector). Four-pole contactors switch L1, L2, L3 and N, interlocked through their NC contacts.', X(0), Y(-0.5));
  // mains: three phases 120° apart, neutral earthed (TN); back-up: a three-phase source
  const L = ['1', '2', '3'];
  phases.forEach((v, k) => {
    nb.part(`VM${k + 1}`, 'vsin', X(0), Y(1 + k), { value: String(Number((v * Math.SQRT2).toPrecision(6))), freq: '50', phase: String([0, -120, 120][k]) }, { '1': `LM${k + 1}`, '2': step ? `LS${k + 1}` : 'GND' });
    // the step of each phase: delayed by a further 1/3 and 2/3 period for −120° and +120°
    if (step) nb.part(`VS${k + 1}`, 'vsin', X(-1), Y(1 + k), { value: String(Number(((step.to[k] - v) * Math.SQRT2).toPrecision(6))), freq: '50', delay: String(Number((step.at + k / 150).toPrecision(9))) }, { '1': `LS${k + 1}`, '2': 'GND' });
  });
  nb.part('QF1', 'breaker4', X(1), Y(1), { value: '32', curve: 'C' }, { '1': 'LM1', '2': 'L1', '3': 'LM2', '4': 'L2', '5': 'LM3', '6': 'L3', N1: 'GND', N2: 'NM' })
    .part('VB', 'vsin3', X(0), Y(5), { value: '230', freq: '50' }, { '1': 'LB1', '2': 'LB2', '3': 'LB3', '4': 'GND' })
    .part('QF2', 'breaker4', X(1), Y(5), { value: '32', curve: 'C' }, { '1': 'LB1', '2': 'B1', '3': 'LB2', '4': 'B2', '5': 'LB3', '6': 'B3', N1: 'GND', N2: 'NB' });
  // sense of each phase, and the highest of them
  L.forEach((ph, k) => {
    const y = Y(1 + k);
    nb.part(`TR${ph}`, 'transformer', X(2.5), y, SENSE_TR, { '1': `L${ph}`, '2': 'NM', '3': `SA${ph}`, '4': `SB${ph}` })
      .part(`BR${ph}`, 'bridge', X(3.5), y, { value: 'DB107' }, { '1': `SA${ph}`, '2': `SB${ph}`, '3': `VSR${ph}`, '4': 'GND' })
      .part(`C${ph}`, 'capacitor_pol', X(4.5), y, { value: '4.7u', vmax: '35' }, { '1': `VSR${ph}`, '2': 'GND' })
      .part(`RA${ph}`, 'resistor', X(5.5), y, { value: '68k' }, { '1': `VSR${ph}`, '2': `S${ph}` })
      .part(`RB${ph}`, 'resistor', X(6.5), y, { value: '10k' }, { '1': `S${ph}`, '2': 'GND' }, 1)
      .part(`RS${ph}`, 'resistor', X(3), y + 55, { value: '220' }, { '1': `SA${ph}`, '2': `SN${ph}` })
      .part(`CS${ph}`, 'capacitor', X(4), y + 55, { value: '100n', vmax: '63' }, { '1': `SN${ph}`, '2': `SB${ph}` })
      .part(`DM${ph}`, 'diode', X(7.5), y, { value: '1N4148' }, { '2': `VSR${ph}`, '1': 'VMAX' });
  });
  nb.part('RM1', 'resistor', X(8.5), Y(2), { value: '768k' }, { '1': 'VMAX', '2': 'VAS' })
    .part('RM2', 'resistor', X(8.5), Y(3), { value: '100k' }, { '1': 'VAS', '2': 'GND' }, 1)
    .part('CM', 'capacitor', X(9.5), Y(3), { value: '100n', vmax: '50' }, { '1': 'VAS', '2': 'GND' }, 1);
  // supply, reference and thresholds as in the single-phase design
  nb.part('V24', 'vdc', X(3), Y(5), { value: '24' }, { '1': 'V24', '2': 'GND' })
    .part('R3', 'resistor', X(4), Y(5), { value: '3.3k' }, { '1': 'V24', '2': 'VREF' })
    .part('U1', 'tl431', X(5), Y(5), { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' })
    .part('R4', 'resistor', X(6), Y(5), { value: '2.1k' }, { '1': 'VREF', '2': 'VHI' })
    .part('R5', 'resistor', X(7), Y(5), { value: '4.22k' }, { '1': 'VHI', '2': 'VLO' })
    .part('R6', 'resistor', X(8), Y(5), { value: '12.1k' }, { '1': 'VLO', '2': 'GND' }, 1);
  // per phase: overvoltage (low while S > VHI), undervoltage (low while S < VLO) and asymmetry
  // (low while S < VAS); the undervoltage hysteresis pulls each sense down after a trip
  L.forEach((ph, k) => {
    const x = X(3 * k);
    nb.part(`UO${ph}`, 'comparator', x, Y(7), { value: 'LM339' }, { '3': 'VHI', '2': `S${ph}`, '1': 'OVN', '8': 'V24', '4': 'GND' })
      .part(`UU${ph}`, 'comparator', x + X(1), Y(7), { value: 'LM339' }, { '3': `S${ph}`, '2': 'VLO', '1': 'UVN', '8': 'V24', '4': 'GND' })
      .part(`UA${ph}`, 'comparator', x + X(2), Y(7), { value: 'LM339' }, { '3': `S${ph}`, '2': 'VAS', '1': 'UVN', '8': 'V24', '4': 'GND' })
      .part(`RH${ph}`, 'resistor', x + X(1), Y(8), { value: '100k' }, { '1': `S${ph}`, '2': `HU${ph}` })
      .part(`DH${ph}`, 'diode', x + X(2), Y(8), { value: '1N4148' }, { '2': `HU${ph}`, '1': 'UVN' });
  });
  nb.part('R11', 'resistor', X(9), Y(7), { value: '10k' }, { '1': 'V24', '2': 'OVN' }, 1)
    .part('R13', 'resistor', X(10), Y(7), { value: '10k' }, { '1': 'V24', '2': 'UVN' }, 1)
    .part('R12', 'resistor', X(9), Y(8), { value: '33k' }, { '1': 'VHI', '2': 'HOV' })
    .part('D5', 'diode', X(10), Y(8), { value: '1N4148' }, { '2': 'HOV', '1': 'OVN' })
    .part('D7', 'diode', X(11), Y(7), { value: '1N4148' }, { '2': 'OK', '1': 'OVN' })
    .part('D8', 'diode', X(11), Y(8), { value: '1N4148' }, { '2': 'OK', '1': 'UVN' })
    .part('R7', 'resistor', X(12), Y(7), { value: '10k' }, { '1': 'V24', '2': 'OK' })
    .part('C2', 'capacitor', X(12), Y(8), { value: '4.7u', vmax: '50' }, { '1': 'OK', '2': 'GND' }, 1);
  // drive, as in the single-phase design
  nb.part('R8', 'resistor', X(0), Y(10), { value: '10k' }, { '1': 'OK', '2': 'G1' })
    .part('D1', 'zener', X(1), Y(10), { value: 'BZX55C12' }, { '1': 'G1', '2': 'GND' }, 1)
    .part('Q1', 'nmos', X(2), Y(10), { value: 'IRLZ44N' }, { '1': 'G1', '2': 'K1C', '3': 'GND' })
    .part('R9', 'resistor', X(3), Y(10), { value: '10k' }, { '1': 'OK', '2': 'BQ' })
    .part('R15', 'resistor', X(3), Y(11), { value: '10k' }, { '1': 'BQ', '2': 'GND' }, 1)
    .part('Q3', 'npn', X(4), Y(10), { value: 'BC547B' }, { '1': 'BQ', '2': 'G2', '3': 'GND' })
    .part('R10', 'resistor', X(5), Y(10), { value: '10k' }, { '1': 'V24', '2': 'G2' })
    .part('D4', 'zener', X(6), Y(10), { value: 'BZX55C12' }, { '1': 'G2', '2': 'GND' }, 1)
    .part('Q2', 'nmos', X(7), Y(10), { value: 'IRLZ44N' }, { '1': 'G2', '2': 'K2C', '3': 'GND' });
  // four-pole contactors with flyback diodes and the NC interlock; a 3 × 51 Ω star load
  nb.part('K1', 'contactor', X(1), Y(13), { value: '32 A, coil 24 V DC' }, { A1: 'K1A', A2: 'K1C', '1': 'L1', '2': 'T1', '3': 'L2', '4': 'T2', '5': 'L3', '6': 'T3', '7': 'NM', '8': 'TN', '21': 'V24', '22': 'K2A' })
    .part('D2', 'diode', X(0), Y(14), { value: '1N4007' }, { '2': 'K1C', '1': 'K1A' })
    .part('K2', 'contactor', X(4), Y(13), { value: '32 A, coil 24 V DC' }, { A1: 'K2A', A2: 'K2C', '1': 'B1', '2': 'T1', '3': 'B2', '4': 'T2', '5': 'B3', '6': 'T3', '7': 'NB', '8': 'TN', '21': 'V24', '22': 'K1A' })
    .part('D3', 'diode', X(3), Y(14), { value: '1N4007' }, { '2': 'K2C', '1': 'K2A' });
  L.forEach((ph, k) => nb.part(`RL${ph}`, 'resistor', X(7 + k), Y(13), { value: '51', pmax: '1.5k' }, { '1': `T${ph}`, '2': 'TN' }, 1));
  nb.part('RN', 'resistor', X(10), Y(13), { value: '1M' }, { '1': 'TN', '2': 'GND' }, 1);
  nb.v('T1').v('S1').v('VAS').v('OK').i('K1', '1').i('K2', '1');
  nb.sim({ type: 'tran', stop, step: '200u', start: 'zero' });
  return { sheet: nb.done(), nb };
}

export const POWER_EXAMPLES: Example[] = [
  {
    id: 'changeover-1p', title: 'Mains / back-up change-over with voltage protection (single-phase)', level: 'advanced',
    summary: 'The load runs from the mains while it stays within 195–253 V, otherwise from a back-up source (generator or inverter). Designed from catalogue parts: sense transformer, bridge, LM393 window comparator, TL431 reference, MOSFET drivers and two interlocked 24 V DC contactors.',
    tryThis: 'Simulate: the parameter sweep runs the mains at 180, 230 and 270 V. At 230 V K1 connects the mains (I(K1.1)); at 180 and 270 V K2 connects the back-up. Change the mains source to 340 (240 V) to see it stay on the mains.',
    build: () => changeover1().sheet,
  },
  {
    id: 'changeover-3p', title: 'Mains / back-up change-over with phase monitoring (3P+N)', level: 'advanced',
    summary: 'A three-phase load runs from the mains while every phase stays within 195–253 V and none is more than about 10 % below the highest; a lost phase, an over- or undervoltage or an asymmetry switches it to a three-phase back-up source. Four-pole contactors switch L1, L2, L3 and N; nine LM339 comparators watch the three phases.',
    tryThis: 'Simulate: K1 connects the mains (I(K1.1)). Set the L3 source V3 to 254 (180 V r.m.s.) or to 0 (phase lost) and simulate again: K2 takes over. Set it to 286 (202 V): inside the voltage window, but 12 % below the other phases, so the asymmetry trips.',
    build: () => changeover3().sheet,
  },
];
