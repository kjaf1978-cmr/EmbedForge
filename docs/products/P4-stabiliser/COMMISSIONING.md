# Mains voltage stabiliser 1 kVA (P4): commissioning procedure

Done by a qualified electrician before the unit is put into service, and after any repair. The
expected values come from the simulation of the final circuit (tests/stabiliser.test.ts) and
from the design calculations. Record every result at the end.

You need:

- an installation tester (500 V insulation, low-resistance continuity);
- a true-RMS multimeter;
- a stopwatch;
- a variable transformer (variac) 0 … 300 V, 5 A, feeding the stabiliser's input;
- a 1 kW resistive load (a heater) for step 7;
- a varistor tester or a current-limited 1 mA DC supply to 600 V.

## 1. Before any voltage

1. **Visual check:**
   - the wiring against ASSEMBLY.md section 3;
   - the tap wiring checked (rising resistance from N to T1 … T7);
   - screws tightened, coating intact.
2. **PE continuity** from X5 (PE in) to X8 (PE out), the enclosure, the door and the
   transformer core: low resistance (≤ 0.1 Ω plus the leads).
3. **Insulation:** L and N joined, against PE, 500 V DC, Q1 on: ≥ 1 MΩ.

## 2. Power-up (variac at 230 V, no load)

| Step | Action | Expected |
|---|---|---|
| 2.1 | Variac to 230 V, Q1 on | yellow TAP 5 and TAP 6 on |
| 2.2 | +12 V across C5 (100 µF), + to − | 11.5 … 12.2 V |
| 2.3 | VREF at the TL431 U4, cathode to ground | 2.47 … 2.52 V |
| 2.4 | Time from Q1 on to OUTPUT (green) | about 8 s (6 … 10 s); FAULT may light until step 3.2 is done |

## 3. Calibration (both sense circuits)

The sense transformers' output varies from unit to unit, so each divider has a 25-turn trimmer.

1. **The control's sense (RV2).**
   - Measure the input voltage at X2–X4 with the true-RMS meter: U_in.
   - Turn RV2 until SENSE, at the top of R50 to ground, reads 2.000 V × U_in / 230 V. For
     example, at U_in = 228 V, SENSE = 1.983 V.
2. **The protection's sense (RV3).**
   - Measure the 230 V tap: the board's tap block, T5 to N: U_tap.
   - Turn RV3 until SEN2, at the top of R54 to ground, reads 2.000 V × U_tap / 230 V.
   - The FAULT LED goes off and the output connects after the restart delay.
3. Seal both trimmers with a drop of lacquer.

## 4. The steps (variac, no load)

Raise the input slowly through each step and check the yellow LEDs and the output voltage
(X6–X7). The expected output is U_in · 230 / tap ± 2 %. Then lower through each step: it
changes about 3 V lower (hysteresis).

| Input (raising) | Yellow LEDs on | Tap | Expected output |
|---|---|---|---|
| 154 V | all six | 150 V | 236 V |
| 166 V | TAP 2 … 6 | 170 V | 225 V |
| 186 V | TAP 3 … 6 | 190 V | 225 V |
| 206 V | TAP 4 … 6 | 210 V | 226 V |
| 226 V | TAP 5, 6 | 230 V | 226 V |
| 246 V | TAP 6 | 250 V | 226 V |
| 271 V | none | 280 V | 223 V |
| 140 V | all six | 150 V | 215 V (≥ 207 V) |
| 300 V (if the variac reaches it) | none | 280 V | 246 V (≤ 253 V) |

Each step should change at its threshold, 160 / 180 / 200 / 220 / 240 / 265 V ± 4 V. The 1 %
resistors of the reference ladder allow this tolerance after calibration.

## 5. Protection, delay and cut-out

| Step | Action | Expected |
|---|---|---|
| 5.1 | Lower the input to 120 V (the 150 V tap gives about 184 V) | FAULT (red) on, OUTPUT off |
| 5.2 | Raise to 230 V | FAULT off; OUTPUT on again after about 8 s |
| 5.3 | Switch Q1 off and on | OUTPUT on about 8 s after power returns |
| 5.4 | Unplug one lead of the thermal cut-out at X1 (as an open cut-out would be) | OUTPUT off, FAULT off |
| 5.5 | Reconnect it | OUTPUT on after about 8 s |

## 6. Varistor

With Q1 off and the input disconnected: measure RV1 at 1 mA DC: 423 … 517 V. No conduction up
to 600 V means its thermal disconnect has opened: replace it (TMOV14RP300E). Repeat this check
after a known lightning event, or every 5 years.

## 7. Load test

At 230 V input, connect the 1 kW resistive load for 30 minutes.

- The output stays within 220 … 240 V.
- No relay buzzes.
- The transformer's surface stays below about 80 °C (touch with care, or use an IR
  thermometer).
- The OUTPUT LED stays on.

Then lower the input to 180 V for 5 minutes with the load: the output stays in range and Q1
does not trip.

## Record

| Item | Expected | Measured | OK |
|---|---|---|---|
| PE continuity | ≤ 0.1 Ω | | |
| Insulation | ≥ 1 MΩ | | |
| +12 V (C5) | 11.5 … 12.2 V | | |
| VREF (U4) | 2.47 … 2.52 V | | |
| RV2: SENSE at U_in | 2.000 V × U_in / 230 | | |
| RV3: SEN2 at U_tap | 2.000 V × U_tap / 230 | | |
| Step thresholds (6) | 160/180/200/220/240/265 V ± 4 V | | |
| Output at each test point | U_in · 230 / tap ± 2 % | | |
| Protection at 120 V input | FAULT, output off | | |
| Restart delay | 6 … 10 s | | |
| Thermal cut-out open | output off | | |
| Varistor at 1 mA | 423 … 517 V | | |
| 30 min at 1 kW | 220 … 240 V, transformer < 80 °C | | |

Date, unit serial number, name and signature of the electrician:
