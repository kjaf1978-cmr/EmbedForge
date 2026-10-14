# Increment 3 — scope (step 1 of the increment process, section 22)

- Baseline: prompt v3.9 (decision D17), gate decision D19 (14 October 2026)
- Started: 14 October 2026
- **Why:** you approved the Increment 2 gate and chose to start PCB layout and routing. The
  schematics drawn and simulated in Increment 2 become boards: footprints, placement, routing,
  design rule check and the files a fab needs.
- **Carried over as conditions** (from Increments 1 and 2): your look at 0.2.6 and its
  signature; VAPP-01 and the VAPP test kit; the human usability run; the self-hosted runners;
  tags v0.1.0 to v0.2.6 (need a session that may push tags).

## Requirement IDs covered

| Area | IDs |
|---|---|
| Footprints for the Increment 2 symbol library, checked against the fab profile | PCB-02 |
| Board outlines: custom (size, mounting holes) and the form factors of PCB-01 | PCB-01 |
| PCB view: per-layer 2D view, placement and route editing, DRC markers; 3D view | UI-10 |
| Placement: automatic (connectors on edges, decoupling near ICs, keep-outs) and by hand | PCB-03 |
| Routing: 1 or 2 layers (4 optional), net classes, IPC-2221 widths, ground pour, by hand and automatic | PCB-04 |
| Fabrication profiles, shipped EF-PROTO-STD, user profiles | PCB-05 |
| Fabrication package: Gerber X2, Excellon, drill map, pick-and-place, BOM, drawings, STEP | PCB-06 |
| Schematic ↔ PCB synchronisation through the netlist | PCB-07, VER-09 |
| Perfboard and stripboard layout with a hand-wiring list | PCB-08, VER-14 |
| Test points on every rail and bus | PCB-09 |
| DRC with zero unrouted nets; Gerber re-read check; build checklists; implementability | VER-08, VER-11, VER-12, VER-13 |
| Hardware revision on the silkscreen and in file names | CM-08 |
| Optional KiCad advanced mode (no function depends on it) | SS-06 |

## Features taken from products on the market

| From | Feature |
|---|---|
| KiCad Pcbnew | Ratsnest from the netlist, "update PCB from schematic", interactive router with push-free DRC, zones (pour), per-layer visibility, Gerber X2 / Excellon / position files |
| EasyEDA | One-click autoroute, board outline templates, 3D preview, fab-ready ZIP |
| Fritzing | Perfboard and stripboard views with track cuts, beginner-friendly |
| Altium | Net classes with rule-based widths, DRC markers listed and cross-probed |
| All of them | Grid snap, rotate/flip parts, layer switch while routing (via), undo/redo |

## Work packages

| WP | Content | Verification |
|---|---|---|
| 3.1 | Footprint library for every symbol (THT first, SMD variants), pin-to-pad maps, a footprint choice per part, profile DRC on footprints (PCB-02); board model in the project files | Unit tests: every symbol has a footprint whose pads match its pins; footprints pass EF-PROTO-STD or carry a stated variant |
| 3.2 | PCB view (UI-10): board outline (custom and templates), parts from the schematic netlist, ratsnest, placement editing, manual tracks and vias on two layers, layer visibility, undo; schematic ↔ PCB update (PCB-07, VER-09) | Unit tests of the model; browser tests incl. axe |
| 3.3 | DRC against EF-PROTO-STD and user profiles (PCB-05, VER-08): clearances, widths, drills, rings, edge, unrouted nets; markers and list | Unit tests with constructed violations |
| 3.4 | Autorouter (grid A*, two layers, vias), IPC-2221 widths from net currents (PCB-04), net classes, ground pour; automatic placement (PCB-03 a, b, e) | Every example routes with zero DRC errors |
| 3.5 | Fabrication package (PCB-06): Gerber RS-274X X2, Excellon, drill map, pick-and-place, BOM, drawings; re-read by an independent parser (VER-11); revision on silkscreen and file names (CM-08); test points (PCB-09); checklists (VER-12) | Gerber re-read test; files checked against the board model |
| 3.6 | Perfboard and stripboard layout with a hand-wiring list (PCB-08, VER-14) | Every netlist connection implemented, none extra |
| 3.7 | 3D view of the assembled board (UI-10), STEP export for parts with 3D models (PCB-06); KiCad export/advanced mode (SS-06) as far as licences allow | Browser test; STEP re-read |

Releases: 0.3.x as the work packages land, each with tests, the test report and a signing kit.

## Out of scope for Increment 3

- Board definitions, pin capabilities and flashing (VER-10 needs them): Increment 4.
- Breadboard view (VER-15), parts catalogue and generated schematics: Increment 6.
- HAT+ EEPROM programming: Increment 4 (the HAT+ outline and EEPROM footprint are here).
