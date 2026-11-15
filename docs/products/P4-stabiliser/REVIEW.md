# P4 stabiliser 1 kVA: independent review and resolutions

The review was made on 15 November 2026 by a reviewer who had not taken part in the design. It
read the circuit source, the design notes, the DFMEA, the product documents, the board and its
parts list, and the simulation tests. It confirmed these against the parts list and the circuit:

- the terminals, the thresholds and the output table;
- the commissioning test points;
- the restart delay (RD · CD · ln 5 = 7.6 s).

It found 3 blockers, 9 major findings and 8 minor ones. Every finding was checked against the
sources. Four needed the owner's decision:

- **D51:** interrupt the input about 60 ms at each tap change.
- **D52:** a wide-range AC-DC module, and sense transformers rated for 300 V or more.
- **D53:** the control is treated as live, with no PELV claim; its 0 V is bonded to PE at a
  stud.
- **M6:** fixed wiring with a 1P+N breaker.

Each finding was resolved as below, in the circuit, the simulation tests and the documents of
this package.

## Blockers

| # | Finding | Resolution |
|---|---|---|
| B1 | At every power-up all six relays pull in with the sense filter empty, so the 150 V tap gets the full input: 153 … 200 % flux, saturation, large inrush. The linear model could not show it. | **Fixed in the circuit.** An input relay K8 now feeds the tap chain. It stays open until a power-good comparator (1 MΩ, 470 nF) finds the sense settled (about 0.76 s) and the tap is latched. Test: "power-up with the product's timing" (K8 never closed with the lowest tap). DFMEA S-5. |
| B2 | The protection was not independent: it acted through the delay relay's driver, so one shorted transistor or one welded contact defeated it. | **Fixed in the circuit.** The protection has its own output relay K9, in series with K7, with its own driver and its own delay comparator. Test: "two faults: K1 stuck on and the output relay's driver shorted": K9 keeps the load off. DFMEA S-1; type test TT-5. |
| B3 | The output's PE ran through 0.3 mm board traces. | **Fixed.** X5 (PE in) and X8 (PE out) are now 4 mm² DIN-rail PE terminals, joined at a PE stud on the chassis. The board's control ground goes to the stud by one conductor from its terminal X9 (D53). No output earth current flows on the board. |

## Major

| # | Finding | Resolution |
|---|---|---|
| 1 | The relay chain does not rule out two taps connected while an arc persists on NO; inrush at reconnection not considered. | **Fixed (D51).** A tap changes only while K8 is open. The six comparators' outputs are latched in CD4013 flip-flops; a change opens K8, the new tap is latched about 25 ms later, and K8 closes again at about 63 ms. Test: "a tap changes only while the input relay is open". The reclosing inrush is type test TT-10; the gap is TT-11. |
| 2 | The OUTPUT LED stayed on with the thermal cut-out open. | **Fixed.** The LED is fed from the cut-out's return (VTC). |
| 3 | The board insulation is not PELV: only clearance was checked, relay coil-to-contact 3.8 mm, the cut-out's leads inside the winding. | **Resolved by D53.** The PELV claim is withdrawn from the circuit note, the design notes and the installation guide. The control is treated as live; the cut-out is ordered with double-insulated leads. |
| 4 | The relay footprint (Songle SRD) may not fit the Song Chuan 832A; coil power assumed. | **Open, for the prototype.** The maker's site blocks automated downloads; the owner has been asked for the 832A datasheet. Until then the footprint is provisional (ASSEMBLY.md section 2 asks for a check before soldering). The supply is sized for nine coils of 0.9 W with margin (15 W module). |
| 5 | The small transformers ran above their rated voltage (up to 300 V continuously, 400 V with a lost neutral). | **Fixed (D52).** The 12 V supply is an IRM-15-12 module (85 … 305 V AC) behind a T 1 A fuse. The sense transformers are 400 V / 24 V parts. |
| 6 | One-pole switching, but a plug was allowed: an unpolarised plug puts Q1 in N. | **Fixed.** Q1 is now a C10 1P+N breaker (ABB S201-C10NA), and the installation guide allows fixed wiring only. |
| 7 | The commissioning load test at 230 V puts no load current through the winding. | **Fixed.** COMMISSIONING.md section 7 tests 30 min at 140 V and 15 min at 300 V, and tap changes under load. TT-1 runs at 140 V and 300 V. |
| 8 | The overvoltage trip was never tested in the field. | **Fixed.** COMMISSIONING.md 5.3 … 5.5: the trip is made with RV3 and measured as a ratio (0.882 of VREF2), and VOV and VUV are measured. Repeated in the yearly maintenance. |
| 9 | Opening the load does not remove the cause of overheating; the cut-out's reset was not specified; "S-7 done" was premature. | **Fixed.** The cut-out now feeds the coil of K8 as well as K7, so a hot transformer is switched off. It is specified as self-resetting (ASSEMBLY.md section 1). DFMEA S-7 is marked open until TT-1 and TT-2 have been run. |

## Minor

| Finding | Resolution |
|---|---|
| The calibration was absolute (SENSE = 2.000 V), so the TL431 tolerance added | Now a ratio to each reference: SF / VREF and SF2 / VREF2 (COMMISSIONING.md section 3). |
| The upper limits disagreed (255 V protection, 253 V promised); FAULT does not light just outside 140 … 300 V | The documents now say: the steps keep the output at 253 V or below; the protection backs this up at 255 V; FAULT corresponds to an input outside about 124 … 310 V. |
| Stale design notes: BC547B, 1.5 µF, 230/27 V, "two 470k + 68k" | Corrected in POWER.md and in the circuit's comments; POWER.md has a section on the redesign. |
| The snubber claim was overstated; no snubber across K7 | The tap relays now switch without current; the snubbers stay as contact protection. K8, the one relay that switches load current, has its own snubber (without it, the simulation showed a spike when the magnetising current is broken). K7 and K9 switch the load only with K8 closed; their life is part of TT-4. |
| "30 A for a 4.5 A load"; the 60-year life figure extrapolated; the stress check below 1 kVA | The documents give 7.1 A at 140 V. The life claim is replaced by type test TT-4. |
| No product timing in the tests; protection window edges not simulated | The power-up test now uses the product's power-good timing. The restart delay remains scaled (220 nF) to keep the runs short; its full length is commissioning step 2.4 and TT-6. In the simulation the trimmer setting reads about 2.5 % high (window about 185 … 249 V). Each unit's window is set and measured at commissioning (5.3 … 5.5). |
| README reported DRC "0 / 0" with 203 warnings; ASSEMBLY.md gave paths not in the repository | The board is re-routed and checked for this package (see README). ASSEMBLY.md says the paths are those of the package. |
| The tap nets T1 … T7 share names with the transformer references; the X2 capacitor listed as 630 V and 275 V AC | **Kept.** The tap names match the transformer's own tap markings. The documents always say "tap T1" or "transformer T1". The capacitor is one part: an X2 275 V AC film capacitor (TDK B32922C3104). The 630 V in the schematic is the voltage the stress check holds it to (up to the input's peak, about 425 V at 300 V input, across the open input relay). |

## Also added (the reviewer's "missing for the electrician")

- **The autotransformer specification:** flux at the worst-case taps, section current, inrush,
  no-load loss, and the cut-out's rating and insulation (ASSEMBLY.md section 1).
- **A ratio check of the taps,** in place of a resistance check that a normal meter cannot make
  (ASSEMBLY.md section 3).
- **Enclosure, standoffs, glands, torques, PE stud and rating plate** (INSTALLATION.md
  sections 4 and 5).
- **Safe isolation** before every wiring change in the commissioning, including the cut-out test
  (COMMISSIONING.md 5.7).
- **The C10 / D10 breaker choice** after measuring the inrush (INSTALLATION.md section 1, TT-10).

## Found while fixing

The protection relay K9 was first delayed by an RC on a Darlington's base. At 194 V input the
relay was driven slowly through its pull-in and chattered, and the simulation could not
proceed. Its delay now goes through a comparator against the protection's reference, so the
relay is switched hard.
