# PCB layout

The **PCB** view (next to Schematic in the main toolbar) turns the open schematic into a printed
circuit board. It works on the same project: what you change on the schematic appears on the
board, and Undo covers both.

## Starting a board

Choose an outline and press **Start the board**:

- **Custom size**: any width and height.
- **Arduino Uno shield** (68.58 × 53.34 mm) and **Arduino Mega shield** (101.6 × 53.34 mm), with
  the boards' mounting holes.
- **Raspberry Pi HAT+** (65 × 56.5 mm, four M2.5 holes 58 × 49 mm apart) and **Raspberry Pi Zero
  pHAT** (65 × 30 mm).

The headers that plug into the Arduino or the Raspberry Pi come with the board definitions in a
later version. Every part of the schematic gets its footprint (see below) and waits in a row
below the outline.

## Footprints

Each part has a footprint: its pads, holes and outline on the board. The default suits the
part's model, with the legs in the datasheet order: a 2N3904 is E-B-C, a BC547B C-B-E, a 2N7000
S-G-D, a 7805 IN-GND-OUT, an LM358 uses pins 1, 2, 3, 4 and 8. Where there is a choice (a ¼ W or
½ W resistor, a 0805 chip, a DIP or SOIC 555), pick it under **Footprint** in the part's
properties on the schematic; the properties also show which pin goes to which pad.

Parts that are not on the board, such as motors, transformers and the supply, get a screw
terminal or a pin header for their wires. Logic gates sit in a 74HC package; its supply pins
connect to the gate's supply rail and to ground.

Every footprint passes the shipped fabrication profile EF-PROTO-STD (drill sizes, copper rings,
clearances, silkscreen); a footprint from the KiCad library whose ring would be too thin is why
NETApps draws the TO-92 with its legs bent to 2.54 mm.

## Placing parts

- Drag a part with the mouse, or select it (click, or in the **Parts** list) and move it with
  the arrow keys (Shift: four grid steps). The grid is 0.635 mm (25 mil).
- **R** rotates by 90°, **F** puts the part on the other side of the board.
- The thin lines (the *ratsnest*) show the connections still to make, the shortest set that
  completes each net.

## Drawing tracks

Press **X** (or **Route**), click the pad where the track starts, click to make bends (tracks
run horizontally, vertically or at 45°), and click the pad where it ends. **V** while routing
places a via and continues on the other copper layer; **V** otherwise switches the active
layer. **Escape** cancels. Choose the track width in the toolbar. Select a track or via and
press **Delete** to remove it.

The status line counts the connections still to route and reports copper that joins two
different nets (a short), and parts not yet on the board.

## Keys

| Key | Action |
|---|---|
| S | Select and move |
| X | Route a track |
| V | Via while routing; otherwise switch layer |
| R | Rotate the selected part |
| F | Flip the selected part to the other side |
| Arrow keys | Move the selected part |
| Delete | Delete the selected track or via |
| Escape | Cancel the track, or clear the selection |
| Wheel | Zoom; right or middle drag pans |
