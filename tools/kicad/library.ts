// The app's footprints as a KiCad library (hardware/NETApps.pretty), so the boards' footprints
// are found when a board is opened or updated in KiCad:
//   cd app/ui && npx vite-node ../../tools/kicad/library.ts ../../hardware/NETApps.pretty
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FOOTPRINTS } from '../../app/ui/src/pcb/footprint';
import { kicadMod } from '../../app/ui/src/pcb/kicad';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
for (const f of Object.values(FOOTPRINTS)) writeFileSync(join(out, `${f.id}.kicad_mod`), kicadMod(f));
console.log(`${Object.keys(FOOTPRINTS).length} footprints in ${out}`);
