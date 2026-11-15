# Mains / back-up change-over (P3): assembly guide

For the single-phase (`changeover-1p`) and three-phase (`changeover-3p`) units. The unit has two
parts:

- **The control board:** sense, logic, control supply, indicators. It carries no load current.
- **The panel:** DIN rail with the breakers, the contactors and the terminal blocks, wired with
  the load current.

Read USER_MANUAL.md first (safety).

## 1. What you need

| File | Use |
|---|---|
| `3-pcb/changeover-1p/changeover-1p-fabrication.zip` (3P: `changeover-3p/…`) | order the bare board: upload as it is (Gerber, drill; 2 layers, 2 oz copper, 1.6 mm FR-4, HASL, green solder mask) |
| `…-bom.csv` | the board's parts (`on this board: yes`) and the panel's parts (`no`), with manufacturer part numbers and suppliers |
| `…-assembly.pdf` | where each part goes, with its reference and value |
| `panel.csv` | every panel wire: net, the terminals it joins, the board connector, the wire to use |
| `1-schematics/…-schematic.pdf` | the circuit, for checking and fault finding |

Tools:

- temperature-controlled soldering iron
- multimeter
- crimping tool for ferrules (0.75 … 6 mm²)
- insulated screwdrivers
- torque screwdriver for the breakers' and contactors' terminals

## 2. The control board

1. **Inspect the bare board:** outline, no shorts between the mains connector's pins (multimeter).
2. **Fit the parts in order of height:**
   - resistors and small diodes (1N4148, 1N4007, BZX55C12);
   - IC sockets or ICs (LM339, TL431);
   - film capacitors;
   - bridges (DB107);
   - LEDs at the height the front window needs;
   - electrolytic capacitors (watch the polarity: the + mark on the drawing);
   - MOSFETs IRLZ44N;
   - LM317HV with its heatsink;
   - the trimmers (5 kΩ, 25 turns; RV3 in 1P, RV7 … RV9 in 3P+N): leave them as they are, they are set at commissioning;
   - fuse holders with 200 mA time-lag (T) 5 × 20 mm fuses;
   - the transformers;
   - the varistors RV (TMOV14RP300E);
   - the board connectors J_MAINS and J_PANEL.

   Each part's place and orientation is in `…-assembly.pdf`; pin 1 / the cathode / + are marked
   on the silkscreen.
3. **Check the varistors' fit before soldering:** the footprint (TMOV_14) is drawn larger than
   the part. Check the actual TMOV14RP300E against its drawing; the 7.5 mm pitch is fixed.
4. **Clean off the flux,** then let the board dry.
5. **Check before power:**
   - no solder bridges;
   - every polarised part the right way round;
   - resistance between the +24 V rail (C3 +) and ground above 1 kΩ.
6. **Apply conformal coating** to the whole board except the connectors, fuse holders and LEDs
   (an acrylic coating, IPC-CC-830). Let it cure.

## 3. The panel

1. **Mount on the DIN rail, left to right:**
   - the terminal blocks of the inputs: L/N mains, L/N back-up, PE (3P+N: L1 L2 L3 N);
   - breaker Q1 (mains), breaker Q2 (back-up);
   - next to each breaker, the fuse holders of the board feeds: 10 A gG 10 × 38 cartridges (1P:
     one per source; 3P+N: three per source). Their references (F…) are in `panel.csv` and
     the parts list (`gG 10 A, 10×38, DIN-rail holder`);
   - contactor K1 (mains) with its auxiliary block LADN01, contactor K2 (back-up) with its
     LADN01, side by side with the maker's mechanical interlock between them. For Schneider
     TeSys D the interlock is the LAD9V2 kit; confirm with Schneider that it fits the 4-pole
     LC1DT32 frame, or use their factory reversing pair for 4-pole contactors;
   - the terminal blocks of the load: L, N, PE (3P+N: L1 L2 L3 N, PE).

   PE blocks are green-yellow and clip onto the rail (they earth it).
2. **Wire exactly as `panel.csv` lists:**
   - Power circuits: 6 mm² H07V-K with ferrules (32 A, IEC 60364-5-52 method B2 at 30 °C;
     derate in a hot enclosure). This includes the load side.
   - The board's mains feeds: 1.5 mm² from the output of each 10 A board-feed fuse. N is taken
     behind the breaker, unfused, as the breaker switches it.
   - The coils and interlock: 0.75 mm² H05V-K.
   - PE: 6 mm² green-yellow between the PE blocks, 1.5 mm² green-yellow to the board connector
     (J_PANEL takes at most 2.5 mm²).

   Tighten every screw terminal to the torque printed on the part, and mark it.
3. **Check the interlock wiring.** It is the safety function:
   - K1's coil (A1) is fed through K2's NC auxiliary contact.
   - K2's coil (A1) is fed through K1's NC auxiliary contact.

   The schematic and `panel.csv` call this contact 21–22 (the symbol's numbering). On the LADN01
   block, use its NC contact, marked x1–x2 on the block (the first digit gives its position). It
   must be a mirror contact (IEC 60947-4-1 Annex F); TeSys D auxiliary blocks are, but confirm
   this in Schneider's data for the block you buy.

   With the board disconnected, measure that K1 A1 has continuity to the +24 V wire only while K2
   is released, and the same for K2.
4. **Connect the board:** J_MAINS (mains feeds to the board) and J_PANEL (24 V, coils, interlock).
5. **Mount the board** in the enclosure on standoffs, with its LEDs behind the front window. The
   enclosure is IP54 with a vent membrane and insect mesh. The cable glands are sized for the
   cables, and the openings are sealed.

## 4. Labels

On the enclosure:

- "Two sources: isolate both Q1 and Q2 before opening"
- the rated data (230 V or 400/230 V, 32 A)
- the indicator meanings (USER_MANUAL.md, section 2)

Next to the terminal blocks: the tightening torque.

## 5. Next step

Commissioning (COMMISSIONING.md) before the unit carries a load.
