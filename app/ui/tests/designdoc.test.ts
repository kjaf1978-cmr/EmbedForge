// Design documents (decision D29): description, the vector schematic, the costed parts list and
// the design's documentation, as PDF and as Word.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { unzipSync, strFromU8 } from 'fflate';
import { EXAMPLES } from '../src/eda/examples';
import { designDoc } from '../src/eda/designDoc';
import { designPdf, largeFormat, schematicPdf, transformPath } from '../src/eda/docPdf';
import { designDocx } from '../src/eda/docDocx';
import { buildBom } from '../src/eda/bom';
import { catalogueFor, costedBom, costedCsv } from '../src/eda/catalogue';
import { parseMd } from '../src/eda/md';

const bytes = (f: string) => new Uint8Array(readFileSync(f));
const fonts = { regular: bytes('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf'), bold: bytes('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf') };
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'));
const POWER = ['changeover-1p', 'changeover-3p', 'stabiliser', 'mppt-charger'];

describe('parts catalogue', () => {
  it('every product part of the power designs has a manufacturer part number and a price; test-bench parts are not listed', () => {
    for (const id of POWER) {
      const sheet = EXAMPLES.find((e) => e.id === id)!.build();
      const lines = buildBom(sheet);
      expect(lines.filter((l) => !catalogueFor(l)).map((l) => `${l.part} ${l.value}`), id).toEqual([]);
      expect(lines.some((l) => ['vsin', 'vsin3', 'pv', 'battery'].includes(l.sym)), id).toBe(false);
      const c = costedBom(lines);
      expect(c.total, id).toBeGreaterThan(100);
      expect(costedCsv(c.lines).split('\r\n')[0]).toMatch(/^Qty,References,Part,Value,Details,Manufacturer,Part number,Where to buy/);
    }
  });
  it('the battery fuse of the charger is rated for a 58 V battery (not a 32 V automotive fuse)', () => {
    const sheet = EXAMPLES.find((e) => e.id === 'mppt-charger')!.build();
    const fuse = buildBom(sheet).find((l) => l.sym === 'fuse' && l.raw === '100')!;
    expect(catalogueFor(fuse)!.description).toMatch(/Class T .*160 V DC/);
  });
});

describe('design document', () => {
  it('a part path rotated and mirrored stays a valid path in sheet coordinates', () => {
    expect(transformPath('M -30 0 H 30', { x: 100, y: 50, rot: 1, mirror: false })).toBe('M 100 20 L 100 80');
    expect(transformPath('M 0 0 A 5 5 0 0 1 10 0', { x: 0, y: 0, rot: 0, mirror: true })).toBe('M 0 0 A 5 5 0 0 0 -10 0');
  });
  it('Markdown: headings, lists, tables and bold runs', () => {
    const b = parseMd('# T\n\nSome **bold** text.\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'li', 'li', 'table']);
    expect(b[1].t === 'p' && b[1].runs.find((r) => r.bold)?.text).toBe('bold');
  });
  for (const id of POWER) it(`${id}: PDF and Word with the schematic, the parts list, the DFMEA and the FAQ`, async () => {
    const ex = EXAMPLES.find((e) => e.id === id)!;
    const doc = designDoc(ex.build(), ex.title, 'test');
    expect(doc.sections.map((s) => s.title)).toEqual(['Design FMEA', 'Reliability prediction: method', 'Diagnostics, maintenance and FAQ']);
    expect(doc.reliability.years45).toBeGreaterThan(5);
    const pdf = await PDFDocument.load(await designPdf(doc, fonts));
    // title and text pages (A4 landscape), the overview and at least two tiles (A3 landscape)
    const sizes = pdf.getPages().map((p) => Math.round(p.getWidth()));
    expect(sizes.filter((w) => w === 1191).length).toBeGreaterThanOrEqual(3);
    expect(sizes.filter((w) => w === 842).length).toBeGreaterThanOrEqual(5);
    expect(pdf.getTitle()).toBe(ex.title);
    // the complete schematic on one large page (owner's note of 16 October): an ISO format
    // that holds the whole sheet with its text at least 5 pt (1.8 mm) high
    const L = largeFormat(doc.sheet);
    expect(['A1', 'A0'], id).toContain(L.name);
    expect(L.k * L.ts * 8, id).toBeGreaterThanOrEqual(5);
    expect(sizes, id).toContain(Math.round(L.size[0]));
    const one = await PDFDocument.load(await schematicPdf(doc.sheet, ex.title, 'test', fonts));
    expect(one.getPages().map((p) => Math.round(p.getWidth())), id).toEqual([Math.round(L.size[0])]);
    const files = unzipSync(await designDocx(doc, async () => PNG));
    const xml = strFromU8(files['word/document.xml']);
    expect(xml).toContain('Bill of materials');
    expect(xml).toContain('Diagnostics, maintenance and FAQ');
    expect(Object.keys(files).filter((f) => f.endsWith('.svg')).length).toBeGreaterThanOrEqual(3);
  }, 120_000);
});
