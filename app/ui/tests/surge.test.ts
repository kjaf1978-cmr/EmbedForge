// P5: surge protection of a mains house and of a PV house's DC side (src/eda/surge.ts): the
// let-through voltage at the appliance and the SPDs within their ratings, for the surges of the
// standards (10/350 µs lightning current, 8/20 µs induced current, 1.2/50 µs combination wave).
import { describe, expect, it } from 'vitest';
import { mainsHouse, pvHouse, type MainsSurge } from '../src/eda/surge';
import { simulate, type SimResult } from '../src/sim/run';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import type { Sheet } from '../src/eda/schematic';
import { buildBom } from '../src/eda/bom';
import { costedBom } from '../src/eda/catalogue';
import { pinPositions } from '../src/eda/schematic';
import { textCollisions } from './drawing.helpers';

const PV_PARTS = ['mov', 'gdt', 'tvs', 'nmos', 'capacitor', 'inductor'];
function run(sheet: Sheet, syms = ['mov', 'gdt', 'tvs']) {
  const r = simulate(sheet) as SimResult;
  expect('error' in r ? (r as unknown as { error: string }).error : '').toBe('');
  const pk = (a: string, b: string) => r.v[a].reduce((m, v, k) => Math.max(m, Math.abs(v - r.v[b][k])), 0);
  // the protective devices against their surge ratings (peak current, energy, peak power); the
  // conductors and the test load are no parts, and a run of a millisecond has no mean power
  const sym = new Map(sheet.parts.map((p) => [p.ref, p.sym]));
  const over = smoke(sheet, connectivity(sheet), r).rows.filter((x) => x.status === 'over' && syms.includes(sym.get(x.ref) ?? '') && !/^(LC|RC)/.test(x.ref) && !/^power$|mean/.test(x.what)).map((x) => `${x.ref} ${x.what}`);
  return { r, pk, over };
}

describe('mains house (TN-C-S): DEHN type 1+2, type 2 and type 3 SPDs coordinated by the cables', () => {
  // the impulse withstand categories of IEC 60364-4-44 (230/400 V): I 1.5 kV (sensitive equipment,
  // behind the type 3), II 2.5 kV (appliances), III 4 kV (fixed installation: the sub-board), IV
  // 6 kV (origin: the main board); the busbars include the SPDs' lead voltage (Up + ΔU)
  const check = (o: { sheet: Sheet }) => {
    const s0 = run(o.sheet);
    const sym = new Map(o.sheet.parts.map((p) => [p.ref, p.sym]));
    // no SPD carries more than the largest surge injected (25 kA): the arc model creates no energy
    const ipk = Math.max(...Object.entries(s0.r.i).filter(([k]) => ['mov', 'gdt'].includes(sym.get(k.split('.')[0]) ?? '')).map(([, v]) => Math.max(...v.map(Math.abs))));
    return { ...s0, ipk };
  };
  const SURGES: [MainsSurge, string][] = [['lightning', 'a strike on the line, 25 kA 10/350 µs shared by L and PEN'], ['lightning-L', '22.5 kA 10/350 µs into L: the DEHNshield at its Iimp (12.5 kA)'], ['induced', '20 kA 8/20 µs into L'], ['socket', '6 kV / 3 kA 1.2/50 µs at the socket, L to N']];
  for (const [sg, what] of SURGES)
    it(`${what}: the sensitive equipment below 1.5 kV L–N, L–PE, N–PE; the sub-board below 4 kV, the main board below 6 kV; every SPD within its ratings`, () => {
      const s0 = check(mainsHouse(sg));
      for (const [a, b] of [['L3', 'N3'], ['L3', 'PE3'], ['N3', 'PE3']]) expect(s0.pk(a, b)).toBeLessThan(1500);
      for (const [a, b] of [['L2', 'PE2'], ['N2', 'PE2']]) expect(s0.pk(a, b)).toBeLessThan(4000);
      expect(s0.pk('L1', 'PE1')).toBeLessThan(6000);
      expect(s0.over).toEqual([]);
      expect(s0.ipk).toBeLessThan(25_000);
      if (sg === 'lightning-L') expect(s0.ipk).toBeGreaterThan(12_000);
    }, 600_000);
  // the model's assumptions varied: the cables' capacitance, the appliance's Y capacitors, the leads
  for (const [name, o] of [['cable capacitance halved', { cf: 0.5 }], ['cable capacitance × 1.5', { cf: 1.5 }], ['an appliance without Y capacitors', { ycap: false }], ['leads 0.3 m', { lead: 0.3 }]] as const)
    it(`${name}: the sensitive equipment still below 1.5 kV for every surge`, () => {
      for (const [sg] of SURGES) {
        const s0 = run(mainsHouse(sg, o).sheet);
        for (const [a, b] of [['L3', 'N3'], ['L3', 'PE3'], ['N3', 'PE3']]) expect(s0.pk(a, b), `${sg} ${a}–${b}`).toBeLessThan(1500);
      }
    }, 600_000);
  it('leads of 1 m instead of 0.5 m: the main board over 6 kV at the DEHNshield\'s Iimp (why the 0.5 m rule)', () => {
    expect(run(mainsHouse('lightning-L', { lead: 1 }).sheet).pk('L1', 'PE1')).toBeGreaterThan(6000);
  }, 600_000);
  it('a strike on the building (25 kA 10/350 µs into the earthing; needs an external LPS, not part of P5): the sensitive equipment below 2.5 kV only (category II), every SPD within its ratings', () => {
    const s0 = check(mainsHouse('lps'));
    for (const [a, b] of [['L3', 'N3'], ['L3', 'PE3'], ['N3', 'PE3']]) expect(s0.pk(a, b)).toBeLessThan(2500);
    expect(s0.over).toEqual([]);
  }, 600_000);
  it('without the type 3 SPD the socket surge reaches the appliance at over 1.5 kV (why sensitive appliances get it)', () => {
    expect(run(mainsHouse('socket', { t3: false }).sheet).pk('L3', 'N3')).toBeGreaterThan(1500);
  }, 600_000);
  it('parts list: the three DEHN SPDs, each one part (its varistor and spark gaps are units of one product), and the PEN on a 16 mm² feed-through DIN-rail terminal (not bonded to the rail)', () => {
    const c = costedBom(buildBom(mainsHouse('lightning').sheet));
    expect(c.missing).toBe(0);
    expect(c.lines.filter((l) => l.sym === 'mov' || l.sym === 'gdt').map((l) => [l.qty, l.cat?.mpn])).toEqual([[1, '941205 (DSH TN 255 FM)'], [1, '942220 (DG MP TN ACI 275 FM)'], [1, '953200 (DR M 2P 255)']]);
    expect(c.lines.find((l) => l.sym === 'terminal')?.value).toBe('DIN rail, 16 mm²');
  });
});

describe('PV house (D49): certified type 2 PV SPDs (DEHNguard M YPV SCI 150, Y circuit) at both ends of the cable, decoupling chokes before the charger', () => {
  // the charger's input as P6 builds it; a surge at either end of the cable, the charger running
  // (QPV on) or stopped (QPV off: at night, or latched off after a fault)
  for (const at of ['array', 'charger'] as const) for (const qpv of [true, false]) for (const ka of [10, 20])
    it(`${ka} kA 8/20 µs (the SPDs' ${ka === 10 ? 'In' : 'Imax'}) at the ${at}'s end, charger ${qpv ? 'running' : 'stopped'}: its input, capacitors and QPV below 200 V, every part within its ratings`, () => {
      const s = run(pvHouse({ at, qpv, ka }).sheet, PV_PARTS);
      expect(s.pk('PVI', 'NVI')).toBeLessThan(200);
      expect(s.pk('PVI', 'BN')).toBeLessThan(200);
      expect(s.pk('NVI', 'BN')).toBeLessThan(200);
      expect(s.over).toEqual([]);
    }, 600_000);
  it('without the array\'s SPD the modules see over 10 kV to their frames', () => {
    expect(run(pvHouse({ spdArray: false }).sheet).pk('PVA', 'PEA')).toBeGreaterThan(10_000);
  }, 600_000);
  it('without the chokes a surge at the charger\'s end (5 kA) reaches the charger at over 200 V: the SPD (Up 0.8 kV) alone does not protect it', () => {
    expect(run(pvHouse({ at: 'charger', ldec: 0 }).sheet).pk('PVC', 'BN')).toBeGreaterThan(200);
  }, 600_000);
  it('without the capacitor across QPV, the charger stopped, 10 kA at the array\'s end puts over 200 V on QPV (P6 change)', () => {
    expect(run(pvHouse({ qpv: false, ka: 10, cpvn: 0 }).sheet).pk('NVI', 'BN')).toBeGreaterThan(200);
  }, 600_000);
  it('the charger\'s fault latch opens QPV at full current: the chokes\' energy goes into the capacitor across QPV (QPV and the input below 200 V, every part within its ratings); without that capacitor the TVS is overloaded', () => {
    const s = run(pvHouse({ trip: true }).sheet, PV_PARTS);
    expect(s.pk('NVI', 'BN')).toBeLessThan(200);
    expect(s.pk('PVI', 'NVI')).toBeLessThan(200);
    expect(s.over).toEqual([]);
    expect(run(pvHouse({ trip: true, cpvn: 0 }).sheet, PV_PARTS).over).toContain('D1 peak pulse power');
  }, 600_000);
  it('without the TVS, at Imax at the charger\'s end, the input stays below 200 V (the TVS is the second line)', () => {
    expect(run(pvHouse({ at: 'charger', ka: 20, tvs: false }).sheet).pk('PVI', 'NVI')).toBeLessThan(200);
  }, 600_000);
  it('parts list: each SPD module is one part (its three varistors are its units), the two decoupling chokes, all costed from the catalogue', () => {
    const c = costedBom(buildBom(pvHouse().sheet));
    expect(c.missing).toBe(0);
    expect(c.lines.filter((l) => l.sym === 'inductor').map((l) => [l.qty, l.value])).toEqual([[2, '68 µH']]);
    const lines = c.lines.filter((l) => l.sym === 'mov' && /YPV/.test(l.value));
    expect(lines.map((l) => [l.value, l.qty, l.cat?.mpn])).toEqual([['DG M YPV SCI 150 FM', 1, '952518 (DG M YPV SCI 150 FM)'], ['DG M YPV SCI 150', 1, '952513 (DG M YPV SCI 150)']]);
  });
});

/** Wires of different nets closer than two grid steps side by side, and wires across a pin of
 *  another net: both make a drawing hard to read (the checks of D28 do not catch them). */
function crowded(s: Sheet) {
  const c = connectivity(s), out: string[] = [];
  const W = s.wires.map((w) => ({ w, n: c.wireNet.get(w.id) ?? '?', h: w.a.y === w.b.y }));
  for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) {
    const A = W[i], B = W[j]; if (A.n === B.n || A.h !== B.h) continue;
    const [p, q] = A.h ? ['y', 'x'] as const : ['x', 'y'] as const;
    const d = Math.abs(A.w.a[p] - B.w.a[p]);
    const lo = Math.max(Math.min(A.w.a[q], A.w.b[q]), Math.min(B.w.a[q], B.w.b[q])), hi = Math.min(Math.max(A.w.a[q], A.w.b[q]), Math.max(B.w.a[q], B.w.b[q]));
    if (d < 20 && hi - lo > 0) out.push(`${A.n}/${B.n} ${A.h ? 'h' : 'v'} d=${d} @${p}=${A.w.a[p]} ${lo}..${hi}`);
  }
  // a wire passing over a pin of another net
  const pins = s.parts.flatMap((pt) => pinPositions(pt).map((q) => ({ at: q.at, net: c.pinNet.get(`${pt.ref}.${q.pin}`), ref: `${pt.ref}.${q.pin}` })));
  for (const { w, n } of W) for (const pn of pins) { if (pn.net === n) continue; const { x, y } = pn.at; if ((w.a.x === w.b.x && x === w.a.x && y > Math.min(w.a.y, w.b.y) && y < Math.max(w.a.y, w.b.y)) || (w.a.y === w.b.y && y === w.a.y && x > Math.min(w.a.x, w.b.x) && x < Math.max(w.a.x, w.b.x))) out.push(`wire ${n} over pin ${pn.ref} (${pn.net})`); }
  return out;
}

describe('drawings of P5 readable', () => {
  for (const [name, sheet] of [['mains house', () => mainsHouse('lightning').sheet], ['PV house', () => pvHouse().sheet]] as const)
    it(`${name}: no text on a part, text or wire; no wires of different nets side by side or across another net's pin`, () => {
      const sh = sheet();
      expect(textCollisions(sh)).toEqual([]);
      expect(crowded(sh)).toEqual([]);
    });
});
