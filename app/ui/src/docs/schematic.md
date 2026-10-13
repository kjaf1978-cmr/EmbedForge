# Schematic editor

Draw a circuit, check it and simulate it. Parts come from the generic symbol library; every part
has a simulation model.

## Placing parts

- Pick a part in the **library** on the left, or press **A** and type to search (for example
  "led", "2n3904", "lm358"). Press **Enter** to take the first match.
- Click on the sheet to place it. Before clicking, **R** (or **Ctrl+R**) rotates and **X**
  mirrors it. Hold **Shift** to place several copies.
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

## When a wire collides

A wire may touch things other than the two points you clicked: it may pass through a pin or a
wire end, or run along an existing wire. NETApps does not connect these silently. It marks
the places in red and asks what to do:

- **Connect them.** The wire is drawn as you aimed it, and joins whatever it touches. The
  dialog warns when this would short a part.
- **Route around.** The wire takes a detour that touches nothing, shown dashed while you point
  at the button. NETApps tries the other elbow first, then detours of up to four grid steps.
- **Cancel this segment.** Nothing is drawn; you go on wiring from the last point.

Moving, rotating, pasting or placing a part asks the same question when a pin would land in the
middle of a wire or on another part's pin, or when a part would end up shorted. Ending a wire on
a pin, or placing a part with its pin on a free wire end, is a normal connection and does not
ask.

Tick **Do the same from now on** to stop the questions. **Settings → Schematic editor** sets the
default: ask, route wires around automatically, or always connect.

## Window layout

As in LTspice, the schematic and the waveforms can be tiled one above the other or side by
side. The **Layout** menu, the buttons on the results pane and these keys work anywhere in the
view:

| Key | Layout |
|---|---|
| Ctrl+Alt+↓ | results below the schematic (tile horizontally) |
| Ctrl+Alt+→ | results beside the schematic (tile vertically) |
| Ctrl+Alt+S | maximise the schematic, or restore |
| Ctrl+Alt+W | maximise the results, or restore |
| Ctrl+Alt+L | show or hide the part library |
| Ctrl+Alt+P | show or hide the properties and simulation panel |

Drag the bar between the schematic and the results to share the space, or focus it and use the
arrow keys; a double click or Home resets it. Placed beside the schematic, the results pane
stays open while you draw. The layout is kept for the next session; **Reset the layout** goes
back to the default.

## Editing

| Key | Action |
|---|---|
| Esc | back to Select, clear the selection |
| Click, Shift+click, drag on empty space | select, add to selection, select an area |
| Drag | move; attached wires follow |
| Arrow keys (Shift: ×5) | move the selection by one grid step |
| R or Ctrl+R; Shift+R or Ctrl+Shift+R | rotate clockwise; counter-clockwise |
| X, Y | mirror left–right; flip top–bottom |
| Del | delete |
| Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D | copy, cut, paste, duplicate |
| Ctrl+Z, Ctrl+Y | undo, redo |
| Wheel, Ctrl+wheel; + and − | zoom at the pointer |
| Shift+wheel, sideways wheel; right or middle drag; H (pan tool) | pan |
| Z (zoom area tool), then drag a box | zoom to the box |
| Home; Shift+Home; 1 | zoom to fit; zoom to the selection; zoom 100 % |
| Tab | select the next part (keyboard use) |
| Enter | edit the value of the selected part |

The **view toolbar** in the lower right corner of the sheet has the same tools for the mouse:
pan, zoom in, zoom out, zoom to fit, and rotate the selection either way. Press **Esc** to
leave the pan or zoom-area tool.

A reference (R1, C2…) that another part already uses is refused, and the field says so.

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
