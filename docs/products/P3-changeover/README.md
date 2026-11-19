# P3: mains / back-up change-over, single-phase and 3P+N, 32 A

Worked example product of EmbedForge (NETApps Electric Simulation). This is the first product
taken through the plan's definition of done (D47). It is ready for your sign-off and for a
prototype. It is **not certified, and no prototype has been built**: see the user manual's
safety note, and the type tests.

## Status against the definition of done

| # | Element | State |
|---|---|---|
| 1 | Schematic | Final. Wired circuit diagram, inputs (IN) and load-side outputs (OUT) labelled. ERC clean. Both boards match it part by part and pad by pad (`8-review/BOARD-CHECK-P3.txt`). |
| 2 | DFMEA verified by simulation | The product's simulation tests pass on this commit (`7-simulation-tests/`): thresholds, hysteresis, asymmetry, interlock (never both contactors), coil-supply lockout, stress check. DFMEA closed by design. Items that only a prototype can verify (temperature rise, damp heat, IP54, full-length timing, surge, short circuit) are assigned to the type tests. |
| 3 | Firmware | None: the product has no microcontroller. |
| 4 | Boards | Two boards, revision B (1P 165 × 110 mm, 3P+N 235 × 155 mm), each with DRC 0 errors and 0 unconnected. Mains and back-up nets 3.2 mm apart and from the control. Fabrication files, assembly drawing, parts list and panel wiring list for each. |
| 5 | Costed parts list | 1P about €504, 3P+N about €867 (`4-parts-list/`). Every part has a manufacturer part number and a price. Prices marked "estimate" are catalogue estimates. |
| 6 | Documents | User manual, installation guide, assembly guide, commissioning procedure with record sheet, prototype type tests, design notes, DFMEA, and the design document (PDF and Word) of each variant. |
| 7 | Independent review | Done 15 November 2026: 3 blockers and 7 major findings, all resolved (`8-review/P3-REVIEW.md`). |
| 8 | Package and sign-off | Package c6ddfd3; **signed off by the owner on 15 November 2026**. Boards reworked to revision B (D64, 19 November 2026): see below. |

**Revision B of both boards (D64, 19 November 2026).** The varistors' footprint (TMOV_14) was
corrected from Littelfuse's datasheet after the boards were made: the TMOV14RP300E's body is up to
17 mm across and 11 mm thick, and its leads can sit up to 5.5 mm off its middle, so the body can
reach 11 mm to one side of the leads. Revision A's outline was centred on the leads (it was not, as
the documents said, larger than the part): on the 1P board RV2 would have touched F4 or T2, on the
3P+N board RV6 touched T3 or RV5 and three others a neighbour on one side. In revision B every
varistor has the room on the side marked on the silkscreen (checked against every other part's
outline), the boards are re-routed with the two sources 3.2 mm apart, and the circuit is
unchanged.

Open, for the prototype stage:

- Confirm with Schneider the mechanical interlock kit for the LC1DT32 pair.
- Run the type tests.

## Folders

| Folder | Contents |
|---|---|
| `1-schematics/` | The schematic of each variant (PDF on one large sheet, and SVG) |
| `2-design-document/` | The design document of each variant (PDF, Word) |
| `3-pcb/` | The KiCad 7 projects of both boards (open the `.kicad_pro`), with each board's fabrication zip, DRC report, copper plots, assembly drawing, parts list and panel wiring list (`panel.csv`); `NETApps.pretty` holds the footprints |
| `4-parts-list/` | The costed parts list of each variant (CSV) |
| `5-documentation/` | User manual, installation, assembly, commissioning, type tests, design notes, DFMEA (Markdown and PDF) |
| `6-app-project/` | The app's project files of each variant |
| `7-simulation-tests/` | The tests that verify the product by simulation (run from the full repository) |
| `8-review/` | The independent review with its resolutions, and the board-against-schematic check |
