// P7c, the high-frequency inverter's 24 V (3 kW) and 12 V (1.5 kW) units (decision D33): the
// drawing, and the DFMEA failure modes of section 6 by simulation as for the 48 V unit
// (inverterhf.test.ts), at D32's corners. The long runs (LONG=1, with CKPT=<directory> to resume
// after a restarted container) take hours each.
import { describe, expect, it } from 'vitest';
import { inverterHF, LF_VARIANTS, HF_VARIANTS, type InverterHfOptions } from '../src/eda/inverters';
import { simulate, type SimResult } from '../src/sim/run';
import { erc } from '../src/eda/erc';
import { smoke } from '../src/eda/smoke';
import { buildBom } from '../src/eda/bom';
import { connectivity } from '../src/eda/connectivity';
import { parseValue } from '../src/eda/units';
import { textCollisions } from './drawing.helpers';
import { useCheckpoint } from './checkpoint';

const LONG = !!process.env.LONG;

async function runHF(o: InverterHfOptions) {
  const { sheet, nb } = inverterHF(o);
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
type Run = Awaited<ReturnType<typeof runHF>>;
const overRated = (s: Run) => {
  const test = new Set(s.sheet.parts.filter((p) => p.props.scope === 'test').map((p) => p.ref));
  return smoke(s.sheet, connectivity(s.sheet), s.r).rows.filter((x) => x.status === 'over' && !test.has(x.ref)).map((x) => `${x.ref} ${x.what}`);
};
/** The output at the rated load from t1 on: 230 V ± 3 %, THD below 3 %, 50 Hz, mean below 1 V (H-12). */
function checkOutput(s: Run, t1: number) {
  const out = s.r.v['OUTL'];
  const k0 = s.x.findIndex((t) => t >= t1), xs = s.x.slice(k0), ys = out.slice(k0), T = xs[xs.length - 1] - xs[0];
  const h = (n: number) => { let a = 0, b = 0; for (let k = 1; k < xs.length; k++) { const d = xs[k] - xs[k - 1], w = 2 * Math.PI * 50 * n * xs[k]; a += ys[k] * Math.cos(w) * d; b += ys[k] * Math.sin(w) * d; } return (Math.hypot(a, b) * 2) / T; };
  const h1 = h(1), thd = Math.sqrt([...Array(14)].reduce((m, _, i) => m + h(i + 2) ** 2, 0)) / h1;
  expect(h1 / Math.SQRT2).toBeGreaterThan(230 * 0.97);
  expect(h1 / Math.SQRT2).toBeLessThan(230 * 1.03);
  expect(thd).toBeLessThan(0.03);
  const zc: number[] = []; for (let k = k0 + 1; k < s.x.length; k++) if (out[k - 1] < 0 && out[k] >= 0) zc.push(s.x[k - 1] + (-out[k - 1] / (out[k] - out[k - 1])) * (s.x[k] - s.x[k - 1]));
  expect(zc.length).toBeGreaterThanOrEqual(2);
  expect(Math.abs((zc.length - 1) / (zc[zc.length - 1] - zc[0]) - 50)).toBeLessThan(1);
  expect(Math.abs(s.mean(out, t1))).toBeLessThan(1);
  expect(s.max(out.map(Math.abs))).toBeLessThan(230 * Math.SQRT2 * 1.08);
}

for (const cells of [8, 4] as const) {
  const vr = LF_VARIANTS[cells], hv = HF_VARIANTS[cells], unit = `${cells * 3} V ${vr.kw} kW unit`;
  // the sine bridge's window and its bound scale with the shunt (48 V: ±69 A, bound 90 A)
  const window = 0.104 / parseValue(hv.rshi)!, ishMax = window * 90 / 69, rload = Number(vr.rload) / 3;

  describe(`high-frequency inverter, ${unit}: the drawing`, () => {
    const { sheet, nb } = inverterHF({ cells });
    it('ERC clean, every connection drawn as a wire or label, text readable', () => {
      expect(erc(sheet).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
      expect(nb.unrouted).toEqual([]);
      expect(textCollisions(sheet)).toEqual([]);
    }, 60_000);
    it('the two sides meet only in transformers, optocouplers, the two Y2 capacitors and leg B of the sine bridge', () => {
      const c = connectivity(sheet);
      const y2 = (p: { sym: string; props: Record<string, string> }) => p.sym === 'capacitor' && p.props.vmax === '1600';
      const legB = new Set([nb.refOf(sheet, 'UDIB')]);
      const both = sheet.parts.filter((p) => p.props.scope !== 'test' && !['transformer', 'opto'].includes(p.sym) && !y2(p) && !legB.has(p.ref)).filter((p) => {
        const nets = [...c.pinNet.entries()].filter(([k]) => k.startsWith(`${p.ref}.`)).map(([, v]) => v);
        return nets.includes('GND') && nets.includes('HVG');
      });
      expect(both.map((p) => p.ref)).toEqual([]);
    }, 60_000);
    it('no wasted units (D31): the same packages as the 48 V unit, no spare comparator', () => {
      const bom = buildBom(sheet);
      const qty = (v: string) => bom.filter((l) => l.value === v || l.raw === v).reduce((a, l) => a + l.qty, 0);
      expect([qty('LM339'), qty('LM393'), qty('TL074'), qty('LM358')]).toEqual([2, 4, 2, 1]);
      const c = connectivity(sheet);
      const spare = (g: string) => sheet.parts.filter((p) => p.sym === 'comparator' && c.pinNet.get(`${p.ref}.1`) === g && c.pinNet.get(`${p.ref}.3`) === g);
      expect([spare('GND').length, spare('HVG').length]).toEqual([0, 0]);
    }, 60_000);
  });

  describe(`high-frequency inverter, ${unit}: DFMEA failure modes`, () => {
    it('H-2 battery connected the wrong way round: nothing conducts, the contactor stays open', async () => {
      const s = await runHF({ cells, reversed: true, stop: '10m' });
      expect(Math.abs(s.max(s.cur('BAT', '1').map(Math.abs)))).toBeLessThan(0.05);
      expect(s.max(s.r.v['BUS'].map(Math.abs))).toBeLessThan(1);
      expect(s.max(s.r.v['AXA'])).toBeLessThan(1);
    }, 600_000);
  });

  describe.runIf(LONG)(`high-frequency inverter, ${unit}: DFMEA failure modes (long runs)`, () => {
    it(`H-1 connecting the battery: pre-charge through ${vr.rpc} Ω, the contactor closes above 91 %, the converter charges the bus to 381 V without overvoltage, the sine bridge waits for 355 V`, async () => {
      const s = await runHF({ cells, stop: '180m' });
      const ibat = s.cur('BAT', '1').map(Math.abs), kClose = s.x.findIndex((t, k) => t > 1e-3 && s.r.v['BKA'][k] < 0.3);
      expect(kClose).toBeGreaterThan(0);
      expect(s.max(s.cur('RPC', '1').map(Math.abs).slice(0, kClose))).toBeLessThan(vr.vbat / Number(vr.rpc) * 1.1);
      expect(s.max(ibat.slice(0, kClose))).toBeLessThan((vr.vbat / Number(vr.rpc) + vr.vbat / Number(vr.raux)) * 1.1);
      expect(s.r.v['BUS'][kClose]).toBeGreaterThan(0.88 * vr.vbat);
      const bus = s.r.v['HBUS'].map((v, k) => v - s.r.v['HVG'][k]);
      expect(s.max(bus)).toBeLessThan(427);
      expect(bus[bus.length - 1]).toBeGreaterThan(355);
      const kEn = s.x.findIndex((_, k) => s.r.v['EN'][k] - s.r.v['HVG'][k] > 8);
      if (kEn >= 0) expect(bus[kEn]).toBeGreaterThan(350);
    }, 86_400_000);

    for (const [what, o] of [
      ['H-16 battery below the low cut-out', { vbat: vr.cut[0] - 0.25 * cells / 4 }],
      ['H-16 battery between the cut-out and the restart level', { vbat: (vr.cut[0] + vr.cut[1]) / 2 }],
      ['H-16 battery above the high cut-out', { vbat: vr.cut[2] + 0.25 * cells / 4 }],
      ['H-16 heatsink at 95 °C (stop above 90 °C)', { theatsink: 95 }],
    ] as [string, InverterHfOptions][]) {
      it(`${what}: the converter never starts, the bus stays empty`, async () => {
        const s = await runHF({ cells, ...o, stop: '24m' });
        expect(s.max(s.r.v['ENL'])).toBeLessThan(1);
        expect(s.max(s.r.v['HBUS'].map((v, k) => v - s.r.v['HVG'][k]))).toBeLessThan(5);
      }, 86_400_000);
    }

    for (const [corner, o] of [
      ['', {}], [' at +60 °C ambient (power junctions 125 °C)', { temp: 60, tj: 125 }],
      [' at −10 °C', { temp: -10, tj: -10 }], [' with the electrolytic capacitors at their end of life', { aged: true }],
    ] as [string, InverterHfOptions][]) it(`start-up at the rated load${corner}: 230 V 50 Hz, THD below 3 %, no DC at the output, the bus within 381 V ± 6 %, every part within its ratings`, async () => {
      const s = await runHF({ cells, stop: '320m', precharged: true, ...o });
      const t1 = 0.28;
      checkOutput(s, t1);
      const bus = s.r.v['HBUS'].map((v, k) => v - s.r.v['HVG'][k]);
      expect(s.min(bus, t1)).toBeGreaterThan(381 * 0.94);
      expect(s.max(bus, t1)).toBeLessThan(381 * 1.06);
      expect(overRated(s)).toEqual([]);
    }, 86_400_000);

    it('H-8 at the highest battery voltage (3.65 V a cell), the rated load: every part within its ratings', async () => {
      const s = await runHF({ cells, stop: '320m', precharged: true, vbat: 3.65 * cells });
      expect(overRated(s)).toEqual([]);
    }, 86_400_000);

    it('H-7 motor start at half load: a locked rotor (six times its rating) for 50 ms: the current window holds, nothing trips, the output recovers; no product part over its ratings', async () => {
      const s = await runHF({ cells, stop: '380m', precharged: true, load: String(2 * rload), motorStart: { at: 0.28, for: 0.05 } });
      const ish = s.cur('RSHI', '1').map(Math.abs), out = s.r.v['OUTL'];
      expect(s.max(ish, 0.28)).toBeLessThan(ishMax);
      expect(s.max(s.r.v['FLT'].map((v, k) => v - s.r.v['HVG'][k]), 0.02)).toBeLessThan(1);
      expect(s.rms(out, 0.36)).toBeGreaterThan(230 * 0.9);
      expect(s.rms(out, 0.36)).toBeLessThan(230 * 1.05);
      expect(s.max(out.map(Math.abs), 0.33)).toBeLessThan(230 * Math.SQRT2 * 1.3);
      expect(overRated(s)).toEqual([]);
    }, 86_400_000);

    it(`H-7 short circuit at the output from the start: the window (±${Math.round(window)} A) holds the bridge current below ${Math.round(ishMax)} A, the overload timer latches the bridge off; no part over its ratings`, async () => {
      const s = await runHF({ cells, stop: '60m', precharged: true, load: '0.02', overloadC: '10n' });
      expect(s.max(s.cur('RSHI', '1').map(Math.abs))).toBeLessThan(ishMax);
      expect(s.last('FLT') - s.last('HVG')).toBeGreaterThan(5);
      expect(s.last('EN') - s.last('HVG')).toBeLessThan(1);
      expect(overRated(s)).toEqual([]);
    }, 86_400_000);

    it('H-10 the voltage loop has lost its sense: the independent protection trips below 270 V and holds the bridge off', async () => {
      const s = await runHF({ cells, stop: '280m', precharged: true, senseOpen: true });
      const out = s.r.v['OUTL'];
      expect(s.max(out.map(Math.abs))).toBeLessThan(270 * Math.SQRT2 * 1.1);
      expect(s.last('FLT') - s.last('HVG')).toBeGreaterThan(5);
      expect(s.max(out.slice(-200).map(Math.abs))).toBeLessThan(5);
    }, 86_400_000);

    it('H-3 the bus feedback has failed (its optocoupler LED open): the independent stop holds the bus below 435 V (the converter alone, 1 kW on the bus)', async () => {
      const s = await runHF({ cells, stage: 'dcdc', stop: '80m', precharged: true, feedbackOpen: true, busLoad: '145' });
      const bus = s.r.v['HBUS'].map((v, k) => v - s.r.v['HVG'][k]);
      expect(s.max(bus)).toBeLessThan(435);
      expect(s.max(bus)).toBeGreaterThan(400);
      expect(overRated(s)).toEqual([]);
    }, 86_400_000);

    it('H-4 the 380 V bus shorted (0.5 Ω): the cycle-by-cycle limit holds the output inductor within its 40 A, the overload timer latches the converter off, nothing over its ratings', async () => {
      const s = await runHF({ cells, stage: 'dcdc', stop: '40m', precharged: true, busLoad: '0.5', dcOverloadC: '1n' });
      expect(s.max(s.cur('LOB', '1').map(Math.abs))).toBeLessThan(40);
      const kTrip = s.x.findIndex((t, k) => t > 1e-3 && s.r.v['ENL'][k] < 1);
      expect(kTrip).toBeGreaterThan(0);
      expect(s.max(s.r.v['ENL'], s.x[kTrip] + 1e-3)).toBeLessThan(1);
      expect(s.max(s.cur('TR1', '1').map(Math.abs), 0.035)).toBeLessThan(1);
      expect(overRated(s)).toEqual([]);
    }, 86_400_000);
  });
}
