# Mains voltage stabilisers 5, 10 and 15 kVA (P4b): commissioning procedure

Done by a qualified electrician before the unit is put into service, and after any repair. The
expected values come from the simulation of the circuit (tests/stabiliserT.test.ts) and from the
design calculations. Record every result at the end.

> **The boards are live** whenever QF1 is on. Measure with a CAT III meter and insulated probes
> only. Change wiring only after safe isolation: the supply isolated and locked, and proved dead
> (L and N to PE, and across the tap leads).

You need:

- an installation tester (500 V insulation, low-resistance continuity);
- two true-RMS multimeters (or one used twice) for the ratios;
- a stopwatch;
- a variable transformer (variac) 0 … 300 V, 10 A, for the no-load tests: without a load only the
  autotransformer's magnetising current flows;
- the site's mains and as much resistive load as is available, for section 7;
- a hot-air gun and a contact thermometer (the fan check);
- a varistor tester or a current-limited 1 mA DC supply to 600 V.

The test points are named by their nets (the schematic): SF and VREF (the control's sense and
reference), SF2 and VREF2 (the protection's), VOV and VUV (the protection's window).

## 1. Before any voltage

1. **Visual check:** the wiring against the panel.csv lists; the module gate pairs on the right
   pair boards; the tap ratio check (ASSEMBLY.md section 4) done and recorded; screws tightened.
2. **PE continuity** from X3 to X6, the PE stud, the enclosure, the door, the heatsink and the
   transformer core: ≤ 0.1 Ω plus the leads.
3. **Insulation:** L and N joined, against PE, 500 V DC, QF1 on, with XPE disconnected from the
   stud (reconnect it afterwards): ≥ 1 MΩ.

## 2. Power-up (variac at 230 V, no load)

| Step | Action | Expected |
|---|---|---|
| 2.1 | Variac to 230 V, QF1 on | FAULT (red) for about 1 s; then TAP 5 (yellow) on, alone |
| 2.2 | +12 V on the logic board | 11.6 … 12.4 V |
| 2.3 | VREF and VREF2, to ground | each 2.47 … 2.52 V |
| 2.4 | Time from QF1 on to OUTPUT (green) | about 8.5 s (7 … 10 s); FAULT may stay on until step 3.2 is done |

## 3. Calibration (both sense circuits)

Each sense is set as a ratio to its own reference, with its 25-turn trimmer.

1. **The control's sense.** Measure the input at X1–X2 (U_in), and VREF and SF. Turn the control
   trimmer until SF / VREF = 0.003660 × U_in − 0.0489 (at 230 V: 0.793).
2. **The protection's sense.** Measure the 230 V tap to N (U_tap), and VREF2 and SF2. Turn the
   protection trimmer until SF2 / VREF2 = 0.003629 × U_tap − 0.0429 (at 230 V: 0.792). FAULT goes
   off; the output connects after the restart delay.
3. Seal both trimmers with a drop of lacquer.

## 4. The steps (variac, no load)

Raise the input slowly through each step. Exactly one yellow LED is on at a time, and the output
does not blink at the change. The expected output is U_in · 230 / tap ± 2 %. Then lower the
input through each step: it changes a few volts lower.

| Input (raising) | Yellow LED | Tap | Expected output |
|---|---|---|---|
| 154 V | TAP 1 | 150 V | 236 V |
| 166 V | TAP 2 | 170 V | 225 V |
| 186 V | TAP 3 | 190 V | 225 V |
| 206 V | TAP 4 | 210 V | 226 V |
| 226 V | TAP 5 | 230 V | 226 V |
| 246 V | TAP 6 | 250 V | 226 V |
| 271 V | TAP 7 | 280 V | 223 V |
| 140 V | TAP 1 | 150 V | 215 V |
| 300 V (if the variac reaches it) | TAP 7 | 280 V | 246 V |

Each step should change at 160 / 180 / 200 / 220 / 240 / 265 V ± 4 V.

## 5. Protection, delay, heatsink and cut-out

| Step | Action | Expected |
|---|---|---|
| 5.1 | **Undervoltage.** Lower the input to 120 V | FAULT on, OUTPUT off |
| 5.2 | Raise to 230 V | FAULT off; OUTPUT on about 8 s later |
| 5.3 | **Overvoltage.** At 230 V, note SF2; turn the protection trimmer slowly up until FAULT lights | FAULT on, OUTPUT off at SF2 / VREF2 = 0.882 ± 0.01 |
| 5.4 | Turn it back to the noted SF2; check the ratio of step 3.2 | FAULT off; OUTPUT on after the delay |
| 5.5 | **Window.** VOV / VREF2 and VUV / VREF2 | 0.882 and 0.646, ± 0.01 |
| 5.6 | **Heatsink sensor.** Safe isolation; disconnect the NTC's lead from XN2; restore the supply | FAULT on, OUTPUT off (an open sensor trips); reconnect after safe isolation |
| 5.7 | **Fan.** Warm the heatsink with the hot-air gun near the thermostat | the fan starts at about 50 °C (thermometer); it stops again as the heatsink cools |
| 5.8 | **Thermal cut-out.** Safe isolation; remove the cut-out lead from XT2, insulate it; restore the supply | no yellow LED (no tap fired); FAULT on; OUTPUT off; reconnect after safe isolation; OUTPUT on after about 8.5 s |
| 5.9 | **Restart.** QF1 off and on | OUTPUT on about 8.5 s after power returns |

## 6. Varistor

With QF1 off and the input disconnected, measure RV1 at 1 mA DC: 423 … 517 V. No conduction up to
600 V means its thermal disconnect has opened: replace it (TMOV14RP300E). Repeat after a known
lightning event, or every 5 years.

## 7. Load test (site mains)

Connect the unit to its supply. Connect the largest resistive load available, up to the rating,
for 30 minutes:

- the output is the expected ratio of the site's input ± 2 % (± 3 % at full load);
- no fault, the output contactor stays closed;
- the heatsink below 70 °C (it trips at 70 °C), the fan running when it is warm;
- the transformer's surface below about 80 °C.

The full-load tests at 140 V and 300 V input need a large adjustable source: they are type
tests (TYPE_TESTS.md TT-1), not part of commissioning.

## Record

| Item | Expected | Measured | OK |
|---|---|---|---|
| Tap ratio check | 15 / 17 / 19 / 21 / 23 / 25 / 28 V ± 2 % | | |
| PE continuity | ≤ 0.1 Ω | | |
| Insulation | ≥ 1 MΩ | | |
| +12 V | 11.6 … 12.4 V | | |
| VREF, VREF2 | 2.47 … 2.52 V | | |
| SF / VREF at U_in | 0.003660 × U_in − 0.0489 | | |
| SF2 / VREF2 at U_tap | 0.003629 × U_tap − 0.0429 | | |
| Step thresholds (6) | 160/180/200/220/240/265 V ± 4 V | | |
| One yellow LED per tap, no blink at a change | yes | | |
| Undervoltage at 120 V | FAULT, output off | | |
| Overvoltage trip | SF2 / VREF2 = 0.882 ± 0.01 | | |
| VOV / VREF2, VUV / VREF2 | 0.882, 0.646 ± 0.01 | | |
| NTC open | FAULT, output off | | |
| Fan starts | about 50 °C | | |
| Thermal cut-out open | no tap, output off | | |
| Restart delay | 7 … 10 s | | |
| Varistor at 1 mA | 423 … 517 V | | |
| 30 min load test (load: ___ kW, input ___ V) | as section 7 | | |

Date, unit size and serial number, name and signature of the electrician:
