# P5 surge protection: independent review and resolutions

Review: an independent, read-only review of the design at commit b8e481a (16 November 2026),
given the code, tests and documents only. It re-ran the tests and reproduced every documented
number with its own probes, and re-read the DEHN data of all five products from DEHN's store.
Verdict then: parts well chosen and the DEHN data faithful; the verification not ready (it tested
only the favourable cases); two blockers on the PV side.

Resolutions below are on the commit after this file was written; every number is from
`app/ui/tests/surge.test.ts` or a probe run on the final circuit.

## Blockers

| # | Finding | Resolution |
|---|---|---|
| B1 | A surge entering at the charger's end of the DC cable destroys the P6 input even with the charger's SPD: the SPD's Up (0.6–0.8 kV) is far above the 200 V MOSFETs, 209 V TVS and 250 V capacitors; at 2 kA the TVS took 10.4 kW. No test covered it | **Resolved.** Reproduced (also 5–10 kA destroyed QPV). Two 68 µH air-core decoupling chokes (DC+, DC−) between the charger's SPD and the charger, in P5's charger PV enclosure: the SPD takes the surge, the chokes limit what reaches the charger. Tests now inject at both ends: 10 and 20 kA at the charger's end, input 149 / 167 V, every part within ratings; without the chokes over 200 V at 5 kA |
| B2 | With the charger stopped (QPV off) the PV protection fails at In: the P5 model had the input capacitors across PV+/PV− and QPV always on, unlike P6 | **Resolved.** The model now is the charger as built (CIN to the battery negative, QPV/QPV2 as real MOSFETs on or off, the input capacitors held at the battery's voltage through the buck's body diode). Reproduced: 286 V on QPV at 10 kA. **P6 change:** a 47 µF film capacitor across QPV and QPV2 holds PV− as CIN holds PV+. Tests: both QPV states at 10 and 20 kA at both ends (8 cases), QPV at most 162 V; without the capacitor over 200 V |

## Major

| # | Finding | Resolution |
|---|---|---|
| M1 | The PV design depends on a bond of the battery negative to PE that nobody specifies; with it the array is functionally earthed, and a DC+ to frame fault is a 42 A short, not what SP-8 said | **Specified.** The bond exists in the system: the inverters bond the battery negative to PE with their output's N (`inverters.ts`). The installation guide now names it, and the bonding conductor's continuity is a commissioning step. SP-8 rewritten. **Open (P6 change, DFMEA SP-8, AP high):** earth-fault detection of the functionally earthed array (IEC 60364-7-712) |
| M2 | The lightning test loaded the type 1+2 to 54 % of its Iimp; the docstring said 25 kA, the code injected 12.5 kA; no L+PEN case; the building-strike case claimed but not modelled | **Resolved.** Cases now: 25 kA 10/350 µs shared by L and PEN (a strike on the line); 22.5 kA into L, sized so the DEHNshield carries its Iimp (12.5 kA, asserted); a strike on the building (25 kA into the earthing), simulated and documented as needing an external LPS (equipment below 2.5 kV only). Docstring corrected |
| M3 | The type 2 did almost nothing: its ACI pair (varistor + series gap) fired near 1.74 kV in the model; the result rested on assumed capacitances | **Resolved.** The ACI gap fires at 1.26 kV, so the pair fires at the product's Up of 1.5 kV (documented; the N–PE gap of the same model fires 0.24 kV early and does not reach it in the tests). Sensitivity tests: cable capacitance × 0.5 and × 1.5, no Y capacitors, leads 0.3 m: the equipment stays below 1.5 kV for every surge; leads 1 m: the main board exceeds 6 kV (asserted, why the 0.5 m rule) |
| M4 | The gap model could create energy (57 kA through an N–PE gap from 20 kA) | **Resolved, two causes.** (1) Engine: a burning gap was a voltage source behind 2 mΩ and drew a reverse current for one step when the loop voltage fell below its arc voltage; now an arc conducts only while its voltage exceeds the arc voltage in its direction (`engine.ts`, class Gdt). (2) Model: a cable's capacitance discharged through two gaps in series with no inductance; every SPD connection is now a lead (L, N and PE). Every mains test asserts that no SPD carries more than the largest surge injected (25 kA) |
| M5 | The PV model had no SPD leads | **Resolved.** 0.5 µH in each PV SPD's PE connection. The array's DC+ reaches 1.5–2.3 kV against its frame at 10–20 kA: the comparison with the chosen modules' rated impulse voltage is left open (INSTALLATION.md section 4) |
| M6 | Commissioning and maintenance treated the DEHNshield as pluggable | **Resolved.** DEHN describes it as prewired (the DEHNguard and DEHNrail as modular and pluggable). Remote contact: continuity in the healthy state; insulation test with it disconnected or at 250 V (IEC 60364-6); end of life: the whole device replaced. To confirm against DEHN's installation instructions |
| M7 | Earth-electrode test step unsafe: link removed without isolation; a clamp tester measures the PEN network in TN-C-S | **Resolved.** Supply isolated, locked off and proved dead; link removed under the network operator's rules; 3- or 4-pole method only; link refitted and checked before re-energising |
| M8 | RCDs and short-circuit ratings missing (PLAN checklist) | **Resolved.** SPDs upstream of any RCD, else an S-type RCD (DFMEA SP-11); the prospective short-circuit current against DEHNrail 6 kA (25 A gG), type 2 25 kA, DEHNshield Ifi 25 kA |

## Minor

| # | Finding | Resolution |
|---|---|---|
| 1 | "Maximum Up" overstated for the PV model | The PV varistor now clamps at the data sheet's Up at In (0.8 kV per path at 10 kA) and above it at lower currents: conservative at every current |
| 2 | SP-6 claimed L–PE below 1 kV at the socket | Rewritten from the results |
| 3 | SP-9 cited a test that does not check follow current | Cites review against the DEHN data; the model's representation stated |
| 4 | "Energy-coordinated with a type 3 within 10 m" misread; the "type 3 at least 5 m after the type 2" rule had no source | Rewritten: DEHN states the DEHNshield energy-coordinated with its Red/Line arresters and terminal equipment; the 5 m rule removed, the simulated lengths (10 m, 15 m) stated |
| 5 | The PEN on a PE terminal bonded to the DIN rail | The PEN on a feed-through terminal (PT 16 N, insulated from the rail), then the MET bar |
| 6 | Pass criteria rest on derived ratings (the type 3's 100 J, the PV varistors' 150 J) | Stated in the models' notes and POWER.md; the stress check's "derated" (above 80 %) is shown in the probes, only "over" fails a test |
| 7 | Stale counts and figures; catalogue URLs to a category page; the PEN terminal not a DEHN price | Counts and figures updated (TEST_REPORT 3n.3); URLs to the product-family pages; the terminal marked as an estimate |
| 8 | User manual: type 3 row vague; mains remote contacts not explained | Rows per device (flag, windows, lamps) |
| 9 | Commissioning 2.4 needs "no load"; the PV isolator must be 2-pole | Both added |
| 10 | PV model's bonding conductor 28 mΩ (16 mm²) against 6 mm² specified; an unspecified 10 Ω array earth | 77 mΩ (6 mm², 25 m); the separate array earth removed (the frame is earthed through the bonding conductor) |

## Also changed while resolving

- The PV model now places the surge source at either end and the charger in either state, and
  can simulate the fault latch opening QPV at full current (the chokes' energy goes into the new
  capacitor: QPV 82 V; without it the TVS takes 10.2 kW: DFMEA SP-10).
- ERC: a capacitor across a switch, or across a back-to-back pair, counts as the path for an
  inductive load's current when it opens (the voltage is checked by simulation); without the
  capacitor the chokes are still flagged.
- The parts list gains the two chokes (made to specification, estimate €120 each): PV side €964.

## Open after the review

- P6 changes (DFMEA SP-8, SP-10): earth-fault detection; the 47 µF capacitor across QPV/QPV2.
- Page references of the DEHN data sheets; the DEHNshield's terminal marking and
  non-pluggability against DEHN's installation instructions; the DEHNrail's circuit (its N–PE
  gap modelled at a derived 1 kV) against DEHN's circuit diagram; the DEHNshield's arc voltage
  (400 V, an assumption standing for its follow-current limitation).
- The modules' rated impulse voltage against 2.3 kV at their frame.
- The chokes as made: inductance and resistance at commissioning (step 3.4).
