// Several inverter units as one system (P7, DFMEA I-13 / H-18): units in parallel on one line,
// or three phases (3 × 400/230 V, N common), with their link modules and one link box, joined
// into one sheet for simulation. The units share the battery's negative (the control ground and
// the output's N, bonded to PE); each has its own battery cables.

import { NB } from './powerExamples';
import type { Sheet } from './schematic';
import { inverterHF, inverterLF, type InverterHfOptions, type InverterLfOptions } from './inverters';
import { joinSheets, linkBox } from './inverterLink';
import { parseValue } from './units';

export interface SystemOptions {
  /** 'lf': 50 Hz-transformer units (48 V); 'hf': high-frequency units, their sine bridges alone
   *  (`stage: 'sine'`, bench buses: the link concerns the sine bridge and its control only). */
  arch: 'lf' | 'hf';
  /** The phase of each unit: 0 (A, L1), 1 (B, L2), 2 (C, L3). */
  phases: number[];
  /** Options of every unit, and per unit (tolerances, faults). */
  unit?: InverterLfOptions & InverterHfOptions;
  per?: (InverterLfOptions & InverterHfOptions)[];
  /** The loads: star, each phase to N (Ω; 0 or absent: none). */
  load: number[];
  stop?: string;
  /** Test bench: a fault that stops unit `unit` at `at` (its EN pulled low). */
  fault?: { unit: number; at: number };
  /** Tests: changes to unit k's parts (by key: tolerances), before the sheets are joined. */
  tweak?: (k: number, set: (key: string, props: Record<string, string>) => void) => void;
}

/** The system's sheet, and the suffix of each unit's references and nets ('' for the first). */
export function inverterSystem(o: SystemOptions): { sheet: Sheet; suffix: string[]; ref: (k: number, key: string) => string } {
  const loops = [0, 0, 0];
  const sheets: Sheet[] = [], suffix: string[] = [], refs: ((key: string) => string)[] = [];
  o.phases.forEach((p, k) => {
    const j = loops[p]++;
    const link = { sync: [`SYS_SY${p}_${j}`, `SYS_SY${p}_${j + 1}`] as [string, string], run: [`SYS_RUN${k}`, `SYS_RUN${k + 1}`] as [string, string], bus: `SYS_L${p + 1}` };
    const uo = { ...o.unit, ...o.per?.[k], load: '0', link: { ...link, ...o.unit?.link, ...o.per?.[k]?.link, sync: link.sync, run: link.run, bus: link.bus }, stop: o.stop };
    const { sheet: s, nb: un } = o.arch === 'lf' ? inverterLF(uo) : inverterHF({ stage: 'sine', ...uo });
    o.tweak?.(k, (key, props) => { const id = un.ids.get(key); for (const q of s.parts) if (q.id === id) q.props = { ...q.props, ...props }; });
    sheets.push(s);
    refs.push((key) => un.refOf(s, key));
    suffix.push(k === 0 ? '' : `_${k}`);
  });
  const nb = new NB();
  // the box on the first unit's battery (after its fuse); a high-frequency bench has none, so
  // the box gets its own 52 V
  if (o.arch === 'hf') nb.block('battery').part('VKB', 'battery', 3800, 2450, { value: '52', rint: '0.05' }, { '1': 'SYS_VB', '2': 'GND' }, 1);
  linkBox(nb, 'SYS_VB', loops.filter((x, i) => x > 0 || i === 0));
  nb.block('load').note('TEST LOAD (not part of the product)', 5200, 2350);
  o.load.forEach((r, p) => { if (r > 0) nb.part(`RLD${p}`, 'resistor', 5200 + 120 * p, 2500, { value: String(r), pmax: '20k' }, { '1': `SYS_L${p + 1}`, '2': 'GND' }, 1); });
  if (o.fault) {
    const sx = suffix[o.fault.unit];
    nb.block('bench').part('VFT', 'vpulse', 5600, 2600, { value: '12', low: '0', freq: '1', duty: '90', delay: String(o.fault.at), edge: '10u' }, { '1': 'SYS_FTG', '2': 'GND' })
      .part('QFT', 'nmos', 5700, 2500, { value: '2N7000' }, { '1': 'SYS_FTG', '2': `SYS_FT`, '3': 'GND' })
      .part('RFT', 'resistor', 5800, 2500, { value: '100' }, { '1': 'SYS_FT', '2': `SYS_EN${sx}` });
  }
  const box = nb.done();
  const sheet = joinSheets([...sheets, box], [...suffix, '_LB']);
  // the output interval: at most 90 000 stored steps (the solver keeps its own; a thin run keeps
  // the extremes and the integrals of every step)
  if (sheet.sim.type === 'tran') { const T = parseValue(sheet.sim.stop) ?? 0.2; sheet.sim = { ...sheet.sim, step: String(Math.max(5e-6, T / 90000)) }; }
  // the box's supply: the first unit's battery after its fuse
  if (o.arch === 'lf') for (const l of sheet.labels) if (l.name === 'BF') l.name = 'SYS_VB';
  // the fault's switch on the unit's EN
  if (o.fault) { const sx = suffix[o.fault.unit]; for (const l of sheet.labels) if (l.name === `EN${sx}`) l.name = `SYS_EN${sx}`; }
  return { sheet, suffix, ref: (k, key) => `${refs[k](key)}${suffix[k]}` };
}
