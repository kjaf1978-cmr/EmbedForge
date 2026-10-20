// P7a, the 50 Hz-transformer inverter (48 V, 5 kW): structure, and its DFMEA failure modes
// (DFMEA.md section 5) by simulation. The runs with the bridge switching take 2 to 25 minutes
// each (12 s of computing per millisecond), so they run with LONG=1 (npm run test:long); their
// results are in TEST_REPORT.md.
import { describe, expect, it } from 'vitest';
import { inverterLF, type InverterLfOptions } from '../src/eda/inverters';
import { simulate, type SimResult } from '../src/sim/run';
import { erc } from '../src/eda/erc';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import type { Sheet } from '../src/eda/schematic';
import { textCollisions } from './drawing.helpers';

const LONG = !!process.env.LONG;

async function run(o: InverterLfOptions, f: (s: Sheet) => Sheet = (s) => s) {
  const { sheet: s0, nb } = inverterLF(o);
  const sheet = f(s0);
  await new Promise((r) => setTimeout(r, 500)); // let the reporter's pending update be answered before the worker blocks
  const r = simulate(sheet) as SimResult;
  expect('error' in r ? r.error : '').toBe('');
  const x = r.x, n = x.length;
  const ref = (key: string) => nb.refOf(sheet, key);
  const cur = (key: string, pin: string) => r.i[`${ref(key)}.${pin}`];
  const k0 = (t0: number) => Math.max(0, x.findIndex((t) => t >= t0));
  /** time average from t0 to the end */
  const mean = (y: number[], t0: number) => { let m = 0, T = 0; for (let k = k0(t0) + 1; k < n; k++) { const h = x[k] - x[k - 1]; m += y[k] * h; T += h; } return m / T; };
  const rms = (y: number[], t0: number) => { let m = 0, T = 0; for (let k = k0(t0) + 1; k < n; k++) { const h = x[k] - x[k - 1]; m += y[k] * y[k] * h; T += h; } return Math.sqrt(m / T); };
  const max = (y: number[], t0 = 0) => y.slice(k0(t0)).reduce((m, v) => Math.max(m, v), -Infinity);
  const min = (y: number[], t0 = 0) => y.slice(k0(t0)).reduce((m, v) => Math.min(m, v), Infinity);
  const at = (net: string, t: number) => r.v[net][k0(t)];
  return { r, sheet, x, ref, cur, mean, rms, max, min, at, last: (net: string) => r.v[net][n - 1] };
}

describe('50 Hz-transformer inverter: the drawing', () => {
  const { sheet, nb } = inverterLF();
  it('ERC clean, every connection drawn as a wire or label, text readable', () => {
    expect(erc(sheet).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
    expect(nb.unrouted).toEqual([]);
    expect(textCollisions(sheet)).toEqual([]);
  }, 60_000);
});

describe('50 Hz-transformer inverter: DFMEA failure modes', () => {
  it('I-2 battery connected the wrong way round: nothing conducts, the contactor stays open, the bus stays at 0 V', async () => {
    const s = await run({ reversed: true, stop: '10m' });
    expect(Math.abs(s.max(s.cur('BAT', '1').map(Math.abs)))).toBeLessThan(0.05);
    expect(s.min(s.r.v['BUS'])).toBeGreaterThan(-1);
    expect(s.max(s.r.v['BUS'])).toBeLessThan(1);
    expect(s.max(s.r.v['AXA'])).toBeLessThan(1);
  }, 600_000);

});

describe.runIf(LONG)('50 Hz-transformer inverter: DFMEA failure modes (long runs)', () => {
  it('I-1 connecting the battery: the bus charges through 10 Ω (no inrush), the contactor closes above 91 % of the battery, then the bridge is released', async () => {
    // the bus reaches 91 % in about 0.11 s (10 Ω × 4.7 mF), the contactor closes about 14 ms later
    const s = await run({ stop: '150m' });
    const ibat = s.cur('BAT', '1').map(Math.abs), kClose = s.x.findIndex((t, k) => t > 1e-3 && s.r.v['BKA'][k] < 0.3); // after the control supply is up
    expect(kClose).toBeGreaterThan(0);
    // before the contactor closes: the pre-charge resistor limits the current to 52 V / 10 Ω
    expect(s.max(ibat.slice(0, kClose))).toBeLessThan(5.5);
    expect(s.r.v['BUS'][kClose]).toBeGreaterThan(0.91 * 52 * 0.98);
    // the closing step charges the last few volts: no more than a few hundred amperes for microseconds
    expect(s.max(ibat)).toBeLessThan(400);
    expect(s.at('EN', s.x[kClose] - 1e-3)).toBeLessThan(1);
    expect(s.last('EN')).toBeGreaterThan(8);
  }, 14_400_000);

  // the battery window (I-8, I-9) and the heatsink (I-11): EN stays low, so the bridge never starts
  for (const [what, o] of [
    ['I-8 battery below the 42 V low cut-out (41 V)', { vbat: 41 }],
    ['I-8 battery at 45 V, between the cut-out and the 47 V restart level: no start', { vbat: 45 }],
    ['I-9 battery above the 61 V high cut-out (62 V)', { vbat: 62 }],
    ['I-11 heatsink at 95 °C (stop above 90 °C)', { theatsink: 95 }],
  ] as [string, InverterLfOptions][]) {
    it(`${what}: the bridge stays stopped`, async () => {
      const s = await run({ ...o, precharged: true, stop: '24m' });
      // the contactor has closed (at 41 V its 48 V coil gets 40.3 V, below the 85 % pull-in)
      if ((o.vbat ?? 52) > 42) expect(s.min(s.r.v['BKA'], 0.02)).toBeLessThan(0.3);
      expect(s.max(s.r.v['EN'])).toBeLessThan(1);
      expect(s.max(s.r.v['OUTL'].map(Math.abs))).toBeLessThan(1);
    }, 3_600_000);
  }
  for (const [what, o] of [
    ['battery at 48 V, above the restart level', { vbat: 48 }],
    // 58.4 V: sixteen LiFePO4 cells fully charged (the cut-out's hysteresis band, 59.4 … 61.3 V,
    // starts tripped at power-up)
    ['battery at 58.4 V, fully charged, below the high cut-out', { vbat: 58.4 }],
    ['heatsink at 85 °C', { theatsink: 85 }],
  ] as [string, InverterLfOptions][]) {
    it(`${what}: the bridge starts once the contactor has closed`, async () => {
      const s = await run({ ...o, precharged: true, stop: '19m' });
      expect(s.last('EN')).toBeGreaterThan(8);
      expect(s.max(s.r.v['OUTL'].map(Math.abs))).toBeGreaterThan(1);
    }, 3_600_000);
  }

  // D32: the start-up also at the ambient range's corners (−10 °C; +60 °C with the power
  // semiconductors' junctions at 125 °C, the heatsinks rated at 60 °C) and with the electrolytic
  // capacitors at their end of life
  for (const [corner, o] of [
    ['', {}], [' at +60 °C ambient (power junctions 125 °C)', { temp: 60, tj: 125 }],
    [' at −10 °C', { temp: -10, tj: -10 }], [' with the electrolytic capacitors at their end of life', { aged: true }],
  ] as [string, InverterLfOptions][]) it(`start-up at the rated load (5 kW, 10.7 Ω), 52 V${corner}: 230 V 50 Hz, THD below 3 %, no DC on the primary, every part within its ratings`, async () => {
    const s = await run({ stop: '300m', precharged: true, ...o });
    // the soft start (47 ms) has reached 99 % by about 0.22 s
    const out = s.r.v['OUTL'], t1 = 0.26;
    // fundamental and harmonics over the last two periods
    const k0 = s.x.findIndex((t) => t >= t1), xs = s.x.slice(k0), ys = out.slice(k0), T = xs[xs.length - 1] - xs[0];
    const h = (n: number) => { let a = 0, b = 0; for (let k = 1; k < xs.length; k++) { const d = xs[k] - xs[k - 1], w = 2 * Math.PI * 50 * n * xs[k]; a += ys[k] * Math.cos(w) * d; b += ys[k] * Math.sin(w) * d; } return (Math.hypot(a, b) * 2) / T; };
    const h1 = h(1), thd = Math.sqrt([...Array(14)].reduce((m, _, i) => m + h(i + 2) ** 2, 0)) / h1;
    expect(h1 / Math.SQRT2).toBeGreaterThan(230 * 0.97);
    expect(h1 / Math.SQRT2).toBeLessThan(230 * 1.03);
    expect(thd).toBeLessThan(0.03);
    // frequency from the rising zero crossings (exact 50 Hz from the 555 divided by four)
    const zc: number[] = []; for (let k = k0 + 1; k < s.x.length; k++) if (out[k - 1] < 0 && out[k] >= 0) zc.push(s.x[k - 1] + (-out[k - 1] / (out[k] - out[k - 1])) * (s.x[k] - s.x[k - 1]));
    expect(zc.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs((zc.length - 1) / (zc[zc.length - 1] - zc[0]) - 50)).toBeLessThan(1);
    // I-5: no DC in the transformer: the primary's mean current over the last period below 2 A
    // (1 % of the rated 182 A) and not ramping from one period to the next. (The bridge nodes
    // are stored every 5 µs, too coarse for their mean at 20 kHz; the current is smooth.)
    const ip = s.cur('TR1', '1'), m1 = s.mean(ip, 0.28), m0 = s.mean(ip, t1) * 2 - m1; // 280–300 ms and 260–280 ms
    expect(Math.abs(m1)).toBeLessThan(2);
    // settling from the start-up varies by about 1 A per period; a DC runaway (the servo fault
    // found earlier) grew by 20–25 A per period
    expect(Math.abs(m1 - m0)).toBeLessThan(2);
    // no overshoot during the soft start
    expect(s.max(out.map(Math.abs))).toBeLessThan(230 * Math.SQRT2 * 1.08);
    // I-3, I-6, I-7: stress of every part (MOSFET currents, voltages, power) within its ratings
    const over = smoke(s.sheet, connectivity(s.sheet), s.r).rows.filter((x) => x.status === 'over');
    expect(over.map((x) => `${x.ref} ${x.what}`)).toEqual([]);
  }, 14_400_000);

  it('I-7 at the highest battery voltage (58.4 V, fully charged), 5 kW: every part within its ratings (MOSFET voltage at turn-off)', async () => {
    const s = await run({ stop: '300m', precharged: true, vbat: 58.4 });
    const over = smoke(s.sheet, connectivity(s.sheet), s.r).rows.filter((x) => x.status === 'over');
    expect(over.map((x) => `${x.ref} ${x.what}`)).toEqual([]);
    expect(s.max(s.r.v['BUS'])).toBeLessThan(80);
  }, 14_400_000);

  it('I-4 motor start at half load: a locked rotor (about 85 A) for 50 ms: the current limit holds, nothing trips, the output recovers (peak below 130 %); no product part over its ratings', async () => {
    const s = await run({ stop: '420m', precharged: true, load: '21.6', motorStart: { at: 0.26, for: 0.05 } });
    const ish = s.cur('RSH', '1').map(Math.abs), out = s.r.v['OUTL'];
    expect(s.max(ish, 0.26)).toBeLessThan(650);
    expect(s.max(s.r.v['FLT'], 0.02)).toBeLessThan(1); // after the power-on instant
    // the battery sags under the limited current and EN dips to about 6.6 V: still enabled
    expect(s.min(s.r.v['EN'], 0.25)).toBeGreaterThan(5);
    // after the motor: back near 230 V, and no overvoltage on the way (the protection trips at 262 V)
    // the contact opens at the current zero near 318 ms; 60–100 ms later the output is within
    // −10 … +5 % (IEC 62040-3 allows about 100 ms to recover; 22–42 ms after it, on the way,
    // it read 239 … 243 V r.m.s.)
    expect(s.rms(out, 0.38)).toBeGreaterThan(230 * 0.9);
    expect(s.rms(out, 0.38)).toBeLessThan(230 * 1.05);
    // the transformer (D32): the locked rotor broken at once drives its core into saturation
    // for a few milliseconds (a magnetising current of a few hundred amperes, 333 A even with a
    // 1.2 T core), which the cycle-by-cycle limit holds within the bridge's rating (above); 40 ms
    // after the motor its magnetising current (primary minus the reflected secondary) is back
    // below 1.5 × the saturation current. Before the output voltage limit it was still
    // saturated (580 A) when the overvoltage protection latched the bridge off
    const tr = s.sheet.parts.find((p) => p.ref === s.ref('TR1'))!, n = Number(tr.props.value), isat = Number(tr.props.isat);
    const ip = s.cur('TR1', '1'), is = s.cur('TR1', '3');
    expect(s.max(ip.map((v, k) => Math.abs(v + n * is[k])), 0.36)).toBeLessThan(1.5 * isat);
    // one half cycle after the disconnect reaches about 387 V (119 % of the 325 V peak): the
    // locked-rotor current is broken at once, harsher than a real start, where the current
    // falls as the motor speeds up; the bound is 130 % (ITIC: 140 % up to 3 ms, 120 % longer)
    expect(s.max(out.map(Math.abs), 0.31)).toBeLessThan(230 * Math.SQRT2 * 1.3);
    const test = new Set(s.sheet.parts.filter((p) => p.props.scope === 'test').map((p) => p.ref));
    const over = smoke(s.sheet, connectivity(s.sheet), s.r).rows.filter((x) => x.status === 'over' && !test.has(x.ref));
    expect(over.map((x) => `${x.ref} ${x.what}`)).toEqual([]);
  }, 14_400_000);

  it('I-10 the voltage loop has lost its sense (winding open): the output rises, the independent protection trips below 270 V and holds the bridge off', async () => {
    // the protection's 21 ms filter (it rides through one disconnect peak): it trips about 60 ms
    // after the output starts rising
    const s = await run({ stop: '260m', precharged: true, senseOpen: true });
    const out = s.r.v['OUTL'];
    expect(s.max(out.map(Math.abs))).toBeLessThan(270 * Math.SQRT2 * 1.1);
    expect(s.last('FLT')).toBeGreaterThan(5);
    expect(s.last('EN')).toBeLessThan(1);
    expect(s.max(out.slice(-200).map(Math.abs))).toBeLessThan(5);
  }, 14_400_000);

  it('I-4 short circuit at the output from the start: the cycle-by-cycle limit (522 A, twice the rated peak) holds the bridge current below 650 A; the overload timer then latches the bridge off; no part over its ratings', async () => {
    // the overload timer at 10 nF (product: 22 µF, about 0.9 s at the limit) trips within milliseconds
    const s = await run({ stop: '40m', precharged: true, load: '0.02', overloadC: '10n' });
    const ish = s.cur('RSH', '1').map(Math.abs);
    expect(s.max(ish)).toBeLessThan(650);
    expect(s.last('FLT')).toBeGreaterThan(5);
    expect(s.last('EN')).toBeLessThan(1);
    expect(s.max(ish.slice(-200))).toBeLessThan(1);
    const over = smoke(s.sheet, connectivity(s.sheet), s.r).rows.filter((x) => x.status === 'over');
    expect(over.map((x) => `${x.ref} ${x.what}`)).toEqual([]);
  }, 14_400_000);
});
