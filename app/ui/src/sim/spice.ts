// SPICE netlist (ngspice dialect) of a flat circuit (SIM-04). Every element and model the
// built-in engine knows is written with explicit parameters, so ngspice simulates exactly the
// same circuit.

import { opValue, type Circuit, type Element, type Wave } from './circuit';
import { spiceNumber as n } from '../eda/units';
import { GSHUNT } from './engine';

export type Analysis =
  | { type: 'op' }
  | { type: 'dc'; source: string; start: number; stop: number; step: number }
  | { type: 'tran'; tstep: number; tstop: number; tmax?: number; uic?: boolean }
  | { type: 'ac'; perDecade: number; fstart: number; fstop: number };

/** SPICE node names: letters, digits and _ only; "0" is ground. */
export function spiceNode(name: string): string {
  if (name === '0' || name.toLowerCase() === 'gnd') return '0';
  const s = name.replace(/[^A-Za-z0-9_]/g, (c) => (c === '+' ? 'p' : c === '-' ? 'm' : '_'));
  return /^[0-9]/.test(s) ? `n${s}` : s;
}

function wave(dc: number, w: Wave | undefined): string {
  const base = `DC ${n(opValue(dc, w))}`;
  if (!w || w.type === 'dc') return base;
  if (w.type === 'sin') return `${base} SIN(${[w.vo, w.va, w.freq, w.td ?? 0, w.theta ?? 0, ...(w.phase ? [w.phase] : [])].map(n).join(' ')})`;
  if (w.type === 'pulse') return `${base} PULSE(${[w.v1, w.v2, w.td, w.tr, w.tf, w.pw, w.per].map(n).join(' ')})`;
  return `${base} PWL(${w.pts.map(([t, v]) => `${n(t)} ${n(v)}`).join(' ')})`;
}

function ac(e: { acMag?: number; acPhase?: number }): string {
  return e.acMag ? ` AC ${n(e.acMag)} ${n(e.acPhase ?? 0)}` : '';
}

/** Element name with the SPICE type letter first. */
export function spiceName(e: Element): string {
  const s = e.name.replace(/[^A-Za-z0-9_]/g, '_');
  return s[0]?.toUpperCase() === e.kind ? s : `${e.kind}${s}`;
}

export function elementLine(e: Element, models: Map<string, string>): string {
  const N = spiceNode, nm = spiceName(e);
  switch (e.kind) {
    case 'R': return `${nm} ${N(e.a)} ${N(e.b)} ${n(e.r)}`;
    case 'C': return `${nm} ${N(e.a)} ${N(e.b)} ${n(e.c)}`;
    case 'L': return `${nm} ${N(e.a)} ${N(e.b)} ${n(e.l)}`;
    case 'V': return `${nm} ${N(e.p)} ${N(e.n)} ${wave(e.dc, e.wave)}${ac(e)}`;
    case 'I': return `${nm} ${N(e.p)} ${N(e.n)} ${wave(e.dc, e.wave)}${ac(e)}`;
    case 'E': return `${nm} ${N(e.p)} ${N(e.n)} ${N(e.cp)} ${N(e.cn)} ${n(e.gain)}`;
    case 'G': return `${nm} ${N(e.p)} ${N(e.n)} ${N(e.cp)} ${N(e.cn)} ${n(e.gm)}`;
    case 'D': {
      const m = e.model;
      const card = `D(IS=${n(m.is)} N=${n(m.n)} RS=${n(m.rs)}${m.bv ? ` BV=${n(m.bv)} IBV=${n(m.ibv ?? 1e-3)}` : ''} CJO=0 TT=0)`;
      return `${nm} ${N(e.a)} ${N(e.k)} ${model(models, 'D', card)}`;
    }
    case 'Q': {
      const m = e.model;
      const card = `${m.type.toUpperCase()}(IS=${n(m.is)} BF=${n(m.bf)} BR=${n(m.br)} NF=${n(m.nf)} NR=${n(m.nr)}${m.vaf ? ` VAF=${n(m.vaf)}` : ''}${m.var ? ` VAR=${n(m.var)}` : ''})`;
      return `${nm} ${N(e.c)} ${N(e.b)} ${N(e.e)} ${model(models, 'Q', card)}`;
    }
    case 'M': {
      const m = e.model;
      const card = `${m.type.toUpperCase()}(LEVEL=1 VTO=${n(m.vto)} KP=${n(m.kp)} LAMBDA=${n(m.lambda)} IS=${n(m.is)})`;
      return `${nm} ${N(e.d)} ${N(e.g)} ${N(e.s)} ${N(e.s)} ${model(models, 'M', card)} W=${n(m.w)} L=${n(m.l)}`;
    }
    case 'K': return `${nm} ${spiceName({ kind: 'L', name: e.l1 } as Element)} ${spiceName({ kind: 'L', name: e.l2 } as Element)} ${n(e.k)}`;
    case 'W': {
      const card = `CSW(IT=${n(e.it)} IH=${n(e.ih)} RON=${n(e.ron)} ROFF=${n(e.roff)})`;
      return `${nm} ${N(e.p)} ${N(e.n)} ${spiceName({ kind: 'V', name: e.ctrl } as Element)} ${model(models, 'W', card)}`;
    }
    case 'P':
      return `* ${e.name}: hobby servo (PWM ${N(e.sig)} GND ${N(e.gnd)} POS ${N(e.out)}). NETApps simulates it with a behavioural model that has no SPICE primitive.`;
    case 'T':
      return `* ${e.name}: 555 timer (GND ${N(e.gnd)} TRIG ${N(e.trig)} OUT ${N(e.out)} RESET ${N(e.rst)} CTRL ${N(e.ctrl)} THR ${N(e.thr)} DIS ${N(e.dis)} VCC ${N(e.vcc)}). ` +
        'NETApps simulates it with a behavioural model that has no SPICE primitive: insert a 555 subcircuit here.';
  }
}

function model(models: Map<string, string>, prefix: string, card: string): string {
  let name = models.get(card);
  if (!name) { name = `EF_${prefix}${models.size + 1}`; models.set(card, name); }
  return name;
}

export function analysisLine(a: Analysis): string {
  switch (a.type) {
    case 'op': return '.op';
    case 'dc': return `.dc ${a.source} ${n(a.start)} ${n(a.stop)} ${n(a.step)}`;
    case 'tran': return `.tran ${n(a.tstep)} ${n(a.tstop)} 0 ${n(a.tmax ?? a.tstep)}${a.uic ? ' uic' : ''}`;
    case 'ac': return a.fstop === a.fstart ? `.ac lin 1 ${n(a.fstart)} ${n(a.fstop)}` : `.ac dec ${a.perDecade} ${n(a.fstart)} ${n(a.fstop)}`;
  }
}

/** Complete netlist. `extra` lines go before `.end` (for example a .control block). */
export function toSpice(c: Circuit, analysis?: Analysis, extra: string[] = []): string {
  const models = new Map<string, string>();
  const lines = c.elements.map((e) => elementLine(e, models));
  const out = [`* ${c.title ?? 'NETApps circuit'}`, `.option rshunt=${n(1 / GSHUNT)}`];
  for (const [card, name] of models) out.push(`.model ${name} ${card}`);
  out.push(...lines);
  if (analysis) out.push(analysisLine(analysis));
  out.push(...extra, '.end', '');
  return out.join('\n');
}
