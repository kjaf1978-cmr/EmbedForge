// PDF of a design document (D29). The schematic is drawn as vector graphics (it prints at any
// scale without loss): an overview page and enlarged A3 tiles at a readable scale. Text uses an
// embedded font (DejaVu Sans), so every symbol of the designs (Ω, µ, ≥, …) prints.

import { PDFDocument, rgb, type PDFFont, type PDFPage, pushGraphicsState, popGraphicsState, rectangle, clip, endPath, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { connectivity } from './connectivity';
import { labelPos } from './editor';
import { pinPositions, valueText, type Part, type Sheet } from './schematic';
import { symbolOf, type Gfx } from './symbols';
import type { Block, Run } from './md';
import { schematicTiles, type DesignDocModel } from './designDoc';

export interface Fonts { regular: Uint8Array; bold: Uint8Array }

const A4L: [number, number] = [842, 595], A3L: [number, number] = [1191, 842];
const M = 40; // page margin (pt)
const hex = (h: string): RGB => { const v = h.replace('#', ''); const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const INK = hex('#1a1a1a'), PART = hex('#8b1a1a'), WIRE = hex('#1f5f1f'), LABEL = hex('#1a3d8b'), NOTE = hex('#444444'), GREY = hex('#888888'), LIGHT = hex('#eeeeee');

// ---- symbol paths: transform a part's local path into sheet coordinates

function xf(p: Pick<Part, 'x' | 'y' | 'rot' | 'mirror'>, x: number, y: number): [number, number] {
  let a = p.mirror ? -x : x, b = y;
  for (let k = 0; k < p.rot; k++) [a, b] = [-b, a];
  return [p.x + a, p.y + b];
}

/** An SVG path (absolute M L H V A Q C Z) in sheet coordinates. */
export function transformPath(d: string, p: Pick<Part, 'x' | 'y' | 'rot' | 'mirror'>): string {
  const tok = d.match(/[MLHVAQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let i = 0, cx = 0, cy = 0;
  const out: string[] = [];
  const n = () => Number(tok[i++]);
  let cmd = '';
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    const pt = (x: number, y: number) => { const [a, b] = xf(p, x, y); return `${+a.toFixed(2)} ${+b.toFixed(2)}`; };
    switch (cmd) {
      case 'M': case 'L': { const x = n(), y = n(); cx = x; cy = y; out.push(`${cmd} ${pt(x, y)}`); if (cmd === 'M') cmd = 'L'; break; }
      case 'H': { cx = n(); out.push(`L ${pt(cx, cy)}`); break; }
      case 'V': { cy = n(); out.push(`L ${pt(cx, cy)}`); break; }
      case 'Q': { const x1 = n(), y1 = n(), x = n(), y = n(); cx = x; cy = y; out.push(`Q ${pt(x1, y1)} ${pt(x, y)}`); break; }
      case 'C': { const x1 = n(), y1 = n(), x2 = n(), y2 = n(), x = n(), y = n(); cx = x; cy = y; out.push(`C ${pt(x1, y1)} ${pt(x2, y2)} ${pt(x, y)}`); break; }
      case 'A': {
        let rx = n(), ry = n(); const rotA = n(), large = n(); let sweep = n(); const x = n(), y = n();
        if (p.rot % 2) [rx, ry] = [ry, rx];
        if (p.mirror) sweep = 1 - sweep;
        cx = x; cy = y;
        out.push(`A ${rx} ${ry} ${p.mirror ? -rotA : rotA} ${large} ${sweep} ${pt(x, y)}`);
        break;
      }
      case 'Z': case 'z': out.push('Z'); break;
      default: i++;
    }
  }
  return out.join(' ');
}

interface View { ox: number; oy: number; k: number; vx0: number; vy0: number; H: number }

function drawSheet(page: PDFPage, sheet: Sheet, v: View, f: { regular: PDFFont; bold: PDFFont }) {
  const conn = connectivity(sheet);
  const X = (x: number) => v.ox + (x - v.vx0) * v.k, Y = (y: number) => v.H - (v.oy + (y - v.vy0) * v.k);
  const lw = Math.max(0.35, 1.2 * v.k);
  for (const w of sheet.wires) page.drawLine({ start: { x: X(w.a.x), y: Y(w.a.y) }, end: { x: X(w.b.x), y: Y(w.b.y) }, thickness: lw, color: WIRE });
  for (const j of conn.junctions) page.drawCircle({ x: X(j.x), y: Y(j.y), size: 2.6 * v.k, color: WIRE });
  const svgOpts = { x: v.ox - v.vx0 * v.k, y: v.H - v.oy + v.vy0 * v.k, scale: v.k };
  const text = (s: string, x: number, y: number, size: number, anchor: 'start' | 'middle' | 'end', color: RGB, bold = false) => {
    const font = bold ? f.bold : f.regular, sz = size * v.k, w = font.widthOfTextAtSize(s, sz);
    page.drawText(s, { x: X(x) - (anchor === 'middle' ? w / 2 : anchor === 'end' ? w : 0), y: Y(y), size: sz, font, color });
  };
  for (const p of sheet.parts) {
    const s = symbolOf(p.sym);
    for (const g of s.gfx(p.props) as Gfx[]) {
      if (g.t === 'path') {
        const fill = !g.fill || g.fill === 'none' ? undefined : g.fill === 'fg' ? PART : g.fill === 'bg' ? hex('#fffbe8') : hex(g.fill);
        page.drawSvgPath(transformPath(g.d, p), { ...svgOpts, borderColor: PART, borderWidth: (g.w ?? 1.5) * v.k, color: fill });
      } else if (g.t === 'circle') {
        const [cx, cy] = xf(p, g.cx, g.cy);
        const fill = !g.fill || g.fill === 'none' ? undefined : g.fill === 'fg' ? PART : g.fill === 'bg' ? hex('#fffbe8') : hex(g.fill);
        page.drawCircle({ x: X(cx), y: Y(cy), size: g.r * v.k, borderColor: PART, borderWidth: 1.5 * v.k, color: fill });
      } else {
        const [tx, ty] = xf(p, g.x, g.y);
        text(g.s, tx, ty, g.size ?? 9, 'middle', PART);
      }
    }
    const vt = valueText(p);
    if (!s.power) {
      const r = labelPos(p, 'ref');
      text(p.ref, r.at.x, r.at.y, 9, r.anchor, INK, true);
      for (const pp of pinPositions(p)) if (!conn.pinNet.has(`${p.ref}.${pp.pin}`) && !s.pins.find((q) => q.id === pp.pin)?.optional) page.drawCircle({ x: X(pp.at.x), y: Y(pp.at.y), size: 2 * v.k, borderColor: hex('#cc0000'), borderWidth: 0.5 });
    }
    if (vt) { const l = labelPos(p, 'val'); text(vt, l.at.x, l.at.y, 8, l.anchor, s.power ? LABEL : INK); }
  }
  for (const l of sheet.labels) {
    if (l.note) text(l.name, l.x, l.y - 2, 10, 'start', NOTE);
    else { page.drawRectangle({ x: X(l.x) - 1.5 * v.k, y: Y(l.y) - 1.5 * v.k, width: 3 * v.k, height: 3 * v.k, color: LABEL }); text(l.name, l.x + 3, l.y - 4, 8, 'start', LABEL); }
  }
}

// ---- text layout

class Writer {
  pdf: PDFDocument; f: { regular: PDFFont; bold: PDFFont };
  page!: PDFPage; y = 0; size: [number, number] = A4L; pageNo = 0; title: string;
  constructor(pdf: PDFDocument, f: { regular: PDFFont; bold: PDFFont }, title: string) { this.pdf = pdf; this.f = f; this.title = title; }
  newPage(size: [number, number] = A4L) {
    this.size = size;
    this.page = this.pdf.addPage(size);
    this.pageNo++;
    this.y = size[1] - M;
    this.page.drawText(`${this.title} — page ${this.pageNo}`, { x: M, y: 18, size: 7, font: this.f.regular, color: GREY });
  }
  need(h: number) { if (this.y - h < M) this.newPage(this.size); }
  /** Wrapped runs at x, width w; returns the lines' layout without drawing when dry. */
  lines(rs: Run[], size: number, w: number): { text: string; bold: boolean }[][] {
    const words: { text: string; bold: boolean }[] = [];
    for (const r of rs) for (const [k, part] of r.text.split(/(\s+)/).entries()) if (part && !/^\s+$/.test(part)) words.push({ text: part, bold: !!r.bold }); else if (part && k) words.push({ text: ' ', bold: false });
    const out: { text: string; bold: boolean }[][] = [[]];
    let lw = 0;
    const width = (t: { text: string; bold: boolean }) => (t.bold ? this.f.bold : this.f.regular).widthOfTextAtSize(t.text, size);
    for (const wd of words) {
      if (wd.text === ' ') { if (out[out.length - 1].length) { out[out.length - 1].push(wd); lw += width(wd); } continue; }
      const ww = width(wd);
      if (lw + ww > w && out[out.length - 1].length) {
        const line = out[out.length - 1];
        while (line.length && line[line.length - 1].text === ' ') line.pop();
        out.push([]); lw = 0;
      }
      // a word longer than the line is cut
      if (ww > w) { let t = wd.text; while (t.length) { let n = t.length; while (n > 1 && width({ text: t.slice(0, n), bold: wd.bold }) > w) n--; out[out.length - 1].push({ text: t.slice(0, n), bold: wd.bold }); t = t.slice(n); if (t.length) { out.push([]); } } lw = 0; continue; }
      out[out.length - 1].push(wd); lw += ww;
    }
    return out.filter((l) => l.length);
  }
  drawLines(ls: { text: string; bold: boolean }[][], x: number, size: number, lead: number, color = INK) {
    for (const l of ls) {
      this.need(lead);
      let cx = x;
      for (const t of l) { const font = t.bold ? this.f.bold : this.f.regular; this.page.drawText(t.text, { x: cx, y: this.y - size, size, font, color }); cx += font.widthOfTextAtSize(t.text, size); }
      this.y -= lead;
    }
  }
  para(rs: Run[], size = 9.5, indent = 0, after = 5) {
    const w = this.size[0] - 2 * M - indent;
    this.drawLines(this.lines(rs, size, w), M + indent, size, size * 1.35);
    this.y -= after;
  }
  heading(rs: Run[], level: number) {
    const size = level <= 1 ? 17 : level === 2 ? 13.5 : 11;
    this.need(size * 3);
    this.y -= level <= 2 ? 8 : 4;
    this.drawLines(this.lines(rs.map((r) => ({ ...r, bold: true })), size, this.size[0] - 2 * M), M, size, size * 1.3);
    this.y -= 4;
  }
  table(rows: Run[][][], header: boolean, widths?: number[], size = 7.5) {
    const cols = Math.max(...rows.map((r) => r.length));
    const W = this.size[0] - 2 * M;
    // column widths: by content length unless given
    let ws = widths;
    if (!ws) {
      // at least the longest word of each column, the rest shared by the amount of text
      const pad2 = 6;
      const minW = Array.from({ length: cols }, (_, c) => Math.max(14, ...rows.map((r) => Math.max(0, ...(r[c] ?? []).flatMap((x) => x.text.split(/\s+/)).map((wd) => this.f.bold.widthOfTextAtSize(wd, size)))) ) + pad2);
      const len = Array.from({ length: cols }, (_, c) => Math.max(1, ...rows.map((r) => Math.min(80, (r[c] ?? []).map((x) => x.text).join('').length))));
      const free = Math.max(0, W - minW.reduce((a, b) => a + b, 0)), sum = len.reduce((a, b) => a + b, 0);
      ws = minW.map((m, c) => m + (free * len[c]) / sum);
      const tot = ws.reduce((a, b) => a + b, 0);
      if (tot > W) ws = ws.map((x) => (x * W) / tot);
    }
    const pad = 3, lead = size * 1.3;
    const drawRow = (r: Run[][], bold: boolean, shade: boolean) => {
      const cells = ws!.map((w, c) => this.lines((r[c] ?? []).map((x) => ({ ...x, bold: bold || x.bold })), size, w - 2 * pad));
      const h = Math.max(1, ...cells.map((l) => l.length)) * lead + 2 * pad;
      if (this.y - h < M) { this.newPage(this.size); if (header && r !== rows[0]) drawRow(rows[0], true, true); }
      if (shade) this.page.drawRectangle({ x: M, y: this.y - h, width: W, height: h, color: LIGHT });
      let x = M;
      cells.forEach((ls, c) => {
        let y = this.y - pad;
        for (const l of ls) { let cx = x + pad; for (const t of l) { const font = t.bold ? this.f.bold : this.f.regular; this.page.drawText(t.text, { x: cx, y: y - size, size, font, color: INK }); cx += font.widthOfTextAtSize(t.text, size); } y -= lead; }
        x += ws![c];
      });
      this.page.drawLine({ start: { x: M, y: this.y - h }, end: { x: M + W, y: this.y - h }, thickness: 0.3, color: GREY });
      this.y -= h;
    };
    rows.forEach((r, i) => drawRow(r, header && i === 0, header && i === 0));
    this.y -= 6;
  }
  blocks(bs: Block[]) {
    for (const b of bs) {
      if (b.t === 'h') this.heading(b.runs, Math.min(3, b.level + 1));
      else if (b.t === 'p') this.para(b.runs);
      else if (b.t === 'li') {
        const w = this.size[0] - 2 * M - 14;
        const ls = this.lines(b.runs, 9.5, w);
        this.need(13);
        this.page.drawText(b.ordered ? `${b.n}.` : '•', { x: M + 3, y: this.y - 9.5, size: 9.5, font: this.f.regular, color: INK });
        this.drawLines(ls, M + 14, 9.5, 12.8);
        this.y -= 2;
      } else this.table(b.rows, b.header);
    }
  }
}

const eur = (v: number | null) => (v === null ? '—' : v.toFixed(2));

/** The design document as a PDF file. */
export async function designPdf(doc: DesignDocModel, fonts: Fonts): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(doc.title); pdf.setSubject(doc.subtitle); pdf.setCreator('NETApps Electric Simulation'); pdf.setProducer('NETApps Electric Simulation (pdf-lib)');
  const f = { regular: await pdf.embedFont(fonts.regular, { subset: true }), bold: await pdf.embedFont(fonts.bold, { subset: true }) };
  const w = new Writer(pdf, f, doc.title);

  // title page and description
  w.newPage();
  w.y -= 80;
  w.heading([{ text: doc.title }], 1);
  w.para([{ text: doc.subtitle }], 11);
  w.para([{ text: `Date: ${doc.date}` }], 10);
  w.y -= 10;
  w.para([{ text: 'Contents: 1 Description · 2 Schematic · 3 Bill of materials · 4 Reliability · ' }, { text: doc.sections.map((s, i) => `${i + 5} ${s.title}`).join(' · ') }], 10);
  w.heading([{ text: '1 Description' }], 2);
  w.blocks(doc.intro);

  // schematic: overview, then tiles at 0.8 pt per unit (8-unit text prints at 6.4 pt)
  const [PW, PH] = A3L, top = 50, aw = PW - 2 * M, ah = PH - top - M, k = 0.8;
  const { view, tiles } = schematicTiles(doc.sheet, aw / k, ah / k);
  w.newPage(A3L);
  w.page.drawText('2 Schematic — overview (the following pages show it enlarged, tile by tile)', { x: M, y: PH - 34, size: 13, font: f.bold, color: INK });
  const k0 = Math.min(aw / view.w, ah / view.h);
  drawSheet(w.page, doc.sheet, { ox: M, oy: top, k: k0, vx0: view.x0, vy0: view.y0, H: PH }, f);
  for (const t of tiles) {
    const gx = M + (t.x0 - view.x0) * k0, gy = PH - top - (t.y0 - view.y0) * k0;
    w.page.drawRectangle({ x: gx, y: gy - t.h * k0, width: t.w * k0, height: t.h * k0, borderColor: GREY, borderWidth: 0.4, borderDashArray: [3, 3] });
    w.page.drawText(t.name, { x: gx + 3, y: gy - 10, size: 8, font: f.bold, color: GREY });
  }
  for (const t of tiles) {
    w.newPage(A3L);
    w.page.drawText(`2 Schematic — tile ${t.name} (of the overview grid)`, { x: M, y: PH - 34, size: 13, font: f.bold, color: INK });
    w.page.pushOperators(pushGraphicsState(), rectangle(M, M, aw, ah), clip(), endPath());
    drawSheet(w.page, doc.sheet, { ox: M, oy: top, k, vx0: t.x0, vy0: t.y0, H: PH }, f);
    w.page.pushOperators(popGraphicsState());
    w.page.drawRectangle({ x: M, y: M, width: aw, height: ah, borderColor: GREY, borderWidth: 0.5 });
  }

  // bill of materials
  w.newPage();
  w.heading([{ text: '3 Bill of materials' }], 2);
  w.para([{ text: `${doc.bom.lines.reduce((a, l) => a + l.qty, 0)} parts in ${doc.bom.lines.length} lines. Component cost of one unit: ` }, { text: `€ ${doc.bom.total.toFixed(2)}`, bold: true }, { text: ` at single-unit prices, € ${doc.bom.total100.toFixed(2)} at 100-piece prices (printed circuit board, enclosure, heatsinks and wiring not included).` }]);
  w.para([{ text: doc.bom.note }], 8);
  const W = A4L[0] - 2 * M;
  const head: Run[][] = ['Qty', 'References', 'Part', 'Manufacturer and part number', 'Where to buy (order number)', 'Price', '€ each', '€ total'].map((t) => [{ text: t }]);
  const rows: Run[][][] = [head, ...doc.bom.lines.map((l) => [
    [{ text: String(l.qty) }], [{ text: l.refs.join(' ') }], [{ text: `${l.part} ${l.value}`.trim() }, ...(l.details ? [{ text: ` (${l.details})` }] : [])],
    [{ text: l.cat ? `${l.cat.maker}: ${l.cat.mpn}` : '—', bold: false }, ...(l.cat?.note ? [{ text: `. ${l.cat.note}` }] : [])],
    [{ text: l.cat ? l.cat.offers.map((o) => (o.sku ? `${o.distributor} ${o.sku}` : o.distributor)).join('; ') : '—' }],
    [{ text: l.cat?.basis ?? '' }], [{ text: eur(l.unit) }], [{ text: eur(l.total) }],
  ])];
  rows.push([[{ text: '' }], [{ text: '' }], [{ text: 'Total (one unit)', bold: true }], [{ text: '' }], [{ text: '' }], [{ text: '' }], [{ text: '' }], [{ text: doc.bom.total.toFixed(2), bold: true }]]);
  w.table(rows, true, [0.04, 0.17, 0.2, 0.22, 0.17, 0.06, 0.06, 0.08].map((x) => x * W), 7);

  // reliability
  w.heading([{ text: '4 Reliability' }], 2);
  w.para([{ text: `Predicted mean time between failures at 45 °C ambient: ` }, { text: `${Math.round(doc.reliability.years45)} years`, bold: true }, { text: ` (${Math.round(doc.reliability.fit45)} FIT; ${doc.reliability.parts} parts, ${doc.reliability.joints} solder joints; environment factor 2). Random failures only; wear-out parts are listed below with their planned maintenance.` }]);
  if (doc.reliability.wear.length) {
    const head4: Run[][] = ['Part', 'Wears by', 'Life', 'Planned step'].map((t) => [{ text: t }]);
    w.table([head4, ...doc.reliability.wear.map((x) => [[{ text: x.ref }], [{ text: x.what }], [{ text: x.life }], [{ text: x.action }]])], true, [0.1, 0.45, 0.15, 0.3].map((x) => x * W));
  }

  // documentation at the end
  doc.sections.forEach((s, i) => {
    w.newPage();
    w.heading([{ text: `${i + 5} ${s.title}` }], 2);
    w.blocks(s.blocks);
  });
  return pdf.save();
}
