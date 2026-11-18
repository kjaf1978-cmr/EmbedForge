# Gate controller (P9): assembly guide

The designators are those of the schematic, the board and the parts list.

## 1. What you need

| File | Use |
|---|---|
| `3-pcb/gate-controller/…-fabrication.zip` | order the board (Gerber, drill) |
| `…-bom.csv` | the parts list |
| `…-assembly.pdf` | where each part goes |
| `1-schematics/gate-controller-schematic.pdf` | the circuit |
| `firmware/gate-controller/` | the Nano's program (`make nano` or `pio run -e nano`) |

## 2. The board

1. **Fit the parts in order of height:** resistors and diodes, the TVS diodes, ICs, capacitors,
   transistors and the MOSFET Q7, the shunt R23, the regulator U1, the fuse holder with F1
   (10 A), the relays K1 and K2 (Song Chuan 832A-1C 24 V: check which fixed contact is NC on the
   first one by continuity), the IR receiver U4 (its lens towards the enclosure's window), the
   LEARN button SW2, the terminal blocks, the two 15-pin sockets for the Nano U2.
2. **Check:** no solder bridges; the resistance between +24 V and 0 V above 1 kΩ, between 5 V and
   0 V above 1 kΩ.
3. **Program the Nano** before plugging it in: `pio run -e nano -t upload` (or `make nano`, then
   avrdude as the firmware's README shows). Then plug it into its sockets the right way round (its
   USB connector towards the board's edge, as the assembly drawing shows).

## 3. Mounting

- The board on stand-offs in an outdoor-rated enclosure (IP54 or better) with a clear window for
  the IR receiver; glands for the cables.
- The 24 V supply in the same enclosure (on a DIN rail) or its own.

## 4. Next step

Install (INSTALLATION.md) and commission (COMMISSIONING.md).
