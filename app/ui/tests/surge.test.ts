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

function run(sheet: Sheet) {
  const r = simulate(sheet) as SimResult;
  expect('error' in r ? (r as unknown as { error: string }).error : '').toBe('');
  const pk = (a: string, b: string) => r.v[a].reduce((m, v, k) => Math.max(m, Math.abs(v - r.v[b][k])), 0);
  // the protective devices against their surge ratings (peak current, energy, peak power); the
  // conductors and the test load are no parts, and a run of a millisecond has no mean power
  const sym = new Map(sheet.parts.map((p) => [p.ref, p.sym]));
  const over = smoke(sheet, connectivity(sheet), r).rows.filter((x) => x.status === 'over' && ['mov', 'gdt', 'tvs'].includes(sym.get(x.ref) ?? '') && !/^power$|mean/.test(x.what)).map((x) => `${x.ref} ${x.what}`);
  return { r, pk, over };
}

describe('mains house (TN-C-S): DEHN type 1+2, type 2 and type 3 SPDs coordinated by the cables', () => {
  for (const [s, what] of [['lightning', '12.5 kA 10/350 µs into the service line'], ['induced', '20 kA 8/20 µs into the service line'], ['socket', '6 kV / 3 kA 1.2/50 µs at the socket, L to N']] as [MainsSurge, string][])
    it(`${what}: the appliance sees below 1.5 kV (overvoltage category I) L–N, L–PE and N–PE; every SPD within its ratings`, () => {
      const s0 = run(mainsHouse(s).sheet);
      for (const [a, b] of [['L3', 'N3'], ['L3', 'PE3'], ['N3', 'PE3']]) expect(s0.pk(a, b)).toBeLessThan(1500);
      expect(s0.over).toEqual([]);
    }, 600_000);
  it('without the type 3 SPD the socket surge reaches the appliance at over 1.5 kV (why sensitive appliances get it)', () => {
    expect(run(mainsHouse('socket', { t3: false }).sheet).pk('L3', 'N3')).toBeGreaterThan(1500);
  }, 600_000);
  it('parts list: the three DEHN SPDs, each one part (its varistor and spark gaps are units of one product), and the PEN on a 16 mm² DIN-rail terminal', () => {
    const c = costedBom(buildBom(mainsHouse('lightning').sheet));
    expect(c.missing).toBe(0);
    expect(c.lines.filter((l) => l.sym === 'mov' || l.sym === 'gdt').map((l) => [l.qty, l.cat?.mpn])).toEqual([[1, '941205 (DSH TN 255 FM)'], [1, '942220 (DG MP TN ACI 275 FM)'], [1, '953200 (DR M 2P 255)']]);
    expect(c.lines.find((l) => l.sym === 'terminal')?.value).toBe('DIN rail, 16 mm², PE');
  });
});

describe('PV house (D49): certified type 2 PV SPDs (DEHNguard M YPV SCI 150, Y circuit) at the array and at the 48 V charger, the charger\'s input TVS', () => {
  for (const ka of [5, 10, 20])
    it(`${ka} kA 8/20 µs induced into the DC cable at the array${ka === 10 ? ' (the SPDs\' In)' : ka === 20 ? ' (their Imax)' : ''}: the charger's input below 200 V (its MOSFETs), the array's DC+ to its frame within the SPD's Up (0.8 kV), every SPD and the TVS within their ratings`, () => {
      const s = run(pvHouse({ ka }).sheet);
      expect(s.pk('PVC', 'NVC')).toBeLessThan(200);
      expect(s.pk('PVA', 'PEA')).toBeLessThan(800);
      expect(s.over).toEqual([]);
    }, 600_000);
  it('without the array\'s SPD the modules see over 10 kV to their frames and the charger\'s input over 200 V (why it is fitted)', () => {
    const s = run(pvHouse({ spdArray: false }).sheet);
    expect(s.pk('PVA', 'PEA')).toBeGreaterThan(10_000);
    expect(s.pk('PVC', 'NVC')).toBeGreaterThan(200);
  }, 600_000);
  it('without the TVS, at Imax, the charger\'s 188 µF of film input capacitors still hold its input below 200 V (the TVS is its second line)', () => {
    expect(run(pvHouse({ tvs: false, ka: 20 }).sheet).pk('PVC', 'NVC')).toBeLessThan(200);
  }, 600_000);
  it('parts list: each SPD module is one part (its three varistors are its units), costed from the catalogue', () => {
    const lines = costedBom(buildBom(pvHouse().sheet)).lines.filter((l) => l.sym === 'mov' && /YPV/.test(l.value));
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
