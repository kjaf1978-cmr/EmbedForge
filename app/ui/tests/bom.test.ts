import { describe, expect, it } from 'vitest';
import { deck } from './deck';
import { bomCsv, buildBom } from '../src/eda/bom';
import { EXAMPLES } from '../src/eda/examples';

describe('bill of materials', () => {
  it('groups identical parts, keeps different values apart, leaves out power symbols', () => {
    const { sheet } = deck([['resistor', { value: '1k' }, { '1': 'A', '2': 'GND' }], ['resistor', { value: '1k' }, { '1': 'A', '2': 'B' }], ['resistor', { value: '4k7' }, { '1': 'B', '2': 'GND' }],
      ['transformer', { value: '0.1', lp: '2' }, { '1': 'A', '2': 'GND', '3': 'B', '4': 'GND' }], ['switch', { closed: 'true' }, { '1': 'A', '2': 'B' }]]);
    const b = buildBom(sheet);
    expect(b.map((l) => [l.qty, l.refs.join(' '), l.value])).toEqual([
      [2, 'R1 R2', '1k Ω'], [1, 'R3', '4k7 Ω'], [1, 'SW1', ''], [1, 'T1', '0.1'],
    ]);
    expect(b.find((l) => l.refs[0] === 'T1')!.details).toBe('primary inductance 2 H');
    const csv = bomCsv(b);
    expect(csv.split('\r\n')[0]).toBe('Qty,References,Part,Value,Details,Catalogue part');
    expect(csv).toContain('2,R1 R2,Resistor,1k Ω,,no (generic library)');
  });
  it('every example has a parts list with every part once (the units of a multi-unit IC are one part)', () => {
    for (const ex of EXAMPLES) {
      const s = ex.build();
      const b = buildBom(s);
      const parts = s.parts.filter((p) => !['gnd', 'power'].includes(p.sym));
      const packages = new Set(parts.map((p) => (p.props.pkg ? p.ref.replace(/[A-Z]$/, '') : p.ref)));
      expect(b.reduce((a, l) => a + l.qty, 0), ex.id).toBe(packages.size);
    }
  });
});

describe('text notes', async () => {
  const { addLabel } = await import('../src/eda/editor');
  const { connectivity } = await import('../src/eda/connectivity');
  const { pinPositions } = await import('../src/eda/schematic');
  const { erc } = await import('../src/eda/erc');
  const { fromFiles, toFiles } = await import('../src/eda/project');
  it('a note connects to nothing, even named like a net or placed on a pin, and is saved', () => {
    const { sheet } = deck([['resistor', { value: '1k' }, { '1': 'A', '2': 'GND' }], ['vdc', { value: '5' }, { '1': 'A', '2': 'GND' }]]);
    const before = connectivity(sheet).nets.map((n) => [n.name, n.pins]);
    const pin = pinPositions(sheet.parts.find((p) => p.sym === 'resistor')!)[0].at;
    let s = addLabel(sheet, 'GND', pin, true).sheet;
    s = addLabel(s, 'Check the rating of R1', { x: 500, y: 500 }, true).sheet;
    expect(connectivity(s).nets.map((n) => [n.name, n.pins])).toEqual(before);
    expect(erc(s).filter((i) => /Label/.test(i.message))).toEqual([]);
    const back = fromFiles(JSON.parse(JSON.stringify(toFiles('Notes', s)))).sheet;
    expect(back.labels.filter((l) => l.note).map((l) => l.name)).toEqual(['GND', 'Check the rating of R1']);
  });
});
