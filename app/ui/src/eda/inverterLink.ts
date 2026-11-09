// Inverters (P7, DFMEA I-13 / H-18): several units in parallel (10–30 kW) or as three phases
// (3 × 400/230 V). Each unit takes a plug-in link module (the same board for both architectures);
// one link box per system makes the 50 Hz references and powers the run loop.
//
// Why a phase-locked loop: the unit's sine comes from its 50 Hz square through a 4th-order
// 70 Hz Butterworth filter, whose phase at 50 Hz is −118° and moves by 1.4° per 1 % of its corner
// frequency (5 % capacitors: ±7°). The 50 Hz transformer's leakage and windings make about
// 0.8 Ω per unit, the high-frequency unit's output filter less: 1° between two units' sines
// drives about 2.5 A r.m.s. between them (11 % of the rating). So the module's oscillator is
// locked to the shared reference through the unit's own sine (its zero crossings), and the
// filter's tolerance drops out.
//
// Link module (per unit, on the side of the control that makes the sine: the 50 Hz unit's
// control, the high-frequency unit's high-voltage side):
//  - sync receiver: PC817 in the reference's current loop (5 mA; the loop runs through every
//    unit on that phase in series);
//  - PLL: the sine's zero crossings (LM393 with 12 mV of hysteresis) XOR the reference (CD4070),
//    a PI integrator (LM358) against half the rail, a 555 VCO at 200 Hz (control pin through
//    47k) and a CD4013 ÷4: the module's 50 Hz square replaces the unit's own through the jumper
//    JQ. Locked, the sine's zero crossings sit a quarter period from the reference's edges, in
//    every unit alike. The integrator holds its frequency when the reference is lost;
//  - pilot: 5.6 MΩ from the rail into the square's summing node keeps a ±0.13 V square (and a
//    sine) while the bridge is stopped, so the loop locks before the bridge starts;
//  - run loop (fail-safe, series current loop from the link box): each unit's phototransistor
//    (PC817 UKT) closes the loop once the unit is ready (EN high for 0.23 s: the PLL locks
//    first), and each unit's receiver (UKR) holds its bridge off (QKL pulls QEN's base low, so
//    ENN restarts the soft start) while the loop is open. A unit that stops, has no supply or
//    is unplugged opens the loop: every unit stops together, and all restart together when it
//    is ready again. A latched fault stays until that unit is reset;
//  - droop: a 1:1000 current transformer on the unit's output, a bridge and 100 Ω, 47 ms
//    average, ×2.9 (LM358): 1 MΩ into the voltage loop's sense node lowers the output 3 % at the
//    rated current, so the units share the load and the residual mismatch of their set points
//    drives little current between them; the trimmer (1 MΩ, same node) sets each unit's no-load
//    voltage (commissioning: 233.5 V at no load, each unit alone).
//
// Link box (one per system, on the battery: 42 … 58.4 V): LM317HV to 15 V, a 555 at 300 Hz and a
// self-correcting three-stage Johnson counter (two CD4013, a CD4011: from either illegal state it
// is back in the sequence within two clocks) make three 50 Hz squares 120° apart; a 5 mA
// current sink per phase drives that phase's sync loop, a 2.7 mA one the run loop. Up to six
// units per loop (15 V: 6 LEDs and 6 phototransistors in series, with the sink's 1 V).

import { NB } from './powerExamples';
import type { Part, Sheet } from './schematic';
import { SYMBOL } from './symbols';

/** What a unit's link module connects to: the shared loops (nets named SYS_…) and the bus. */
export interface LinkOptions {
  /** The sync loop through this unit's receiver: [in, out]. */
  sync: [string, string];
  /** The run loop through this unit's transmitter and receiver: [in, out]. */
  run: [string, string];
  /** The shared output line after this unit's current transformer. */
  bus: string;
  /** Tests: the run loop's ready delay (product 1 µF: 0.23 s). */
  delayC?: string;
  /** Tests: the trimmer's position (% from pin 1; the commissioning setting by default). */
  trim?: number;
}

/** The link module on a unit's control: `V`/`G` its rail and ground, `bqe` the base of the
 *  transistor that makes ENN, `q50` the net the module's 50 Hz drives (through JQ), `outl` the
 *  unit's output line (the current transformer's primary runs from it to `l.bus`). */
export function linkModule(nb: NB, l: LinkOptions, c: { V: string; G: string; bqe: string; q50: string; outl: string; vrail: number }) {
  const { V, G } = c;
  // the trimmer's commissioning position: 5 V at its wiper, which balances the droop's offset
  // (−2.5 µA into SO at zero current) and sets the no-load output 1.5 % high (233.5 V)
  const trim = l.trim ?? Math.round((1 - 5.42 / c.vrail) * 1000) / 10;
  nb.block('link').note('LINK MODULE (parallel and three-phase units)', 2000, 2350)
    // sync receiver: the loop's 5 mA through the LED; 1N4148 across it against a reversed loop
    .part('UKS', 'opto', 2000, 2500, { value: 'PC817' }, { '1': l.sync[0], '2': l.sync[1], '4': 'KSY', '3': G })
    .part('DKS', 'diode', 1900, 2560, { value: '1N4148' }, { '2': l.sync[1], '1': l.sync[0] }, 3)
    .part('RKS', 'resistor', 2120, 2420, { value: '10k' }, { '1': V, '2': 'KSY' }, 1)
    // the sine's zero crossings: 10k / 10M, 12 mV of hysteresis (the pilot's sine is ±0.13 V)
    .part('RKZ1', 'resistor', 2000, 2700, { value: '10k' }, { '1': 'SINE', '2': 'KZP' })
    .part('RKZ2', 'resistor', 2100, 2640, { value: '10M' }, { '1': 'KZC', '2': 'KZP' })
    .part('UKZ', 'comparator', 2150, 2720, { value: 'LM393', pkg: 'LK1' }, { '3': 'KZP', '2': 'VMID', '1': 'KZC', '8': V, '4': G })
    .part('RKZU', 'resistor', 2260, 2640, { value: '10k' }, { '1': V, '2': 'KZC' }, 1)
    // phase detector and PI integrator: locked, the XOR's mean is half the rail
    .part('UKX', 'xor2', 2400, 2600, { value: V, pkg: 'LKX' }, { '1': 'KZC', '2': 'KSY', '3': 'KPD' })
    .part('RKH1', 'resistor', 2500, 2780, { value: '10k', tol: '0.1' }, { '1': V, '2': 'KHV' }, 1)
    .part('RKH2', 'resistor', 2500, 2900, { value: '10k', tol: '0.1' }, { '1': 'KHV', '2': G }, 1)
    .part('RKI1', 'resistor', 2560, 2600, { value: '470k' }, { '1': 'KPD', '2': 'KPN' })
    .part('RKI2', 'resistor', 2660, 2520, { value: '470k' }, { '1': 'KPN', '2': 'KPI' })
    .part('CKI', 'capacitor', 2760, 2520, { value: '220n', vmax: '50' }, { '1': 'KPI', '2': 'KIO' })
    .part('CKI2', 'capacitor', 2700, 2440, { value: '10n', vmax: '50' }, { '1': 'KPN', '2': 'KIO' })
    .part('UKI', 'opamp', 2700, 2640, { value: 'LM358', pkg: 'LKA' }, { '3': 'KHV', '2': 'KPN', '6': 'KIO', '7': V, '4': G })
    // VCO: a 555 at about 206 Hz free-running (3 % fast: the integrator's middle pulls it to 200),
    // its control pin through 47k (±5 % of hold range) and 4.7 µF (the XOR's 100 Hz ripple)
    .part('RK5K', 'resistor', 2860, 2640, { value: '33k' }, { '1': 'KIO', '2': 'KK5' })
    .part('CKK', 'capacitor', 2960, 2740, { value: '4.7u', vmax: '25' }, { '1': 'KK5', '2': G }, 1)
    .part('UK5', 'timer555', 3100, 2640, { value: 'NE555' }, { '8': V, '4': V, '7': 'KD5', '6': 'KT5', '2': 'KT5', '3': 'KC2', '5': 'KK5', '1': G })
    .part('RK5A', 'resistor', 2980, 2480, { value: '10k' }, { '1': V, '2': 'KD5' }, 1)
    .part('RK5B', 'resistor', 3060, 2480, { value: '32.4k' }, { '1': 'KD5', '2': 'KT5' }, 1)
    .part('CK5', 'capacitor', 3060, 2800, { value: '100n', vmax: '50' }, { '1': 'KT5', '2': G }, 1)
    .part('UKF1', 'dff', 3250, 2600, { value: V, pkg: 'LKF' }, { '1': 'KC1N', '2': 'KC2', '3': 'KC1', '4': 'KC1N' })
    .part('UKF2', 'dff', 3400, 2600, { value: V, pkg: 'LKF' }, { '1': 'KQ5N', '2': 'KC1', '3': 'KQ5', '4': 'KQ5N' })
    // the module's 50 Hz, open drain: JQ (position B) takes it to the sine's square switch
    .part('QKO', 'nmos', 3550, 2640, { value: '2N7000' }, { '1': 'KQ5', '2': c.q50, '3': G })
    .part('RKO', 'resistor', 3550, 2520, { value: '10k' }, { '1': V, '2': c.q50 }, 1)
    // pilot: the square never falls to zero while the bridge is stopped
    .part('RKP', 'resistor', 2000, 2900, { value: '5.6M' }, { '1': V, '2': 'HP' })
    // run loop, transmitter: EN high for 0.23 s (1M, 1 µF to VREF) closes it; EN low empties
    // CKD through DKD at once
    .part('RKD', 'resistor', 2000, 3050, { value: '1M' }, { '1': 'EN', '2': 'KTD' })
    .part('CKD', 'capacitor', 2100, 3150, { value: l.delayC ?? '2.2u', vmax: '25' }, { '1': 'KTD', '2': G }, 1)
    .part('DKD', 'diode', 2100, 2980, { value: '1N4148' }, { '2': 'KTD', '1': 'EN' })
    .part('UKT2', 'comparator', 2250, 3050, { value: 'LM393', pkg: 'LK1' }, { '3': 'VREF', '2': 'KTD', '1': 'KTX', '8': V, '4': G })
    .part('RKT', 'resistor', 2380, 2980, { value: '1.5k' }, { '1': V, '2': 'KTL' }, 1)
    .part('UKT', 'opto', 2500, 3050, { value: 'PC817' }, { '1': 'KTL', '2': 'KTX', '4': l.run[0], '3': 'KRM' })
    // receiver: the loop's 2.7 mA; open, KRX rises and QKL holds the bridge off
    .part('UKR', 'opto', 2700, 3050, { value: 'PC817' }, { '1': 'KRM', '2': l.run[1], '4': 'KRX', '3': G })
    .part('DKR', 'diode', 2650, 3150, { value: '1N4148' }, { '2': l.run[1], '1': 'KRM' }, 3)
    .part('RKR', 'resistor', 2820, 2980, { value: '22k' }, { '1': V, '2': 'KRX' }, 1)
    .part('RKL1', 'resistor', 2900, 3050, { value: '47k' }, { '1': 'KRX', '2': 'KLB' })
    .part('RKL2', 'resistor', 2980, 3150, { value: '10k' }, { '1': 'KLB', '2': G }, 1)
    .part('QKL', 'npn', 3050, 3050, { value: 'BC547B' }, { '1': 'KLB', '2': c.bqe, '3': G })
    // droop: the output current transformer (1:1000, 10 H secondary, 30 Ω winding)
    .part('TKC', 'transformer', 2000, 3300, { value: '1000', lp: '10u', rp: '0.1m', rs: '30', k: '0.999' }, { '1': c.outl, '2': l.bus, '3': 'KCA', '4': 'KCB' })
    .part('BKC', 'bridge', 2150, 3300, { value: 'DB107' }, { '1': 'KCA', '2': 'KCB', '3': 'KCP', '4': G })
    .part('RKC', 'resistor', 2250, 3400, { value: '100' }, { '1': 'KCP', '2': G }, 1)
    .part('RKF', 'resistor', 2330, 3300, { value: '47k' }, { '1': 'KCP', '2': 'KCF' })
    .part('CKF', 'capacitor', 2430, 3400, { value: '1u', vmax: '25' }, { '1': 'KCF', '2': G }, 1)
    .part('UKA', 'opamp', 2550, 3300, { value: 'LM358', pkg: 'LKA' }, { '3': 'KCF', '2': 'KAN', '6': 'KDV', '7': V, '4': G })
    .part('RKA1', 'resistor', 2550, 3200, { value: '19.1k' }, { '1': 'KAN', '2': 'KDV' })
    .part('RKA2', 'resistor', 2450, 3200, { value: '10k' }, { '1': 'KAN', '2': G }, 1)
    .part('RKDR', 'resistor', 2700, 3300, { value: '1M' }, { '1': 'KDV', '2': 'SO' })
    .part('PKT', 'potentiometer', 2800, 3400, { value: '10k', position: String(trim) }, { '1': V, '2': 'KTW', '3': G }, 1)
    .part('RKTR', 'resistor', 2900, 3300, { value: '1M' }, { '1': 'KTW', '2': 'SO' })
    .part('CKD1', 'capacitor', 3100, 3300, { value: '100n', vmax: '50' }, { '1': V, '2': G }, 1)
    .part('CKD2', 'capacitor', 3200, 3300, { value: '100n', vmax: '50' }, { '1': V, '2': G }, 1);
}

/** The link box: the battery's positive `vin`, ground GND (the battery negative); `loops[p]`
 *  the number of units on phase p (A, B, C; one phase for units in parallel). Its sync loops
 *  start at SYS_SY{p}_0 and end at SYS_SY{p}_{n}; the run loop from SYS_RUN0 to SYS_RUN{n}. */
export function linkBox(nb: NB, vin: string, loops: number[]) {
  const units = loops.reduce((a, b) => a + b, 0);
  nb.block('link box').note('LINK BOX (one per system)', 4000, 2350)
    .part('FKB', 'fuse', 4000, 2450, { value: '0.5', r: '0.2' }, { '1': vin, '2': 'KBF' })
    .part('DKB', 'diode', 4100, 2450, { value: '1N4007' }, { '2': 'KBF', '1': 'KBR' })
    .part('CKB1', 'capacitor', 4200, 2550, { value: '2.2u', vmax: '100' }, { '1': 'KBR', '2': 'GND' }, 1)
    .part('UKB', 'lm317', 4300, 2450, { value: 'LM317HV' }, { '3': 'KBR', '1': 'KBA', '2': 'VK' })
    .part('RKB1', 'resistor', 4400, 2550, { value: '240' }, { '1': 'VK', '2': 'KBA' }, 1)
    .part('RKB2', 'resistor', 4300, 2650, { value: '2.61k' }, { '1': 'KBA', '2': 'GND' }, 1)
    .part('CKB2', 'capacitor', 4500, 2550, { value: '10u', vmax: '35' }, { '1': 'VK', '2': 'GND' }, 1)
    // 300 Hz: 1.44 / ((10k + 2 × 19.1k) × 100 nF)
    .part('UB5', 'timer555', 4000, 2800, { value: 'NE555' }, { '8': 'VK', '4': 'VK', '7': 'BD5', '6': 'BT5', '2': 'BT5', '3': 'BCK', '5': 'BK5', '1': 'GND' })
    .part('RB5A', 'resistor', 3880, 2700, { value: '10k' }, { '1': 'VK', '2': 'BD5' }, 1)
    .part('RB5B', 'resistor', 3880, 2820, { value: '19.1k' }, { '1': 'BD5', '2': 'BT5' }, 1)
    .part('CB5', 'capacitor', 3880, 2940, { value: '100n', vmax: '50' }, { '1': 'BT5', '2': 'GND' }, 1)
    .part('CBK', 'capacitor', 4120, 2940, { value: '10n', vmax: '50' }, { '1': 'BK5', '2': 'GND' }, 1)
    // Johnson counter: D1 = Q̄3, D2 = Q1·(Q2 + Q̄3), D3 = Q2. A = Q1, B = Q3, C = Q̄2
    .part('UB1', 'dff', 4250, 2800, { value: 'VK', pkg: 'BF1' }, { '1': 'B3N', '2': 'BCK', '3': 'B1', '4': 'B1N' })
    .part('UB2', 'dff', 4400, 2800, { value: 'VK', pkg: 'BF1' }, { '1': 'BD2', '2': 'BCK', '3': 'B2', '4': 'B2N' })
    .part('UB3', 'dff', 4550, 2800, { value: 'VK', pkg: 'BF2' }, { '1': 'B2', '2': 'BCK', '3': 'B3', '4': 'B3N' })
    .part('UBN1', 'nand2', 4250, 3000, { value: 'VK', pkg: 'BN' }, { '1': 'B2N', '2': 'B3', '3': 'BX' })
    .part('UBN2', 'nand2', 4400, 3000, { value: 'VK', pkg: 'BN' }, { '1': 'B1', '2': 'BX', '3': 'BY' })
    .part('UBN3', 'nand2', 4550, 3000, { value: 'VK', pkg: 'BN' }, { '1': 'BY', '2': 'BY', '3': 'BD2' })
    .part('CBD1', 'capacitor', 4700, 2900, { value: '100n', vmax: '50' }, { '1': 'VK', '2': 'GND' }, 1)
    .part('CBD2', 'capacitor', 4800, 2900, { value: '100n', vmax: '50' }, { '1': 'VK', '2': 'GND' }, 1);
  const outs = ['B1', 'B3', 'B2N'];
  loops.forEach((n, p) => {
    const x = 4000 + 250 * p;
    // a 5 mA current sink: two diodes hold the base at 1.3 V, 130 Ω under the emitter
    nb.part(`RBS${p}`, 'resistor', x, 3150, { value: '100' }, { '1': 'VK', '2': `SYS_SY${p}_0` })
      .part(`RBB${p}`, 'resistor', x, 3250, { value: '10k' }, { '1': outs[p], '2': `BB${p}` })
      .part(`DBA${p}`, 'diode', x + 60, 3350, { value: '1N4148' }, { '2': `BB${p}`, '1': `BBD${p}` }, 1)
      .part(`DBB${p}`, 'diode', x + 60, 3450, { value: '1N4148' }, { '2': `BBD${p}`, '1': 'GND' }, 1)
      .part(`QBS${p}`, 'npn', x + 120, 3250, { value: 'BC547B' }, { '1': `BB${p}`, '2': `SYS_SY${p}_${n}`, '3': `BE${p}` })
      .part(`RBE${p}`, 'resistor', x + 160, 3400, { value: '130' }, { '1': `BE${p}`, '2': 'GND' }, 1);
  });
  // the run loop's 2.7 mA sink (always on: the units open the loop)
  nb.part('RBRS', 'resistor', 4800, 3150, { value: '100' }, { '1': 'VK', '2': 'SYS_RUN0' })
    .part('RBRB', 'resistor', 4800, 3250, { value: '10k' }, { '1': 'VK', '2': 'BRB' })
    .part('DBRA', 'diode', 4860, 3350, { value: '1N4148' }, { '2': 'BRB', '1': 'BRD' }, 1)
    .part('DBRB', 'diode', 4860, 3450, { value: '1N4148' }, { '2': 'BRD', '1': 'GND' }, 1)
    .part('QBR', 'npn', 4920, 3250, { value: 'BC547B' }, { '1': 'BRB', '2': `SYS_RUN${units}`, '3': 'BRE' })
    .part('RBRE', 'resistor', 4960, 3400, { value: '220' }, { '1': 'BRE', '2': 'GND' }, 1);
}

/** Joins sheets into one for simulation: every sheet after the first gets `suffix[k]` on its
 *  references and on its nets (labels, power symbols, logic rails), except GND and the shared
 *  nets (SYS_…), and its drawing moves right so nothing touches. */
export function joinSheets(sheets: Sheet[], suffix: string[]): Sheet {
  const out: Sheet = { ...sheets[0], parts: [...sheets[0].parts], wires: [...sheets[0].wires], labels: [...sheets[0].labels], probes: [...sheets[0].probes] };
  const keep = (n: string) => n === 'GND' || n.startsWith('SYS_');
  sheets.slice(1).forEach((s, i) => {
    const sx = suffix[i + 1], dx = 40000 * (i + 1);
    const nets = new Set(s.labels.filter((l) => !l.note).map((l) => l.name));
    const rn = (n: string) => (keep(n) ? n : `${n}${sx}`);
    const ids = new Map<string, string>();
    for (const p of s.parts) {
      const id = `${p.id}${sx}`;
      ids.set(p.id, id);
      const sym = SYMBOL.get(p.sym);
      let props = p.props;
      if (sym?.power) { const k = sym.value.key, n = (p.props[k] || sym.value.default).trim() || sym.value.default; if (!keep(n)) props = { ...props, [k]: rn(n) }; }
      if (sym?.logic && p.props.value && nets.has(p.props.value)) props = { ...props, value: rn(p.props.value) };
      out.parts.push({ ...p, id, ref: `${p.ref}${sx}`, x: p.x + dx, props } as Part);
    }
    for (const w of s.wires) out.wires.push({ id: `${w.id}${sx}`, a: { x: w.a.x + dx, y: w.a.y }, b: { x: w.b.x + dx, y: w.b.y } });
    for (const l of s.labels) out.labels.push({ ...l, id: `${l.id}${sx}`, name: l.note ? l.name : rn(l.name), x: l.x + dx });
    for (const p of s.probes) {
      if (p.kind === 'i') out.probes.push({ ...p, id: `${p.id}${sx}`, part: ids.get(p.part) ?? p.part });
      else if (p.kind === 'v') out.probes.push({ ...p, id: `${p.id}${sx}`, at: { x: p.at.x + dx, y: p.at.y } });
    }
  });
  return out;
}
