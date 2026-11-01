// Screening of the high-frequency inverter's three units (decision D38): every design change is
// run here first, the full circuit for 140 ms with a 4.7 ms soft start (47 nF instead of the
// product's 470 nF), and the output, the bus and the parts' ratings are checked over the last
// two periods as the start-up test does over its own (from 0.28 s of 0.32 s). A pass is
// necessary, not sufficient: the long runs (inverterhf/inverterhfv, LONG=1) remain the
// verification, and they start only once all three units pass here. SCREEN=1 (with CKPT=<dir>
// to resume after a restarted container); about 2–3 h a unit.
import { describe, expect, it } from 'vitest';
import { inverterHF } from '../src/eda/inverters';
import { simulate, type SimResult } from '../src/sim/run';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { useCheckpoint } from './checkpoint';

const units = [[16, '48 V 5 kW'], [8, '24 V 3 kW'], [4, '12 V 1.5 kW']] as const;

describe.runIf(!!process.env.SCREEN)('high-frequency inverter: screening (D38)', () => {
  for (const [cells, unit] of units) it(`${unit} unit: 230 V 50 Hz, THD below 3 %, no DC, the bus within 381 V ± 6 %, every part within its ratings`, () => {
    const { sheet } = inverterHF({ cells, stop: '140m', precharged: true, softC: '47n' });
    const done = useCheckpoint();
    const r = simulate(sheet) as SimResult;
    done();
    expect('error' in r ? r.error : '').toBe('');
    const x = r.x, out = r.v['OUTL'], t1 = 0.1;
    const k0 = x.findIndex((t) => t >= t1), xs = x.slice(k0), ys = out.slice(k0), T = xs[xs.length - 1] - xs[0];
    const h = (n: number) => { let a = 0, b = 0; for (let k = 1; k < xs.length; k++) { const d = xs[k] - xs[k - 1], w = 2 * Math.PI * 50 * n * xs[k]; a += ys[k] * Math.cos(w) * d; b += ys[k] * Math.sin(w) * d; } return (Math.hypot(a, b) * 2) / T; };
    const h1 = h(1), hs = [...Array(14)].map((_, i) => h(i + 2) / h1), thd = Math.sqrt(hs.reduce((m, v) => m + v * v, 0));
    let mean = 0; for (let k = 1; k < xs.length; k++) mean += ys[k] * (xs[k] - xs[k - 1]); mean /= T;
    const zc: number[] = []; for (let k = 1; k < xs.length; k++) if (ys[k - 1] < 0 && ys[k] >= 0) zc.push(xs[k - 1] + (-ys[k - 1] / (ys[k] - ys[k - 1])) * (xs[k] - xs[k - 1]));
    const bus = r.v['HBUS'].slice(k0).map((v, k) => v - r.v['HVG'][k0 + k]);
    const test = new Set(sheet.parts.filter((p) => p.props.scope === 'test').map((p) => p.ref));
    const rows = smoke(sheet, connectivity(sheet), r).rows.filter((s) => !test.has(s.ref));
    console.log(`${unit}: output ${(h1 / Math.SQRT2).toFixed(1)} V, THD ${(thd * 100).toFixed(2)} %, mean ${mean.toFixed(2)} V, zero crossings ${zc.map((t) => (t * 1000).toFixed(2)).join(' ')} ms, bus ${Math.min(...bus).toFixed(1)} … ${Math.max(...bus).toFixed(1)} V`);
    console.log(`${unit}: ${hs.map((v, i) => `H${i + 2} ${(v * 100).toFixed(2)}`).join(' ')}`);
    console.log(`${unit}: most stressed: ${rows.slice(0, 6).map((s) => `${s.ref} ${s.quantity} ${s.pct.toFixed(0)} %`).join(', ')}`);
    expect(h1 / Math.SQRT2).toBeGreaterThan(230 * 0.97);
    expect(h1 / Math.SQRT2).toBeLessThan(230 * 1.03);
    expect(thd).toBeLessThan(0.03);
    expect(zc.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs((zc.length - 1) / (zc[zc.length - 1] - zc[0]) - 50)).toBeLessThan(1);
    expect(Math.abs(mean)).toBeLessThan(1);
    expect(Math.max(...ys.map(Math.abs))).toBeLessThan(230 * Math.SQRT2 * 1.08);
    expect(Math.min(...bus)).toBeGreaterThan(381 * 0.94);
    expect(Math.max(...bus)).toBeLessThan(381 * 1.06);
    expect(rows.filter((s) => s.status === 'over').map((s) => `${s.ref} ${s.what}`)).toEqual([]);
  }, 86_400_000);
});
