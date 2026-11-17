# Pump controller (P9): commissioning procedure

Done by a qualified electrician before the controller is put into service, and after any repair.
Record every result at the end.

You need an installation tester (500 V insulation, continuity, RCD test), a multimeter, a
stopwatch, and a bucket of water (or access to the tank) to wet the electrodes.

## 1. Before any voltage

1. **Visual check:** the wiring against panel.csv; K1 and K2 are the reinforced interface relays;
   TR1 is the safety transformer; the mains and the control and electrode wiring kept apart.
2. **PE continuity** from X3 to X6, the PE stud, the enclosure, the door, the DIN rail, the pump's
   metal parts: ≤ 0.1 Ω plus the leads.
3. **Insulation, mains to PE:** L and N joined, against PE, 500 V DC, QF1 on, XPE disconnected from
   the stud: ≥ 1 MΩ.
4. **Insulation, mains to the control (PELV):** L and N joined, against the electrode terminals
   X7 … X12 joined, 500 V DC (the board's XPE disconnected): ≥ 1 MΩ. Reconnect XPE afterwards.
5. **QF1** set to the pump's rated current.

## 2. Power-up (the pump connected, the tank above LOW, the source wet)

| Step | Action | Expected |
|---|---|---|
| 2.1 | Supply on | no LED for the start delay; the pump stays off (the tank is above LOW) |
| 2.2 | +12 V to ground (the regulator's output) | 11.6 … 12.4 V |
| 2.3 | RCD test button | the RCD trips |

## 3. Electrodes

With the rods in water: the voltage between COM and each sensing rod is a small AC (about 6 V
peak-to-peak) while it is in the water, more while it is out. Lift each rod out and back in and
watch the controller (section 4).

## 4. Function

| Step | Action | Expected |
|---|---|---|
| 4.1 | Let the tank fall below LOW (or lift LOW out of the water) | after the start delay, RUN (green) on, the contactor closes, the pump runs |
| 4.2 | Let it fill to HIGH (or wet HIGH) | the pump stops |
| 4.3 | **Overflow.** Pump running, wet OVERFLOW | the pump stops at once; FAULT (red) on; it stays off when OVERFLOW is dry again; RESET clears it |
| 4.4 | **Independent protection.** Supply off; bridge K1's contact (terminals 11 and 14 of K1) with a short insulated wire; supply on with the tank below LOW: the pump runs; wet OVERFLOW | the pump stops (K2 opens), though K1 is bridged. Supply off, remove the bridge |
| 4.5 | **Source dry.** Pump running, lift DRY out of the water | the pump stops within about a second; SOURCE DRY (yellow) on |
| 4.6 | Put DRY back | the pump stays off for 8.5 min (stopwatch: 8 … 9 min), then runs if the tank is below LOW |
| 4.7 | **Independent protection, dry.** As 4.4 with K1 bridged; lift DRY out | the pump stops (K2 opens) |
| 4.8 | **Power cut.** Tank below LOW, supply off and on | the pump starts after about 8 s |

The maximum run time (2.3 h) is checked by type test TT-3, not at commissioning.

## Record

| Item | Expected | Measured | OK |
|---|---|---|---|
| PE continuity | ≤ 0.1 Ω | | |
| Insulation mains–PE | ≥ 1 MΩ | | |
| Insulation mains–control (PELV) | ≥ 1 MΩ | | |
| QF1 setting | pump's rated current: ___ A | | |
| +12 V | 11.6 … 12.4 V | | |
| RCD trips | yes | | |
| Start below LOW, stop at HIGH | yes | | |
| Overflow: stop, FAULT, RESET | yes | | |
| Independent protection, overflow (K1 bridged) | the pump stops | | |
| Source dry: stop, lockout 8 … 9 min | yes | | |
| Independent protection, dry (K1 bridged) | the pump stops | | |
| Start delay after a power cut | about 8 s | | |

Date, serial number, name and signature of the electrician:
