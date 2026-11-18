# Gate controller (P9): prototype type tests

The circuit is verified by simulation (tests/gate.test.ts) and the firmware's logic by host unit
tests (firmware/gate-controller, `make test`); DFMEA section 3d, GC-1 … GC-10. The tests below
cover what neither can: the motor and gate as built, the firmware on the Nano, real remotes,
heat, surges and the standards for powered gates. The designators are those of the schematic.

| # | Test | Method | Pass | DFMEA |
|---|---|---|---|---|
| TT-1 | The program on the Nano | the board with the intended motor on a test gate (or a flywheel): every step of COMMISSIONING sections 3 and 4, 20 times each | as the procedure, every time | GC-1 … GC-6 |
| TT-2 | Force | EN 12453 / EN 12445 force measurement at the closing edge, at three heights, with the intended motor and gate | within the limits; else the cut-off's resistor changed or a safety edge required, and the installation guide updated | GC-1 |
| TT-3 | Watchdog | the program halted (a debug build that stops in a loop) while the gate moves | the Nano resets within 0.3 s; the motor stops and nothing moves until a press | GC-8 |
| TT-4 | Remotes | ten NEC remotes of different makers; at 10 m in daylight and under a fluorescent lamp; a learning remote copying a paired one | each pairs and works; the copy works (documented: IR is not a lock) | GC-7 |
| TT-5 | Motor short and stall | the motor's cable shorted while running; the motor held still | the cut-off trips; F1 does not blow on a stall; Q7 survives 50 shorts | GC-3 |
| TT-6 | Relay life | 10 000 open/close cycles with the intended motor | no relay contact welded; the relays switch without current (RUN off first) | GC-6 |
| TT-7 | Surge | IEC 61000-4-5, 1 kV on the motor and limit cables, 500 V on the 24 V supply | no damage; no false movement | GC-3 |
| TT-8 | Temperature | the enclosure in the sun (or at 55 °C), the gate cycling for 2 h | the regulator, Q7 and the relays within their ratings | — |

The product's certification as part of a powered gate is a separate step (in the EU, the
Machinery Directive with EN 12453). It is not part of these tests.
