# Mains voltage stabilisers 5, 10 and 15 kVA, contactor-switched taps (P4b): commissioning procedure

Done by a qualified electrician before the unit is put into service, and after any repair. The
expected values come from the simulation of the circuit (tests/stabiliserT.test.ts) and from the
design calculations. Record every result at the end.

> **The board and the coil circuits are live** whenever Q1 is on. Measure with a CAT III meter
> and insulated probes only. Change wiring only after safe isolation: the supply isolated and
> locked, and proved dead (L and N to PE, and across the tap leads).
>
> **Keep the loads disconnected (Q17 off)** until section 5 is done: before the calibration the
> unit may pick a wrong tap.

You need:

- an installation tester (500 V insulation, low-resistance continuity);
- two true-RMS multimeters (or one used twice) for the ratios;
- a stopwatch;
- a variable transformer (variac) 0 … 300 V, 10 A, for the no-load tests: without a load only the
  autotransformer's magnetising current and the supplies flow;
- the site's mains and as much resistive load as is available, for section 7;
- a varistor tester or a current-limited 1 mA DC supply to 600 V.

The test points are named by their nets (the schematic): SF and VREF (the control's sense and
reference), SF2 and VREF2 (the protection's), VOV and VUV (the protection's window), MS (the match
check), +12V and +24V.

## 1. Before any voltage

1. **Visual check:** the wiring against panel.csv; each tap contactor's three poles linked on both
   sides, and its 2-4-6 side continuous to its own tap only (a pole link split between two taps
   would short a section); the tap ratio and auxiliary checks (ASSEMBLY.md section 3) done and recorded; screws
   tightened.
2. **PE continuity** from X3 to X6, the PE stud, the enclosure, the door, the DIN rail and the
   transformer core: ≤ 0.1 Ω plus the leads.
3. **Insulation:** L and N joined, against PE, 500 V DC, Q1 on, with X7 disconnected from the
   stud (reconnect it afterwards): ≥ 1 MΩ.
4. **Pre-set both trimmers to the safe end,** with the board unpowered: the control trimmer to its
   maximum (about 5 kΩ from its wiper to ground: the unit then reads the input high and picks a
   higher tap, so the output is low), the protection trimmer to its maximum (about 50 kΩ: an
   overvoltage trip, the output stays off).

## 2. Power-up (variac at 230 V, no load, Q17 off)

| Step | Action | Expected |
|---|---|---|
| 2.1 | Variac to 230 V, Q1 on | one yellow TAP LED; K10 closes about 1 s after switch-on (it is heard); FAULT on (the protection trimmer is at its trip end) |
| 2.2 | +12 V and +24 V to ground | 11.6 … 12.4 V; 23.0 … 25.0 V |
| 2.3 | VREF and VREF2, to ground | each 2.47 … 2.52 V |
| 2.4 | MS to ground | 3.5 … 4.1 V (exactly one tap contactor closed, the commanded one) |

## 3. Calibration (both sense circuits)

Each sense is set as a ratio to its own reference, with its 25-turn trimmer.

1. **The control's sense.** Measure the input at X1–X2 (U_in), and VREF and SF. Turn the control
   trimmer until SF / VREF = 0.003660 × U_in − 0.0489 (at 230 V: 0.793). The tap may change as you
   turn it: that is expected.
2. **The protection's sense.** Measure the 230 V tap to N (U_tap), and VREF2 and SF2. Turn the
   protection trimmer until SF2 / VREF2 = 0.003629 × U_tap − 0.0429 (at 230 V: 0.792). The sense
   holds its peak for a few seconds: turn slowly. FAULT goes off; OUTPUT comes on after the
   restart delay.
3. Seal both trimmers with a drop of lacquer.

## 4. The steps (variac, no load)

Raise the input slowly through each step. Exactly one yellow LED is on at a time; at each change
K10 opens and closes (heard twice, about 0.3 s apart). The expected output (at
the 230 V tap) is U_in · 230 / tap ± 2 %. Then lower the input through each step: it changes a
few volts lower.

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

## 5. Protection, delay, match check and cut-out

| Step | Action | Expected |
|---|---|---|
| 5.1 | **Undervoltage.** Lower the input to 120 V | FAULT on, OUTPUT off |
| 5.2 | Raise to 230 V | FAULT off; OUTPUT on about 8 s later |
| 5.3 | **Overvoltage.** At 230 V, note SF2; turn the protection trimmer slowly up until FAULT lights | FAULT on, OUTPUT off at SF2 / VREF2 = 0.882 ± 0.01 |
| 5.4 | Turn it back to the noted SF2; check the ratio of step 3.2 | FAULT off; OUTPUT on after the delay |
| 5.5 | **Window.** VOV / VREF2 and VUV / VREF2 | 0.882 and 0.646, ± 0.01 |
| 5.6 | **Match check.** Safe isolation; disconnect the wire on terminal 14 of the tap contactor that is in use at 230 V (K5); restore the supply | K10 stays open (MS above 4.5 V: none seen closed), FAULT on, OUTPUT off; reconnect after safe isolation |
| 5.7 | **Match check, the other direction.** Safe isolation; bridge 13 and 14 of a tap contactor that is not in use at 230 V (K1) with a short wire; restore the supply | MS 4.8 … 5.4 V (one seen beside the commanded one); K10 stays open; FAULT on; remove the bridge after safe isolation |
| 5.8 | **Mirror chain.** Safe isolation; disconnect the wire on terminal 22 of K1 (not in use at 230 V); restore the supply | K10 stays open (MS normal, 3.5 … 4.1 V: the chain alone holds it); FAULT on; reconnect after safe isolation |
| 5.9 | **Thermal cut-out.** Safe isolation; remove the cut-out lead from X9, insulate it; restore the supply | K10 stays open; FAULT on; OUTPUT off; reconnect after safe isolation; OUTPUT on after about 8.5 s |
| 5.10 | **Restart.** Q1 off and on | OUTPUT on about 8.5 s after power returns |

Repeat 5.6 … 5.8 at every yearly check: they prove that the two checks which keep two taps from
being connected still work.

## 6. Varistor

With Q1 off and the input disconnected, measure RV1 at 1 mA DC: 423 … 517 V. No conduction up to
600 V means its thermal disconnect has opened: replace it (TMOV14RP300E). Repeat after a known
lightning event, or every 5 years.

## 7. Load test (site mains)

Connect the unit to its supply; Q17 on. Connect the largest resistive load available, up to the
rating, for 30 minutes:

- the output is the expected ratio of the site's input ± 2 % (± 3 % at full load);
- no fault, the output contactor stays closed;
- the contactors, the pole links and the terminals warm, not hot (below about 60 °C on a contact
  thermometer);
- the transformer's surface below about 80 °C.

The full-load tests at 140 V and 300 V input need a large adjustable source: they are type tests
(TYPE_TESTS.md TT-1), not part of commissioning.

## Record

| Item | Expected | Measured | OK |
|---|---|---|---|
| Tap ratio check | 15 / 17 / 19 / 21 / 23 / 25 / 28 V ± 2 % | | |
| Auxiliary check (13-14 of K1 … K7, 21-22 of K10) | as ASSEMBLY.md section 3 | | |
| PE continuity | ≤ 0.1 Ω | | |
| Insulation | ≥ 1 MΩ | | |
| +12 V, +24 V | 11.6 … 12.4 V, 23.0 … 25.0 V | | |
| VREF, VREF2 | 2.47 … 2.52 V | | |
| MS | 3.5 … 4.1 V | | |
| SF / VREF at U_in | 0.003660 × U_in − 0.0489 | | |
| SF2 / VREF2 at U_tap | 0.003629 × U_tap − 0.0429 | | |
| Step thresholds (6) | 160/180/200/220/240/265 V ± 4 V | | |
| One yellow LED per tap | yes | | |
| Undervoltage at 120 V | FAULT, output off | | |
| Overvoltage trip | SF2 / VREF2 = 0.882 ± 0.01 | | |
| VOV / VREF2, VUV / VREF2 | 0.882, 0.646 ± 0.01 | | |
| Match check (14 of K5 open) | K10 open, output off | | |
| Match check, one beside (13-14 of K1 bridged) | MS 4.8 … 5.4 V, K10 open | | |
| Mirror chain (22 of K1 open) | K10 open | | |
| Thermal cut-out open | K10 open, output off | | |
| Restart delay | 7 … 10 s | | |
| Varistor at 1 mA | 423 … 517 V | | |
| 30 min load test (load: ___ kW, input ___ V) | as section 7 | | |

Date, unit size and serial number, name and signature of the electrician:
