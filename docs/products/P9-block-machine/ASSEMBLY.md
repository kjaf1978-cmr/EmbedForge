# Block moulding machine (P9): assembly guide

The designators are those of the schematic, the board, the parts list and the wiring list.

## 1. What you need

| File | Use |
|---|---|
| `3-pcb/block-machine/…-fabrication.zip` | order the control board (Gerber, drill) |
| `3-pcb/block-machine/…-bom.csv` | the board's and the panel's parts |
| `3-pcb/block-machine/…-assembly.pdf` | where each part goes |
| `3-pcb/block-machine/panel.csv` | the panel's wiring list |
| `1-schematics/block-machine-schematic.pdf` | the circuit |
| `9-firmware/` | the Mega's program (`make mega` or `pio run -e mega`) |

## 2. The control board

1. **Fit the parts in order of height:** resistors and diodes, the TVS diodes, the PC817s,
   capacitors, transistors, the high-side MOSFETs (IRF9540N) and the enable MOSFET Q7 (IRF4905),
   the regulator U1, the fuse holder F1 (5 × 20, T 8 A), the TR5 fuses F2 (T 2 A) and F3 (T 1 A), soldered or in TR5 sockets, the green LED D3, the terminal
   blocks. Last, the **male headers for the Mega U2 on the board's underside** (pins pointing down,
   soldered from the top): one 10-pin, four 8-pin and one 2 × 18 header at the positions on the
   assembly drawing, long-tail headers (at least 6 mm of pin below the plastic).
2. **Check:** no solder bridges; every polarised part the right way round; the resistance between
   +24 V and 0 V above 1 kΩ, between 5 V and 0 V above 1 kΩ.
3. **Program the Mega** (`pio run -e mega -t upload`), then plug it onto the board's headers from
   below, turned so that its USB and power jacks are at the board's right edge, and fix it with
   six M3 stand-offs of 11 mm (the Mega's jacks stand about 11 mm high: a strip of insulating tape
   on the USB jack's top keeps it off the board's copper). At the hole next to the SCL / SDA
   header use a round nylon spacer of at most 5 mm diameter (a hex stand-off touches the header).
   Its USB and power jacks stand 2.3 mm past the board's right edge, reachable for a later update;
   **for an update, unplug the board's 24 V first** (or use a USB cable without its 5 V wire):
   with both, the board's 5 V would feed the computer's USB port. The Mega's footprint is drawn from the dimensioned drawing of the
   Mega 2560 R3 by Matthew Beckler (Wayne and Layne) and agrees with KiCad's Arduino Uno R3
   footprint for the headers both share; **check one real Mega against the board before the first
   order** (the six holes and the 2 × 18 header), TYPE_TESTS TT-4.

## 3. The panel

1. The DIN-rail parts (`…-bom.csv`, the panel lines): the main breaker Q33 with its door-coupled
   handle, the motor breakers Q34 … Q37 with their auxiliary contacts, the contactors K5 … K9,
   the safety contactors K2, K3 with their auxiliary blocks, the safety relays K1, K4, the 24 V
   supply with its 2-pole breaker, the PE bar, the terminal blocks for the field.
2. The board on stand-offs on the mounting plate, away from the 400 V wiring (at least 50 mm, or
   a partition).
3. The wiring by `panel.csv`: 400 V in 2.5 mm² (the pump: 4 mm² from Q34 to K6 and to the
   motor), the 24 V coils and valves in 1 mm², the field in 0.5 mm²; PE green-yellow; the E-stop's
   and the guards' two channels in separate cores or cables.
4. The door: the main switch's handle, the READY / FAULT lamp, the operator's buttons where they
   are on the panel; the door's bonding strap.

## 4. Next step

Install (INSTALLATION.md) and commission (COMMISSIONING.md).
