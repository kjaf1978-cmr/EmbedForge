// P5: surge protection of a mains house and of a PV house's DC side (src/eda/surge.ts): the
// let-through voltage at the appliance and the SPDs within their ratings, for the surges of the
// standards (10/350 µs lightning current, 8/20 µs induced current, 1.2/50 µs combination wave).
import { describe, expect, it } from 'vitest';
import { mainsHouse, pvHouse, type MainsSurge } from '../src/eda/surge';
import { simulate, type SimResult } from '../src/sim/run';
import { smoke } from '../src/eda/smoke';
import { connectivity } from '../src/eda/connectivity';
import type { Sheet } from '../src/eda/schematic';

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

describe('PV house: DC SPDs at the array and at the 48 V charger, the charger\'s input TVS', () => {
  it('5 kA 8/20 µs induced into the DC cable at the array: the charger\'s input below 200 V (its MOSFETs), every SPD and the TVS within their ratings', () => {
    const s = run(pvHouse().sheet);
    expect(s.pk('PVC', 'NVC')).toBeLessThan(200);
    expect(s.over).toEqual([]);
  }, 600_000);
  it('without the TVS the charger\'s input sees over 200 V (why it is fitted)', () => {
    expect(run(pvHouse({ tvs: false }).sheet).pk('PVC', 'NVC')).toBeGreaterThan(200);
  }, 600_000);
});
