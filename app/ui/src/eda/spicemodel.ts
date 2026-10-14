// SPICE .model import: a .model card from a datasheet or a vendor library replaces the chosen
// generic model of a diode, Zener, bipolar transistor or MOSFET. The parameters the engine
// uses are taken, including the temperature parameters XTI and EG; charge-storage parameters
// are listed as ignored (the engine has no junction capacitance).

import type { BjtModel, DiodeModel, MosModel } from '../sim/circuit';

/** A SPICE number: 1e-14, 10n, 4.7k, 2MEG; M is milli, as in SPICE; units after it are ignored. */
export function spiceValue(text: string): number | null {
  const m = text.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(meg|mil|[tgkmunpf])?[a-z]*$/i);
  if (!m) return null;
  if (m[2]?.toLowerCase() === 'mil') return Number(m[1]) * 25.4e-6;
  // apply the suffix as a decimal exponent, so 29.5n is exactly 2.95e-8
  const exp: Record<string, number> = { t: 12, g: 9, meg: 6, k: 3, m: -3, u: -6, n: -9, p: -12, f: -15 };
  const [mant, e0] = m[1].toLowerCase().split('e');
  return Number(`${mant}e${Number(e0 ?? 0) + (m[2] ? exp[m[2].toLowerCase()] : 0)}`);
}

export interface ModelCard { name: string; type: string; params: Map<string, number> }

/** Parses ".model NAME TYPE(KEY=VALUE ...)"; "+" continuation marks and parentheses are optional. */
export function parseModelCard(text: string): ModelCard | { error: string } {
  const t = text.replace(/\n\s*\+/g, ' ').replace(/\s\+\s/g, ' ').replace(/[()]/g, ' ').replace(/\s*=\s*/g, '=').trim();
  const words = t.split(/\s+/);
  if (words[0]?.toLowerCase() !== '.model' || words.length < 3) return { error: 'not a SPICE model: it must start with ".model NAME TYPE"' };
  const name = words[1], type = words[2].toUpperCase();
  const params = new Map<string, number>();
  for (const w of words.slice(3)) {
    const [k, val] = w.split('=');
    if (val === undefined) return { error: `"${w}" is not KEY=VALUE` };
    const v = spiceValue(val);
    if (v === null) return { error: `${k}: "${val}" is not a number` };
    params.set(k.toUpperCase(), v);
  }
  return { name, type, params };
}

export interface Imported<T> { name: string; model: T; used: string[]; ignored: string[] }

const USED = {
  D: ['IS', 'N', 'RS', 'BV', 'IBV', 'XTI', 'EG'],
  Q: ['IS', 'BF', 'BR', 'NF', 'NR', 'VAF', 'VAR', 'VA', 'VB', 'XTI', 'EG'],
  M: ['VTO', 'KP', 'LAMBDA', 'IS', 'LEVEL'],
};

function split(card: ModelCard, used: string[]) {
  const u: string[] = [], ig: string[] = [];
  for (const k of card.params.keys()) (used.includes(k) ? u : ig).push(k);
  return { used: u, ignored: ig };
}

/** The model for symbol `sym` (diode, zener, npn, pnp, nmos, pmos), or why it does not fit. */
export function importModel(sym: string, text: string): Imported<DiodeModel | BjtModel | MosModel> | { error: string } {
  const card = parseModelCard(text);
  if ('error' in card) return card;
  const p = card.params, get = (k: string, d: number) => p.get(k) ?? d;
  const temp = { ...(p.has('XTI') ? { xti: p.get('XTI') } : {}), ...(p.has('EG') ? { eg: p.get('EG') } : {}) };
  const want: Record<string, string[]> = { diode: ['D'], zener: ['D'], led: ['D'], npn: ['NPN'], pnp: ['PNP'], nmos: ['NMOS'], pmos: ['PMOS'] };
  if (!want[sym]?.includes(card.type)) return { error: `a ${card.type} model does not fit this part (it needs ${want[sym]?.join(' or ') ?? 'no model'})` };
  if (card.type === 'D') {
    const bv = p.get('BV');
    const model: DiodeModel = { is: get('IS', 1e-14), n: get('N', 1), rs: get('RS', 0), ...(bv ? { bv, ibv: get('IBV', 1e-3) } : {}), ...temp };
    return { name: card.name, model, ...split(card, USED.D) };
  }
  if (card.type === 'NPN' || card.type === 'PNP') {
    const vaf = p.get('VAF') ?? p.get('VA'), vr = p.get('VAR') ?? p.get('VB');
    const model: BjtModel = { type: card.type === 'NPN' ? 'npn' : 'pnp', is: get('IS', 1e-16), bf: get('BF', 100), br: get('BR', 1), nf: get('NF', 1), nr: get('NR', 1), ...(vaf ? { vaf } : {}), ...(vr ? { var: vr } : {}), ...temp };
    return { name: card.name, model, ...split(card, USED.Q) };
  }
  const level = get('LEVEL', 1);
  if (level !== 1) return { error: `LEVEL=${level} MOSFET models are not supported; only level 1 (VTO, KP, LAMBDA). Vendor power-MOSFET subcircuits cannot be imported yet` };
  const nmos = card.type === 'NMOS';
  const model: MosModel = { type: nmos ? 'nmos' : 'pmos', vto: get('VTO', nmos ? 1 : -1), kp: get('KP', 2e-5), lambda: get('LAMBDA', 0), w: 1, l: 1, is: get('IS', 1e-14) };
  return { name: card.name, model, ...split(card, USED.M) };
}
