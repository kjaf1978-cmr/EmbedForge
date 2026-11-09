// Writes a worked design's board as a KiCad project (decision D43):
//   cd app/ui && npx vite-node ../../tools/kicad/export.ts <design> <out-dir>
// <design> is one of the names in DESIGNS (layouts.ts). The board file is board.kicad_pcb with
// its net classes in board.kicad_pro; nets.txt lists the board's nets and warnings.txt what
// the export found (pins without a pad, nets on one pad).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boardNetlist, kicadBoard, kicadRules, placement, padAt, type Placed } from '../../app/ui/src/pcb/kicad';
import { DESIGNS } from './layouts';

const [name, out] = process.argv.slice(2);
const d = DESIGNS[name];
if (!d || !out) {
  console.error(`usage: export.ts <design> <out-dir>; designs: ${Object.keys(DESIGNS).join(', ')}`);
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const sheet = d.sheet(), classes = d.classes(sheet);
const mains = new Set(classes.filter((c) => c.name === 'Mains' || c.name === 'HV').flatMap((c) => c.patterns.map((p) => p.slice(1, -1).replace(/\\(.)/g, '$1'))));
const nl = boardNetlist(sheet, { mains, panel: d.panel });
// a placement saved from an earlier run (placed.json, from the board after its placement) is kept
const pf = join(out, 'placed.json');
const placed = existsSync(pf) ? (JSON.parse(readFileSync(pf, 'utf8')) as Placed[]) : d.plan;
const b = kicadBoard(nl, { title: d.title, revision: d.revision, classes, w: d.w, h: d.h, placed, copperOz: d.copperOz, fill: d.fill, mains, region: d.region, tracks: d.tracks });
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
writeFileSync(join(out, 'zones.json'), JSON.stringify({ split: d.region ? d.region.x0 - 3 : placed ? undefined : placement.split, edge: d.edge ?? (placed ? undefined : placement.edge), keep1: [...(d.keep1 ?? []), ...pinKeep(false)], keep2: pinKeep(true), w: b.w, h: b.h }));
// the router's class-to-class clearances (route.py adds them to the Specctra file)
writeFileSync(join(out, 'apart.json'), JSON.stringify(classes.filter((c) => c.apart).map((c) => ({ cls: c.name, mm: c.apart }))));
writeFileSync(join(out, 'nets.txt'), nl.nets.join('\n') + '\n');
writeFileSync(join(out, 'panel.csv'), ['net;panel terminals;board connector;wire', ...nl.panel.map((w) => `${w.net};${w.ends.join(' ')};${w.board ?? ''};${d.wire?.(w.net, !!w.board, mains.has(w.net)) ?? ''}`)].join('\n') + '\n');
writeFileSync(join(out, 'warnings.txt'), nl.warnings.join('\n') + (nl.warnings.length ? '\n' : ''));
for (const c of classes) console.log(`class ${c.name}: ${c.patterns.length} nets, ${c.track} mm, clearance ${c.clearance} mm: ${c.patterns.map((p) => p.slice(1, -1)).join(' ')}`);
console.log(`${name}: ${nl.parts.length} parts, ${nl.nets.length} nets, board ${b.w} × ${b.h} mm, ${nl.warnings.length} warnings`);
