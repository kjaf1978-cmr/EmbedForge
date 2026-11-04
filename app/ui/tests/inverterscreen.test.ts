// Screening of the high-frequency inverter's three units (decision D38): every design change is
// run here first, the full circuit for 140 ms with a 4.7 ms soft start (47 nF instead of the
// product's 470 nF), and the output, the bus and the parts' ratings are checked over the last
// two periods as the start-up test does over its own (from 0.28 s of 0.32 s). A pass is
// necessary, not sufficient: the long runs (inverterhf/inverterhfv, LONG=1) remain the
// verification, and they start only once all three units pass here. SCREEN=1 (with CKPT=<dir>
// to resume after a restarted container); about 8 h a run. Each unit runs at its nominal battery
// and with the battery falling to just above its cut-out (started above its restart level), and
// the high-voltage side's 15 V must stay regulated (D39: the 12 V unit's had lost its headroom).
import { describe, expect, it } from 'vitest';
import { inverterHF, LF_VARIANTS } from '../src/eda/inverters';
import { simulate, type SimResult } from '../src/sim/run';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import { useCheckpoint } from './checkpoint';

const units = [[16, '48 V 5 kW'], [8, '24 V 3 kW'], [4, '12 V 1.5 kW']] as const;

describe.runIf(!!process.env.SCREEN)('high-frequency inverter: screening (D38)', () => {
  // the low case: the unit starts just above its restart level and the battery falls (from 30 ms,
  // over 10 ms) until its terminals sit 0.15 V a 4 cells above the cut-out at the rated load (the
  // source plus the drop in the battery's 0.01 Ω a 16 cells), where a running unit still works
  const low = (cells: 16 | 8 | 4) => { const vr = LF_VARIANTS[cells], v = vr.cut[0] + 0.15 * cells / 4; return { vbat: vr.cut[1] + 0.25 * cells / 4, vbatTo: Number((v + (vr.kw * 1000 / 0.9 / v) * 0.01 * cells / 16).toFixed(2)) }; };
  for (const [cells, unit] of units) for (const lo of [false, true]) it(`${unit} unit${lo ? `, battery falling to ${low(cells).vbatTo} V (${(LF_VARIANTS[cells].cut[0] + 0.15 * cells / 4).toFixed(2)} V at its terminals)` : ''}: 230 V 50 Hz, THD below 3 %, the bus within 381 V ± 6 %, the 15 V regulated, every part within its ratings`, () => {
    const { sheet } = inverterHF({ cells, stop: '140m', precharged: true, softC: '47n', ...(lo ? low(cells) : {}) });
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
    const v15 = r.v['V15H'].slice(k0).map((v, k) => v - r.v['HVG'][k0 + k]), vxh = r.v['VXH'].slice(k0).map((v, k) => v - r.v['HVG'][k0 + k]);
    const test = new Set(sheet.parts.filter((p) => p.props.scope === 'test').map((p) => p.ref));
    const rows = smoke(sheet, connectivity(sheet), r).rows.filter((s) => !test.has(s.ref));
    console.log(`${unit}${lo ? ' low' : ''}: output ${(h1 / Math.SQRT2).toFixed(1)} V, THD ${(thd * 100).toFixed(2)} %, mean ${mean.toFixed(2)} V, zero crossings ${zc.map((t) => (t * 1000).toFixed(2)).join(' ')} ms, bus ${Math.min(...bus).toFixed(1)} … ${Math.max(...bus).toFixed(1)} V, 15 V ${Math.min(...v15).toFixed(2)} … ${Math.max(...v15).toFixed(2)} V from ${Math.min(...vxh).toFixed(1)} … ${Math.max(...vxh).toFixed(1)} V`);
    console.log(`${unit}${lo ? ' low' : ''}: ${hs.map((v, i) => `H${i + 2} ${(v * 100).toFixed(2)}`).join(' ')}`);
    console.log(`${unit}${lo ? ' low' : ''}: most stressed: ${rows.slice(0, 6).map((s) => `${s.ref} ${s.quantity} ${s.pct.toFixed(0)} %`).join(', ')}`);
    expect(h1 / Math.SQRT2).toBeGreaterThan(230 * 0.97);
    expect(h1 / Math.SQRT2).toBeLessThan(230 * 1.03);
    expect(thd).toBeLessThan(0.03);
    expect(zc.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs((zc.length - 1) / (zc[zc.length - 1] - zc[0]) - 50)).toBeLessThan(1);
    // the output's DC is logged, not checked: the DC servo (about 40 ms) is still settling at
    // 0.1 s (the mean of a period swung from −20 V to +7 V over 60 … 120 ms in the 12 V unit);
    // the long runs check it below 1 V from 0.28 s
    expect(Math.max(...ys.map(Math.abs))).toBeLessThan(230 * Math.SQRT2 * 1.08);
    expect(Math.min(...bus)).toBeGreaterThan(381 * 0.94);
    expect(Math.max(...bus)).toBeLessThan(381 * 1.06);
    expect(Math.min(...v15)).toBeGreaterThan(14.5);
    expect(rows.filter((s) => s.status === 'over').map((s) => `${s.ref} ${s.what}`)).toEqual([]);
  }, 86_400_000);
});
