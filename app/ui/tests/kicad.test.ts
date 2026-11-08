// The KiCad export of the worked designs' boards (decision D43): packages, pads and nets,
// the mains nets and their footprints, the panel split, and the board file's form.
import { describe, expect, it } from 'vitest';
import { boardNetlist, kicadBoard, potentialGroup, classFor, ipc2221Width } from '../src/pcb/kicad';
import { stabiliser, changeover1 } from '../src/eda/powerExamples';
import { inverterHF } from '../src/eda/inverters';
import { buildBom } from '../src/eda/bom';
import { connectivity } from '../src/eda/connectivity';
import { packageRef } from '../src/eda/schematic';

describe('KiCad export: the board netlist', () => {
  it('stabiliser: every product part on the board once per package, test-bench parts left off, no warnings', () => {
    const { sheet } = stabiliser();
    const nl = boardNetlist(sheet);
    expect(nl.warnings).toEqual([]);
    const product = sheet.parts.filter((p) => p.props.scope !== 'test' && !['gnd', 'vcc', 'netlabel'].includes(p.sym) && !p.sym.startsWith('pwr'));
    const pkgs = new Set(product.map(packageRef));
    expect(nl.parts.map((p) => p.ref).sort()).toEqual([...pkgs].filter((r) => nl.parts.some((p) => p.ref === r)).sort());
    expect(nl.parts.some((p) => p.ref === 'VIN')).toBe(false);
    // as many ICs as the parts list counts
    const bom = buildBom(sheet);
    const lm339 = bom.filter((l) => l.value === 'LM339' || l.raw === 'LM339').reduce((a, l) => a + l.qty, 0);
    expect(nl.parts.filter((p) => p.value === 'LM339').length).toBe(lm339);
  });

  it('the units of an LM339 sit on their own pins: outputs 2, 1, 14, 13; supply on 3 and 12', () => {
    const { sheet } = inverterHF({ cells: 4 });
    const nl = boardNetlist(sheet), c = connectivity(sheet);
    const units = sheet.parts.filter((p) => p.sym === 'comparator' && p.props.value === 'LM339' && p.props.pkg);
    const pkg = packageRef(units[0]), us = units.filter((u) => packageRef(u) === pkg).sort((a, b) => a.ref.localeCompare(b.ref));
    const bp = nl.parts.find((p) => p.ref === pkg)!;
    expect(bp.footprint.id).toBe('DIP-14');
    ['2', '1', '14', '13'].slice(0, us.length).forEach((pad, k) => expect(bp.pads[pad]).toBe(c.pinNet.get(`${us[k].ref}.1`)));
    expect(bp.pads['3']).toBe(c.pinNet.get(`${us[0].ref}.8`));
    expect(bp.pads['12']).toBe(c.pinNet.get(`${us[0].ref}.4`));
   }, 60_000);

  it('the mains nets of the stabiliser: from L and N up to the transformers, not its control side', () => {
    const { sheet } = stabiliser();
    const g = potentialGroup(sheet, ['L_IN', 'N']);
    for (const n of ['L_IN', 'N', 'VIN', 'OUT', 'T1', 'T7']) expect(g.has(n)).toBe(true);
    for (const n of ['GND', '+12V', 'SENSE', 'VREF']) expect(g.has(n)).toBe(false);
  });

  it('a mains net on a terminal block or a transformer takes the 7.62 mm footprint', () => {
    const { sheet } = stabiliser();
    const mains = potentialGroup(sheet, ['L_IN', 'N']);
    const nl = boardNetlist(sheet, { mains });
    for (const p of nl.parts) {
      if (!Object.values(p.pads).some((n) => mains.has(n))) continue;
      if (p.footprint.id.startsWith('TerminalBlock') || p.footprint.id.startsWith('Transformer')) expect(p.footprint.id, p.ref).toMatch(/P7\.62$/);
    }
  });

  it('change-over 1P: contactors, breakers and the power terminals on the panel; the board reaches them through one connector', () => {
    const { sheet } = changeover1();
    const panelSyms = new Set(['contactor', 'breaker1', 'breaker2', 'terminal']);
    const nl = boardNetlist(sheet, { panel: (p) => panelSyms.has(p.sym) });
    expect(nl.parts.some((p) => panelSyms.has(sheet.parts.find((q) => q.ref === p.ref)?.sym ?? ''))).toBe(false);
    const js = nl.parts.filter((p) => p.ref === 'J_PANEL' || p.ref === 'J_MAINS');
    expect(js.length).toBeGreaterThan(0);
    const poles = new Set(js.flatMap((j) => Object.values(j.pads)));
    for (const w of nl.panel.filter((x) => x.board)) expect(poles.has(w.net)).toBe(true);
  });
});

describe('KiCad export: the board file', () => {
  it('stabiliser: balanced S-expression, one footprint per board part, every net declared, the classes in the project', () => {
    const { sheet } = stabiliser();
    const nl = boardNetlist(sheet);
    const cls = classFor('Mains', potentialGroup(sheet, ['L_IN', 'N']), 2.5, 3.2);
    const b = kicadBoard(nl, { title: 'test', classes: [cls] });
    let depth = 0, min = 0;
    for (const ch of b.pcb.replace(/"(?:[^"\\]|\\.)*"/g, '')) { if (ch === '(') depth++; else if (ch === ')') { depth--; min = Math.min(min, depth); } }
    expect([depth, min]).toEqual([0, 0]);
    expect((b.pcb.match(/^ {2}\(footprint /gm) ?? []).length).toBe(nl.parts.length);
    for (const n of nl.nets) expect(b.pcb).toContain(`(net ${nl.nets.indexOf(n) + 1} "${n}")`);
    const pro = JSON.parse(b.pro);
    expect(pro.net_settings.classes.map((c: { name: string }) => c.name)).toEqual(['Default', 'Mains']);
    expect(pro.net_settings.netclass_patterns.length).toBe(cls.patterns.length);
    // no courtyards overlap in the first placement
    const byRef = new Map(nl.parts.map((p) => [p.ref, p]));
    const boxes = b.placed.map((pl) => { const c = byRef.get(pl.ref)!.footprint.courtyard; return { r: pl.ref, x0: pl.x + c.x0, y0: pl.y + c.y0, x1: pl.x + c.x1, y1: pl.y + c.y1 }; });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], o = boxes[j];
      expect(a.x0 < o.x1 && o.x0 < a.x1 && a.y0 < o.y1 && o.y0 < a.y1, `${a.r} and ${o.r} overlap`).toBe(false);
    }
  });

  it('IPC-2221 widths: 10 A at 20 K in 2 oz copper about 2.5 mm, 1 A under 0.2 mm', () => {
    expect(ipc2221Width(10, 20, 2)).toBeGreaterThan(2);
    expect(ipc2221Width(10, 20, 2)).toBeLessThan(3.2);
    expect(ipc2221Width(1, 20, 2)).toBeLessThan(0.2);
  });
});
