# Boards of the worked designs (decisions D43, D44)

Each design's board as a KiCad 7 project, with its fabrication files. The boards are generated
from the app's schematics by `tools/kicad` and then checked with KiCad's design rule check
(DRC); do not edit the board files by hand without updating the plan in
`tools/kicad/layouts.ts`, or the next export overwrites the change.

| Design | Folder | Board | DRC (errors / unconnected) | Status |
|---|---|---|---|---|
| Mains voltage stabiliser 1 kVA (P4) | `stabiliser/` | 230 × 212 mm, 2 layers, 2 oz | 0 / 0 | routed; awaiting a person's review and a prototype |
| Mains change-over 1P, 32 A (P3): control board + DIN-rail panel | `changeover-1p/` | 155 × 110 mm, 2 layers, 2 oz | 0 / 0 | routed; panel wiring in `panel.csv` |
| Mains change-over 3P+N, 32 A (P3): control board + DIN-rail panel | `changeover-3p/` | 225 × 150 mm, 2 layers, 2 oz | 0 / 0 | routed; panel wiring in `panel.csv` |
| MPPT solar charger 48 V, 80 A (P6): power board | `mppt-power/` | 280 × 160 mm, 2 layers, 4 oz | 0 / 0 | routed; copper bars and lugs below |
| MPPT solar charger 48 V, 80 A (P6): control board | `mppt-control/` | 160 × 110 mm, 2 layers, 2 oz | 0 / 0 | routed; `link.csv`: the nets to the power board |
| Inverter 48 V 5 kW, 50 Hz transformer (P7a): power board | `inverter-lf-48-power/` | 280 × 170 mm, 2 layers, 4 oz | 0 / 0 | routed; copper bars and lugs, bus and ground planes |
| Inverter 48 V 5 kW, 50 Hz transformer (P7a): control board | `inverter-lf-48-control/` | 200 × 150 mm, 2 layers, 2 oz | 0 / 0 | routed; mains nets 3.2 mm apart |
| Inverter 48 V 5 kW, high-frequency (P7b): battery-side power board | `inverter-hf-48-power-lv/` | 180 × 230 mm, 2 layers, 4 oz | 0 / 0 | routed; copper bars, the current transformer off-board |
| Inverter 48 V 5 kW, high-frequency (P7b): 380 V power board | `inverter-hf-48-power-hv/` | 140 × 270 mm, 2 layers, 4 oz | 0 / 0 | routed; conformal coating required (0.8 mm, IPC-2221 B4); the drivers' HVG poured after routing |
| Inverter 48 V 5 kW, high-frequency (P7b): battery-side control board | `inverter-hf-48-control-lv/` | 220 × 160 mm, 2 layers, 2 oz | 0 / 0 | routed; `panel.csv`: the nets to the other boards (J_PANEL, J_PANEL2) |
| Inverter 12 V 1.5 kW, 50 Hz transformer (P7a): power board | `inverter-lf-12-power/` | 280 × 170 mm, 2 layers, 4 oz | 0 / 0 | routed; the 48 V board's plan with six 4700 µF bus capacitors |
| Inverter 12 V 1.5 kW, 50 Hz transformer (P7a): control board | `inverter-lf-12-control/` | 200 × 150 mm, 2 layers, 2 oz | 0 / 0 | routed; mains nets 3.2 mm apart; one link drawn by `tools/kicad/link.py` |
| Inverter 12 V 1.5 kW, high-frequency (P7b): battery-side power board | `inverter-hf-12-power-lv/` | 260 × 230 mm, 2 layers, 4 oz | 0 / 0 | routed; three MOSFETs per switch (twelve in the row), copper bars |
| Inverter 12 V 1.5 kW, high-frequency (P7b): 380 V power board | `inverter-hf-12-power-hv/` | 140 × 270 mm, 2 layers, 4 oz | 0 / 0 | routed; the 48 V board's plan; conformal coating required |
| Gate controller 24 V (P9, D25): motor drive, protections, Arduino Nano and IR receiver | `gate-controller/` | 160 × 110 mm, 2 layers, 2 oz | 0 / 0 | routed; the Nano on sockets, the TSOP38238 behind the enclosure's window; one supply link drawn by `tools/kicad/link.py` |
| Pump controller (P9): control board + DIN-rail panel | `pump-control/` | 165 × 110 mm, 2 layers, 2 oz | 0 / 0 | routed; mains nets 3.2 mm apart; panel wiring in `panel.csv` |
| Cordless trimmer drive 36 V (P9) | `trimmer-drive/` | 160 × 100 mm, 2 layers, 4 oz | 0 / 0 | routed; power on 3 mm tracks, ground poured on both layers |
| Block moulding machine (P9): safety circuit and 24 V outputs + DIN-rail panel | `block-machine/` | 100 × 70 mm, 2 layers, 2 oz | 0 / 0 | routed; safety contactors and the motor contactors on the DIN rail, wiring in `panel.csv` |
| Irrigation controller (P9, D24): main board | `irrigation-main/` | 130 × 100 mm, 2 layers, 2 oz | 0 / 0 | routed; ESP32-DevKitC on sockets (antenna over the top edge), 24 V in, bus to the modules (20-way ribbon) |
| Irrigation controller (P9, D24): 8-zone channel module (1 … 8 per controller) | `irrigation-module/` | 230 × 95 mm, 2 layers, 2 oz | 0 / 0 | routed; field terminals along the bottom edge (per zone: valve +24 V, valve out, sensor +3.3 V, signal, 0 V); bus in top left, out top right |
| Mains stabiliser 5/10/15 kVA, thyristor taps (P4b, D41): logic board | `stabiliser-t-logic/` | 205 × 140 mm, 2 layers, 2 oz | 0 / 0 | routed; mains nets 3.2 mm apart; thyristors, autotransformer and the pair boards wired per `panel.csv` |
| Mains stabiliser 5/10/15 kVA, thyristor taps (P4b): thyristor pair driver (7 per unit) | `stabiliser-t-pair/` | 120 × 80 mm, 2 layers, 2 oz | 0 / 0 | routed; optotriac isolation to the logic side (DIP-6 with pin 5 removed); `panel.csv`: J_MAINS/J_PANEL wiring |

### The 24 V inverters (P7, 3 kW)

The 24 V units use the 48 V boards: the same parts on each board with the same footprints and
connections, only values differ (`tools/kicad/variant.ts` checks this). The 48 V board's folder
holds the 24 V parts list as `<board>-bom-24v.csv`; order the board's fabrication files as they
are and fit the parts from that list.

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
- Footprints follow each part's value and rating, as the parts list orders it: electrolytics by
  C·V (Ø 5 … 18 mm radial, 22 … 35 mm snap-in), film capacitors by C·V (7.5 … 37.5 mm pitch),
  Y and high-voltage ceramics at 10 mm, resistors by power (¼ W, 1 W, 2–3 W, 5 W and 10 W
  cement, four-terminal shunts), fuses (TR5 to 6.3 A, 5 × 20 mm holder to 10 A), inductors (radial
  to 2 A, toroid to 10 A). Parts above that (power resistors over 10 W, inductors over 10 A, fuses
  over 10 A) sit off the board, on the chassis or heatsink, wired or bolted.
- High-current nets end on M5 bolt lugs (busbars or cable lugs), not on screw terminals.
- Track widths by IPC-2221 for the current at 20 K rise in 2 oz copper (the stabiliser's mains
  tracks 1.6 mm for 7 A).
- The power section is placed and partly routed by a written plan (`tools/kicad/layouts.ts`);
  the control section is placed from the schematic and routed by Freerouting.

## Power boards (D45)

The high-current paths are drawn as 4 mm tracks with the solder mask open on them: solder a
tinned copper bar 4 × 3 mm (12 mm², 80 A at about 30 K rise) along each, or two 4 mm² solid
copper wires, so the bar carries the current and the board's 4 oz copper only joins it to the
pins. Cables and busbars bolt to the M5 lugs (plated holes with 12 mm rings): the inductor and
the fuse sit on the chassis next to the board. The TO-247 and TO-126 parts stand in one row along
the bottom edge, their tabs to a common heatsink (isolate each tab with a thermal pad rated for
the voltage, the PV side reaches 114 V). The two boards of a design connect through their 12-pole
connectors, pole by pole as `link.csv` lists them.

## Parts lists

Each folder's `<design>-bom.csv` lists the parts with the footprint each has on the board, the
manufacturer's part number, distributors with order numbers, and an indicative unit price (EUR,
October 2026, "live" or "estimate"; check prices and stock when ordering). The lines not on
this board come last (panel parts, the other board's parts).

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
