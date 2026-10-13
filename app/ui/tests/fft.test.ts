import { describe, expect, it } from 'vitest';
import { fft, spectrum, thd } from '../src/sim/fft';

describe('FFT view', () => {
  it('fft of a cosine has its energy in one bin', () => {
    const n = 64, re = new Float64Array(n), im = new Float64Array(n);
    for (let k = 0; k < n; k++) re[k] = Math.cos((2 * Math.PI * 5 * k) / n);
    fft(re, im);
    expect(Math.hypot(re[5], im[5])).toBeCloseTo(n / 2, 9);
    expect(Math.hypot(re[7], im[7])).toBeLessThan(1e-9);
  });
  it('a 2 V, 1 kHz sine over 10 periods shows 2 V at 1 kHz; its THD is near 0', () => {
    const x = Array.from({ length: 5001 }, (_, k) => k * 2e-6), y = x.map((t) => 2 * Math.sin(2 * Math.PI * 1e3 * t));
    const s = spectrum(x, y, 0, 10e-3);
    const k = s.amp.indexOf(Math.max(...s.amp));
    expect(s.f[k]).toBeCloseTo(1000, 6);
    expect(s.amp[k]).toBeCloseTo(2, 2);
    expect(thd(s)!.thd).toBeLessThan(0.1);
  });
  it('a clipped sine has the THD of its harmonics', () => {
    const x = Array.from({ length: 20001 }, (_, k) => k * 1e-6), y = x.map((t) => Math.sin(2 * Math.PI * 1e3 * t) + 0.1 * Math.sin(2 * Math.PI * 3e3 * t));
    expect(thd(spectrum(x, y, 0, 20e-3))!.thd).toBeCloseTo(10, 0);
  });
});
