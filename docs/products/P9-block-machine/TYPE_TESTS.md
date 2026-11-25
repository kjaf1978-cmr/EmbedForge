# Block moulding machine (P9): prototype type tests

The safety circuit and the outputs are verified by simulation (tests/blockmachine.test.ts, the
safety relays as a behavioural model of their certified function) and the firmware by host unit
tests (firmware/block-machine, `make test`); DFMEA section 3d, BM-1 … BM-16. The tests below cover
what neither can: the real relays, contactors, valves and hydraulics, the machine's vibration,
heat and dust, and the performance levels. The designators are those of the schematic.

| # | Test | Method | Pass | DFMEA |
|---|---|---|---|---|
| TT-1 | The control on the machine | every step of COMMISSIONING sections 3 … 5 on the prototype, 20 times each | as the procedure, every time | BM-1 … BM-16 |
| TT-2 | Performance level | SISTEMA (or equivalent) for the E-stop, the guards and the start interlock with the parts as built, including the guard switches and the hydraulic part | PL d or better for each (INSTALLATION section 4) | BM-1, BM-7 |
| TT-3 | Endurance | 10 000 cycles (no concrete after the first 500) | no fault other than those provoked; no contact welded; the read-back never false | BM-3, BM-4, BM-12 |
| TT-4 | Vibration | the control board and the panel on the machine through 1000 cycles; then every terminal's torque, the Mega's seating | nothing loosened; no false input | BM-10 |
| TT-5 | Output faults on the real loads | each output shorted to the frame and bridged to +24 V (COMMISSIONING 4.9, 4.10) on every channel; a valve plug with a built-in diode fitted by mistake | FAULT every time; no load acts; the diode plug: the valve's release time measured and stated | BM-12, BM-13 |
| TT-6 | EMC | IEC 61000-6-2 (industrial immunity): bursts on the sensor and valve cables, surges on the 24 V | no false motion; no fault other than reported | BM-10 |
| TT-7 | Temperature | the panel at 45 °C ambient, the machine cycling for 4 h | the 24 V supply, the regulator U1, the high-side switches and the contactors within their ratings | — |
| TT-8 | Stopping time | COMMISSIONING 5.6 with the vibrators and the mixer at full load | recorded; guard locking where required | BM-7 |
| TT-9 | Hydraulic holding | COMMISSIONING 5.1, 5.2 with the oil hot (60 °C) | the tamper and the mould drift less than 5 mm in 10 min | BM-14 |

The machine's CE marking (the Machinery Directive / Regulation, EN 60204-1, EN ISO 13849-1,
EN ISO 14119, EN ISO 4413, and the risk assessment to EN ISO 12100) is its builder's and is not
part of these tests.
