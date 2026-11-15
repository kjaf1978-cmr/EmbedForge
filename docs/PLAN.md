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
| 1 | P3 change-over (1P, 3P+N) | 2–3 days | |
| 2 | P4 stabiliser 1 kVA | 1–2 days | |
| 3 | P4b stabilisers 5/10/15 kVA | 2 days | |
| 4 | P5 surge protection | 1 day | D49: certified PV SPD modules |
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
