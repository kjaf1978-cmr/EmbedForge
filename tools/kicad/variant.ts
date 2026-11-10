// A variant on another design's board (P7: the 24 V inverter on the 48 V boards):
//   cd app/ui && npx vite-node ../../tools/kicad/variant.ts <board-design> <variant-design> <suffix>
// Checks that the variant has the same parts on the board, each with the same footprint and the
// same net on every pad (only values may differ), then writes the variant's parts list into the
// board's folder, hardware/<board-design>/<board-design>-bom-<suffix>.csv. Exits 1, writing
// nothing, if the variant does not fit the board.
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { boardNetlist } from '../../app/ui/src/pcb/kicad';
import { DESIGNS } from './layouts';
import { bomCsv } from './bom';

const [base, variant, suffix] = process.argv.slice(2);
if (!DESIGNS[base] || !DESIGNS[variant] || !suffix) {
  console.error('usage: variant.ts <board-design> <variant-design> <suffix>');
  process.exit(2);
}
const netlist = (name: string) => {
  const d = DESIGNS[name], sheet = d.sheet(), classes = d.classes(sheet);
  const mains = new Set(classes.filter((c) => c.name === 'Mains' || c.name === 'HV').flatMap((c) => c.patterns.map((p) => p.slice(1, -1).replace(/\\(.)/g, '$1'))));
  return { sheet, nl: boardNetlist(sheet, { mains, panel: d.panel, heavy: new Set(d.heavy ?? []), bolted: d.bolted, block: d.block }) };
};
const a = netlist(base), b = netlist(variant);
const key = (nl: ReturnType<typeof boardNetlist>) => new Map(nl.parts.map((p) => [p.ref, JSON.stringify([p.footprint.id, Object.entries(p.pads).sort()])]));
const ka = key(a.nl), kb = key(b.nl), bad: string[] = [];
for (const r of new Set([...ka.keys(), ...kb.keys()])) if (ka.get(r) !== kb.get(r)) bad.push(`${r}: ${ka.get(r) ?? 'missing'} / ${kb.get(r) ?? 'missing'}`);
if (bad.length) {
  console.error(`${variant} does not fit the ${base} board:\n${bad.join('\n')}`);
  process.exit(1);
}
const dir = join(__dirname, '..', '..', 'hardware', base);
if (!existsSync(dir)) { console.error(`no ${dir}: package the board first`); process.exit(1); }
const out = join(dir, `${base}-bom-${suffix}.csv`);
writeFileSync(out, bomCsv(b.sheet, b.nl));
console.log(`${variant} fits the ${base} board (${a.nl.parts.length} parts, same footprints and nets): ${out}`);
