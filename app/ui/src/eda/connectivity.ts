// Connectivity of a schematic (INV-08): wires, pins and labels that touch are one net. A pin,
// label or wire end lying anywhere on a wire connects to it (a T-junction gets a dot); two wires
// that only cross do not connect. Labels and power symbols with the same name are one net.

import { symbolOf, type Pt } from './symbols';
import { key, netLabels, onSegment, pinPositions, samePt, type Sheet } from './schematic';

export interface Net {
  name: string;
  /** "REF.PIN" of every part pin on the net (power symbols excluded). */
  pins: string[];
  /** Power or ground symbols on the net. */
  power: string[];
  labels: string[];
  /** Wire ids on the net. */
  wires: string[];
  /** Named by a label or a power symbol (otherwise named after its first pin). */
  named: boolean;
}

export interface Connectivity {
  nets: Net[];
  /** "REF.PIN" → net name; unconnected pins are absent. */
  pinNet: Map<string, string>;
  wireNet: Map<string, string>;
  /** Junction dots. */
  junctions: Pt[];
  /** Name conflicts: two different labels on one net. */
  conflicts: { net: string; names: string[] }[];
}

class UF {
  p = new Map<string, string>();
  find(a: string): string {
    let r = a;
    while (this.p.has(r) && this.p.get(r) !== r) r = this.p.get(r)!;
    let c = a;
    while (this.p.has(c) && this.p.get(c) !== r) { const n = this.p.get(c)!; this.p.set(c, r); c = n; }
    if (!this.p.has(r)) this.p.set(r, r);
    return r;
  }
  union(a: string, b: string) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
}

export const GND_NET = 'GND';

export function connectivity(sheet: Sheet): Connectivity {
  const uf = new UF();
  // connection points: pins, labels, power symbols (their single pin), wire ends
  interface Pnt { at: Pt; node: string }
  const points: Pnt[] = [];
  const pinNode = new Map<string, string>();
  const powerName = new Map<string, string>(); // node → net name from power symbol
  for (const p of sheet.parts) {
    const s = symbolOf(p.sym);
    for (const pp of pinPositions(p)) {
      const node = `pin:${p.id}:${pp.pin}`;
      points.push({ at: pp.at, node });
      if (s.power) powerName.set(node, (p.props[s.value.key] || s.value.default).trim() || s.value.default);
      else pinNode.set(`${p.ref}.${pp.pin}`, node);
    }
  }
  const labelName = new Map<string, string>();
  for (const l of netLabels(sheet)) {
    const node = `lbl:${l.id}`;
    points.push({ at: { x: l.x, y: l.y }, node });
    labelName.set(node, l.name.trim());
  }
  for (const w of sheet.wires) {
    points.push({ at: w.a, node: `w:${w.id}` }, { at: w.b, node: `w:${w.id}` });
    uf.find(`w:${w.id}`);
  }
  // points at the same place are connected
  const byKey = new Map<string, string>();
  for (const pt of points) {
    const k = key(pt.at);
    const o = byKey.get(k);
    if (o) uf.union(o, pt.node); else { byKey.set(k, pt.node); uf.find(pt.node); }
  }
  // points on a wire (also in its middle) connect to it
  const junctionKeys = new Set<string>();
  for (const w of sheet.wires) {
    for (const pt of points) {
      if (pt.node === `w:${w.id}`) continue;
      if (onSegment(pt.at, w.a, w.b)) {
        uf.union(pt.node, `w:${w.id}`);
        if (!samePt(pt.at, w.a) && !samePt(pt.at, w.b)) junctionKeys.add(key(pt.at));
      }
    }
  }
  // same names join (labels and power symbols are global on a single sheet)
  const nameRoot = new Map<string, string>();
  for (const [node, name] of [...powerName, ...labelName]) {
    const o = nameRoot.get(name);
    if (o) uf.union(o, node); else nameRoot.set(name, node);
  }
  // degree ≥ 3 at a point → junction
  const degree = new Map<string, number>();
  for (const pt of points) degree.set(key(pt.at), (degree.get(key(pt.at)) ?? 0) + 1);
  for (const [k, d] of degree) if (d >= 3) junctionKeys.add(k);

  // groups
  const groups = new Map<string, { pins: string[]; power: string[]; labels: string[]; wires: string[] }>();
  const g = (node: string) => {
    const r = uf.find(node);
    let x = groups.get(r);
    if (!x) { x = { pins: [], power: [], labels: [], wires: [] }; groups.set(r, x); }
    return x;
  };
  for (const [ref, node] of pinNode) g(node).pins.push(ref);
  for (const [node, name] of powerName) g(node).power.push(name);
  for (const [node, name] of labelName) g(node).labels.push(name);
  for (const w of sheet.wires) g(`w:${w.id}`).wires.push(w.id);

  const nets: Net[] = [];
  const conflicts: { net: string; names: string[] }[] = [];
  const used = new Set<string>();
  for (const x of groups.values()) {
    x.pins.sort(pinOrder);
    const names = [...new Set([...x.power, ...x.labels])].sort((a, b) => (a === GND_NET ? -1 : b === GND_NET ? 1 : a.localeCompare(b)));
    let name: string;
    let named = true;
    if (names.length) {
      name = names[0];
      if (names.length > 1) conflicts.push({ net: name, names });
    } else if (x.pins.length) { name = `N(${x.pins[0]})`; named = false; }
    else continue; // a wire to nothing: no net
    while (used.has(name)) name = `${name}_`;
    used.add(name);
    nets.push({ name, pins: x.pins, power: x.power, labels: x.labels, wires: x.wires, named });
  }
  nets.sort((a, b) => Number(b.named) - Number(a.named) || a.name.localeCompare(b.name));
  const pinNet = new Map<string, string>();
  const wireNet = new Map<string, string>();
  for (const n of nets) {
    // a pin alone with nothing attached is not on a net
    if (n.pins.length + n.power.length + n.labels.length + n.wires.length < 2) continue;
    for (const p of n.pins) pinNet.set(p, n.name);
    for (const w of n.wires) wireNet.set(w, n.name);
  }
  const junctions = [...junctionKeys].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; });
  return { nets: nets.filter((n) => n.pins.length + n.power.length + n.labels.length + n.wires.length >= 2), pinNet, wireNet, junctions, conflicts };
}

/** R2.1 before R10.1; pins numerically. */
export function pinOrder(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/** Net name at a sheet point (a wire, pin or label there), for probes. */
export function netAt(sheet: Sheet, conn: Connectivity, at: Pt): string | null {
  for (const w of sheet.wires) if (onSegment(at, w.a, w.b)) return conn.wireNet.get(w.id) ?? null;
  for (const p of sheet.parts) {
    const s = symbolOf(p.sym);
    for (const pp of pinPositions(p)) if (samePt(pp.at, at)) {
      if (s.power) return conn.nets.find((n) => n.power.includes(p.props[s.value.key]))?.name ?? null;
      return conn.pinNet.get(`${p.ref}.${pp.pin}`) ?? null;
    }
  }
  for (const l of sheet.labels) if (samePt({ x: l.x, y: l.y }, at)) return conn.nets.find((n) => n.labels.includes(l.name))?.name ?? null;
  return null;
}
