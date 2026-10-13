// Netlist (INV-08, ef.netlist@1.0 in netlist.json): parts by reference and nets as lists of
// "REF.PIN". The schematic stores geometry; every edit is recorded with the netlist change it
// makes (diffNetlist), and project files keep both, checked against each other on open.

import { symbolOf } from './symbols';
import { connectivity, type Connectivity } from './connectivity';
import type { Sheet } from './schematic';

export interface NetlistPart {
  ref: string;
  symbol: string;
  value: string;
  props: Record<string, string>;
  /** ED-08: generic library parts are not catalogue parts. */
  standard: false;
}
export interface NetlistNet { name: string; pins: string[] }
export interface Netlist { schema: 'ef.netlist@1.0'; parts: NetlistPart[]; nets: NetlistNet[] }

export function buildNetlist(sheet: Sheet, conn: Connectivity = connectivity(sheet)): Netlist {
  const parts = sheet.parts
    .filter((p) => !symbolOf(p.sym).power)
    .map((p) => {
      const s = symbolOf(p.sym);
      return { ref: p.ref, symbol: p.sym, value: p.props[s.value.key] ?? '', props: { ...p.props }, standard: false as const };
    })
    .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
  const nets = conn.nets.filter((n) => n.pins.length > 0).map((n) => ({ name: n.name, pins: [...n.pins] }));
  return { schema: 'ef.netlist@1.0', parts, nets };
}

export interface NetlistDiff {
  addedParts: string[];
  removedParts: string[];
  changedParts: string[];
  /** Pins whose net changed: [pin, from, to] (null = not connected). */
  moved: [string, string | null, string | null][];
}

export function diffNetlist(a: Netlist, b: Netlist): NetlistDiff {
  const pa = new Map(a.parts.map((p) => [p.ref, p])), pb = new Map(b.parts.map((p) => [p.ref, p]));
  const addedParts = [...pb.keys()].filter((r) => !pa.has(r));
  const removedParts = [...pa.keys()].filter((r) => !pb.has(r));
  const changedParts = [...pb.keys()].filter((r) => pa.has(r) && JSON.stringify(pa.get(r)) !== JSON.stringify(pb.get(r)));
  const na = pinNets(a), nb = pinNets(b);
  // compare by connectivity, not by (possibly auto-generated) names: a pin moved when the
  // set of pins it shares a net with changed
  const peersA = peers(a), peersB = peers(b);
  const moved: [string, string | null, string | null][] = [];
  for (const pin of new Set([...na.keys(), ...nb.keys()])) {
    if (peersA.get(pin) !== peersB.get(pin)) moved.push([pin, na.get(pin) ?? null, nb.get(pin) ?? null]);
  }
  moved.sort((x, y) => x[0].localeCompare(y[0], undefined, { numeric: true }));
  return { addedParts, removedParts, changedParts, moved };
}

function pinNets(n: Netlist): Map<string, string> {
  const m = new Map<string, string>();
  for (const net of n.nets) for (const p of net.pins) m.set(p, net.name);
  return m;
}

function peers(n: Netlist): Map<string, string> {
  const m = new Map<string, string>();
  for (const net of n.nets) {
    const k = [...net.pins].sort().join(' ') + (net.name.startsWith('N(') ? '' : `@${net.name}`);
    for (const p of net.pins) m.set(p, k);
  }
  return m;
}

export function diffIsEmpty(d: NetlistDiff): boolean {
  return !d.addedParts.length && !d.removedParts.length && !d.changedParts.length && !d.moved.length;
}

/** One-line description of a netlist change, for the history and the screen reader. */
export function describeDiff(d: NetlistDiff): string {
  const out: string[] = [];
  if (d.addedParts.length) out.push(`added ${d.addedParts.join(', ')}`);
  if (d.removedParts.length) out.push(`removed ${d.removedParts.join(', ')}`);
  if (d.changedParts.length) out.push(`changed ${d.changedParts.join(', ')}`);
  const conn = d.moved.filter(([, , to]) => to).map(([p, , to]) => `${p}→${to}`);
  const disc = d.moved.filter(([, , to]) => !to).map(([p]) => p);
  if (conn.length) out.push(`connected ${conn.slice(0, 4).join(', ')}${conn.length > 4 ? ` and ${conn.length - 4} more` : ''}`);
  if (disc.length) out.push(`disconnected ${disc.slice(0, 4).join(', ')}${disc.length > 4 ? ` and ${disc.length - 4} more` : ''}`);
  return out.join('; ');
}
