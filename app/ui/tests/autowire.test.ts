// The drawn circuit diagrams (decision D28): automatic wiring keeps the netlist, and the wired
// designs are real drawings (wires, no overlapping parts, terminals, packages).
import { inverterLF } from '../src/eda/inverters';
import { describe, expect, it } from 'vitest';
import { autowire, pinPartition } from '../src/eda/autowire';
import { changeover1, changeover3, mpptCharger, stabiliser } from '../src/eda/powerExamples';
import { buildBom } from '../src/eda/bom';
import { erc } from '../src/eda/erc';
import { partBounds, pinPositions } from '../src/eda/schematic';
import { symbolOf } from '../src/eda/symbols';
import { connectivity } from '../src/eda/connectivity';
import { deck } from './deck';
import type { Sheet } from '../src/eda/schematic';

const overlaps = (s: Sheet) => {
  const b = s.parts.filter((p) => !symbolOf(p.sym).power).map((p) => ({ p, b: partBounds(p) }));
  const out: string[] = [];
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    const A = b[i].b, B = b[j].b;
    if (A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1) out.push(`${b[i].p.ref}/${b[j].p.ref}`);
  }
  return out;
};

describe('autowire', () => {
  it('draws a labelled netlist with wires and keeps every connection', () => {
    const { sheet } = deck([
      ['vdc', { value: '12' }, { '1': 'A', '2': 'GND' }],
      ['resistor', { value: '1k' }, { '1': 'A', '2': 'B' }],
      ['resistor', { value: '2k' }, { '1': 'B', '2': 'GND' }],
      ['capacitor', { value: '1u' }, { '1': 'B', '2': 'GND' }],
    ]);
    const r = autowire(sheet);
    expect(r.failed).toEqual([]);
    expect(pinPartition(r.sheet)).toEqual(pinPartition(sheet));
    expect(r.sheet.wires.length).toBeGreaterThan(0);
  });
});

describe('the stabiliser is a real circuit diagram (D28)', () => {
  const { sheet } = stabiliser();
  it('wired: every non-rail net is drawn with wires; labels only name nets or join blocks', () => {
    const conn = connectivity(sheet);
    expect(sheet.wires.length).toBeGreaterThan(500);
    // no pin carries a label directly: every connection is a wire or a power symbol
    const pins = new Set(sheet.parts.filter((p) => !symbolOf(p.sym).power).flatMap((p) => pinPositions(p).map((q) => `${q.at.x},${q.at.y}`)));
    expect(sheet.labels.filter((l) => !l.note && pins.has(`${l.x},${l.y}`)).map((l) => l.name)).toEqual([]);
    expect(conn.conflicts).toEqual([]);
  });
  it('no two parts overlap', () => expect(overlaps(sheet)).toEqual([]));
  it('ERC clean, including the IC packages', () => {
    expect(erc(sheet).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
  });
  it('terminals for every external connection; test supply and load outside the product', () => {
    const t = sheet.parts.filter((p) => p.sym === 'terminal').map((p) => p.props.value).sort();
    expect(t).toEqual(['L in', 'L out', 'N in', 'N out', 'PE', 'PE']);
  });
  it('the parts list counts packages: two LM339 (taps; taps, delay and one spare) and an LM393 for the independent protection', () => {
    const bom = buildBom(sheet);
    const lm339 = bom.find((l) => l.value === 'LM339')!, lm393 = bom.find((l) => l.value === 'LM393')!;
    expect(lm339.qty).toBe(2);
    expect(lm339.part).toMatch(/4 in one package/);
    expect(lm393.qty).toBe(1);
  });
  it('the 12 V control supply is part of the design (no ideal source inside the product)', () => {
    expect(sheet.parts.filter((p) => p.sym === 'vdc')).toEqual([]);
    expect(sheet.parts.some((p) => p.sym === 'lm317' && p.props.value === 'LM317HV')).toBe(true);
  });
});

describe('every power design is a real circuit diagram (D28)', () => {
  const designs: [string, () => Sheet][] = [['change-over 1P', () => changeover1().sheet], ['change-over 3P+N', () => changeover3().sheet], ['stabiliser', () => stabiliser().sheet], ['MPPT charger', () => mpptCharger().sheet]];
  for (const [name, build] of designs) it(`${name}: wired, no label on a pin, no overlapping parts, ERC clean, no ideal supply inside`, () => {
    const sheet = build();
    expect(sheet.wires.length).toBeGreaterThan(300);
    const pins = new Set(sheet.parts.filter((p) => !symbolOf(p.sym).power).flatMap((p) => pinPositions(p).map((q) => `${q.at.x},${q.at.y}`)));
    expect(sheet.labels.filter((l) => !l.note && pins.has(`${l.x},${l.y}`)).map((l) => l.name)).toEqual([]);
    expect(overlaps(sheet)).toEqual([]);
    expect(erc(sheet).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
    expect(sheet.parts.filter((p) => p.sym === 'vdc').map((p) => p.ref)).toEqual([]);
    expect(sheet.parts.filter((p) => p.sym === 'terminal').length).toBeGreaterThanOrEqual(4);
  });
});

describe('no wasted parts (owner, 16 October: D31): no unused units beyond what the packages force', () => {
  // a spare unit has its output on ground (it does nothing); an odd count of comparators leaves
  // at most one spare in the packages chosen
  const spares = (s: Sheet) => s.parts.filter((p) => p.sym === 'comparator' && connectivity(s).pinNet.get(`${p.ref}.1`) === 'GND').map((p) => p.ref);
  it('change-over 1P: one spare (seven comparators in two LM339)', () => expect(spares(changeover1().sheet).length).toBe(1));
  it('change-over 3P+N: none (three LM339 and one LM393)', () => expect(spares(changeover3().sheet)).toEqual([]), 30_000);
  it('stabiliser: one spare (seven comparators in two LM339; the protection in its own LM393)', () => expect(spares(stabiliser().sheet).length).toBe(1));
  it('MPPT charger: one spare (the independent latch in its LM393, seven comparators in two LM339); the sample-and-hold op-amp is a single TL071', () => {
    const s = mpptCharger().sheet;
    expect(spares(s).length).toBe(1);
    expect(s.parts.filter((p) => p.sym === 'opamp' && p.props.value === 'TL072')).toEqual([]);
  });
  it('inverter (50 Hz transformer): every package full (two LM339, an LM393, two TL074, two LM358, a CD4013); no spare (the flux integrator shares an LM358 with the output voltage limit)', () => {
    // logic packages by symbol (their value is the supply rail)
    const units: Record<string, number> = { LM339: 4, LM393: 2, TL074: 4, LM358: 2, dff: 2 };
    const pk = new Map<string, { value: string; n: number }>();
    for (const p of inverterLF().sheet.parts) if (p.props.pkg) { const v = p.sym === 'dff' ? 'dff' : p.props.value; const e = pk.get(p.props.pkg) ?? { value: v, n: 0 }; e.n++; pk.set(p.props.pkg, e); }
    expect([...pk].map(([k, e]) => `${k} ${e.value} ${e.n}/${units[e.value]}`)).toEqual([...pk].map(([k, e]) => `${k} ${e.value} ${units[e.value]}/${units[e.value]}`));
    expect(pk.size).toBe(8);
    expect(spares(inverterLF().sheet)).toEqual([]);
  }, 30_000);
  it('no separate gate resistor where a pull-up already limits the current (change-over drives)', () => {
    for (const s of [changeover1().sheet, changeover3().sheet]) {
      const conn = connectivity(s);
      for (const q of s.parts.filter((p) => p.sym === 'nmos' && p.props.value === 'IRLZ44N')) expect(conn.pinNet.get(`${q.ref}.1`)).toMatch(/^K[12]EN$/);
    }
  });
});
