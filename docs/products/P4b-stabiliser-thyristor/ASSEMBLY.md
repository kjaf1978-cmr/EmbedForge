# Mains voltage stabilisers 5, 10 and 15 kVA (P4b): assembly guide

Each unit is made of:

- **The logic board** (235 × 160 mm, 2 layers, 2 oz): sense, tap logic, the protection, the
  restart delay, the output relay and the protection's relay, the 12 V supply module.
- **Seven pair-driver boards** (120 × 80 mm each), one per tap: the opto-triac firing, the pair's
  voltage sense for the break-before-make, the snubber, two entry fuses.
- **The heatsink assembly:** seven thyristor modules, the fan with its 50 °C thermostat, the NTC.
- **The DIN rail:** the 2-pole breaker QF1, the aR fuse FAR, the output contactor KM, the power
  terminals X1 … X6.
- **The autotransformer,** with its built-in thermal cut-out, and **the enclosure** with its PE
  stud.

Read USER_MANUAL.md first (safety). The boards are at mains potential.

## 1. What you need

| File | Use |
|---|---|
| `3-pcb/stabiliser-t-logic/…-fabrication.zip` | order the logic board (Gerber, drill) |
| `3-pcb/stabiliser-t-pair/…-fabrication.zip` | order seven pair-driver boards |
| `…-bom.csv` of each board | the parts on each board, and the parts wired to it |
| `…-assembly.pdf` of each board | where each part goes |
| `…/panel.csv` of each board | the wiring list: each wire, its ends and its size |
| `1-schematics/stabiliser-t-*kva-schematic.pdf` | the circuit of each size |

The autotransformer is made to specification:

| | 5 kVA | 10 kVA | 15 kVA |
|---|---|---|---|
| Rating, output tap | 5 kVA, 230 V | 10 kVA, 230 V | 15 kVA, 230 V |
| Taps | 150 / 170 / 190 / 210 / 230 / 250 / 280 V | same | same |
| Every section rated for | 36 A | 71 A | 107 A |

Order it also with:

- no saturation at 1.1 × rated volts per turn on any tap;
- class F;
- the no-load loss stated;
- a thermal cut-out in the winding: NC, opens at 115 °C ± 5 °C, self-resetting, 250 V AC 2 A,
  double-insulated leads;
- a routine test certificate: insulation 2.5 kV and the ratio of each tap.

## 2. The heatsink assembly

1. **Heatsink.** One shared heatsink for the seven modules, with a fan. Its thermal resistance to
   the air, with the fan running, at most 1.0 / 0.45 / 0.2 K/W (5 / 10 / 15 kVA): only the
   selected pair conducts, about 30 / 65 / 150 W at full load and 140 V, so the heatsink stays
   below about 70 °C at 40 °C ambient. Type test TT-1 confirms it.
2. **Modules.** Seven SKKT 106/16E (5, 10 kVA) or SKKT 162/16E (15 kVA), isolated base, with
   thermal paste or pad and the maker's mounting torque. Each module is wired anti-parallel as the
   module's datasheet shows: the two thyristors' opposite terminals joined.
   - One side goes to the common input bar (after the aR fuse).
   - The other side goes to its tap.
   - Each thyristor's gate and auxiliary cathode go to its pair-driver board, as twisted pairs.
3. **Fan and thermostat.** A 230 V AC fan, switched by a normally open 50 °C
   bimetal thermostat on the heatsink (it closes as the heatsink warms), wired to the logic board's fan terminals XF1, XF2.
4. **NTC.** A ring-lug NTC 10 kΩ (B 3950) on the heatsink, next to the hottest module, wired to
   XN1, XN2. An open sensor trips the unit (it reads as below −30 °C).

## 3. The boards

1. **Fit the parts in order of height** (each board's assembly drawing): resistors and diodes,
   ICs, capacitors, trimmers (do not turn them: set at commissioning), LEDs, transistors,
   bridges, the fuse holders with their ceramic fuses (logic: F1 T 1 A H, FT5 T 0.5 A H, FT6 T 1 A
   H; pair boards: FA, FB T 0.5 A H), the supply module PS1, the sense transformers, the relays
   KO and KP (Song Chuan 832A: check which fixed contact is NC on the first one by continuity), the
   terminal blocks.
2. **Clean and check:** no solder bridges; the resistance between +12 V and ground above 1 kΩ.
3. **Conformal coating:** everything except terminals, fuse holders, relays, trimmers and LEDs.

## 4. Wiring

Wire each unit by the panel.csv wiring lists: the sizes in INSTALLATION.md section 3 for the power
circuits, 1.5 mm² for the board feeds behind their fuses, twisted pairs for the gates. PE from X3
and X6 to the PE stud; the logic board's XPE to the stud with one conductor; the enclosure,
door, heatsink and transformer core bonded to the stud.

**Check the taps** before connecting the transformer to the modules: feed 23.0 V AC (from a
safety isolating transformer) between N and the 230 V tap, and measure each tap to N. Expected:
15.0, 17.0, 19.0, 21.0, 23.0, 25.0 and 28.0 V (± 2 %).

## 5. Next step

Fit the rating plate (INSTALLATION.md section 5), then commission (COMMISSIONING.md).
