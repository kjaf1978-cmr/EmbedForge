// P7b, the high-frequency inverter (48 V, 5 kW): structure, and its DFMEA failure modes
// (DFMEA.md section 6) by simulation. The runs with the converters switching take 10 to 90
// minutes each, so they run with LONG=1 (npm run test:long); their results are in TEST_REPORT.md.
import { describe, expect, it } from 'vitest';
import { inverterHF, type InverterHfOptions } from '../src/eda/inverters';
import { simulate, type SimResult } from '../src/sim/run';
import { erc } from '../src/eda/erc';
import { buildBom } from '../src/eda/bom';
import { connectivity } from '../src/eda/connectivity';
import { textCollisions } from './drawing.helpers';

async function runHF(o: InverterHfOptions) {
  const { sheet, nb } = inverterHF(o);
  await new Promise((r) => setTimeout(r, 500)); // let the reporter's pending update be answered before the worker blocks
  const r = simulate(sheet) as SimResult;
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

describe('high-frequency inverter: the drawing', () => {
  const { sheet, nb } = inverterHF();
  it('ERC clean, every connection drawn as a wire or label, text readable', () => {
    expect(erc(sheet).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
    expect(nb.unrouted).toEqual([]);
    expect(textCollisions(sheet)).toEqual([]);
  });
  it('the two sides meet only in transformers, optocouplers and the two Y2 capacitors: no other part has pins on both grounds', () => {
    const c = connectivity(sheet);
    const y2 = (p: { sym: string; props: Record<string, string> }) => p.sym === 'capacitor' && p.props.vmax === '1600';
    const both = sheet.parts.filter((p) => p.props.scope !== 'test' && !['transformer', 'opto'].includes(p.sym) && !y2(p)).filter((p) => {
      const nets = [...c.pinNet.entries()].filter(([k]) => k.startsWith(`${p.ref}.`)).map(([, v]) => v);
      return nets.includes('GND') && nets.includes('HVG');
    });
    expect(both.map((p) => p.ref)).toEqual([]);
  });
  it('no wasted units (D31): every package full but two LM393 (five comparators on the low-voltage side, seven on the high-voltage side) and one CD4013 (three flip-flops)', () => {
    const bom = buildBom(sheet);
    const qty = (v: string, sym?: string) => bom.filter((l) => (l.value === v || l.raw === v) && (!sym || l.sym === sym)).reduce((a, l) => a + l.qty, 0);
    expect(qty('LM339')).toBe(2);
    expect(qty('LM393')).toBe(4);
    expect(qty('TL074')).toBe(2);
    expect(qty('LM358')).toBe(1);
    expect(bom.filter((l) => l.sym === 'nor2').reduce((a, l) => a + l.qty, 0)).toBe(2);
    expect(bom.filter((l) => l.sym === 'dff').reduce((a, l) => a + l.qty, 0)).toBe(2);
    const c = connectivity(sheet);
    const spares = sheet.parts.filter((p) => p.sym === 'comparator' && c.pinNet.get(`${p.ref}.1`) === 'GND');
    expect(spares.length).toBe(1); // the high-voltage side's spare has its output on HVG
  });
});

describe('high-frequency inverter: DFMEA failure modes', () => {
  it('H-2 battery connected the wrong way round: nothing conducts, the contactor stays open', async () => {
    const s = await runHF({ reversed: true, stop: '10m' });
    expect(Math.abs(s.max(s.cur('BAT', '1').map(Math.abs)))).toBeLessThan(0.05);
    expect(s.min(s.r.v['BUS'])).toBeGreaterThan(-1);
    expect(s.max(s.r.v['BUS'])).toBeLessThan(1);
    expect(s.max(s.r.v['AXA'])).toBeLessThan(1);
  }, 600_000);
});

