// Checks every board in hardware/ against its schematic as the app builds it now (task: board =
// schematic): the same parts and footprints, every pad on the same net, and the board's parts
// list current.
//   cd app/ui && npx vite-node ../../tools/kicad/check.ts [--fix-bom]
// Prints one line per board; exit code 1 when a board's parts or nets differ.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { boardNetlist } from '../../app/ui/src/pcb/kicad';
import { DESIGNS } from './layouts';
import { bomCsv } from './bom';

const HW = join(__dirname, '..', '..', 'hardware');
const fixBom = process.argv.includes('--fix-bom');
let bad = 0;
for (const [name, d] of Object.entries(DESIGNS)) {
  const pcbFile = join(HW, name, `${name}.kicad_pcb`);
  if (!existsSync(pcbFile)) { console.log(`${name}: no board in hardware/`); continue; }
  const sheet = d.sheet(), classes = d.classes(sheet);
  const mains = new Set(classes.filter((c) => c.name === 'Mains' || c.name === 'HV').flatMap((c) => c.patterns.map((p) => p.slice(1, -1).replace(/\\(.)/g, '$1'))));
  const nl = boardNetlist(sheet, { mains, panel: d.panel, heavy: new Set(d.heavy ?? []), bolted: d.bolted, block: d.block, bondSpare: d.bondSpare });
  // the board: each footprint's reference and its pads' nets
  const pcb = readFileSync(pcbFile, 'utf8');
  const onBoard = new Map<string, Record<string, string>>(), fpOf = new Map<string, string>();
  for (const fp of pcb.split('\n  (footprint ').slice(1)) {
    const ref = fp.match(/\(fp_text reference "([^"]+)"/)?.[1] ?? fp.match(/\(property "Reference" "([^"]+)"/)?.[1];
    if (!ref) continue;
    const pads: Record<string, string> = {};
    for (const m of fp.matchAll(/\(pad "([^"]*)"[^\n]*(?:\n(?!\s*\(pad )[^\n]*)*?\(net \d+ "([^"]*)"\)/g)) pads[m[1]] = m[2];
    onBoard.set(ref, pads);
    fpOf.set(ref, fp.match(/^"(?:[^":]*:)?([^"]+)"/)?.[1] ?? '');
  }
  const want = new Map(nl.parts.map((p) => [p.ref, p.pads]));
  const diffs: string[] = [];
  for (const r of want.keys()) if (!onBoard.has(r)) diffs.push(`${r} missing on the board`);
  for (const r of onBoard.keys()) if (!want.has(r)) diffs.push(`${r} on the board, not in the schematic`);
  for (const p of nl.parts) if (fpOf.has(p.ref) && fpOf.get(p.ref) !== p.footprint.id) diffs.push(`${p.ref}: footprint ${fpOf.get(p.ref)} on the board, ${p.footprint.id} in the schematic`);
  for (const [r, pads] of want) {
    const got = onBoard.get(r);
    if (!got) continue;
    for (const [pad, net] of Object.entries(pads)) if (net && (got[pad] ?? '') !== net) diffs.push(`${r}.${pad}: board ${got[pad] ?? '(none)'}, schematic ${net}`);
  }
  const bomFile = join(HW, name, `${name}-bom.csv`), bom = bomCsv(sheet, nl);
  const bomSame = existsSync(bomFile) && readFileSync(bomFile, 'utf8') === bom;
  if (!bomSame && fixBom) writeFileSync(bomFile, bom);
  if (diffs.length) bad++;
  console.log(`${name}: ${nl.parts.length} parts, ${diffs.length ? `${diffs.length} DIFFERENCES: ${diffs.slice(0, 8).join('; ')}` : 'parts and nets match'}; parts list ${bomSame ? 'current' : fixBom ? 'rewritten' : 'OUT OF DATE'}`);
}
process.exit(bad ? 1 : 0);
