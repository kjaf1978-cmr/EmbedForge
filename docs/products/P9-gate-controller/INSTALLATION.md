# Gate controller (P9): installation guide

For the electrician and the gate installer. The local rules for powered gates (in the EU,
EN 12453, EN 12604, EN 12978) and for wiring take precedence. The designators are those of the
schematic, the board and the parts list.

## 1. Wiring

```
24 V DC supply (≥ 10 A) ── X1 +24 V / X2 0 V ── board ── X4, X5 motor
X10 ── STOP (NC, or a wire link) ── X11 = X9 (the limit switches' +24 V)
X9 ── open limit (NC) ── X3
X9 ── close limit (NC) ── X6 ;  X7 ── photo-beam receiver's contact (NC) ── X8
X14 (+24 V, tested) ── photo-beam transmitter ── X2 (0 V)
X12 ── push-button / key-switch (NO) ── X13 (0 V)
```

- **Supply:** a 24 V DC DIN-rail supply of **at least 10 A (240 W)**, for example Mean Well
  SDR-240-24 or NDR-240-24, in its own enclosure or the controller's, on a fused mains circuit
  with an RCD. It must deliver the motor's stall current (12 A in the design model) for about
  0.5 s without folding back or switching off: the obstacle cut-off needs the current to rise past
  7 A. A supply that limits its current near 7 A or below would let a stalled gate keep pressing
  (DFMEA GC-12). Check the supply's overload behaviour in its datasheet, and TYPE_TESTS TT-9. The
  board fuses the 24 V at 10 A (F1).
- **Motor:** X4 and X5. The direction is checked at commissioning (COMMISSIONING.md section 3)
  **before** the gate is coupled to the motor: with the wires the wrong way round, the open relay
  drives the gate closed, the open limit is at the wrong end and the photo-beam does not act.
- **Limit switches:** normally closed, opened by the gate at its end: the open end's between X9
  and X3, the closed end's between X9 and X6.
- **STOP:** a normally closed stop button between X10 and X11, or a wire link where none is
  fitted. Pressed, it cuts the limit switches' feed: both relays drop in hardware.
- **Photo-beam:** a transmitter and receiver across the opening. The receiver's normally closed
  relay contact (closed while the beam is received) between X7 and X8; its supply as its maker
  states (24 V from X9 and X2 if within 50 mA). **The transmitter's supply from X14 and X2** (up to
  100 mA): the controller switches it off and on before each close to test the beam. **Do not
  bridge X7–X8, and do not feed the transmitter from elsewhere:** the test then fails and the gate
  will not close (a bridged beam would let the gate close onto anything in its path).
- **Push-button / key-switch:** a normally open contact between X12 and X13, for example a
  key-switch at the gate. It works like the remote's button. Keep its cable short (up to 30 m) and
  away from the motor cable.
- **Infrared receiver:** on the board (U5), behind a clear window in the enclosure facing where the
  remote is used.

## 2. Cables

| Circuit | Size |
|---|---|
| Supply and motor | 1.5 mm² up to 10 m, 2.5 mm² beyond (the motor's start current) |
| Limit switches, STOP, photo-beam, key-switch | 0.5 … 1 mm², outdoor-rated, away from the motor cable where possible |

## 3. Mechanics and force

- The gate must move freely by hand (unlocked) before the motor is fitted.
- The obstacle cut-off acts above about 7 A (6.1 … 7.9 A with the comparator's tolerance) through
  a 0.1 s filter: within 0.1 s at a hard stall of the design's motor, 0.27 s at 7.5 A, and within
  0.24 s when the gate is blocked from the start (the first 0.1 s of a move is blanked for the
  motor's start current). **Check the force at the closing edge at commissioning**
  (COMMISSIONING.md section 5): EN 12453 limits it (dynamic force at most 400 N, with the force
  above 150 N for at most 0.75 s; static force at most 150 N from then to 5 s, and at most 25 N
  after 5 s). A motor much stronger than the design's needs a lower cut-off (R29, 69.8k, with R33,
  1k, sets 7 A: the threshold is 5 V · R33 / (R29 + R33) across the 10 mΩ shunt R28, so a larger
  R29 lowers it) or a safety edge.
- **Performance level.** EN 12453:2017 requires each safety function (force limitation, the
  photo-beam, STOP) to reach a performance level to EN ISO 13849-1 (typically PL c). This
  controller has not been assessed for it: the cut-off is one channel without a periodic test, the
  beam is tested before each close. The installer's risk assessment decides whether a safety edge
  or other measures are needed (TYPE_TESTS.md).

## 4. Before handing over

Commissioning (COMMISSIONING.md), including pairing the remotes.
