# Gate controller (P9): assembly guide

The designators are those of the schematic, the board and the parts list.

## 1. What you need

| File | Use |
|---|---|
| `3-pcb/gate-controller/…-fabrication.zip` | order the board (Gerber, drill) |
| `3-pcb/gate-controller/…-bom.csv` | the parts list |
| `3-pcb/gate-controller/…-assembly.pdf` | where each part goes |
| `1-schematics/gate-controller-schematic.pdf` | the circuit |
| `9-firmware/` | the Nano's program (`make nano` or `pio run -e nano`) |

## 2. The board

1. **Check the shunt R28 before fitting it:** 10 mΩ. Its part code names its value (for example
   R010 for 10 mΩ); a 1 mΩ part would set the cut-off at about 70 A, which is no protection.
2. **Fit the parts in order of height:** resistors and diodes, the TVS diodes, ICs, capacitors,
   transistors and the MOSFET Q9, the shunt R28, the regulator U1, the fuse holder with F1
   (10 A), the relays K1 and K2 (Song Chuan 832A-1C 24 V: check which fixed contact is NC on the
   first one by continuity), the IR receiver U5 (its lens towards the enclosure's window), the
   LEARN button SW1, the red CUT-OFF LED D15, the terminal blocks, the two 15-pin sockets for the
   Nano U2.
3. **Check:** no solder bridges; the resistance between +24 V and 0 V above 1 kΩ, between 5 V and
   0 V above 1 kΩ.
4. **Program the Nano** before plugging it in. It must have the new bootloader (Optiboot; sold as
   "new bootloader", flashed at 115200 Bd): with the old one a watchdog reset never ends (the
   firmware's README). `pio run -e nano -t upload` (or `make nano`, then avrdude as the firmware's
   README shows). Then plug it into its sockets the right way round (its USB connector towards the
   board's edge, as the assembly drawing shows).

## 3. Mounting

- The board on stand-offs in an outdoor-rated enclosure (IP54 or better) with a clear window for
  the IR receiver; glands for the cables.
- The 24 V supply (at least 10 A) in the same enclosure (on a DIN rail) or its own.

## 4. Next step

Install (INSTALLATION.md) and commission (COMMISSIONING.md).
