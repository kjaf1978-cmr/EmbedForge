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

describe('mains house (TN-C-S): type 1+2, type 2 and type 3 SPDs coordinated by the cables', () => {
  for (const [s, what] of [['lightning', '12.5 kA 10/350 µs into the service line'], ['induced', '20 kA 8/20 µs into the service line'], ['socket', '6 kV / 3 kA 1.2/50 µs at the socket, L to N']] as [MainsSurge, string][])
    it(`${what}: the appliance sees below 1.5 kV (overvoltage category I) L–N, L–PE and N–PE; every SPD within its ratings`, () => {
      const s0 = run(mainsHouse(s).sheet);
      for (const [a, b] of [['L3', 'N3'], ['L3', 'PE3'], ['N3', 'PE3']]) expect(s0.pk(a, b)).toBeLessThan(1500);
      expect(s0.over).toEqual([]);
    }, 600_000);
  it('without the type 3 SPD the socket surge reaches the appliance at over 1.5 kV (why sensitive appliances get it)', () => {
    expect(run(mainsHouse('socket', { t3: false }).sheet).pk('L3', 'N3')).toBeGreaterThan(1500);
  }, 600_000);
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
