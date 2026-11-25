# Plan to completion (D47, 15 November 2026)

One product at a time, taken to 100 % before the next is started. Parallel machines only for the
current product's own long runs. One session works on the branch.

## Definition of done (per product)

1. Schematic final: a wired circuit diagram (D28), ERC clean, every board matching it
   (`tools/kicad/check.ts`).
2. DFMEA verified by simulation on the final commit with the current simulator (long runs
   included), recorded in TEST_REPORT.
3. Firmware where the product has a microcontroller (D48: Arduino C++, PlatformIO, offline):
   documented source, host unit tests, offline build, the pin contract with the schematic.
4. Boards: DRC 0, fabrication files, assembly drawing.
5. Costed parts list (every part with manufacturer part number and price).
6. Documents: design document, user manual, assembly guide, commissioning procedure,
   maintenance and FAQ, DFMEA closed.
7. Independent review (a fresh review of schematic, boards, firmware and documents).
8. Package (one structured zip) with its test-report section, and the owner's sign-off.

## Order and estimate

| # | Product | Estimate | Note |
|---|---|---|---|
| 1 | P3 change-over (1P, 3P+N) | 2–3 days | **signed off 15 November 2026** (package c6ddfd3; open for the prototype: interlock kit fit, type tests). D64 (19 November 2026): the boards reworked for the TMOV14's datasheet body (it collided with F4/T2 and T3/RV5 on the old footprint). D69 (25 November 2026): the parts lists order TR5 fuses (the boards' footprint), not 5 × 20 fuses and holders |
| 2 | P4 stabiliser 1 kVA | 1–2 days | **signed off 15 November 2026** (package 6df257f; relay footprint and TMOV body from the datasheets (15 November); open for the prototype: autotransformer to specification, type tests). D69 (25 November 2026): the parts list orders a TR5 fuse for F1 (the board's footprint), not a 5 × 20 fuse and holder |
| 3 | P4b stabilisers 5/10/15 kVA | 2 days | **signed off 17 November 2026** (D59, package 14a4c41; contactor taps per D58; open for the prototype: the 15 kVA coil data, KI's life and reclosing current, autotransformer to specification, type tests) |
| 4 | P5 surge protection | 1 day | **signed off 17 November 2026** (D61, package 037f847; the two P6 changes go into P6; DEHN data-sheet checks and the modules' impulse voltage open for the installation) |
| 5 | P9 pump controller | 1 day | **signed off 18 November 2026** (D62, package fc8f3ab; SELV control, independent protection with its own contactor; open for the prototype: the type tests) |
| 6 | P9 gate controller (Nano) | 4–5 days | **signed off 19 November 2026** (D63, package cb8e61f; firmware D48; after the review: power-on reset, a trip drops the relays, 0.1 s blanking, STOP, the photo-beam tested before each close, a supply of at least 10 A; open for the prototype: the type tests, the shunt's sense on built boards) |
| 7 | P9 block machine (Mega 2560) | 4–5 days | after the independent review (25 November 2026): D65 a certified safety relay for the E-stop and the guards (monitored reset on release, cross-short detection, the contactors' mirror contacts in its feedback loop); D66 the outputs switched on their +24 V side with diagnostics and read-back, the 0 V bonded to PE; D67 an Arduino Mega 2560 (the inputs for pressure, oil temperature, the breakers' trips and the read-back) |
| 8 | P9 irrigation (ESP32) | 4–5 days | D50: interface decided then |
| 9 | P9 trimmer drive | 1 day | |
| 10 | P9 grinder drive | 1–2 days | |
| 11 | P6 MPPT charger | 2–3 days | |
| 12 | P7a inverters, 50 Hz transformer | 4–5 days | long runs after the TL074 model and D42 |
| 13 | P7b inverters, high frequency | 5–6 days | |
| 14 | P7d parallel and three-phase | 3–4 days | link box board |

About 7–8 weeks. Then the offline app (about 6 months): A in-app PCB (Increment 3), B boards
and flashing (4), C catalogue and design (6), D natural language and offline model (5),
E emulation (7), F documentation generator (8), G Increments 9–10 and Increment 1's
leftovers, H release.

## Checklist from P3 (applied to every following product)

Each of these was found in P3, and each is checked in every product from P4 on:

- Every terminal tagged IN, OUT, CTRL, PE or EXT. A terminal that carries power names its wire
  size (`wire`), so it is bought as a DIN-rail block, not as a PCB terminal.
- Wire sizes in `panel.csv` per net. A tap to the board from a power circuit is fused for its
  wire.
- Separate net classes for separate sources, and insulation distances between them. DRC 0 with
  those rules.
- The board check (`tools/kicad/check.ts`): parts, footprints, nets, parts list and wiring list
  current.
- Thermally protected varistors on the mains (TMOV), and fuses specified by characteristic and
  breaking capacity.
- Sense circuits calibrated where a part's tolerance (a small transformer's no-load voltage) moves
  a threshold.
- Contactor and relay ratings stated by utilisation category (AC-1 or AC-3), and interlocks by
  mirror contacts plus a mechanical interlock where two sources meet.
- Documents: user manual, installation (earthing, RCD, short-circuit rating, upstream
  protection), assembly, commissioning with expected values and a record sheet, type tests.
- An independent review before sign-off; every finding resolved or listed as open.

Added from P4 (D51–D54), checked from P4b on:

- Power-up: nothing switches power until the sense has settled; the safe state while it settles
  is stated and simulated with the product's timing.
- An independent protection has its own switching element (its own relay or contactor), and a
  two-fault test (the control's switch stuck and its driver shorted) is simulated.
- PE never runs through board copper from input to output: a PE stud, the control's 0 V bonded
  to it by one conductor.
- The control supply and sense transformers are rated over the whole input range (and a lost
  neutral where it can occur).
- A thermal cut-out switches off the cause (the transformer), not only its load.
- Isolation claims (PELV) only where creepage, clearance and the parts' own insulation prove
  them; otherwise the control is treated as live.
- Switching that a plug could reverse: 1P+N breaker and fixed wiring.

Added from P4b (D58–D60), checked from P5 on:

- An interlock that must hold under a single fault relies only on mirror (NC) contacts, which
  IEC 60947-4-1 Annex F guarantees under a weld; NO auxiliaries show only that a part is closed.
- Every fault that matters is also simulated arising while running, not only from power-up.
- MOSFETs or transistors on a floating node: their drive is referenced to that node, and their
  gate voltages are checked in every state, including a coil's turn-off.
- A snubber goes where it cannot feed a de-energised winding (to N, not across an open switch).
- A check whose levels follow one rail takes its thresholds from the same rail.
- A sense that sees a different load during a switching gap is held through the gap (weak lines).
- Coil and contact suppressors are sized for the energy of each operation (TVS, not a 1 W Zener).
- Spare mains connector poles are bonded to a net (bondSpare).

Added from P9 (pump controller review, 17 November 2026):

- Documents use the designators of the schematic, the board and the parts list (the design's
  internal keys are renumbered when the sheet is drawn).
- A control that measures in water decides SELV or PELV from the installation: earthed metal in
  the water shorts a measurement referenced to PE.
- An independent protection has its own sensing, not only its own switching element, and acts
  through its own contactor where a welded contactor would defeat it.
- Commissioning load tests at both ends of the input range, where the windings carry current;
  an overvoltage check in the field.
- A slowly charging RC never drives a relay coil or a gate directly: a comparator switches it.

Added from P9 (gate controller review, 18 November 2026):

- A part code in the parts list names the part's value (a single code for a range of values gave
  1 mΩ shunts for 10 mΩ).
- The supply can deliver every current a protection must see (a current cut-off at 7 A needs a
  supply that does not fold back below the stall current).
- A power-on reset is simulated with a real supply's rise, not a step; a reset of the
  microcontroller alone does not reset the board.
- After detecting an obstacle the drive always moves back before it locks out (the force is
  removed).
- A blanking or filter time is measured in simulation against the standard's limit (EN 12453:
  0.75 s), and the trip time is stated, not the time constant.
- A presence sensor (photo-beam) that the safety relies on is tested before each hazardous move.
- A clear or reset input acts on its edge, so a stuck output cannot hold a protection released.
- "Works whatever the firmware does" is claimed only for what is simulated with the firmware's
  outputs stuck and pulsed; the rest is listed in the DFMEA.
- The first powered move at commissioning checks the direction with the load uncoupled.

Added from P9 (block machine, second review, 25 November 2026):

- A part the footprint library does not list is an error, never a default package (an IRF4905
  landed on a TO-92 footprint).
- Supply nets that must not be bridged (a safety rail, the field 24 V, the raw supply) leave the
  board on their own block with an empty pole between each, and never next to an output.
- A clear or stop input acts on its release edge, and a protective enable stays off while it is
  held; the tests inject the faults the check exists for (an output stuck on) in every state.
- A behavioural model of a certified device reproduces its power-on behaviour, and its test
  releases what it claims to release.
- Every hazardous motion has two independent stopping means; a single contactor needs a second
  one in series, both monitored.
