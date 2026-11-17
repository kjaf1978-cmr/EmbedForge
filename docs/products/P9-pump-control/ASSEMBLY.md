# Pump controller (P9): assembly guide

The controller is made of:

- **The board** (2 layers, 2 oz; its size in `3-pcb/`): the safety transformer and its fuse, the
  12 V supply, the electrode excitation and sensing, the timers and the logic, the independent
  protection's comparators, the relay drivers, the LEDs, the RESET button and the electrode
  terminals.
- **The DIN rail:** the motor-protective breaker QF1, the contactor KM, the two interface relays
  K1 (pilot) and K2 (independent protection), the 2 A gG fuse F2 of the coil circuit, the power
  terminals X1 … X6.
- **The enclosure** with its PE stud.

## 1. What you need

| File | Use |
|---|---|
| `3-pcb/pump-control/…-fabrication.zip` | order the board (Gerber, drill) |
| `…-bom.csv` | the parts on the board and the parts wired to it |
| `…-assembly.pdf` | where each part goes |
| `…/panel.csv` | the wiring list: each wire between the board's connectors and the DIN-rail parts |
| `1-schematics/pump-control-schematic.pdf` | the circuit |
| `4-parts-list/` | the costed parts list |

The DIN-rail parts:

| Ref | Part |
|---|---|
| QF1 | Schneider GV2ME14 (6 … 10 A), L and N through two poles |
| KM | 9 A AC-3 contactor, coil 230 V AC (Siemens 3RT2016-1AP01 or Schneider LC1D09P7), L and N |
| K1, K2 | Finder 38.51.7.012.0050 (12 V DC coil, reinforced insulation coil–contact): do not replace with a relay without reinforced insulation |
| F2 | 2 A gG 10 × 38 in a DIN-rail fuse holder |

The transformer TR1 must be a safety isolating transformer to IEC 61558-2-6 (the Block VB 2,0/1/15
is one): do not replace it with a plain transformer.

## 2. The board

1. **Fit the parts in order of height:** resistors and diodes, ICs (sockets are not needed),
   capacitors, LEDs, transistors, the bridge, the fuse holder with its ceramic fuse (F1 T 0.2 A H),
   the regulator, the transformer, the button, the terminal blocks and connectors.
2. **Clean and check:** no solder bridges; the resistance between +12 V and ground above 1 kΩ; no
   continuity between the mains pins (TR1's primary, F1) and anything on the control side.
3. **Conformal coating:** everything except terminals, connectors, the fuse holder, the button and
   the LEDs.

## 3. Wiring

1. Mount the DIN-rail parts; the board on stand-offs on the control side of the enclosure.
2. **Mains:** X1 → QF1 (L and N) → KM (L and N) → X4, X5; the coil circuit L → F2 → K2's contact →
   K1's contact → KM's A1, A2 to N; the board's mains feed (L, N) to its mains connector.
3. **Control:** K1's and K2's coils to the board's control connector (panel.csv); the electrode
   cables to X7 … X12.
4. **PE** from X3 and X6 to the stud; the board's XPE to the stud with one conductor; the
   enclosure, door and DIN rail bonded to the stud.
5. Keep the mains wiring and the control and electrode wiring at least 6 mm apart (or separated by
   a barrier).

## 4. Next step

Commission (COMMISSIONING.md).
