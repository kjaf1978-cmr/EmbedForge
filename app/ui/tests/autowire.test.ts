// The drawn circuit diagrams (decision D28): automatic wiring keeps the netlist, and the wired
// designs are real drawings (wires, no overlapping parts, terminals, packages).
import { describe, expect, it } from 'vitest';
import { autowire, pinPartition } from '../src/eda/autowire';
import { stabiliser } from '../src/eda/powerExamples';
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
  it('the parts list counts packages: three LM339 (control, delay and spare, independent protection)', () => {
    const lm339 = buildBom(sheet).find((l) => l.value === 'LM339')!;
    expect(lm339.qty).toBe(3);
    expect(lm339.part).toMatch(/4 in one package/);
  });
  it('the 12 V control supply is part of the design (no ideal source inside the product)', () => {
    expect(sheet.parts.filter((p) => p.sym === 'vdc')).toEqual([]);
    expect(sheet.parts.some((p) => p.sym === 'lm317' && p.props.value === 'LM317HV')).toBe(true);
  });
});
