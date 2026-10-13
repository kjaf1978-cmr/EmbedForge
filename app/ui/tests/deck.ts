// Test helper: a schematic written like a SPICE deck. Every pin gets a net label, or a ground
// symbol for "GND"; parts are spread on a grid so that nothing touches by accident.
import { addLabel, placePart } from '../src/eda/editor';
import { annotate, emptySheet, pinPositions, type SimSettings, type Sheet } from '../src/eda/schematic';

export type Spec = [sym: string, props: Record<string, string>, nets: Record<string, string>];

/** Symbols used by any deck (the parts test checks that every library symbol was used). */
export const tested = new Set<string>();

/** Builds a sheet from a part list; pin → net name, "GND" places a ground symbol on the pin. */
export function deck(parts: Spec[], sim: SimSettings = { type: 'op' }): { sheet: Sheet; refs: string[] } {
  let s = emptySheet();
  const ids: string[] = [];
  parts.forEach(([sym, props, nets], k) => {
    tested.add(sym);
    const r = placePart(s, sym, { x: (k % 6) * 200, y: Math.floor(k / 6) * 200 }, 0, false, props);
    s = r.sheet; ids.push(r.id);
    const part = s.parts.find((p) => p.id === r.id)!;
    for (const pin of pinPositions(part)) {
      const net = nets[pin.pin];
      if (!net) continue;
      if (net === 'GND') { s = placePart(s, 'gnd', pin.at).sheet; tested.add('gnd'); }
      else s = addLabel(s, net, pin.at).sheet;
    }
  });
  s = annotate(s);
  s.sim = sim;
  return { sheet: s, refs: ids.map((id) => s.parts.find((p) => p.id === id)!.ref) };
}

