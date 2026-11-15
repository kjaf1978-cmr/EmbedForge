# Mains voltage stabiliser 1 kVA (P4): assembly guide

The unit is made of:

- **The control board** (230 × 212 mm, 2 oz): sense, logic, the seven 30 A relays, the
  contact snubbers and the 12 V supply.
- **The autotransformer T2,** with its built-in thermal cut-out.
- **The breaker Q1** on a short DIN rail.
- **The enclosure.**

Read USER_MANUAL.md first (safety).

## 1. What you need

| File | Use |
|---|---|
| `3-pcb/stabiliser/stabiliser-fabrication.zip` | order the bare board (Gerber, drill; 2 layers, 2 oz, 1.6 mm FR-4) |
| `stabiliser-bom.csv` | the parts on the board (`yes`), the terminal blocks where the breaker and the transformer land (`… (landing)`), and the parts off the board (`no`) |
| `stabiliser-assembly.pdf` | where each part goes |
| `1-schematics/stabiliser-1kva-schematic.pdf` | the circuit |

The autotransformer is made to specification. The parts list gives it: 1 kVA, output tap 230 V,
taps 150/170/190/210/230/250/280 V, class F, thermal cut-out 115 °C NC in the winding with its
two leads brought out. Ask the winder for a routine test certificate (insulation 2.5 kV, ratio
of each tap).

## 2. The board

1. **Fit the parts in order of height:**
   - resistors and small diodes;
   - the comparators (LM339 ×2, LM393) and TL431s;
   - film and ceramic capacitors (the 100 nF X2 630 V snubber capacitors beside each relay);
   - the trimmers RV2 and RV3 (5 kΩ, 25 turns): do not turn them, they are set at
     commissioning;
   - LEDs at the height the front window needs;
   - transistors BD139;
   - the LM317HV (U3) on its 8 K/W heatsink;
   - the bridge rectifiers;
   - the electrolytic capacitors (polarity);
   - the fuse holder with a T 0.2 A 5 × 20 fuse (F1);
   - the transformers T1 (control supply), T3 and T4 (sense);
   - the varistor RV1 (TMOV14RP300E);
   - the relays K1 … K7;
   - the 7.62 mm terminal blocks.

   Each part's place and orientation is in `stabiliser-assembly.pdf`.
2. **Check the varistor.** Its board outline is drawn larger than the part; check the actual
   TMOV14RP300E against its drawing before soldering (the 7.62 mm terminal pitch is fixed).
3. **Clean and check:**
   - Clean off the flux.
   - Check that there are no solder bridges, above all around the relays and the tap terminals.
   - Check that the resistance between +12 V (C5 +) and ground is above 1 kΩ.
4. **Conformal coating:** the whole board except the terminal blocks, fuse holder, relays (their
   vents), trimmers and LEDs.

## 3. Wiring in the enclosure

Wire it as the schematic shows. The board's terminal blocks are named in the schematic and on
the silkscreen.

| From | To | Wire |
|---|---|---|
| Input terminal L (from the cable) | Q1 in | 1.5 mm² |
| Q1 out | the board's landing block for Q1 | 1.5 mm² |
| Board N in, PE | the input cable's N and PE | 1.5 mm² (PE green-yellow) |
| Board tap block (N, T1 … T7) | autotransformer T2: N and the seven taps, in order | 1.5 mm² H07V-K, ferrules; mark each tap |
| Board X1, X3 | T2's thermal cut-out leads | 0.75 mm² |
| Board L out, N out, PE | the output socket or terminal | 1.5 mm² (PE green-yellow) |
| PE | the enclosure, door and transformer core | green-yellow, 1.5 mm² or more |

**Check the tap wiring.** With nothing connected to the mains, measure the resistance from N to
each tap: it must rise from T1 (150 V) to T7 (280 V). A swapped tap gives a wrong output
voltage at that step.

## 4. Labels

On the enclosure:

- the rated data (230 V, 1 kVA, input 140 … 300 V);
- the indicator meanings (USER_MANUAL.md, section 2);
- "Not isolated from the mains".

## 5. Next step

Commissioning (COMMISSIONING.md).
