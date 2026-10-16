// Word (.docx) version of a design document (D29): the same content as the PDF. The schematic
// pages are embedded as SVG (vector: Word 2016 and later and LibreOffice show and print them at
// any scale), each with the PNG fallback that the format requires for older programs.

import { AlignmentType, Document, HeadingLevel, ImageRun, LevelFormat, Packer, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import type { Block, Run } from './md';
import { schematicTiles, type DesignDocModel } from './designDoc';
import { sheetSvg } from './printSvg';

/** Renders an SVG to PNG (the fallback image): in the app a canvas, in tests a placeholder. */
export type PngOf = (svg: string, width: number, height: number) => Promise<Uint8Array>;

const TW = 1440 / 72; // twips per point
// A4 landscape for text, A3 landscape for the schematic pages (in twips), margins 2 cm
const A4L = { width: 16838, height: 11906 }, A3L = { width: 23811, height: 16838 }, MARGIN = 1134;

const tr = (r: Run, size = 19) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, size, font: 'DejaVu Sans' });
const para = (runs: Run[], size = 19, extra: Record<string, unknown> = {}) => new Paragraph({ children: runs.map((r) => tr(r, size)), spacing: { after: 100 }, ...extra });

function table(rows: Run[][][], header: boolean, size = 15, widths?: number[]): Table {
  const cols = Math.max(...rows.map((r) => r.length));
  // column widths (fractions of the text width, landscape A4): given, or by the amount of text
  const len = Array.from({ length: cols }, (_, c) => Math.max(3, ...rows.map((r) => Math.min(60, (r[c] ?? []).map((x) => x.text).join('').length))));
  const frac = widths ?? len.map((l) => l / len.reduce((a, b) => a + b, 0));
  const total = A4L.width - 2 * MARGIN;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: frac.map((f) => Math.round(f * total)),
    rows: rows.map((r, i) => new TableRow({
      tableHeader: header && i === 0,
      children: Array.from({ length: cols }, (_, c) => new TableCell({
        width: { size: Math.round(frac[c] * 100), type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: (r[c] ?? []).map((x) => tr({ ...x, bold: x.bold || (header && i === 0) }, size)) })],
        shading: header && i === 0 ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EEEEEE' } : undefined,
      })),
    })),
  });
}

function blocks(bs: Block[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const b of bs) {
    if (b.t === 'h') out.push(new Paragraph({ heading: b.level <= 1 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, children: b.runs.map((r) => tr({ ...r, bold: true }, b.level <= 1 ? 26 : 22)) }));
    else if (b.t === 'p') out.push(para(b.runs));
    else if (b.t === 'li') out.push(new Paragraph({ children: b.runs.map((r) => tr(r)), ...(b.ordered ? { numbering: { reference: 'num', level: 0 } } : { bullet: { level: 0 } }) }));
    else { out.push(table(b.rows, b.header)); out.push(new Paragraph({ children: [] })); }
  }
  return out;
}

const enc = (s: string) => new TextEncoder().encode(s);

/** The design document as a .docx file. */
export async function designDocx(doc: DesignDocModel, pngOf: PngOf): Promise<Uint8Array> {
  // schematic images: the overview and the tiles (same grid as the PDF), sized to the A3 page
  const aw = (A3L.width - 2 * MARGIN) / TW, ah = (A3L.height - 2 * MARGIN) / TW - 40; // points
  const k = 0.8;
  const { view, tiles } = schematicTiles(doc.sheet, aw / k, ah / k);
  const image = async (v: { x0: number; y0: number; w: number; h: number }, fitW: number, fitH: number) => {
    const svg = sheetSvg(doc.sheet, '', v);
    const s = Math.min(fitW / v.w, fitH / v.h), w = Math.round(v.w * s * 96 / 72), h = Math.round(v.h * s * 96 / 72);
    const png = await pngOf(svg, Math.min(4000, w * 2), Math.min(4000, h * 2));
    return new ImageRun({ type: 'svg', data: enc(svg), transformation: { width: w, height: h }, fallback: { type: 'png', data: png } });
  };
  const schematic: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [tr({ text: '2 Schematic — overview (the following pages show it enlarged, tile by tile)', bold: true }, 26)] }),
    new Paragraph({ children: [await image(view, aw, ah)] }),
  ];
  for (const t of tiles) {
    schematic.push(new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_2, children: [tr({ text: `2 Schematic — tile ${t.name}`, bold: true }, 24)] }));
    schematic.push(new Paragraph({ children: [await image(t, aw, ah)] }));
  }

  const bomHead: Run[][] = ['Qty', 'References', 'Part', 'Manufacturer and part number', 'Where to buy (order number)', 'Price', '€ each', '€ total'].map((t) => [{ text: t }]);
  const bomRows: Run[][][] = [bomHead, ...doc.bom.lines.map((l) => [
    [{ text: String(l.qty) }], [{ text: l.refs.join(' ') }], [{ text: `${l.part} ${l.value}`.trim() }, ...(l.details ? [{ text: ` (${l.details})` }] : [])],
    [{ text: l.cat ? `${l.cat.maker}: ${l.cat.mpn}` : '—' }, ...(l.cat?.note ? [{ text: `. ${l.cat.note}` }] : [])],
    [{ text: l.cat ? l.cat.offers.map((o) => (o.sku ? `${o.distributor} ${o.sku}` : o.distributor)).join('; ') : '—' }],
    [{ text: l.cat?.basis ?? '' }], [{ text: l.unit === null ? '—' : l.unit.toFixed(2) }], [{ text: l.total === null ? '—' : l.total.toFixed(2) }],
  ]), [[{ text: '' }], [{ text: '' }], [{ text: 'Total (one unit)', bold: true }], [{ text: '' }], [{ text: '' }], [{ text: '' }], [{ text: '' }], [{ text: doc.bom.total.toFixed(2), bold: true }]]];

  const text: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [tr({ text: doc.title, bold: true }, 40)] }),
    para([{ text: doc.subtitle }], 22),
    para([{ text: `Date: ${doc.date}` }], 20),
    para([{ text: `Contents: 1 Description · 2 Schematic · 3 Bill of materials · 4 Reliability · ${doc.sections.map((s, i) => `${i + 5} ${s.title}`).join(' · ')}` }], 20),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [tr({ text: '1 Description', bold: true }, 28)] }),
    ...blocks(doc.intro),
  ];
  const bom: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [tr({ text: '3 Bill of materials', bold: true }, 28)] }),
    para([{ text: `${doc.bom.lines.reduce((a, l) => a + l.qty, 0)} parts in ${doc.bom.lines.length} lines. Component cost of one unit: ` }, { text: `€ ${doc.bom.total.toFixed(2)}`, bold: true }, { text: ` at single-unit prices, € ${doc.bom.total100.toFixed(2)} at 100-piece prices (printed circuit board, enclosure, heatsinks and wiring not included).` }]),
    para([{ text: doc.bom.note }], 16),
    table(bomRows, true, 14, [0.04, 0.17, 0.2, 0.22, 0.17, 0.06, 0.06, 0.08]),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [tr({ text: '4 Reliability', bold: true }, 28)] }),
    para([{ text: 'Predicted mean time between failures at 45 °C ambient: ' }, { text: `${Math.round(doc.reliability.years45)} years`, bold: true }, { text: ` (${Math.round(doc.reliability.fit45)} FIT; ${doc.reliability.parts} parts, ${doc.reliability.joints} solder joints; environment factor 2). Random failures only; wear-out parts are listed below with their planned maintenance.` }]),
    ...(doc.reliability.wear.length ? [table([['Part', 'Wears by', 'Life', 'Planned step'].map((t) => [{ text: t }]), ...doc.reliability.wear.map((x) => [[{ text: x.ref }], [{ text: x.what }], [{ text: x.life }], [{ text: x.action }]])], true)] : []),
  ];
  const docs: (Paragraph | Table)[] = doc.sections.flatMap((s, i) => [
    new Paragraph({ pageBreakBefore: i > 0, heading: HeadingLevel.HEADING_1, children: [tr({ text: `${i + 5} ${s.title}`, bold: true }, 28)] }),
    ...blocks(s.blocks),
  ]);
  // docx swaps the dimensions for a landscape page itself: they are given as for portrait
  const page = (size: { width: number; height: number }) => ({ page: { size: { orientation: PageOrientation.LANDSCAPE, width: size.height, height: size.width }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } });
  const d = new Document({
    creator: 'NETApps Electric Simulation', title: doc.title, description: doc.subtitle,
    numbering: { config: [{ reference: 'num', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT }] }] },
    sections: [
      { properties: page(A4L), children: text },
      { properties: page(A3L), children: schematic },
      { properties: page(A4L), children: bom },
      { properties: page(A4L), children: docs },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(d));
}
