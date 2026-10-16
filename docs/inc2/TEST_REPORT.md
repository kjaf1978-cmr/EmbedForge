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
  - signed the media (0.2.8 signed 16 October 2026, section 1a);
  - installed the result and looked at it (section 4);
  - ~~approved the gate~~ (decision D19, 14 October 2026: approved; Increment 3 started).

## 1. Evidence summary

| Check | Where | Result |
|---|---|---|
| Rust core tests | `cd core && cargo test --locked` | 63 passed, 1 ignored |
| Tauri shell tests, incl. project storage | `cd app/src-tauri && cargo test`, clippy `-D warnings` | 10 passed, 0 warnings (0.2.3) |
| UI unit tests: schematic core, editor, examples, simulator, every part | `cd app/ui && npm test` | 789 passed, 19 skipped (0.2.9; the charger tests are split over three files that skip each other's cases) |
| — of which SIM-04 against ngspice 42 | `tests/sim.ngspice.test.ts` | 55 cases agree (18 reference circuits, 13 cases at −20 to 125 °C, 12 example schematics, 12 part decks), plus the FFT against ngspice's (0.2.5) |
| Browser tests, incl. axe in both themes and four usability scenarios | `npx playwright test` | 43 passed (0.2.9); 41 passed, 3 consecutive runs (0.2.6) |
| CI on GitHub-hosted runners | `core`, `ui`, `package` | green on the Increment 2 commits (section 2) |

## 1a. Signed releases (SEC-02, TEST-04)

### 0.2.8 (current)

Signed by the owner on their own PC, 16 October 2026, from the signing kit "NETApps-signing-kit"
of CI run [38823996549](https://github.com/kjaf1978-cmr/EmbedForge/actions/runs/38823996549)
(commit ffeb095). `embedforge-sign` signed each medium, then verified it against the built-in
release keys. Its `signed/RESULT.txt`:

| Medium | Components | `medium.json` SHA-256 |
|---|---|---|
| raspios-aarch64 | 3 | `45b8e39a1636436c8b95bfe36e087645a45d4de524a7f0340d332531a9eba9e5` |
| ubuntu-x86_64 | 4 | `958fe65c025eed764114b0087e7a89d3ef77971e70df663e1193a5249dfb1dba` |
| windows-x86_64 | 1 | `b0b926e6192aaa111a1a676ac96d4931cbb794ebff9b135ba81100b71f59fce8` |

All three: PASS.

0.2.7 (CI run 38773481933) was built without the signing kit and was not signed; 0.2.8
supersedes it.

### 0.2.6

Signed by the owner on their own PC, 15 October 2026, from the signing kit "NETApps-signing-kit"
of CI run [38629508536](https://github.com/kjaf1978-cmr/EmbedForge/actions/runs/38629508536)
(commit ef73979). `embedforge-sign` signed each medium, then verified it against the built-in
release keys. Its `signed/RESULT.txt`:

| Medium | Components | `medium.json` SHA-256 |
|---|---|---|
| raspios-aarch64 | 3 | `0db7cf1c401a93692ed4927a58629f4677cf60a1bfed7d90cf1b2b77b006b002` |
| ubuntu-x86_64 | 4 | `bb588dde214218f837c138c213c36870c2cd535b4da2453ae1021f095a687c0c` |
| windows-x86_64 | 1 | `18d61f964ca0b059427fc85485590315e93d160e06cc264a9b58285ba962f1da` |

All three: PASS.

### 0.2.5

Signed by the owner on their own PC, 14 October 2026, from the signing kit "NETApps-signing-kit"
of CI run [38622393138](https://github.com/kjaf1978-cmr/EmbedForge/actions/runs/38622393138)
(commit 5cb9bf0). `embedforge-sign` signed each medium, then verified it against the built-in
release keys. Its `signed/RESULT.txt`:

| Medium | Components | `medium.json` SHA-256 |
|---|---|---|
| raspios-aarch64 | 3 | `0801b4e6967df9b9b0005b0bcc042a28d601797cdf9c6f4cab78571f50c1788f` |
| ubuntu-x86_64 | 4 | `d6205a0d5fc07283bd486b816dbeda9e0f1230385a45dcbfcc04dd5b1ea2ce67` |
| windows-x86_64 | 1 | `6a6a62673fb22151bc486cf80e86b946bf730a41a16829d155c6e42fc3f0cb78` |

All three: PASS.

### 0.2.4

Signed by the owner on their own PC, 14 October 2026, from the signing kit "NETApps-signing-kit"
of CI run [38556623808](https://github.com/kjaf1978-cmr/EmbedForge/actions/runs/38556623808)
(commit 2ea8bec). `embedforge-sign` signed each medium, then verified it against the built-in
release keys. Its `signed/RESULT.txt`:

| Medium | Components | `medium.json` SHA-256 |
|---|---|---|
| raspios-aarch64 | 3 | `64e8a50c6e744d25aaa2bd35d34905576d3bfec77631ad15261d8f3679008d0d` |
| ubuntu-x86_64 | 4 | `5e164a469bb89a6c523726a76c6de588870bfb3d9a43520b01cd7a483db05c44` |
| windows-x86_64 | 1 | `baeabc40c2c5f81af2c6dd25ed5442f6d58382ac5622f5baa6f8c3f97821a535` |

All three: PASS.

### 0.2.3

Signed by the owner on their own PC, 14 October 2026, from the signing kit "NETApps-signing-kit"
of CI run [38464644649](https://github.com/kjaf1978-cmr/EmbedForge/actions/runs/38464644649)
(commit 5b9f9fb). `embedforge-sign` signed each medium, then verified it against the built-in
release keys. Its `signed/RESULT.txt`:

| Medium | Components | `medium.json` SHA-256 |
|---|---|---|
| raspios-aarch64 | 3 | `d7d61ae155e5f0c98e58663c0328b85403bde56328ea3ac97a4481ce7c1adbd8` |
| ubuntu-x86_64 | 4 | `da5681d50b129b2f570553e8eb19997e43091f95a07891b785f8e4412c8060d8` |
| windows-x86_64 | 1 | `2cca162c05271ac05543ee18c4cc65263bbeedb6c362e498c3cff40f191a7242` |

All three: PASS. The next commit (5c0c3a4) only reformats Rust code; it changes no behaviour.

### 0.2.2

Signed by the owner on their own PC, 13 October 2026, from the signing kit of CI run
[38454327509](https://github.com/kjaf1978-cmr/EmbedForge/actions/runs/38454327509)
(commit b035130). `embedforge-sign` signed each medium, then verified it against the built-in
release keys. Its `signed/RESULT.txt`:

| Medium | Components | `medium.json` SHA-256 |
|---|---|---|
| raspios-aarch64 | 3 | `102474b514665d86b8a336683278544341fa3963865d6828afe156f4531366c6` |
| ubuntu-x86_64 | 4 | `faced4fb8d337a02b7dc335349fe36b9d7ca6463cd44ac5d01113ddba0f3fc6e` |
| windows-x86_64 | 1 | `1a01e6c4250140b6f64ab122b58daae9c9a0809e82938c5d257dfe2ab10ddeac` |

All three: PASS. 0.2.2 replaces 0.2.0 and 0.2.1, which were not signed. The signed media stay on
the owner's PC; the builder never held the key.

## 2. CI (TEST-01)

- The `ui` workflow installs ngspice on the runner, so SIM-04 runs on every push.
- Commit 8fde01e passed every hosted job: core, ui, and package, including the Ubuntu and
  Windows install jobs.
- The first editor commit (5b89cc8) failed the ui job: the Increment 1 browser tests still
  looked for the old "Welcome" view. They were updated in the next commit.

## 3. Per requirement

| Req | Status | Evidence |
|---|---|---|
| UI-24 | B | Start screen with new, tutorial, saved projects, 15 examples with previews and hints, roadmap. `editor.test.ts` checks every example: connected, ERC-clean, simulates. Browser tests open examples, run the tutorial and save/open projects. |
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
| SIM-04 | B | 55 cases against ngspice 42 within 1 % or 1 mV / 1 µA, on every CI run (section 1). SPICE export of the schematic. The 555 is the exception: it has no SPICE primitive, and its export line says so. |
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

## 3c. Version 0.2.3: your requests of 13 October 2026 (third round)

| Request | Status | Evidence |
|---|---|---|
| Keep improving Increment 2 (gate held) | B | Parameter sweep (.step), FFT view with THD, bill of materials, text notes, single-frequency AC analysis, property limits, and the parts below. |
| Rename to NETApps Electric Simulation, with a logo | B | Decision D18. Every visible name changes: window, start screen, help, installer file, Start menu, Programs and Features, Linux menu, signing kit. The projects folder becomes Documents/NETApps Projects; an existing EmbedForge Projects folder is moved (Tauri test). Internal names stay, so the update installs over the old version. The logo is original. **Note:** the name is close to NetApp, Inc.'s trademark; check it before a public release. |
| Transformers, including three-phase | B | Transformer (turns ratio, inductance, coupling, winding resistances). Three-phase transformer Dyn, Yyn, Yd and Dd from line voltages. Three-phase source. Tests: 10:1 ratio, isolated secondary, line voltages 230/400 V and 120°, the 30° shift of Dyn and Yd; ngspice agrees on 2 reference circuits and 2 schematic decks. |
| Motors: DC, AC single- and three-phase, servo | B | DC motor (dynamic: no-load speed, stall current and start-up time constant tested; ngspice agrees). Single- and three-phase induction motors at a set slip (current against the equivalent circuit; balanced lines, no neutral current; locked rotor). Hobby servo (−90°, −45°, 0°, +90° from the pulse width; 0.1 s per 60°). |
| Relay (from the improvement plan) | B | Pull-in at 75 %, drop-out at 25 % of the coil current; transient hysteresis tested; ngspice agrees (CSW switch). |

Found and fixed on the way:
- A shorted ideal tacho output made the circuit unsolvable (found by the every-part browser
  test): the output now has 100 Ω.
- A coupling element without terminals broke the island tie of 0.2.2: fixed, with a test.
- The rule check flagged optional pins (tacho, delta N): they are now marked optional.

Two new examples, DC motor start-up and three-phase supply with a Dyn transformer, are checked
like the others: rule check clean, simulated, and cross-checked against ngspice.

## 3d. Version 0.2.4: your requests of 14 October 2026

| Request | Status | Evidence |
|---|---|---|
| Continue improving Increment 2 | B | SPICE `.model` import (diodes, Zeners, BJTs, level-1 MOSFETs; used and ignored parameters shown; ngspice agrees with imported 1N4001 and BC337 models). Tolerance analysis (Monte Carlo): seeded, Gaussian or even, per-kind tolerances; spread of a divider within the worst case. Logic gates (AND, NAND, OR, NOR, XOR, NOT, Schmitt) and a D flip-flop, with truth tables, Schmitt thresholds and divide-by-two tested, plus an example. |
| Smoke analysis | B | Stress tab and checks: every part against its maximum ratings (datasheet absolute maximums of the built-in models; rating properties on passives and switches), peaks for voltages and currents, averages for power and rectifier current, derating level 80 % by default. Tests for resistor power, diode and LED current, capacitor voltage, reversed electrolytics, transient averages; every example within its ratings. |
| Multi-component parametric analysis | B | The parameter sweep takes up to three properties; every combination runs (at most 50). An operating point gives one curve per combination of the further properties. Tests: order of the combinations, divider formula, three properties in a transient, the run limit. |

Found and fixed on the way:
- **555 started at power-on:** the first point mixed the new latch state with the old
  solution, a 0.73 A output spike that does not happen (found by the stress check). t = 0
  is now solved again.
- **Three-phase example:** its 100 Ω loads dissipate 530 W each, so they are rated 1 kW. It
  now switches on at t = 0: from the DC operating point the windings short the supply. The
  Simulation tab warns about this for transformers and AC motors.
- **Transient step control:** the time step now follows the truncation error of every
  capacitor and inductor, as in SPICE. The three-phase switch-on agrees with ngspice; run
  times are unchanged.
- **Simulation tab:** Controls and Probes come before the sweep and tolerance sections, so the
  live controls stay in view.

## 3e. FFT view accuracy check (owner request, 14 October 2026)

Checked against three references; the checks are now unit tests (`tests/fft.test.ts`) and an
ngspice test (`tests/sim.ngspice.test.ts`):

| Check | Result |
|---|---|
| Our FFT against NumPy's FFT of the same samples | identical to 1e-14 V |
| 2 V sine on a bin / between bins (1050 Hz, 100 Hz bins) | 2.0000 V / 1.9995 V (−0.002 dB) |
| Square wave ±1 V, odd harmonics 4/(πn) | within 0.001 dB; THD 42.881 % (exact 42.879 %) |
| Tone 40 dB below a 1 V tone | −40.00 dBV; leakage floor −120 dBV |
| Diode clipper, harmonics 3 to 11 against ngspice's fft | within 0.01 dB (test limit 0.1 dB); even harmonics −164 dBc (ngspice −70 dBc, from its zero padding) |
| Clipper amplitudes against a plain NumPy DFT of whole periods | equal to 4 decimals |

Three defects found and fixed:
- **Frequency between bins:** the frequency of a tone between bins was rounded to the nearest
  bin (1050 Hz shown as 1100 Hz). It is now the centre of the main lobe (1050.1 Hz), and THD
  looks for the harmonics at multiples of it.
- **Aliasing:** the FFT always used 8192 points, so a long view aliased (a 10 kHz tone over 1 s
  appeared at 1808 Hz). The length now follows the waveform's points in view, up to 2²⁰; beyond
  that each sample averages its interval. The spectrum states its resolution and highest
  frequency.
- **Overlays:** parameter-sweep and Monte Carlo transients were resampled to 2001 points. They
  now keep the finest run's resolution (up to 20 000 points).

## 3f. Version 0.2.5: your requests of 14 October 2026

| Request | Status | Evidence |
|---|---|---|
| Continue with the app development | B | **Temperature analysis:** the circuit temperature (SPICE `.temp`) sets V_T, the diode and bipolar saturation currents (XTI, EG), Zener breakdown, MOSFET KP and VTO, and resistor temperature coefficients; the temperature can be stepped in the parameter sweep. 13 ngspice cases at −20, 85 and 125 °C agree; unit tests against the SPICE formulas (−2 mV/K for a silicon diode at 1 mA). **Pulse measurements:** rise and fall time (10–90 %), period, duty cycle, overshoot and undershoot, checked against a trapezoidal pulse train, RC rise time RC·ln 9, series-RLC overshoot and the 555's period and duty cycle. |
| TVS diode, IGBT and other parts common in modern designs | B | TVS diodes SMAJ5.0/12/24/33 A and CA (stand-off, breakdown and clamping voltage at the peak pulse current within 6 % of the datasheet, both directions for CA); IGBTs IKW30N60T, IKW40N120T2 (with diode) and a generic one (VCE(sat) at the rated current within 0.3 V of the datasheet; the diode conducts in reverse, the generic one blocks); PC817 optocoupler (IC = CTR·IF within 8 %, saturation, off); TL431 and TLV431 (reference within 0.5 %, with a divider twice it); bridge rectifiers DB107, KBP206, GBU8K (both half-waves, 100 Hz output); NTC thermistor (exact B formula at −20, 25, 85 °C); fuse (stress check flags an RMS current above the rating); and more models: BAT54, SS34, BD139/BD140, AO3400, AO3401, IRF540N, LM324, MCP6002, NE5532, MCP1700-3.3, L78L05. Stress ratings for all of them. 5 new ngspice decks (TVS both kinds, bridge with smoothing, IGBT gate sweep, optocoupler transfer, TL431 regulator) agree. |

Found and fixed on the way:
- **LED temperature drift:** with SPICE's silicon band gap (1.11 eV) an LED's forward voltage
  would rise with temperature; LED models now have the band gap that gives the typical
  −2 mV/K, and Schottky models the usual 0.69 eV.
- **The parameter sweep help** still said "at most 25 runs"; it is 50.
- **Browser test race:** the navigator test (UI-01/02/03) typed its arrow keys before the tree
  had taken the focus after Ctrl+1, and failed once in 3 runs; it now waits for the focus.

## 3g. Version 0.2.6: your request of 14 October 2026

| Request | Status | Evidence |
|---|---|---|
| Show a movement of servos and motors proportional to the torque they produce | B | The simulation reports each motor's torque and speed and each servo's angle: DC motor T = k·i_a (stall torque k·V/R_a and no-load speed checked); induction motors T = P_ag/ω_s from the air-gap power (three-phase within 1 % of an independent phasor solution of the equivalent circuit), averaged over one supply period; servo angle exact also with a loaded output. On the schematic the rotor turns at a rate proportional to the torque, with an arc and a torque/rpm label; the servo horn points at its angle. Transient playback (play, pause, time slider) shows any moment of the run; LEDs follow it too. New servo example. Browser test of the playback. |

Found and fixed on the way:
- **ERC false warnings:** the floating-net rule had no DC paths for the parts added in 0.2.5
  (TVS, bridge rectifier, IGBT, optocoupler, TL431, NTC, fuse), nor for the servo's and the DC
  motor's outputs, so their nets were reported as floating. A test now checks that every part
  states its DC paths.

## 4. Usability (section 22 step 4)

See usability.md: two scripted scenarios with timings, and the issues they found (all fixed).
The run with a person is yours (U).

## 5. Open before the Increment 2 gate

1. ~~Sign 0.2.8~~ done 16 October 2026 (section 1a). Tags **v0.2.2** (b035130), **v0.2.3**
   (5b9f9fb), **v0.2.4** (2ea8bec), **v0.2.5** (5cb9bf0), **v0.2.6** (ef73979) and **v0.2.8** (ffeb095) need a session that may push tags
   (see item 3).
2. **Your look at it:** install 0.2.6 over the earlier version, open the tutorial and two examples, and tell
   me what is missing or unclear.
3. Carried over from Increment 1:
   - VAPP-01;
   - the VAPP test kit;
   - the human usability run;
   - the self-hosted runners;
   - tags v0.1.0 (and v0.2.x) need a session that may push tags.
