# P9: pump controller (tank level, dry source, timers)

Worked example product of EmbedForge (NETApps Electric Simulation): an automatic controller for a
borehole or transfer pump (230 V single-phase, up to 1.5 kW) filling an elevated tank, purely
discrete (no microcontroller). It is **not certified, and no prototype has been built**: see the
user manual's safety note, and the type tests.

## Status against the definition of done

| # | Element | State |
|---|---|---|
| 1 | Schematic | Final. Wired circuit diagram; ERC clean; the board matches it part by part and pad by pad. |
| 2 | DFMEA verified by simulation | `tests/pumpcontrol.test.ts` (LONG=1): the normal cycle (starts below LOW, stops at HIGH, never near OVERFLOW, no part over its ratings); a broken HIGH cable (OVERFLOW stops and latches FAULT); the source running dry (stop, lockout); a burst pipe (maximum run, FAULT); the start delay; two faults: the pilot relay's driver shorted with a broken HIGH cable, and with the source dry (the independent protection's relay K2 stops the pump). DFMEA section 3d, PC-1 … PC-8. |
| 3 | Firmware | None. |
| 4 | Board | 165 × 110 mm, 2 layers, 2 oz, revision B. DRC 0 errors and 0 unconnected; the only mains on the board is the safety transformer's fused primary, 5.5 mm (reinforced) from the PELV control. Fabrication files, assembly drawing, parts list and wiring list (`panel.csv`). |
| 5 | Costed parts list | About €161 (single-unit prices; `4-parts-list/`): the motor-protective breaker €48, the contactor €35, the two interface relays €28, the rest the board and its parts. |
| 6 | Documents | User manual, installation guide, assembly guide, commissioning procedure with record sheet, prototype type tests, DFMEA, design notes (docs/inc3/POWER.md, section P9), design document (PDF and Word). |
| 7 | Independent review | See `REVIEW.md`. |
| 8 | Package and sign-off | See the decision log (docs/phase0/STATUS.md). |

What changed in the P9 audit (17 November 2026, the D47 checklist): the control made PELV (the
electrodes are in water that people touch); an independent protection with its own relay; a
motor-protective breaker; the contactor and breaker on L and N; fuses, wire sizes, PE stud; the
drawing note's times corrected.

## Folders (package)

| Folder | Contents |
|---|---|
| `1-schematics/` | The schematic (PDF, SVG) |
| `2-design-document/` | The design document (PDF, Word) |
| `3-pcb/` | The KiCad 7 project of the board, with its fabrication zip, DRC report, copper plots, assembly drawing, parts list and wiring list; `NETApps.pretty` holds the footprints |
| `4-parts-list/` | The costed parts list (CSV) |
| `5-documentation/` | User manual, installation, assembly, commissioning, type tests, DFMEA (Markdown and PDF) |
| `6-app-project/` | The app's project files |
| `7-simulation-tests/` | The tests that verify the product by simulation, and their result |
| `8-review/` | The independent review with its resolutions |
