// Fault injection for the DFMEA tests: a part shorted or a net tied, added to a finished sheet.
import { addLabel, placePart } from '../src/eda/editor';
import { pinPositions, type Sheet } from '../src/eda/schematic';

/** A resistor `r` between nets a and b ("GND" for ground), placed away from the drawing. */
export function tieNets(sheet: Sheet, a: string, b: string, r = '10m'): Sheet {
  const x = Math.max(...sheet.parts.map((p) => p.x)) + 400, y = Math.max(...sheet.parts.map((p) => p.y)) + 400 + sheet.parts.length;
  let s = placePart(sheet, 'resistor', { x, y }, 0, false, { value: r }).sheet;
  const part = s.parts[s.parts.length - 1];
  const [p1, p2] = pinPositions(part);
  for (const [pin, net] of [[p1, a], [p2, b]] as const) s = net === 'GND' ? placePart(s, 'gnd', pin.at).sheet : addLabel(s, net, pin.at).sheet;
  return s;
}
