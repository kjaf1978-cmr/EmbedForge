// Waveform measurements (SIM-02): minimum, maximum, average, RMS, peak-to-peak and frequency
// over a range. Time points are not evenly spaced, so averages are time-weighted.

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
  const pts: [number, number][] = [];
  for (let i = 0; i < x.length; i++) if (x[i] >= x0 && x[i] <= x1) pts.push([x[i], y[i]]);
  if (Number.isFinite(x0) && x.length && x0 > x[0]) pts.unshift([x0, interpAt(x, y, x0)]);
  if (Number.isFinite(x1) && x.length && x1 < x[x.length - 1]) pts.push([x1, interpAt(x, y, x1)]);
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
