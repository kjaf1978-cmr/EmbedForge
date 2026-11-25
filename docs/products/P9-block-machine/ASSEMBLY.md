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
   the regulator U1, the fuse holders F1 (T 8 A) and F2 (T 2 A), the green LED D3, the terminal
   blocks, the headers for the Mega U2.
2. **Check:** no solder bridges; every polarised part the right way round; the resistance between
   +24 V and 0 V above 1 kΩ, between 5 V and 0 V above 1 kΩ.
3. **Program the Mega** (`pio run -e mega -t upload`), then fit it to the board's headers.

## 3. The panel

1. The DIN-rail parts (`…-bom.csv`, the panel lines): the main breaker Q33 with its door-coupled
   handle, the motor breakers Q34 … Q37 with their auxiliary contacts, the contactors K5 … K8,
   the safety contactors K2, K3 with their auxiliary blocks, the safety relays K1, K4, the 24 V
   supply with its 2-pole breaker, the PE bar, the terminal blocks for the field.
2. The board on stand-offs on the mounting plate, away from the 400 V wiring (at least 50 mm, or
   a partition).
3. The wiring by `panel.csv`: 400 V in 2.5 mm² (the pump: 4 mm² from Q34 to K5 and to the
   motor), the 24 V coils and valves in 1 mm², the field in 0.5 mm²; PE green-yellow; the E-stop's
   and the guards' two channels in separate cores or cables.
4. The door: the main switch's handle, the READY / FAULT lamp, the operator's buttons where they
   are on the panel; the door's bonding strap.

## 4. Next step

Install (INSTALLATION.md) and commission (COMMISSIONING.md).
