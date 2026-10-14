// Smoke analysis (stress check): every part's voltages, currents and power from a simulation
// result against its maximum ratings. Ratings are the absolute maximum values of the
// datasheets of the built-in models; generic passives carry rating properties (resistor power,
// capacitor voltage, inductor and switch current). Peak values are compared for voltages and
// currents, averages over the run for power and for rectifier currents.

import { symbolOf } from './symbols';
import { parseValue } from './units';
import type { Sheet } from './schematic';
import type { Connectivity } from './connectivity';
import type { SimResult } from '../sim/run';

type Quantity = 'P' | 'V' | 'Vr' | 'If' | 'Ic' | 'Vce' | 'Id' | 'Vds' | 'Vgs' | 'Iz' | 'Vin' | 'Vs' | 'I' | 'Vcc' | 'Iout' | 'Ppk' | 'Vge' | 'Vka' | 'Ik' | 'Irms';

export interface Stress {
  ref: string;
  what: string;
  quantity: Quantity;
  value: number;
  rating: number;
  unit: 'W' | 'V' | 'A';
  /** Percent of the rating. */
  pct: number;
  status: 'ok' | 'derated' | 'over';
}

/** Absolute maximum ratings of the built-in models (datasheets; TO-92/TO-220 in free air). */
const RATINGS: Record<string, Record<string, Partial<Record<Quantity, number>>>> = {
  diode: { '1N4148': { If: 0.2, Vr: 100, P: 0.5 }, '1N4007': { If: 1, Vr: 1000, P: 3 }, '1N5819': { If: 1, Vr: 40, P: 1.25 }, BAT54: { If: 0.2, Vr: 30, P: 0.2 }, SS34: { If: 3, Vr: 40, P: 1.5 } },
  // TVS: 1 W steady state, 400 W peak pulse (10/1000 µs)
  tvs: { '*': { P: 1, Ppk: 400 } },
  bridge: { DB107: { If: 1, Vr: 1000 }, KBP206: { If: 2, Vr: 600 }, GBU8K: { If: 8, Vr: 800 } },
  // IGBTs: collector current at 100 °C case; power in free air (TO-247)
  igbt: { IKW30N60T: { Vce: 600, Ic: 30, Vge: 20, P: 3.5 }, IKW40N120T2: { Vce: 1200, Ic: 40, Vge: 20, P: 3.5 }, 'generic 600 V 20 A': { Vce: 600, Ic: 20, Vge: 20, P: 3.5 } },
  opto: { PC817: { If: 0.05, Vr: 6, Vce: 35, Ic: 0.05, P: 0.15 } },
  tl431: { TL431: { Vka: 37, Ik: 0.1, P: 0.62 }, TLV431: { Vka: 6, Ik: 0.015, P: 0.62 } },
  zener: { '*': { P: 0.5 } },
  led: { '*': { If: 0.03, Vr: 5 } },
  npn: { '2N3904': { Vce: 40, Ic: 0.2, P: 0.625 }, BC547B: { Vce: 45, Ic: 0.1, P: 0.5 }, '2N2222A': { Vce: 40, Ic: 0.8, P: 0.5 }, BD139: { Vce: 80, Ic: 1.5, P: 1.25 } },
  pnp: { '2N3906': { Vce: 40, Ic: 0.2, P: 0.625 }, BC557B: { Vce: 45, Ic: 0.1, P: 0.5 }, BD140: { Vce: 80, Ic: 1.5, P: 1.25 } },
  nmos: { '2N7000': { Vds: 60, Id: 0.2, Vgs: 20, P: 0.4 }, BS170: { Vds: 60, Id: 0.5, Vgs: 20, P: 0.83 }, IRLZ44N: { Vds: 55, Id: 47, Vgs: 16, P: 2 }, AO3400: { Vds: 30, Id: 5.8, Vgs: 12, P: 1.4 }, IRF540N: { Vds: 100, Id: 33, Vgs: 20, P: 2 } },
  pmos: { BS250: { Vds: 45, Id: 0.23, Vgs: 20, P: 0.83 }, IRF9540N: { Vds: 100, Id: 23, Vgs: 20, P: 2 }, AO3401: { Vds: 30, Id: 4, Vgs: 12, P: 1.4 } },
  opamp: { generic: { Vs: 36, Iout: 0.025 }, LM358: { Vs: 32, Iout: 0.03 }, TL072: { Vs: 36, Iout: 0.025 }, LM324: { Vs: 32, Iout: 0.03 }, MCP6002: { Vs: 6, Iout: 0.023 }, NE5532: { Vs: 44, Iout: 0.038 } },
  regulator: { '7805': { Vin: 35, Iout: 1, P: 2 }, '7809': { Vin: 35, Iout: 1, P: 2 }, '7812': { Vin: 35, Iout: 1, P: 2 }, 'AMS1117-3.3': { Vin: 15, Iout: 1, P: 0.8 }, 'AMS1117-5.0': { Vin: 15, Iout: 1, P: 0.8 },
    'MCP1700-3.3': { Vin: 6, Iout: 0.25, P: 0.5 }, L78L05: { Vin: 30, Iout: 0.1, P: 0.7 } },
  lm317: { LM317: { Vin: 40, Iout: 1.5, P: 2 } },
  timer555: { NE555: { Vcc: 16, Iout: 0.2, P: 0.6 } },
  relay: { '*': { I: 10 } },
};

const UNIT: Record<Quantity, 'W' | 'V' | 'A'> = { P: 'W', V: 'V', Vr: 'V', If: 'A', Ic: 'A', Vce: 'V', Id: 'A', Vds: 'V', Vgs: 'V', Iz: 'A', Vin: 'V', Vs: 'V', I: 'A', Vcc: 'V', Iout: 'A', Ppk: 'W', Vge: 'V', Vka: 'V', Ik: 'A', Irms: 'A' };
const WHAT: Record<Quantity, string> = {
  P: 'power', V: 'voltage', Vr: 'reverse voltage', If: 'forward current', Ic: 'collector current', Vce: 'collector–emitter voltage', Id: 'drain current',
  Vds: 'drain–source voltage', Vgs: 'gate–source voltage', Iz: 'Zener current', Vin: 'input voltage', Vs: 'supply voltage', I: 'current', Vcc: 'supply voltage', Iout: 'output current',
  Ppk: 'peak pulse power', Vge: 'gate–emitter voltage', Vka: 'cathode–anode voltage', Ik: 'cathode current', Irms: 'RMS current (the fuse blows above its rating)',
};

const peak = (y: number[]) => y.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const maxOf = (y: number[]) => y.reduce((m, v) => Math.max(m, v), -Infinity);
/** Time-weighted average for a transient, plain average otherwise. */
function mean(x: number[], y: number[], tran: boolean): number {
  if (!tran || x.length < 2) return y.reduce((a, b) => a + b, 0) / (y.length || 1);
  let s = 0;
  for (let k = 1; k < x.length; k++) s += ((y[k] + y[k - 1]) / 2) * (x[k] - x[k - 1]);
  return s / (x[x.length - 1] - x[0] || 1);
}

/** Stress of every rated part, worst first. `derate` is the warning level in % of the rating. */
export function smoke(sheet: Sheet, conn: Connectivity, r: SimResult, derate = 80): { rows: Stress[]; unrated: string[]; note: string | null } {
  if (r.analysis === 'ac') return { rows: [], unrated: [], note: 'The stress check needs an operating point, a transient or a DC sweep (an AC analysis has no real voltages and currents).' };
  const tran = r.analysis === 'tran';
  const zero = r.x.map(() => 0);
  const rows: Stress[] = [];
  const unrated: string[] = [];
  for (const p of sheet.parts) {
    const s = symbolOf(p.sym);
    if (s.power) continue;
    const vPin = (pin: string) => { const n = conn.pinNet.get(`${p.ref}.${pin}`); return n && r.v[n] ? r.v[n] : zero; };
    const iPin = (pin: string) => r.i[`${p.ref}.${pin}`] ?? zero;
    const vAcross = (a: string, b: string) => { const va = vPin(a), vb = vPin(b); return va.map((v, k) => v - vb[k]); };
    const power = (pins: string[]) => r.x.map((_, k) => pins.reduce((acc, pin) => acc + vPin(pin)[k] * iPin(pin)[k], 0));
    const prop = (key: string) => parseValue(p.props[key] ?? '') ?? NaN;
    const add = (q: Quantity, value: number, rating: number | undefined) => {
      if (!(rating! > 0) || !Number.isFinite(value)) return;
      const pct = (100 * value) / rating!;
      rows.push({ ref: p.ref, what: WHAT[q], quantity: q, value, rating: rating!, unit: UNIT[q], pct, status: pct > 100 ? 'over' : pct > derate ? 'derated' : 'ok' });
    };
    const model = p.props.spice?.trim() ? null : RATINGS[p.sym]?.[p.props[s.value.key] ?? ''] ?? RATINGS[p.sym]?.['*'];
    const P = (pins: string[]) => mean(r.x, power(pins), tran);
    switch (p.sym) {
      case 'resistor': add('P', P(['1', '2']), prop('pmax')); break;
      case 'potentiometer': add('P', P(['1', '2', '3']), prop('pmax')); break;
      case 'capacitor': add('V', peak(vAcross('1', '2')), prop('vmax')); break;
      case 'capacitor_pol': {
        add('V', maxOf(vAcross('1', '2')), prop('vmax'));
        add('Vr', maxOf(vAcross('2', '1')), 1); // electrolytics tolerate about 1 V reversed
        break;
      }
      case 'inductor': add('I', peak(iPin('1')), prop('imax')); break;
      case 'switch': case 'button': add('I', peak(iPin('1')), prop('imax')); break;
      case 'spdt': add('I', peak(iPin('1')), prop('imax')); break;
      case 'diode': case 'zener': case 'led': {
        if (!model) { unrated.push(p.ref); break; }
        // anode is pin 2
        const ia = iPin('2');
        if (model.If) add('If', p.sym === 'led' ? maxOf(ia) : mean(r.x, ia.map((v) => Math.max(v, 0)), tran), model.If);
        if (model.Vr) add('Vr', maxOf(vAcross('1', '2')), model.Vr);
        if (model.P) add('P', P(['1', '2']), model.P);
        break;
      }
      case 'npn': case 'pnp': {
        if (!model) { unrated.push(p.ref); break; }
        add('Vce', peak(vAcross('2', '3')), model.Vce); add('Ic', peak(iPin('2')), model.Ic); add('P', P(['1', '2', '3']), model.P);
        break;
      }
      case 'nmos': case 'pmos': {
        if (!model) { unrated.push(p.ref); break; }
        add('Vds', peak(vAcross('2', '3')), model.Vds); add('Id', peak(iPin('2')), model.Id); add('Vgs', peak(vAcross('1', '3')), model.Vgs); add('P', P(['1', '2', '3']), model.P);
        break;
      }
      case 'opamp': if (model) { add('Vs', peak(vAcross('7', '4')), model.Vs); add('Iout', peak(iPin('6')), model.Iout); } break;
      case 'regulator': case 'lm317': {
        if (!model) break;
        const [vin, g, vo] = p.sym === 'lm317' ? ['3', '1', '2'] : ['1', '2', '3'];
        add('Vin', peak(p.sym === 'lm317' ? vAcross(vin, vo) : vAcross(vin, g)), model.Vin); add('Iout', peak(iPin(vo)), model.Iout); add('P', P([vin, g, vo]), model.P);
        break;
      }
      case 'timer555': if (model) { add('Vcc', peak(vAcross('8', '1')), model.Vcc); add('Iout', peak(iPin('3')), model.Iout); add('P', P(['1', '2', '3', '4', '5', '6', '7', '8']), model.P); } break;
      case 'relay': if (model) add('I', Math.max(peak(iPin('4')), peak(iPin('5'))), model.I); break;
      case 'ntc': add('P', P(['1', '2']), prop('pmax')); break;
      case 'fuse': { const i = iPin('1'); add('Irms', Math.sqrt(mean(r.x, i.map((v) => v * v), tran)), prop('value')); break; }
      case 'tvs': if (model) { add('P', P(['1', '2']), model.P); add('Ppk', maxOf(power(['1', '2'])), model.Ppk); } break;
      case 'bridge': if (model) { add('If', mean(r.x, iPin('3').map((v) => Math.max(-v, 0)), tran), model.If); add('Vr', peak(vAcross('3', '4')), model.Vr); } break;
      case 'igbt': if (model) { add('Vce', peak(vAcross('2', '3')), model.Vce); add('Ic', peak(iPin('2')), model.Ic); add('Vge', peak(vAcross('1', '3')), model.Vge); add('P', P(['1', '2', '3']), model.P); } break;
      case 'opto': if (model) {
        add('If', maxOf(iPin('1')), model.If); add('Vr', maxOf(vAcross('2', '1')), model.Vr);
        add('Vce', peak(vAcross('4', '3')), model.Vce); add('Ic', peak(iPin('4')), model.Ic); add('P', P(['4', '3']), model.P);
      } break;
      case 'tl431': if (model) { add('Vka', peak(vAcross('3', '2')), model.Vka); add('Ik', peak(iPin('3')), model.Ik); add('P', P(['1', '2', '3']), model.P); } break;
      default: break;
    }
  }
  rows.sort((a, b) => b.pct - a.pct);
  return { rows, unrated, note: null };
}
