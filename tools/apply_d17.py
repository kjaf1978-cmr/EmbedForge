"""Apply decision D17 (owner feedback on 0.1.0, 13 October 2026) to the prompt: v3.8 -> v3.9.
Design tools first: schematic entry and circuit simulation become Increment 2, PCB layout and
routing Increment 3; the former Increments 2-9 follow in their old order as 4-10.
Every replacement must match exactly once; the script aborts otherwise."""
import sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / "docs" / "requirements"
t = (root / "EmbedForge_prompt_v3.8.md").read_text(encoding="utf-8")
R = [
("hdr", "# EmbedForge — Build Prompt (v3.8)", "# EmbedForge — Build Prompt (v3.9)"),
("hdr", "D14) in section 31; changes from v3.6 (decision D15) in section 32; changes from v3.7\n(decision D16) in section 33.",
 "D14) in section 31; changes from v3.6 (decision D15) in section 32; changes from v3.7\n(decision D16) in section 33; changes from v3.8 (decision D17) in section 34."),
("TB-03", "TB-03  Tier 2 boards (Increment 9):", "TB-03  Tier 2 boards (Increment 10):"),
("ACC-02", "       from Increment 5.\n       Prompt, verbatim:", "       from Increment 7.\n       Prompt, verbatim:"),
("UI-08", "UI-08  Schematic view, editable.",
 "UI-08  Schematic view, editable, with: (a) a part picker with search and categories;\n"
 "       (b) orthogonal wiring with automatic junctions; (c) net labels and power and\n"
 "       ground symbols; (d) move, drag with attached wires, rotate, mirror, copy, paste,\n"
 "       duplicate, delete and multiple selection; (e) automatic reference annotation;\n"
 "       (f) grid snap, zoom, pan and zoom-to-fit; (g) a property editor with\n"
 "       unit-aware values (10k, 4u7, 100n); (h) cross-probing of parts and nets through\n"
 "       the highlight bus (UI-02)."),
("UI-24", "UI-23  Context help in every view, linked to the offline documentation.",
 "UI-23  Context help in every view, linked to the offline documentation.\n"
 "UI-24  Start screen: new project, open project, recent projects, example projects and a\n"
 "       guided first-circuit tutorial. Every empty view shall state what the user can do\n"
 "       next and how."),
("ED-08", "       snapshot date.\n\n### 13.3 Code generation",
 "       snapshot date.\n"
 "ED-08  Manual design entry: the user shall be able to create and edit a schematic\n"
 "       directly (UI-08), through the same netlist commands as generated designs\n"
 "       (INV-08). Parts placed from the generic symbol library that are not catalogue\n"
 "       entries shall be marked \"not a standard part\" in the schematic and the BOM; a\n"
 "       design containing such parts cannot pass ED-07 or reach status Designed.\n"
 "ED-09  The electrical rule check for every schematic shall also flag: (a) unconnected\n"
 "       part pins; (b) nets with a single connection; (c) nets without a DC path to\n"
 "       ground; (d) voltage sources shorted or in parallel; (e) duplicate references;\n"
 "       each with a marker in the schematic linked from the ERC list.\n"
 "\n"
 "### 13.2A Circuit simulation\n"
 "SIM-01 The app shall simulate a schematic in-app: (a) DC operating point, with node\n"
 "       voltages and part currents shown on the schematic; (b) DC sweep of a source or a\n"
 "       part value; (c) transient analysis; (d) AC small-signal analysis with magnitude\n"
 "       and phase plots.\n"
 "SIM-02 Probes: voltage probes on nets, differential probes between two nets and\n"
 "       current probes on parts, shown in a waveform viewer with two cursors, zoom, and\n"
 "       the measurements minimum, maximum, average, RMS, peak-to-peak and frequency.\n"
 "SIM-03 Interactive parts (switches, push-buttons, potentiometers) shall be operable\n"
 "       on the schematic while simulation results are shown; results shall update\n"
 "       within 1 s for circuits within the DATA-04 limits on a Profile A host.\n"
 "SIM-04 The simulator shall be verified against ngspice on a reference circuit suite as\n"
 "       part of TEST-01, agreeing within 1 % or 1 mV / 1 µA, whichever is larger. The app\n"
 "       shall export the schematic as a SPICE netlist in the ngspice dialect.\n"
 "SIM-05 Every part in a schematic shall have a simulation model or be labelled \"not\n"
 "       simulated\" in the schematic and in the simulation results; a simulation shall not\n"
 "       run while an unmodelled part is connected without saying so.\n"
 "\n### 13.3 Code generation"),
("inc", """Increment 2: Tier-1 board definitions (TB-01, TB-02, TB-04); detection, drivers,
  flashing, SSH and local deployment (BRD-01..03, SS-04, HOST-07(b), SEC-01);
  board manager view (UI-16).
Increment 3: LLM integration; NL workspace and clarification (UI-04, NL-01..03);
  block and behaviour views (UI-05, UI-06); code generation (CG-01..03, SEC-04);
  LLM-01..06 and the first block templates; board capability-gap detection (the
  shortfall report of TB-05, used by NL-02(h)); GPU acceleration (HOST-07(a)).
  ACC-01(a) and ACC-02(a) shall pass; VAPP-06 clarification threshold shall be met.
Increment 4: parts catalogue (PC-01..05); electrical design (ED-01..07, TB-05
  resolution options); pin,
  schematic and breadboard views (UI-07..09); safety rules (SAF-01..04); Fritzing
  import/export.
Increment 5: component models and emulation (EM-01..08, EM-02A, EMU-01, EMU-02); emulation
  dashboard (UI-11); firmware self-test (CG-04). ACC-02(d) shall pass.
Increment 6: PCB and perfboard layout (PCB-01..09, UI-10); HAT+ EEPROM programming
  (BRD-04); VER-08..15; hardware
  versioning (CM-08); optional KiCad advanced mode (SS-06).
Increment 7: documentation generator, lint, traceability (DOC-01..12); code view,
  verification dashboard, assembly guide, history, exports (UI-12..15, UI-19); status
  model (ST-01..09). ACC-01 and ACC-02 shall pass completely.
Increment 8: update manager online and USB, per-project pinning (LIB-02, CM-05..07, CM-10,
  SS-09, SS-10, SEC-03); model editor (EM-04); guided and expert modes (UI-18);
  VAPP-06 all thresholds met.
Increment 9: Tier-2 boards (TB-03) with their toolchains and emulators; extended
  component-model coverage.""",
"""Increment 2: schematic entry and circuit simulation: start screen (UI-24); project
  files with the netlist and schematic geometry (DATA-01 for these artefacts, INV-08);
  editable schematic view (UI-08); generic symbol library with simulation models for
  the passive, source and semiconductor parts of EM-03; manual design entry (ED-08);
  ERC (ED-03 where it applies without a *target board*, ED-09); circuit simulation
  (SIM-01..05); schematic export to SVG, PNG and SPICE (UI-19 for this view).
Increment 3: PCB layout and routing: footprints for the Increment 2 symbol library
  (PCB-02); PCB and perfboard layout (PCB-01..09, UI-10); VER-08..15; hardware
  versioning (CM-08); optional KiCad advanced mode (SS-06).
Increment 4: Tier-1 board definitions (TB-01, TB-02, TB-04); detection, drivers,
  flashing, SSH and local deployment (BRD-01..03, SS-04, HOST-07(b), SEC-01);
  board manager view (UI-16); HAT+ EEPROM programming (BRD-04).
Increment 5: LLM integration; NL workspace and clarification (UI-04, NL-01..03);
  block and behaviour views (UI-05, UI-06); code generation (CG-01..03, SEC-04);
  LLM-01..06 and the first block templates; board capability-gap detection (the
  shortfall report of TB-05, used by NL-02(h)); GPU acceleration (HOST-07(a)).
  ACC-01(a) and ACC-02(a) shall pass; VAPP-06 clarification threshold shall be met.
Increment 6: parts catalogue (PC-01..05); electrical design (ED-01..07, TB-05
  resolution options); pin and breadboard views (UI-07, UI-09); schematic generation
  into the Increment 2 view; safety rules (SAF-01..04); Fritzing import/export.
Increment 7: component models and emulation (EM-01..08, EM-02A, EMU-01, EMU-02); emulation
  dashboard (UI-11); firmware self-test (CG-04). ACC-02(d) shall pass.
Increment 8: documentation generator, lint, traceability (DOC-01..12); code view,
  verification dashboard, assembly guide, history, exports (UI-12..15, UI-19); status
  model (ST-01..09). ACC-01 and ACC-02 shall pass completely.
Increment 9: update manager online and USB, per-project pinning (LIB-02, CM-05..07, CM-10,
  SS-09, SS-10, SEC-03); model editor (EM-04); guided and expert modes (UI-18);
  VAPP-06 all thresholds met.
Increment 10: Tier-2 boards (TB-03) with their toolchains and emulators; extended
  component-model coverage."""),
("tech", "- Emulation: simavr (AVR),",
 "- Circuit simulation (SIM-01..05): a native modified-nodal-analysis engine for\n"
 "  interactive use, cross-checked against ngspice (SIM-04); ngspice is bundled for the\n"
 "  accurate mode of EM-05. The schematic view may render as SVG within the DATA-04 limits\n"
 "  (crisp export, accessible elements); canvas or WebGL remains the baseline for\n"
 "  breadboard and PCB.\n"
 "- Emulation: simavr (AVR),"),
]
for fid, old, new in R:
    n = t.count(old)
    if n != 1: sys.exit(f"ABORT {fid}: expected 1 match, found {n}: {old[:70]!r}")
    t = t.replace(old, new)
t = t.rstrip("\n") + """

## 34. CHANGE LOG v3.8 → v3.9
Decision D17 (13 October 2026). After installing 0.1.0 the owner found no design entry,
routing or simulation and an unclear first use, and chose "design tools first", taking
features of products on the market into account.
| Finding | Decision | Change |
| --- | --- | --- |
| U-02 | D17 | Section 22: schematic entry and circuit simulation become Increment 2, PCB layout and routing Increment 3; the former Increments 2, 3, 4 (rest), 5, 7, 8, 9 become 4, 5, 6, 7, 8, 9, 10; BRD-04 moves with board handling to Increment 4. TB-03 and ACC-02 increment numbers follow. |
| U-02 | D17 | UI-08 detailed (a)–(h); UI-24 start screen; ED-08 manual design entry; ED-09 ERC for schematics; section 13.2A SIM-01..05 circuit simulation; section 21 simulation engine and SVG schematic rendering. |
| U-02 | D17 | Increment 1 gate: 0.1.0 delivered and signed; the user-executed items (VAPP-01, VAPP test kit, human usability run) and the self-hosted runners stay open as conditions carried into Increment 2. |
"""
(root / "EmbedForge_prompt_v3.9.md").write_text(t, encoding="utf-8")
print(f"OK: {len(R)} replacements + section 34")
