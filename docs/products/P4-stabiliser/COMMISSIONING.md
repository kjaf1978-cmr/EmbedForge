# Mains voltage stabiliser 1 kVA (P4): commissioning procedure

Done by a qualified electrician before the unit is put into service, and after any repair. The
expected values come from the simulation of the final circuit (tests/stabiliser.test.ts) and
from the design calculations. Record every result at the end.

> **The whole board is live** whenever Q1 is on. Measure with a CAT III meter and insulated
> probes only. Change wiring only after safe isolation: Q1 off, the supply isolated and locked,
> and the board proved dead (L and N to PE, and across the tap block) with a voltage tester.

You need:

- an installation tester (500 V insulation, low-resistance continuity);
- two true-RMS multimeters (for the ratios: one on each test point at once), or one meter used
  twice;
- a stopwatch;
- a variable transformer (variac) 0 … 300 V, **10 A**, feeding the stabiliser's input;
- a 1 kW resistive load (a heater) for section 7;
- a varistor tester or a current-limited 1 mA DC supply to 600 V.

## 1. Before any voltage

1. **Visual check:**
   - the wiring against ASSEMBLY.md section 3;
   - the tap ratio check (ASSEMBLY.md section 3) has been done and recorded;
   - screws tightened to the torques in INSTALLATION.md, coating intact.
2. **PE continuity** from X5 (PE in) to X8 (PE out), the PE stud, the enclosure, the door and
   the transformer core: low resistance (≤ 0.1 Ω plus the leads).
3. **Insulation:** L and N joined, against PE, 500 V DC, Q1 on: ≥ 1 MΩ. Disconnect X9 (control
   ground) from the stud for this test and reconnect it afterwards: the control's 0 V is bonded
   to PE.

## 2. Power-up (variac at 230 V, no load)

| Step | Action | Expected |
|---|---|---|
| 2.1 | Variac to 230 V, Q1 on | FAULT (red) for about 1 s; then yellow TAP 5 and TAP 6 on |
| 2.2 | +12 V across C4 (100 µF), + to − | 11.6 … 12.4 V |
| 2.3 | VREF at the TL431 U7, cathode to ground; VREF2 at U10 | each 2.47 … 2.52 V |
| 2.4 | Time from Q1 on to OUTPUT (green) | about 8.5 s (7 … 10 s); FAULT may stay on until step 3.2 is done |

## 3. Calibration (both sense circuits)

The sense transformers' output varies from unit to unit, so each divider has a 25-turn trimmer.
Each sense is set as a ratio to its own reference, so the references' tolerance does not add.

1. **The control's sense (RV2).**
   - Measure the input voltage at X2–X4 with the true-RMS meter: U_in.
   - Measure VREF (U7 cathode) and SF (the top of C20), both to ground.
   - Turn RV2 until SF / VREF = 0.003660 × U_in − 0.0489.

   | U_in | 220 V | 225 V | 230 V | 235 V | 240 V |
   |---|---|---|---|---|---|
   | SF / VREF | 0.756 | 0.775 | 0.793 | 0.811 | 0.829 |
2. **The protection's sense (RV3).**
   - Measure the 230 V tap: the board's tap block, T5 to N: U_tap.
   - Measure VREF2 (U10 cathode) and SF2 (the top of C25), both to ground.
   - Turn RV3 until SF2 / VREF2 = 0.003629 × U_tap − 0.0429 (at 230 V: 0.792). The sense holds
     its peak for a few seconds: wait 10 s after each turn before reading.
   - The FAULT LED goes off, and the output connects after the restart delay.
3. Seal both trimmers with a drop of lacquer.

## 4. The steps (variac, no load)

Raise the input slowly through each step, and check the yellow LEDs and the output voltage
(X6–X7). At each step the output blinks off for about 60 ms (the input relay opens while the
tap changes). The expected output is U_in · 230 / tap ± 2 %. Then lower the input through each
step: it changes about 5 V lower (hysteresis).

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

Each step should change at its threshold, 160 / 180 / 200 / 220 / 240 / 265 V ± 4 V.

## 5. Protection, delay and cut-out

| Step | Action | Expected |
|---|---|---|
| 5.1 | **Undervoltage.** Lower the input to 120 V (the 150 V tap gives about 184 V) | FAULT on, OUTPUT off |
| 5.2 | Raise to 230 V | FAULT off; OUTPUT on again about 8 s later |
| 5.3 | **Overvoltage.** At 230 V input, note SF2. Turn RV3 slowly in the direction that raises SF2, until FAULT lights | FAULT on and OUTPUT off at SF2 / VREF2 = 0.882 ± 0.01 (the upper limit, VOV) |
| 5.4 | Turn RV3 back until SF2 is the value noted in 5.3; check the ratio of step 3.2 again | FAULT off; OUTPUT on after the delay |
| 5.5 | **The window's limits.** Measure VOV (R91–R93 junction) and VUV (R93–R95 junction) against VREF2 | VOV / VREF2 = 0.882 ± 0.01; VUV / VREF2 = 0.646 ± 0.01 |
| 5.6 | Switch Q1 off and on | OUTPUT on about 8.5 s after power returns |
| 5.7 | **Thermal cut-out.** Safe isolation (see above). Remove the cut-out lead from X3, insulate its end and close the terminal. Restore the supply, Q1 on | yellow LEDs as normal; FAULT on; OUTPUT off; the tap block T5–N reads 0 V (the input relay stays open: the transformer is off) |
| 5.8 | Safe isolation. Reconnect the lead to X3. Restore the supply, Q1 on | OUTPUT on after about 8.5 s |

## 6. Varistor

With Q1 off and the input disconnected, measure RV1 at 1 mA DC: 423 … 517 V. No conduction up
to 600 V means its thermal disconnect has opened: replace it (TMOV14RP300E). Repeat this check
after a known lightning event, or every 5 years.

## 7. Load tests

The transformer only carries load current away from the 230 V tap, so the load is tested at both
ends of the range.

1. **Maximum boost.** Input 140 V, the 1 kW load connected, for 30 minutes:
   - the output stays at 215 V ± 2 % (the heater then takes about 870 W, and the input about
     6.2 A);
   - Q1 does not trip;
   - the transformer's surface stays below about 80 °C (IR thermometer).
2. **Maximum buck.** Input 300 V with the load, for 15 minutes: the output stays at 246 V ± 2 %
   and never above 253 V.
3. **Tap changes under load.** With the load, move the input from 205 V to 235 V and back, five
   times:
   - each step changes with a short blink;
   - no relay buzzes;
   - Q1 does not trip. If Q1 trips at a tap change, fit the D10 version (INSTALLATION.md
     section 1) and repeat.
4. The OUTPUT LED stays on throughout, apart from the blinks.

## Record

| Item | Expected | Measured | OK |
|---|---|---|---|
| Tap ratio check (ASSEMBLY.md) | 15 / 17 / 19 / 21 / 23 / 25 / 28 V ± 2 % | | |
| PE continuity | ≤ 0.1 Ω | | |
| Insulation | ≥ 1 MΩ | | |
| +12 V (C4) | 11.6 … 12.4 V | | |
| VREF (U7), VREF2 (U10) | 2.47 … 2.52 V | | |
| RV2: SF / VREF at U_in | 0.003660 × U_in − 0.0489 | | |
| RV3: SF2 / VREF2 at U_tap | 0.003629 × U_tap − 0.0429 | | |
| Step thresholds (6) | 160/180/200/220/240/265 V ± 4 V | | |
| Output at each test point | U_in · 230 / tap ± 2 % | | |
| Undervoltage at 120 V input | FAULT, output off | | |
| Overvoltage trip (5.3) | SF2 / VREF2 = 0.882 ± 0.01 | | |
| VOV / VREF2, VUV / VREF2 | 0.882, 0.646 ± 0.01 | | |
| Restart delay | 7 … 10 s | | |
| Thermal cut-out open | output off, T5–N 0 V | | |
| Varistor at 1 mA | 423 … 517 V | | |
| 30 min at 140 V, 1 kW | 215 V ± 2 %, transformer < 80 °C, Q1 holds | | |
| 15 min at 300 V, 1 kW | 246 V ± 2 %, ≤ 253 V | | |
| Tap changes under load | no buzzing, Q1 holds (C10 / D10 fitted: ___) | | |

Date, unit serial number, name and signature of the electrician:
