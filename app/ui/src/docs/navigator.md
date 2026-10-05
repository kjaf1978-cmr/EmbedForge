# Project navigator and cross-highlighting

The navigator (left pane, **Ctrl+1**) lists every artefact of the project: requirements,
clarifications, blocks, interfaces, parameters, code, pin map, schematic, breadboard, layout,
BOM, emulation scenarios, tests, documentation and history.

## Keyboard

- **Up / Down**: move between items.
- **Right / Left**: expand or collapse a group.
- **Enter**: select the item and open its details.
- **Home / End**: jump to the first or last item.

## Cross-highlighting

Selecting an artefact highlights every directly related artefact in every open view. For
example, a requirement highlights its block, the block's code file and its test.

- Turn on **transitive** highlighting in Settings to follow links further, for example
  requirement → block → code.
- The status bar shows how long the last highlight took to reach every view. The target is
  200 ms on a laptop and 500 ms on a Raspberry Pi 5.

Connections between parts always come from the netlist. Views store only the geometry they
draw.
