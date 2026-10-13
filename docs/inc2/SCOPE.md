# Increment 2 — scope (step 1 of the increment process, section 22)

- Baseline: prompt v3.9 (decision D17, 13 October 2026)
- Started: 13 October 2026
- **Why:** after installing 0.1.0 you found no design entry, no routing, no simulation, and no
  clear first step. You chose "design tools first" (D17): schematic entry and simulation now,
  PCB layout and routing next (Increment 3), then boards, the AI generator and the rest in their
  old order.
- **Increment 1 gate:** 0.1.0 is delivered and signed. Still open, carried into this increment as
  conditions:
  - your VAPP-01 and VAPP test-kit runs;
  - the human usability run;
  - the self-hosted runners;
  - pushing tag v0.1.0.

## Requirement IDs covered

| Area | IDs |
|---|---|
| Start screen, examples, first-circuit tutorial | UI-24 |
| Editable schematic view | UI-08 (a)–(h), with UI-02, UI-20..23 for the new view |
| Manual design entry and ERC | ED-08, ED-09, ED-03 (b), (d), (f) where they apply without a *target board* |
| Circuit simulation | SIM-01..05 |
| Project files (netlist, schematic geometry), save and open | DATA-01..03 for these files, INV-08, CM-01..03 (Git commit on save) |
| Exports of the schematic | UI-19 (SVG, PNG, print), SPICE netlist (SIM-04) |

## Features taken from products on the market

| From | Feature |
|---|---|
| KiCad Eeschema | Single-key tools (A add part, W wire, L label, P power, R rotate, X/Y mirror, M move, G drag, Del), automatic junctions, annotation, ERC markers, SPICE export |
| EasyEDA / Altium | Searchable part picker with previews, property panel beside the canvas, cross-probing |
| LTspice | Click a wire to probe a voltage, a part to probe its current; operating-point voltages on the schematic; .op, .dc, .tran, .ac |
| Falstad / Tinkercad Circuits | Switches, push-buttons and potentiometers operated on the schematic with instant results; worked examples to start from |
| All of them | Grid snap, zoom with the wheel, pan, zoom to fit, copy and paste, undo and redo |

## Work packages

| WP | Content | Verification |
|---|---|---|
| 2.1 | EDA core: engineering units, symbol library with simulation models, schematic model, connectivity, netlist (INV-08), ERC, SPICE export | Unit tests |
| 2.2 | Simulation engine: modified nodal analysis with Newton–Raphson; OP, DC sweep, transient, AC; R, C, L, sources, diode and LED, BJT, MOSFET, op-amp, switches, potentiometer | Unit tests against hand calculations; ngspice cross-check on a reference suite (SIM-04) in CI |
| 2.3 | Schematic editor, simulation panel and waveform viewer, start screen, examples, tutorial | Playwright tests including axe; scripted usability scenarios |
| 2.4 | Project save, open and list in the desktop app (Git commit per save); documentation; test report; release 0.2.0 | Rust tests; CI; signing kit |

## Out of scope for Increment 2

- PCB layout, footprints, routing and fabrication output: Increment 3.
- Boards, flashing, the AI generator, the parts catalogue and emulation: Increments 4–7.
- The ngspice "accurate mode" inside the app: built-in engine only, with ngspice used for verification and through the SPICE export.
