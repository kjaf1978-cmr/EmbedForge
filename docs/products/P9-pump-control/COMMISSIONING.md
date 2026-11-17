# Pump controller (P9): commissioning procedure

Done by a qualified electrician before the controller is put into service, and after any repair.
Record every result at the end. The designators are those of the schematic and the board.

You need an installation tester (500 V insulation, continuity, RCD test), a multimeter, a
stopwatch, and a bucket of water (or access to the tank) to wet the electrodes.

## 1. Before any voltage

1. **Visual check:** the wiring against panel.csv; K6 and K8 are the reinforced interface relays;
   T1 is the safety transformer; the mains and the control and electrode wiring kept apart; each COM
   rod on two cores joined only at the rod.
2. **PE continuity** from X3 to X10, the PE stud, the enclosure, the door, the DIN rail, the pump's
   metal parts: ≤ 0.1 Ω plus the leads.
3. **Insulation, mains to PE:** L and N joined, against PE, 500 V DC, Q1 on: ≥ 1 MΩ.
4. **Insulation, mains to the control (SELV):** L and N joined, against the electrode terminals
   joined, 500 V DC: ≥ 1 MΩ.
5. **Insulation, control to PE (SELV, not earthed):** the electrode terminals joined, against PE,
   250 V DC: ≥ 1 MΩ (the rods out of the water).
6. **Q1** set to the pump's rated current.

## 2. Power-up (the pump connected, the tank above LOW, the source wet)

| Step | Action | Expected |
|---|---|---|
| 2.1 | Supply on | the pump stays off (the tank is above LOW); no FAULT |
| 2.2 | +12 V to 0 V (the regulator's output) | 11.6 … 12.4 V |
| 2.3 | RCD test button | the RCD trips |

## 3. Electrodes

With the rods in water: a small AC voltage (a few volts) between each COM terminal and each of its
sensing rods while the rod is in the water, more while it is out. Lift each rod out and back in and
watch the controller (section 4).

## 4. Function

| Step | Action | Expected |
|---|---|---|
| 4.1 | Let the tank fall below LOW (or lift LOW out of the water) | after the start delay, RUN (green) on, K5 and K7 closed, the pump runs |
| 4.2 | Let it fill to HIGH (or wet HIGH) | the pump stops |
| 4.3 | **Overflow.** Pump running, wet OVERFLOW | the pump stops at once; FAULT (red) on; it stays off when OVERFLOW is dry again; RESET (SW2) clears it |
| 4.4 | **Independent protection, overflow.** Tank above LOW (the pump off); hold the TEST button SW1 on the board (it forces K6 on): the pump runs; still holding it, wet OVERFLOW | the pump stops (K8 and K5 open) though K6 is forced on. Release SW1 |
| 4.5 | **Source dry.** Pump running, lift DRY out of the water | the pump stops within about a second; SOURCE DRY (yellow) on |
| 4.6 | Put DRY back | the pump stays off for about 8 min (stopwatch: 6.5 … 9.5 min), then runs if the tank is below LOW |
| 4.7 | **Independent protection, dry.** Hold SW1 (the pump runs); lift DRY out | the pump stops (K5 opens). Release SW1 |
| 4.8 | **COM rods.** Supply off; disconnect the tank's COM return core (X4); supply on, tank below LOW | the pump does not run (K5 open). Supply off; reconnect X4. Repeat with the source's COM return core (X14) |
| 4.9 | **Power cut.** Tank below LOW, supply off for 10 s and on | the pump starts after about 8 s |
| 4.10 | After all tests: tank below LOW | the pump starts; at HIGH it stops (4.1, 4.2 again: nothing left forced) |

The maximum run time (about 2.2 h) is checked by type test TT-3, not at commissioning.

## Record

| Item | Expected | Measured | OK |
|---|---|---|---|
| PE continuity | ≤ 0.1 Ω | | |
| Insulation mains–PE | ≥ 1 MΩ | | |
| Insulation mains–control | ≥ 1 MΩ | | |
| Insulation control–PE (SELV) | ≥ 1 MΩ | | |
| Q1 setting | pump's rated current: ___ A | | |
| +12 V | 11.6 … 12.4 V | | |
| RCD trips | yes | | |
| Start below LOW, stop at HIGH | yes | | |
| Overflow: stop, FAULT, RESET | yes | | |
| Independent protection, overflow (SW1 held) | the pump stops | | |
| Source dry: stop, lockout 6.5 … 9.5 min | yes | | |
| Independent protection, dry (SW1 held) | the pump stops | | |
| COM return cores disconnected (X4, X14) | the pump does not run | | |
| Start delay after a power cut | about 8 s | | |
| Final cycle, nothing forced (4.10) | starts below LOW, stops at HIGH | | |

Date, serial number, name and signature of the electrician:
