// Devices of the power and installation track (D20) without a SPICE primitive: gas discharge
// tube and circuit breaker, against their datasheet and IEC 60898 behaviour.
import { describe, expect, it } from 'vitest';
import { Engine, linearPoints } from '../src/sim/engine';
import type { Circuit, Element } from '../src/sim/circuit';

const near = (x: number, want: number, tol: number) => expect(Math.abs(x - want), `${x} vs ${want}`).toBeLessThanOrEqual(tol);

describe('gas discharge tube', () => {
  const gdt: Element = { kind: 'N', name: 'N1', a: 'm', b: '0', vspark: 230, varc: 20, ron: 0.05, ihold: 0.2 };
  it('blocks below its spark-over voltage, arcs above it at about the arc voltage', () => {
    const below = new Engine({ elements: [{ kind: 'V', name: 'V1', p: 's', n: '0', dc: 200 }, { kind: 'R', name: 'R1', a: 's', b: 'm', r: 100 }, gdt] }).op();
    near(below.v.m, 200, 1e-3);
    const above = new Engine({ elements: [{ kind: 'V', name: 'V1', p: 's', n: '0', dc: 300 }, { kind: 'R', name: 'R1', a: 's', b: 'm', r: 100 }, gdt] }).op();
    // (300 − 20)/100.05 = 2.8 A in the arc
    near(above.v.m, 20 + 0.05 * (280 / 100.05), 1e-3);
  });
  it('a surge: it fires at the spark-over voltage and holds the line near the arc voltage; it goes out when the current falls below the holdover current', () => {
    const c: Circuit = { elements: [
      { kind: 'V', name: 'VS', p: 's', n: '0', dc: 0, wave: { type: 'exp', v1: 0, v2: 4148, td1: 0, tau1: 0.405e-6, td2: 0, tau2: 68.2e-6 } },
      { kind: 'R', name: 'RS', a: 's', b: 'm', r: 2 }, gdt,
    ] };
    const w = new Engine(c).tran(0.05e-6, 2e-3, 0.5e-6);
    const peak = Math.max(...w.v.m);
    expect(peak).toBeGreaterThan(230); expect(peak).toBeLessThan(260);
    const k = w.x.findIndex((t) => t >= 20e-6);
    near(w.v.m[k], 20 + 0.05 * w.i.N1[0][k], 0.5);
    // by 2 ms the surge has decayed: the tube is out and the line follows the (small) source
    expect(Math.abs(w.v.m[w.x.length - 1] - w.v.s[w.x.length - 1])).toBeLessThan(1);
  });
});

describe('circuit breaker', () => {
  const cb = (inom: number, mag: number, idn = 0, poles = [{ a: 'l', b: 'lo' }]): Element => ({ kind: 'Y', name: 'Y1', poles, inom, mag, tau: 68, idn, ron: 0.005, closed: true });
  it('a short circuit on a C16 breaker (magnetic trip at 10 × 16 A): it opens within the first half cycle', () => {
    const c: Circuit = { elements: [
      { kind: 'V', name: 'V1', p: 'l', n: '0', dc: 0, wave: { type: 'sin', vo: 0, va: 325, freq: 50 } },
      cb(16, 10), { kind: 'R', name: 'RF', a: 'lo', b: '0', r: 0.5 },
    ] };
    const w = new Engine(c).tran(20e-6, 40e-3, 20e-6);
    const i = w.i.Y1[0];
    const k = i.findIndex((x) => Math.abs(x) < 1e-3 && w.x[i.indexOf(x)] > 0.5e-3);
    expect(w.x[k]).toBeLessThan(10e-3);
    // it trips as the current passes 10 · 16 · √2 = 226 A
    expect(Math.max(...i.map(Math.abs))).toBeLessThan(226 * 1.05);
    expect(Math.abs(i[i.length - 1])).toBeLessThan(1e-6);
  });
  it('16 A load on a 16 A breaker: no trip; 2.55 × In: thermal trip after about 20 s (IEC 60898: 1 to 60 s)', () => {
    const run = (amps: number, stop: number) => {
      const c: Circuit = { elements: [{ kind: 'I', name: 'I1', p: '0', n: 'l', dc: amps }, cb(16, 10), { kind: 'R', name: 'RL', a: 'lo', b: '0', r: 1 }, { kind: 'R', name: 'RB', a: 'l', b: '0', r: 1e3 }] };
      return new Engine(c).tran(0.05, stop, 0.05);
    };
    const ok = run(16, 30);
    expect(Math.abs(ok.i.Y1[0][ok.x.length - 1])).toBeGreaterThan(15);
    const hot = run(2.55 * 16, 40);
    const k = hot.i.Y1[0].findIndex((x) => Math.abs(x) < 1);
    expect(hot.x[k]).toBeGreaterThan(15); expect(hot.x[k]).toBeLessThan(25);
    // 1.45 × In trips within the hour; 1.13 × In never (θ settles at 1.28 < 1.66)
    expect(-68 * Math.log(1 - 1.66 / 1.45 ** 2)).toBeLessThan(3600);
    expect(1.13 ** 2).toBeLessThan(1.66);
  });
  it('a 30 mA RCD (two poles L and N): 40 mA to earth trips it, 10 mA does not', () => {
    const run = (leak: number) => {
      const c: Circuit = { elements: [
        { kind: 'V', name: 'V1', p: 'l', n: 'n', dc: 230 }, { kind: 'R', name: 'RE', a: 'n', b: '0', r: 1 },
        cb(16, 10, 0.03, [{ a: 'l', b: 'lo' }, { a: 'n', b: 'no' }]),
        { kind: 'R', name: 'RL', a: 'lo', b: 'no', r: 100 },
        { kind: 'R', name: 'RLEAK', a: 'lo', b: '0', r: 230 / leak },
      ] };
      return new Engine(c).tran(1e-3, 50e-3, 1e-3);
    };
    const a = run(0.04), b = run(0.01);
    expect(Math.abs(a.i.Y1[0][a.x.length - 1])).toBeLessThan(1e-6);
    expect(Math.abs(b.i.Y1[0][b.x.length - 1])).toBeGreaterThan(2);
  });
});

describe('surge waveforms', () => {
  it('the 1.2/50 µs double exponential: front time 1.25·(t90 − t30)/… about 1.2 µs, half value at about 50 µs', () => {
    const c: Circuit = { elements: [{ kind: 'V', name: 'V1', p: 'a', n: '0', dc: 0, wave: { type: 'exp', v1: 0, v2: 1.037, td1: 0, tau1: 0.405e-6, td2: 0, tau2: 68.2e-6 } }, { kind: 'R', name: 'R1', a: 'a', b: '0', r: 1 }] };
    const w = new Engine(c).tran(0.01e-6, 120e-6, 0.01e-6);
    const v = w.v.a, peak = Math.max(...v), kp = v.indexOf(peak);
    near(peak, 1, 0.01);
    const at = (lv: number, from: number, to: number) => { for (let k = from; k < to; k++) if ((v[k] - lv) * (v[k + 1] - lv) <= 0) return w.x[k] + ((lv - v[k]) / (v[k + 1] - v[k])) * (w.x[k + 1] - w.x[k]); return NaN; };
    // IEC 61000-4-5 front time T1 = 1.67 · (t90 − t30)
    const t30 = at(0.3 * peak, 0, kp), t90 = at(0.9 * peak, 0, kp), t50 = at(0.5 * peak, kp, v.length - 1);
    near(1.67 * (t90 - t30), 1.2e-6, 0.1e-6);
    near(t50 - (t30 - 0.3 * 1.67 * (t90 - t30)), 50e-6, 3e-6);
    void linearPoints;
  });
});

describe('capacitor initial voltage (IC=)', () => {
  it('a power-on start holds it at its initial voltage instead of 0 V: an RC discharges from it', () => {
    const c: Circuit = { elements: [{ kind: 'C', name: 'C1', a: 'a', b: '0', c: 1e-6, ic: 5 }, { kind: 'R', name: 'R1', a: 'a', b: '0', r: 1e3 }] };
    const w = new Engine(c).tran(10e-6, 3e-3, 10e-6, 200000, true);
    near(w.v.a[0], 5, 1e-3);
    const k = w.x.findIndex((t) => t >= 1e-3);
    near(w.v.a[k], 5 * Math.exp(-w.x[k] / 1e-3), 0.02);
  });
});

describe('thinned transient output (a long switching run)', () => {
  it('keeps one point per print step while the solver steps finely, with the same result', () => {
    // a 20 kHz square into an RC: the solver needs small steps at every edge
    const c: Circuit = { elements: [
      { kind: 'V', name: 'V1', p: 's', n: '0', dc: 0, wave: { type: 'pulse', v1: 0, v2: 10, td: 0, tr: 1e-7, tf: 1e-7, pw: 25e-6, per: 50e-6 } },
      { kind: 'R', name: 'R1', a: 's', b: 'a', r: 1e3 }, { kind: 'C', name: 'C1', a: 'a', b: '0', c: 1e-6 }] };
    const full = new Engine(c).tran(10e-6, 5e-3, 10e-6);
    const thin = new Engine(c).tran(10e-6, 5e-3, 10e-6, 200000, false, true);
    expect(thin.x.length).toBeLessThan(full.x.length);
    expect(thin.x.length).toBeLessThanOrEqual(5e-3 / 10e-6 + 2);
    for (let k = 1; k < thin.x.length - 1; k++) expect(thin.x[k] - thin.x[k - 1]).toBeGreaterThan(10e-6 * 0.999);
    near(thin.x[thin.x.length - 1], 5e-3, 1e-9);
    near(thin.v.a[thin.x.length - 1], full.v.a[full.x.length - 1], 1e-6);
  });
});

describe('relay contact opening an AC load (zc)', () => {
  // 325 V 50 Hz into 10 Ω + 50 mH (the current lags by 57°); the coil current (through the
  // 0 V sense source VS) stops at 55 ms, when the load current is far from zero
  const circuit = (zc: boolean): Circuit => ({ elements: [
    { kind: 'V', name: 'V1', p: 's', n: '0', dc: 0, wave: { type: 'sin', vo: 0, va: 325, freq: 50 } },
    { kind: 'W', name: 'K1', p: 's', n: 'a', ctrl: 'VS', it: 0.05, ih: 0.02, ron: 0.05, roff: 1e9, ...(zc ? { zc: true } : {}) },
    { kind: 'R', name: 'R1', a: 'a', b: 'l', r: 10 }, { kind: 'L', name: 'L1', a: 'l', b: '0', l: 0.05 },
    { kind: 'V', name: 'VC', p: 'c', n: '0', dc: 0, wave: { type: 'pulse', v1: 10, v2: 0, td: 0.055, tr: 1e-6, tf: 1e-6, pw: 1, per: 2 } },
    { kind: 'V', name: 'VS', p: 'c', n: 'cs', dc: 0 }, { kind: 'R', name: 'RC', a: 'cs', b: '0', r: 100 }] });
  const opening = (zc: boolean) => {
    const w = new Engine(circuit(zc)).tran(20e-6, 0.08, 20e-6);
    const i = w.i.R1[0], k = w.x.findIndex((t, j) => t > 0.055 && Math.abs(i[j]) < 1e-4);
    return { t: w.x[k], before: Math.abs(i[k - 1]) };
  };
  it('with zc the contact opens at the next current zero (63.2 ms: 57.5° after the voltage zero at 60 ms); without it at once (55 ms)', () => {
    const a = opening(true), b = opening(false);
    expect(a.before).toBeLessThan(0.3); // the current had reached zero (peak about 17 A)
    expect(Math.abs(a.t - 0.0632)).toBeLessThan(0.0005);
    expect(b.t - 0.055).toBeLessThan(0.0003);
  });
});
