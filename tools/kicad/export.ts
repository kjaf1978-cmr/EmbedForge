// Writes a worked design's board as a KiCad project (decision D43):
//   cd app/ui && npx vite-node ../../tools/kicad/export.ts <design> <out-dir>
// <design> is one of the names in DESIGNS (layouts.ts). The board file is board.kicad_pcb with
// its net classes in board.kicad_pro; nets.txt lists the board's nets and warnings.txt what
// the export found (pins without a pad, nets on one pad).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boardNetlist, kicadBoard, kicadRules, placement, padAt, type Placed } from '../../app/ui/src/pcb/kicad';
import { DESIGNS } from './layouts';
import { buildBom } from '../../app/ui/src/eda/bom';
import { costedBom, PRICE_NOTE } from '../../app/ui/src/eda/catalogue';

const [name, out] = process.argv.slice(2);
const d = DESIGNS[name];
if (!d || !out) {
  console.error(`usage: export.ts <design> <out-dir>; designs: ${Object.keys(DESIGNS).join(', ')}`);
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const sheet = d.sheet(), classes = d.classes(sheet);
const mains = new Set(classes.filter((c) => c.name === 'Mains' || c.name === 'HV').flatMap((c) => c.patterns.map((p) => p.slice(1, -1).replace(/\\(.)/g, '$1'))));
const nl = boardNetlist(sheet, { mains, panel: d.panel, heavy: new Set(d.heavy ?? []), bolted: d.bolted });
// a placement saved from an earlier run (placed.json, from the board after its placement) is kept
const pf = join(out, 'placed.json');
const placed = existsSync(pf) ? (JSON.parse(readFileSync(pf, 'utf8')) as Placed[]) : typeof d.plan === 'function' ? d.plan() : d.plan;
const b = kicadBoard(nl, { title: d.title, revision: d.revision, classes, w: d.w, h: d.h, placed, copperOz: d.copperOz, fill: d.fill, mains, region: d.region, tracks: d.tracks, zones: d.zones });
writeFileSync(join(out, 'board.kicad_pcb'), b.pcb);
writeFileSync(join(out, 'board.kicad_pro'), b.pro);
writeFileSync(join(out, 'board.kicad_dru'), kicadRules(classes));
// the pins of parts with both mains and other pads (relays, transformer connectors): each
// stage keeps its new tracks off the other side's pins (the pad plus 3.3 mm)
const pinKeep = (want: boolean): [number, number, number, number][] => {
  const r: [number, number, number, number][] = [];
  for (const p of nl.parts) {
    const ns = Object.values(p.pads);
    if (!ns.some((n) => mains.has(n)) || ns.every((n) => mains.has(n))) continue;
    const pl = b.placed.find((x) => x.ref === p.ref)!;
    for (const d of p.footprint.pads) {
      const n = p.pads[d.id];
      if (!n || mains.has(n) !== want) continue;
      const [x, y] = padAt(pl, d.x, d.y), e = Math.max(d.w, d.h) / 2 + 3.3;
      r.push([x - e, y - e, x + e, y + e]);
    }
  }
  return r;
};
// the zones for the two-stage routing (route.py): the mains zone is x < split
writeFileSync(join(out, 'zones.json'), JSON.stringify({ split: d.region ? d.region.x0 - 3 : placed ? undefined : placement.split, edge: d.edge ?? (placed ? undefined : placement.edge), keep1: [...(d.keep1 ?? []), ...pinKeep(false)], keep2: pinKeep(true), w: b.w, h: b.h, post: d.post }));
// the router's class-to-class clearances (route.py adds them to the Specctra file)
writeFileSync(join(out, 'apart.json'), JSON.stringify(classes.filter((c) => c.apart).map((c) => ({ cls: c.name, mm: c.apart }))));
writeFileSync(join(out, 'nets.txt'), nl.nets.join('\n') + '\n');
writeFileSync(join(out, 'panel.csv'), ['net;panel terminals;board connector;wire', ...nl.panel.map((w) => `${w.net};${w.ends.join(' ')};${w.board ?? ''};${d.wire?.(w.net, !!w.board, mains.has(w.net)) ?? ''}`)].join('\n') + '\n');
writeFileSync(join(out, 'warnings.txt'), nl.warnings.join('\n') + (nl.warnings.length ? '\n' : ''));
for (const c of classes) console.log(`class ${c.name}: ${c.patterns.length} nets, ${c.track} mm, clearance ${c.clearance} mm: ${c.patterns.map((p) => p.slice(1, -1)).join(' ')}`);
console.log(`${name}: ${nl.parts.length} parts, ${nl.nets.length} nets, board ${b.w} × ${b.h} mm, ${nl.warnings.length} warnings`);

// the parts list with procurement data (D29): the lines on this board first, then those off it
// (panel, chassis, the other board), each with the footprint it has here
const onBoard = new Map(nl.parts.map((p) => [p.ref, p.footprint.id]));
const where = (refs: string[]) => { for (const r of refs) { const k = onBoard.get(r) ?? onBoard.get(r.replace(/[A-Z]$/, '')); if (k) return k; } return ''; };
const costed = costedBom(buildBom(sheet)).lines.map((l) => ({ l, fp: where(l.refs) })).sort((a, b) => (a.fp ? 0 : 1) - (b.fp ? 0 : 1));
const cell = (x: string | number | null | undefined) => `"${String(x ?? '').replace(/"/g, '""')}"`;
const bomRows = [['on this board', 'qty', 'references', 'part', 'value', 'details', 'footprint', 'MPN', 'maker', 'distributors (order numbers)', 'unit EUR', 'total EUR', 'price basis'].map(cell).join(',')];
for (const { l, fp } of costed) bomRows.push([fp ? 'yes' : 'no', l.qty, l.refs.join(' '), l.part, l.value, l.details, fp, l.cat?.mpn, l.cat?.maker, l.cat?.offers.map((o) => `${o.distributor}${o.sku ? ` ${o.sku}` : ''}`).join('; '), l.unit?.toFixed(2), l.total?.toFixed(2), l.cat?.basis].map(cell).join(','));
const boardTotal = costed.filter((x) => x.fp).reduce((a, x) => a + (x.l.total ?? 0), 0);
bomRows.push('', cell(`Parts on this board: EUR ${boardTotal.toFixed(2)} (unit quantity). ${PRICE_NOTE}`));
writeFileSync(join(out, 'bom.csv'), bomRows.join('\n') + '\n');
