// Reliability prediction (decision D22): parts-count method in the manner of IEC 61709 and
// SN 29500. Every part has a reference failure rate at 40 °C (FIT = failures per 10⁹ device
// hours), multiplied by a temperature factor (Arrhenius) and a stress factor (from the stress
// check, when a simulation is given). The sum gives the failure rate of the design; its inverse
// the mean time between failures (MTBF) of the random failures.
//
// Wear-out is not a random failure and is listed apart: relay and contactor contacts (electrical
// life in switching operations), electrolytic capacitors (life halves for each 10 K), varistors
// (surge count). Their lives, at the use given, become the planned maintenance intervals.
//
// The reference rates are indicative values of the order given in SN 29500 for industrial
// grade parts; for a product they are replaced by the manufacturers' reliability data.

import { symbolOf } from './symbols';
import { connectivity, type Connectivity } from './connectivity';
import { smoke, THERMAL } from './smoke';
import { parseValue } from './units';
import type { Sheet } from './schematic';
import type { SimResult } from '../sim/run';

/** Reference failure rate (FIT at 40 °C) and activation energy (eV) of a part class. */
interface PartClass { fit: number; ea: number; what: string }

const K_B = 8.617e-5;

/** Classes by symbol; a few by model (power semiconductors in TO-220/TO-247). */
const CLASS: Record<string, PartClass> = {
  resistor: { fit: 0.2, ea: 0.08, what: 'metal-film resistor' },
  potentiometer: { fit: 5, ea: 0.1, what: 'potentiometer' },
  ntc: { fit: 2, ea: 0.1, what: 'NTC thermistor' },
  capacitor: { fit: 1, ea: 0.15, what: 'ceramic or film capacitor' },
  capacitor_pol: { fit: 5, ea: 0.4, what: 'aluminium electrolytic capacitor (random failures; wear-out apart)' },
  inductor: { fit: 2, ea: 0.15, what: 'inductor' },
  transformer: { fit: 5, ea: 0.15, what: 'small transformer' },
  transformer3: { fit: 20, ea: 0.15, what: 'three-phase transformer' },
  autotransformer: { fit: 30, ea: 0.15, what: 'tapped autotransformer' },
  diode: { fit: 2, ea: 0.4, what: 'diode' },
  zener: { fit: 2, ea: 0.4, what: 'Zener diode' },
  led: { fit: 5, ea: 0.4, what: 'LED' },
  tvs: { fit: 3, ea: 0.4, what: 'TVS diode' },
  bridge: { fit: 5, ea: 0.4, what: 'bridge rectifier' },
  npn: { fit: 2, ea: 0.5, what: 'small-signal transistor' },
  pnp: { fit: 2, ea: 0.5, what: 'small-signal transistor' },
  nmos: { fit: 3, ea: 0.5, what: 'small-signal MOSFET' },
  pmos: { fit: 3, ea: 0.5, what: 'small-signal MOSFET' },
  igbt: { fit: 40, ea: 0.5, what: 'IGBT' },
  opto: { fit: 15, ea: 0.5, what: 'optocoupler' },
  opamp: { fit: 10, ea: 0.45, what: 'op-amp' },
  comparator: { fit: 10, ea: 0.45, what: 'comparator' },
  tl431: { fit: 5, ea: 0.45, what: 'shunt reference' },
  timer555: { fit: 15, ea: 0.45, what: '555 timer' },
  hbdriver: { fit: 20, ea: 0.45, what: 'gate driver' },
  regulator: { fit: 10, ea: 0.45, what: 'linear regulator' },
  lm317: { fit: 10, ea: 0.45, what: 'linear regulator' },
  relay: { fit: 20, ea: 0.2, what: 'relay (random failures; contact wear apart)' },
  contactor: { fit: 50, ea: 0.2, what: 'contactor (random failures; contact wear apart)' },
  breaker1: { fit: 20, ea: 0.2, what: 'circuit breaker' }, breaker2: { fit: 25, ea: 0.2, what: 'circuit breaker' },
  breaker3: { fit: 40, ea: 0.2, what: 'circuit breaker' }, breaker4: { fit: 50, ea: 0.2, what: 'circuit breaker' },
  fuse: { fit: 2, ea: 0.1, what: 'fuse' },
  mov: { fit: 5, ea: 0.3, what: 'varistor (random failures; surge wear apart)' },
  gdt: { fit: 5, ea: 0.2, what: 'gas discharge tube' },
  switch: { fit: 10, ea: 0.1, what: 'switch' }, button: { fit: 10, ea: 0.1, what: 'push-button' }, spdt: { fit: 10, ea: 0.1, what: 'switch' },
};
const POWER_DEVICE: PartClass = { fit: 20, ea: 0.5, what: 'power semiconductor (TO-220/TO-247)' };
const LOGIC: PartClass = { fit: 5, ea: 0.45, what: 'logic IC' };
/** Parts that are not part of the product's electronics (sources, the PV array, the battery,
 *  motors and test generators) and power symbols. */
const OUTSIDE = new Set(['vdc', 'battery', 'vsin', 'vsin3', 'vpulse', 'idc', 'pv', 'dcmotor', 'motor1', 'motor3', 'servo', 'vsurge', 'isurge', 'gnd', 'power']);

export interface RelRow {
  ref: string; what: string;
  /** Temperature the part works at (°C): the ambient, plus its self-heating. */
  temp: number;
  fitRef: number; piT: number; piS: number; fit: number;
}
export interface WearItem { ref: string; what: string; life: string; years: number; action: string }
export interface Reliability { rows: RelRow[]; fit: number; mtbfHours: number; mtbfYears: number; wear: WearItem[]; joints: number; piE: number }

/** How the product is used, for the wear-out lives. */
export interface Usage {
  /** Switching operations per day of each relay and contactor, by part reference (default 20). */
  opsPerDay?: Record<string, number>;
  /** Electrical life of each relay or contactor at its load (operations). */
  contactLife?: Record<string, number>;
  /** Surges per year reaching each varistor (default 50) and its life in surges at that level. */
  surgesPerYear?: number; movLife?: number;
  /** Environment factor (MIL-HDBK-217F style): 1 benign, 2 ground fixed (default: a closed
   *  enclosure in an uncontrolled, hot and humid climate), 4 ground mobile. */
  piE?: number;
}

/** A through-hole solder joint (FIT); the joints are counted from the parts' pins. */
const FIT_JOINT = 0.1;

const piTemp = (ea: number, t: number) => Math.exp((ea / K_B) * (1 / (40 + 273.15) - 1 / (t + 273.15)));

/** Failure rate and MTBF of a design at an ambient temperature (°C); with a simulation, its
 *  stresses and the self-heating of the power parts on their heatsinks are included. */
export function reliability(sheet: Sheet, ambient: number, r?: SimResult, usage: Usage = {}, conn: Connectivity = connectivity(sheet)): Reliability {
  const stress = new Map<string, number>();
  const power = new Map<string, number>();
  if (r) for (const row of smoke(sheet, conn, r).rows) {
    stress.set(row.ref, Math.max(stress.get(row.ref) ?? 0, row.pct));
    if (row.quantity === 'P') power.set(row.ref, row.value);
  }
  const rows: RelRow[] = [];
  const wear: WearItem[] = [];
  for (const p of sheet.parts) {
    const s = symbolOf(p.sym);
    if (s.power || OUTSIDE.has(p.sym)) continue;
    const model = p.props[s.value.key] ?? '';
    const th = THERMAL[model];
    const cls = th && (p.sym === 'nmos' || p.sym === 'pmos' || p.sym === 'diode' || p.sym === 'igbt') ? POWER_DEVICE : CLASS[p.sym] ?? LOGIC;
    // working temperature: junction of a power part from its loss; ICs a little above the air
    const hs = parseValue(p.props.heatsink ?? '') ?? NaN;
    let temp = ambient + (['opamp', 'comparator', 'timer555', 'hbdriver', 'tl431', 'regulator', 'lm317', 'opto'].includes(p.sym) ? 10 : 0);
    if (th && hs > 0 && power.has(p.ref)) temp = ambient + power.get(p.ref)! * (th.rjc + hs);
    const pct = stress.get(p.ref) ?? 0;
    const piS = pct > 100 ? 10 : pct > 80 ? 3 : pct > 50 ? 1.5 : 1;
    const piT = piTemp(cls.ea, temp);
    rows.push({ ref: p.ref, what: cls.what, temp, fitRef: cls.fit, piT, piS, fit: cls.fit * piT * piS });
    // wear-out
    if (p.sym === 'capacitor_pol') {
      // 105 °C, 10 000 h long-life types; the hot spot about 5 K above the air
      const hours = 10000 * Math.pow(2, (105 - (ambient + 5)) / 10), years = hours / 8760;
      wear.push({ ref: p.ref, what: 'electrolytic capacitor, 105 °C 10 000 h', life: `${Math.round(hours).toLocaleString('en')} h`, years, action: years >= 15 ? 'none in the product life' : `replace every ${Math.floor(years * 0.8)} years` });
    }
    if (p.sym === 'relay' || p.sym === 'contactor') {
      const ops = usage.opsPerDay?.[p.ref] ?? 20, life = usage.contactLife?.[p.ref] ?? (p.sym === 'contactor' ? 1e6 : 1e5);
      const years = life / (ops * 365);
      wear.push({ ref: p.ref, what: `${p.sym} contacts, ${life.toLocaleString('en')} operations at their load, ${ops} a day`, life: `${life.toLocaleString('en')} operations`, years, action: years >= 15 ? 'none in the product life; check contacts at each service' : `replace every ${Math.max(1, Math.floor(years * 0.8))} years` });
    }
    if (p.sym === 'mov') {
      const per = usage.surgesPerYear ?? 50, life = usage.movLife ?? 2000, years = life / per;
      wear.push({ ref: p.ref, what: `varistor, ${life} surges at the expected level, ${per} a year`, life: `${life} surges`, years, action: years >= 15 ? 'check the leakage/indicator at each service' : `replace every ${Math.max(1, Math.floor(years * 0.8))} years, and after a nearby lightning strike` });
    }
  }
  const piE = usage.piE ?? 2;
  const joints = sheet.parts.filter((p) => !symbolOf(p.sym).power && !OUTSIDE.has(p.sym)).reduce((a, p) => a + symbolOf(p.sym).pins.length, 0);
  const fit = piE * (rows.reduce((a, x) => a + x.fit, 0) + joints * FIT_JOINT);
  const mtbfHours = 1e9 / fit;
  return { rows: rows.sort((a, b) => b.fit - a.fit), fit, mtbfHours, mtbfYears: mtbfHours / 8760, wear, joints, piE };
}
