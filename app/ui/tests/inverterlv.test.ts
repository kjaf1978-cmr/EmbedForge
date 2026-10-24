// P7c, the 50 Hz-transformer inverter's 24 V (3 kW) and 12 V (1.5 kW) units (decision D33): the
// drawing, and the DFMEA failure modes of section 5 by simulation as for the 48 V unit
// (inverter.test.ts), at D32's corners. The long runs (LONG=1, with CKPT=<directory> to resume
// after a restarted container) take one to two hours each.
import { describe, expect, it } from 'vitest';
import { inverterLF, LF_VARIANTS, type InverterLfOptions } from '../src/eda/inverters';
import { simulate, type SimResult } from '../src/sim/run';
import { erc } from '../src/eda/erc';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { textCollisions } from './drawing.helpers';
import { useCheckpoint } from './checkpoint';

const LONG = !!process.env.LONG;

async function run(o: InverterLfOptions) {
  const { sheet, nb } = inverterLF(o);
  await new Promise((r) => setTimeout(r, 500));
  const done = useCheckpoint();
  const r = simulate(sheet) as SimResult;
  done();
  expect('error' in r ? r.error : '').toBe('');
  const x = r.x, n = x.length;
  const ref = (key: string) => nb.refOf(sheet, key);
  const cur = (key: string, pin: string) => r.i[`${ref(key)}.${pin}`];
  const k0 = (t0: number) => Math.max(0, x.findIndex((t) => t >= t0));
  const mean = (y: number[], t0: number) => { let m = 0, T = 0; for (let k = k0(t0) + 1; k < n; k++) { const h = x[k] - x[k - 1]; m += y[k] * h; T += h; } return m / T; };
  const rms = (y: number[], t0: number) => { let m = 0, T = 0; for (let k = k0(t0) + 1; k < n; k++) { const h = x[k] - x[k - 1]; m += y[k] * y[k] * h; T += h; } return Math.sqrt(m / T); };
  const max = (y: number[], t0 = 0) => y.slice(k0(t0)).reduce((m, v) => Math.max(m, v), -Infinity);
  const min = (y: number[], t0 = 0) => y.slice(k0(t0)).reduce((m, v) => Math.min(m, v), Infinity);
  return { r, sheet, x, ref, cur, mean, rms, max, min, last: (net: string) => r.v[net][n - 1] };
}
const overRated = (s: Awaited<ReturnType<typeof run>>) => {
  const test = new Set(s.sheet.parts.filter((p) => p.props.scope === 'test').map((p) => p.ref));
  return smoke(s.sheet, connectivity(s.sheet), s.r).rows.filter((x) => x.status === 'over' && !test.has(x.ref)).map((x) => `${x.ref} ${x.what}`);
};

for (const cells of [8, 4] as const) {
  const vr = LF_VARIANTS[cells], unit = `${cells * 3} V ${vr.kw} kW unit`;
  // the bridge current's bound: the limit and the same 25 % overshoot as the 48 V unit (650 A over 519 A)
  const ilimMax = vr.ilim * 1.25, rload = Number(vr.rload) / 3;

  describe(`50 Hz-transformer inverter, ${unit}: the drawing`, () => {
    it('ERC clean, every connection drawn as a wire or label, text readable', () => {
      const { sheet, nb } = inverterLF({ cells });
      expect(erc(sheet).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
      expect(nb.unrouted).toEqual([]);
      expect(textCollisions(sheet)).toEqual([]);
    }, 60_000);
  });

  describe.runIf(LONG)(`50 Hz-transformer inverter, ${unit}: DFMEA failure modes (long runs)`, () => {
    for (const [corner, o] of [
      ['', {}], [' at +60 °C ambient (power junctions 125 °C)', { temp: 60, tj: 125 }],
      [' at −10 °C', { temp: -10, tj: -10 }], [' with the electrolytic capacitors at their end of life', { aged: true }],
    ] as [string, InverterLfOptions][]) it(`start-up at the rated load${corner}: 230 V 50 Hz, THD below 3 %, no DC on the primary, no overshoot, every part within its ratings`, async () => {
      const s = await run({ cells, stop: '300m', precharged: true, ...o });
      const out = s.r.v['OUTL'], t1 = 0.26;
      const k0 = s.x.findIndex((t) => t >= t1), xs = s.x.slice(k0), ys = out.slice(k0), T = xs[xs.length - 1] - xs[0];
      const h = (n: number) => { let a = 0, b = 0; for (let k = 1; k < xs.length; k++) { const d = xs[k] - xs[k - 1], w = 2 * Math.PI * 50 * n * xs[k]; a += ys[k] * Math.cos(w) * d; b += ys[k] * Math.sin(w) * d; } return (Math.hypot(a, b) * 2) / T; };
      const h1 = h(1), thd = Math.sqrt([...Array(14)].reduce((m, _, i) => m + h(i + 2) ** 2, 0)) / h1;
      expect(h1 / Math.SQRT2).toBeGreaterThan(230 * 0.97);
      expect(h1 / Math.SQRT2).toBeLessThan(230 * 1.03);
      expect(thd).toBeLessThan(0.03);
      // no DC in the transformer: the primary's mean below 1 % of the rated primary current and steady
      const ip = s.cur('TR1', '1'), m1 = s.mean(ip, 0.28), m0 = s.mean(ip, t1) * 2 - m1, irated = vr.kw * 1e3 / Number(vr.vprim);
      expect(Math.abs(m1)).toBeLessThan(0.01 * irated);
      expect(Math.abs(m1 - m0)).toBeLessThan(0.01 * irated);
      expect(s.max(out.map(Math.abs))).toBeLessThan(230 * Math.SQRT2 * 1.08);
      expect(overRated(s)).toEqual([]);
    }, 14_400_000);

    it('I-1 connecting the battery: the bus charges through 10 Ω, the contactor closes above 91 % of the battery, then the bridge is released', async () => {
      const s = await run({ cells, stop: '150m' });
      const ibat = s.cur('BAT', '1').map(Math.abs), kClose = s.x.findIndex((t, k) => t > 1e-3 && s.r.v['BKA'][k] < 0.3);
      expect(kClose).toBeGreaterThan(0);
      expect(s.max(ibat.slice(0, kClose))).toBeLessThan(vr.vbat / 10 * 1.1);
      expect(s.r.v['BUS'][kClose]).toBeGreaterThan(0.88 * vr.vbat);
      expect(s.last('EN')).toBeGreaterThan(8);
    }, 3_600_000);

    for (const [what, o, starts] of [
      ['I-8 below the low cut-out', { vbat: vr.cut[0] - 0.25 * cells / 4 }, false],
      ['I-9 above the high cut-out', { vbat: vr.cut[2] + 0.25 * cells / 4 }, false],
      ['I-11 heatsink at 95 °C', { theatsink: 95 }, false],
      ['a fully charged battery (3.65 V a cell)', { vbat: 3.65 * cells }, true],
    ] as [string, InverterLfOptions, boolean][]) it(`${what}: the bridge ${starts ? 'starts once the contactor has closed' : 'stays stopped'}`, async () => {
      const s = await run({ cells, ...o, precharged: true, stop: '24m' });
      if (starts) expect(s.last('EN')).toBeGreaterThan(8);
      else { expect(s.max(s.r.v['EN'])).toBeLessThan(1); expect(s.max(s.r.v['OUTL'].map(Math.abs))).toBeLessThan(1); }
    }, 3_600_000);

    it('I-7 at the highest battery voltage (3.65 V a cell), the rated load: every part within its ratings', async () => {
      const s = await run({ cells, stop: '300m', precharged: true, vbat: 3.65 * cells });
      expect(overRated(s)).toEqual([]);
    }, 14_400_000);

    it(`I-4 short circuit at the output from the start: the limit (±${vr.ilim} A) holds the bridge current below ${Math.round(ilimMax)} A; the overload timer latches the bridge off; no part over its ratings`, async () => {
      const s = await run({ cells, stop: '40m', precharged: true, load: '0.02', overloadC: '10n' });
      expect(s.max(s.cur('RSH', '1').map(Math.abs))).toBeLessThan(ilimMax);
      expect(s.last('FLT')).toBeGreaterThan(5);
      expect(s.last('EN')).toBeLessThan(1);
      expect(overRated(s)).toEqual([]);
    }, 3_600_000);

    it('I-4 motor start at half load: a locked rotor (six times its rating) for 50 ms: the limit holds, nothing trips, the output recovers; no product part over its ratings', async () => {
      const s = await run({ cells, stop: '420m', precharged: true, load: String(2 * rload), motorStart: { at: 0.26, for: 0.05 } });
      const out = s.r.v['OUTL'];
      expect(s.max(s.cur('RSH', '1').map(Math.abs), 0.26)).toBeLessThan(ilimMax);
      expect(s.max(s.r.v['FLT'], 0.02)).toBeLessThan(1);
      expect(s.rms(out, 0.38)).toBeGreaterThan(230 * 0.9);
      expect(s.rms(out, 0.38)).toBeLessThan(230 * 1.05);
      expect(s.max(out.map(Math.abs), 0.31)).toBeLessThan(230 * Math.SQRT2 * 1.3);
      expect(overRated(s)).toEqual([]);
    }, 14_400_000);

    it('I-10 the voltage loop has lost its sense: the independent protection trips below 270 V and holds the bridge off', async () => {
      const s = await run({ cells, stop: '260m', precharged: true, senseOpen: true });
      const out = s.r.v['OUTL'];
      expect(s.max(out.map(Math.abs))).toBeLessThan(270 * Math.SQRT2 * 1.1);
      expect(s.last('FLT')).toBeGreaterThan(5);
      expect(s.max(out.slice(-200).map(Math.abs))).toBeLessThan(5);
    }, 14_400_000);
  });
}
