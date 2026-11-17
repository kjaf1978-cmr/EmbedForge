# Pump controller (P9): assembly guide

The designators are those of the schematic, the board, the parts list and the wiring list
(panel.csv).

The controller is made of:

- **The board** (2 layers, 2 oz; its size in `3-pcb/`): the safety transformer T1 and its fuse F1,
  the 12 V supply, the electrode excitation and sensing, the timers and the logic, the independent
  protection's sensing and comparators, the relay drivers, the LEDs, the TEST button SW1 and the
  connectors.
- **The DIN rail:** the motor-protective breaker Q1, the protection contactor K5 and the pump
  contactor K7, the interface relays K6 (pilot) and K8 (independent protection), the gG 2 A fuse F2,
  the power terminals X1, X2, X3, X6, X8, X10.
- **The door:** the RESET button SW2. **The enclosure** with its PE stud.

## 1. What you need

| File | Use |
|---|---|
| `3-pcb/pump-control/…-fabrication.zip` | order the board (Gerber, drill) |
| `…-bom.csv` | the parts on the board and the parts wired to it |
| `…-assembly.pdf` | where each part goes |
| `…/panel.csv` | the wiring list: each wire between the board's connectors and the DIN-rail and door parts |
| `1-schematics/pump-control-schematic.pdf` | the circuit |
| `4-parts-list/` | the costed parts list |

The DIN-rail and door parts:

| Ref | Part |
|---|---|
| Q1 | Schneider GV2ME16 (9 … 14 A), wired for single phase as the maker shows |
| K5, K7 | Schneider LC1D18P7 (18 A AC-3, coil 230 V AC), L and N; K5 after Q1, K7 after K5 |
| K6, K8 | Finder 38.51.7.012.0050 (12 V DC coil, reinforced insulation coil–contact): do not replace with a relay without reinforced insulation |
| F2 | 2 A gG 10 × 38 in a DIN-rail fuse holder |
| SW2 | 22 mm push button, 1 NO (RESET), on the door |

The transformer T1 must be a safety isolating transformer to IEC 61558-2-6 (the Block VB 4,5/1/15
is one): do not replace it with a plain transformer.

## 2. The board

1. **Fit the parts in order of height:** resistors and diodes, ICs (sockets are not needed),
   capacitors, LEDs, transistors, the bridge, the TVS diodes, the fuse holder with its ceramic fuse
   (F1 T 0.2 A H), the regulator, the transformer, the TEST button, the terminal blocks and
   connectors.
2. **Clean and check:** no solder bridges; the resistance between +12 V and 0 V above 1 kΩ; no
   continuity between the mains pins (T1's primary, F1) and anything on the control side.
3. **Conformal coating:** everything except terminals, connectors, the fuse holder, the button and
   the LEDs.

## 3. Wiring

1. Mount the DIN-rail parts; the board on insulating stand-offs on the control side of the
   enclosure; SW2 on the door.
2. **Mains:** X1 → Q1 (L and N) → K5 (L and N) → K7 (L and N) → X6, X8; the coil circuit L → F2 →
   K8's contact → K5's coil, and F2 → K6's contact → K7's coil, both coils' A2 to N; the board's
   mains feed from F2's output and N to its mains connector.
3. **Control:** K6's and K8's coils and SW2 to the board's control connector (panel.csv); the
   electrode cables to their terminals, each COM rod on two cores.
4. **PE** from X3 and X10 to the stud; the enclosure, door and DIN rail bonded to the stud. **The
   board's 0 V is not connected to PE** (SELV).
5. Keep the mains wiring and the control and electrode wiring at least 6 mm apart (or separated by
   a barrier).

## 4. Next step

Commission (COMMISSIONING.md).
