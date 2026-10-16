// Worked examples of the power and installation track (decision D20): circuits designed from
// basic catalogue components, each verified by tests against its specification. The sheets are
// drawn as placed parts whose pins carry net labels (GND: a ground symbol), like a SPICE deck
// laid out on the sheet, so large designs stay readable and every connection is explicit.

import { addLabel, placePart } from './editor';
import { autowire, type AutowireOptions } from './autowire';
import { annotate, emptySheet, newId, pinPositions, type Probe, type Rot, type Sheet, type SimSettings, type StepSweep } from './schematic';
import type { Example } from './examples';

const COLOURS = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf'];

/** Netlist-style sheet builder: parts at given positions, nets as labels on their pins. */
export class NB {
  s = emptySheet();
  private ids = new Map<string, string>();
  private probes = 0;
  /** The functional block of the parts placed next (for the drawing: see `wired`). */
  private cur = '';
  private blocks = new Map<string, string>();
  /** When set, `done()` draws the circuit with wires (autowire) instead of labels on every pin. */
  wired: AutowireOptions | null = null;
  block(name: string): this { this.cur = name; return this; }
  /** Places a part; `key` names it for probes and sweeps (its reference comes from annotation). */
  part(key: string, sym: string, x: number, y: number, props: Record<string, string>, nets: Record<string, string>, rot: Rot = 0, mirror = false): this {
    const r = placePart(this.s, sym, { x, y }, rot, mirror, props);
    this.s = r.sheet;
    this.ids.set(key, r.id);
    this.blocks.set(r.id, this.cur);
    const part = this.s.parts.find((p) => p.id === r.id)!;
    for (const pin of pinPositions(part)) {
      const net = nets[pin.pin];
      if (!net) continue;
      if (net === 'GND') this.s = placePart(this.s, 'gnd', pin.at).sheet;
      else this.s = addLabel(this.s, net, pin.at).sheet;
    }
    return this;
  }
  /** Adds properties to a placed part (by key). */
  prop(key: string, props: Record<string, string>): this {
    const id = this.ids.get(key)!;
    this.s = { ...this.s, parts: this.s.parts.map((p) => (p.id === id ? { ...p, props: { ...p.props, ...props } } : p)) };
    return this;
  }
  /** A text note at (x, y). */
  note(text: string, x: number, y: number): this {
    this.s = { ...this.s, labels: [...this.s.labels, { id: newId('l'), name: text, x, y, note: true }] };
    return this;
  }
  /** A paragraph of notes at (x, y), wrapped to lines of about `width` characters. */
  para(text: string, x: number, y: number, width = 110): this {
    const lines: string[] = [];
    let cur = '';
    for (const w of text.split(' ')) { if (cur && (cur + ' ' + w).length > width) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w; }
    if (cur) lines.push(cur);
    lines.forEach((l, i) => this.note(l, x, y + 16 * i));
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
    let s = annotate(this.s);
    if (this.wired) s = autowire(s, { ...this.wired, block: (p) => this.blocks.get(p.id) ?? '' }).sheet;
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
function transferLogic(nb: NB, X: (k: number) => number, Y: (k: number) => number, y0: number, t: TransferTiming, V = 'V24') {
  nb.part('R7', 'resistor', X(1.5), Y(y0 - 1.4), { value: '10k' }, { '1': V, '2': 'OK' })
    // 10 ms: a sub-cycle glitch of the sense (a step of the mains) is not a fault
    .part('C2', 'capacitor', X(2.5), Y(y0 - 1.1), { value: '1u', vmax: '50' }, { '1': 'OK', '2': 'GND' }, 1)
    .part('RTH1', 'resistor', X(0), Y(y0), { value: '10k' }, { '1': V, '2': 'VTH' })
    .part('RTH2', 'resistor', X(0), Y(y0 + 1), { value: '10k' }, { '1': 'VTH', '2': 'GND' }, 1)
    .part('CTH', 'capacitor', X(0.5), Y(y0 + 1), { value: '100n', vmax: '50' }, { '1': 'VTH', '2': 'GND' }, 1)
    // return delay: two 750k in series (no resistor above 1 MΩ: board leakage in humid air)
    .part('RRD1', 'resistor', X(1), Y(y0), { value: '750k' }, { '1': 'OK', '2': 'ORD' })
    .part('RRD2', 'resistor', X(2), Y(y0), { value: '750k' }, { '1': 'ORD', '2': 'OKC' })
    // a fault discharges the delay through DRD and RDS (4.7k: the comparator outputs stay below their 16 mA)
    .part('DRD', 'diode', X(1.5), Y(y0 + 0.6), { value: '1N4148' }, { '2': 'OKC', '1': 'ODS' })
    .part('RDS', 'resistor', X(1), Y(y0 + 1.2), { value: '4.7k' }, { '1': 'ODS', '2': 'OK' })
    .part('CRD', 'capacitor', X(3), Y(y0 + 1), { value: t.returnC ?? '100n', vmax: '50' }, { '1': 'OKC', '2': 'GND' }, 1)
    .part('UD1', 'comparator', X(3), Y(y0), { value: 'LM339' }, { '3': 'OKC', '2': 'VTH', '1': 'OKD', '8': V, '4': 'GND' })
    .part('ROKD', 'resistor', X(4), Y(y0 - 0.6), { value: '10k' }, { '1': V, '2': 'OKD' }, 1)
    .part('UD3', 'comparator', X(4), Y(y0 + 1.2), { value: 'LM339' }, { '3': 'VTH', '2': 'OKD', '1': 'OKDN', '8': V, '4': 'GND' })
    .part('ROKN', 'resistor', X(5), Y(y0 + 1.2), { value: '10k' }, { '1': V, '2': 'OKDN' }, 1);
  // dead times: each contactor closes only after its enable has been steady for 0.47 s (product)
  ([['1', 'OKD'], ['2', 'OKDN']] as const).forEach(([k, src], i) => {
    const x = X(6 + 3 * i);
    nb.part(`RDT${k}`, 'resistor', x, Y(y0), { value: '1M' }, { '1': src, '2': `CDT${k}N` })
      .part(`DDT${k}`, 'diode', x, Y(y0 + 0.6), { value: '1N4148' }, { '2': `CDT${k}N`, '1': `DTS${k}` })
      .part(`RDS${k}`, 'resistor', x, Y(y0 + 1.2), { value: '4.7k' }, { '1': `DTS${k}`, '2': src })
      .part(`CDT${k}`, 'capacitor', x + X(1), Y(y0 + 1), { value: t.deadC ?? '68n', vmax: '50' }, { '1': `CDT${k}N`, '2': 'GND' }, 1)
      .part(`UDT${k}`, 'comparator', x + X(1), Y(y0), { value: 'LM339' }, { '3': `CDT${k}N`, '2': 'VTH', '1': `K${k}EN`, '8': V, '4': 'GND' })
      .part(`REN${k}`, 'resistor', x + X(2), Y(y0 - 0.6), { value: '10k' }, { '1': V, '2': `K${k}EN` }, 1);
  });
  // coil-supply undervoltage lockout: 2.5 V at 20 V (68k/10k)
  nb.part('RUV1', 'resistor', X(12), Y(y0), { value: '68k' }, { '1': V, '2': 'V24S' })
    .part('RUV2', 'resistor', X(12), Y(y0 + 1), { value: '10k' }, { '1': 'V24S', '2': 'GND' }, 1)
    .part('UD5', 'comparator', X(13), Y(y0), { value: 'LM339' }, { '3': 'V24S', '2': 'VREF', '1': 'UVL', '8': V, '4': 'GND' })
    .part('RUVL', 'resistor', X(14), Y(y0 - 0.6), { value: '10k' }, { '1': V, '2': 'UVL' }, 1)
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
    .part('LK1', 'led', X(8), Y(yd), { colour: 'green' }, { '2': 'LK1A', '1': 'K1C' })
    .part('RLK1', 'resistor', X(8), Y(yd - 0.6), { value: '4.7k' }, { '1': 'K1A', '2': 'LK1A' })
    .part('LK2', 'led', X(9), Y(yd), { colour: 'yellow' }, { '2': 'LK2A', '1': 'K2C' })
    .part('RLK2', 'resistor', X(9), Y(yd - 0.6), { value: '4.7k' }, { '1': 'K2A', '2': 'LK2A' })
    .part('LOV', 'led', X(10), Y(yd), { colour: 'red' }, { '2': 'LOVA', '1': 'OVN' })
    .part('RLOV', 'resistor', X(10), Y(yd - 0.6), { value: '4.7k' }, { '1': V, '2': 'LOVA' })
    .part('LUV', 'led', X(11), Y(yd), { colour: 'red' }, { '2': 'LUVA', '1': 'UVN' })
    .part('RLUV', 'resistor', X(11), Y(yd - 0.6), { value: '4.7k' }, { '1': V, '2': 'LUVA' });
}

/** Single-phase mains / back-up change-over with over- and undervoltage protection, drawn as the
 *  product: terminals, two-pole breakers, L and N switched by two interlocked contactors, a 24 V
 *  control supply fed from either source, the sense, the window comparators and the transfer
 *  logic; the two sources and the load of a test bench are drawn outside the product. `t`: the
 *  return delay and dead time (product 10 µF and 680 nF film: 10.5 s and 0.47 s; the tests use
 *  shorter ones) and, for a fault case, the coil supply voltage. */
export function changeover1(mainsPeak = '325', step?: MainsStep, stop = '12', t: TransferTiming = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const V = '+24V';
  nb.wired = { rails: [V], labelled: ['L1', 'N1', 'L2', 'N2', 'VREF', 'SENSE', 'OK', 'OVN', 'UVN', 'K1A', 'K2A', 'K1C', 'K2C', 'K1EN', 'K2EN'] };
  const X = (k: number) => 120 * k, Y = (k: number) => 900 + 130 * (k - 9);
  nb.para('MAINS / BACK-UP CHANGE-OVER, single-phase, 32 A. The load runs from the mains while it is within 195 … 253 V (−15 % / +10 %), otherwise from the back-up source (generator or inverter). L and N are switched by two 2-pole contactors (24 V DC coils), each fed through the other one\'s NC auxiliary contact: never both closed.', -1350, -300)
    .para('Sense: 230/12 V transformer with snubber, bridge, 4.7 µF, 68k/10k: 2.0 V at 230 V. Window comparator (LM393) against a TL431 reference split by 2.1k/4.22k/12.1k (E96), with hysteresis after a trip. Transfer logic (LM339): return delay 10.5 s, dead time 0.47 s, coil-supply lockout below 20 V. The 24 V control supply is fed from both sources. Control ground bonded to PE.', 0, -300);

  // ---- test bench: mains and back-up, each with its neutral earthed (TN-S) — not part of the product
  nb.block('bench').note('TEST BENCH (not part of the product): mains and back-up source, neutrals earthed', -1450, -80);
  nb.part('VM', 'vsin', -1350, 150, { value: mainsPeak, freq: '50' }, { '1': 'LM_IN', '2': step ? 'L_STEP' : 'NM' });
  if (step) nb.part('VS', 'vsin', -1350, 270, { value: String(Number(((step.to[0] * Math.SQRT2) - Number(mainsPeak)).toPrecision(6))), freq: '50', delay: String(step.at) }, { '1': 'L_STEP', '2': 'NM' });
  nb.part('RE1', 'resistor', -1250, 360, { value: '0.1' }, { '1': 'NM', '2': 'GND' }, 1)
    .part('VB', 'vsin', -1350, 600, { value: '325', freq: '50' }, { '1': 'LB_IN', '2': 'NB' })
    .part('RE2', 'resistor', -1250, 720, { value: '0.1' }, { '1': 'NB', '2': 'GND' }, 1);

  // ---- inputs: terminals, two-pole breakers, surge arresters (type 3, 300 V AC)
  nb.block('in')
    .part('X1', 'terminal', -1100, 120, { value: 'L mains' }, { '1': 'LM_IN' })
    .part('X2', 'terminal', -1100, 180, { value: 'N mains' }, { '1': 'NM' })
    .part('X3', 'terminal', -1100, 570, { value: 'L back-up' }, { '1': 'LB_IN' })
    .part('X4', 'terminal', -1100, 630, { value: 'N back-up' }, { '1': 'NB' })
    .part('X5', 'terminal', -1100, 780, { value: 'PE' }, { '1': 'GND' })
    .part('QF1', 'breaker2', -950, 150, { value: '32', curve: 'C' }, { '1': 'LM_IN', '2': 'L1', N1: 'NM', N2: 'N1' }, 3)
    .part('RV1', 'mov', -820, 150, { value: '14D471K' }, { '1': 'L1', '2': 'N1' }, 1)
    .part('QF2', 'breaker2', -950, 600, { value: '32', curve: 'C' }, { '1': 'LB_IN', '2': 'L2', N1: 'NB', N2: 'N2' }, 3)
    .part('RV2', 'mov', -820, 600, { value: '14D471K' }, { '1': 'L2', '2': 'N2' }, 1);

  // ---- 24 V control supply from either source: a transformer and bridge on each, the bridges'
  // outputs in parallel (each blocks the other), LM317HV to 24.3 V (`t.v24` sets another value)
  const v24 = t.v24 ?? 24.27;
  nb.block('aux');
  for (const [k, L, N, y] of [[3, 'L1', 'N1', 120], [4, 'L2', 'N2', 520]] as const) {
    nb.part(`F${k}`, 'fuse', -680, y, { value: '0.2', r: '2' }, { '1': L, '2': `LF${k}` })
      .part(`TR${k}`, 'transformer', -540, y + 20, { value: '0.13', lp: '20', rp: '140', rs: '1.5', k: '0.995' }, { '1': `LF${k}`, '2': N, '3': `A${k}A`, '4': `A${k}B` })
      .part(`RS${k}`, 'resistor', -450, y + 110, { value: '47', pmax: '0.5' }, { '1': `A${k}A`, '2': `SN${k}` }, 1)
      .part(`CS${k}`, 'capacitor', -450, y + 200, { value: '1u', vmax: '100' }, { '1': `SN${k}`, '2': `A${k}B` }, 1)
      .part(`BR${k}`, 'bridge', -330, y + 40, { value: 'DB107' }, { '1': `A${k}A`, '2': `A${k}B`, '3': 'VRAW', '4': 'GND' });
  }
  nb.part('C5', 'capacitor_pol', -200, 380, { value: '2200u', vmax: '63' }, { '1': 'VRAW', '2': 'GND' }, 1)
    .part('U4', 'lm317', -80, 340, { value: 'LM317HV', heatsink: '8' }, { '3': 'VRAW', '1': 'ADJ', '2': V })
    .part('R15', 'resistor', 10, 370, { value: '240' }, { '1': V, '2': 'ADJ' }, 1)
    .part('R16', 'resistor', -80, 430, { value: v24 === 24.27 ? '4.42k' : String(Math.round(240 * (v24 / 1.25 - 1))) }, { '1': 'ADJ', '2': 'GND' }, 1)
    .part('C6', 'capacitor_pol', 100, 380, { value: '100u', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- mains sense and window comparator
  nb.block('sense')
    .part('TR1', 'transformer', -1300, 950, SENSE_TR, { '1': 'L1', '2': 'N1', '3': 'SA', '4': 'SB' })
    .part('RS1', 'resistor', -1190, 1030, { value: '220' }, { '1': 'SA', '2': 'SN' }, 1)
    .part('CS1', 'capacitor', -1190, 1120, { value: '100n', vmax: '63' }, { '1': 'SN', '2': 'SB' }, 1)
    .part('BR1', 'bridge', -1080, 970, { value: 'DB107' }, { '1': 'SA', '2': 'SB', '3': 'VSR', '4': 'GND' })
    .part('C1', 'capacitor_pol', -980, 970, { value: '4.7u', vmax: '35' }, { '1': 'VSR', '2': 'GND' }, 1)
    .part('R1', 'resistor', -900, 900, { value: '68k' }, { '1': 'VSR', '2': 'SENSE' })
    .part('R2', 'resistor', -830, 970, { value: '10k' }, { '1': 'SENSE', '2': 'GND' }, 1)
    // reference and thresholds against the sense ripple: an overvoltage trip when its peaks
    // pass 2.21 V (253 V), an undervoltage trip when its minima fall below 1.64 V (195 V)
    .part('R3', 'resistor', -1300, 1250, { value: '3.3k' }, { '1': V, '2': 'VREF' })
    .part('U1', 'tl431', -1200, 1340, { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' }, 3)
    .part('R4', 'resistor', -1090, 1310, { value: '2.1k' }, { '1': 'VREF', '2': 'VHI' }, 1)
    .part('R5', 'resistor', -1090, 1400, { value: '4.22k' }, { '1': 'VHI', '2': 'VLO' }, 1)
    .part('R6', 'resistor', -1090, 1490, { value: '12.1k' }, { '1': 'VLO', '2': 'GND' }, 1)
    // window comparator: each output low on a fault; OK is the diode AND of both. Hysteresis
    // only after a trip, through a diode: 33k pulls VHI and 100k pulls SENSE down by about 0.08 V
    // (8 V of mains), more than the 0.06 V sense ripple: after a trip it reconnects only inside
    // about 205 … 245 V
    .part('U2', 'comparator', -760, 1200, { value: 'LM393', pkg: 'WIN' }, { '3': 'VHI', '2': 'SENSE', '1': 'OVN', '8': V, '4': 'GND' })
    .part('R11', 'resistor', -660, 1140, { value: '10k' }, { '1': V, '2': 'OVN' }, 1)
    .part('R12', 'resistor', -760, 1290, { value: '33k' }, { '1': 'VHI', '2': 'HOV' })
    .part('D5', 'diode', -650, 1290, { value: '1N4148' }, { '2': 'HOV', '1': 'OVN' })
    .part('U3', 'comparator', -760, 1450, { value: 'LM393', pkg: 'WIN' }, { '3': 'SENSE', '2': 'VLO', '1': 'UVN', '8': V, '4': 'GND' })
    .part('R13', 'resistor', -660, 1390, { value: '10k' }, { '1': V, '2': 'UVN' }, 1)
    .part('R14', 'resistor', -760, 1540, { value: '100k' }, { '1': 'SENSE', '2': 'HUV' })
    .part('D6', 'diode', -650, 1540, { value: '1N4148' }, { '2': 'HUV', '1': 'UVN' })
    .part('D7', 'diode', -520, 1200, { value: '1N4148' }, { '2': 'OK', '1': 'OVN' })
    .part('D8', 'diode', -520, 1450, { value: '1N4148' }, { '2': 'OK', '1': 'UVN' })
    .part('CDW', 'capacitor', -880, 1200, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- transfer logic (return delay, dead time, coil-supply lockout, drives, LEDs)
  nb.block('logic');
  transferLogic(nb, X, Y, 9, { ...t, returnC: t.returnC ?? '10u', deadC: t.deadC ?? '680n' }, V);
  for (const k of ['UD1', 'UD3', 'UDT1', 'UDT2']) nb.prop(k, { pkg: 'LOGIC1' });
  nb.prop('UD5', { pkg: 'LOGIC2' })
    .part('UDS1', 'comparator', X(14), Y(13.2), { value: 'LM339', pkg: 'LOGIC2' }, { '3': 'GND', '2': 'VREF', '1': 'GND', '8': V, '4': 'GND' })
    .part('UDS2', 'comparator', X(16), Y(13.2), { value: 'LM339', pkg: 'LOGIC2' }, { '3': 'GND', '2': 'VREF', '1': 'GND', '8': V, '4': 'GND' })
    .part('UDS3', 'comparator', X(18), Y(13.2), { value: 'LM339', pkg: 'LOGIC2' }, { '3': 'GND', '2': 'VREF', '1': 'GND', '8': V, '4': 'GND' })
    .part('CDL1', 'capacitor', X(-0.8), Y(9), { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CDL2', 'capacitor', X(12.5), Y(13.2), { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- contactors: L and N switched, flyback diodes, the mutual NC interlock; load terminals
  nb.block('power')
    .part('K1', 'contactor', 1900, 300, { value: '32 A, coil 24 V DC' }, { A1: 'K1A', A2: 'K1C', '1': 'L1', '2': 'LOAD', '7': 'N1', '8': 'NLOAD', '21': V, '22': 'K2A' })
    .part('D2', 'diode', 1810, 300, { value: '1N4007' }, { '2': 'K1C', '1': 'K1A' }, 3)
    .part('K2', 'contactor', 2300, 300, { value: '32 A, coil 24 V DC' }, { A1: 'K2A', A2: 'K2C', '1': 'L2', '2': 'LOAD', '7': 'N2', '8': 'NLOAD', '21': V, '22': 'K1A' })
    .part('D3', 'diode', 2210, 300, { value: '1N4007' }, { '2': 'K2C', '1': 'K2A' }, 3)
    .part('X6', 'terminal', 2650, 500, { value: 'L load' }, { '1': 'LOAD' }, 2)
    .part('X7', 'terminal', 2650, 560, { value: 'N load' }, { '1': 'NLOAD' }, 2)
    .part('X8', 'terminal', 2650, 620, { value: 'PE' }, { '1': 'GND' }, 2);
  nb.block('load').note('TEST LOAD (not part of the product)', 2750, 440)
    .part('RL', 'resistor', 2800, 530, { value: '51', pmax: '1.5k' }, { '1': 'LOAD', '2': 'NLOAD' }, 1)
    // the load's insulation to PE: refers it to earth while both contactors are open
    .part('RLE', 'resistor', 2900, 620, { value: '1M' }, { '1': 'NLOAD', '2': 'GND' }, 1);
  nb.v('LOAD').v('SENSE').v('OK').i('K1', '1').i('K2', '1');
  nb.sim({ type: 'tran', stop, step: '200u', start: 'zero' });
  return { sheet: nb.done(), nb };
}

/** Three-phase (3P+N) mains / back-up change-over: over- and undervoltage of any phase, phase
 *  loss and phase asymmetry. `phases`: the r.m.s. voltages of L1, L2, L3 (line to neutral). Drawn
 *  as the product (as the single-phase design): terminals, four-pole breakers and contactors,
 *  the 24 V control supply from either source, the sense of every phase, nine comparators and the
 *  transfer logic in four LM339; test sources and load outside the product. */
export function changeover3(phases: [number, number, number] = [230, 230, 230], step?: MainsStep, stop = '12', t: TransferTiming = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const V = '+24V';
  nb.wired = { rails: [V], labelled: ['L1', 'L2', 'L3', 'NMQ', 'B1', 'B2', 'B3', 'NBQ', 'VREF', 'VHI', 'VLO', 'VAS', 'S1', 'S2', 'S3', 'OK', 'OVN', 'UVN', 'K1A', 'K2A', 'K1C', 'K2C', 'K1EN', 'K2EN'] };
  const X = (k: number) => 120 * k, Y = (k: number) => 1700 + 130 * (k - 9);
  nb.para('MAINS / BACK-UP CHANGE-OVER, three-phase 3P+N, 32 A. The load runs from the mains while every phase is within 195 … 253 V and no phase is more than about 10 % below the highest; a lost phase, an over- or undervoltage or an asymmetry switches it to the back-up source. Four-pole contactors switch L1, L2, L3 and N, interlocked through their NC auxiliary contacts.', -1500, -300)
    .para('Each phase: 230/12 V sense transformer with snubber, bridge, 4.7 µF and 68k/10k; the highest phase (diode OR) scaled by 768k/100k sets the asymmetry threshold. Nine comparators: the overvoltage outputs share OVN, the undervoltage and asymmetry outputs share UVN (open collector). Return delay 10.5 s, dead time 0.47 s, coil-supply lockout below 20 V. Control ground bonded to PE.', 0, -300);
  const L = ['1', '2', '3'];

  // ---- test bench: three mains phases 120° apart with the neutral earthed; a three-phase back-up
  nb.block('bench').note('TEST BENCH (not part of the product): mains and back-up, neutrals earthed', -1600, -80);
  phases.forEach((v, k) => {
    nb.part(`VM${k + 1}`, 'vsin', -1500, 60 + 130 * k, { value: String(Number((v * Math.SQRT2).toPrecision(6))), freq: '50', phase: String([0, -120, 120][k]) }, { '1': `LM${k + 1}`, '2': step ? `LS${k + 1}` : 'NM' });
    // the step of each phase: delayed by a further 1/3 and 2/3 period for −120° and +120°
    if (step) nb.part(`VS${k + 1}`, 'vsin', -1600, 60 + 130 * k, { value: String(Number(((step.to[k] - v) * Math.SQRT2).toPrecision(6))), freq: '50', delay: String(Number((step.at + k / 150).toPrecision(9))) }, { '1': `LS${k + 1}`, '2': 'NM' });
  });
  nb.part('RE1', 'resistor', -1400, 460, { value: '0.1' }, { '1': 'NM', '2': 'GND' }, 1)
    .part('VB', 'vsin3', -1500, 700, { value: '230', freq: '50' }, { '1': 'LB1', '2': 'LB2', '3': 'LB3', '4': 'NB' })
    .part('RE2', 'resistor', -1400, 820, { value: '0.1' }, { '1': 'NB', '2': 'GND' }, 1);

  // ---- inputs: terminals, four-pole breakers, surge arresters on every phase (type 3, 300 V AC)
  nb.block('in');
  L.forEach((ph, k) => nb.part(`XM${ph}`, 'terminal', -1250, 30 + 60 * k, { value: `L${ph} mains` }, { '1': `LM${ph}` })
    .part(`XB${ph}`, 'terminal', -1250, 640 + 60 * k, { value: `L${ph} back-up` }, { '1': `LB${ph}` }));
  nb.part('XMN', 'terminal', -1250, 210, { value: 'N mains' }, { '1': 'NM' })
    .part('XBN', 'terminal', -1250, 820, { value: 'N back-up' }, { '1': 'NB' })
    .part('XPE', 'terminal', -1250, 960, { value: 'PE' }, { '1': 'GND' })
    .part('QF1', 'breaker4', -1050, 150, { value: '32', curve: 'C' }, { '1': 'LM1', '2': 'L1', '3': 'LM2', '4': 'L2', '5': 'LM3', '6': 'L3', N1: 'NM', N2: 'NMQ' })
    .part('QF2', 'breaker4', -1050, 760, { value: '32', curve: 'C' }, { '1': 'LB1', '2': 'B1', '3': 'LB2', '4': 'B2', '5': 'LB3', '6': 'B3', N1: 'NB', N2: 'NBQ' });
  // the breakers switch N too: downstream of them the neutrals are NMQ and NBQ
  L.forEach((ph, k) => nb.part(`RVM${ph}`, 'mov', -880 + 80 * k, 300, { value: '14D471K' }, { '1': `L${ph}`, '2': 'NMQ' }, 1)
    .part(`RVB${ph}`, 'mov', -880 + 80 * k, 910, { value: '14D471K' }, { '1': `B${ph}`, '2': 'NBQ' }, 1));

  // ---- 24 V control supply from either source (as the single-phase design)
  const v24 = t.v24 ?? 24.27;
  nb.block('aux');
  for (const [k, Lx, N, y] of [[4, 'L1', 'NMQ', 100], [5, 'B1', 'NBQ', 560]] as const) {
    nb.part(`F${k}`, 'fuse', -600, y, { value: '0.2', r: '2' }, { '1': Lx, '2': `LF${k}` })
      .part(`TRA${k}`, 'transformer', -460, y + 20, { value: '0.13', lp: '20', rp: '140', rs: '1.5', k: '0.995' }, { '1': `LF${k}`, '2': N, '3': `A${k}A`, '4': `A${k}B` })
      .part(`RSA${k}`, 'resistor', -370, y + 110, { value: '47', pmax: '0.5' }, { '1': `A${k}A`, '2': `SA${k}X` }, 1)
      .part(`CSA${k}`, 'capacitor', -370, y + 200, { value: '1u', vmax: '100' }, { '1': `SA${k}X`, '2': `A${k}B` }, 1)
      .part(`BRA${k}`, 'bridge', -250, y + 40, { value: 'DB107' }, { '1': `A${k}A`, '2': `A${k}B`, '3': 'VRAW', '4': 'GND' });
  }
  nb.part('C5', 'capacitor_pol', -120, 380, { value: '2200u', vmax: '63' }, { '1': 'VRAW', '2': 'GND' }, 1)
    .part('U4', 'lm317', 0, 340, { value: 'LM317HV', heatsink: '8' }, { '3': 'VRAW', '1': 'ADJ', '2': V })
    .part('R15', 'resistor', 90, 370, { value: '240' }, { '1': V, '2': 'ADJ' }, 1)
    .part('R16', 'resistor', 0, 430, { value: v24 === 24.27 ? '4.42k' : String(Math.round(240 * (v24 / 1.25 - 1))) }, { '1': 'ADJ', '2': 'GND' }, 1)
    .part('C6', 'capacitor_pol', 180, 380, { value: '100u', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- sense of each phase, and the highest of them
  nb.block('sense');
  L.forEach((ph, k) => {
    const y = 1150 + 230 * k;
    nb.part(`TR${ph}`, 'transformer', -1450, y, SENSE_TR, { '1': `L${ph}`, '2': 'NMQ', '3': `SA${ph}`, '4': `SB${ph}` })
      .part(`RS${ph}`, 'resistor', -1340, y + 80, { value: '220' }, { '1': `SA${ph}`, '2': `SN${ph}` }, 1)
      .part(`CS${ph}`, 'capacitor', -1270, y + 80, { value: '100n', vmax: '63' }, { '1': `SN${ph}`, '2': `SB${ph}` }, 1)
      .part(`BR${ph}`, 'bridge', -1150, y + 20, { value: 'DB107' }, { '1': `SA${ph}`, '2': `SB${ph}`, '3': `VSR${ph}`, '4': 'GND' })
      .part(`C${ph}`, 'capacitor_pol', -1050, y + 20, { value: '4.7u', vmax: '35' }, { '1': `VSR${ph}`, '2': 'GND' }, 1)
      .part(`RA${ph}`, 'resistor', -970, y - 50, { value: '68k' }, { '1': `VSR${ph}`, '2': `S${ph}` })
      .part(`RB${ph}`, 'resistor', -900, y + 20, { value: '10k' }, { '1': `S${ph}`, '2': 'GND' }, 1)
      .part(`DM${ph}`, 'diode', -970, y + 110, { value: '1N4148' }, { '2': `VSR${ph}`, '1': 'VMAX' });
  });
  nb.part('RM1', 'resistor', -800, 1450, { value: '768k' }, { '1': 'VMAX', '2': 'VAS' }, 1)
    .part('RM2', 'resistor', -800, 1540, { value: '100k' }, { '1': 'VAS', '2': 'GND' }, 1)
    .part('CM', 'capacitor', -720, 1540, { value: '100n', vmax: '50' }, { '1': 'VAS', '2': 'GND' }, 1)
    // reference and thresholds as in the single-phase design
    .part('R3', 'resistor', -1450, 1880, { value: '3.3k' }, { '1': V, '2': 'VREF' })
    .part('U1', 'tl431', -1350, 1970, { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' }, 3)
    .part('R4', 'resistor', -1240, 1940, { value: '2.1k' }, { '1': 'VREF', '2': 'VHI' }, 1)
    .part('R5', 'resistor', -1240, 2030, { value: '4.22k' }, { '1': 'VHI', '2': 'VLO' }, 1)
    .part('R6', 'resistor', -1240, 2120, { value: '12.1k' }, { '1': 'VLO', '2': 'GND' }, 1);

  // ---- per phase: overvoltage (low while S > VHI), undervoltage (low while S < VLO) and
  // asymmetry (low while S < VAS); the undervoltage hysteresis pulls each sense down after a trip
  nb.block('window');
  const pkW = ['WIN1', 'WIN1', 'WIN1', 'WIN1', 'WIN2', 'WIN2', 'WIN2', 'WIN2', 'LOGIC2'];
  L.forEach((ph, k) => {
    const x = 380 * k, y = 1050;
    nb.part(`UO${ph}`, 'comparator', x, y, { value: 'LM339', pkg: pkW[3 * k] }, { '3': 'VHI', '2': `S${ph}`, '1': 'OVN', '8': V, '4': 'GND' })
      .part(`UU${ph}`, 'comparator', x, y + 150, { value: 'LM339', pkg: pkW[3 * k + 1] }, { '3': `S${ph}`, '2': 'VLO', '1': 'UVN', '8': V, '4': 'GND' })
      .part(`UA${ph}`, 'comparator', x, y + 300, { value: 'LM339', pkg: pkW[3 * k + 2] }, { '3': `S${ph}`, '2': 'VAS', '1': 'UVN', '8': V, '4': 'GND' })
      .part(`RH${ph}`, 'resistor', x + 150, y + 210, { value: '100k' }, { '1': `S${ph}`, '2': `HU${ph}` })
      .part(`DH${ph}`, 'diode', x + 270, y + 210, { value: '1N4148' }, { '2': `HU${ph}`, '1': 'UVN' });
  });
  nb.part('R11', 'resistor', 1150, 990, { value: '10k' }, { '1': V, '2': 'OVN' }, 1)
    .part('R13', 'resistor', 1150, 1140, { value: '10k' }, { '1': V, '2': 'UVN' }, 1)
    .part('R12', 'resistor', 1250, 1250, { value: '33k' }, { '1': 'VHI', '2': 'HOV' })
    .part('D5', 'diode', 1370, 1250, { value: '1N4148' }, { '2': 'HOV', '1': 'OVN' })
    .part('D7', 'diode', 1370, 1050, { value: '1N4148' }, { '2': 'OK', '1': 'OVN' })
    .part('D8', 'diode', 1370, 1150, { value: '1N4148' }, { '2': 'OK', '1': 'UVN' })
    .part('CDW1', 'capacitor', -120, 1050, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CDW2', 'capacitor', -120, 1350, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- transfer logic (as the single-phase design)
  nb.block('logic');
  transferLogic(nb, X, Y, 9, { ...t, returnC: t.returnC ?? '10u', deadC: t.deadC ?? '680n' }, V);
  for (const k of ['UD1', 'UD3', 'UDT1', 'UDT2']) nb.prop(k, { pkg: 'LOGIC1' });
  nb.prop('UD5', { pkg: 'LOGIC2' })
    .part('UDS1', 'comparator', X(14), Y(13.2), { value: 'LM339', pkg: 'LOGIC2' }, { '3': 'GND', '2': 'VREF', '1': 'GND', '8': V, '4': 'GND' })
    .part('UDS2', 'comparator', X(16), Y(13.2), { value: 'LM339', pkg: 'LOGIC2' }, { '3': 'GND', '2': 'VREF', '1': 'GND', '8': V, '4': 'GND' })
    .part('CDL1', 'capacitor', X(-0.8), Y(9), { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CDL2', 'capacitor', X(12.5), Y(13.2), { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- four-pole contactors with flyback diodes and the NC interlock; load terminals
  nb.block('power')
    .part('K1', 'contactor', 1900, 300, { value: '32 A, coil 24 V DC' }, { A1: 'K1A', A2: 'K1C', '1': 'L1', '2': 'T1', '3': 'L2', '4': 'T2', '5': 'L3', '6': 'T3', '7': 'NMQ', '8': 'TN', '21': V, '22': 'K2A' })
    .part('D2', 'diode', 1810, 300, { value: '1N4007' }, { '2': 'K1C', '1': 'K1A' }, 3)
    .part('K2', 'contactor', 2300, 300, { value: '32 A, coil 24 V DC' }, { A1: 'K2A', A2: 'K2C', '1': 'B1', '2': 'T1', '3': 'B2', '4': 'T2', '5': 'B3', '6': 'T3', '7': 'NBQ', '8': 'TN', '21': V, '22': 'K1A' })
    .part('D3', 'diode', 2210, 300, { value: '1N4007' }, { '2': 'K2C', '1': 'K2A' }, 3);
  L.forEach((ph, k) => nb.part(`XL${ph}`, 'terminal', 2700, 480 + 60 * k, { value: `L${ph} load` }, { '1': `T${ph}` }, 2));
  nb.part('XLN', 'terminal', 2700, 660, { value: 'N load' }, { '1': 'TN' }, 2)
    .part('XLPE', 'terminal', 2700, 720, { value: 'PE' }, { '1': 'GND' }, 2);
  nb.block('load').note('TEST LOAD (not part of the product): 3 × 51 Ω star', 2800, 420);
  L.forEach((ph, k) => nb.part(`RL${ph}`, 'resistor', 2850 + 80 * k, 560, { value: '51', pmax: '1.5k' }, { '1': `T${ph}`, '2': 'TN' }, 1));
  nb.part('RN', 'resistor', 3100, 700, { value: '1M' }, { '1': 'TN', '2': 'GND' }, 1);
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
 *  r.m.s. voltage. Drawn as the product's circuit diagram: terminals, the 12 V control supply from
 *  the mains, the control (LM339 packages with decoupling), the tap relays and their contact
 *  chain, the output relay with its restart delay and the independent output protection; the
 *  supply and the load of a test bench are drawn outside the product. `o.delayC`: the restart
 *  delay capacitor (product 4.7 µF film: about 7.6 s; tests use smaller ones). */
export function stabiliser(vin = 230, step?: MainsStep, stop = '9', ladder = STAB_LADDER, o: { delayC?: string } = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  nb.wired = { rails: ['+12V'], labelled: ['VIN', 'N', 'T5', 'SF', 'VREF', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'OD', 'DLY'] };
  const V = '+12V';
  nb.para('MAINS VOLTAGE STABILISER 1 kVA, relay-switched taps. The input is connected to one tap of a 1 kVA autotransformer (150 … 280 V); the output is taken from its 230 V tap: V_out = V_in·230/tap, within about ±6 % for 140 … 300 V in. Six 12 V relays in a chain choose the tap: each relay\'s NC contact feeds the next relay, so two taps are never connected, not even while a relay changes over.', -1250, -300)
    .para('LM339 comparators against a TL431 ladder (E96) switch at 160 / 180 / 200 / 220 / 240 / 265 V of input, with about 3 V hysteresis. The output relay K7 connects the load after a restart delay of about 8 s; an independent protection (own sense transformer, reference and LM339) opens it outside 190 … 255 V. LEDs: one per tap relay, OUTPUT, FAULT. Control ground is bonded to PE (PELV); the mains neutral N is a separate conductor.', -50, -300);
  // ---- test bench: the supply (earthed neutral, TN system) — not part of the product
  nb.block('bench').note('TEST BENCH (not part of the product): mains supply with its neutral earthed at the transformer', -1250, -60);
  nb.part('VIN', 'vsin', -1150, 100, { value: String(Number((vin * Math.SQRT2).toPrecision(6))), freq: '50' }, { '1': 'L_IN', '2': step ? 'L_STEP' : 'N' });
  if (step) nb.part('VS', 'vsin', -1150, 220, { value: String(Number(((step.to[0] - vin) * Math.SQRT2).toPrecision(6))), freq: '50', delay: String(step.at) }, { '1': 'L_STEP', '2': 'N' });
  nb.part('RE', 'resistor', -1050, 300, { value: '0.1' }, { '1': 'N', '2': 'GND' }, 1);

  // ---- input: terminals, breaker, surge arrester
  nb.block('in')
    .part('X1', 'terminal', -900, 70, { value: 'L in' }, { '1': 'L_IN' })
    .part('X2', 'terminal', -900, 130, { value: 'N in' }, { '1': 'N' })
    .part('X3', 'terminal', -900, 190, { value: 'PE' }, { '1': 'GND' })
    .part('QF1', 'breaker1', -760, 70, { value: '10', curve: 'C' }, { '1': 'L_IN', '2': 'VIN' }, 3)
    // surge protection inside the unit (type 3), 300 V AC: survives a lost neutral (up to 400 V)
    // only for seconds, so the output cut-off protects the load meanwhile
    .part('RV1', 'mov', -640, 100, { value: '14D471K' }, { '1': 'VIN', '2': 'N' }, 1);

  // ---- 12 V control supply from the input: 24 V transformer, bridge, LM317HV (12 V at any
  // input from 140 to 300 V: 16 … 45 V before the regulator)
  nb.block('aux')
    .part('F1', 'fuse', -840, 400, { value: '0.2', r: '2' }, { '1': 'VIN', '2': 'VF' })
    .part('TR3', 'transformer', -700, 420, { value: '0.13', lp: '20', rp: '140', rs: '1.5', k: '0.995' }, { '1': 'VF', '2': 'N', '3': 'AA', '4': 'AB' })
    // the leakage inductance rings with the bridge capacitance when the bridge stops conducting
    .part('RS3', 'resistor', -610, 530, { value: '47', pmax: '0.5' }, { '1': 'AA', '2': 'SN3' }, 1)
    .part('CS3', 'capacitor', -610, 620, { value: '1u', vmax: '100' }, { '1': 'SN3', '2': 'AB' }, 1)
    .part('BR3', 'bridge', -560, 440, { value: 'DB107' }, { '1': 'AA', '2': 'AB', '3': 'VRAW', '4': 'GND' })
    .part('C5', 'capacitor_pol', -470, 440, { value: '2200u', vmax: '63' }, { '1': 'VRAW', '2': 'GND' }, 1)
    .part('U5', 'lm317', -360, 400, { value: 'LM317HV', heatsink: '8' }, { '3': 'VRAW', '1': 'ADJ', '2': V })
    .part('R13', 'resistor', -280, 430, { value: '240' }, { '1': V, '2': 'ADJ' }, 1)
    .part('R14', 'resistor', -360, 490, { value: '2.05k' }, { '1': 'ADJ', '2': 'GND' }, 1)
    .part('C6', 'capacitor_pol', -200, 440, { value: '100u', vmax: '25' }, { '1': V, '2': 'GND' }, 1);

  // ---- input sense: isolating transformer, bridge, divider, filtered to the mean (τ 47 ms)
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

  // ---- reference and threshold ladder N1 … N6 (E96), one threshold per step
  nb.block('ref')
    .part('R4', 'resistor', -1100, 1110, { value: '2.2k' }, { '1': V, '2': 'VREF' })
    .part('U1REF', 'tl431', -1000, 1200, { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' }, 3);
  const lad = ['GND', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'VREF'];
  ladder.forEach((r, k) => nb.part(`RL${k + 1}`, 'resistor', -880 + 90 * k, 1270, { value: r }, { '1': lad[k], '2': lad[k + 1] }));

  // ---- tap relays: per step k a comparator (relay k on while the input is below its
  // threshold), a driver and the relay; the first relay that is on in the chain connects its tap
  nb.block('taps');
  const chain = ['VIN', 'C2N', 'C3N', 'C4N', 'C5N', 'C6N'];
  const pk = (k: number) => (k < 4 ? 'TAPS1' : 'TAPS2');
  for (let k = 0; k < 6; k++) {
    const n = k + 1, x = 380 * k, tap = `T${n}`, next = k < 5 ? chain[k + 1] : 'T7';
    nb.part(`U${n + 1}`, 'comparator', x, 150, { value: 'LM339', pkg: pk(k) }, { '3': `N${n}`, '2': 'SF', '1': `O${n}`, '8': V, '4': 'GND' })
      .part(`RF${n}`, 'resistor', x, 60, { value: '1M' }, { '1': `N${n}`, '2': `O${n}` })
      .part(`RP${n}`, 'resistor', x + 90, 90, { value: '2.2k' }, { '1': V, '2': `O${n}` }, 1)
      .part(`RB${n}`, 'resistor', x + 40, 300, { value: '2.2k' }, { '1': `O${n}`, '2': `B${n}` }, 1)
      .part(`Q${n}`, 'npn', x + 70, 420, { value: 'BD139' }, { '1': `B${n}`, '2': `K${n}`, '3': 'GND' })
      .part(`D${n}`, 'diode', x + 170, 330, { value: '1N4148' }, { '2': `K${n}`, '1': V }, 3)
      // 30 A relays for a 4.5 A load: contact wear, the main field failure of stabilisers, falls
      // with about the square of the margin (more than 1 million operations here)
      .part(`K${n}`, 'relay', x + 220, 330, { value: '12 V 30 A' }, { '1': V, '2': `K${n}`, '3': chain[k], '5': tap, '4': next })
      // diagnostics: an LED beside each coil shows which relay is energised
      .part(`LK${n}`, 'led', x + 120, 250, { colour: 'yellow' }, { '2': V, '1': `LKA${n}` }, 1)
      .part(`RLK${n}`, 'resistor', x + 120, 340, { value: '2.2k' }, { '1': `LKA${n}`, '2': `K${n}` }, 1)
      // contact protection: an RC (100 Ω + 100 nF X2) across each contact takes the winding's
      // current while the contact opens, instead of an arc that erodes it
      .part(`RSC${n}`, 'resistor', x + 200, 490, { value: '100', pmax: '1' }, { '1': chain[k], '2': `SNC${n}` }, 1)
      .part(`CSC${n}`, 'capacitor', x + 200, 580, { value: '100n', vmax: '630' }, { '1': `SNC${n}`, '2': next }, 1)
      .part(`RSA${n}`, 'resistor', x + 310, 490, { value: '100', pmax: '1' }, { '1': chain[k], '2': `SNA${n}` }, 1)
      .part(`CSA${n}`, 'capacitor', x + 310, 580, { value: '100n', vmax: '630' }, { '1': `SNA${n}`, '2': tap }, 1);
  }
  nb.part('CD1', 'capacitor', -150, 150, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CD2', 'capacitor', 1340, 0, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);
  // the autotransformer: taps on the left, towards the relays
  nb.part('T1', 'autotransformer', 2430, 640, { value: '1 kVA 230 V, taps 150–280 V' }, { N: 'N', T1: 'T1', T2: 'T2', T3: 'T3', T4: 'T4', T5: 'T5', T6: 'T6', T7: 'T7' }, 0, true);

  // ---- output: restart delay, output relay, terminals. After power-on and after any cut-off
  // the load waits RD·CD·ln 5 (1 MΩ as two 470k + 68k, below the leakage of a humid board;
  // 4.7 µF film): the comparator compares against 80 % of the 12 V rail, so the delay does not
  // depend on the rail; DDIS empties CD at once when the supply goes
  nb.block('out')
    .part('RD1', 'resistor', 2730, 60, { value: '470k' }, { '1': V, '2': 'RDA' }, 1)
    .part('RD2', 'resistor', 2730, 150, { value: '470k' }, { '1': 'RDA', '2': 'RDB' }, 1)
    .part('RD3', 'resistor', 2730, 240, { value: '68k' }, { '1': 'RDB', '2': 'DLY' }, 1)
    .part('DDIS', 'diode', 2650, 240, { value: '1N4148' }, { '2': 'DLY', '1': V }, 3)
    .part('CD', 'capacitor', 2730, 360, { value: o.delayC ?? '4.7u', vmax: '63' }, { '1': 'DLY', '2': 'GND' }, 1)
    .part('RT1', 'resistor', 2880, 60, { value: '2.49k' }, { '1': V, '2': 'DTH' }, 1)
    .part('RT2', 'resistor', 2880, 150, { value: '10k' }, { '1': 'DTH', '2': 'GND' }, 1)
    .part('U8', 'comparator', 2880, 280, { value: 'LM339', pkg: 'TAPS2' }, { '3': 'DLY', '2': 'DTH', '1': 'OD', '8': V, '4': 'GND' })
    .part('RPD', 'resistor', 2970, 230, { value: '2.2k' }, { '1': V, '2': 'OD' }, 1)
    .part('RBD', 'resistor', 2970, 380, { value: '2.2k' }, { '1': 'OD', '2': 'BD' }, 1)
    .part('QD', 'npn', 3000, 500, { value: 'BD139' }, { '1': 'BD', '2': 'KD', '3': 'GND' })
    .part('DD', 'diode', 3050, 410, { value: '1N4148' }, { '2': 'KD', '1': V }, 3)
    .part('KO', 'relay', 3100, 410, { value: '12 V 30 A' }, { '1': V, '2': 'KD', '3': 'T5', '5': 'OUT' })
    .part('LKO', 'led', 3190, 280, { colour: 'green' }, { '2': V, '1': 'LKOA' }, 1)
    .part('RLKO', 'resistor', 3190, 370, { value: '2.2k' }, { '1': 'LKOA', '2': 'KD' }, 1)
    .part('X4', 'terminal', 3380, 600, { value: 'L out' }, { '1': 'OUT' }, 2)
    .part('X5', 'terminal', 3380, 660, { value: 'N out' }, { '1': 'N' }, 2)
    .part('X6', 'terminal', 3380, 720, { value: 'PE' }, { '1': 'GND' }, 2)
    // spare comparator of the package: + to ground, − to a reference, so its output is held low
    .part('U8S', 'comparator', 2880, 700, { value: 'LM339', pkg: 'TAPS2' }, { '3': 'GND', '2': 'DTH', '1': 'GND', '8': V, '4': 'GND' });
  nb.block('load').note('TEST LOAD (not part of the product)', 3480, 540)
    .part('RLOAD', 'resistor', 3530, 640, { value: '56', pmax: '1.5k' }, { '1': 'OUT', '2': 'N' }, 1);

  // ---- independent output protection (its own sense transformer, reference and LM339): the
  // 230 V tap must stay within 190 … 255 V, or the output relay opens and the restart delay
  // starts again; a welded tap relay or a failed control cannot put the load out of range
  nb.block('prot').note('OUTPUT PROTECTION (independent of the control)', 0, 920)
    .part('TR2', 'transformer', 50, 1040, SENSE_TR, { '1': 'T5', '2': 'N', '3': 'SA2', '4': 'SB2' })
    .part('RS2', 'resistor', 160, 1120, { value: '220' }, { '1': 'SA2', '2': 'SN2' }, 1)
    .part('CS2', 'capacitor', 160, 1210, { value: '100n', vmax: '63' }, { '1': 'SN2', '2': 'SB2' }, 1)
    .part('BR2', 'bridge', 270, 1060, { value: 'DB107' }, { '1': 'SA2', '2': 'SB2', '3': 'VSR2', '4': 'GND' })
    .part('C3', 'capacitor_pol', 370, 1060, { value: '4.7u', vmax: '35' }, { '1': 'VSR2', '2': 'GND' }, 1)
    .part('R5', 'resistor', 450, 990, { value: '68k' }, { '1': 'VSR2', '2': 'SEN2' })
    .part('R6', 'resistor', 520, 1060, { value: '10k' }, { '1': 'SEN2', '2': 'GND' }, 1)
    .part('R7', 'resistor', 590, 990, { value: '100k' }, { '1': 'SEN2', '2': 'SF2' })
    .part('C4', 'capacitor', 660, 1060, { value: '470n', vmax: '50' }, { '1': 'SF2', '2': 'GND' }, 1)
    .part('R8', 'resistor', 50, 1320, { value: '2.2k' }, { '1': V, '2': 'VREF2' })
    .part('U9', 'tl431', 150, 1410, { value: 'TL431' }, { '1': 'VREF2', '2': 'GND', '3': 'VREF2' }, 3)
    .part('R9', 'resistor', 250, 1380, { value: '1.82k' }, { '1': 'VREF2', '2': 'VOV' }, 1)
    .part('R10', 'resistor', 250, 1470, { value: '3.65k' }, { '1': 'VOV', '2': 'VUV' }, 1)
    .part('R11', 'resistor', 250, 1560, { value: '10k' }, { '1': 'VUV', '2': 'GND' }, 1)
    .part('U10', 'comparator', 500, 1290, { value: 'LM339', pkg: 'PROT' }, { '3': 'VOV', '2': 'SF2', '1': 'FLTS', '8': V, '4': 'GND' })
    .part('U11', 'comparator', 500, 1470, { value: 'LM339', pkg: 'PROT' }, { '3': 'SF2', '2': 'VUV', '1': 'FLTS', '8': V, '4': 'GND' })
    .part('R12', 'resistor', 620, 1230, { value: '10k' }, { '1': V, '2': 'FLTS' }, 1)
    .part('DF1', 'diode', 750, 1340, { value: '1N4148' }, { '2': 'OD', '1': 'FLTS' })
    .part('DF2', 'diode', 750, 1490, { value: '1N4148' }, { '2': 'DLY', '1': 'DF2K' })
    // the delay capacitor discharges through 2.2k: the comparator output stays below its 16 mA
    .part('RDF2', 'resistor', 860, 1490, { value: '2.2k' }, { '1': 'DF2K', '2': 'FLTS' })
    .part('LF', 'led', 880, 1240, { colour: 'red' }, { '2': V, '1': 'LFA' }, 1)
    .part('RLF', 'resistor', 880, 1340, { value: '4.7k' }, { '1': 'LFA', '2': 'FLTS' }, 1)
    .part('U12S', 'comparator', 500, 1660, { value: 'LM339', pkg: 'PROT' }, { '3': 'GND', '2': 'VREF2', '1': 'GND', '8': V, '4': 'GND' })
    .part('U13S', 'comparator', 500, 1820, { value: 'LM339', pkg: 'PROT' }, { '3': 'GND', '2': 'VREF2', '1': 'GND', '8': V, '4': 'GND' })
    .part('CD3', 'capacitor', 650, 1660, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);
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
 *  → 48 V LiFePO4 battery (16 cells). Analogue control: the PV voltage is held at 0.826 × the
 *  array's open-circuit voltage, sampled every 10 s (fractional-Voc MPPT), the battery voltage limited to 56.6 V
 *  (3.54 V per cell) and the charge current to 80 A; the lowest of the three error amplifiers
 *  sets the duty cycle. */
export function mpptCharger(o: ChargerOptions = {}): { sheet: Sheet; nb: NB } {
  const g = o.g ?? 1000, vbat = o.vbat ?? 52;
  // each power semiconductor on its own heatsink area: 0.5 K/W pad + 1.0 K/W share of the
  // heatsink (one extruded profile of 0.33 K/W for all of them, natural convection)
  const HS = '1.5';
  const nb = new NB();
  // V12: the 12 V control supply (from the PV input); VREF, VREF2: control and protection references
  nb.wired = { rails: ['V12'], labelled: ['PVP', 'VREF', 'VREF2', 'VO', 'BN', 'BF', 'BDN', 'FLT', 'FLT2', 'LFA2', 'GPV', 'SPV', 'ISA', 'ISF', 'IREF', 'VPS', 'VBS', 'VSET', 'RUN', 'PWM', 'SW', 'G1', 'VCMD', 'GD', 'GB', 'GB2', 'NBT'] };
  nb.para('MPPT SOLAR CHARGER, one 3.7 kW unit: 9 × 410 Wp (3 in series, 3 strings) into a 48 V LiFePO4 battery through a 20 kHz buck converter (IRFP4668, STTH6003, 56 µH, film capacitors), a 100 A battery fuse and an ideal diode in the battery\'s negative lead. The control is supplied from the PV input (it works whenever there is sun to convert).', -1600, -300)
    .para('Control from discrete parts: 555 ramp and LM393 PWM comparator, IR2184-type driver with bootstrap; average current-mode control: an inner current loop, its reference (80 A at most) lowered by the MPPT loop (PV held at 0.826 × its open-circuit voltage, sampled every 10 s) and the CV loop (battery at most 56.6 V, 3.54 V per cell).', -100, -300)
    .para('Protections (DFMEA): reversed PV or battery, reverse current, battery cut off by its BMS (fast stop, TVS), independent overvoltage latch at 57.6 V (Q1 shorted), battery 0 … 50 °C, heatsink 90 °C, surge varistor. LEDs: CHARGING, FAULT. Sizing: 5 kWh: RLIM 15k (48 A); 10 kWh: 1 unit; 15–20 kWh: 2 units; 30 kWh: 3 units, each with its own array and battery fuse.', 1400, -300);

  // ---- test bench: the PV array — not part of the product
  nb.block('bench').note('PV ARRAY (not part of the product)', -1700, 120)
    .part('PV', 'pv', -1600, 300, { value: '410 Wp, 108 half-cells mono', ns: '3', np: '3', g: String(g) }, o.pvReversed ? { '1': 'PVN', '2': 'PVP' } : { '1': 'PVP', '2': 'PVN' });

  // ---- PV input: terminals, varistor (type 3; the array needs its own DC SPD), the
  // reverse-polarity and fault disconnect QPV / QPV2 (back to back in the negative lead, common
  // source SPV): QPV blocks a reversed array, QPV2 lets the fault latch cut a correct one off
  nb.block('pvin')
    .part('XPVP', 'terminal', -1450, 250, { value: 'PV+' }, { '1': 'PVP' })
    .part('XPVN', 'terminal', -1450, 360, { value: 'PV−' }, { '1': 'PVN' })
    .part('RVPV', 'mov', -1300, 300, { value: '14D201K' }, { '1': 'PVP', '2': 'PVN' }, 1)
    .part('QPV', 'nmos', -1150, 470, { value: 'IRFP4668', heatsink: HS }, { '1': 'GPV', '2': 'PVN', '3': 'SPV' })
    .part('QPV2', 'nmos', -1140, 620, { value: 'IRFP4668', heatsink: HS }, { '1': 'GPV', '2': 'GND', '3': 'SPV' }, 2)
    .part('RGPV', 'resistor', -1300, 450, { value: '470k' }, { '1': 'PVP', '2': 'GPV' }, 1)
    .part('DZPV', 'zener', -1300, 560, { value: 'BZX55C12' }, { '1': 'GPV', '2': 'SPV' }, 3)
    // on a fault the optocoupler holds the gates at SPV: SPV floats against GND until the
    // FETs conduct, so a transistor driven from the GND-referenced fault line would hold them off
    .part('OPV', 'opto', -1000, 540, { value: 'PC817' }, { '1': 'FLT2', '2': 'LFA2', '4': 'GPV', '3': 'SPV' }, 0, true);

  // ---- 12 V control supply from the PV input: a high-voltage emitter follower (MJE340 on the
  // heatsink) from a 13 V Zener; its base current (22k) limits the output current inherently
  nb.block('aux')
    .part('RZA', 'resistor', -1450, 860, { value: '22k', pmax: '1' }, { '1': 'PVP', '2': 'ZA' }, 1)
    .part('DZA', 'zener', -1450, 970, { value: 'BZX55C13' }, { '1': 'ZA', '2': 'GND' }, 3)
    .part('CZA', 'capacitor_pol', -1370, 970, { value: '10u', vmax: '25' }, { '1': 'ZA', '2': 'GND' }, 1)
    .part('QA', 'npn', -1270, 860, { value: 'MJE340', heatsink: HS }, { '1': 'ZA', '2': 'PVP', '3': 'V12' })
    .part('CAUX', 'capacitor_pol', -1170, 940, { value: '100u', vmax: '25' }, { '1': 'V12', '2': 'GND' }, 1);

  // ---- power stage: input capacitors (film: no electrolyte to dry out in a hot enclosure),
  // high-side switch, freewheeling diode with snubber, inductor, output capacitors, TVS, fuse
  nb.block('power');
  for (let k = 0; k < 4; k++) nb.part(`CIN${k + 1}`, 'capacitor', -900 + 70 * k, 330, { value: '47u', vmax: '250' }, { '1': 'PVP', '2': 'GND' }, 1);
  nb.part('Q1', 'nmos', -560, 200, { value: 'IRFP4668', heatsink: HS }, { '1': 'G1', '2': 'PVP', '3': 'SW' })
    .part('D1', 'diode', -480, 340, { value: 'STTH6003', heatsink: HS }, { '1': 'SW', '2': 'GND' }, 3)
    // snubber: damps the ringing of L1 with the diode's capacitance in discontinuous conduction
    .part('RSN', 'resistor', -400, 340, { value: '220', pmax: '1' }, { '1': 'SW', '2': 'SNB' }, 1)
    .part('CSN', 'capacitor', -400, 430, { value: '1n', vmax: '630' }, { '1': 'SNB', '2': 'GND' }, 1)
    .part('L1', 'inductor', -300, 230, { value: '56u', imax: '100' }, { '1': 'SW', '2': 'VO' });
  for (let k = 0; k < 3; k++) nb.part(`COUT${k + 1}`, 'capacitor', -190 + 70 * k, 330, { value: '47u', vmax: '100' }, { '1': 'VO', '2': 'GND' }, 1);
  // the inductor's energy when a BMS cuts the battery off during charging
  nb.part('DTV', 'tvs', 30, 330, { value: '5KP64A' }, { '1': 'VO', '2': 'GND' }, 3)
    .part('FB', 'fuse', 150, 230, { value: '100', r: '0.3m' }, { '1': 'VO', '2': o.bmsOpenAt ? 'BMSI' : 'BATP' })
    .part('XBP', 'terminal', 330, 230, { value: 'BAT+' }, { '1': o.bmsOpenAt ? 'BMSI' : 'BATP' }, 2)
    .part('XBN', 'terminal', 330, 560, { value: 'BAT−' }, { '1': 'BNB' }, 2)
    // the battery's negative lead: QB2 (on unless the overvoltage latch has tripped; then its
    // body diode blocks the charge current too) back to back with QB, the ideal diode: QB's body
    // diode passes the charge current and blocks any current from the battery back into the
    // converter (200 A when the battery meets the empty capacitors; a drain into the array at
    // night); above about 6 A of charge current U12 turns its channel on
    .part('QB2', 'nmos', 210, 550, { value: 'IRFP4468', heatsink: HS }, { '1': 'GB2', '2': 'BNB', '3': 'BN' }, 1)
    .part('QB', 'nmos', 60, 570, { value: 'IRFP4468', heatsink: HS }, { '1': 'GB', '2': 'BF', '3': 'BN' }, 3)
    .part('RSH', 'resistor', -70, 560, { value: '1m', pmax: '10' }, { '1': 'GND', '2': 'BF' });

  // ---- the battery (test bench), with its BMS contactor for the fault case and its NTC
  nb.block('battery').note('BATTERY with its BMS and temperature sensor (not part of the product)', 450, 120)
    .part('BAT', 'battery', 560, 400, { value: String(vbat), rint: '0.02' }, o.batteryReversed ? { '1': 'BNB', '2': 'BATP' } : { '1': 'BATP', '2': 'BNB' })
    .part('NTB', 'ntc', 700, 400, { value: '10k', beta: '3950', temp: String(o.tbat ?? 25) }, { '1': 'VREF', '2': 'NBT' }, 1);
  if (o.bmsOpenAt) nb.part('KBMS', 'relay', 560, 220, { value: '12 V 30 A' }, { '1': 'BMSC', '2': 'GND', '3': 'BMSI', '5': 'BATP' })
    .part('VBMS', 'vpulse', 700, 220, { value: '12', low: '0', freq: '1', duty: String(o.bmsOpenAt * 100), delay: '0', edge: '10u' }, { '1': 'BMSC', '2': 'GND' });

  // ---- gate drives of QB2 and QB, referred to their sources (the battery's negative terminal
  // BN, which sits up to 52 V below GND while the output capacitors are still empty: a gate
  // driven against GND would turn QB on there and let the battery discharge into COUT)
  nb.block('bdrive')
    .part('QD2', 'pnp', 300, 760, { value: 'BD140' }, { '1': 'BQ2', '2': 'GD2', '3': 'V12' })
    .part('RBQ2', 'resistor', 180, 760, { value: '47k' }, { '1': 'FLT', '2': 'BQ2' })
    .part('RBEQ2', 'resistor', 250, 690, { value: '10k' }, { '1': 'V12', '2': 'BQ2' }, 1)
    .part('RGD2', 'resistor', 310, 850, { value: '47k' }, { '1': 'GD2', '2': 'GB2' }, 1)
    .part('RGS2', 'resistor', 380, 940, { value: '100k' }, { '1': 'GB2', '2': 'BN' }, 1)
    .part('DZB2', 'zener', 450, 940, { value: 'BZX55C12' }, { '1': 'GB2', '2': 'BN' }, 3)
    // QB on above about 6 A: the current filtered over 1 ms, so the switching ripple does not toggle it
    .part('RIF', 'resistor', -600, 800, { value: '10k' }, { '1': 'ISA', '2': 'ISF' })
    .part('CIF', 'capacitor', -520, 870, { value: '100n', vmax: '50' }, { '1': 'ISF', '2': 'GND' }, 1)
    .part('RTH1', 'resistor', -600, 1000, { value: '27k' }, { '1': 'VREF', '2': 'ITH' })
    .part('RTH2', 'resistor', -520, 1070, { value: '3.3k' }, { '1': 'ITH', '2': 'GND' }, 1)
    .part('U12', 'comparator', -380, 900, { value: 'LM393', pkg: 'PROT2' }, { '3': 'ITH', '2': 'ISF', '1': 'BDN', '8': 'V12', '4': 'GND' })
    .part('RBU', 'resistor', -290, 840, { value: '10k' }, { '1': 'V12', '2': 'BDN' }, 1)
    // base–emitter resistor: QD stays off whenever it is not driven (a load on BDN must not turn it on)
    .part('RBD', 'resistor', -200, 900, { value: '10k' }, { '1': 'BDN', '2': 'BQD' })
    .part('RBEQ', 'resistor', -130, 830, { value: '10k' }, { '1': 'V12', '2': 'BQD' }, 1)
    .part('QD', 'pnp', -60, 900, { value: 'BD140' }, { '1': 'BQD', '2': 'GD', '3': 'V12' })
    .part('RGD', 'resistor', -50, 990, { value: '47k' }, { '1': 'GD', '2': 'GB' }, 1)
    .part('RGS', 'resistor', 20, 1080, { value: '100k' }, { '1': 'GB', '2': 'BN' }, 1)
    .part('DZB', 'zener', 90, 1080, { value: 'BZX55C12' }, { '1': 'GB', '2': 'BN' }, 3)
    // CHARGING LED on QB's gate drive (on BDN it would load the comparator and turn QD on)
    .part('LEDC', 'led', 160, 1030, { colour: 'green' }, { '2': 'GD', '1': 'LCA' }, 1)
    .part('RLC', 'resistor', 160, 1120, { value: '4.7k' }, { '1': 'LCA', '2': 'BN' }, 1);

  // ---- references: VREF for the control, VREF2 for the independent protections
  nb.block('ref')
    .part('RREF', 'resistor', -1450, 1200, { value: '1k' }, { '1': 'V12', '2': 'VREF' })
    .part('U1', 'tl431', -1350, 1290, { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' }, 3)
    .part('RREF2', 'resistor', -1450, 1400, { value: '1k' }, { '1': 'V12', '2': 'VREF2' })
    .part('U14', 'tl431', -1350, 1490, { value: 'TL431' }, { '1': 'VREF2', '2': 'GND', '3': 'VREF2' }, 3);

  // ---- protections with their own reference, independent of the control: the overvoltage
  // latch (57.6 V, 3.6 V per cell, below the BMS cut-off: Q1 shorted, or the control failed)
  // opens QB2 and QPV and stays tripped until the power is removed; the fast stop (58.9 V) holds
  // the PWM low while the output is too high
  nb.block('prot').note('PROTECTIONS (own reference, independent of the control)', 700, 1130)
    .part('ROV1', 'resistor', 750, 1250, { value: '221k' }, { '1': 'VO', '2': 'VOS2' })
    .part('ROV2', 'resistor', 830, 1320, { value: '10k' }, { '1': 'VOS2', '2': 'GND' }, 1)
    // 10 ms filter; armed only while charge current flows (QNC holds VOS2 low otherwise): a
    // shorted Q1 drives current into the battery, while after a BMS cut-off the output
    // capacitors merely keep their charge, which must not latch the charger off
    .part('COV', 'capacitor', 900, 1320, { value: '1u', vmax: '50' }, { '1': 'VOS2', '2': 'GND' }, 1)
    .part('RNC', 'resistor', 830, 1450, { value: '10k' }, { '1': 'VOS2', '2': 'CNC' }, 1)
    .part('QNC', 'npn', 880, 1560, { value: 'BC547B' }, { '1': 'BNC', '2': 'CNC', '3': 'GND' })
    .part('RBNC', 'resistor', 760, 1560, { value: '100k' }, { '1': 'BDN', '2': 'BNC' })
    // once latched, QNL keeps QNC off, so the disarming cannot release the latch
    .part('QNL', 'npn', 760, 1680, { value: 'BC547B' }, { '1': 'BNL', '2': 'BNC', '3': 'GND' })
    .part('RBNL', 'resistor', 640, 1680, { value: '100k' }, { '1': 'FLT2', '2': 'BNL' })
    .part('U13', 'comparator', 1080, 1260, { value: 'LM393', pkg: 'PROT1' }, { '3': 'VOS2', '2': 'VREF2', '1': 'FLT', '8': 'V12', '4': 'GND' })
    .part('RFLT', 'resistor', 1170, 1200, { value: '4.7k' }, { '1': 'V12', '2': 'FLT' }, 1)
    .part('DLAT', 'diode', 1080, 1370, { value: '1N4148' }, { '2': 'FLT', '1': 'LAT' }, 2)
    .part('RLAT', 'resistor', 960, 1370, { value: '47k' }, { '1': 'LAT', '2': 'VOS2' })
    // a second comparator of U13 drives the optocoupler and the FAULT LED in series, so the
    // fault line FLT itself carries no load (a loaded pull-up kept QD2, and QB2, on)
    .part('U13B', 'comparator', 1080, 1500, { value: 'LM393', pkg: 'PROT1' }, { '3': 'VOS2', '2': 'VREF2', '1': 'FLT2', '8': 'V12', '4': 'GND' })
    .part('RFL2', 'resistor', 1170, 1440, { value: '2.2k' }, { '1': 'V12', '2': 'FLT2' }, 1)
    .part('LEDF', 'led', 1250, 1560, { colour: 'red' }, { '2': 'LFA2', '1': 'LFK' }, 1)
    .part('RLF2', 'resistor', 1250, 1650, { value: '1k' }, { '1': 'LFK', '2': 'GND' }, 1)
    .part('RFS1', 'resistor', 1350, 1250, { value: '226k' }, { '1': 'VO', '2': 'VOS3' })
    .part('RFS2', 'resistor', 1430, 1320, { value: '10k' }, { '1': 'VOS3', '2': 'GND' }, 1)
    .part('U15', 'comparator', 1550, 1260, { value: 'LM393', pkg: 'PROT2' }, { '3': 'VREF', '2': 'VOS3', '1': 'PWM', '8': 'V12', '4': 'GND' })
    .part('CDP1', 'capacitor', 1000, 1200, { value: '100n', vmax: '50' }, { '1': 'V12', '2': 'GND' }, 1)
    .part('CDP2', 'capacitor', 1470, 1450, { value: '100n', vmax: '50' }, { '1': 'V12', '2': 'GND' }, 1);

  // ---- temperature: charging only with the battery between 0 and 50 °C (LiFePO4 must not be
  // charged below 0 °C), and the heatsink below 90 °C. The comparators pull the current
  // reference to zero; an open sensor wire reads as too cold, a shorted one as too hot
  nb.block('temp').note('TEMPERATURE (battery NTC at the terminals, heatsink NTC on the board)', 1750, 1130)
    .part('XT1', 'terminal', 1800, 1250, { value: 'NTC bat.' }, { '1': 'VREF' })
    .part('XT2', 'terminal', 1800, 1310, { value: 'NTC bat.' }, { '1': 'NBT' })
    .part('RNB', 'resistor', 1950, 1380, { value: '10k' }, { '1': 'NBT', '2': 'GND' }, 1)
    .part('NTH', 'ntc', 2030, 1290, { value: '10k', beta: '3950', temp: String(o.theatsink ?? 60) }, { '1': 'VREF', '2': 'NHS' }, 1)
    .part('RNH', 'resistor', 2030, 1380, { value: '10k' }, { '1': 'NHS', '2': 'GND' }, 1)
    .part('RT1', 'resistor', 2110, 1290, { value: '3.74k' }, { '1': 'VREF', '2': 'T90' }, 1)
    .part('RT2', 'resistor', 2110, 1380, { value: '7.87k' }, { '1': 'T90', '2': 'T50' }, 1)
    .part('RT3', 'resistor', 2110, 1470, { value: '22.1k' }, { '1': 'T50', '2': 'T0' }, 1)
    .part('RT4', 'resistor', 2110, 1560, { value: '10k' }, { '1': 'T0', '2': 'GND' }, 1)
    .part('U16', 'comparator', 2300, 1260, { value: 'LM393', pkg: 'TEMP1' }, { '3': 'T50', '2': 'NBT', '1': 'IREF', '8': 'V12', '4': 'GND' })
    .part('U17', 'comparator', 2300, 1420, { value: 'LM393', pkg: 'TEMP1' }, { '3': 'NBT', '2': 'T0', '1': 'IREF', '8': 'V12', '4': 'GND' })
    .part('U18', 'comparator', 2300, 1580, { value: 'LM393', pkg: 'TEMP2' }, { '3': 'T90', '2': 'NHS', '1': 'IREF', '8': 'V12', '4': 'GND' })
    .part('CDT1', 'capacitor', 2420, 1200, { value: '100n', vmax: '50' }, { '1': 'V12', '2': 'GND' }, 1);

  // ---- sensing: PV voltage (2.5 V at 93.8 V), battery voltage (2.5 V at 56.6 V), current (×31)
  nb.block('sense')
    .part('RP1', 'resistor', -1450, 1650, { value: '365k' }, { '1': 'PVP', '2': 'VPS' })
    .part('RP2', 'resistor', -1370, 1720, { value: '10k' }, { '1': 'VPS', '2': 'GND' }, 1)
    .part('CP', 'capacitor', -1300, 1720, { value: '10n', vmax: '50' }, { '1': 'VPS', '2': 'GND' }, 1)
    .part('RV1', 'resistor', -1450, 1850, { value: '232k' }, { '1': 'VO', '2': 'VBS' })
    .part('RV2', 'resistor', -1370, 1920, { value: '10.7k' }, { '1': 'VBS', '2': 'GND' }, 1)
    .part('CV', 'capacitor', -1300, 1920, { value: '10n', vmax: '50' }, { '1': 'VBS', '2': 'GND' }, 1)
    .part('U2', 'opamp', -1100, 1700, { value: 'LM358', pkg: 'AMP1' }, { '3': 'BF', '2': 'IFB', '6': 'ISA', '7': 'V12', '4': 'GND' })
    .part('RI1', 'resistor', -1180, 1850, { value: '1k' }, { '1': 'IFB', '2': 'GND' }, 1)
    .part('RI2', 'resistor', -1100, 1790, { value: '30k' }, { '1': 'IFB', '2': 'ISA' })
    .part('CDA1', 'capacitor', -1230, 1600, { value: '100n', vmax: '50' }, { '1': 'V12', '2': 'GND' }, 1);

  // ---- average current-mode control. The current reference IREF is pulled up to VREF (2.5 V =
  // 80 A: the current limit is the reference itself); the MPPT and CV amplifiers lower it, each
  // through an NPN transistor that can pull it down to its saturation voltage. The transistor
  // inverts, so the amplifier's feedback (PI: R + C from IREF) goes to its + input. The current
  // amplifier sets VCMD, the duty-cycle command
  nb.block('loops')
    .part('RIR', 'resistor', -800, 1620, { value: '10k' }, { '1': 'VREF', '2': 'IREF' }, 1);
  if (o.rlim) nb.part('RLIM', 'resistor', -730, 1700, { value: o.rlim }, { '1': 'IREF', '2': 'GND' }, 1);
  const outer = [
    // IREF falls when the PV voltage falls below its set point, or the battery rises above its own
    { k: 'MP', inR: 'VSET', minus: 'VPS', rf: o.comp?.rf ?? '4.7k', cf: o.comp?.cf ?? '220n' },
    { k: 'CV', inR: 'VBS', minus: 'VREF', rf: '470k', cf: '10n' },
  ];
  outer.forEach((e, i) => {
    const x = -700 + 450 * i, y = 1800;
    nb.part(`U${3 + i}`, 'opamp', x, y, { value: 'LM358', pkg: 'AMP2' }, { '3': `N${e.k}`, '2': e.minus, '6': `E${e.k}`, '7': 'V12', '4': 'GND' })
      .part(`RI${e.k}`, 'resistor', x - 120, y - 70, { value: '10k' }, { '1': e.inR, '2': `N${e.k}` })
      .part(`RF${e.k}`, 'resistor', x - 30, y - 120, { value: e.rf }, { '1': `N${e.k}`, '2': `F${e.k}` })
      .part(`CF${e.k}`, 'capacitor', x + 70, y - 120, { value: e.cf, vmax: '50' }, { '1': `F${e.k}`, '2': 'IREF' })
      .part(`RB${e.k}`, 'resistor', x + 120, y, { value: '10k' }, { '1': `E${e.k}`, '2': `B${e.k}` })
      .part(`RBE${e.k}`, 'resistor', x + 170, y + 80, { value: '47k' }, { '1': `B${e.k}`, '2': 'GND' }, 1)
      .part(`Q${e.k}`, 'npn', x + 240, y, { value: 'BC547B' }, { '1': `B${e.k}`, '2': 'IREF', '3': 'GND' });
  });
  nb.part('U5', 'opamp', 300, 1800, { value: 'LM358', pkg: 'AMP1' }, { '3': 'IREF', '2': 'NI', '6': 'VCMD', '7': 'V12', '4': 'GND' })
    .part('RII', 'resistor', 180, 1880, { value: '10k' }, { '1': 'ISA', '2': 'NI' })
    .part('RFI', 'resistor', 290, 1930, { value: '10k' }, { '1': 'NI', '2': 'FI' })
    .part('CFI', 'capacitor', 390, 1930, { value: '100n', vmax: '50' }, { '1': 'FI', '2': 'VCMD' })
    // soft start of the current reference (IREF at most SS + 0.6 V)
    .part('DSS', 'diode', -800, 1950, { value: '1N4148' }, { '2': 'IREF', '1': 'SS' }, 3)
    .part('RSS', 'resistor', -730, 1950, { value: '4.7k' }, { '1': 'V12', '2': 'SS' }, 1)
    .part('CSS', 'capacitor', -730, 2040, { value: '1u', vmax: '25' }, { '1': 'SS', '2': 'GND' }, 1)
    .part('CDA2', 'capacitor', -820, 1800, { value: '100n', vmax: '50' }, { '1': 'V12', '2': 'GND' }, 1);

  // ---- fractional open-circuit-voltage MPPT: the converter pauses (at power-on for 50 ms, then
  // for 49 ms every 10.4 s), the array's open-circuit voltage is sampled onto CH and the PV held
  // at 0.826 of it (Vmp/Voc stays within 0.81 … 0.845 from 25 to 65 °C and 200 to 1000 W/m²)
  nb.block('mppt').note('MPPT: open-circuit voltage sampled every 10 s', -1500, 2150)
    .part('RPOR', 'resistor', -1450, 2250, { value: '1M' }, { '1': 'V12', '2': 'POR' }, 1)
    .part('CPOR', 'capacitor', -1450, 2340, { value: '220n', vmax: '25' }, { '1': 'POR', '2': 'GND' }, 1)
    .part('U9', 'comparator', -1300, 2310, { value: 'LM393', pkg: 'TEMP2' }, { '3': 'POR', '2': 'VREF', '1': 'RUN', '8': 'V12', '4': 'GND' })
    .part('RRUN', 'resistor', -1210, 2250, { value: '10k' }, { '1': 'V12', '2': 'RUN' }, 1)
    .part('U10', 'timer555', -1050, 2500, { value: 'NE555' }, { '8': 'V12', '4': 'V12', '7': 'TD', '6': 'TT', '2': 'TT', '3': 'TOUT', '5': 'TCTL', '1': 'GND' })
    .part('RTA', 'resistor', -1160, 2410, { value: '3.01M' }, { '1': 'V12', '2': 'TD' }, 1)
    .part('RTB', 'resistor', -1160, 2560, { value: '15k' }, { '1': 'TD', '2': 'TT' }, 1)
    .part('CTT', 'capacitor', -1160, 2660, { value: o.timerC ?? '4.7u', vmax: '50' }, { '1': 'TT', '2': 'GND' }, 1)
    .part('CTC', 'capacitor', -960, 2600, { value: '10n', vmax: '50' }, { '1': 'TCTL', '2': 'GND' }, 1)
    .part('DRUN', 'diode', -900, 2400, { value: '1N4148' }, { '2': 'RUN', '1': 'TOUT' }, 3)
    .part('CDM', 'capacitor', -1300, 2470, { value: '100n', vmax: '50' }, { '1': 'V12', '2': 'GND' }, 1)
    // SMP high during a pause: sample, and hold the current reference at zero
    .part('RQP', 'resistor', -780, 2310, { value: '10k' }, { '1': 'RUN', '2': 'BP' })
    .part('QP', 'npn', -680, 2310, { value: 'BC547B' }, { '1': 'BP', '2': 'SMP', '3': 'GND' })
    .part('RSMP', 'resistor', -670, 2200, { value: '10k' }, { '1': 'V12', '2': 'SMP' }, 1)
    .part('RQZ', 'resistor', -560, 2250, { value: '10k' }, { '1': 'SMP', '2': 'BZ' })
    .part('QZ', 'npn', -460, 2250, { value: 'BC547B' }, { '1': 'BZ', '2': 'IREF', '3': 'GND' })
    // sample and hold: the body diode of QS is reverse-biased while the PV runs below Voc
    .part('QS', 'nmos', -560, 2450, { value: '2N7000' }, { '1': 'SMP', '2': 'CH', '3': 'VPS' })
    .part('CH', 'capacitor', -450, 2500, { value: '1u', vmax: '50' }, { '1': 'CH', '2': 'GND' }, 1)
    .part('U11', 'opamp', -300, 2440, { value: 'TL072', pkg: 'BUF' }, { '3': 'CH', '2': 'VOCH', '6': 'VOCH', '7': 'V12', '4': 'GND' })
    .part('RSET1', 'resistor', -170, 2440, { value: '2.1k' }, { '1': 'VOCH', '2': 'VSET' })
    .part('RSET2', 'resistor', -100, 2510, { value: '10k' }, { '1': 'VSET', '2': 'GND' }, 1)
    // the spare amplifier of the TL072 as a follower of ground
    .part('U11S', 'opamp', -300, 2650, { value: 'TL072', pkg: 'BUF' }, { '3': 'GND', '2': 'SPO', '6': 'SPO', '7': 'V12', '4': 'GND' })
    .part('CDB', 'capacitor', -420, 2380, { value: '100n', vmax: '50' }, { '1': 'V12', '2': 'GND' }, 1);

  // ---- PWM and gate driver: the ramp stops during a pause (RESET = RUN), and DPW holds the
  // driver input low (a reset ramp sits at 0 V, which the comparator would read as full duty)
  nb.block('pwm').note('PWM (20 kHz) and gate driver', 100, 2150)
    .part('U6', 'timer555', 200, 2350, { value: 'NE555' }, { '8': 'V12', '4': 'RUN', '7': 'DIS', '6': 'RAMP', '2': 'RAMP', '3': 'OSC', '5': 'CTL', '1': 'GND' })
    .part('RA', 'resistor', 90, 2250, { value: '6.8k' }, { '1': 'V12', '2': 'DIS' }, 1)
    .part('RB', 'resistor', 90, 2400, { value: '330' }, { '1': 'DIS', '2': 'RAMP' }, 1)
    .part('CT', 'capacitor', 90, 2500, { value: '10n', vmax: '50' }, { '1': 'RAMP', '2': 'GND' }, 1)
    .part('CCT', 'capacitor', 300, 2450, { value: '10n', vmax: '50' }, { '1': 'CTL', '2': 'GND' }, 1)
    .part('CDW', 'capacitor', 320, 2250, { value: '100n', vmax: '50' }, { '1': 'V12', '2': 'GND' }, 1)
    .part('U7', 'comparator', 450, 2350, { value: 'LM393', pkg: 'PWM' }, { '3': 'VCMD', '2': 'RAMP', '1': 'PWM', '8': 'V12', '4': 'GND' })
    .part('U7S', 'comparator', 450, 2560, { value: 'LM393', pkg: 'PWM' }, { '3': 'GND', '2': 'VREF', '1': 'GND', '8': 'V12', '4': 'GND' })
    .part('RPW', 'resistor', 540, 2290, { value: '4.7k' }, { '1': 'V12', '2': 'PWM' }, 1)
    .part('DPW', 'diode', 600, 2450, { value: '1N4148' }, { '2': 'PWM', '1': 'RUN' }, 3)
    .part('U8', 'hbdriver', 750, 2350, { value: 'IR2184-type 600 V' }, { '1': 'PWM', '8': 'V12', '3': 'GND', '7': 'VB', '6': 'HO', '5': 'SW', '4': 'LO' })
    .part('DB', 'diode', 850, 2230, { value: '1N4007' }, { '2': 'V12', '1': 'VB' })
    .part('CB', 'capacitor', 900, 2350, { value: '1u', vmax: '25' }, { '1': 'VB', '2': 'SW' }, 1)
    .part('RG', 'resistor', 980, 2340, { value: '10' }, { '1': 'HO', '2': 'G1' })
    .part('CDD', 'capacitor', 640, 2250, { value: '1u', vmax: '25' }, { '1': 'V12', '2': 'GND' }, 1);
  nb.v('PVP').v('VO').v('VCMD').i('L1', '1').i('BAT', '1');
  nb.sim({ type: 'tran', stop: o.stop ?? '90m', step: '5u', start: 'zero' });
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
    summary: 'Keeps a 1 kVA load near 230 V for inputs of 140–300 V: the input is switched to one of seven autotransformer taps by a chain of six 12 V relays under LM339 comparator control. Drawn as the product: screw terminals, breaker and surge arrester, a 12 V control supply from the mains (transformer, bridge, LM317HV), the tap relays with contact snubbers, an output relay with a restart delay, and an independent output protection. The test supply and load are drawn outside the product.',
    tryThis: 'Simulate (9 s of circuit time, 2–3 minutes): the restart delay holds the output off for about 8 s, then OUT follows the input through the 230 V tap. Set the input source V1 to 255 (180 V r.m.s.) or 382 (270 V): another tap is chosen and OUT stays within about ±6 % of 230 V. Watch SF cross the thresholds N1 … N6.',
    build: () => stabiliser().sheet,
  },
  {
    id: 'mppt-charger', title: 'MPPT solar charger for a 48 V LiFePO₄ battery (3.7 kW)', level: 'advanced',
    summary: 'A 9-module PV array (3 × 3 × 410 Wp, Voc up to 120 V) charges a 16-cell LiFePO₄ battery through a 20 kHz buck converter (IRFP4668, STTH6003, 56 µH): fractional-Voc maximum power point tracking, 80 A current limit, 56.6 V constant voltage, battery temperature window, heatsink cut-off, reverse-polarity blocking on both sides and an independent latched overvoltage protection. Analogue control only: LM358, LM393, TL072, TL431, 555, gate driver.',
    tryThis: 'Simulate (90 ms): the battery current I(BAT.1) rises to about 70 A at 1000 W/m², the PV voltage PVP settles near the maximum power point. Set the PV irradiance g to 500 and simulate again; set the battery source to 56.4 V and watch the current taper at 56.6 V.',
    build: () => mpptCharger().sheet,
  },
];
