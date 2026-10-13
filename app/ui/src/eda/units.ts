// Engineering values (UI-08 (g)): "10k", "4k7", "4u7", "100n", "2.2M", "1meg", "330", "5V".
// Case matters as on schematics: "M" is mega, "m" is milli; "meg" is accepted for SPICE users.

const PREFIX: Record<string, number> = {
  f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3,
  k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12,
};

/** Unit symbols a value may end with; they are ignored when parsing. */
const UNITS = ['Ω', 'ohm', 'Ohm', 'R', 'F', 'H', 'V', 'A', 'Hz', 's', '%', 'W'];

/** Parses an engineering value; returns null when the text is not a value. */
export function parseValue(text: string): number | null {
  let s = text.trim().replace(/\s+/g, '');
  if (!s) return null;
  // strip a trailing unit symbol (longest first), but keep a lone "R" in "4R7"
  for (const u of [...UNITS].sort((a, b) => b.length - a.length)) {
    if (s.length > u.length && s.endsWith(u) && !(u === 'R' && /\dR\d/.test(s))) { s = s.slice(0, -u.length); break; }
  }
  const meg = s.match(/^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)meg$/i);
  if (meg) return Number(meg[1]) * 1e6;
  // plain number, optionally with exponent
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number(s);
  // number + prefix: 10k, 2.2M, 100n
  const m1 = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))([fpnuµμmkKMGT])$/);
  if (m1) return Number(m1[1]) * PREFIX[m1[2]];
  // prefix as decimal point: 4k7, 4u7, 2M2, 4R7 (R = ohm decimal point)
  const m2 = s.match(/^([+-]?\d+)([fpnuµμmkKMGTR])(\d+)$/);
  if (m2) return Number(`${m2[1]}.${m2[3]}`) * (m2[2] === 'R' ? 1 : PREFIX[m2[2]]);
  return null;
}

const SI: [number, string][] = [
  [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f'],
];

/** Formats a number with an SI prefix and unit, e.g. 0.00123 → "1.23 mA". */
export function formatValue(v: number, unit = '', digits = 3): string {
  if (!Number.isFinite(v)) return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Number.isNaN(v) ? 'NaN' : '∞'} ${unit}`.trim();
  if (v === 0) return `0 ${unit}`.trim();
  const a = Math.abs(v);
  let [scale, p] = SI[SI.length - 1];
  for (const [s, q] of SI) if (a >= s * 0.9995) { scale = s; p = q; break; }
  let n = Number((v / scale).toPrecision(digits));
  if (Math.abs(n) >= 1000 && scale < 1e12) { const i = SI.findIndex(([s]) => s === scale); [scale, p] = SI[i - 1]; n = Number((v / scale).toPrecision(digits)); }
  return `${n}${unit || p ? ' ' : ''}${p}${unit}`;
}

/** SPICE text for a number: plain exponent notation, so no prefix can be misread (m vs M). */
export function spiceNumber(v: number): string {
  if (v === 0) return '0';
  const s = Number(v.toPrecision(12)).toString();
  return s.replace('e+', 'e');
}

/** Standard E-series values for resistors and capacitors. */
export const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
export const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];

/** Nearest E-series value (used to say whether a value is a standard value). */
export function nearestStandard(v: number, series = E24): number {
  if (!(v > 0)) return v;
  const dec = Math.pow(10, Math.floor(Math.log10(v)));
  let best = series[0] * dec;
  for (const d of [dec / 10, dec, dec * 10]) for (const s of series) {
    const c = s * d;
    if (Math.abs(Math.log(c / v)) < Math.abs(Math.log(best / v))) best = c;
  }
  return Number(best.toPrecision(3));
}
