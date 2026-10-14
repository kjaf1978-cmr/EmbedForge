// Waveform measurements (SIM-02): minimum, maximum, average, RMS, peak-to-peak and frequency
// over a range, and the pulse measurements of a transient (rise and fall time, period, duty
// cycle, overshoot). Time points are not evenly spaced, so averages are time-weighted.

export interface Measures { min: number; max: number; avg: number; rms: number; pp: number; freq: number | null }

export function interpAt(x: number[], y: number[], at: number): number {
  const n = x.length;
  if (!n) return NaN;
  if (at <= x[0]) return y[0];
  if (at >= x[n - 1]) return y[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] <= at) lo = m; else hi = m; }
  const t = (at - x[lo]) / (x[hi] - x[lo] || 1);
  return y[lo] + t * (y[hi] - y[lo]);
}

export function measure(x: number[], y: number[], x0 = -Infinity, x1 = Infinity): Measures {
  const pts = inRange(x, y, x0, x1);
  if (!pts.length) return { min: NaN, max: NaN, avg: NaN, rms: NaN, pp: NaN, freq: null };
  let min = Infinity, max = -Infinity;
  for (const [, v] of pts) { if (v < min) min = v; if (v > max) max = v; }
  const span = pts[pts.length - 1][0] - pts[0][0];
  let avg: number, rms: number;
  if (span > 0) {
    let s1 = 0, s2 = 0;
    for (let i = 1; i < pts.length; i++) {
      const [xa, ya] = pts[i - 1], [xb, yb] = pts[i], h = xb - xa;
      s1 += (h * (ya + yb)) / 2;
      s2 += (h * (ya * ya + ya * yb + yb * yb)) / 3; // exact for a linear segment
    }
    avg = s1 / span; rms = Math.sqrt(Math.max(s2 / span, 0));
  } else {
    avg = pts.reduce((a, [, v]) => a + v, 0) / pts.length;
    rms = Math.sqrt(pts.reduce((a, [, v]) => a + v * v, 0) / pts.length);
  }
  // frequency from rising crossings of the mid level (with 10 % hysteresis)
  let freq: number | null = null;
  const pp = max - min;
  if (pp > 0 && span > 0) {
    const mid = (max + min) / 2, hys = pp * 0.1;
    const rises: number[] = [];
    let armed = pts[0][1] < mid - hys;
    for (let i = 1; i < pts.length; i++) {
      const [xa, ya] = pts[i - 1], [xb, yb] = pts[i];
      if (yb < mid - hys) armed = true;
      if (armed && ya < mid && yb >= mid) { rises.push(xa + ((mid - ya) / (yb - ya)) * (xb - xa)); armed = false; }
    }
    if (rises.length >= 2) freq = (rises.length - 1) / (rises[rises.length - 1] - rises[0]);
  }
  return { min, max, avg, rms, pp, freq };
}

/** Pulse and timing measurements of a transient (as an oscilloscope makes them). */
export interface Timing {
  /** Base and top levels: the most common values in the lower and upper half (time-weighted
   *  histogram), or the minimum and maximum when the waveform has no flat levels. */
  base: number; top: number;
  /** Mean period and duty cycle (high time / period, %) over the complete cycles in range. */
  period: number | null; duty: number | null;
  /** Mean 10–90 % rise and 90–10 % fall time over the complete edges in range. */
  rise: number | null; fall: number | null;
  /** Overshoot above the top and undershoot below the base, % of top − base. */
  overshoot: number; undershoot: number;
  edges: { rise: number; fall: number };
}

/** Points of the waveform in [x0, x1], with interpolated end points. */
function inRange(x: number[], y: number[], x0: number, x1: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < x.length; i++) if (x[i] >= x0 && x[i] <= x1) pts.push([x[i], y[i]]);
  if (Number.isFinite(x0) && x.length && x0 > x[0]) pts.unshift([x0, interpAt(x, y, x0)]);
  if (Number.isFinite(x1) && x.length && x1 < x[x.length - 1]) pts.push([x1, interpAt(x, y, x1)]);
  return pts;
}

/** Base and top levels from a time-weighted histogram (100 bins): the fullest bin of each half,
 *  if it holds at least 5 % of the time; otherwise the minimum or maximum (as an oscilloscope's
 *  top and base). */
export function levels(pts: [number, number][], min: number, max: number): { base: number; top: number } {
  const nb = 100, bins = new Array(nb).fill(0), span = max - min;
  if (!(span > 0)) return { base: min, top: max };
  const bin = (v: number) => Math.min(nb - 1, Math.max(0, Math.floor(((v - min) / span) * nb)));
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    // each segment's time goes to the bins it passes, in proportion (a flat segment to one bin)
    const [xa, ya] = pts[i - 1], [xb, yb] = pts[i], h = xb - xa;
    if (!(h > 0)) continue;
    total += h;
    const ba = bin(ya), bb = bin(yb);
    if (ba === bb) { bins[ba] += h; continue; }
    const lo = Math.min(ba, bb), hi = Math.max(ba, bb), share = h / (hi - lo + 1);
    for (let k = lo; k <= hi; k++) bins[k] += share;
  }
  const best = (a: number, b: number) => { let k = a; for (let j = a; j < b; j++) if (bins[j] > bins[k]) k = j; return k; };
  // the level: the time-weighted mean of the points in the fullest bin and its neighbours;
  // the outermost bin is the minimum or maximum itself (a waveform that stops at its extreme)
  const level = (k: number, extreme: number) => {
    if (!(total > 0 && bins[k] >= 0.05 * total)) return extreme;
    if (k === 0 || k === nb - 1) return extreme;
    let sw = 0, sy = 0;
    for (let i = 0; i < pts.length; i++) {
      if (Math.abs(bin(pts[i][1]) - k) > 1) continue;
      const wgt = ((pts[Math.min(i + 1, pts.length - 1)][0] - pts[Math.max(i - 1, 0)][0]) / 2) || 1e-300;
      sw += wgt; sy += wgt * pts[i][1];
    }
    return sw > 0 ? sy / sw : min + ((k + 0.5) / nb) * span;
  };
  return { base: level(best(0, nb / 2), min), top: level(best(nb / 2, nb), max) };
}

/** Rise and fall times (10–90 %), period, duty cycle, overshoot and undershoot over a range. */
export function timing(x: number[], y: number[], x0 = -Infinity, x1 = Infinity): Timing | null {
  const pts = inRange(x, y, x0, x1);
  if (pts.length < 2) return null;
  let min = Infinity, max = -Infinity;
  for (const [, v] of pts) { if (v < min) min = v; if (v > max) max = v; }
  if (!(max > min)) return null;
  const { base, top } = levels(pts, min, max);
  const amp = top - base;
  if (!(amp > 0)) return null;
  const lo = base + 0.1 * amp, mid = base + 0.5 * amp, hi = base + 0.9 * amp;
  const cross = (xa: number, ya: number, xb: number, yb: number, lv: number) => xa + ((lv - ya) / (yb - ya)) * (xb - xa);
  // edges: a rise runs from the last upward crossing of 10 % to the next upward crossing of 90 %
  const rises: number[] = [], falls: number[] = [];
  let upFrom: number | null = null, downFrom: number | null = null;
  // mid-level crossings for period and duty, armed by the 10 % and 90 % levels (hysteresis)
  const up: number[] = [], down: number[] = [];
  let state: 'low' | 'high' | null = pts[0][1] <= lo ? 'low' : pts[0][1] >= hi ? 'high' : null;
  for (let i = 1; i < pts.length; i++) {
    const [xa, ya] = pts[i - 1], [xb, yb] = pts[i];
    if (ya < lo && yb >= lo) upFrom = cross(xa, ya, xb, yb, lo);
    if (ya >= lo && yb < lo) upFrom = null;
    if (upFrom !== null && ya < hi && yb >= hi) { rises.push(cross(xa, ya, xb, yb, hi) - upFrom); upFrom = null; }
    if (ya > hi && yb <= hi) downFrom = cross(xa, ya, xb, yb, hi);
    if (ya <= hi && yb > hi) downFrom = null;
    if (downFrom !== null && ya > lo && yb <= lo) { falls.push(cross(xa, ya, xb, yb, lo) - downFrom); downFrom = null; }
    if (state === 'low' && ya < mid && yb >= mid) { up.push(cross(xa, ya, xb, yb, mid)); state = null; }
    if (state === 'high' && ya > mid && yb <= mid) { down.push(cross(xa, ya, xb, yb, mid)); state = null; }
    if (yb <= lo) state = 'low';
    else if (yb >= hi) state = 'high';
  }
  const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  // complete cycles: from one rising mid crossing to the next, high until the fall between them
  let period: number | null = null, duty: number | null = null;
  if (up.length >= 2) {
    period = (up[up.length - 1] - up[0]) / (up.length - 1);
    const widths: number[] = [];
    for (let k = 0; k + 1 < up.length; k++) {
      const f = down.find((d) => d > up[k] && d < up[k + 1]);
      if (f !== undefined) widths.push(f - up[k]);
    }
    if (widths.length) duty = (100 * mean(widths)!) / period;
  }
  return {
    base, top, period, duty, rise: mean(rises), fall: mean(falls),
    overshoot: (100 * Math.max(0, max - top)) / amp, undershoot: (100 * Math.max(0, base - min)) / amp,
    edges: { rise: rises.length, fall: falls.length },
  };
}

/** "Nice" axis ticks covering [a, b]. */
export function niceTicks(a: number, b: number, n = 6): number[] {
  if (!(b > a)) return [a];
  const raw = (b - a) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Decade ticks for a logarithmic axis. */
export function logTicks(a: number, b: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) { const v = Math.pow(10, e); if (v >= a * 0.999 && v <= b * 1.001) out.push(v); }
  return out;
}

/** CSV of the traces (one x column, one column per trace). */
export function toCsv(xName: string, x: number[], cols: { name: string; y: number[] }[]): string {
  const head = [xName, ...cols.map((c) => c.name)].map((h) => `"${h.replace(/"/g, '""')}"`).join(',');
  const rows = x.map((xv, i) => [xv, ...cols.map((c) => c.y[i])].map((v) => (Number.isFinite(v) ? String(v) : '')).join(','));
  return [head, ...rows].join('\n') + '\n';
}
