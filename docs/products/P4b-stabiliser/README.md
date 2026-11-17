# P4b: mains voltage stabilisers 5, 10 and 15 kVA, contactor-switched taps

Worked example product of EmbedForge (NETApps Electric Simulation). It is the third product
taken through the plan's definition of done (D47). Its taps were first switched by thyristors
(D41); after that design's independent review the owner chose contactor taps the P4 way (D58).
It is ready for your sign-off and for a prototype. It is **not certified, and no prototype has
been built**: see the user manual's safety note, and the type tests.

## Status against the definition of done

| # | Element | State |
|---|---|---|
| 1 | Schematic | Final, one per size (5, 10, 15 kVA; they differ only in the DIN-rail parts and cable sizes). Wired circuit diagrams; inputs and outputs labelled. ERC clean. The board matches it part by part and pad by pad. |
| 2 | DFMEA verified by simulation | The product's 37 simulation tests pass on this commit (`7-simulation-tests/`, LONG=1): full load at 140 / 230 / 300 V for each size; every step ± 6 V; power-up; tap changes under full load at 5 and 15 kVA (no tap contactor carries current while it moves; the gap under 0.4 s, about 0.3 s; the output contactor stays in); a sag to 195 V; a welded tap contactor, also with its NO auxiliary open; a coil driver shorted from power-up and shorting while running; K8's driver shorted with 330 V in; the thermal cut-out open; power factor 0.8; 15 kVA on a 0.3 Ω line (no hunting). The DFMEA (section 3b) is closed by design; what only a prototype can verify is assigned to the type tests. |
| 3 | Firmware | None: the product has no microcontroller. |
| 4 | Board | One control board for all sizes, 270 × 185 mm, 2 layers, 2 oz. DRC 0 errors and 0 unconnected; mains nets 3.2 mm from the control; the power poles never pass through the board. Fabrication files, assembly drawing, parts list and wiring list (`panel.csv`). |
| 5 | Costed parts list | About €1 660 / €3 114 / €4 304 (5 / 10 / 15 kVA, single-unit prices; `4-parts-list/`), of which the nine contactors are €1 012 / €1 962 / €2 622 and the autotransformer made to specification €420 / €750 / €1 050. Every part has a manufacturer part number or a specification, and a price; prices marked "estimate" are catalogue estimates (contactors are often 40–60 % cheaper at wholesale). |
| 6 | Documents | User manual, installation guide, assembly guide, commissioning procedure with record sheet, prototype type tests, DFMEA, design notes (docs/inc3/POWER.md), and the design document of each size (PDF and Word). |
| 7 | Independent review | Done 16 November 2026: 2 blockers, 7 major and 6 minor findings, all resolved or assigned to the prototype (`REVIEW.md`). |
| 8 | Package and sign-off | This package; waiting for your sign-off. |

Open, for the prototype stage:

- The LC1D115BD's coil data (15 kVA): if it is an electronic coil with a large pull-in power, a
  240 W 24 V supply (ASSEMBLY.md section 1).
- K10's life and its reclosing current into the transformer (type tests TT-4, TT-9).
- Order the autotransformer to the specification in ASSEMBLY.md section 1, with its inrush stated.
- Run the type tests.

## Folders

| Folder | Contents |
|---|---|
| `1-schematics/` | The schematic of each size (PDF on one large sheet, and SVG) |
| `2-design-document/` | The design document of each size (PDF, Word) |
| `3-pcb/` | The KiCad 7 project of the control board (open the `.kicad_pro`), with its fabrication zip, DRC report, copper plots, assembly drawing, parts list and wiring list (`panel.csv`); `NETApps.pretty` holds the footprints |
| `4-parts-list/` | The costed parts list of each size (CSV) |
| `5-documentation/` | User manual, installation, assembly, commissioning, type tests, DFMEA (Markdown and PDF) |
| `6-app-project/` | The app's project files of each size |
| `7-simulation-tests/` | The tests that verify the product by simulation (run from the full repository), and their result |
| `8-review/` | The independent review with its resolutions |
