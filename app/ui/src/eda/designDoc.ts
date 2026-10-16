// The design document of a schematic (decision D29): description, the full schematic, the parts
// list with procurement data and cost, the reliability prediction, and the documentation that
// belongs to the design (its DFMEA, maintenance and FAQ) at the end. Rendered to PDF (docPdf.ts)
// and Word (docDocx.ts).

import { buildBom } from './bom';
import { costedBom, PRICE_NOTE, type CostedLine } from './catalogue';
import { mdSection, parseMd, runs, type Block } from './md';
import { reliability } from './reliability';
import type { Sheet } from './schematic';
import { sheetBounds } from './editor';
import dfmeaMd from '../../../../docs/inc3/DFMEA.md?raw';
import reliabilityMd from '../../../../docs/inc3/RELIABILITY.md?raw';
import maintenanceMd from '../docs/power-maintenance.md?raw';

export interface DocSection { title: string; blocks: Block[] }
export interface DesignDocModel {
  title: string;
  subtitle: string;
  date: string;
  intro: Block[];
  sheet: Sheet;
  bom: { lines: CostedLine[]; total: number; total100: number; missing: number; note: string };
  reliability: { years45: number; fit45: number; parts: number; joints: number; wear: { ref: string; what: string; life: string; action: string }[] };
  sections: DocSection[];
}

/** Documentation by id: "dfmea:<heading>" a section of DFMEA.md, "reliability" the method and
 *  results, "help:power-maintenance" the maintenance page with its FAQ. */
export function docSource(id: string): DocSection | null {
  if (id.startsWith('dfmea:')) {
    const md = mdSection(dfmeaMd, id.slice(6));
    const method = mdSection(dfmeaMd, '1. Method');
    return md ? { title: 'Design FMEA', blocks: parseMd(`${method}\n\n${md}`) } : null;
  }
  if (id === 'reliability') return { title: 'Reliability prediction: method', blocks: parseMd(mdSection(reliabilityMd, '1. Method')) };
  if (id === 'help:power-maintenance') return { title: 'Diagnostics, maintenance and FAQ', blocks: parseMd(maintenanceMd) };
  return null;
}

/** The design document of a sheet; `name` is the project or example name. */
export function designDoc(sheet: Sheet, name: string, version: string, date = new Date().toISOString().slice(0, 10)): DesignDocModel {
  const info = sheet.info ?? {};
  // the sheet's notes, joined into paragraphs: a paragraph is lines at one x, 16 apart
  const notes = sheet.labels.filter((l) => l.note).sort((a, b) => a.x - b.x || a.y - b.y);
  const intro: Block[] = [];
  if (info.summary) intro.push({ t: 'p', runs: runs(info.summary) });
  const groups: { x: number; y: number; text: string; last: number }[] = [];
  for (const n of notes) {
    const g = groups.find((q) => q.x === n.x && n.y - q.last <= 16 && n.y > q.last);
    if (g) { g.text += ` ${n.name}`; g.last = n.y; } else groups.push({ x: n.x, y: n.y, text: n.name, last: n.y });
  }
  const paras = groups.sort((a, b) => a.y - b.y || a.x - b.x).map((g) => g.text);
  for (const p of paras) intro.push({ t: 'p', runs: runs(p) });
  const lines = buildBom(sheet);
  const one = costedBom(lines, 1), batch = costedBom(lines, 100);
  const rel = reliability(sheet, 45);
  const sections = (info.docs ?? []).map(docSource).filter((x): x is DocSection => !!x);
  return {
    title: info.title || name,
    subtitle: `Design document · ${name} · NETApps Electric Simulation ${version}`,
    date,
    intro,
    sheet,
    bom: { lines: one.lines, total: one.total, total100: batch.total, missing: one.missing, note: PRICE_NOTE },
    reliability: { years45: rel.mtbfYears, fit45: rel.fit, parts: rel.rows.length, joints: rel.joints, wear: rel.wear.map((w) => ({ ref: w.ref, what: w.what, life: w.life, action: w.action })) },
    sections,
  };
}

export interface Tile { name: string; x0: number; y0: number; w: number; h: number }

/** The sheet's area (with a margin) and its division into tiles of w × h units that hold
 *  something: the enlarged pages of the schematic, named A1, A2 … (row letter, column number). */
export function schematicTiles(sheet: Sheet, tw: number, th: number): { view: { x0: number; y0: number; w: number; h: number }; tiles: Tile[] } {
  const b = sheetBounds(sheet) ?? { x0: 0, y0: 0, x1: 100, y1: 100 };
  const pad = 30, view = { x0: b.x0 - pad, y0: b.y0 - pad, w: b.x1 - b.x0 + 2 * pad, h: b.y1 - b.y0 + 2 * pad };
  const nx = Math.max(1, Math.ceil(view.w / tw)), ny = Math.max(1, Math.ceil(view.h / th));
  const tiles: Tile[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x0 = view.x0 + i * tw, y0 = view.y0 + j * th;
    const has = sheet.parts.some((p) => p.x >= x0 && p.x < x0 + tw && p.y >= y0 && p.y < y0 + th)
      || sheet.wires.some((wr) => Math.min(wr.a.x, wr.b.x) < x0 + tw && Math.max(wr.a.x, wr.b.x) >= x0 && Math.min(wr.a.y, wr.b.y) < y0 + th && Math.max(wr.a.y, wr.b.y) >= y0);
    if (has) tiles.push({ name: `${String.fromCharCode(65 + j)}${i + 1}`, x0, y0, w: Math.min(tw, view.x0 + view.w - x0), h: Math.min(th, view.y0 + view.h - y0) });
  }
  return { view, tiles };
}
