# Mains / back-up change-over (P3): commissioning procedure

Done by a qualified electrician before the unit carries a load, and after any repair. Record every
result in the table at the end. The expected values come from the simulation of the final
circuit (tests/power.test.ts, power3.test.ts, power3step.test.ts). The single-phase references
come first; the 3P+N reference follows in brackets where it differs.

You need:

- an installation tester (insulation at 500 V DC, low-resistance continuity);
- a true-RMS multimeter;
- a stopwatch;
- for the threshold tests, a variable transformer (variac) 0 … 260 V, 2 A, connected to the
  mains input in place of the mains (3P+N: a three-phase variac for the undervoltage step, or
  three single-phase ones);
- for the varistor check, a varistor tester or a current-limited (1 mA) DC supply to 600 V.

## 1. Before any voltage

1. **Visual check.** Every wire against `panel.csv`, ferrules on the stranded conductors,
   terminal screws torqued and marked, no damage, the coating intact, the cable glands sealed.
2. **PE continuity.** From the PE terminal blocks to the enclosure, the DIN rail and the load PE
   terminal: low resistance (≤ 0.1 Ω plus the leads).
3. **Insulation.** Unplug J_MAINS from the board (the board's varistors and transformers would
   load the test), switch Q1 and Q2 on, with both contactors released. Test at 500 V DC between
   each of L (L1 L2 L3) and N on the mains, back-up and load sides and PE:
   - each ≥ 1 MΩ (IEC 60364-6);
   - between the mains and the back-up conductors: ≥ 1 MΩ. This proves the two sources are
     separate while the contactors are open.

   Plug J_MAINS back in.

## 2. Control supply and back-up path

| Step | Action | Expected |
|---|---|---|
| 2.1 | Q1 off. Start the back-up source; Q2 on | the board is powered from the back-up side |
| 2.2 | Measure +24 V across C3 (100 µF), + to − | 24.3 V ± 0.5 V |
| 2.3 | Measure VREF at the TL431 U4 (3P+N: U6), cathode to ground | 2.47 … 2.52 V |
| 2.4 | LEDs | UNDERVOLTAGE (red) on, since the mains is missing |
| 2.5 | K2 | closes about 0.5 s after power-up; ON BACK-UP (yellow) on |
| 2.6 | Load terminals | 230 V from the back-up source (3P+N: 400 V between the phases, 230 V phase to N); phase rotation as the mains (3P+N) |

## 2a. Calibration of the sense (every unit)

The small sense transformers' output varies from unit to unit (their no-load voltage is above
the rated 12 V), so each sense divider has a 25-turn trimmer: RV3 in 1P; RV7, RV8 and RV9 (phases L1, L2 and L3) in 3P+N, one
per phase.

1. Q1 on, the mains present.
2. Measure the mains voltage at X1–X2 (3P+N: each phase to N) with the true-RMS meter: U.
3. Turn the phase's trimmer until SENSE reads 2.000 V × U / 230 V. SENSE is at the top of R21 in
   1P; in 3P+N it is each phase's divider (R14, R21, R31) to ground. For example, at U = 236 V,
   SENSE = 2.052 V.
4. Seal the trimmers with a drop of lacquer.

## 3. Transfer to the mains and back

| Step | Action | Expected |
|---|---|---|
| 3.1 | Q1 on, mains healthy (about 230 V) | UNDERVOLTAGE goes off at once |
| 3.2 | Time from Q1 on to ON MAINS (green) | 10.5 s ± 1.5 s (return delay), plus 0.47 s; yellow goes off about 0.5 s before green comes on |
| 3.3 | Measure SENSE again | 2.000 V × U / 230 V ± 5 mV (as calibrated) |
| 3.4 | Q1 off | yellow on within about 0.5 s; green off first |
| 3.5 | Repeat 3.1 … 3.4 ten times | green and yellow never on together |

## 4. Thresholds (variac on the mains input)

Disconnect the load from the unit's load terminals for these steps (the variac carries only the
board). Start at 230 V with the unit on the mains (green). After each trip, return to 230 V and
wait for the return before the next step. The limits allow for the 1 % resistors of the
reference divider (worst case ± 4 V; typically ± 2 V).

| Step | Action | Expected |
|---|---|---|
| 4.1 | Lower slowly (about 1 V/s); 3P+N: all three phases together, with a three-phase variac | trip to back-up at 195 V ± 4 V: UNDERVOLTAGE on, green off, yellow on |
| 4.2 (1P) | Raise to 200 V | stays on back-up (hysteresis) |
| 4.3 (1P) | Raise to 210 V | returns to the mains after 10.5 s |
| 4.4 | Raise slowly from 230 V (3P+N: one phase at a time) | trip at 253 V ± 4 V: OVERVOLTAGE on, transfer to back-up |
| 4.5 (1P) | Lower to 250 V | stays on back-up (hysteresis) |
| 4.6 (1P) | Lower to 240 V | returns to the mains after 10.5 s |
| 4.7 (3P+N) | One phase alone to 12 % below the others (about 202 V with 230 V on the other two) | trip (asymmetry) |
| 4.8 (3P+N) | One phase alone to 7 % below the others (about 214 V) | no trip |
| 4.9 (3P+N) | Disconnect one mains phase (upstream fuse out, or Q1 with that pole's feed removed) | trip to back-up |

## 5. Varistors

With the board unplugged and both breakers off: measure each varistor at 1 mA DC: RV1 and RV2 in 1P, RV1 … RV6 in 3P+N (not the trimmers).

- 423 … 517 V: good.
- No conduction up to 600 V: its thermal disconnect has opened. Replace it with the same type
  (TMOV14RP300E).
- Also look for discolouration of the varistors and the board around them.

This step is repeated after a known lightning event, or every 5 years.

## 6. Hand-over

1. Close the enclosure.
2. Explain the indicators to the user (USER_MANUAL.md, section 2).
3. Hand over the user manual and this record.

## Record

| Item | Expected | Measured | OK |
|---|---|---|---|
| PE continuity | ≤ 0.1 Ω | | |
| Insulation, worst value | ≥ 1 MΩ | | |
| +24 V (C3) | 24.3 ± 0.5 V | | |
| VREF | 2.47 … 2.52 V | | |
| Return delay | 10.5 ± 1.5 s | | |
| Dead time (yellow off to green on) | about 0.5 s | | |
| SENSE at 230 V | about 2.0 V | | |
| Calibration (SENSE at U) | 2.000 V × U / 230 V | | |
| Undervoltage trip | 195 ± 4 V | | |
| Overvoltage trip | 253 ± 4 V | | |
| 1P: hysteresis (200 V stays, 210 V returns; 250 V stays, 240 V returns) | as stated | | |
| 3P+N: asymmetry 12 % trips, 7 % holds, lost phase trips | as stated | | |
| Varistors at 1 mA | 423 … 517 V each | | |
| Ten transfers, never both LEDs on | yes | | |

Date, unit serial number, name and signature of the electrician:
