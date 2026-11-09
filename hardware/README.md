# Boards of the worked designs (decisions D43, D44)

Each design's board as a KiCad 7 project, with its fabrication files. The boards are generated
from the app's schematics by `tools/kicad` and then checked with KiCad's design rule check
(DRC); do not edit the board files by hand without updating the plan in
`tools/kicad/layouts.ts`, or the next export overwrites the change.

| Design | Folder | Board | DRC (errors / unconnected) | Status |
|---|---|---|---|---|
| Mains voltage stabiliser 1 kVA (P4) | `stabiliser/` | 210 × 212 mm, 2 layers, 2 oz | 0 / 0 | routed; awaiting a person's review and a prototype |
| Mains change-over 1P, 32 A (P3): control board + DIN-rail panel | `changeover-1p/` | 150 × 100 mm, 2 layers, 2 oz | 0 / 0 | routed; panel wiring in `panel.csv` |
| Mains change-over 3P+N, 32 A (P3): control board + DIN-rail panel | `changeover-3p/` | 195 × 135 mm, 2 layers, 2 oz | 0 / 0 | routed; panel wiring in `panel.csv` |

## What a folder holds

- `<design>.kicad_pcb`, `.kicad_pro`, `.kicad_dru`: the board, its net classes and the custom
  insulation rule. Open the `.kicad_pro` in KiCad 7 or later.
- `<design>-fabrication.zip`: Gerber (copper, solder mask, silkscreen, outline), Excellon drill
  file and drill map, pick-and-place positions. Upload it to the fab as it is.
- `<design>-copper.pdf` / `.png`: both copper layers, the silkscreen and the outline.
- `<design>-drc.rpt`: KiCad's DRC report of the routed board.
- `panel.csv`: for designs with parts on a panel (DIN rail, chassis), the wiring list.
- `fp-lib-table` with `../NETApps.pretty`: the app's footprints as a KiCad library.

## Rules every board follows

- Mains nets (found from the schematic: everything galvanically joined to L and N, up to the
  transformers, optocouplers and relay coils) are 3.2 mm from every other net, the creepage of
  basic insulation at 300 V r.m.s. (IEC 62368-1, pollution degree 2, material group IIIb); the
  control side is earthed (PE), so basic insulation suffices. Between two mains nets 1.5 mm.
- Mains terminals at 7.62 mm pitch; off-board transformers on connectors with an empty pole
  between their windings.
- Track widths by IPC-2221 for the current at 20 K rise in 2 oz copper (the stabiliser's mains
  tracks 1.6 mm for 7 A).
- The power section is placed and partly routed by a written plan (`tools/kicad/layouts.ts`);
  the control section is placed from the schematic and routed by Freerouting.

## Known warnings

- `lib_footprint_mismatch` on parts turned 180°: KiCad compares the turned reference text's angle
  with the library copy; the copper is the same.
- `silk_overlap`: reference designators touching outlines (cosmetic; fix by hand before ordering
  if the silkscreen matters).

## Before ordering

These boards come out of the verified schematics, but no one has built them yet. Before a
production order: a person's review of the layout (clearances on the mains side, the heat of the
relays and regulators), and a prototype tested against the design's test plan (TEST_REPORT.md).
Prices and parts: the design document's BOM (`docs` export in the app).

Regenerate a board:

```
cd app/ui && npx vite-node ../../tools/kicad/export.ts stabiliser /tmp/stab
cd ../.. && python3 tools/kicad/route.py /tmp/stab --passes 40
```

Needs KiCad 7 (pcbnew Python module and kicad-cli), Freerouting 1.9 at
/opt/freerouting/freerouting.jar (or `FREEROUTING=`), Java 17+ and xvfb-run.
