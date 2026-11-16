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
| 1 | P3 change-over (1P, 3P+N) | 2–3 days | **signed off 15 November 2026** (package c6ddfd3; open for the prototype: interlock kit fit, TMOV body, type tests) |
| 2 | P4 stabiliser 1 kVA | 1–2 days | **signed off 15 November 2026** (package 6df257f; open for the prototype: relay footprint and TMOV body against the datasheets, autotransformer to specification, type tests) |
| 3 | P4b stabilisers 5/10/15 kVA | 2 days | |
| 4 | P5 surge protection | 1 day | D49 and the DEHN mains SPDs done, reviewed 16 November (`docs/products/P5-surge`); open: design document, package, sign-off; two P6 changes recorded |
| 5 | P9 pump controller | 1 day | |
| 6 | P9 gate controller (Nano) | 4–5 days | firmware framework (D48) |
| 7 | P9 block machine (Nano) | 2–3 days | |
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
- Commissioning load tests at both ends of the input range, where the windings carry current;
  an overvoltage check in the field.
- A slowly charging RC never drives a relay coil or a gate directly: a comparator switches it.
