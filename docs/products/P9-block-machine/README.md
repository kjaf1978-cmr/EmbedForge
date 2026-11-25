# P9: block moulding machine (control and safety)

Worked example product of EmbedForge (NETApps Electric Simulation): the control panel of a
machine that makes hollow and solid concrete blocks (a 3 kW mixer / feeder, two 1.5 kW
vibrators, a 7.5 kW hydraulic power pack with four valves). The E-stop and the guards on certified
safety relays and two safety contactors feeding every coil and valve; the outputs switched on
their +24 V side and read back; an Arduino Mega 2560 runs the cycle. It is **not certified, and no
prototype has been built**: see the user manual's safety note, the installation guide's section
on the performance level, and the type tests.

## Status against the definition of done

| # | Element | State |
|---|---|---|
| 1 | Schematic | Final (after the review, D65 … D67). Wired circuit diagram; ERC clean. |
| 2 | DFMEA verified by simulation | `tests/blockmachine.test.ts`, 16 of 16 pass (LONG=1): ERC; power-up; the rail only at RESET's release; an E-stop and a guard while running; RESET held through an E-stop; RESET jammed at power-up with a 100 ms supply rise; one E-stop channel only; a channel bridged; a safety contactor welded from power-up and while running; an output MOSFET shorted with the outputs' enable; the enable's read-back; a valve wire to the frame; all four valves at once; the lamp and STOP. No part over its ratings. DFMEA section 3d, BM-1 … BM-16. |
| 3 | Firmware | `firmware/block-machine/` (D48, D67): homing, the cycle, time limits, STOP, the interlocks, the outputs' read-back and enable, the breakers, the oil temperature, the pressure. Host unit tests 19 (487 checks) pass with a simulated machine; the Mega build is 8.5 kB. |
| 4 | Board | **Open:** the control board is to be re-laid for the new circuit. It carries the Mega 2560 on headers, and the Mega's header geometry must come from Arduino's mechanical drawing, which this environment cannot reach (see below). The previous revision's board (for the Nano) in `hardware/block-machine/` no longer matches. |
| 5 | Costed parts list | About €1050 for the board and the panel's parts (single-unit prices): the two safety relays €270, the five contactors €350, the breakers €305, the Mega €42, the rest the board. The 24 V supply (about €90), the enclosure, the E-stops, buttons, guard switches, sensors, valves and the hydraulic unit are the machine builder's (INSTALLATION.md). |
| 6 | Documents | User manual, installation guide (the panel, earthing, the hydraulics, the guards, the performance level), assembly guide, commissioning procedure with record sheet, prototype type tests, DFMEA, design notes (docs/inc3/POWER.md). All with the schematic's designators. |
| 7 | Independent review | Done 23 November 2026: 3 blockers, 8 major and 3 minor findings, all resolved (`REVIEW.md`). |
| 8 | Package and sign-off | After the board. |

## The Mega's footprint

The board needs the exact positions of the Arduino Mega 2560 Rev3's headers and mounting holes.
They are in Arduino's own documentation (docs.arduino.cc, the Mega 2560 Rev3 "Mechanical"
drawing), which this environment's network does not reach, and in community KiCad libraries on
GitHub, which this session may not read. Drawing them from memory risks a board that the Mega
does not fit. The board is laid out as soon as one of these is available: the host
docs.arduino.cc allowed in the environment's network settings, or the drawing (PDF or DXF) or a
KiCad footprint file supplied.

## Folders (package)

| Folder | Contents |
|---|---|
| `1-schematics/` | The schematic (PDF, SVG) |
| `2-design-document/` | The design document (PDF, Word) |
| `3-pcb/` | The board's KiCad project, fabrication files, assembly drawing, parts list and wiring list |
| `4-parts-list/` | The costed parts list (CSV) |
| `5-documentation/` | User manual, installation, assembly, commissioning, type tests, DFMEA (Markdown and PDF) |
| `6-app-project/` | The app's project files |
| `7-simulation-tests/` | The tests that verify the product by simulation, and their result |
| `8-review/` | The independent review with its resolutions |
| `9-firmware/` | The Mega's program, its host unit tests and their result |
