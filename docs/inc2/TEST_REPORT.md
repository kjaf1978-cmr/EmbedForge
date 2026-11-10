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
  - signed the media (0.2.9 signed 16 October 2026, section 1a);
  - installed the result and looked at it (section 4);
  - ~~approved the gate~~ (decision D19, 14 October 2026: approved; Increment 3 started).

## 1. Evidence summary

| Check | Where | Result |
|---|---|---|
| Rust core tests | `cd core && cargo test --locked` | 63 passed, 1 ignored |
| Tauri shell tests, incl. project storage | `cd app/src-tauri && cargo test`, clippy `-D warnings` | 10 passed, 0 warnings (0.2.3) |
| UI unit tests: schematic core, editor, examples, simulator, every part | `cd app/ui && npm test` | 870 passed, 77 skipped (27 October, on the final P7a/P7c circuits; 815 passed after 0.2.9, 17 October; the charger tests are split over three files that skip each other's cases, the long inverter runs need `npm run test:long`) |
| Inverter DFMEA runs (P7a, P7b) | `cd app/ui && CKPT=<dir> npm run test:long` | P7a and its 24 V and 12 V units (P7c): all passed on the final circuits of October 26, at −10 … +60 °C and with aged electrolytics (section 3j); P7b: all passed (section 3i) |
| — of which SIM-04 against ngspice 42 | `tests/sim.ngspice.test.ts` | 55 cases agree (18 reference circuits, 13 cases at −20 to 125 °C, 12 example schematics, 12 part decks), plus the FFT against ngspice's (0.2.5) |
| Browser tests, incl. axe in both themes and four usability scenarios | `npx playwright test` | 43 passed (0.2.9, and again 17 October with `PW_CHROMIUM=/opt/pw-browsers/chromium`); 41 passed, 3 consecutive runs (0.2.6) |
| CI on GitHub-hosted runners | `core`, `ui`, `package` | green on the Increment 2 commits (section 2) |

## 1a. Signed releases (SEC-02, TEST-04)

### 0.2.9 (current)

Signed by the owner on their own PC, 16 October 2026, from the signing kit "NETApps-signing-kit"
of CI run [38907996230](https://github.com/kjaf1978-cmr/EmbedForge/actions/runs/38907996230)
(commit 0a72a51). `embedforge-sign` signed each medium, then verified it against the built-in
release keys. Its `signed/RESULT.txt`:

| Medium | Components | `medium.json` SHA-256 |
|---|---|---|
| raspios-aarch64 | 3 | `127794c3a6846fed86349ced3acab914efd69fe892613482156fc1c35ef38ffd` |
| ubuntu-x86_64 | 4 | `fac2c11f168328cc69ecb94ac6606aa311de109bfa400616e119043af4362139` |
| windows-x86_64 | 1 | `3523b5aa6aaf8a2d6f6a2dddfd18adff356d4e8046b0df567664582eeaa24329` |

All three: PASS.

### 0.2.8

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

## 3h. Inverter P7a and the simulator faults it found (16–17 October 2026)

The 50 Hz-transformer inverter (POWER.md, P7a) is the largest circuit so far (384 parts). Its
DFMEA runs found design faults, now fixed and listed in DFMEA.md section 5, and these faults
in the simulator, each fixed with the unit suite passing afterwards:

- **Op-amp model:** the output clamps were voltage sources tied to the supply pins. A
  saturated op-amp pushed its clamp current into V+ (an unpowered 12 V rail sat at 3 V), and
  every op-amp rail counted as driven, so ±12 V rails drawn with power symbols floated. The
  clamps now follow the rails through buffers, with 1 Ω so the two clamps of an unpowered
  op-amp cannot draw unbounded current.
- **Comparator model:** the output transistor driven into saturation through 1k converged
  poorly at every switching edge; the output is now a MOSFET (same switching point, 25 Ω on).
- **Power-on start:** MOSFET capacitances were held at 0 V like ordinary capacitors; with a
  charged bus that shorted every MOSFET (205 kA at t = 0). They now follow the circuit.
- **Trapezoidal ringing:** a capacitor current that flips sign at a similar size on three
  steps gets one backward-Euler step (the charger's reversed-PV case carried ±1.7 A through its
  battery for ever; that test failed before the fix).
- **Newton:** 100 iterations in a transient (50 were too few where a comparator output enters
  saturation, and the step then shrank until the matrix lost precision); the error message
  names the unknown that did not converge.
- **SPICE export:** RAIL_+12V and RAIL_−12V had the same name.
- **Stress check:** a regulator's output current is checked as its average (its rating is a
  continuous one); a switching MOSFET's RMS current against its continuous rating and its peak
  against a pulsed rating, taken conservatively as twice the package-limited current.
- **New:** a transient can store one point per print step (`thin`) for long switching runs;
  electrolytic capacitors have an optional ESR; the IR2184's SD pin; 1N5408 with a DO-201AD
  footprint.
- **Relay contact at a current zero:** a relay can be drawn with `zc` so its contact opens
  only when its current passes zero, as an AC contact's arc goes out. Breaking a motor's 85 A
  at once gave a 717 V spike that no real contact makes. The decision to open is now taken
  once per accepted step (it was taken before the step was accepted, so the contact never
  opened); tests/devices.test.ts checks the contact opens at 63.2 ms with `zc` and at 55 ms
  without.

Inverter runs on the final design (17 October; each 3 to 90 minutes):

| Test | Result |
|---|---|
| drawing: ERC clean, every connection drawn, text readable | passed (default suite) |
| I-2 battery reversed | passed (default suite) |
| I-1 connecting the battery (150 ms) | passed |
| I-8 41 V, 45 V; I-9 62 V; I-11 95 °C: no start | passed |
| 48 V, 58.4 V, 85 °C: starts | passed |
| start-up at 5 kW, 140 ms: 230 V ± 3 %, THD < 3 %, 50 Hz, no DC, no overshoot, stress check | passed |
| I-10 sense open: protection trips and latches (100 ms; the 21 ms filter trips about 60 ms in) | passed |
| I-4 short circuit: limit, overload timer, stress check | passed |
| I-7 5 kW at 58.4 V: stress check | passed |
| I-4 motor start at half load: limit holds, nothing trips, output recovers, peak below 130 % | passed |

The start-up run gave 229.5 V, THD 2.5 %, primary mean current −0.6 A and steady. Its first
stress check flagged only the test bench's load resistor (rated 1.5 kW for a 5 kW load); rated
6 kW, the run passed.

Measurement note: long runs store a point every 5 µs. That is fine for the output and the
currents, but too coarse for the mean of the 20 kHz bridge nodes, so the DC check uses the
primary current.

## 3i. D32: magnetics, temperature, tolerances and ageing; inverter P7b (18–24 October 2026)

Decision D32: effects that can be modelled (magnetic saturation, temperature, tolerances, ageing)
are designed out, not left to the prototype. Both inverters were verified across −10 … +60 °C
ambient (power junctions at 125 °C at the hot corner), with saturating cores for every magnetic
part, worst-case tolerances of every threshold (tests/tolerances.test.ts) and electrolytics at
their end of life (80 % capacitance, twice the ESR).

Simulator, new or changed (each with the unit suite passing afterwards):

- **Saturating cores:** inductors and transformers take a saturation current (`isat`); the flux
  follows a sharp knee and levels off at about 1.3 × l·isat; backward Euler near the knee only;
  the convergence check relative to isat (1 pA could not be met while a magnetising current
  crossed zero). tests/magnetics.test.ts: flux curve, inrush, overvoltage, against the linear
  model below the knee.
- **Temperature per part** (`tj`, the power semiconductors' junctions) and **resistor
  tolerances** (`tol`, in Monte Carlo and the worst-case table).
- **IGBT capacitances** from the datasheets (Cies, Cres, Coes), as the MOSFETs already had:
  without them a switching leg moved the high-frequency unit's floating 381 V side in
  femtoseconds.
- **Convergence:** damped Newton steps after 30 iterations (an op-amp output cycling between its
  limits); up to six restarts of a time point from differently sized backward-Euler steps; a
  MOSFET's convergence check across vds = 0 (an IGBT's internal MOSFET, off, flipped sign every
  iteration); no truncation-error limit from a history that spreads by less than the solver's
  tolerance (an IGBT's gate capacitance capped every step to 10⁻¹⁴ s and two runs crawled for
  hours).
- **Checkpoints** for the long runs (CKPT=<directory>): the whole state every 15 minutes, a run
  cut off by a restarted container resumes; the waveforms in single-precision chunks.
  tests/checkpoint.test.ts: resumed, the same waveforms as straight through (within 1 nV from
  the engine's state, within single precision from the files).

Design changes found by these runs (DFMEA.md I-4, I-5, I-14, H-7, H-20):

- **Soft start 47 ms** (470 nF) instead of 22 ms: the 50 Hz unit overshot to 355 V peak at
  −10 °C (limit 351 V), the loop's averaged sense could not follow the faster reference.
- **Anti-windup:** the voltage loop's integrator on the clamped node.
- **Instantaneous output voltage limit** (about 355 V peak, a comparator on the rectified sense
  stopping the bridge as the current limit does): the loop's amplitude passes the 70 Hz sine
  filter half a cycle late, and after a motor start the 50 Hz unit's output swung to 408 V, its
  transformer saturated (580 A magnetising) and the overvoltage protection latched it off. A
  1.2 T transformer core did not help and was not kept.
- P7b: the current transformer resets through a 24 V 5 W Zener within a 4 µs blanking; the bus
  overvoltage levels corrected (425 / 404 V); closed-loop detectors for the hybrid modulation;
  a DC-DC overload timer.
- P7a, found by the 24 V and 12 V units (P7c, D33): the DC servo's reset empties both its
  capacitors (it restarted off-centre, and the 12 V unit's core saturated every other half
  cycle); a flux servo (a second integrator into the square's mean) drives the start's flux
  offset to zero instead of holding it; its op-amp shares an LM358 with the output voltage limit
  (no spare). The 48 V unit's long runs below are being repeated on this circuit; the column
  shows the October 20–24 results unless marked.

Long runs on the final circuits (October 20–24; the 50 Hz unit's runs 1 to 2 hours, the
high-frequency unit's 2 to 16 hours):

| Test | 50 Hz unit (P7a) | High-frequency unit (P7b) |
|---|---|---|
| start-up at 5 kW, 27 °C: 230 V ± 3 %, THD < 3 %, 50 Hz, no DC, no overshoot, stress check | passed (re-run on the October 25 servo: passed) | passed |
| the same at +60 °C (junctions 125 °C) | passed | passed |
| the same at −10 °C | passed | passed |
| the same with end-of-life electrolytics | passed | passed |
| the sine bridge alone at 5 kW (bench bus) | — | passed |
| connecting the battery (I-1, H-1) | passed | passed |
| battery window and heatsink: no start (I-8, I-9, I-11, H-16) | passed | passed |
| 5 kW at 58.4 V: stress check (I-7, H-8) | passed | passed |
| short circuit at the output (I-4, H-7) | passed | passed |
| motor start, locked rotor 85 A for 50 ms (I-4, H-7) | passed | passed |
| loop sense open: protection trips and latches (I-10, H-10) | passed | passed |
| bus feedback lost (H-3), bus shorted (H-4) | — | passed |

## 3j. P7c: the 50 Hz-transformer inverter's 24 V and 12 V units (D33, 24–27 October 2026)

The 24 V 3 kW and 12 V 1.5 kW units come from the 48 V drawing (`inverterLF({ cells: 8 | 4 })`,
`LF_VARIANTS` in src/eda/inverters.ts) and run the same DFMEA tests at the D32 corners
(tests/inverterlv.test.ts). Their first runs found faults that the 48 V unit's margins had
hidden; the shared fixes went into all three units, so the 48 V unit's long runs were repeated.

Design changes found by these runs:

- **DC servo** (all units; DFMEA I-5): its input resistors scale with the bus (24 V 237k, 12 V
  118k) to keep the loop's gain; its reset empties both capacitors (QDB), so it restarts at
  VME = VMID (with one, the 12 V unit's square started 7 % off its triangle and the core
  saturated every other half cycle); a **flux servo** (UFX, a second integrator into the square's
  mean) drives the start's flux offset to zero instead of holding it (the 24 V unit's primary
  still carried 12.5 A DC after 0.3 s).
- **The square's high half from VME** (all units, D34): the servo's 50 Hz ripple no longer
  modulates the square's amplitude (second harmonic 1.2 % → 0.55 %).
- **Average-type output overvoltage protection** (all units, D35; DFMEA I-10): a resistive
  divider and an LM358 precision rectifier, the rectified average over 67 ms, trip at about
  265 V r.m.s. With the loop's sense lost the 12 V unit's output became a near-square at
  283 V r.m.s. but only 356 V peak, just under the old peak-type trip, and nothing tripped.
- **12 V unit:** its control on its own 9 V (LM2940-9.0; on the battery the PWM triangle and
  every threshold moved with the bus ripple, single cycles of the output carried up to 15 V
  mean); transformer ratio 36.9 (6.25 V primary, D35); a 28 mF bus (6 × 4700 µF 35 V: with
  4.7 mF the current limit of a motor start rang it between 5 and 17 V and the high cut-out
  stopped the bridge when the motor dropped); pre-charge through 1 Ω and a 60 A diode.
- **Test corrections:** I-1 bounds the pre-charge resistor's current (the battery also charges
  the control supply's input for microseconds); EN's high level by the control rail; the 12 V
  unit's THD bound is the product specification, 5 % (D34: 3.2 % after the improvement, mostly
  the third harmonic of the square's filter residue and the bridge at 13 V).

Long runs on the final circuits (October 26–27; 1.5 to 4.5 hours each on a loaded machine):

| Test | 48 V 5 kW | 24 V 3 kW | 12 V 1.5 kW |
|---|---|---|---|
| start-up at the rated load, 27 °C: 230 V ± 3 %, THD (3 %; 12 V 5 %), no DC on the primary, no overshoot, stress check | passed | passed | passed |
| the same at +60 °C (junctions 125 °C) | passed | passed | passed |
| the same at −10 °C | passed | passed | passed |
| the same with end-of-life electrolytics | passed | passed | passed |
| connecting the battery (I-1) | passed | passed | passed |
| battery window and heatsink: no start (I-8, I-9, I-11), fully charged battery | passed | passed | passed |
| rated load at the highest battery voltage (I-7) | passed | passed | passed |
| short circuit at the output (I-4) | passed | passed | passed |
| motor start at half load, locked rotor for 50 ms (I-4) | passed | passed | passed |
| loop sense open: protection trips and latches (I-10) | passed | passed | passed |

## 3k. P7c long runs, D40–D42: the 12 V high-frequency unit's three failures (4–9 November 2026)

Long runs of the 24 V and 12 V high-frequency units on commit 5ba652c: 8 passed, 3 failed, all in
the 12 V unit. The default 2 GB Node.js heap ran out after about 15 h in four runs; with 5 GB
(10 GB for H-7 motor start) they completed and passed (D40: the long runs use a larger heap).

| Test | First result | Cause | Change |
|---|---|---|---|
| H-4 bus shorted (0.5 Ω) | × 8 MOSFETs over their 390 A pulsed rating (427 A) | ratio 48: the shortest pulse the limit can end ratchets the output inductor to about 18 A, 854 A on the primary in two MOSFETs per switch | three MOSFETs per switch in the 12 V unit: about 290 A each; H-4 ✓ (274 s) |
| H-7 short circuit | × bridge current 28.0 A, bound 27.2 A | the bound scaled with the window (× 90/69); the overshoot (diode recovery at each turn-on, the comparator's 2.6 µs at 0.81 A/µs) is the same about 8 A in every unit | D42: bound = window + 21 A in every unit (48 V unchanged at 90 A) |
| H-7 motor start | × 27.7 A, bound 27.2 A | as above | as above |

Found on the way (D42): the long runs read every 5 µs, so the stress check missed peaks between the
points. The simulator now keeps any step 2 % beyond the extremes so far (with its neighbours) and
integrates power, r.m.s. and rectified means over every step; a 3 ms run at 0.1 µs confirmed the
integrals (8.4 W against 8.6 W; the 5 µs points read 6.4 W). With it:
- the high-frequency sine bridge's leg A bootstrap diode carried 132 A at the first low-side pulse
  (UF4007, 30 A surge): 2.2 Ω in series, all three units (about 7 A);
- the half-bridge driver model had no undervoltage lockout: an IGBT switched on from an empty
  bootstrap capacitor ran half on (590 W); the IR2184's 8.0/7.4 V lockout on VB − VS is modelled;
- the reversed-battery tests (I-2, H-2) saw the connection's charging ring (0.2 A for 20 µs, and a
  few-ns ring into the auxiliary supply): they check conduction from 1 ms on and the charge of the
  connection (below 1 µC).

Unit suite after the changes: every file passes (the charger and ngspice files run separately;
ngspice is not installed here, its comparisons skip).

Screening (D38) after the changes, full circuit 140 ms:

| Unit | Output | THD | Bus | 15 V | Most stressed |
|---|---|---|---|---|---|
| 12 V 1.5 kW | 225.9 V | 2.49 % | 377.6 … 385.0 V | 14.84 … 14.90 V | U11B Iout 95 %, C11–C14 V 86 % ✓ |
| 12 V, battery falling to 11.38 V | 225.7 V | 2.44 % | 377.1 … 385.4 V | 14.82 … 14.90 V | as above ✓ |
| 24 V, 48 V | running | | | | |

The long runs of all three high-frequency units follow the screening; the 50 Hz-transformer
units' long runs are repeated with the full-resolution stress check (D42).

## 3l. P7d: inverter units in parallel and as three phases (9–10 November 2026)

`tests/inverterlink.test.ts`. The link box: three 50 Hz references 120° (±0.5°) apart at 49.8 Hz,
each loop's current sink regulating with six units' LEDs in it — passed. The phase-locked loop
(the 50 Hz, sine and link blocks of two units, ideal supplies, the second unit's filter
capacitors 5 % off and its oscillator 2 % off): locked to the reference within 0.7 s, the two
sines 0.03–0.06° apart (a 5 % filter tolerance alone gives 7°) — passed. The whole systems (two
50 Hz-transformer units in parallel at 10 kW, three units as 3 × 400/230 V, a unit stopping in the
three-phase system, two high-frequency sine bridges in parallel) run for hours each in the
long-run queue; results follow in this section.

## 3m. P4b: thyristor-tap stabilisers 5, 10 and 15 kVA (9–10 November 2026)

`tests/stabiliserT.test.ts` (D41). Found in simulation and designed out: (1) the comparators'
pulled-up outputs chose the 150 V tap at start-up (the winding's top tap rang to 1 kV): a 0.3 s
power-up hold on the gate drivers; (2) a window on the input current could not tell a pair that
had stopped from a slow zero crossing: with a pair failed short a second tap fired onto it
(1.5 kA in the section): the change now waits for every pair to block (a voltage-sense
optocoupler per pair, the seven in series); (3) 600 V opto-triacs and 630 V snubbers saw over
600 V at 300 V in: FOD4218 (800 V), 470 Ω, 1000 V snubbers; (4) the sense resistors' 0.54 W:
1 W parts; (5) a ZW comparator over its 16 mA: 1k in its discharge path.

Results: 16 of 18 passed — steady state at 140, 230 and 300 V for 5 kVA, at 230 and 300 V for
10 and 15 kVA (output within ±2 % of V_in·230/tap, the thyristors' peak within the rated input's,
no part over its ratings); tap changes under full load (sag 230 → 195 V, swell 230 → 250 V,
power factor 0.8) at 5 and 15 kVA without two taps ever conducting; a pair failed short (no
second tap, the output opened by the stuck-change protection); the heatsink at 95 °C (output
never closes); no load (the change still happens). Open: 10 and 15 kVA at 140 V in, where the
output contactor stayed open in the test (being investigated).

## 3n. P5: surge protection (10 November 2026)

`tests/surge.test.ts`, all 6 passed. Mains house (TN-C-S): with a type 1+2 SPD at the main
board, type 2 in the sub-board 10 m on and type 3 at the socket 15 m further, the appliance sees
at most 854 V L–N, 815 V L–PE and 600 V N–PE for 12.5 kA 10/350 µs and 20 kA 8/20 µs into the
service line and for a 6 kV / 3 kA combination wave at the socket; every SPD within its peak
current and energy. Without the type 3 SPD the socket surge reaches 5.75 kV at the appliance.
PV house: with Y varistors at the array and the charger and a 5KP130CA across the charger's
input, 5 kA 8/20 µs induced into the array cable gives 195 V across the charger's input (its
MOSFETs 200 V); without the TVS 205 V — so the P6 charger now has the TVS. (A spark-gap model
chattered under an ideal surge current source; the type 1 SPD is the varistor-based kind.)

## 3o. P9: pump control, irrigation, gate controller, trimmer, block machine (10 November 2026)

**Library check (new, `tests/modellookup.test.ts`):** every design's part values must name a
model of the library. Until now an unknown value silently simulated as the list's first model.
The check found one: the inverters' TL074 had always simulated as the generic op amp (1 MHz).
TL074 is now a model (the TL072's JFET input, 3 MHz). The inverters' quick tests pass with it;
their long runs are being repeated (section 3p).

**Irrigation** (`tests/irrigation.test.ts`, 5 passed): power-up with a register output high
(no valve current, the cut-off latched until the firmware clears it); a valve switched on and off
(0.3 A, the drain below 30 V); a valve shorted while on (latched within 10 µs, the MOSFET above its
11 A pulse rating for under 2 µs); a 2 kV surge on an idle valve's cable (the drain below 60 V); a
1 kV surge on a sensor cable (the multiplexer's input within −0.3 … 3.6 V). Found and fixed:
- the outputs could conduct at power-up: a 100 kΩ pull-up on OE was loaded down to 0.7 V. The
  cut-off now trips itself at power-up;
- the gate pull-down transistor carried 190 mA, over a BC547B's rating: it is now a 2N2222A.

**Gate controller** (`tests/gate.test.ts`, 7 passed): ERC; opening to the open limit switch,
which stops and brakes the motor with the firmware still commanding it (start 10 A, running 2.5 A);
an obstacle while closing (stall 10.5 A, latched about 80 ms later); the motor cable shorted (29 A
peak, latched within 20 µs of 25 A); the beam broken while closing; both relays commanded (no
current); power-up with RUN high (no motion). No product part is over its ratings in any of these.

**Pump control** (`tests/pumpcontrol.test.ts`, 5 passed with LONG=1, the clock 1000 times
faster): the normal cycle (starts below LOW, stops at HIGH, never near OVERFLOW, no part over its
ratings); the HIGH electrode's cable broken (OVERFLOW stops the pump and latches FAULT); the source
running dry (the pump stops within about 0.3 s and restarts only after the lockout once the water
is back); a burst pipe (FAULT after the maximum run); the start delay after power-up. Found and
fixed: the dry lockout applied after every power cut (8.5 min instead of the 8 s start delay). It
now applies only after a dry spell, using spare gates of the CD4001s.

**Trimmer** (`tests/trimmer.test.ts`, 7 passed with LONG=1): ERC; full trigger (the soft start
raises the duty, the cycle-by-cycle limit holds the motor at about 43 A while the head
accelerates, no trip); half trigger; the head jammed (the limit holds 43.5 A, the jam latch trips);
the battery at 26 V and 95 °C at the heatsink or the motor (no start); the trigger released while
running (the head braked to a third of its speed within 20 ms). Found and fixed:
- every period gave a 2 µs drive pulse at zero duty (a NOR latch's both-low state): the drive is
  now NOR(Q̄, SET);
- the reset line reached only 5.7 V: its pull-down is now 100 kΩ;
- the fault latch tripped at power-up: a 50 ms power-up blanking;
- releasing the trigger with both contacts changing at once put 836 A through the MOSFET: the
  trigger switch must break before it makes, and battery-low detection is faster;
- the jam timer never tripped, because the mean shunt current stays low in a jam: it now times the
  current limit acting, through a buffer (unbuffered, it disabled the limit: 110 A).

**Block moulding machine** (`tests/blockmachine.test.ts`, 8 passed): ERC; no automatic start at
power-up; reset, outputs and the valve's fast release; E-stop while running; RESET held through an
E-stop (no restart); one E-stop channel bridged; K1 welded from power-up (the reset is refused);
K1 welding while running (the E-stop still stops, the next reset is refused). Found and fixed:
- the reset capacitor alone could not pull the contactors in: a reset relay K3;
- a held RESET restarted the machine after an E-stop: the capacitor now sits ahead of the
  mirror contacts and has its own charging path;
- a capacitor on the safety rail kept the valves on after an E-stop: removed.

**P4b at 140 V input:** the 10 and 15 kVA output contactors never closed. Their 230 V coils got
213 V there (93 %, close to the 85 % pull-in). All three ratings now use wide-range
200–277 V AC/DC coils (Siemens 3RT2…-1NP30). All 18 long runs repeated and passed: steady
state at 140, 230 and 300 V for each rating, sags and swells (resistive and power factor 0.8), the
shorted thyristor pair, the hot heatsink and no load.

## 3p. Boards: the routing pipeline and its checks (D43–D45, 10 November 2026)

Every board in `hardware/` is generated from its schematic (`tools/kicad`), routed by Freerouting
in up to three stages and checked twice: KiCad's design rule check, and an independent geometric
check of every pair of copper items against the net-class clearances and the insulation
distances (`route.py`, `geo_check`). A board is packaged only with no errors and no unconnected
pads in both. Found and fixed while doing so:
- **KiCad's check reported clean boards that were not.** Run from Python directly, KiCad 7's
  scripted check skipped the clearance test, and a second check in the same process repeated the
  first board's result (a search script found "clean" paths that crossed three nets). The check
  now runs in a fresh shell process each time, and the geometric check runs beside it; their
  errors are added together.
- **Copper added after routing was filled with the wrong rules.** The post-routing step loaded
  the board without its project file, so the pours were filled with KiCad's default clearance
  instead of the net classes' (47 errors on the 12 V power board). The project file is now copied
  beside the board first.
- **Stage 3's tracks lay under the pours.** The pours were filled before stage 3 added its
  tracks and were not filled again (a ground track through the bus plane). They are now filled
  after stage 3.
- **Links Freerouting leaves** (P4b's two boards, the 12 V high-frequency battery-side board, the
  pump board, the high-frequency 380 V power board) are drawn in the design (`post`), each path
  checked through the same post-routing step that builds the final board.
- **Boards too dense to route** were split: the P4b control into a thyristor-pair driver (seven per
  unit, the triac drivers isolating it from the logic) and a logic board; the high-frequency
  inverter's control at its isolation barrier into a battery-side and a 380 V board.

**24 V and 12 V inverters.** The 24 V units' parts and connections match the 48 V boards exactly,
only values differ (`tools/kicad/variant.ts` checks parts, footprints and nets): each 48 V board's
folder holds the 24 V parts list. One part needed a change for that: the bridge supply's coupling
capacitor (2.2 µF at 48 V, 10 µF at 24 V) now takes the 15 mm box on all units. The 12 V units differ
in topology (a 9 V supply, three MOSFETs per switch on the high-frequency unit, six bus
capacitors) and have their own boards.

**P9 products with their microcontrollers.** The irrigation controller became a main board (ESP32
module, supplies, the cut-off) and an 8-zone channel module (up to eight on a ribbon bus); the gate
controller and the block machine carry an Arduino Nano (5 V, the level their outputs were
simulated at) and the gate a TSOP38238 IR receiver. The block machine's board now holds the whole
machine: the mixer and vibrator contactors (their mirror contacts in the reset chain), four valves,
six sensors and START; its tests were repeated (8 passed). Found on the way:
- the block machine's 1 MΩ resistors that give the simulator a DC path on the 400 V nets were
  product parts and put those nets on the 24 V board: they are now simulation-only;
- an IC symbol with an even pin count put its pins half a grid off, and none connected (the
  74HC4051): pins are now on the grid;
- the parts library check found three symbols never simulated in a test (SCR, optotriac, CD4020)
  and the MBR20100CT diode without its forward range; all added;
- a broken bus wire could leave a channel module's register outputs enabled during a fault: each
  module now pulls OE up (DFMEA IR-6).

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
