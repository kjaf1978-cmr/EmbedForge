# Schematic editor

Draw a circuit, check it and simulate it. Parts come from the generic symbol library; every part
has a simulation model.

## Placing parts

- Pick a part in the **library** on the left, or press **A** and type to search (for example
  "led", "2n3904", "lm358"). Press **Enter** to take the first match.
- Click on the sheet to place it. Before clicking, **R** rotates and **X** mirrors it. Hold
  **Shift** to place several copies.
- **P** adds a power rail (+5V, +3V3, +12V, -12V…), **G** a ground. All rails with the same
  name are connected, and so are all grounds.

## Wiring

- Press **W**, or click on a pin end (the small circle of an unconnected pin), then click the
  points of the wire. Wires are drawn horizontally first; **/** switches to vertical first.
- A wire ends when you click on a pin, another wire or a label. **Esc**, a double click or a
  right click also ends it.
- A dot marks a junction. Wires that only cross are **not** connected.
- **L** adds a net label: wires with the same label name are connected without a wire between
  them. Name a net after a rail (for example +5V) to make it that rail.

## Editing

| Key | Action |
|---|---|
| Esc | back to Select, clear the selection |
| Click, Shift+click, drag on empty space | select, add to selection, select an area |
| Drag | move; attached wires follow |
| Arrow keys (Shift: ×5) | move the selection by one grid step |
| R, X | rotate, mirror |
| Del | delete |
| Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D | copy, cut, paste, duplicate |
| Ctrl+Z, Ctrl+Y | undo, redo |
| Wheel; right or middle drag; Home | zoom; pan; zoom to fit |
| Tab | select the next part (keyboard use) |
| Enter | edit the value of the selected part |

Values take engineering notation: 330, 1k, 4k7, 2.2M, 100n, 4u7, 10m. "M" is mega and "m" is
milli; "meg" also means mega.

**Annotate** renumbers the references (R1, R2…) from top to bottom and left to right.

## Checks

The electrical rule check runs on every change (the **Checks** tab, and red or yellow marks
on the sheet): unconnected pins, wires that end nowhere, nets without a DC path to ground,
short-circuited or parallel voltage sources, duplicate references, and inductive loads switched
without a flyback diode.

Parts of the generic library are marked **not a standard part**: they are not catalogue parts
yet. The parts catalogue arrives in Increment 6.

## Files

**Save** (Ctrl+S) keeps the project as a folder with its own version history: every save is a
Git commit. The netlist (`netlist.json`) holds the parts and their connections; the drawing
(`geometry.json`) holds only positions. **Export** writes SVG, PNG, a SPICE netlist (.cir) for
ngspice or LTspice, or the waveforms as CSV, into the project's `exports` folder.
