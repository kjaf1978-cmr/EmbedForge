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

/** Time constants of the change-over logic. The examples simulate with short ones; the product
 *  values (BOM) are in the notes: return delay 10.5 s (10 µF film), dead time 0.47 s (680 nF). */
export interface TransferTiming { returnC?: string; deadC?: string; v24?: number }

/** Transfer logic of the change-over designs (DFMEA): `OK` (the window comparators' diode AND,
 *  high while the mains is healthy) becomes K1EN / K2EN, the drives of the mains and back-up
 *  contactors, with
 *  - a return delay: the mains must stay healthy for the delay before it is taken back (no
 *    restart storm, no hunting on a flickering supply); a fault acts at once (DRD);
 *  - a dead time between one contactor opening and the other closing (the load's motors and the
 *    other source's voltage decay first; together with the NC interlock never both closed);
 *  - an undervoltage lockout of the coil supply: below 20 V both contactors open instead of
 *    chattering in a brown-out;
 *  - diagnostics: an LED across each coil, and fault LEDs on the over- and undervoltage lines. */
function transferLogic(nb: NB, X: (k: number) => number, Y: (k: number) => number, y0: number, t: TransferTiming) {
  nb.part('R7', 'resistor', X(15), Y(y0 - 2), { value: '10k' }, { '1': 'V24', '2': 'OK' })
    // 10 ms: a sub-cycle glitch of the sense (a step of the mains) is not a fault
    .part('C2', 'capacitor', X(16), Y(y0 - 2), { value: '1u', vmax: '50' }, { '1': 'OK', '2': 'GND' }, 1)
    .part('RTH1', 'resistor', X(0), Y(y0), { value: '10k' }, { '1': 'V24', '2': 'VTH' })
    .part('RTH2', 'resistor', X(0), Y(y0 + 1), { value: '10k' }, { '1': 'VTH', '2': 'GND' }, 1)
    .part('CTH', 'capacitor', X(0.5), Y(y0 + 1), { value: '100n', vmax: '50' }, { '1': 'VTH', '2': 'GND' }, 1)
    // return delay: two 750k in series (no resistor above 1 MΩ: board leakage in humid air)
    .part('RRD1', 'resistor', X(1), Y(y0), { value: '750k' }, { '1': 'OK', '2': 'ORD' })
    .part('RRD2', 'resistor', X(2), Y(y0), { value: '750k' }, { '1': 'ORD', '2': 'OKC' })
    // a fault discharges the delay through DRD and RDS (4.7k: the comparator outputs stay below their 16 mA)
    .part('DRD', 'diode', X(1.5), Y(y0 + 0.6), { value: '1N4148' }, { '2': 'OKC', '1': 'ODS' })
    .part('RDS', 'resistor', X(1), Y(y0 + 1.2), { value: '4.7k' }, { '1': 'ODS', '2': 'OK' })
    .part('CRD', 'capacitor', X(3), Y(y0 + 1), { value: t.returnC ?? '100n', vmax: '50' }, { '1': 'OKC', '2': 'GND' }, 1)
    .part('UD1', 'comparator', X(3), Y(y0), { value: 'LM339' }, { '3': 'OKC', '2': 'VTH', '1': 'OKD', '8': 'V24', '4': 'GND' })
    .part('ROKD', 'resistor', X(4), Y(y0 - 0.6), { value: '10k' }, { '1': 'V24', '2': 'OKD' }, 1)
    .part('UD3', 'comparator', X(4), Y(y0 + 1.2), { value: 'LM339' }, { '3': 'VTH', '2': 'OKD', '1': 'OKDN', '8': 'V24', '4': 'GND' })
    .part('ROKN', 'resistor', X(5), Y(y0 + 1.2), { value: '10k' }, { '1': 'V24', '2': 'OKDN' }, 1);
  // dead times: each contactor closes only after its enable has been steady for 0.47 s (product)
  ([['1', 'OKD'], ['2', 'OKDN']] as const).forEach(([k, src], i) => {
    const x = X(6 + 3 * i);
    nb.part(`RDT${k}`, 'resistor', x, Y(y0), { value: '1M' }, { '1': src, '2': `CDT${k}N` })
      .part(`DDT${k}`, 'diode', x, Y(y0 + 0.6), { value: '1N4148' }, { '2': `CDT${k}N`, '1': `DTS${k}` })
      .part(`RDS${k}`, 'resistor', x, Y(y0 + 1.2), { value: '4.7k' }, { '1': `DTS${k}`, '2': src })
      .part(`CDT${k}`, 'capacitor', x + X(1), Y(y0 + 1), { value: t.deadC ?? '68n', vmax: '50' }, { '1': `CDT${k}N`, '2': 'GND' }, 1)
      .part(`UDT${k}`, 'comparator', x + X(1), Y(y0), { value: 'LM339' }, { '3': `CDT${k}N`, '2': 'VTH', '1': `K${k}EN`, '8': 'V24', '4': 'GND' })
      .part(`REN${k}`, 'resistor', x + X(2), Y(y0 - 0.6), { value: '10k' }, { '1': 'V24', '2': `K${k}EN` }, 1);
  });
  // coil-supply undervoltage lockout: 2.5 V at 20 V (68k/10k)
  nb.part('RUV1', 'resistor', X(12), Y(y0), { value: '68k' }, { '1': 'V24', '2': 'V24S' })
    .part('RUV2', 'resistor', X(12), Y(y0 + 1), { value: '10k' }, { '1': 'V24S', '2': 'GND' }, 1)
    .part('UD5', 'comparator', X(13), Y(y0), { value: 'LM339' }, { '3': 'V24S', '2': 'VREF', '1': 'UVL', '8': 'V24', '4': 'GND' })
    .part('RUVL', 'resistor', X(14), Y(y0 - 0.6), { value: '10k' }, { '1': 'V24', '2': 'UVL' }, 1)
    .part('DU1', 'diode', X(14), Y(y0 + 0.6), { value: '1N4148' }, { '2': 'K1EN', '1': 'UVL' })
    .part('DU2', 'diode', X(15), Y(y0 + 0.6), { value: '1N4148' }, { '2': 'K2EN', '1': 'UVL' });
  // drives, gates clamped to 12 V
  const yd = y0 + 2.5;
  nb.part('R8', 'resistor', X(0), Y(yd), { value: '10k' }, { '1': 'K1EN', '2': 'G1' })
    .part('D1', 'zener', X(1), Y(yd), { value: 'BZX55C12' }, { '1': 'G1', '2': 'GND' }, 1)
    .part('Q1', 'nmos', X(2), Y(yd), { value: 'IRLZ44N' }, { '1': 'G1', '2': 'K1C', '3': 'GND' })
    .part('R10', 'resistor', X(4), Y(yd), { value: '10k' }, { '1': 'K2EN', '2': 'G2' })
    .part('D4', 'zener', X(5), Y(yd), { value: 'BZX55C12' }, { '1': 'G2', '2': 'GND' }, 1)
    .part('Q2', 'nmos', X(6), Y(yd), { value: 'IRLZ44N' }, { '1': 'G2', '2': 'K2C', '3': 'GND' })
    // diagnostics
    .part('LK1', 'led', X(8), Y(yd), { value: 'green' }, { '2': 'LK1A', '1': 'K1C' })
    .part('RLK1', 'resistor', X(8), Y(yd - 0.6), { value: '4.7k' }, { '1': 'K1A', '2': 'LK1A' })
    .part('LK2', 'led', X(9), Y(yd), { value: 'yellow' }, { '2': 'LK2A', '1': 'K2C' })
    .part('RLK2', 'resistor', X(9), Y(yd - 0.6), { value: '4.7k' }, { '1': 'K2A', '2': 'LK2A' })
    .part('LOV', 'led', X(10), Y(yd), { value: 'red' }, { '2': 'LOVA', '1': 'OVN' })
    .part('RLOV', 'resistor', X(10), Y(yd - 0.6), { value: '4.7k' }, { '1': 'V24', '2': 'LOVA' })
    .part('LUV', 'led', X(11), Y(yd), { value: 'red' }, { '2': 'LUVA', '1': 'UVN' })
    .part('RLUV', 'resistor', X(11), Y(yd - 0.6), { value: '4.7k' }, { '1': 'V24', '2': 'LUVA' });
}

/** Single-phase mains / back-up change-over with over- and undervoltage protection. */
export function changeover1(mainsPeak = '325', step?: MainsStep, stop = '1.2', t: TransferTiming = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const X = (k: number) => k * 110, Y = (k: number) => k * 110;
  nb.note('Single-phase change-over: the load runs from the mains while it is within 195 … 253 V (−15 % / +10 %), otherwise from the back-up source.', X(0), Y(-1))
    .note('Sense: 230/12 V transformer with a 220 Ω + 100 nF snubber, bridge, 4.7 µF and 68k/10k: 2.0 V at 230 V. Window comparator LM393 against a TL431 reference split by 2.1k/4.22k/12.1k (E96).', X(0), Y(-0.75))
    .note('Contactors K1 (mains) and K2 (back-up), 24 V DC coils, each fed through the other one\'s NC contact: never both closed. Return delay, dead time and coil-supply lockout (DFMEA): the example simulates 0.1 s and 47 ms; the product uses 10 µF and 680 nF film capacitors (10.5 s, 0.47 s).', X(0), Y(-0.5));
  // sources, each with its breaker
  nb.part('VM', 'vsin', X(0), Y(1), { value: mainsPeak, freq: '50' }, { '1': 'L_MAINS', '2': step ? 'L_STEP' : 'GND' });
  if (step) nb.part('VS', 'vsin', X(0), Y(2), { value: String(Number(((step.to[0] * Math.SQRT2) - Number(mainsPeak)).toPrecision(6))), freq: '50', delay: String(step.at) }, { '1': 'L_STEP', '2': 'GND' });
  nb
    .part('QF1', 'breaker1', X(1), Y(1), { value: '32', curve: 'C' }, { '1': 'L_MAINS', '2': 'L1' })
    .part('VB', 'vsin', X(0), Y(3), { value: '325', freq: '50' }, { '1': 'L_BACKUP', '2': 'GND' })
    .part('QF2', 'breaker1', X(1), Y(3), { value: '32', curve: 'C' }, { '1': 'L_BACKUP', '2': 'L2' })
    // surge protection of both inputs (type 3, 300 V AC)
    .part('RV1', 'mov', X(1.5), Y(2), { value: '14D471K' }, { '1': 'L1', '2': 'GND' }, 1)
    .part('RV2', 'mov', X(1.5), Y(4), { value: '14D471K' }, { '1': 'L2', '2': 'GND' }, 1);
  // mains sense
  nb.part('TR1', 'transformer', X(2), Y(1), SENSE_TR, { '1': 'L1', '2': 'GND', '3': 'SA', '4': 'SB' })
    .part('RS1', 'resistor', X(2.5), Y(1.5), { value: '220' }, { '1': 'SA', '2': 'SN' })
    .part('CS1', 'capacitor', X(3.5), Y(1.5), { value: '100n', vmax: '63' }, { '1': 'SN', '2': 'SB' })
    .part('BR1', 'bridge', X(3), Y(1), { value: 'DB107' }, { '1': 'SA', '2': 'SB', '3': 'VSR', '4': 'GND' })
    .part('C1', 'capacitor_pol', X(4), Y(1), { value: '4.7u', vmax: '35' }, { '1': 'VSR', '2': 'GND' }, 0)
    .part('R1', 'resistor', X(5), Y(1), { value: '68k' }, { '1': 'VSR', '2': 'SENSE' })
    .part('R2', 'resistor', X(6), Y(1), { value: '10k' }, { '1': 'SENSE', '2': 'GND' }, 1);
  // supply, reference and thresholds
  nb.part('V24', 'vdc', X(0), Y(5), { value: String(t.v24 ?? 24) }, { '1': 'V24', '2': 'GND' })
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
    .part('D8', 'diode', X(6), Y(8), { value: '1N4148' }, { '2': 'OK', '1': 'UVN' });
  transferLogic(nb, X, Y, 9, t);
  // contactors with flyback diodes and the mutual NC interlock
  nb.part('K1', 'contactor', X(1), Y(14), { value: '32 A, coil 24 V DC' }, { A1: 'K1A', A2: 'K1C', '1': 'L1', '2': 'LOAD', '21': 'V24', '22': 'K2A' })
    .part('D2', 'diode', X(0), Y(15), { value: '1N4007' }, { '2': 'K1C', '1': 'K1A' })
    .part('K2', 'contactor', X(4), Y(14), { value: '32 A, coil 24 V DC' }, { A1: 'K2A', A2: 'K2C', '1': 'L2', '2': 'LOAD', '21': 'V24', '22': 'K1A' })
    .part('D3', 'diode', X(3), Y(15), { value: '1N4007' }, { '2': 'K2C', '1': 'K2A' })
    .part('RL', 'resistor', X(7), Y(14), { value: '51', pmax: '1.5k' }, { '1': 'LOAD', '2': 'GND' }, 1);
  nb.v('LOAD').v('SENSE').v('OK').i('K1', '1').i('K2', '1');
  nb.sim({ type: 'tran', stop, step: '200u', start: 'zero' });
  return { sheet: nb.done({ key: 'VM', list: '255 325 382' }), nb };
}

/** Three-phase (3P+N) mains / back-up change-over: over- and undervoltage of any phase, phase
 *  loss and phase asymmetry. `phases`: the r.m.s. voltages of L1, L2, L3 (line to neutral). */
export function changeover3(phases: [number, number, number] = [230, 230, 230], step?: MainsStep, stop = '0.5', t: TransferTiming = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const X = (k: number) => k * 110, Y = (k: number) => k * 110;
  nb.note('Three-phase change-over (3P+N): the load runs from the mains while every phase is within 195 … 253 V and no phase is more than 10 % below the highest; otherwise from the back-up source.', X(0), Y(-1))
    .note('Each phase: 230/12 V transformer (220 Ω + 100 nF snubber against the leakage-inductance ringing as the bridge turns off), bridge, 4.7 µF and 68k/10k. Over- and undervoltage as in the single-phase design; the highest phase (diode OR) scaled by 768k/100k sets the asymmetry threshold.', X(0), Y(-0.75))
    .note('Nine comparators (three LM339): the overvoltage outputs share OVN, the undervoltage and asymmetry outputs share UVN (open collector). Four-pole contactors switch L1, L2, L3 and N, interlocked through their NC contacts. Return delay, dead time and coil-supply lockout as in the single-phase design.', X(0), Y(-0.5));
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
  // surge protection of every phase of both sources (type 3, 300 V AC)
  L.forEach((ph, k) => nb.part(`RVM${ph}`, 'mov', X(-2), Y(1 + k), { value: '14D471K' }, { '1': `L${ph}`, '2': 'NM' }, 1)
    .part(`RVB${ph}`, 'mov', X(-2), Y(5 + k), { value: '14D471K' }, { '1': `B${ph}`, '2': 'NB' }, 1));
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
  nb.part('V24', 'vdc', X(3), Y(5), { value: String(t.v24 ?? 24) }, { '1': 'V24', '2': 'GND' })
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
    .part('D8', 'diode', X(11), Y(8), { value: '1N4148' }, { '2': 'OK', '1': 'UVN' });
  transferLogic(nb, X, Y, 10, t);
  // four-pole contactors with flyback diodes and the NC interlock; a 3 × 51 Ω star load
  nb.part('K1', 'contactor', X(1), Y(15), { value: '32 A, coil 24 V DC' }, { A1: 'K1A', A2: 'K1C', '1': 'L1', '2': 'T1', '3': 'L2', '4': 'T2', '5': 'L3', '6': 'T3', '7': 'NM', '8': 'TN', '21': 'V24', '22': 'K2A' })
    .part('D2', 'diode', X(0), Y(16), { value: '1N4007' }, { '2': 'K1C', '1': 'K1A' })
    .part('K2', 'contactor', X(4), Y(15), { value: '32 A, coil 24 V DC' }, { A1: 'K2A', A2: 'K2C', '1': 'B1', '2': 'T1', '3': 'B2', '4': 'T2', '5': 'B3', '6': 'T3', '7': 'NB', '8': 'TN', '21': 'V24', '22': 'K1A' })
    .part('D3', 'diode', X(3), Y(16), { value: '1N4007' }, { '2': 'K2C', '1': 'K2A' });
  L.forEach((ph, k) => nb.part(`RL${ph}`, 'resistor', X(7 + k), Y(15), { value: '51', pmax: '1.5k' }, { '1': `T${ph}`, '2': 'TN' }, 1));
  nb.part('RN', 'resistor', X(10), Y(15), { value: '1M' }, { '1': 'TN', '2': 'GND' }, 1);
  nb.v('T1').v('S1').v('VAS').v('OK').i('K1', '1').i('K2', '1');
  nb.sim({ type: 'tran', stop, step: '200u', start: 'zero' });
  return { sheet: nb.done(), nb };
}

/** Input voltages at which the stabiliser steps to the next tap (r.m.s.), and its taps. */
export const STAB_STEPS = [160, 180, 200, 220, 240, 265];
export const STAB_TAPS = [150, 170, 190, 210, 230, 250, 280];
/** The reference ladder of the stabiliser, from GND up to VREF (E96). */
const STAB_LADDER = ['5.36k', '732', '732', '732', '732', '909', '787'];

/** Relay-switched mains voltage stabiliser (step-type AVR): the input feeds one tap of a tapped
 *  autotransformer, the output is taken from its 230 V tap, so V_out = V_in·230/tap. `vin`: input
 *  r.m.s. voltage. */
export function stabiliser(vin = 230, step?: MainsStep, stop = '1', ladder = STAB_LADDER, o: { delayC?: string } = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const X = (k: number) => k * 110, Y = (k: number) => k * 110;
  nb.note('Relay-switched stabiliser: the input is connected to one tap of a 1 kVA autotransformer (150 … 280 V) and the output taken from its 230 V tap: V_out = V_in·230/tap, within about ±6 % for 140 … 300 V in.', X(0), Y(-1))
    .note('Six 12 V relays in a chain choose the tap: each relay\'s NC contact feeds the next relay, so two taps are never connected, not even while a relay changes over.', X(0), Y(-0.75))
    .note('LM339 comparators against a TL431 ladder (E96) switch at 160 / 180 / 200 / 220 / 240 / 265 V of input; 1 MΩ feedback gives each a hysteresis of about 3 V. An output relay connects the load after a restart delay, and an independent cut-off opens it outside 190 … 255 V (DFMEA). LEDs: relay states, OUTPUT, FAULT.', X(0), Y(-0.5));
  nb.part('VIN', 'vsin', X(0), Y(1), { value: String(Number((vin * Math.SQRT2).toPrecision(6))), freq: '50' }, { '1': 'L_IN', '2': step ? 'L_STEP' : 'GND' });
  if (step) nb.part('VS', 'vsin', X(0), Y(2), { value: String(Number(((step.to[0] - vin) * Math.SQRT2).toPrecision(6))), freq: '50', delay: String(step.at) }, { '1': 'L_STEP', '2': 'GND' });
  nb.part('QF1', 'breaker1', X(1), Y(1), { value: '10', curve: 'C' }, { '1': 'L_IN', '2': 'VIN' })
    // surge protection inside the unit (type 3), 300 V AC: survives a lost neutral (up to 400 V)
    // only for seconds, so the output cut-off below protects the load meanwhile
    .part('RV1', 'mov', X(1.5), Y(2), { value: '14D471K' }, { '1': 'VIN', '2': 'GND' }, 1);
  // input sense, filtered to the mean (τ 47 ms) so the ripple does not reach the comparators
  nb.part('TR1', 'transformer', X(2), Y(1), SENSE_TR, { '1': 'VIN', '2': 'GND', '3': 'SA', '4': 'SB' })
    .part('RS1', 'resistor', X(2.5), Y(1.5), { value: '220' }, { '1': 'SA', '2': 'SN' })
    .part('CS1', 'capacitor', X(3.5), Y(1.5), { value: '100n', vmax: '63' }, { '1': 'SN', '2': 'SB' })
    .part('BR1', 'bridge', X(3), Y(1), { value: 'DB107' }, { '1': 'SA', '2': 'SB', '3': 'VSR', '4': 'GND' })
    .part('C1', 'capacitor_pol', X(4), Y(1), { value: '4.7u', vmax: '35' }, { '1': 'VSR', '2': 'GND' })
    .part('R1', 'resistor', X(5), Y(1), { value: '68k' }, { '1': 'VSR', '2': 'SENSE' })
    .part('R2', 'resistor', X(6), Y(1), { value: '10k' }, { '1': 'SENSE', '2': 'GND' }, 1)
    .part('R3', 'resistor', X(7), Y(1), { value: '100k' }, { '1': 'SENSE', '2': 'SF' })
    .part('C2', 'capacitor', X(8), Y(1), { value: '470n', vmax: '50' }, { '1': 'SF', '2': 'GND' }, 1);
  // supply and reference ladder: N1 … N6, one threshold per step
  nb.part('V12', 'vdc', X(0), Y(3), { value: '12' }, { '1': 'V12', '2': 'GND' })
    .part('R4', 'resistor', X(1), Y(3), { value: '2.2k' }, { '1': 'V12', '2': 'VREF' })
    .part('U1', 'tl431', X(2), Y(3), { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' });
  const lad = ['GND', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'VREF'];
  ladder.forEach((r, k) => nb.part(`RL${k + 1}`, 'resistor', X(3 + k), Y(3), { value: r }, { '1': lad[k + 1], '2': lad[k] }, 1));
  // per step k: relay k is on while the input is below its threshold (the comparator output is
  // released: SF below Nk); the first relay that is on in the chain connects its tap
  const chain = ['VIN', 'C2N', 'C3N', 'C4N', 'C5N', 'C6N'];
  for (let k = 0; k < 6; k++) {
    const n = k + 1, x = X(2 * k), y = Y(5);
    nb.part(`U${n + 1}`, 'comparator', x, y, { value: 'LM339' }, { '3': `N${n}`, '2': 'SF', '1': `O${n}`, '8': 'V12', '4': 'GND' })
      .part(`RP${n}`, 'resistor', x + X(1), y, { value: '2.2k' }, { '1': 'V12', '2': `O${n}` }, 1)
      .part(`RF${n}`, 'resistor', x, y + Y(1), { value: '1M' }, { '1': `O${n}`, '2': `N${n}` })
      .part(`RB${n}`, 'resistor', x + X(1), y + Y(1), { value: '2.2k' }, { '1': `O${n}`, '2': `B${n}` })
      .part(`Q${n}`, 'npn', x, y + Y(2), { value: 'BD139' }, { '1': `B${n}`, '2': `K${n}`, '3': 'GND' })
      .part(`D${n}`, 'diode', x + X(1), y + Y(2), { value: '1N4148' }, { '2': `K${n}`, '1': 'V12' })
      // diagnostics: an LED beside each coil shows which relay is energised
      .part(`LK${n}`, 'led', x, y + Y(4.6), { value: 'yellow' }, { '2': 'V12', '1': `LKA${n}` })
      .part(`RLK${n}`, 'resistor', x + X(1), y + Y(4.6), { value: '2.2k' }, { '1': `LKA${n}`, '2': `K${n}` })
      // 30 A relays for a 4.5 A load: contact wear, the main field failure of stabilisers, falls
      // with about the square of the margin (more than 1 million operations here)
      .part(`K${n}`, 'relay', x, y + Y(3.3), { value: '12 V 30 A' }, { '1': 'V12', '2': `K${n}`, '3': chain[k], '5': `T${n}`, '4': k < 5 ? chain[k + 1] : 'T7' })
      // contact protection: an RC (100 Ω + 100 nF X2) across each contact takes the winding's
      // current while the contact opens, instead of an arc that erodes it
      .part(`RSA${n}`, 'resistor', x + X(1), y + Y(5.4), { value: '100', pmax: '1' }, { '1': chain[k], '2': `SNA${n}` })
      .part(`CSA${n}`, 'capacitor', x + X(1), y + Y(6), { value: '100n', vmax: '630' }, { '1': `SNA${n}`, '2': `T${n}` }, 1)
      .part(`RSC${n}`, 'resistor', x, y + Y(5.4), { value: '100', pmax: '1' }, { '1': chain[k], '2': `SNC${n}` })
      .part(`CSC${n}`, 'capacitor', x, y + Y(6), { value: '100n', vmax: '630' }, { '1': `SNC${n}`, '2': k < 5 ? chain[k + 1] : 'T7' }, 1);
  }
  // the autotransformer and the load: 1 kVA at 230 V
  nb.part('T1', 'autotransformer', X(10), Y(1), { value: '1 kVA 230 V, taps 150–280 V' }, { N: 'GND', T1: 'T1', T2: 'T2', T3: 'T3', T4: 'T4', T5: 'T5', T6: 'T6', T7: 'T7' })
    .part('RLOAD', 'resistor', X(11), Y(1), { value: '56', pmax: '1.5k' }, { '1': 'OUT', '2': 'GND' }, 1);
  // output delay: the load is connected only once the control has settled after power-on (the
  // sense filter starts empty, so every relay is on at first and the 150 V tap is chosen);
  // 1 MΩ·1.5 µF against VREF: 0.35 s here, 3 … 180 s in a stabiliser for appliances
  // restart delay after power-on and after any cut-off: 1 MΩ (two 470k + 68k in the product,
  // below the leakage of a humid board) and a 47 µF film capacitor: 11 s (simulations of the
  // example use 1.5 µF, 0.35 s)
  nb.part('RD', 'resistor', X(0), Y(9.5), { value: '1M' }, { '1': 'V12', '2': 'DLY' })
    .part('CD', 'capacitor', X(1), Y(9.5), { value: o.delayC ?? '1.5u', vmax: '25' }, { '1': 'DLY', '2': 'GND' }, 1)
    .part('U8', 'comparator', X(2), Y(9.5), { value: 'LM339' }, { '3': 'DLY', '2': 'VREF', '1': 'OD', '8': 'V12', '4': 'GND' })
    .part('RPD', 'resistor', X(3), Y(9.5), { value: '2.2k' }, { '1': 'V12', '2': 'OD' }, 1)
    .part('RBD', 'resistor', X(3), Y(10.5), { value: '2.2k' }, { '1': 'OD', '2': 'BD' })
    .part('QD', 'npn', X(4), Y(10.5), { value: 'BD139' }, { '1': 'BD', '2': 'KD', '3': 'GND' })
    .part('DD', 'diode', X(5), Y(10.5), { value: '1N4148' }, { '2': 'KD', '1': 'V12' })
    .part('KO', 'relay', X(6), Y(10), { value: '12 V 30 A' }, { '1': 'V12', '2': 'KD', '3': 'T5', '5': 'OUT' })
    .part('LKO', 'led', X(7), Y(10.5), { value: 'green' }, { '2': 'V12', '1': 'LKOA' })
    .part('RLKO', 'resistor', X(7), Y(11), { value: '2.2k' }, { '1': 'LKOA', '2': 'KD' });
  // independent output protection (its own sense transformer, reference and comparators): the
  // 230 V tap must stay within 190 … 255 V, or the output relay opens and the restart delay
  // starts again; a welded tap relay or a failed control cannot put the load out of range
  nb.part('TR2', 'transformer', X(8), Y(12), SENSE_TR, { '1': 'T5', '2': 'GND', '3': 'SA2', '4': 'SB2' })
    .part('RS2', 'resistor', X(8.5), Y(12.5), { value: '220' }, { '1': 'SA2', '2': 'SN2' })
    .part('CS2', 'capacitor', X(9.5), Y(12.5), { value: '100n', vmax: '63' }, { '1': 'SN2', '2': 'SB2' })
    .part('BR2', 'bridge', X(9), Y(12), { value: 'DB107' }, { '1': 'SA2', '2': 'SB2', '3': 'VSR2', '4': 'GND' })
    .part('C3', 'capacitor_pol', X(10), Y(12), { value: '4.7u', vmax: '35' }, { '1': 'VSR2', '2': 'GND' })
    .part('R5', 'resistor', X(11), Y(12), { value: '68k' }, { '1': 'VSR2', '2': 'SEN2' })
    .part('R6', 'resistor', X(12), Y(12), { value: '10k' }, { '1': 'SEN2', '2': 'GND' }, 1)
    .part('R7', 'resistor', X(13), Y(12), { value: '100k' }, { '1': 'SEN2', '2': 'SF2' })
    .part('C4', 'capacitor', X(14), Y(12), { value: '470n', vmax: '50' }, { '1': 'SF2', '2': 'GND' }, 1)
    .part('R8', 'resistor', X(8), Y(14), { value: '2.2k' }, { '1': 'V12', '2': 'VREF2' })
    .part('U9', 'tl431', X(9), Y(14), { value: 'TL431' }, { '1': 'VREF2', '2': 'GND', '3': 'VREF2' })
    .part('R9', 'resistor', X(10), Y(14), { value: '1.82k' }, { '1': 'VREF2', '2': 'VOV' })
    .part('R10', 'resistor', X(11), Y(14), { value: '3.65k' }, { '1': 'VOV', '2': 'VUV' })
    .part('R11', 'resistor', X(12), Y(14), { value: '10k' }, { '1': 'VUV', '2': 'GND' }, 1)
    .part('U10', 'comparator', X(10), Y(15), { value: 'LM339' }, { '3': 'VOV', '2': 'SF2', '1': 'FLTS', '8': 'V12', '4': 'GND' })
    .part('U11', 'comparator', X(11), Y(15), { value: 'LM339' }, { '3': 'SF2', '2': 'VUV', '1': 'FLTS', '8': 'V12', '4': 'GND' })
    .part('R12', 'resistor', X(12), Y(15), { value: '10k' }, { '1': 'V12', '2': 'FLTS' }, 1)
    .part('DF1', 'diode', X(13), Y(15), { value: '1N4148' }, { '2': 'OD', '1': 'FLTS' })
    .part('DF2', 'diode', X(13), Y(16), { value: '1N4148' }, { '2': 'DLY', '1': 'FLTS' })
    .part('LF', 'led', X(14), Y(15), { value: 'red' }, { '2': 'V12', '1': 'LFA' })
    .part('RLF', 'resistor', X(14), Y(16), { value: '2.2k' }, { '1': 'LFA', '2': 'FLTS' });
  nb.v('VIN').v('OUT').v('SF').v('SF2').i('RLOAD', '1');
  nb.sim({ type: 'tran', stop, step: '200u', start: 'zero' });
  return { sheet: nb.done(), nb };
}

/** Options of the MPPT charger. `g`: irradiance (W/m²); `vbat`: battery open-circuit voltage;
 *  `comp`: compensation of the three error amplifiers (R in series with C in the feedback). */
/** `tbat`, `theatsink`: temperatures of the battery and the heatsink at their NTC sensors (°C). */
export interface ChargerOptions {
  g?: number; vbat?: number; stop?: string; comp?: { rf: string; cf: string }; temp?: number; timerC?: string; tbat?: number; theatsink?: number;
  /** Auxiliary supply voltage (in the product fed from the battery through a diode: 0 with a reversed battery). */
  aux?: number;
  /** Reversed battery or PV array (fault cases). */
  batteryReversed?: boolean; pvReversed?: boolean;
  /** The battery's BMS opens its contactor at this time (s), during charging (fault case). */
  bmsOpenAt?: number;
  /** Current-limit resistor from IREF to GND for small batteries (15k: 48 A for 100 Ah). */
  rlim?: string;
}

/** Solar battery charger, one 3.7 kW unit: PV array (3 strings of 3 × 410 Wp) → buck converter
 *  → 48 V LiFePO4 battery (16 cells). Analogue control: the PV voltage is held at the array's
 *  maximum-power voltage (constant-voltage MPPT), the battery voltage limited to 56.6 V
 *  (3.54 V per cell) and the charge current to 80 A; the lowest of the three error amplifiers
 *  sets the duty cycle. */
export function mpptCharger(o: ChargerOptions = {}): { sheet: Sheet; nb: NB } {
  const g = o.g ?? 1000, vbat = o.vbat ?? 52;
  // each power semiconductor on its own heatsink area: 0.5 K/W pad + 1.0 K/W share of the
  // heatsink (one extruded profile of 0.33 K/W for all three, natural convection)
  const HS = '1.5';
  const nb = new NB();
  const X = (k: number) => k * 110, Y = (k: number) => k * 110;
  nb.note('MPPT solar charger, one 3.7 kW unit: 9 × 410 Wp (3 in series, 3 strings) into a 48 V LiFePO4 battery through a 20 kHz buck converter (IRFP4668, STTH6003, 56 µH, film capacitors), a 100 A battery fuse and an ideal diode in the battery\'s negative lead.', X(0), Y(-1))
    .note('Protections (DFMEA): reversed PV or battery, reverse current, battery cut off by its BMS (fast stop, TVS), independent overvoltage latch at 57.6 V (Q1 shorted), battery 0 … 50 °C, heatsink 90 °C, surge varistor. LEDs: CHARGING, FAULT.', X(0), Y(-1.25))
    .note('Control from discrete parts: 555 ramp and LM393 PWM comparator, IR2184-type driver with bootstrap supply; average current-mode control: an inner current loop, its reference (80 A at most) lowered through transistors by the MPPT loop (PV held at 0.826 × its open-circuit voltage, sampled every 10 s) and the CV loop (battery at most 56.6 V, 3.54 V per cell).', X(0), Y(-0.75))
    .note('Sizing (LiFePO4 48 V, charge ≤ 0.5 C): 5 kWh / 100 Ah: 1 unit with RLIM 15k (48 A). 10 kWh: 1 unit (80 A). 15 kWh: 2 units. 20 kWh: 2 units. 30 kWh / 600 Ah: 3 units (240 A, 0.4 C). Each unit has its own 3.7 kWp array (about 16 kWh a day in the tropics) and connects to the battery bus through its fuse; the ideal diodes keep units from feeding each other.', X(0), Y(-0.5));
  // power stage
  // PV input: varistor against surges from the array (type 3; the array needs its own DC SPD),
  // and QPV in the negative lead: on only while the PV is connected the right way round (its
  // gate is fed from PV+), so a reversed array is blocked; the fault latch turns it off too
  nb.part('PV', 'pv', X(0), Y(1), { value: '410 Wp, 108 half-cells mono', ns: '3', np: '3', g: String(g) }, o.pvReversed ? { '1': 'PVN', '2': 'PVP' } : { '1': 'PVP', '2': 'PVN' })
    .part('RVPV', 'mov', X(-1), Y(1), { value: '14D201K' }, { '1': 'PVP', '2': 'PVN' })
    // QPV2, back to back with QPV (common source SPV): QPV blocks a reversed array, QPV2 lets
    // the fault latch cut a correctly connected one off too
    .part('QPV', 'nmos', X(0), Y(2.5), { value: 'IRFP4668', heatsink: HS }, { '1': 'GPV', '2': 'PVN', '3': 'SPV' })
    .part('QPV2', 'nmos', X(0), Y(3.5), { value: 'IRFP4668', heatsink: HS }, { '1': 'GPV', '2': 'GND', '3': 'SPV' })
    .part('RGPV', 'resistor', X(-1), Y(2.5), { value: '470k' }, { '1': 'PVP', '2': 'GPV' })
    .part('DZPV', 'zener', X(-1), Y(3.2), { value: 'BZX55C12' }, { '1': 'GPV', '2': 'SPV' }, 1)
    // on a fault the optocoupler holds the gates at SPV: SPV floats against GND until the
    // FETs conduct, so a transistor driven from the GND-referenced fault line would hold them off
    .part('OPV', 'opto', X(1), Y(2.8), { value: 'PC817' }, { '1': 'FLT2', '2': 'LFA2', '4': 'GPV', '3': 'SPV' })
    // input capacitors: film (no electrolyte to dry out in a hot enclosure), 4 × 47 µF / 250 V
    .part('CIN1', 'capacitor', X(1), Y(1), { value: '47u', vmax: '250' }, { '1': 'PVP', '2': 'GND' }, 1)
    .part('CIN2', 'capacitor', X(1.3), Y(1), { value: '47u', vmax: '250' }, { '1': 'PVP', '2': 'GND' }, 1)
    .part('CIN3', 'capacitor', X(1.6), Y(1), { value: '47u', vmax: '250' }, { '1': 'PVP', '2': 'GND' }, 1)
    .part('CIN4', 'capacitor', X(1.9), Y(1), { value: '47u', vmax: '250' }, { '1': 'PVP', '2': 'GND' }, 1)
    .part('Q1', 'nmos', X(2.5), Y(1), { value: 'IRFP4668', heatsink: HS }, { '1': 'G1', '2': 'PVP', '3': 'SW' })
    .part('D1', 'diode', X(3), Y(2), { value: 'STTH6003', heatsink: HS }, { '1': 'SW', '2': 'GND' }, 1)
    // snubber: damps the ringing of L1 with the diode's capacitance in discontinuous conduction
    .part('RSN', 'resistor', X(2), Y(2.5), { value: '220', pmax: '1' }, { '1': 'SW', '2': 'SNB' })
    .part('CSN', 'capacitor', X(2), Y(3.2), { value: '1n', vmax: '630' }, { '1': 'SNB', '2': 'GND' }, 1)
    .part('L1', 'inductor', X(3), Y(1), { value: '56u', imax: '100' }, { '1': 'SW', '2': 'VO' })
    .part('COUT1', 'capacitor', X(4), Y(2), { value: '47u', vmax: '100' }, { '1': 'VO', '2': 'GND' }, 1)
    .part('COUT2', 'capacitor', X(4.3), Y(2), { value: '47u', vmax: '100' }, { '1': 'VO', '2': 'GND' }, 1)
    .part('COUT3', 'capacitor', X(4.6), Y(2), { value: '47u', vmax: '100' }, { '1': 'VO', '2': 'GND' }, 1)
    // the inductor's energy when a BMS cuts the battery off during charging
    .part('DTV', 'tvs', X(4.9), Y(2), { value: '5KP64A' }, { '1': 'VO', '2': 'GND' }, 1)
    .part('FB', 'fuse', X(4.5), Y(1), { value: '100', r: '0.3m' }, { '1': 'VO', '2': o.bmsOpenAt ? 'BMSI' : 'BATP' })
    .part('BAT', 'battery', X(5.5), Y(1), { value: String(vbat), rint: '0.02' }, o.batteryReversed ? { '1': 'BNB', '2': 'BATP' } : { '1': 'BATP', '2': 'BNB' })
    // QB2, back to back with QB (common source): on unless the independent overvoltage latch has
    // tripped; then its body diode blocks the charge current too and the battery is cut off
    .part('QB2', 'nmos', X(5), Y(3.5), { value: 'IRFP4468', heatsink: HS }, { '1': 'GB2', '2': 'BNB', '3': 'BN' })
    .part('QD2', 'pnp', X(6), Y(4.2), { value: 'BD140' }, { '1': 'BQ2', '2': 'GD2', '3': 'V12' })
    .part('RBQ2', 'resistor', X(7), Y(4.2), { value: '47k' }, { '1': 'FLT', '2': 'BQ2' })
    .part('RBEQ2', 'resistor', X(7), Y(4.8), { value: '10k' }, { '1': 'V12', '2': 'BQ2' }, 1)
    .part('RGD2', 'resistor', X(6), Y(4.9), { value: '47k' }, { '1': 'GD2', '2': 'GB2' })
    .part('RGS2', 'resistor', X(5), Y(4.9), { value: '100k' }, { '1': 'GB2', '2': 'BN' }, 1)
    .part('DZB2', 'zener', X(5.5), Y(4.9), { value: 'BZX55C12' }, { '1': 'GB2', '2': 'BN' }, 1)
    // ideal diode in the battery's negative lead: QB's body diode passes the charge current and
    // blocks any current from the battery back into the converter (through L1 and Q1's body
    // diode into CIN: 200 A when the battery meets the empty capacitors; a drain into the array
    // at night). Above about 6 A of charge current U12 turns its channel on (2 mΩ instead of
    // the body diode's 0.8 V)
    .part('QB', 'nmos', X(5.5), Y(2.5), { value: 'IRFP4468', heatsink: HS }, { '1': 'GB', '2': 'BF', '3': 'BN' })
    .part('RSH', 'resistor', X(6.5), Y(2.5), { value: '1m', pmax: '10' }, { '1': 'BF', '2': 'GND' }, 1)
    // the current filtered over 1 ms, so the switching ripple does not toggle QB
    .part('RIF', 'resistor', X(7), Y(3.2), { value: '10k' }, { '1': 'ISA', '2': 'ISF' })
    .part('CIF', 'capacitor', X(7.5), Y(3.5), { value: '100n', vmax: '50' }, { '1': 'ISF', '2': 'GND' }, 1)
    // the gate is driven against QB's own source (the battery's negative terminal), which sits up
    // to 52 V below GND while the output capacitor is still empty: a gate driven against GND would
    // turn QB on there and let the battery discharge into COUT (2 kA). Off: RGS holds the gate
    // at the source; on: QD (80 V PNP) charges it through 47k (1 mA while BN is still 52 V low), DZB clamps it to 12 V
    .part('U12', 'comparator', X(7.5), Y(2.5), { value: 'LM393' }, { '3': 'ITH', '2': 'ISF', '1': 'BDN', '8': 'V12', '4': 'GND' })
    .part('RBU', 'resistor', X(8.5), Y(1.5), { value: '10k' }, { '1': 'V12', '2': 'BDN' }, 1)
    // base–emitter resistor: QD stays off whenever it is not driven (a load on BDN must not turn it on)
    .part('RBEQ', 'resistor', X(9.5), Y(1.3), { value: '10k' }, { '1': 'V12', '2': 'BQD' }, 1)
    .part('RBD', 'resistor', X(8.5), Y(2), { value: '10k' }, { '1': 'BDN', '2': 'BQD' })
    .part('QD', 'pnp', X(9.5), Y(2), { value: 'BD140' }, { '1': 'BQD', '2': 'GD', '3': 'V12' })
    .part('RGD', 'resistor', X(10.5), Y(2), { value: '47k' }, { '1': 'GD', '2': 'GB' })
    .part('RGS', 'resistor', X(10.5), Y(3), { value: '100k' }, { '1': 'GB', '2': 'BN' }, 1)
    .part('DZB', 'zener', X(11.5), Y(3), { value: 'BZX55C12' }, { '1': 'GB', '2': 'BN' }, 1)
    .part('RTH1', 'resistor', X(8.5), Y(3), { value: '27k' }, { '1': 'VREF', '2': 'ITH' })
    .part('RTH2', 'resistor', X(9.5), Y(3), { value: '3.3k' }, { '1': 'ITH', '2': 'GND' }, 1);
  // the battery's own BMS contactor, opened during charging (fault case)
  if (o.bmsOpenAt) nb.part('KBMS', 'relay', X(5), Y(-1), { value: '12 V 30 A' }, { '1': 'BMSC', '2': 'GND', '3': 'BMSI', '5': 'BATP' })
    .part('VBMS', 'vpulse', X(4), Y(-1), { value: '12', low: '0', freq: '1', duty: String(o.bmsOpenAt * 100), delay: '0', edge: '10u' }, { '1': 'BMSC', '2': 'GND' });
  // supply and reference
  // auxiliary 12 V supply: in the product a small regulator fed from the battery; its source
  // impedance (4.7 Ω, 2.5 A at most) limits the charging of the bootstrap and gate capacitors
  nb.part('V12', 'vdc', X(7), Y(1), { value: String(o.aux ?? 12) }, { '1': 'V12S', '2': 'GND' })
    .part('RAUX', 'resistor', X(7), Y(0), { value: '4.7', pmax: '2' }, { '1': 'V12S', '2': 'V12' })
    .part('CAUX', 'capacitor_pol', X(8), Y(0), { value: '100u', vmax: '25' }, { '1': 'V12', '2': 'GND' })
    .part('RREF', 'resistor', X(8), Y(1), { value: '1k' }, { '1': 'V12', '2': 'VREF' })
    .part('U1', 'tl431', X(9), Y(1), { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' });
  // protections with their own reference (U14), independent of the control: the overvoltage
  // latch (57.6 V, 3.6 V per cell, below the BMS cut-off: Q1 shorted, or the control failed) opens QB2 and QPV and stays tripped until
  // the power is removed; the fast stop (58.9 V) holds the PWM low while the output is too high
  nb.part('RREF2', 'resistor', X(9), Y(0), { value: '1k' }, { '1': 'V12', '2': 'VREF2' })
    .part('U14', 'tl431', X(10), Y(0), { value: 'TL431' }, { '1': 'VREF2', '2': 'GND', '3': 'VREF2' })
    .part('ROV1', 'resistor', X(11), Y(0), { value: '221k' }, { '1': 'VO', '2': 'VOS2' })
    .part('ROV2', 'resistor', X(12), Y(0), { value: '10k' }, { '1': 'VOS2', '2': 'GND' }, 1)
    // 10 ms filter; armed only while charge current flows (QNC holds VOS2 low otherwise): a
    // shorted Q1 drives current into the battery, while after a BMS cut-off the output
    // capacitors merely keep their charge, which must not latch the charger off
    .part('COV', 'capacitor', X(12.5), Y(0), { value: '1u', vmax: '50' }, { '1': 'VOS2', '2': 'GND' }, 1)
    .part('RNC', 'resistor', X(13), Y(0.6), { value: '10k' }, { '1': 'VOS2', '2': 'CNC' })
    .part('QNC', 'npn', X(14), Y(0.6), { value: 'BC547B' }, { '1': 'BNC', '2': 'CNC', '3': 'GND' })
    .part('RBNC', 'resistor', X(15), Y(0.6), { value: '100k' }, { '1': 'BDN', '2': 'BNC' })
    // once latched, QNL keeps QNC off, so the disarming cannot release the latch
    .part('QNL', 'npn', X(15), Y(1.2), { value: 'BC547B' }, { '1': 'BNL', '2': 'BNC', '3': 'GND' })
    .part('RBNL', 'resistor', X(16), Y(1.2), { value: '100k' }, { '1': 'FLT2', '2': 'BNL' })
    .part('U13', 'comparator', X(11), Y(1), { value: 'LM393' }, { '3': 'VOS2', '2': 'VREF2', '1': 'FLT', '8': 'V12', '4': 'GND' })
    .part('RFLT', 'resistor', X(12), Y(1), { value: '4.7k' }, { '1': 'V12', '2': 'FLT' }, 1)
    .part('DLAT', 'diode', X(12), Y(1.6), { value: '1N4148' }, { '2': 'FLT', '1': 'LAT' })
    .part('RLAT', 'resistor', X(12.5), Y(1.6), { value: '47k' }, { '1': 'LAT', '2': 'VOS2' })
    .part('RFS1', 'resistor', X(11), Y(-1), { value: '226k' }, { '1': 'VO', '2': 'VOS3' })
    .part('RFS2', 'resistor', X(12), Y(-1), { value: '10k' }, { '1': 'VOS3', '2': 'GND' }, 1)
    .part('U15', 'comparator', X(13), Y(-1), { value: 'LM393' }, { '3': 'VREF', '2': 'VOS3', '1': 'PWM', '8': 'V12', '4': 'GND' })
    // diagnostics: CHARGING (green, QB conducting) and FAULT (red, the latch has tripped)
    // the CHARGING LED on QB's gate drive: on BDN it pulled the comparator's high level down to
    // 10 V, which turned QD on and QB with it, defeating the reverse-current block (found by
    // the reversed-array test)
    .part('LEDC', 'led', X(9), Y(1.6), { value: 'green' }, { '2': 'GD', '1': 'LCA' })
    .part('RLC', 'resistor', X(9), Y(2.2), { value: '4.7k' }, { '1': 'LCA', '2': 'BN' })
    // a second comparator of U13 drives the optocoupler and the FAULT LED in series, so the
    // fault line FLT itself carries no load (a loaded pull-up kept QD2, and QB2, on)
    .part('U13B', 'comparator', X(13), Y(1), { value: 'LM393' }, { '3': 'VOS2', '2': 'VREF2', '1': 'FLT2', '8': 'V12', '4': 'GND' })
    .part('RFL2', 'resistor', X(13.5), Y(0.4), { value: '2.2k' }, { '1': 'V12', '2': 'FLT2' }, 1)
    .part('LEDF', 'led', X(13.5), Y(2.2), { value: 'red' }, { '2': 'LFA2', '1': 'LFK' })
    .part('RLF2', 'resistor', X(14), Y(2.2), { value: '1k' }, { '1': 'LFK', '2': 'GND' }, 1)
    // temperature: charging only with the battery between 0 and 50 °C (LiFePO4 must not be
    // charged below 0 °C), and the heatsink below 90 °C. The comparators pull the current
    // reference to zero; an open sensor wire reads as too cold, a shorted one as too hot, so a
    // sensor fault stops the charging too
    .part('NTB', 'ntc', X(14), Y(4), { value: '10k', beta: '3950', temp: String(o.tbat ?? 25) }, { '1': 'VREF', '2': 'NBT' })
    .part('RNB', 'resistor', X(14), Y(5), { value: '10k' }, { '1': 'NBT', '2': 'GND' }, 1)
    .part('NTH', 'ntc', X(15), Y(4), { value: '10k', beta: '3950', temp: String(o.theatsink ?? 60) }, { '1': 'VREF', '2': 'NHS' })
    .part('RNH', 'resistor', X(15), Y(5), { value: '10k' }, { '1': 'NHS', '2': 'GND' }, 1)
    .part('RT1', 'resistor', X(16), Y(3), { value: '3.74k' }, { '1': 'VREF', '2': 'T90' })
    .part('RT2', 'resistor', X(16), Y(4), { value: '7.87k' }, { '1': 'T90', '2': 'T50' })
    .part('RT3', 'resistor', X(16), Y(5), { value: '22.1k' }, { '1': 'T50', '2': 'T0' })
    .part('RT4', 'resistor', X(16), Y(6), { value: '10k' }, { '1': 'T0', '2': 'GND' }, 1)
    .part('U16', 'comparator', X(17), Y(4), { value: 'LM393' }, { '3': 'T50', '2': 'NBT', '1': 'IREF', '8': 'V12', '4': 'GND' })
    .part('U17', 'comparator', X(17), Y(5), { value: 'LM393' }, { '3': 'NBT', '2': 'T0', '1': 'IREF', '8': 'V12', '4': 'GND' })
    .part('U18', 'comparator', X(17), Y(6), { value: 'LM393' }, { '3': 'T90', '2': 'NHS', '1': 'IREF', '8': 'V12', '4': 'GND' });
  // sensing: PV voltage (2.5 V at 93.8 V), battery voltage (2.5 V at 56.6 V), current (×31)
  nb.part('RP1', 'resistor', X(0), Y(4), { value: '365k' }, { '1': 'PVP', '2': 'VPS' })
    .part('RP2', 'resistor', X(1), Y(4), { value: '10k' }, { '1': 'VPS', '2': 'GND' }, 1)
    .part('CP', 'capacitor', X(2), Y(4), { value: '10n', vmax: '50' }, { '1': 'VPS', '2': 'GND' }, 1)
    .part('RV1', 'resistor', X(3), Y(4), { value: '232k' }, { '1': 'VO', '2': 'VBS' })
    .part('RV2', 'resistor', X(4), Y(4), { value: '10.7k' }, { '1': 'VBS', '2': 'GND' }, 1)
    .part('CV', 'capacitor', X(5), Y(4), { value: '10n', vmax: '50' }, { '1': 'VBS', '2': 'GND' }, 1)
    .part('U2', 'opamp', X(6), Y(4), { value: 'LM358' }, { '3': 'BF', '2': 'IFB', '6': 'ISA', '7': 'V12', '4': 'GND' })
    .part('RI1', 'resistor', X(7), Y(4.5), { value: '1k' }, { '1': 'IFB', '2': 'GND' }, 1)
    .part('RI2', 'resistor', X(7), Y(3.5), { value: '30k' }, { '1': 'ISA', '2': 'IFB' });
  // average current-mode control. The current reference IREF is pulled up to VREF (2.5 V =
  // 80 A: the current limit is the reference itself); the MPPT and CV amplifiers lower it, each
  // through an NPN transistor that can pull it down to its saturation voltage (a diode would
  // leave 0.6 V, 20 A, that weak sun could not supply). The transistor inverts, so the
  // amplifier's feedback (PI: R + C from IREF) goes to its + input. The current amplifier sets
  // VCMD, the duty-cycle command.
  nb.part('RIR', 'resistor', X(9), Y(5), { value: '10k' }, { '1': 'VREF', '2': 'IREF' }, 1);
  if (o.rlim) nb.part('RLIM', 'resistor', X(10), Y(5), { value: o.rlim }, { '1': 'IREF', '2': 'GND' }, 1);
  const outer = [
    // IREF falls when the PV voltage falls below its set point, or the battery rises above its own
    { k: 'MP', inR: 'VSET', minus: 'VPS', rf: o.comp?.rf ?? '4.7k', cf: o.comp?.cf ?? '820n' },
    { k: 'CV', inR: 'VBS', minus: 'VREF', rf: '470k', cf: '10n' },
  ];
  outer.forEach((e, i) => {
    const x = X(3 * i), y = Y(6);
    nb.part(`U${3 + i}`, 'opamp', x, y, { value: 'LM358' }, { '3': `N${e.k}`, '2': e.minus, '6': `E${e.k}`, '7': 'V12', '4': 'GND' })
      .part(`RI${e.k}`, 'resistor', x, y + Y(1), { value: '10k' }, { '1': e.inR, '2': `N${e.k}` })
      .part(`RF${e.k}`, 'resistor', x + X(1), y + Y(1), { value: e.rf }, { '1': `N${e.k}`, '2': `F${e.k}` })
      .part(`CF${e.k}`, 'capacitor', x + X(2), y + Y(1), { value: e.cf, vmax: '50' }, { '1': `F${e.k}`, '2': 'IREF' })
      .part(`RB${e.k}`, 'resistor', x + X(1), y, { value: '10k' }, { '1': `E${e.k}`, '2': `B${e.k}` })
      .part(`RBE${e.k}`, 'resistor', x + X(1), y - Y(0.6), { value: '47k' }, { '1': `B${e.k}`, '2': 'GND' }, 1)
      .part(`Q${e.k}`, 'npn', x + X(2), y, { value: 'BC547B' }, { '1': `B${e.k}`, '2': 'IREF', '3': 'GND' });
  });
  nb.part('U5', 'opamp', X(6), Y(6), { value: 'LM358' }, { '3': 'IREF', '2': 'NI', '6': 'VCMD', '7': 'V12', '4': 'GND' })
    .part('RII', 'resistor', X(6), Y(7), { value: '10k' }, { '1': 'ISA', '2': 'NI' })
    .part('RFI', 'resistor', X(7), Y(7), { value: '10k' }, { '1': 'NI', '2': 'FI' })
    .part('CFI', 'capacitor', X(8), Y(7), { value: '100n', vmax: '50' }, { '1': 'FI', '2': 'VCMD' });
  // fractional open-circuit-voltage MPPT: the converter pauses (at power-on for 50 ms, then for
  // 49 ms every 10.4 s), the array's open-circuit voltage is sampled onto CH and the PV held at
  // 0.826 of it. Vmp/Voc of the array stays within 0.81 … 0.845 from 25 to 65 °C and 200 to
  // 1000 W/m², so at least 99.5 % of the available power is taken; a fixed voltage set point
  // would lose up to half of it on a hot roof
  nb.part('RPOR', 'resistor', X(0), Y(12), { value: '1M' }, { '1': 'V12', '2': 'POR' })
    .part('CPOR', 'capacitor', X(1), Y(12), { value: '220n', vmax: '25' }, { '1': 'POR', '2': 'GND' }, 1)
    .part('U9', 'comparator', X(2), Y(12), { value: 'LM393' }, { '3': 'POR', '2': 'VREF', '1': 'RUN', '8': 'V12', '4': 'GND' })
    .part('RRUN', 'resistor', X(3), Y(11.5), { value: '10k' }, { '1': 'V12', '2': 'RUN' }, 1)
    .part('U10', 'timer555', X(4.5), Y(12.5), { value: 'NE555' }, { '8': 'V12', '4': 'V12', '7': 'TD', '6': 'TT', '2': 'TT', '3': 'TOUT', '5': 'TCTL', '1': 'GND' })
    .part('RTA', 'resistor', X(5.5), Y(12), { value: '3.01M' }, { '1': 'V12', '2': 'TD' })
    .part('RTB', 'resistor', X(5.5), Y(13), { value: '15k' }, { '1': 'TD', '2': 'TT' })
    .part('CTT', 'capacitor', X(6.5), Y(13), { value: o.timerC ?? '4.7u', vmax: '50' }, { '1': 'TT', '2': 'GND' }, 1)
    .part('CTC', 'capacitor', X(6.5), Y(12), { value: '10n', vmax: '50' }, { '1': 'TCTL', '2': 'GND' }, 1)
    .part('DRUN', 'diode', X(4), Y(11), { value: '1N4148' }, { '2': 'RUN', '1': 'TOUT' })
    // SMP high during a pause: sample, and hold the current reference at zero
    .part('RQP', 'resistor', X(7.5), Y(11.5), { value: '10k' }, { '1': 'RUN', '2': 'BP' })
    .part('QP', 'npn', X(8.5), Y(11.5), { value: 'BC547B' }, { '1': 'BP', '2': 'SMP', '3': 'GND' })
    .part('RSMP', 'resistor', X(8.5), Y(10.5), { value: '10k' }, { '1': 'V12', '2': 'SMP' }, 1)
    .part('RQZ', 'resistor', X(9.5), Y(11.5), { value: '10k' }, { '1': 'SMP', '2': 'BZ' })
    .part('QZ', 'npn', X(10.5), Y(11.5), { value: 'BC547B' }, { '1': 'BZ', '2': 'IREF', '3': 'GND' })
    // sample and hold: the body diode of QS is reverse-biased while the PV runs below Voc
    .part('QS', 'nmos', X(7.5), Y(13), { value: '2N7000' }, { '1': 'SMP', '2': 'CH', '3': 'VPS' })
    .part('CH', 'capacitor', X(8.5), Y(13.5), { value: '1u', vmax: '50' }, { '1': 'CH', '2': 'GND' }, 1)
    .part('U11', 'opamp', X(9.5), Y(13), { value: 'TL072' }, { '3': 'CH', '2': 'VOCH', '6': 'VOCH', '7': 'V12', '4': 'GND' })
    .part('RSET1', 'resistor', X(10.5), Y(13), { value: '2.1k' }, { '1': 'VOCH', '2': 'VSET' })
    .part('RSET2', 'resistor', X(11.5), Y(13), { value: '10k' }, { '1': 'VSET', '2': 'GND' }, 1);
  // PWM and driver
  // soft start of the current reference (IREF at most SS + 0.6 V): the current loop stays in
  // control from the start, so its integrator cannot wind up and overshoot when it is released
  nb.part('DSS', 'diode', X(10), Y(6), { value: '1N4148' }, { '2': 'IREF', '1': 'SS' })
    .part('RSS', 'resistor', X(11), Y(6), { value: '4.7k' }, { '1': 'V12', '2': 'SS' }, 1)
    .part('CSS', 'capacitor', X(11), Y(7), { value: '1u', vmax: '25' }, { '1': 'SS', '2': 'GND' }, 1)
    // the ramp stops during a pause (RESET = RUN), and DPW holds the driver input low: a reset
    // ramp sits at 0 V, which the comparator would read as full duty
    .part('U6', 'timer555', X(0), Y(9.5), { value: 'NE555' }, { '8': 'V12', '4': 'RUN', '7': 'DIS', '6': 'RAMP', '2': 'RAMP', '3': 'OSC', '5': 'CTL', '1': 'GND' })
    .part('RA', 'resistor', X(1), Y(9), { value: '6.8k' }, { '1': 'V12', '2': 'DIS' })
    .part('RB', 'resistor', X(1), Y(10), { value: '330' }, { '1': 'DIS', '2': 'RAMP' })
    .part('CT', 'capacitor', X(2), Y(10), { value: '10n', vmax: '50' }, { '1': 'RAMP', '2': 'GND' }, 1)
    .part('CCT', 'capacitor', X(2), Y(9), { value: '10n', vmax: '50' }, { '1': 'CTL', '2': 'GND' }, 1)
    .part('U7', 'comparator', X(3.5), Y(9.5), { value: 'LM393' }, { '3': 'VCMD', '2': 'RAMP', '1': 'PWM', '8': 'V12', '4': 'GND' })
    .part('RPW', 'resistor', X(4.5), Y(9), { value: '4.7k' }, { '1': 'V12', '2': 'PWM' }, 1)
    .part('DPW', 'diode', X(4.5), Y(10), { value: '1N4148' }, { '2': 'PWM', '1': 'RUN' })
    .part('U8', 'hbdriver', X(6), Y(9.5), { value: 'IR2184-type 600 V' }, { '1': 'PWM', '8': 'V12', '3': 'GND', '7': 'VB', '6': 'HO', '5': 'SW', '4': 'LO' })
    .part('DB', 'diode', X(7), Y(8.5), { value: '1N4007' }, { '2': 'V12', '1': 'VB' })
    .part('CB', 'capacitor', X(8), Y(9), { value: '1u', vmax: '25' }, { '1': 'VB', '2': 'SW' }, 1)
    .part('RG', 'resistor', X(8), Y(10), { value: '10' }, { '1': 'HO', '2': 'G1' });
  nb.v('PVP').v('VO').v('VCMD').i('L1', '1').i('BAT', '1');
  nb.sim({ type: 'tran', stop: o.stop ?? '70m', step: '5u', start: 'zero' });
  const sheet = nb.done();
  if (o.temp !== undefined) sheet.temp = String(o.temp);
  return { sheet, nb };
}

/** Options of the inverter: battery voltage, load (Ω, at the 230 V output; 0: no load), the
 *  air temperature and the heatsink temperature at its NTC. */
export interface InverterOptions { vbat?: number; load?: number; stop?: string; temp?: number; theatsink?: number; heatsink?: string }

/** DC-to-AC inverter, one 5 kW unit: 48 V LiFePO4 battery → MOSFET full bridge (unipolar sine
 *  PWM, 5 kHz) → 50 Hz transformer 27.5/230 V → 230 V 50 Hz. Built from discrete parts: the
 *  50 Hz reference is a 555 and a flip-flop (exact 50 % square), its amplitude set by the
 *  voltage loop and turned into a sine by a 4th-order Butterworth filter; a triangle carrier;
 *  two comparators and two half-bridge drivers. */
export function inverter1(o: InverterOptions = {}): { sheet: Sheet; nb: NB } {
  const vbat = o.vbat ?? 52, HS = o.heatsink ?? '0.8';
  const nb = new NB();
  const X = (k: number) => k * 110, Y = (k: number) => k * 110;
  nb.note('Inverter, one 5 kW unit: 48 V battery (LiFePO4 16 cells) to 230 V 50 Hz. Low-frequency design: MOSFET full bridge (3 × IRFP4468 per switch) with unipolar sine PWM at 5 kHz, 50 Hz transformer 27.5/230 V 5 kVA whose leakage inductance and a 10 µF X2 capacitor filter the output.', X(0), Y(-1))
    .note('Control from discrete parts: 555 + flip-flop 50 Hz square, amplitude from the voltage loop, 4th-order Butterworth low-pass (70 Hz) to a sine; 5 kHz triangle (integrator + Schmitt); LM393 comparators; IR2184-type drivers with dead time.', X(0), Y(-0.75))
    .note('Protections (DFMEA): pre-charge before the battery contactor closes, cycle-by-cycle current limit, low and high battery cut-out with hysteresis, heatsink temperature, output overvoltage (own reference); any of them stops the bridge and restarts the soft start.', X(0), Y(-0.5));
  // battery, fuse, pre-charge and the battery contactor
  nb.part('BAT', 'battery', X(0), Y(1), { value: String(vbat), rint: '0.01' }, { '1': 'BATP', '2': 'GND' })
    .part('FBAT', 'fuse', X(1), Y(1), { value: '200', r: '0.2m' }, { '1': 'BATP', '2': 'BATF' })
    .part('RPRE', 'resistor', X(2), Y(0.3), { value: '10', pmax: '25' }, { '1': 'BATF', '2': 'BUS' })
    .part('KBAT', 'contactor', X(2), Y(1.5), { value: '150 A DC, coil 12 V' }, { A1: 'V12', A2: 'KBC', '1': 'BATF', '2': 'BUS' })
    .part('DKB', 'diode', X(1), Y(2.3), { value: '1N4007' }, { '2': 'KBC', '1': 'V12' })
    .part('QKB', 'nmos', X(2), Y(2.8), { value: 'IRLZ44N' }, { '1': 'GKB', '2': 'KBC', '3': 'GND' })
    // the contactor closes once the bus is above 90 % of the battery (pre-charged): a reversed
    // battery never charges the bus, so it never closes
    .part('RPB1', 'resistor', X(3), Y(2.3), { value: '200k' }, { '1': 'BATF', '2': 'VBF' })
    .part('RPB2', 'resistor', X(3), Y(3), { value: '10k' }, { '1': 'VBF', '2': 'GND' }, 1)
    .part('RPU1', 'resistor', X(4), Y(2.3), { value: '182k' }, { '1': 'BUS', '2': 'VBU' })
    .part('RPU2', 'resistor', X(4), Y(3), { value: '10k' }, { '1': 'VBU', '2': 'GND' }, 1)
    .part('UPC', 'comparator', X(5), Y(2.5), { value: 'LM393' }, { '3': 'VBU', '2': 'VBF', '1': 'GKB', '8': 'V12', '4': 'GND' })
    .part('RGKB', 'resistor', X(5), Y(1.8), { value: '10k' }, { '1': 'V12', '2': 'GKB' }, 1);
  // DC bus: film capacitors (no electrolyte to dry out)
  for (let k = 0; k < 4; k++) nb.part(`CB${k + 1}`, 'capacitor', X(3 + 0.4 * k), Y(1), { value: '220u', vmax: '100' }, { '1': 'BUS', '2': 'GND' }, 1);
  // full bridge: 3 MOSFETs per switch, each with its own gate resistor
  for (const [leg, x0] of [['A', 5], ['B', 9]] as const) {
    for (let k = 0; k < 3; k++) {
      nb.part(`QH${leg}${k + 1}`, 'nmos', X(x0 + k), Y(0.5), { value: 'IRFP4468', heatsink: HS }, { '1': `GH${leg}${k + 1}`, '2': 'BUS', '3': `SW${leg}` })
        .part(`RGH${leg}${k + 1}`, 'resistor', X(x0 + k), Y(-0.2), { value: '4.7' }, { '1': `HO${leg}`, '2': `GH${leg}${k + 1}` })
        .part(`QL${leg}${k + 1}`, 'nmos', X(x0 + k), Y(1.8), { value: 'IRFP4468', heatsink: HS }, { '1': `GL${leg}${k + 1}`, '2': `SW${leg}`, '3': 'SRC' })
        .part(`RGL${leg}${k + 1}`, 'resistor', X(x0 + k), Y(2.5), { value: '4.7' }, { '1': `LO${leg}`, '2': `GL${leg}${k + 1}` });
    }
    nb.part(`UD${leg}`, 'hbdriver', X(x0 + 1), Y(3.5), { value: 'IR2184-type 600 V' }, { '1': `IN${leg}`, '8': 'V12', '3': 'SRC', '7': `VB${leg}`, '6': `HO${leg}`, '5': `SW${leg}`, '4': `LO${leg}` })
      .part(`DB${leg}`, 'diode', X(x0 + 2), Y(3), { value: '1N4007' }, { '2': 'V12', '1': `VB${leg}` })
      .part(`CBS${leg}`, 'capacitor', X(x0 + 2.5), Y(3.5), { value: '2.2u', vmax: '25' }, { '1': `VB${leg}`, '2': `SW${leg}` }, 1);
  }
  // current shunt in the bridge return (both directions), amplified around VMID
  nb.part('RSH', 'resistor', X(8), Y(3), { value: '0.2m', pmax: '10' }, { '1': 'SRC', '2': 'GND' }, 1)
    // ISA = 6 V − 24 × V(shunt): an LM358 (inputs down to GND), its + input at VMID/25
    .part('UI', 'opamp', X(8), Y(4.5), { value: 'LM358' }, { '3': 'VIB', '2': 'NIS', '6': 'ISA', '7': 'V12', '4': 'GND' })
    .part('RIB1', 'resistor', X(7), Y(5.2), { value: '24k' }, { '1': 'VMID', '2': 'VIB' })
    .part('RIB2', 'resistor', X(7), Y(5.9), { value: '1k' }, { '1': 'VIB', '2': 'GND' }, 1)
    .part('RIS1', 'resistor', X(7), Y(4.5), { value: '1k' }, { '1': 'SRC', '2': 'NIS' })
    .part('RIS2', 'resistor', X(8), Y(5.2), { value: '24k' }, { '1': 'NIS', '2': 'ISA' })
    // window: |I| above 300 A (± 1.44 V around VMID) pulls both PWM inputs low for the moment
    .part('UOC1', 'comparator', X(9), Y(4.5), { value: 'LM393' }, { '3': 'ISA', '2': 'OCL', '1': 'INA', '8': 'V12', '4': 'GND' })
    .part('UOC2', 'comparator', X(10), Y(4.5), { value: 'LM393' }, { '3': 'OCH', '2': 'ISA', '1': 'INA', '8': 'V12', '4': 'GND' })
    .part('UOC3', 'comparator', X(9), Y(5.2), { value: 'LM393' }, { '3': 'ISA', '2': 'OCL', '1': 'INB', '8': 'V12', '4': 'GND' })
    .part('UOC4', 'comparator', X(10), Y(5.2), { value: 'LM393' }, { '3': 'OCH', '2': 'ISA', '1': 'INB', '8': 'V12', '4': 'GND' })
    .part('ROC1', 'resistor', X(11), Y(4.5), { value: '3.83k' }, { '1': 'V12', '2': 'OCH' })
    .part('ROC2', 'resistor', X(11), Y(5.2), { value: '2.37k' }, { '1': 'OCH', '2': 'OCL' })
    .part('ROC3', 'resistor', X(12), Y(5.2), { value: '3.83k' }, { '1': 'OCL', '2': 'GND' }, 1);
  // transformer, output filter capacitor, surge protection and the load
  nb.part('TR1', 'transformer', X(7), Y(6.5), { value: '8.36', lp: '15m', rp: '3m', rs: '0.25', k: '0.999' }, { '1': 'SWA', '2': 'SWB', '3': 'OUTL', '4': 'GND' })
    .part('COUT', 'capacitor', X(8.5), Y(6.5), { value: '10u', vmax: '630' }, { '1': 'OUTL', '2': 'GND' }, 1)
    .part('RVO', 'mov', X(9.5), Y(6.5), { value: '14D471K' }, { '1': 'OUTL', '2': 'GND' }, 1);
  if ((o.load ?? 10.5) > 0) nb.part('RLOAD', 'resistor', X(10.5), Y(6.5), { value: String(o.load ?? 10.5) }, { '1': 'OUTL', '2': 'GND' }, 1);
  // auxiliary supply (from the battery: a small regulator, 4.7 Ω source impedance); its rise at
  // power-on also starts nothing that needs a kick
  nb.part('V12', 'vdc', X(0), Y(8), { value: '12' }, { '1': 'V12S', '2': 'GND' })
    .part('RAUX', 'resistor', X(1), Y(8), { value: '4.7', pmax: '2' }, { '1': 'V12S', '2': 'V12' })
    .part('CAUX', 'capacitor_pol', X(2), Y(8.5), { value: '470u', vmax: '25' }, { '1': 'V12', '2': 'GND' })
    .part('RREF', 'resistor', X(3), Y(8), { value: '2.2k' }, { '1': 'V12', '2': 'VREF' })
    .part('UREF', 'tl431', X(4), Y(8), { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' })
    .part('RM1', 'resistor', X(5), Y(8), { value: '10k' }, { '1': 'V12', '2': 'VMR' })
    .part('RM2', 'resistor', X(5), Y(8.6), { value: '10k' }, { '1': 'VMR', '2': 'GND' }, 1)
    .part('UM', 'opamp', X(6), Y(8), { value: 'TL072' }, { '3': 'VMR', '2': 'VMID', '6': 'VMID', '7': 'V12', '4': 'GND' });
  // 50 Hz: a 100.7 Hz 555 and a toggle flip-flop (CD4013 type at 12 V): an exact 50 % square
  nb.part('U50', 'timer555', X(0), Y(10), { value: 'NE555' }, { '8': 'V12', '4': 'V12', '7': 'D50', '6': 'T50', '2': 'T50', '3': 'C100', '5': 'K50', '1': 'GND' })
    .part('RA50', 'resistor', X(1), Y(9.5), { value: '10k' }, { '1': 'V12', '2': 'D50' })
    .part('RB50', 'resistor', X(1), Y(10.5), { value: '66.5k' }, { '1': 'D50', '2': 'T50' })
    .part('CT50', 'capacitor', X(2), Y(10.5), { value: '100n', vmax: '50' }, { '1': 'T50', '2': 'GND' }, 1)
    .part('CK50', 'capacitor', X(2), Y(9.5), { value: '10n', vmax: '50' }, { '1': 'K50', '2': 'GND' }, 1)
    .part('UFF', 'dff', X(3), Y(10), { value: 'V12' }, { '1': 'Q50N', '2': 'C100', '3': 'Q50', '4': 'Q50N' })
    // the square switches between 0 and VA (the amplitude from the voltage loop)
    .part('UVA', 'opamp', X(4), Y(11), { value: 'TL072' }, { '3': 'VA', '2': 'VAB', '6': 'VAB', '7': 'V12', '4': 'GND' })
    .part('RSQ', 'resistor', X(5), Y(11), { value: '1k' }, { '1': 'VAB', '2': 'SQ' })
    .part('QSQ', 'nmos', X(5), Y(10), { value: '2N7000' }, { '1': 'Q50', '2': 'SQ', '3': 'GND' })
    .part('CSQ', 'capacitor', X(6), Y(10), { value: '10u', vmax: '25' }, { '1': 'SQ', '2': 'SQA' })
    .part('RSQA', 'resistor', X(6), Y(11), { value: '100k' }, { '1': 'SQA', '2': 'VMID' })
    // 4th-order Butterworth low-pass, 70 Hz: two unity-gain Sallen–Key stages (Q 0.54, 1.31)
    .part('RF1', 'resistor', X(7), Y(10), { value: '22.1k' }, { '1': 'SQA', '2': 'F1A' })
    .part('RF2', 'resistor', X(8), Y(10), { value: '22.1k' }, { '1': 'F1A', '2': 'F1B' })
    .part('CF1', 'capacitor', X(8), Y(9.3), { value: '110n', vmax: '50' }, { '1': 'F1A', '2': 'F1O' })
    .part('CF2', 'capacitor', X(9), Y(10.6), { value: '100n', vmax: '50' }, { '1': 'F1B', '2': 'VMID' }, 1)
    .part('UF1', 'opamp', X(9), Y(10), { value: 'TL072' }, { '3': 'F1B', '2': 'F1O', '6': 'F1O', '7': 'V12', '4': 'GND' })
    .part('RF3', 'resistor', X(10), Y(10), { value: '22.1k' }, { '1': 'F1O', '2': 'F2A' })
    .part('RF4', 'resistor', X(11), Y(10), { value: '22.1k' }, { '1': 'F2A', '2': 'F2B' })
    .part('CF3', 'capacitor', X(11), Y(9.3), { value: '270n', vmax: '50' }, { '1': 'F2A', '2': 'SINE' })
    .part('CF4', 'capacitor', X(12), Y(10.6), { value: '39n', vmax: '50' }, { '1': 'F2B', '2': 'VMID' }, 1)
    .part('UF2', 'opamp', X(12), Y(10), { value: 'TL072' }, { '3': 'F2B', '2': 'SINE', '6': 'SINE', '7': 'V12', '4': 'GND' })
    // the inverted sine for leg B: 2·VMID − SINE
    .part('RN1', 'resistor', X(13), Y(10), { value: '10k' }, { '1': 'SINE', '2': 'NSB' })
    .part('RN2', 'resistor', X(13), Y(10.7), { value: '10k' }, { '1': 'NSB', '2': 'SINEB' })
    .part('UNB', 'opamp', X(14), Y(10), { value: 'TL072' }, { '3': 'VMID', '2': 'NSB', '6': 'SINEB', '7': 'V12', '4': 'GND' });
  // 5 kHz triangle between 4 and 8 V: integrator (15k, 10n) and an op-amp Schmitt trigger (its
  // output swings symmetrically around VMID, so the triangle has no DC offset)
  nb.part('UTI', 'opamp', X(0), Y(13), { value: 'TL072' }, { '3': 'VMID', '2': 'NTI', '6': 'TRI', '7': 'V12', '4': 'GND' })
    .part('RTI', 'resistor', X(0), Y(12.3), { value: '15k' }, { '1': 'SQT', '2': 'NTI' })
    .part('CTI', 'capacitor', X(1), Y(12.3), { value: '10n', vmax: '50' }, { '1': 'NTI', '2': 'TRI' })
    .part('UST', 'opamp', X(2), Y(13), { value: 'TL072' }, { '3': 'PST', '2': 'VMID', '6': 'SQT', '7': 'V12', '4': 'GND' })
    .part('RSA', 'resistor', X(3), Y(12.3), { value: '10k' }, { '1': 'TRI', '2': 'PST' })
    .part('RSB', 'resistor', X(3), Y(13.7), { value: '30.1k' }, { '1': 'SQT', '2': 'PST' })
    // PWM: leg A on while SINE is above the triangle, leg B while SINEB is
    .part('UPA', 'comparator', X(4), Y(13), { value: 'LM393' }, { '3': 'SINE', '2': 'TRI', '1': 'INA', '8': 'V12', '4': 'GND' })
    .part('RPA', 'resistor', X(5), Y(12.3), { value: '4.7k' }, { '1': 'V12', '2': 'INA' }, 1)
    .part('UPB', 'comparator', X(6), Y(13), { value: 'LM393' }, { '3': 'SINEB', '2': 'TRI', '1': 'INB', '8': 'V12', '4': 'GND' })
    .part('RPB', 'resistor', X(7), Y(12.3), { value: '4.7k' }, { '1': 'V12', '2': 'INB' }, 1);
  // voltage loop: output sensed (transformer, bridge, filter), PI amplifier → VA (clamped at
  // 3.3 V: full modulation); a fault or the pre-charge holds VA at zero (soft start again)
  nb.part('TRS', 'transformer', X(0), Y(15), SENSE_TR, { '1': 'OUTL', '2': 'GND', '3': 'SAO', '4': 'SBO' })
    .part('RSO', 'resistor', X(0.5), Y(15.6), { value: '220' }, { '1': 'SAO', '2': 'SNO' })
    .part('CSO', 'capacitor', X(1.5), Y(15.6), { value: '100n', vmax: '63' }, { '1': 'SNO', '2': 'SBO' })
    .part('BRO', 'bridge', X(1), Y(15), { value: 'DB107' }, { '1': 'SAO', '2': 'SBO', '3': 'VSO', '4': 'GND' })
    .part('CVO', 'capacitor_pol', X(2), Y(15), { value: '4.7u', vmax: '35' }, { '1': 'VSO', '2': 'GND' })
    .part('RVO1', 'resistor', X(3), Y(15), { value: '68k' }, { '1': 'VSO', '2': 'SO' })
    .part('RVO2', 'resistor', X(4), Y(15), { value: '13.3k' }, { '1': 'SO', '2': 'GND' }, 1)
    .part('UEA', 'opamp', X(5), Y(15), { value: 'TL072' }, { '3': 'VREF', '2': 'NEA', '6': 'VAO', '7': 'V12', '4': 'GND' })
    .part('REA', 'resistor', X(5), Y(14.3), { value: '100k' }, { '1': 'SO', '2': 'NEA' })
    .part('RFEA', 'resistor', X(6), Y(14.3), { value: '100k' }, { '1': 'NEA', '2': 'FEA' })
    .part('CFEA', 'capacitor', X(7), Y(14.3), { value: '1u', vmax: '25' }, { '1': 'FEA', '2': 'VAO' })
    .part('RVA', 'resistor', X(6), Y(15.6), { value: '10k' }, { '1': 'VAO', '2': 'VA' })
    .part('DZVA', 'zener', X(7), Y(15.6), { value: 'BZX55C3V3' }, { '1': 'VA', '2': 'GND' }, 1)
    // EN low (a fault, or the battery contactor still open): VA and the PWM inputs held low
    .part('QEN', 'npn', X(8), Y(15), { value: 'BC547B' }, { '1': 'BEN', '2': 'VA', '3': 'GND' })
    .part('REN', 'resistor', X(8), Y(14.3), { value: '10k' }, { '1': 'ENN', '2': 'BEN' })
    .part('DENA', 'diode', X(9), Y(14.3), { value: '1N4148' }, { '2': 'INA', '1': 'EN' })
    .part('DENB', 'diode', X(9), Y(15), { value: '1N4148' }, { '2': 'INB', '1': 'EN' })
    .part('RENP', 'resistor', X(10), Y(14.3), { value: '10k' }, { '1': 'V12', '2': 'EN' }, 1)
    .part('UENN', 'comparator', X(10), Y(15.6), { value: 'LM393' }, { '3': 'VMID', '2': 'EN', '1': 'ENN', '8': 'V12', '4': 'GND' })
    .part('RENN', 'resistor', X(11), Y(15.6), { value: '10k' }, { '1': 'V12', '2': 'ENN' }, 1)
    // the battery contactor's coil current tells the pre-charge is done: EN low until it closes
    .part('DEPC', 'diode', X(11), Y(14.3), { value: '1N4148' }, { '2': 'EN', '1': 'GKBN' })
    .part('UPCN', 'comparator', X(12), Y(14.3), { value: 'LM393' }, { '3': 'VBU', '2': 'VBF', '1': 'GKBN', '8': 'V12', '4': 'GND' })
    .part('RPCN', 'resistor', X(13), Y(14.3), { value: '10k' }, { '1': 'V12', '2': 'GKBN' }, 1);
  nb.v('OUTL').v('SINE').v('VA').v('BUS').i('TR1', '3');
  nb.sim({ type: 'tran', stop: o.stop ?? '200m', step: '10u', start: 'zero' });
  const sheet = nb.done();
  if (o.temp !== undefined) sheet.temp = String(o.temp);
  return { sheet, nb };
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
  {
    id: 'stabiliser', title: 'Mains voltage stabiliser, relay-switched taps (1 kVA)', level: 'advanced',
    summary: 'Keeps a 1 kVA load near 230 V for inputs of 140–300 V: the input is switched to one of seven autotransformer taps by a chain of six 12 V relays under LM339 comparator control; an output relay connects the load once the control has settled.',
    tryThis: 'Simulate at 230 V: the output OUT is the input. Set the input source V1 to 255 (180 V r.m.s.) or 382 (270 V) and simulate: another tap is chosen and OUT stays within about ±6 % of 230 V. Watch SF cross the ladder voltages N1 … N6.',
    build: () => stabiliser().sheet,
  },
];
