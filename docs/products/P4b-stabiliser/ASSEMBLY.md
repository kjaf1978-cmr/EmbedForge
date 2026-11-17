# Mains voltage stabilisers 5, 10 and 15 kVA, contactor-switched taps (P4b): assembly guide

Each unit is made of:

- **The control board** (2 layers, 2 oz; its size in `3-pcb/`): the supplies' fuses, the 12 V
  supply module, the sense and the comparators, the latch and the priority decoder, the coil
  drivers, the match check, the tap-change sequencer, the restart delay, the independent
  protection, the relays K8 and K11. The same board for all three sizes.
- **The DIN rail:** the 2-pole input breaker Q1, the output breaker Q17, the seven tap contactors
  K1 … K7, the input contactor K10, the output contactor K9, the 24 V supply PS2 (a potted unit
  with leads, mounted beside the rail), the power terminals X1 … X6.
- **The autotransformer,** with its built-in thermal cut-out, and **the enclosure** with its PE
  stud.

Read USER_MANUAL.md first (safety). The board is at mains potential.

## 1. What you need

| File | Use |
|---|---|
| `3-pcb/stabiliser-t/…-fabrication.zip` | order the control board (Gerber, drill) |
| `…-bom.csv` | the parts on the board, and the parts wired to it |
| `…-assembly.pdf` | where each part goes |
| `…/panel.csv` | the wiring list: each wire between the board's panel connector and the DIN-rail parts, its ends and its size |
| `1-schematics/stabiliser-t-*kva-schematic.pdf` | the circuit of each size |
| `4-parts-list/` | the costed parts list of each size |

The DIN-rail parts per size:

| | 5 kVA | 10 kVA | 15 kVA |
|---|---|---|---|
| Q1 | ABB S201-C40NA (1P+N) | ABB S802C-C80 | ABB S802C-C125 |
| Q17 | ABB S201-C25NA (1P+N) | ABB S201-C50NA (1P+N) | ABB S802C-C80 |
| K1 … K7 | 7 × Schneider LC1D25BD | 7 × LC1D40ABD | 7 × LC1D50ABD |
| K10, K9 | 2 × LC1D40ABD | 2 × LC1D80BD | 2 × LC1D115BD |
| PS2 | Mean Well HLG-100H-24 | same | same |

Every contactor has a 24 V DC coil and 1 NO + 1 NC built-in auxiliaries (13-14, 21-22); the tap
contactors and K10 also a front-mounted auxiliary block LADN11 (1 NO 43-44 + 1 NC 31-32). The NC
contacts must be mirror contacts (IEC 60947-4-1 Annex F, stated by the maker for TeSys D): the
mirror chain relies on them. The checks run about 5 mA through the auxiliaries at 12 or 24 V: if
the maker states a higher minimum, fit the gold-plated low-level block LADN11P.

**Coil data of the 15 kVA unit (open):** check the LC1D115BD's coil on the data sheet before
ordering. If it is an electronic coil with a pull-in power above about 60 W, fit a 240 W supply
(HLG-240H-24) instead of the HLG-100H-24.

The autotransformer is made to specification:

| | 5 kVA | 10 kVA | 15 kVA |
|---|---|---|---|
| Rating, output tap | 5 kVA, 230 V | 10 kVA, 230 V | 15 kVA, 230 V |
| Taps | 150 / 170 / 190 / 210 / 230 / 250 / 280 V | same | same |
| Every section rated for | 36 A | 71 A | 107 A |

Order it also with:

- no saturation at 1.1 × rated volts per turn on any tap;
- class F;
- the no-load loss and the magnetising current stated;
- the inrush current at switch-on at the worst phase stated, at most 10 × the rated input current
  (K10 energises the transformer at every tap change; Q1 is D-curve);
- a thermal cut-out in the winding: NC, opens at 115 °C ± 5 °C, self-resetting, rated 24 V DC 2 A
  (it carries K10's coil current), double-insulated leads;
- a routine test certificate: insulation 2.5 kV and the ratio of each tap.

## 2. The board

1. **Fit the parts in order of height** (the assembly drawing): resistors and diodes, ICs,
   capacitors, trimmers (do not turn them: COMMISSIONING.md 1.4 sets them to their safe end first), LEDs, transistors and MOSFETs, bridges, the fuse holders with their ceramic
   fuses (F1 T 1 A H, F2 T 2 A H, F3 T 0.5 A H), the supply module PS1, the sense transformers,
   the relays K8 and K11 (Song Chuan 832A: check which fixed contact is NC on the first one by
   continuity), the terminal blocks and the panel connector.
2. **Clean and check:** no solder bridges; the resistance between +12 V and ground above 1 kΩ,
   between +24 V and ground above 1 kΩ.
3. **Conformal coating:** everything except terminals, connectors, fuse holders, relays, trimmers
   and LEDs.

## 3. The DIN rail and wiring

1. **Mount** Q1, K10, K1 … K7 (in tap order), K9, Q17 and the terminals; PS2 beside the rail.
2. **Link the three poles of each tap contactor** on both sides (1-3-5 together, 2-4-6 together),
   with the size in INSTALLATION.md section 3 or the maker's paralleling links. K10 uses one pole
   (1-2); K9 two (1-2 for L, 3-4 for N).
3. **Power wiring:** X1 → Q1 → K10 pole 1; K10 pole 2 → the common bar of K1 … K7 (their 1-3-5
   sides); each K_k's 2-4-6 side → tap k of the transformer; the 230 V tap → Q17 → K9 → X4, X5; N
   from Q1 to the transformer's N, to Q17 and to the board's N terminal. Sizes in INSTALLATION.md
   section 3.
4. **Control wiring** by panel.csv: the coils (A1, A2) of K1 … K7, K10 and K9; the auxiliaries of
   K1 … K7 (13-14 NO, 21-22 NC in the mirror chain, 43-44 NO of the seal-in) and of K10 (21-22 and
   31-32 NC, 43-44 NO); PS2's input and output; the thermal cut-out
   (X8, X9); the board's mains feeds (VIN, N) and the 230 V tap feed of the protection. Every
   wire labelled with its net name at both ends.
5. **PE** from X3 and X6 to the PE stud; the board's X7 to the stud with one conductor; the
   enclosure, door, DIN rail and transformer core bonded to the stud.

**Check the taps** before connecting the transformer to the contactors: feed 23.0 V AC (from a
safety isolating transformer) between N and the 230 V tap, and measure each tap to N. Expected:
15.0, 17.0, 19.0, 21.0, 23.0, 25.0 and 28.0 V (± 2 %).

**Check the auxiliaries** with the supply off and the board's panel connector unplugged: press each
tap contactor's armature by hand (with the maker's test tool, if any) and check that its 13-14
closes; check that K10's 21-22 is closed at rest and opens when its armature is pressed.

## 4. Next step

Fit the rating plate (INSTALLATION.md section 5), then commission (COMMISSIONING.md).
