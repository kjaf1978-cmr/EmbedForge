# Mains voltage stabiliser 1 kVA (P4): assembly guide

The unit is made of:

- **The control board** (2 layers, 2 oz): sense, logic, the nine 30 A relays (six taps, input,
  delay and protection), the contact snubbers and the 12 V supply module.
- **The autotransformer T2,** with its built-in thermal cut-out.
- **The breaker Q1** (1P+N) and the PE terminals X5 and X8 on a short DIN rail.
- **The enclosure,** with its PE stud.

Read USER_MANUAL.md first (safety). The whole board is at mains potential.

## 1. What you need

| File | Use |
|---|---|
| `3-pcb/stabiliser/stabiliser-fabrication.zip` | order the bare board (Gerber, drill; 2 layers, 2 oz, 1.6 mm FR-4) |
| `3-pcb/stabiliser/stabiliser-bom.csv` | the parts on the board (`yes`), the terminal blocks where the breaker and the transformer land (`… (landing)`), and the parts off the board (`no`) |
| `3-pcb/stabiliser/stabiliser-assembly.pdf` | where each part goes |
| `1-schematics/stabiliser-1kva-schematic.pdf` | the circuit |

(The paths are those inside the product package, not in the repository.)

The autotransformer is made to specification. Order it with:

- 1 kVA, output tap 230 V, taps 150 / 170 / 190 / 210 / 230 / 250 / 280 V, 50 Hz, class F;
- every section rated for 7.2 A (the input current at 140 V);
- no saturation at 1.1 × rated volts per turn on any tap (the worst case in service is 107 %:
  160 V on the 150 V tap, 300 V on the 280 V tap);
- its switch-on inrush stated (it is switched on again at every tap change), and its no-load
  loss;
- a thermal cut-out in the winding: NC, opens at 115 °C ± 5 °C, resets itself, rated 250 V AC
  2 A, with double-insulated leads brought out;
- a routine test certificate: insulation 2.5 kV, the ratio of each tap.

## 2. The board

1. **Fit the parts in order of height:**
   - resistors and small diodes;
   - the comparators (LM339 ×3, LM393 ×2), the flip-flops (CD4013 ×3) and the TL431s;
   - film and ceramic capacitors (the 100 nF X2 snubber capacitors beside each relay);
   - the trimmers RV2 (5 kΩ) and RV3 (50 kΩ), 25 turns: do not turn them, they are set at
     commissioning;
   - LEDs at the height the front window needs;
   - transistors BD139;
   - the bridge rectifiers;
   - the electrolytic capacitors (polarity);
   - the fuse holder with a T 1 A 5 × 20 fuse (F1);
   - the sense transformers T1 and T3 (400 V / 24 V);
   - the AC-DC module PS1 (IRM-15-12);
   - the varistor RV1 (TMOV14RP300E);
   - the relays K1 … K9;
   - the 7.62 mm terminal blocks.

   Each part's place and orientation is in `stabiliser-assembly.pdf`.
2. **Check the varistor and the relays against their drawings.** The varistor's board outline is
   drawn larger than the part. The relay footprint is provisional until it has been checked
   against the Song Chuan 832A drawing. Check both before soldering.
3. **Clean and check:**
   - Clean off the flux.
   - Check that there are no solder bridges, above all around the relays and the tap terminals.
   - Check that the resistance between +12 V (C4 +) and ground is above 1 kΩ.
4. **Conformal coating:** the whole board except the terminal blocks, fuse holder, relays (their
   vents), trimmers, LEDs and the supply module.

## 3. Wiring in the enclosure

Wire it as the schematic shows. The board's terminal blocks are named in the schematic and on
the silkscreen.

| From | To | Wire |
|---|---|---|
| Input cable L, N | Q1 in (L, N) | 1.5 mm² |
| Q1 out (L, N) | the board's landing block for Q1 | 1.5 mm² |
| Input cable PE | X5 (DIN-rail PE terminal) | 4 mm² green-yellow |
| X5 and X8 | the PE stud | 4 mm² green-yellow |
| Board X9 (control ground) | the PE stud | 1.5 mm² green-yellow |
| Board tap block (N, T1 … T7) | autotransformer T2: N and the seven taps, in order | 1.5 mm² H07V-K, ferrules; mark each tap |
| Board X1, X3 | T2's thermal cut-out leads | 0.75 mm², double-insulated |
| Board L out, N out | the output terminal or socket | 1.5 mm² |
| Output PE | X8 | 4 mm² green-yellow |
| PE stud | the enclosure, door and transformer core | green-yellow, 4 mm² |

**Check the taps.** The tap resistances are milliohms, too small for a normal multimeter. Check
the ratio instead, with the transformer not yet connected to the board:

1. Feed 23.0 V AC (from a safety isolating transformer) between N and T5.
2. Measure each tap to N. Expected: T1 15.0 V, T2 17.0 V, T3 19.0 V, T4 21.0 V, T5 23.0 V,
   T6 25.0 V, T7 28.0 V (± 2 %).

A swapped tap shows here. With a 4-wire micro-ohmmeter you can also check that the resistance
from N rises from T1 to T7.

## 4. Next step

Fit the rating plate (INSTALLATION.md section 5), then commission (COMMISSIONING.md).
