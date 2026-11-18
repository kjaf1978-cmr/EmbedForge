# P9: gate controller (24 V DC motor, infrared remote)

Worked example product of EmbedForge (NETApps Electric Simulation): a controller for a sliding or
swing gate with one 24 V DC gear motor (up to about 100 W), worked by an infrared remote. An
Arduino Nano decodes the remote and sequences the moves; the end stops, STOP, the photo-beam and
the obstacle and short-circuit cut-off stop the motor in hardware (what the gate's safety still
needs from the program is in the DFMEA, GC-10 and GC-13). It is **not certified, and no prototype has been built**: see the user manual's
safety note, and the type tests.

## Status against the definition of done

| # | Element | State |
|---|---|---|
| 1 | Schematic | Final. Wired circuit diagram; ERC clean; the board matches it part by part and pad by pad. |
| 2 | DFMEA verified by simulation | `tests/gate.test.ts`, 14 of 14 pass (LONG=1): ERC; opening to the open limit and closing to the close limit, each stopping the motor in hardware while the firmware still commands it; an obstacle while closing; a stall from the start (tripped within 0.3 s); the motor cable shorted; the photo-beam broken while closing; STOP; both relays commanded; power-up with the outputs high, with a step and with a 100 ms supply rise; CLR stuck high; the MOSFET shorted; the beam test output. No part over its ratings. DFMEA section 3d, GC-1 … GC-13. |
| 3 | Firmware | `firmware/gate-controller/` (D48, Arduino C++): NEC decoder, four learnt remotes in EEPROM, the move sequence, the beam test before each close, obstacle handling with release and lockout, STOP, travel limit, watchdog, status LED. Host unit tests: 19 tests, 97 checks pass (`make test`); the Nano build is 6.6 kB flash, 665 B RAM (`make nano`, avr-gcc with the Arduino core). |
| 4 | Board | Revision D, 160 × 110 mm, 2 layers, 100 parts. DRC 0 errors and 0 unconnected; matches the schematic part by part and net by net. Fabrication files, assembly drawing, parts list. |
| 5 | Costed parts list | About €51 (single-unit prices; `4-parts-list/`): the Nano €21, the two 30 A relays €6, the terminals €6, the shunt €4, the rest the board's parts. The 24 V supply of at least 10 A (about €45), the motor, limit switches, STOP, photo-beam and key-switch are the installation's. |
| 6 | Documents | User manual, installation guide, assembly guide, commissioning procedure with record sheet, prototype type tests, DFMEA, design notes (docs/inc3/POWER.md, section P9). All with the schematic's designators. |
| 7 | Independent review | Done 18 November 2026: 1 blocker, 8 major and 6 minor findings and a list of what was missing; all resolved but one, the shunt's sense connection, measured on built boards instead (`REVIEW.md`). |
| 8 | Package and sign-off | Pending. |

What changed in the P9 audit (18 November 2026): the close limit and the photo-beam on their own
terminals and inputs (the firmware tells a closed gate from a broken beam, GC-9); a LEARN button
for pairing remotes; the firmware written and tested (D48); the motor relays on the footprint of
the part in the parts list (Song Chuan 832A); the documents with the schematic's designators.

What changed after the independent review (18 November 2026): the shunt's part code (it named a
1 mΩ part); a supply of at least 10 A; the release before the lockout; a power-on reset that works
with a real supply; CLR by its edge; a trip drops the relays; the blanking from 0.5 s to 0.1 s;
STOP; the photo-beam tested before each close; a key-switch input; indicators; the direction
checked first at commissioning.

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
