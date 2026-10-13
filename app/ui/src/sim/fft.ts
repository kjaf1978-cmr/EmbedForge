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

export interface Spectrum { f: number[]; amp: number[] }

/** Peak-amplitude spectrum of y(x) over [x0, x1] with n points (a power of two). DC excluded. */
export function spectrum(x: number[], y: number[], x0: number, x1: number, n = 8192): Spectrum {
  const span = x1 - x0;
  if (!(span > 0) || x.length < 2) return { f: [], amp: [] };
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / n); // Hann, coherent gain 0.5
    re[k] = interpAt(x, y, x0 + (span * k) / n) * w;
  }
  fft(re, im);
  const f: number[] = [], amp: number[] = [];
  for (let k = 1; k < n / 2; k++) { f.push(k / span); amp.push((2 * Math.hypot(re[k], im[k])) / (n * 0.5)); }
  return { f, amp };
}

/** Total harmonic distortion of the strongest component (harmonics 2 to 10), in percent. */
export function thd(s: Spectrum): { f0: number; amp: number; thd: number } | null {
  if (!s.amp.length) return null;
  let k0 = 0;
  for (let k = 1; k < s.amp.length; k++) if (s.amp[k] > s.amp[k0]) k0 = k;
  // sum the energy of the window's main lobe (±2 bins) around each harmonic
  const band = (k: number) => { let e = 0; for (let j = Math.max(0, k - 2); j <= Math.min(s.amp.length - 1, k + 2); j++) e += s.amp[j] ** 2; return e; };
  const bin = k0 + 1; // f[k] is bin k + 1
  const e1 = band(k0);
  let eh = 0;
  for (let h = 2; h <= 10; h++) { const k = h * bin - 1; if (k < s.amp.length) eh += band(k); }
  return { f0: s.f[k0], amp: Math.sqrt(e1 / 1.5), thd: 100 * Math.sqrt(eh / e1) };
}
