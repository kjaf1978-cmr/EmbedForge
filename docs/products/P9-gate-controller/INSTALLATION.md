# Gate controller (P9): installation guide

For the electrician and the gate installer. The local rules for powered gates (in the EU,
EN 12453, EN 12604, EN 12978) and for wiring take precedence. The designators are those of the
schematic, the board and the parts list.

## 1. Wiring

```
24 V DC supply (150 W) ── X1 +24 V / X2 0 V ── board ── X4, X5 motor
X9 (+24 V) ── open limit (NC) ── X3
X9 (+24 V) ── close limit (NC) ── X6 ;  X7 ── photo-beam receiver's contact (NC) ── X8
```

- **Supply:** a 24 V DC 150 W DIN-rail supply (for example Mean Well HDR-150-24), in its own
  enclosure or the controller's, on a fused mains circuit with an RCD. The board fuses the 24 V at
  10 A (F1).
- **Motor:** X4 and X5. If the gate opens when it should close, swap the two motor wires (and
  check the limit switches are on the right ends).
- **Limit switches:** normally closed, opened by the gate at its end: the open end's between X9
  and X3, the closed end's between X9 and X6.
- **Photo-beam:** a transmitter and receiver across the opening, with a normally closed relay
  contact (closed while the beam is received), between X7 and X8. Its supply as its maker states
  (24 V from X9 and X2 if its consumption is within 100 mA). **Do not bridge X7–X8:** the gate
  would close onto anything in its path, stopped only by the obstacle cut-off.
- **Infrared receiver:** on the board, behind a clear window in the enclosure facing where the
  remote is used.

## 2. Cables

| Circuit | Size |
|---|---|
| Supply and motor | 1.5 mm² up to 10 m, 2.5 mm² beyond (the motor's start current) |
| Limit switches, photo-beam | 0.5 … 1 mm², outdoor-rated, away from the motor cable where possible |

## 3. Mechanics and force

- The gate must move freely by hand (unlocked) before the motor is fitted.
- The obstacle cut-off acts above about 7 A for 0.1 s: with the motor of the design model, about
  the force at which the gate stalls. **Check the force at the closing edge at commissioning**
  (COMMISSIONING.md section 4): the rules limit it (EN 12453: at most 400 N for the first 0.75 s of
  contact, then lower). A motor much stronger than the design's needs a lower cut-off (R24, 69.8k with R28,
  1k, sets 7 A: a larger R24 lowers it, the threshold is 5 V · R28 / (R24 + R28) across the 10 mΩ
  shunt R23) or a safety edge.

## 4. Before handing over

Commissioning (COMMISSIONING.md), including pairing the remotes.
