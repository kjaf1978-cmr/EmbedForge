# P4: mains voltage stabiliser 1 kVA, relay-switched taps

Worked example product of EmbedForge (NETApps Electric Simulation). It is the second product
taken through the plan's definition of done (D47), and it is ready for your sign-off and for a
prototype. It is **not certified, and no prototype has been built**: see the user manual's
safety note, and the type tests.

## Status against the definition of done

| # | Element | State |
|---|---|---|
| 1 | Schematic | Final. Wired circuit diagram; inputs (IN) and load-side outputs (OUT) labelled. ERC clean. The board matches it part by part and pad by pad (`8-review/BOARD-CHECK-P4.txt`). |
| 2 | DFMEA verified by simulation | The product's simulation tests pass on this commit (`7-simulation-tests/`): every step and 140 / 300 V; the restart delay; a stuck tap relay; two faults (a stuck tap relay and the output relay's driver shorted); power-up with the product's timing; tap changes only while the input relay is open; a sag from 230 to 195 V. The DFMEA is closed by design. What only a prototype can verify (temperature rise and the thermal cut-out, relay life, inrush, the tap-change gap, surge, damp heat, electrical safety) is assigned to the type tests. |
| 3 | Firmware | None: the product has no microcontroller. |
| 4 | Board | One board, 230 × 246 mm, 2 layers, 2 oz. DRC 0 errors and 0 unconnected; mains nets 3.2 mm from the control. Fabrication files, assembly drawing, parts list and wiring list. |
| 5 | Costed parts list | About €311 (`4-parts-list/`), of which €185 is the autotransformer made to specification. Every part has a manufacturer part number or a specification, and a price. Prices marked "estimate" are catalogue estimates. |
| 6 | Documents | User manual, installation guide, assembly guide, commissioning procedure with record sheet, prototype type tests, design notes, DFMEA, and the design document (PDF and Word). |
| 7 | Independent review | Done 15 November 2026: 3 blockers, 9 major and 8 minor findings. Your decisions D51–D53 settled four of them; all are resolved, except the relay footprint (below) (`8-review/REVIEW.md`). |
| 8 | Package and sign-off | This package; **awaiting your sign-off**. |

Open, for the prototype stage:

- Check the relay footprint against the Song Chuan 832A drawing, and the TMOV14RP300E body
  against Littelfuse's drawing. Both are provisional: the makers' sites refuse automated
  downloads, so the datasheets are needed from you.
- Order the autotransformer to the specification in ASSEMBLY.md section 1.
- Run the type tests.

## Folders

| Folder | Contents |
|---|---|
| `1-schematics/` | The schematic (PDF on one large sheet, and SVG) |
| `2-design-document/` | The design document (PDF, Word) |
| `3-pcb/` | The KiCad 7 project of the board (open the `.kicad_pro`), with its fabrication zip, DRC report, copper plots, assembly drawing, parts list and wiring list (`panel.csv`); `NETApps.pretty` holds the footprints |
| `4-parts-list/` | The costed parts list (CSV) |
| `5-documentation/` | User manual, installation, assembly, commissioning, type tests, design notes, DFMEA (Markdown and PDF) |
| `6-app-project/` | The app's project files |
| `7-simulation-tests/` | The tests that verify the product by simulation (run from the full repository) |
| `8-review/` | The independent review with its resolutions, and the board-against-schematic check |
