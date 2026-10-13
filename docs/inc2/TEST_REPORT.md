# Increment 2 — test report (TEST-03)

- Baseline: prompt v3.9 (decision D17)
- Date: 13 October 2026
- Scope: docs/inc2/SCOPE.md
- Status key:
  - **B** = verified by the builder, with evidence;
  - **P** = partly verified (what is missing is stated);
  - **U** = awaiting user execution (TEST-02);
  - **N** = not verified, with the reason.
- **Gate:** the increment is complete when you have:
  - signed the 0.2.0 media (signing kit);
  - installed the result and looked at it (section 4);
  - approved the gate.

## 1. Evidence summary

| Check | Where | Result |
|---|---|---|
| Rust core tests | `cd core && cargo test --locked` | 63 passed, 1 ignored |
| Tauri shell tests, incl. project storage | `cd app/src-tauri && cargo test`, clippy `-D warnings` | 9 passed, 0 warnings |
| UI unit tests: schematic core, editor, examples, simulator, every part | `cd app/ui && npm test` | 146 passed (0.2.2) |
| — of which SIM-04 against ngspice 42 | `tests/sim.ngspice.test.ts` | 25 cases agree (15 reference circuits, 10 example schematics) |
| Browser tests, incl. axe in both themes and four usability scenarios | `npx playwright test` | 31 passed, 3 consecutive runs (0.2.2) |
| CI on GitHub-hosted runners | `core`, `ui`, `package` | green on the Increment 2 commits (section 2) |

## 2. CI (TEST-01)

- The `ui` workflow installs ngspice on the runner, so SIM-04 runs on every push.
- Commit 8fde01e passed every hosted job: core, ui, and package, including the Ubuntu and
  Windows install jobs.
- The first editor commit (5b89cc8) failed the ui job: the Increment 1 browser tests still
  looked for the old "Welcome" view. They were updated in the next commit.

## 3. Per requirement

| Req | Status | Evidence |
|---|---|---|
| UI-24 | B | Start screen with new, tutorial, saved projects, 11 examples with previews and hints, roadmap. `editor.test.ts` checks every example: connected, ERC-clean, simulates. Browser tests open examples, run the tutorial and save/open projects. |
| UI-08 (a) | B | Part library with categories and search (`searchSymbols` test; browser test). |
| UI-08 (b) | B | Orthogonal wiring; junction dots at T-junctions and points of degree ≥ 3; crossing wires do not connect (`eda.test.ts`). |
| UI-08 (c) | B | Net labels, power rails and ground; same names join nets (`eda.test.ts`). |
| UI-08 (d) | B | Move with attached wires, rotate, mirror, copy, paste, duplicate, delete, box selection (`editor.test.ts`, browser tests). |
| UI-08 (e) | B | Annotate by position (`eda.test.ts`). |
| UI-08 (f) | B | Grid snap, wheel zoom, pan, zoom to fit; the first view follows the canvas size until the first edit. |
| UI-08 (g) | B | Values in engineering notation, with an error message for a non-value (`eda.test.ts`, browser test). |
| UI-08 (h) | P | Cross-probing works inside the schematic view: net highlight from a wire or the netlist list, ERC list to part, probe to trace. The Increment 1 highlight bus is not linked to schematic artefacts yet; it becomes useful once requirements are generated (Increment 5). |
| UI-19 (this view) | B | SVG, PNG, SPICE and CSV export, and print. The browser test checks the PNG signature and the SVG content. |
| UI-20 | B | Every editor command is in the command palette. The keyboard-only scenario places, wires and simulates without the mouse. |
| UI-21, UI-23 | B | Both themes pass axe with simulation results shown. Help pages: schematic.md and simulation.md. |
| UI-22 | B | One undo stack per document. Each edit is one command, labelled with its netlist change. |
| ED-08 | B | Manual entry through the same netlist. Every generic part is marked "not a standard part" in the inspector and in the ERC. |
| ED-09 (a)–(e) | B | `eda.test.ts` (ERC tests); markers on the sheet; browser test. |
| ED-03 (f) | B | Inductive load switched by a transistor without a flyback diode (rule in `erc.ts`). |
| ED-03 (b), (d) | N | They need pin voltage levels and pull-up rules of a *target board*: Increment 4 and later. |
| SIM-01 (a)–(d) | B | Operating point, DC sweep, transient and AC, each against ngspice (section 1). |
| SIM-02 | B | Voltage, differential and current probes; viewer with two cursors, zoom, min/max/average/RMS/peak-to-peak/frequency (`measure.ts`; browser test). |
| SIM-03 | B | Switches, push-buttons (held), potentiometers (wheel, slider). Push-button to LED in under 1 s (`editor.test.ts` measures it; browser test). |
| SIM-04 | B | 25 cases against ngspice 42 within 1 % or 1 mV / 1 µA, on every CI run. SPICE export of the schematic. The 555 is the exception: it has no SPICE primitive, and its export line says so. |
| SIM-05 | B | Every part in the library has a model. A rail without a source gets an ideal supply, and the Simulation tab says so. A missing ground stops the simulation with a message. |
| DATA-01..03, CM-02 (projects) | B | `projects.rs` tests: create, save (commit per save, no commit when unchanged), load, list, exports not committed, invalid netlists and paths refused. Round trip without host data (`editor.test.ts`). |
| INV-08 | B | netlist.json is derived from the geometry and stored with it. On open it is compared, and a disagreement is reported (`editor.test.ts`). |

### Added beyond the requirements

- 555 timer, behavioural. Its frequency is within 5 % of 1.44 / ((R1 + 2·R2)·C).
- Linear regulators 7805, 7809, 7812, AMS1117 and LM317. Regulation within 1 %; dropout and
  input current checked.
- Transient start with discharged capacitors (SPICE uic), cross-checked against ngspice.
- Hover readout of net, voltage and current.

### Model limits (stated in the in-app help)

- No junction capacitances in diodes and transistors.
- Level-1 MOSFETs, fitted for power types.
- Op-amp supply current is not modelled.
- Regulators have no current limit or thermal model.
- 555 output levels are NE555 typical.

## 3a. Version 0.2.1: your feedback of 13 October 2026

| Request | Status | Evidence |
|---|---|---|
| Collisions between wires: ask and propose options instead of merging automatically | B | A new wire that passes through a pin or wire end, or runs along a wire, is marked and the user chooses: connect, route around (dashed preview) or cancel. Moving, rotating, pasting or placing parts asks when a pin lands mid-wire or on another pin, or a part would be shorted. The default can be changed (ask / route around / always connect). Tests: `editor.test.ts` (detection, detour), browser tests for wire and move collisions. |
| Design entry next to the results window; layout options as in LTspice | B | Results below (tile horizontally) or beside (tile vertically), resizable splitter (mouse and keyboard), maximise either pane, part library and properties panels on and off, kept between sessions. Layout menu, buttons and Ctrl+Alt keys. Browser test checks the geometry of both tilings, the splitter, maximise and persistence. |

## 3b. Version 0.2.2: your feedback of 13 October 2026 (second round)

| Request | Status | Evidence |
|---|---|---|
| The potentiometer slider does not work | B | Cause: the slider took its position from the stored value, and the live preview re-drew it at the old position during the drag; on release the old value was stored again. The slider now keeps its own position while dragged, previews live, and stores the value once on release (one undo step). Same fix in the Simulation tab's Controls. The wiper can also be dragged on the sheet. Browser tests drag both sliders and the wiper, and use the keyboard. |
| Check all parts and items | B | `tests/parts.test.ts`: every one of the 26 parts, and every model each offers (3 diodes, 5 Zeners, 5 LED colours, 5 BJTs, 5 MOSFETs, 4 op-amps, 6 regulators, 555), in a test circuit with a known answer; a check fails if a library part is not exercised. Browser test: places every part, changes every property, runs all four analyses on the full sheet, and uses every toolbar, Layout and view-toolbar item. |
| Rotate with Ctrl+R | B | Ctrl+R rotates clockwise, Ctrl+Shift+R and Shift+R counter-clockwise, anywhere in the view (the page is not reloaded). Browser test. |
| Standard pan, zoom and rotate tools | B | Pan tool (H), zoom-area tool (Z), zoom to the selection (Shift+Home), zoom 100 % (1), Shift+wheel pans; a view toolbar on the canvas (pan, zoom in, zoom out, fit, rotate either way); toolbar buttons for rotate both ways, mirror and flip (Y). Browser test. |

Defects the checks found, all fixed:

- **Op-amp output limits.** The clamp assumed a fixed diode drop, so the output went past the
  stated swing as the overdrive grew; the "ideal" model went 0.11 V beyond its supply rail.
  The clamp is now sharp: within 0.1 V of the stated limit.
- **LM358 low-side swing.** Its description says the output reaches V− + 0.1 V, but the model
  stopped 1.5 V above V−. It now follows the description.
- **A part left on its own stopped the simulation.** A capacitor or resistor connected to
  nothing made the matrix singular in practice ("time step too small", "no DC operating point").
  Such islands are now tied to ground at one point, which carries no current and so changes no
  result. A test checks that the rest of the circuit gives the same answer with and without them.
- **Misleading messages.**
  - A ground symbol that is not connected was reported as "no ground symbol"; the message now
    says it is not connected.
  - A reference already in use was refused without a word; the field now says so.
  - Two parts with one reference (possible from an edited file) now stop the simulation with a
    message, instead of merging their connections.

## 4. Usability (section 22 step 4)

See usability.md: two scripted scenarios with timings, and the issues they found (all fixed).
The run with a person is yours (U).

## 5. Open before the Increment 2 gate

1. **Sign 0.2.2:** a new signing kit (same steps as for 0.1.0). It replaces 0.2.0 and 0.2.1.
2. **Your look at it:** install 0.2.0 over 0.1.0, open the tutorial and two examples, and tell
   me what is missing or unclear.
3. Carried over from Increment 1:
   - VAPP-01;
   - the VAPP test kit;
   - the human usability run;
   - the self-hosted runners;
   - tags v0.1.0 (and v0.2.x) need a session that may push tags.
