# P9: gate controller (24 V DC motor, infrared remote)

Worked example product of EmbedForge (NETApps Electric Simulation): a controller for a sliding or
swing gate with one 24 V DC gear motor (up to about 100 W), worked by an infrared remote. An
Arduino Nano decodes the remote and sequences the moves; everything that keeps the gate safe (the
end stops, the photo-beam, the obstacle and short-circuit cut-off) is discrete and works whatever
the program does. It is **not certified, and no prototype has been built**: see the user manual's
safety note, and the type tests.

## Status against the definition of done

| # | Element | State |
|---|---|---|
| 1 | Schematic | Final. Wired circuit diagram; ERC clean; the board matches it part by part and pad by pad. |
| 2 | DFMEA verified by simulation | `tests/gate.test.ts`, 7 of 7 pass: ERC; opening up to the open limit, which stops the motor in hardware while the firmware still commands it; an obstacle while closing (the cut-off latches); the motor cable shorted (latched within microseconds); the photo-beam broken while closing; both relays commanded; power-up with the outputs high before the program runs. No part over its ratings. DFMEA section 3d, GC-1 … GC-9. |
| 3 | Firmware | `firmware/gate-controller/` (D48, Arduino C++): NEC decoder, four learnt remotes in EEPROM, the move sequence, obstacle handling and lockout, travel limit, watchdog. Host unit tests 16 (69 checks) pass (`make test`); the Nano build is 5.0 kB flash, 627 B RAM (`make nano`, avr-gcc with the Arduino core). |
| 4 | Board | Revision C, 160 × 110 mm, 2 layers. DRC 0 errors and 0 unconnected. Fabrication files, assembly drawing, parts list. |
| 5 | Costed parts list | About €47 (single-unit prices; `4-parts-list/`): the Nano €21, the two 30 A relays €6, the shunt €4, the rest the board's parts. The 24 V 150 W supply (about €30), the motor, limit switches and photo-beam are the installation's. |
| 6 | Documents | User manual, installation guide, assembly guide, commissioning procedure with record sheet, prototype type tests, DFMEA, design notes (docs/inc3/POWER.md, section P9). All with the schematic's designators. |
| 7 | Independent review | See `REVIEW.md`. |
| 8 | Package and sign-off | Pending. |

What changed in the P9 audit (18 November 2026): the close limit and the photo-beam on their own
terminals and inputs (the firmware tells a closed gate from a broken beam, GC-9); a LEARN button
for pairing remotes; the firmware written and tested (D48); the motor relays on the footprint of
the part in the parts list (Song Chuan 832A); the documents with the schematic's designators.

## Folders (package)

| Folder | Contents |
|---|---|
| `1-schematics/` | The schematic (PDF, SVG) |
| `2-design-document/` | The design document (PDF, Word) |
| `3-pcb/` | The KiCad 7 project of the board, with its fabrication zip, DRC report, copper plots, assembly drawing and parts list; `NETApps.pretty` holds the footprints |
| `4-parts-list/` | The costed parts list (CSV) |
| `5-documentation/` | User manual, installation, assembly, commissioning, type tests, DFMEA (Markdown and PDF) |
| `6-app-project/` | The app's project files |
| `7-simulation-tests/` | The tests that verify the product by simulation, and their result |
| `8-review/` | The independent review with its resolutions |
| `9-firmware/` | The Nano's program, its host unit tests and their result |
