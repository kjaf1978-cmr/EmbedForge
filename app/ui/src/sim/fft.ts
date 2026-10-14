// Spectrum of a transient trace (FFT view): the trace is resampled evenly over the chosen
// range, weighted with a Hann window and transformed. Amplitudes are peak values corrected for
// the window, so a 2 V sine shows as 2 V (6 dBV) at its frequency.

import { interpAt } from './measure';

/** In-place radix-2 FFT of (re, im); the length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

export interface Spectrum {
  f: number[];
  amp: number[];
  /** Frequency resolution (bin spacing) and the highest frequency shown, in Hz. */
  df: number;
  fmax: number;
  /** True when the waveform holds finer detail than the FFT length: each FFT sample is the
   *  waveform's average over its interval (an anti-alias filter) rather than a point sample. */
  averaged: boolean;
}

const MIN_N = 8192, MAX_N = 1 << 20;

/** Peak-amplitude spectrum of y(x) over [x0, x1]. The FFT length follows the number of
 *  waveform points in the range (8192 to 2^20), so the spectrum reaches as high as the
 *  waveform resolves; beyond 2^20 points, interval averages keep higher frequencies from
 *  folding down (aliasing). DC is excluded. */
export function spectrum(x: number[], y: number[], x0: number, x1: number, nIn?: number): Spectrum {
  const span = x1 - x0;
  const empty = { f: [], amp: [], df: 0, fmax: 0, averaged: false };
  if (!(span > 0) || x.length < 2) return empty;
  let inRange = 0;
  for (const v of x) if (v >= x0 && v <= x1) inRange++;
  let n = nIn ?? MIN_N;
  if (!nIn) while (n < 2 * inRange && n < MAX_N) n *= 2;
  const dt = span / n;
  const averaged = !nIn && inRange > n;
  // running integral of the piecewise-linear waveform, for interval averages
  let ig: number[] | null = null;
  if (averaged) {
    ig = new Array<number>(x.length).fill(0);
    for (let i = 1; i < x.length; i++) ig[i] = ig[i - 1] + ((y[i] + y[i - 1]) / 2) * (x[i] - x[i - 1]);
  }
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / n); // Hann, coherent gain 0.5
    const t = x0 + dt * k;
    const v = ig ? (interpAt(x, ig, t + dt / 2) - interpAt(x, ig, t - dt / 2)) / dt : interpAt(x, y, t);
    re[k] = v * w;
  }
  fft(re, im);
  const f: number[] = [], amp: number[] = [];
  for (let k = 1; k < n / 2; k++) { f.push(k / span); amp.push((2 * Math.hypot(re[k], im[k])) / (n * 0.5)); }
  return { f, amp, df: 1 / span, fmax: (n / 2 - 1) / span, averaged };
}

/** Amplitude and frequency of the component around bin index k: the energy of the window's
 *  main lobe (±2 bins) and its centre, so a tone between two bins is measured correctly. */
export function component(s: Spectrum, k: number): { f: number; amp: number } {
  let e = 0, ef = 0;
  for (let j = Math.max(0, k - 2); j <= Math.min(s.amp.length - 1, k + 2); j++) { e += s.amp[j] ** 2; ef += s.amp[j] ** 2 * s.f[j]; }
  return { f: e > 0 ? ef / e : s.f[k], amp: Math.sqrt(e / 1.5) };
}

/** Total harmonic distortion of the strongest component (harmonics 2 to 10), in percent. */
export function thd(s: Spectrum): { f0: number; amp: number; thd: number } | null {
  if (!s.amp.length) return null;
  let k0 = 0;
  for (let k = 1; k < s.amp.length; k++) if (s.amp[k] > s.amp[k0]) k0 = k;
  const fund = component(s, k0);
  let eh = 0;
  for (let h = 2; h <= 10; h++) {
    const k = Math.round((h * fund.f) / s.df) - 1; // f[k] is bin k + 1
    if (k + 2 < s.amp.length) eh += component(s, k).amp ** 2;
  }
  return { f0: fund.f, amp: fund.amp, thd: (100 * Math.sqrt(eh)) / fund.amp };
}
