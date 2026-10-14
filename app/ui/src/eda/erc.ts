// Electrical rule check for schematics (ED-09, and ED-03 (b), (f) where they apply without a
// target board). Every finding has a location for its marker in the schematic.

import { symbolOf, railVoltage, type Pt } from './symbols';
import { connectivity, GND_NET, type Connectivity } from './connectivity';
import { pinPositions, type Sheet } from './schematic';
import { unbuyable } from './standard';

export type Severity = 'error' | 'warning' | 'info';

export interface ErcIssue {
  id: string;
  severity: Severity;
  /** Requirement item the rule implements. */
  rule: 'ED-09.a' | 'ED-09.b' | 'ED-09.c' | 'ED-09.d' | 'ED-09.e' | 'ED-03.f' | 'ED-08' | 'SIM-05' | 'VER-13' | 'net-name' | 'stress';
  message: string;
  at: Pt | null;
  refs: string[];
}

/** Element kinds that conduct at DC (for the floating-net rule). */
export const DC_PATH: Record<string, string[][]> = {
  resistor: [['1', '2']], inductor: [['1', '2']], potentiometer: [['1', '2', '3']],
  transformer: [['1', '2'], ['3', '4']], relay: [['1', '2']],
  transformer3: [['1', '2', '3', '4'], ['5', '6', '7', '8']], vsin3: [['1', '2', '3', '4']],
  // the servo's PWM input (100 kΩ) and angle output (100 Ω) are referred to its − pin
  dcmotor: [['1', '2']], motor1: [['1', '2']], motor3: [['1', '2', '3', '4']], servo: [['1', '2', '3', '4']],
  ntc: [['1', '2']], fuse: [['1', '2']], tvs: [['1', '2']], bridge: [['1', '2', '3', '4']],
  // IGBT: collector–emitter (the gate is insulated); optocoupler: LED and transistor sides
  // separately; TL431: cathode–anode (REF is an input only)
  igbt: [['2', '3']], opto: [['1', '2'], ['3', '4']], tl431: [['2', '3']],
  vdc: [['1', '2']], battery: [['1', '2']], vsin: [['1', '2']], vpulse: [['1', '2']],
  diode: [['1', '2']], zener: [['1', '2']], led: [['1', '2']],
  npn: [['1', '2', '3']], pnp: [['1', '2', '3']], nmos: [['2', '3']], pmos: [['2', '3']],
  opamp: [['6', '7', '4']], switch: [], button: [], spdt: [],
  regulator: [['1', '2', '3']], lm317: [['1', '2', '3']], timer555: [['1', '3', '5', '7', '8']],
  // capacitors, current sources and op-amp inputs give no DC path
};

export function erc(sheet: Sheet, conn: Connectivity = connectivity(sheet)): ErcIssue[] {
  const out: ErcIssue[] = [];
  const add = (i: Omit<ErcIssue, 'id'>) => out.push({ ...i, id: `${i.rule}:${out.length}` });
  const pinAt = new Map<string, Pt>();
  for (const p of sheet.parts) for (const pp of pinPositions(p)) pinAt.set(`${p.ref}.${pp.pin}`, pp.at);

  // (e) duplicate references
  const seen = new Map<string, number>();
  for (const p of sheet.parts) if (!symbolOf(p.sym).power) seen.set(p.ref, (seen.get(p.ref) ?? 0) + 1);
  for (const [r, n] of seen) if (n > 1) {
    const p = sheet.parts.find((x) => x.ref === r)!;
    add({ severity: 'error', rule: 'ED-09.e', message: `Reference ${r} is used ${n} times. Use Annotate to renumber.`, at: { x: p.x, y: p.y }, refs: [r] });
  }

  // (a) unconnected pins, (b) nets with a single connection
  for (const p of sheet.parts) {
    const s = symbolOf(p.sym);
    if (s.power) continue;
    for (const pp of pinPositions(p)) {
      const id = `${p.ref}.${pp.pin}`;
      if (!conn.pinNet.has(id) && !s.pins.find((d) => d.id === pp.pin)?.optional) add({ severity: 'warning', rule: 'ED-09.a', message: `Pin ${id} (${pp.name}) is not connected.`, at: pp.at, refs: [p.ref] });
    }
  }
  for (const n of conn.nets) {
    const members = n.pins.length + n.power.length + n.labels.length;
    if (n.pins.length === 1 && members === 1) {
      add({ severity: 'warning', rule: 'ED-09.b', message: `Net ${n.name} has only one connection (${n.pins[0]}): the wire ends nowhere.`, at: pinAt.get(n.pins[0]) ?? null, refs: [n.pins[0].split('.')[0]] });
    }
    if (n.pins.length === 0 && n.labels.length && !n.power.length) {
      add({ severity: 'warning', rule: 'ED-09.b', message: `Label ${n.name} connects to no part.`, at: null, refs: [] });
    }
  }
  for (const c of conn.conflicts) add({ severity: 'warning', rule: 'net-name', message: `One net has several names: ${c.names.join(', ')}. It is called ${c.net}.`, at: null, refs: [] });

  // (c) DC path to ground
  const hasGnd = conn.nets.some((n) => n.name === GND_NET);
  if (!hasGnd && sheet.parts.some((p) => !symbolOf(p.sym).power)) {
    const g = sheet.parts.find((p) => p.sym === 'gnd' && (p.props.value ?? 'GND').trim() === GND_NET);
    add(g
      ? { severity: 'error', rule: 'ED-09.c', message: 'The ground symbol is not connected to anything. Wire it to the circuit: the simulator measures every voltage against it.', at: { x: g.x, y: g.y }, refs: [g.ref] }
      : { severity: 'error', rule: 'ED-09.c', message: 'There is no ground symbol (GND). Add one: the simulator measures every voltage against it.', at: null, refs: [] });
  } else if (hasGnd) {
    const parent = new Map<string, string>();
    const find = (a: string): string => { while (parent.has(a) && parent.get(a) !== a) a = parent.get(a)!; return a; };
    const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    for (const p of sheet.parts) {
      const s = symbolOf(p.sym);
      const groups = DC_PATH[s.id] ?? [];
      for (const g of groups) {
        const nets = g.map((pin) => conn.pinNet.get(`${p.ref}.${pin}`)).filter(Boolean) as string[];
        for (let i = 1; i < nets.length; i++) union(nets[0], nets[i]);
      }
      // the DC motor's speed output is driven against ground through 100 Ω
      if (s.id === 'dcmotor') { const n = conn.pinNet.get(`${p.ref}.3`); if (n) union(n, GND_NET); }
      // logic parts: inputs have a resistance to ground and outputs drive the rail or ground
      if (s.logic) for (const pp of s.pins) { const n = conn.pinNet.get(`${p.ref}.${pp.id}`); if (n) union(n, GND_NET); }
      if (s.id === 'switch' && p.props.closed === 'true') { const a = conn.pinNet.get(`${p.ref}.1`), b = conn.pinNet.get(`${p.ref}.2`); if (a && b) union(a, b); }
      if (s.id === 'button' && p.props.pressed === 'true') { const a = conn.pinNet.get(`${p.ref}.1`), b = conn.pinNet.get(`${p.ref}.2`); if (a && b) union(a, b); }
      if (s.id === 'spdt') { const a = conn.pinNet.get(`${p.ref}.1`), b = conn.pinNet.get(`${p.ref}.${p.props.position === 'B' ? 3 : 2}`); if (a && b) union(a, b); }
    }
    // rails with a voltage in their name are tied to ground by their implicit supply
    for (const n of conn.nets) if (n.power.length && railVoltage(n.name) !== null) union(n.name, GND_NET);
    const g = find(GND_NET);
    for (const n of conn.nets) {
      if (n.name === GND_NET || find(n.name) === g || n.pins.length === 0) continue;
      add({ severity: 'warning', rule: 'ED-09.c', message: `Net ${n.name} has no DC path to ground: its DC voltage is undefined (it floats). Add a resistor to ground or connect it.`, at: pinAt.get(n.pins[0]) ?? null, refs: n.pins.map((x) => x.split('.')[0]) });
    }
  }

  // (d) voltage sources shorted or in parallel
  const vsrc = sheet.parts.filter((p) => ['vdc', 'battery', 'vsin', 'vpulse'].includes(p.sym));
  const pairs = new Map<string, string[]>();
  for (const p of vsrc) {
    const a = conn.pinNet.get(`${p.ref}.1`), b = conn.pinNet.get(`${p.ref}.2`);
    if (a && b && a === b) add({ severity: 'error', rule: 'ED-09.d', message: `Voltage source ${p.ref} is short-circuited (both pins on net ${a}).`, at: { x: p.x, y: p.y }, refs: [p.ref] });
    else if (a && b) { const k = [a, b].sort().join('|'); pairs.set(k, [...(pairs.get(k) ?? []), p.ref]); }
  }
  for (const [k, refs] of pairs) if (refs.length > 1 && refs.some((r) => sheet.parts.find((p) => p.ref === r)!.sym !== 'battery')) {
    const p = sheet.parts.find((x) => x.ref === refs[0])!;
    add({ severity: 'error', rule: 'ED-09.d', message: `Voltage sources ${refs.join(', ')} are in parallel (${k.replace('|', ' – ')}).`, at: { x: p.x, y: p.y }, refs });
  }

  // ED-03 (f) inductive load switched by a transistor without a flyback diode
  for (const l of sheet.parts.filter((p) => ['inductor', 'relay', 'dcmotor'].includes(p.sym))) {
    const a = conn.pinNet.get(`${l.ref}.1`), b = conn.pinNet.get(`${l.ref}.2`);
    if (!a || !b) continue;
    const switched = sheet.parts.some((q) => ((q.sym === 'npn' || q.sym === 'pnp') && [a, b].includes(conn.pinNet.get(`${q.ref}.2`) ?? '')) ||
      ((q.sym === 'nmos' || q.sym === 'pmos') && [a, b].includes(conn.pinNet.get(`${q.ref}.2`) ?? '')));
    if (!switched) continue;
    const flyback = sheet.parts.some((d) => ['diode', 'zener'].includes(d.sym) &&
      new Set([conn.pinNet.get(`${d.ref}.1`), conn.pinNet.get(`${d.ref}.2`)]).size === 2 &&
      [a, b].includes(conn.pinNet.get(`${d.ref}.1`) ?? '') && [a, b].includes(conn.pinNet.get(`${d.ref}.2`) ?? ''));
    if (!flyback) add({ severity: 'warning', rule: 'ED-03.f', message: `${l.sym === 'relay' ? 'Relay coil' : l.sym === 'dcmotor' ? 'Motor' : 'Inductive load'} ${l.ref} is switched by a transistor without a flyback diode across it: switching off causes a high voltage spike.`, at: { x: l.x, y: l.y }, refs: [l.ref] });
  }

  // VER-13: values and ratings that can be bought (E series, catalogue rating steps)
  for (const p of sheet.parts) for (const u of unbuyable(p)) add({ severity: 'warning', rule: 'VER-13', message: `${u.message}.`, at: { x: p.x, y: p.y }, refs: [p.ref] });

  // ED-08 and SIM-05
  const generic = sheet.parts.filter((p) => !symbolOf(p.sym).power).length;
  if (generic) add({ severity: 'info', rule: 'ED-08', message: `${generic} part(s) come from the generic symbol library and are not catalogue parts ("not a standard part"); the parts catalogue arrives in Increment 6.`, at: null, refs: [] });
  for (const p of sheet.parts) if (!symbolOf(p.sym).simulated) add({ severity: 'warning', rule: 'SIM-05', message: `${p.ref} has no simulation model: not simulated.`, at: { x: p.x, y: p.y }, refs: [p.ref] });
  return out;
}
