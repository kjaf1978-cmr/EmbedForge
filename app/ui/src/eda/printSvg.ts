// A schematic sheet as a standalone SVG document (vector: it prints at any scale without loss).
// Used by the design-document export and by tests; the live canvas draws the same symbols.

import { connectivity } from './connectivity';
import { labelPos, sheetBounds } from './editor';
import { pinPositions, valueText, type Sheet } from './schematic';
import { symbolOf, type Gfx } from './symbols';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const INK = '#1a1a1a', PART = '#8b1a1a', WIRE = '#1f5f1f', LABEL = '#1a3d8b', NOTE = '#444444';

function gfxSvg(g: Gfx): string {
  const fill = (f?: string) => (!f || f === 'none' ? 'none' : f === 'fg' ? PART : f === 'bg' ? '#fffbe8' : f);
  if (g.t === 'path') return `<path d="${g.d}" fill="${fill(g.fill)}" stroke="${PART}" stroke-width="${g.w ?? 1.5}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (g.t === 'circle') return `<circle cx="${g.cx}" cy="${g.cy}" r="${g.r}" fill="${fill(g.fill)}" stroke="${PART}" stroke-width="1.5"/>`;
  return `<text x="${g.x}" y="${g.y}" font-size="${g.size ?? 9}" text-anchor="middle" fill="${PART}">${esc(g.s)}</text>`;
}

/** The sheet as SVG; `title` goes into a title block at the bottom right. */
export function sheetSvg(sheet: Sheet, title = ''): string {
  const conn = connectivity(sheet);
  const b = sheetBounds(sheet) ?? { x0: -100, y0: -100, x1: 100, y1: 100 };
  const pad = 40, tb = title ? 40 : 0;
  const x0 = b.x0 - pad, y0 = b.y0 - pad, w = b.x1 - b.x0 + 2 * pad, h = b.y1 - b.y0 + 2 * pad + tb;
  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${w}" height="${h}" font-family="Arial, Helvetica, sans-serif">`);
  out.push(`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#ffffff"/>`);
  for (const wr of sheet.wires) out.push(`<line x1="${wr.a.x}" y1="${wr.a.y}" x2="${wr.b.x}" y2="${wr.b.y}" stroke="${WIRE}" stroke-width="1.5" stroke-linecap="round"/>`);
  for (const j of conn.junctions) out.push(`<circle cx="${j.x}" cy="${j.y}" r="3" fill="${WIRE}"/>`);
  for (const p of sheet.parts) {
    const s = symbolOf(p.sym);
    out.push(`<g transform="translate(${p.x} ${p.y}) rotate(${p.rot * 90}) scale(${p.mirror ? -1 : 1} 1)">${s.gfx(p.props).map(gfxSvg).join('')}</g>`);
    const vt = valueText(p);
    if (!s.power) {
      const r = labelPos(p, 'ref');
      out.push(`<text x="${r.at.x}" y="${r.at.y}" text-anchor="${r.anchor}" font-size="9" font-weight="bold" fill="${INK}">${esc(p.ref)}</text>`);
      for (const pp of pinPositions(p)) if (!conn.pinNet.has(`${p.ref}.${pp.pin}`) && !s.pins.find((q) => q.id === pp.pin)?.optional) out.push(`<circle cx="${pp.at.x}" cy="${pp.at.y}" r="2" fill="none" stroke="#c00"/>`);
    }
    if (vt) {
      const v = labelPos(p, 'val');
      out.push(`<text x="${v.at.x}" y="${v.at.y}" text-anchor="${v.anchor}" font-size="8" fill="${s.power ? LABEL : INK}">${esc(vt)}</text>`);
    }
  }
  for (const l of sheet.labels) {
    if (l.note) out.push(`<text x="${l.x}" y="${l.y - 2}" font-size="10" fill="${NOTE}">${esc(l.name)}</text>`);
    else out.push(`<rect x="${l.x - 1.5}" y="${l.y - 1.5}" width="3" height="3" fill="${LABEL}"/><text x="${l.x + 3}" y="${l.y - 4}" font-size="8" fill="${LABEL}">${esc(l.name)}</text>`);
  }
  if (title) {
    const tx = x0 + w - 320, ty = y0 + h - tb;
    out.push(`<rect x="${tx}" y="${ty}" width="310" height="${tb - 8}" fill="none" stroke="${INK}"/><text x="${tx + 8}" y="${ty + 20}" font-size="12" fill="${INK}">${esc(title)}</text>`);
  }
  out.push('</svg>');
  return out.join('\n');
}
