// Readable drawings (D28, and the owner's note of 16 October on the printed schematics): no text
// of a part (reference, value) or net label lies on another part, on other text or on a wire.
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/eda/examples';
import { labelPos } from '../src/eda/editor';
import { connectivity } from '../src/eda/connectivity';
import { partBounds, pinPositions, valueText, type Sheet } from '../src/eda/schematic';
import { symbolOf } from '../src/eda/symbols';

type Box = { x0: number; y0: number; x1: number; y1: number; who: string; own: string; net?: string; at?: { x: number; y: number } };

/** The text as the renderers draw it: 9-unit references, 8-unit values and net labels. */
function textBoxes(s: Sheet): Box[] {
  const out: Box[] = [];
  for (const p of s.parts) {
    const add = (t: string, which: 'ref' | 'val', size: number) => {
      const l = labelPos(p, which), w = t.length * size * 0.6;
      const x0 = l.anchor === 'start' ? l.at.x : l.anchor === 'end' ? l.at.x - w : l.at.x - w / 2;
      out.push({ x0, x1: x0 + w, y0: l.at.y - size * 0.75, y1: l.at.y + size * 0.15, who: `${p.ref}.${which}`, own: p.id });
    };
    if (!symbolOf(p.sym).power) add(p.ref, 'ref', 9);
    const v = valueText(p);
    if (v) add(v, 'val', 8);
  }
  // a net label's letters: cap height about 0.73 of the 8-unit size above the baseline at y − 4
  for (const l of s.labels) if (!l.note) out.push({ x0: l.x + 3, x1: l.x + 3 + l.name.length * 4.8, y0: l.y - 9.8, y1: l.y - 2.8, who: `label ${l.name}`, own: l.id, net: l.name, at: { x: l.x, y: l.y } });
  return out;
}
const hit = (a: Omit<Box, 'who' | 'own'>, b: Omit<Box, 'who' | 'own'>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function textCollisions(s: Sheet): string[] {
  const T = textBoxes(s), bad: string[] = [];
  // a part's body without its pin leads
  const bodies = s.parts.filter((p) => !symbolOf(p.sym).power).map((p) => { const b = partBounds(p); return { x0: b.x0 + 8, y0: b.y0 + 8, x1: b.x1 - 8, y1: b.y1 - 8, ref: p.ref, id: p.id }; });
  // a label on a part's own pin names that connection: not a collision with that part
  const atPin = (t: Box, id: string) => !!t.at && pinPositions(s.parts.find((p) => p.id === id)!).some((q) => q.at.x === t.at!.x && q.at.y === t.at!.y);
  for (const t of T) for (const b of bodies) if (b.id !== t.own && !atPin(t, b.id) && hit(t, b)) bad.push(`${t.who} on ${b.ref} @${Math.round(t.x0)},${Math.round(t.y0)}`);
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) if (T[i].own !== T[j].own && hit(T[i], T[j])) bad.push(`${T[i].who} on ${T[j].who} @${Math.round(T[i].x0)},${Math.round(T[i].y0)}`);
  // a net label crossed by a wire of its own net still reads unambiguously
  const wireNet = connectivity(s).wireNet;
  for (const t of T) if (s.wires.some((w) => (!t.net || wireNet.get(w.id) !== t.net) && hit(t, { x0: Math.min(w.a.x, w.b.x) - 0.5, x1: Math.max(w.a.x, w.b.x) + 0.5, y0: Math.min(w.a.y, w.b.y) - 0.5, y1: Math.max(w.a.y, w.b.y) + 0.5 }))) bad.push(`${t.who} on a wire @${Math.round(t.x0)},${Math.round(t.y0)}`);
  return bad;
}

describe('readable drawings', () => {
  for (const ex of EXAMPLES) it(`${ex.id}: no text on a part, on other text or on a wire`, () => expect(textCollisions(ex.build())).toEqual([]));
});
