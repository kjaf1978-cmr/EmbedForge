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

/** Single-phase mains / back-up change-over with over- and undervoltage protection. */
export function changeover1(mainsPeak = '325'): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const X = (k: number) => k * 110, Y = (k: number) => k * 110;
  nb.note('Single-phase change-over: the load runs from the mains while it is within 195 … 253 V (−15 % / +10 %), otherwise from the back-up source.', X(0), Y(-1))
    .note('Sense: 230/12 V transformer, bridge, 4.7 µF and 68k/10k: 2.0 V at 230 V. Window comparator LM393 against a TL431 reference split by 1.87k/4.42k/12.4k (E96).', X(0), Y(-0.75))
    .note('Contactors K1 (mains) and K2 (back-up), 24 V DC coils, each fed through the other one\'s NC contact: never both closed.', X(0), Y(-0.5));
  // sources, each with its breaker
  nb.part('VM', 'vsin', X(0), Y(1), { value: mainsPeak, freq: '50' }, { '1': 'L_MAINS', '2': 'GND' })
    .part('QF1', 'breaker1', X(1), Y(1), { value: '32', curve: 'C' }, { '1': 'L_MAINS', '2': 'L1' })
    .part('VB', 'vsin', X(0), Y(3), { value: '325', freq: '50' }, { '1': 'L_BACKUP', '2': 'GND' })
    .part('QF2', 'breaker1', X(1), Y(3), { value: '32', curve: 'C' }, { '1': 'L_BACKUP', '2': 'L2' });
  // mains sense
  nb.part('TR1', 'transformer', X(2), Y(1), { value: '0.052' }, { '1': 'L1', '2': 'GND', '3': 'SA', '4': 'SB' })
    .part('BR1', 'bridge', X(3), Y(1), { value: 'DB107' }, { '1': 'SA', '2': 'SB', '3': 'VSR', '4': 'GND' })
    .part('C1', 'capacitor_pol', X(4), Y(1), { value: '4.7u', vmax: '35' }, { '1': 'VSR', '2': 'GND' }, 0)
    .part('R1', 'resistor', X(5), Y(1), { value: '68k' }, { '1': 'VSR', '2': 'SENSE' })
    .part('R2', 'resistor', X(6), Y(1), { value: '10k' }, { '1': 'SENSE', '2': 'GND' }, 1);
  // supply, reference and thresholds
  nb.part('V24', 'vdc', X(0), Y(5), { value: '24' }, { '1': 'V24', '2': 'GND' })
    .part('R3', 'resistor', X(1), Y(5), { value: '3.3k' }, { '1': 'V24', '2': 'VREF' })
    .part('U1', 'tl431', X(2), Y(5), { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' })
    // thresholds against the sense ripple: an overvoltage trip when its peaks pass 2.245 V
    // (253 V), an undervoltage trip when its minima fall below 1.655 V (195 V)
    .part('R4', 'resistor', X(3), Y(5), { value: '1.87k' }, { '1': 'VREF', '2': 'VHI' })
    .part('R5', 'resistor', X(4), Y(5), { value: '4.42k' }, { '1': 'VHI', '2': 'VLO' })
    .part('R6', 'resistor', X(5), Y(5), { value: '12.4k' }, { '1': 'VLO', '2': 'GND' }, 1);
  // window comparator: each output low on a fault; OK (diode AND of both) delayed by R7·C2.
  // Hysteresis only after a trip, through a diode: 33k pulls VHI and 100k pulls SENSE down by
  // about 0.08 V (8 V of mains), more than the 0.06 V sense ripple, so a voltage near a
  // threshold does not chatter: it reconnects below 245 V and above 203 V
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
  nb.sim({ type: 'tran', stop: '1.2', step: '200u', start: 'zero' });
  return { sheet: nb.done({ key: 'VM', list: '255 325 382' }), nb };
}

export const POWER_EXAMPLES: Example[] = [
  {
    id: 'changeover-1p', title: 'Mains / back-up change-over with voltage protection (single-phase)', level: 'advanced',
    summary: 'The load runs from the mains while it stays within 195–253 V, otherwise from a back-up source (generator or inverter). Designed from catalogue parts: sense transformer, bridge, LM393 window comparator, TL431 reference, MOSFET drivers and two interlocked 24 V DC contactors.',
    tryThis: 'Simulate: the parameter sweep runs the mains at 180, 230 and 270 V. At 230 V K1 connects the mains (I(K1.1)); at 180 and 270 V K2 connects the back-up. Change the mains source to 340 (240 V) to see it stay on the mains.',
    build: () => changeover1().sheet,
  },
];
