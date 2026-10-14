import { describe, expect, it } from 'vitest';
import { component, fft, spectrum, thd } from '../src/sim/fft';

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
  const uni = (n: number, dt: number) => Array.from({ length: n }, (_, k) => k * dt);
  it('a tone between two bins: amplitude and frequency from the main lobe', () => {
    const x = uni(10001, 1e-6);
    for (const f0 of [1050, 1037, 1081]) {
      const r = thd(spectrum(x, x.map((t) => 2 * Math.sin(2 * Math.PI * f0 * t)), 0, 10e-3))!;
      expect(Math.abs(r.f0 - f0)).toBeLessThan(0.5);        // bins are 100 Hz apart
      expect(Math.abs(20 * Math.log10(r.amp / 2))).toBeLessThan(0.01); // dB
    }
  });
  it('square wave: odd harmonics 4/(πn) within 0.01 dB; THD of harmonics 2–10 as calculated', () => {
    const x = uni(100001, 0.1e-6), y = x.map((t) => ((t * 2e3) % 2 < 1 ? 1 : -1));
    const s = spectrum(x, y, 0, 10e-3);
    for (const n of [1, 3, 5, 7, 9]) {
      const a = component(s, Math.round((n * 1000) / s.df) - 1).amp;
      expect(Math.abs(20 * Math.log10(a / (4 / (Math.PI * n))))).toBeLessThan(0.01);
    }
    expect(thd(s)!.thd).toBeCloseTo(100 * Math.sqrt(1 / 9 + 1 / 25 + 1 / 49 + 1 / 81), 1);
  });
  it('no aliasing: a 10 kHz tone over 1 s is at 10 kHz (the FFT length follows the data)', () => {
    const x = uni(1000001, 1e-6), s = spectrum(x, x.map((t) => Math.sin(2 * Math.PI * 10e3 * t)), 0, 1);
    expect(s.fmax).toBeGreaterThan(10e3);
    expect(thd(s)!.f0).toBeCloseTo(10e3, 3);
  });
  it('a tone 40 dB down next to a strong one is measured to 0.01 dB', () => {
    const x = uni(10001, 1e-6), s = spectrum(x, x.map((t) => Math.sin(2 * Math.PI * 1e3 * t) + 0.01 * Math.sin(2 * Math.PI * 3.7e3 * t)), 0, 10e-3);
    expect(Math.abs(20 * Math.log10(component(s, 36).amp / 0.01))).toBeLessThan(0.01);
  });
});

