// Purchasable values and ratings (decision D20, VER-13). Resistors are sold in the E24 (5 %)
// and E96 (1 %) series, capacitors and inductors in E12 (E6 for electrolytics), and every
// rating in fixed catalogue steps. A value outside its series is offered the nearest standard
// values; a rating between steps is offered the next higher step (a part may be rated above
// what the circuit needs, never below).

import { E12, E24, parseValue, shortValue } from './units';
import type { Part } from './schematic';

export const E6 = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];
/** E96 (1 %): 10^(i/96) rounded to three significant digits (IEC 60063; no exceptions in E96). */
export const E96 = Array.from({ length: 96 }, (_, i) => Number(Math.pow(10, i / 96).toPrecision(3)));
/** Potentiometers and trimmers: the 1-2-5 steps beside E6 (1k, 2k, 2.2k, 4.7k, 5k, 10k …). */
const POT = [...new Set([...E6, 2.0, 5.0])].sort((a, b) => a - b);
/** Fuse ratings (R10 steps of the IEC 60127 and UL 248 ranges), in A. */
export const FUSE_A = [0.05, 0.063, 0.08, 0.1, 0.125, 0.16, 0.2, 0.25, 0.315, 0.4, 0.5, 0.63, 0.8, 1, 1.25, 1.6, 2, 2.5, 3.15, 4, 5, 6.3, 8, 10, 12, 15, 16, 20, 25, 30, 32, 35, 40, 50, 63];
/** Resistor power ratings in W (film and metal-oxide through-hole, chip, wirewound, aluminium-housed, braking and load resistors). */
export const RES_W = [0.063, 0.1, 0.125, 0.25, 0.4, 0.5, 0.6, 0.75, 1, 2, 3, 5, 7, 10, 15, 20, 25, 50, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000];
/** Capacitor voltage ratings in V. */
export const CAP_V = [2.5, 4, 6.3, 10, 16, 25, 35, 50, 63, 80, 100, 160, 200, 250, 315, 350, 400, 450, 500, 630, 800, 1000, 1200, 1600, 2000, 3000];

export const SERIES: Record<string, number[]> = { E6, E12, E24, E96, POT };

/** Mantissa of v in [1, 10). */
function mantissa(v: number): number {
  const m = v / Math.pow(10, Math.floor(Math.log10(v) + 1e-12));
  return m >= 9.9995 ? 1 : m;
}

/** Is v a value of the series (within rounding of three significant digits)? */
export function inSeries(v: number, series: number[]): boolean {
  if (!(v > 0)) return false;
  const m = mantissa(v);
  return series.some((s) => Math.abs(m - s) <= 0.0006 * s);
}

/** The value of the series nearest to v (on a logarithmic scale). */
export function nearestIn(v: number, series: number[]): number {
  const dec = Math.pow(10, Math.floor(Math.log10(v) + 1e-12));
  let best = series[0] * dec;
  for (const d of [dec / 10, dec, dec * 10]) for (const s of series) if (Math.abs(Math.log((s * d) / v)) < Math.abs(Math.log(best / v))) best = s * d;
  return Number(best.toPrecision(3));
}

/** The smallest step at or above v, or null above the last step. */
export function nextStep(v: number, steps: number[]): number | null {
  return steps.find((s) => s >= v * (1 - 1e-9)) ?? null;
}

interface Rule { key: string; kind: 'series'; series: string[] }
interface RatingRule { key: string; kind: 'rating'; steps: number[] }
const RULES: Record<string, (Rule | RatingRule)[]> = {
  resistor: [{ key: 'value', kind: 'series', series: ['E24', 'E96'] }, { key: 'pmax', kind: 'rating', steps: RES_W }],
  potentiometer: [{ key: 'value', kind: 'series', series: ['POT'] }, { key: 'pmax', kind: 'rating', steps: RES_W }],
  capacitor: [{ key: 'value', kind: 'series', series: ['E12', 'E24'] }, { key: 'vmax', kind: 'rating', steps: CAP_V }],
  capacitor_pol: [{ key: 'value', kind: 'series', series: ['E6', 'E12'] }, { key: 'vmax', kind: 'rating', steps: CAP_V }],
  inductor: [{ key: 'value', kind: 'series', series: ['E12', 'E24'] }],
  ntc: [{ key: 'value', kind: 'series', series: ['E6', 'E12'] }, { key: 'pmax', kind: 'rating', steps: RES_W }],
  fuse: [{ key: 'value', kind: 'rating', steps: FUSE_A }],
};

export interface Unbuyable {
  key: string;
  value: number;
  /** What to use instead: the nearest value of each series, or the next rating step. */
  options: string[];
  message: string;
}

/** Properties of a part that cannot be bought as they are, with what to use instead. */
export function unbuyable(p: Part): Unbuyable[] {
  const out: Unbuyable[] = [];
  for (const r of RULES[p.sym] ?? []) {
    const v = parseValue(p.props[r.key] ?? '');
    if (v === null || !(v > 0)) continue;
    if (r.kind === 'series') {
      if (r.series.some((s) => inSeries(v, SERIES[s]))) continue;
      const opts = [...new Set(r.series.map((s) => shortValue(nearestIn(v, SERIES[s]))))];
      const names = r.series.map((s) => (s === 'POT' ? 'potentiometer steps' : s)).join(' or ');
      out.push({ key: r.key, value: v, options: opts, message: `${p.ref}: ${shortValue(v)} is not a standard value (${names}); nearest: ${opts.join(', ')}` });
    } else {
      if (r.steps.some((s) => Math.abs(s - v) <= 1e-9 * s)) continue;
      const n = nextStep(v, r.steps);
      out.push({ key: r.key, value: v, options: n === null ? [] : [shortValue(n)], message: `${p.ref}: no part is rated ${shortValue(v)}; ${n === null ? 'above the largest catalogue rating' : `next rating up: ${shortValue(n)}`}` });
    }
  }
  return out;
}
