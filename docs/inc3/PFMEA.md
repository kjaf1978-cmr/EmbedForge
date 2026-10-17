# PFMEA and recommendations for production (decision D22)

Process failure mode and effects analysis for building the power designs (change-over,
stabiliser, MPPT charger; the inverters the same way) as products, and the recommendations
that keep the design and its performance stable and reproducible over the product life
cycle. Ratings S, O, D 1–10 and action priority as in DFMEA.md (AIAG-VDA 2019); D here rates
the process control that finds the defect before shipping.

## 1. Process steps

1. Incoming inspection of parts
2. Solder paste / through-hole insertion, soldering (wave or selective; hand soldering of
   power parts)
3. Cleaning and conformal coating
4. Mounting of power semiconductors on the heatsink
5. Wiring: terminals, crimps, cable glands
6. Calibration-free end-of-line test
7. Burn-in (sample) and climatic qualification (per design)
8. Packing, labelling, documentation

## 2. PFMEA

| # | Step | Failure mode | Effect | Cause | Prevention / detection (recommended control) | S | O | D | AP |
|---|---|---|---|---|---|---|---|---|---|
| P-1 | 1 | Wrong or counterfeit part (e.g. a 100 V MOSFET for the 200 V one, a 10 A relay for the 30 A one) | Early failure, protection does not work | Supply chain | Approved parts list with manufacturer part numbers from the BOM; buy only from authorised distributors; incoming check of marking and a sample measurement (Vds breakdown, relay contact rating marking) | 9 | 3 | 4 | M |
| P-2 | 1 | Resistor or capacitor out of tolerance, wrong E96 value | Thresholds shifted (trip at 250 V instead of 253 V) | Mix-up at the reel | Reels scanned against the BOM at the machine; first-article measurement of the threshold dividers | 7 | 3 | 3 | L |
| P-3 | 2 | Cold or cracked solder joint on a power terminal or heavy part (autotransformer, relays, TO-247) | Heating, intermittent contact, fire | Low heat on heavy copper; vibration in transport | Selective soldering profile qualified per board; mechanical fixing of heavy parts (screws, clips, adhesive); AOI and X-ray sample; pull test on the first boards | 9 | 4 | 4 | M |
| P-4 | 2 | Solder bridge or flux residue between high-voltage nets | Tracking, short in humid air (FF-39, FF-40) | Process | Creepage slots in the PCB; AOI; ionic contamination test (ROSE) on every batch below 1.56 µg NaCl/cm² | 9 | 3 | 3 | M |
| P-5 | 3 | Coating missing, too thin or on the relay/contactor contacts and connectors | Corrosion, dendrites; or relay contacts insulated | Masking errors | Coating with UV tracer, inspected under UV light; keep-out areas for relays, terminals and test points on the drawing | 8 | 4 | 3 | M |
| P-6 | 4 | Power device poorly coupled to the heatsink | Overheating: Tj far above 125 °C | Missing or folded thermal pad, wrong screw torque, burr | Torque-controlled screwdrivers or spring clips; ceramic or silicone pads (no paste that dries out); thermal check at end of line: heatsink-to-case temperature after 10 min at full load | 9 | 4 | 3 | M |
| P-7 | 5 | Terminal not tightened, crimp poor, aluminium cable without ferrule | Terminal heating, fire (FF-10) | Assembly / installer | Torque values on the label and in the guide; box-clamp terminals for Cu and Al; crimp height check; pull test sample | 9 | 5 | 5 | H |
| P-8 | 5 | Cable glands and vent not fitted, unused entries open | Insects, water (FF-41, FF-44) | Assembly | Glands from below, blanking plugs for unused entries, membrane vent; checklist with photo at packing | 7 | 4 | 4 | M |
| P-9 | 6 | Protection not working (missing part, swapped comparator inputs) | Unsafe product shipped | Assembly | **End-of-line test of every protection** (section 3), with a programmable source and load; no product ships without a passed record | 10 | 3 | 2 | L |
| P-10 | 6 | Interlock not effective (change-over) | Back-feed | Wiring of the auxiliary NC contacts | EOL test: force both coil drives on, check that never both contactors close | 10 | 2 | 2 | L |
| P-11 | 7 | Early-life failures (infant mortality: 52.6 % of off-grid failures in the first year, FIELD_FAILURES.md) | Field returns | Weak parts, process | Burn-in 24 h at 45 °C and full load on a sample of each batch (all units for the first batches); damp heat cyclic test (IEC 60068-2-30) and salt mist (IEC 60068-2-52) at qualification | 7 | 4 | 4 | M |
| P-12 | 8 | Wrong or missing label (max Voc, battery type, torque, wiring diagram) | Installation errors (FF-48) | Packing | Label generated from the design data; wiring diagram printed inside the cover | 7 | 3 | 3 | L |

## 3. End-of-line test (every unit; no adjustment needed: all thresholds come from fixed E96 values and a TL431)

| Design | Test | Pass |
|---|---|---|
| Change-over | Mains 230 V → K1 on after the return delay; 254 V and 194 V → K2 after the dead time; 18 V coil supply → both off; force both drives → never both closed | as in power.test.ts |
| Change-over 3P | additionally: one phase 0 V, one phase −12 % → back-up | as in power3*.test.ts |
| Stabiliser | Input 150, 190, 230, 270 V → output 230 V ± 6 %; force a tap relay on at 230 V → output stays off; LEDs | as in stabiliser.test.ts |
| Charger | PV simulator 112 V Voc, battery simulator 52 V → current, MPPT within 3 %; battery 56.4 V → CV 56.6 V ± 0.2 V; fast stop: battery opened while charging → output < 62 V; NTC open → no charge; overvoltage latch (raise the battery simulator to 61 V) → FAULT LED | as in charger*.test.ts |

The test limits are the tests of the app, so design and production use the same numbers.

## 4. Recommendations for a stable, reproducible design over the life cycle

1. **Freeze the design data:** the schematic project (version-controlled in the app), BOM with
   manufacturer part numbers, and the test suite are one release; every change runs the full
   suite (CI) before it is released, and the DFMEA rows of the changed parts are reviewed.
2. **Second sources:** for every active part a qualified second source, checked with the same
   tests (the models of the app are generic for that reason: a second source changes the
   model, not the design).
3. **Change control:** no part substitution without a change note, the stress check and the
   reliability prediction re-run, and the end-of-line limits checked.
4. **No adjustment in production:** thresholds from E96 values and band-gap references; no
   trimmers. Tolerance analysis (Monte Carlo in the app) of every threshold before release.
5. **Traceability:** serial number on each unit, linked to its batch of critical parts
   (power semiconductors, relays, contactors, varistors) and its end-of-line record.
6. **Field feedback:** every return analysed for root cause and fed back into the DFMEA
   (section 7 of DFMEA.md) and FIELD_FAILURES.md.
7. **Qualification of each design** before the first delivery: heat run at 50 °C, damp heat
   cyclic 6 cycles (IEC 60068-2-30), salt mist (IEC 60068-2-52) for coastal use, surge
   (IEC 61000-4-5, 4 kV), dips and interruptions (IEC 61000-4-11), IP54 test (IEC 60529).
