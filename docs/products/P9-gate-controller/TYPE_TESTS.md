# Gate controller (P9): prototype type tests

The circuit is verified by simulation (tests/gate.test.ts) and the firmware's logic by host unit
tests (firmware/gate-controller, `make test`); DFMEA section 3d, GC-1 … GC-13. The tests below
cover what neither can: the motor, supply and gate as built, the firmware on the Nano, real
remotes and photo-beams, heat, surges and the standards for powered gates. The designators are
those of the schematic.

| # | Test | Method | Pass | DFMEA |
|---|---|---|---|---|
| TT-1 | The program on the Nano | the board with the intended motor on a test gate (or a flywheel): every step of COMMISSIONING sections 3 to 5, 20 times each | as the procedure, every time | GC-1 … GC-6, GC-10 |
| TT-2 | Force | EN 12453 / EN 12445 force measurement at the closing edge, at three heights, with the intended motor and gate; also blocked from the start of a close, and with the gate stiffened (the cut-off's slowest case near 7 A) | within the limits; else the cut-off's resistor changed or a safety edge required, and the installation guide updated | GC-1 |
| TT-3 | Watchdog and reset | the program halted (a debug build that stops in a loop) while the gate moves; the Nano reset with its button while the gate moves | the Nano resets within 0.3 s and its program runs again (the Optiboot bootloader); the motor stops and nothing moves until a press | GC-8 |
| TT-4 | Remotes | ten NEC remotes of different makers; at 10 m in daylight and under a fluorescent lamp; a learning remote copying a paired one; a fifth remote paired after a power cut; erase with LEARN | each pairs and works; the fifth replaces the oldest; erase works; the copy works (documented: IR is not a lock) | GC-7 |
| TT-5 | Motor short and stall | the motor's cable shorted while running; the motor held still; Q9 replaced by a wire link (a shorted MOSFET) and the motor held | the cut-off trips; F1 does not blow on a stall; Q9 survives 50 shorts; with Q9 linked, the trip drops the relays and the motor stops | GC-3, GC-11 |
| TT-6 | Relays | 10 000 open/close cycles with the intended motor, each ending at a limit switch (the relay breaks the running current there); the 832A's datasheet ratings checked for 28 V DC breaking (NO) and the braking current through the NC contact | no relay contact welded; within the ratings | GC-6 |
| TT-7 | Surge | IEC 61000-4-5, 1 kV on the motor, limit, STOP, photo-beam and key-switch cables, 500 V on the 24 V supply | no damage; no false movement | GC-3 |
| TT-8 | Temperature | the enclosure in the sun (or at 55 °C), the gate cycling for 2 h | the regulator, Q9, Q12 and the relays within their ratings | — |
| TT-9 | The supply | the intended 24 V supply (and each one the installation guide names): the motor stalled from running and from the start, 20 times | the supply delivers past 7 A without folding back or switching off; the cut-off trips every time | GC-12 |
| TT-10 | Photo-beams | three photo-beams of different makers on X14: the test before each close, 100 times; each bridged at X7–X8 | each passes its test; bridged, no close | GC-13 |
| TT-11 | The cut-off's threshold | the motor's current raised slowly by a load (an electronic load in place of the motor) on five boards | trips between 6.1 and 7.9 A | GC-1 |

The product's certification as part of a powered gate is a separate step (in the EU, the
Machinery Directive with EN 12453, including the performance levels of its safety functions to
EN ISO 13849-1). It is not part of these tests.
