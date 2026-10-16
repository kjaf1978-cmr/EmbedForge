// Automatic wiring of a generated schematic (the worked power examples): the designs are entered
// as parts whose pins carry net names; this draws the circuit diagram from them. Every net is
// drawn with orthogonal wires on the 10-unit grid, around the part bodies, never through a pin or
// along a wire of another net and crossing other wires only at right angles (crossings do not
// connect). Supply rails and ground are drawn as power symbols at the pins; signals that run
// between functional blocks are wired inside each block and named by a label there. The result
// is checked against the entered netlist: every pin must end up on exactly the same net.

import { connectivity } from './connectivity';
import { labelPos } from './editor';
import { GRID, key, newId, onSegment, partBounds, pinPositions, samePt, valueText, type Label, type Part, type Probe, type Rot, type Sheet, type Wire } from './schematic';
import { symbolOf, type Pt } from './symbols';

export interface AutowireOptions {
  /** Rails drawn as power symbols at each pin ('GND' as the ground symbol). */
  rails?: Iterable<string>;
  /** Nets wired only inside each block, with a label on each block's piece. */
  labelled?: Iterable<string>;
  /** The functional block of a part (parts without a block form one block). */
  block?: (p: Part) => string;
  /** Nets that keep no name label when they are wired in one piece. */
  unnamed?: (net: string) => boolean;
  /** Return a drawing that differs from the netlist instead of failing (for diagnosis). */
  noCheck?: boolean;
}

type Dir = 0 | 1 | 2 | 3; // right, down, left, up
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
const horiz = (d: Dir) => d === 0 || d === 2;

interface Cell {
  /** A connection point of this net (pin, label, symbol pin, wire end, corner or junction). */
  pt?: string;
  h?: string;
  v?: string;
  /** Part body or symbol graphic: no wire. */
  body?: boolean;
  /** Text of a reference, value or label: wires avoid it if they can. */
  text?: boolean;
  /** The cell just outside a pin: kept for that pin's net, so the pin can always be left. */
  esc?: string;
}

/** The pins of every net of a sheet (power symbols excluded), as "partId:pin". */
function netsOf(sheet: Sheet): Map<string, { part: Part; pin: string; at: Pt }[]> {
  const conn = connectivity(sheet);
  const byRef = new Map(sheet.parts.map((p) => [p.ref, p]));
  const out = new Map<string, { part: Part; pin: string; at: Pt }[]>();
  for (const n of conn.nets) {
    const list = n.pins.map((rp) => {
      const i = rp.lastIndexOf('.'), part = byRef.get(rp.slice(0, i))!, pin = rp.slice(i + 1);
      return { part, pin, at: pinPositions(part).find((q) => q.pin === pin)!.at };
    });
    if (list.length) out.set(n.name, list);
  }
  return out;
}

/** The partition of the pins into nets, for comparing two drawings of one circuit. */
export function pinPartition(sheet: Sheet): string[] {
  const conn = connectivity(sheet);
  return conn.nets.filter((n) => n.pins.length).map((n) => [...n.pins].sort().join(' ')).sort();
}

/** The grid cells under a part's reference or value text (size in sheet units). */
function textCells(p: Part, which: 'ref' | 'val', t: string, size: number): Pt[] {
  const g = GRID, lp = labelPos(p, which), w = t.length * size * 0.62;
  const x0 = lp.anchor === 'start' ? lp.at.x : lp.anchor === 'end' ? lp.at.x - w : lp.at.x - w / 2;
  const out: Pt[] = [];
  for (let x = Math.floor(x0 / g) * g; x <= x0 + w + 1; x += g) for (let y = Math.floor((lp.at.y - size - 1) / g) * g; y <= lp.at.y + 2; y += g) if (y >= lp.at.y - size - 1) out.push({ x, y });
  return out;
}

class Grid {
  cells = new Map<string, Cell>();
  at(x: number, y: number): Cell { const k = `${x},${y}`; let c = this.cells.get(k); if (!c) { c = {}; this.cells.set(k, c); } return c; }
  peek(x: number, y: number): Cell | undefined { return this.cells.get(`${x},${y}`); }
}

/** Outward direction of a pin: away from the part's centre along the axis it sticks out on. */
function outward(p: Part, at: Pt): Dir {
  const b = partBounds(p);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  if (at.x <= b.x0 + 1e-6) return 2;
  if (at.x >= b.x1 - 1e-6) return 0;
  if (at.y <= b.y0 + 1e-6) return 3;
  if (at.y >= b.y1 - 1e-6) return 1;
  const dx = at.x - cx, dy = at.y - cy;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : (dy >= 0 ? 1 : 3);
}

/** Binary min-heap of [cost, state]. */
class Heap {
  a: [number, number][] = [];
  push(c: number, s: number) {
    const a = this.a; a.push([c, s]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop(): [number, number] | undefined {
    const a = this.a; if (!a.length) return undefined;
    const top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; }
    }
    return top;
  }
}

export function autowire(sheet: Sheet, o: AutowireOptions = {}): { sheet: Sheet; failed: string[] } {
  const rails = new Set(o.rails ?? []);
  rails.add('GND');
  const labelled = new Set(o.labelled ?? []);
  const blockOf = o.block ?? (() => '');
  const nets = netsOf(sheet);
  const reference = pinPartition(sheet);
  const conn0 = connectivity(sheet);

  // the drawing starts from the parts alone
  const parts = sheet.parts.filter((p) => !symbolOf(p.sym).power);
  const grid = new Grid();
  const g = GRID;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const p of parts) {
    const b = partBounds(p);
    bx0 = Math.min(bx0, b.x0); by0 = Math.min(by0, b.y0); bx1 = Math.max(bx1, b.x1); by1 = Math.max(by1, b.y1);
    for (let x = Math.ceil(b.x0 / g) * g; x <= b.x1; x += g) for (let y = Math.ceil(b.y0 / g) * g; y <= b.y1; y += g) grid.at(x, y).body = true;
    // reference and value text
    // (as drawn: 9-unit reference, 8-unit value; a wire through it would make it unreadable)
    for (const c of textCells(p, 'ref', p.ref, 9)) grid.at(c.x, c.y).text = true;
    const vt = valueText(p);
    if (vt) for (const c of textCells(p, 'val', vt, 8)) grid.at(c.x, c.y).text = true;
  }
  const pinCells = new Set(parts.flatMap((p) => pinPositions(p).map((q) => key(q.at))));
  const pinNet = new Map<string, string>();
  for (const [net, list] of nets) for (const q of list) pinNet.set(`${q.part.id}:${q.pin}`, net);
  for (const p of parts) for (const q of pinPositions(p)) {
    const c = grid.at(q.at.x, q.at.y);
    c.body = false;
    c.pt = pinNet.get(`${p.id}:${q.pin}`) ?? `#nc:${p.id}:${q.pin}`;
  }
  for (const p of parts) for (const q of pinPositions(p)) {
    const d = outward(p, q.at), e = grid.at(q.at.x + DX[d] * g, q.at.y + DY[d] * g);
    if (!e.body && !e.pt) e.esc = e.esc && e.esc !== grid.at(q.at.x, q.at.y).pt ? '#shared' : grid.at(q.at.x, q.at.y).pt;
  }
  const margin = 40 * g;
  bx0 -= margin; by0 -= margin; bx1 += margin; by1 += margin;

  const wires: Wire[] = [];
  const labels: Label[] = sheet.labels.filter((l) => l.note).map((l) => ({ ...l }));
  const symbols: Part[] = [];
  const failed: string[] = [];
  const named = new Map<string, Pt>(); // net → where its name label is

  /** Route from the source cell to any cell of `tree` (keys of cells already on this net). */
  const route = (net: string, src: Pt, srcDir: Dir | null, isTarget: (x: number, y: number) => boolean, box: { x0: number; y0: number; x1: number; y1: number }): Pt[] | null => {
    const W = Math.round((box.x1 - box.x0) / g) + 1, H = Math.round((box.y1 - box.y0) / g) + 1;
    const idx = (x: number, y: number) => Math.round((y - box.y0) / g) * W + Math.round((x - box.x0) / g);
    const N = W * H * 4;
    const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    const heap = new Heap();
    const s0 = idx(src.x, src.y);
    for (const d of [0, 1, 2, 3] as Dir[]) {
      const st = s0 * 4 + d;
      const cost = srcDir === null || d === srcDir ? 0 : 50; // leave a pin outwards
      dist[st] = cost; heap.push(cost, st);
    }
    let goal = -1;
    for (;;) {
      const top = heap.pop();
      if (!top) break;
      const [cst, st] = top;
      if (cst > dist[st]) continue;
      const cell = st >> 2, d = (st & 3) as Dir;
      const x = box.x0 + (cell % W) * g, y = box.y0 + Math.floor(cell / W) * g;
      if (cell !== s0 && isTarget(x, y)) { goal = st; break; }
      for (const nd of [0, 1, 2, 3] as Dir[]) {
        if (nd === ((d + 2) & 3)) continue;
        const turn = nd !== d;
        if (turn && cell !== s0) {
          // a corner is a connection point: nothing of another net may be here
          const c = grid.peek(x, y);
          if (c && ((c.h && c.h !== net) || (c.v && c.v !== net))) continue;
        }
        const nx = x + DX[nd] * g, ny = y + DY[nd] * g;
        if (nx < box.x0 || nx > box.x1 || ny < box.y0 || ny > box.y1) continue;
        const c = grid.peek(nx, ny);
        let step = 1 + (turn ? 4 : 0);
        if (c) {
          const target = isTarget(nx, ny);
          if (!target) {
            if (c.body || c.pt) continue;
            if (c.esc && c.esc !== net && c.esc !== '#shared') continue; // another pin's way out
            const along = horiz(nd) ? c.h : c.v, across = horiz(nd) ? c.v : c.h;
            if (along) continue; // would run along another wire
            if (across) {
              if (across === net) continue; // own wire: it would have been a target
              // straight crossing only: the next step must continue in the same direction
              const fx = nx + DX[nd] * g, fy = ny + DY[nd] * g, f = grid.peek(fx, fy);
              if (f && (f.body || (f.pt && !isTarget(fx, fy)) || (horiz(nd) ? f.h : f.v))) continue;
              step += 2;
            }
            if (c.text) step += 300;
          } else if (c.body) continue;
        }
        const ns = idx(nx, ny) * 4 + nd;
        // a crossing cell may only be left straight on
        const nc = cst + step;
        if (nc < dist[ns]) { dist[ns] = nc; prev[ns] = st; heap.push(nc, ns); }
      }
    }
    if (goal < 0) return null;
    const path: Pt[] = [];
    for (let st = goal; st >= 0; st = prev[st]) { const cell = st >> 2; path.push({ x: box.x0 + (cell % W) * g, y: box.y0 + Math.floor(cell / W) * g }); if (cell === s0) break; }
    path.reverse();
    // a crossing must go straight through: reject paths that turn on another net's wire
    for (let i = 1; i < path.length - 1; i++) {
      const a = path[i - 1], b = path[i], c = path[i + 1];
      const turn = (a.x === b.x) !== (b.x === c.x);
      const cl = grid.peek(b.x, b.y);
      if (turn && cl && ((cl.h && cl.h !== net) || (cl.v && cl.v !== net))) return null;
    }
    return path;
  };

  const commit = (net: string, path: Pt[]) => {
    // corners and ends are points; straight cells carry the wire's direction
    const pts: Pt[] = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const a = path[i - 1], b = path[i], c = path[i + 1];
      if ((a.x === b.x) !== (b.x === c.x)) pts.push(b);
    }
    pts.push(path[path.length - 1]);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      wires.push({ id: newId('w'), a: { ...a }, b: { ...b } });
      const h = a.y === b.y;
      const n = Math.round((Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / g);
      for (let k = 1; k < n; k++) {
        const x = a.x + Math.sign(b.x - a.x) * k * g, y = a.y + Math.sign(b.y - a.y) * k * g;
        const c = grid.at(x, y);
        if (h) c.h = c.h ?? net; else c.v = c.v ?? net;
      }
    }
    for (const p of pts) grid.at(p.x, p.y).pt = net;
  };

  /** Wires a group of pins into one tree; returns the pieces (each a list of cells) that stayed apart. */
  const wireGroup = (net: string, pins: { part: Part; at: Pt }[]): Pt[][] => {
    if (!pins.length) return [];
    const pieceOf = new Map<string, number>(); // cell → piece
    const pieces: Pt[][] = [];
    const add = (p: Pt, i: number) => { pieceOf.set(key(p), i); pieces[i].push(p); };
    // order: start from the leftmost-top pin, then nearest to what is wired
    const left = [...pins].sort((a, b) => a.at.x - b.at.x || a.at.y - b.at.y);
    const first = left.shift()!;
    pieces.push([]); add(first.at, 0);
    while (left.length) {
      const cells = pieces[0];
      const d = (q: { at: Pt }) => Math.min(...cells.map((c) => Math.abs(c.x - q.at.x) + Math.abs(c.y - q.at.y)));
      left.sort((a, b) => d(a) - d(b));
      const q = left.shift()!;
      const all = [...pieceOf.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; });
      const xs = [q.at.x, ...all.map((c) => c.x)], ys = [q.at.y, ...all.map((c) => c.y)];
      let path: Pt[] | null = null;
      for (const m of [8, 25, 80]) {
        const box = { x0: Math.max(bx0, Math.min(...xs) - m * g), y0: Math.max(by0, Math.min(...ys) - m * g), x1: Math.min(bx1, Math.max(...xs) + m * g), y1: Math.min(by1, Math.max(...ys) + m * g) };
        path = route(net, q.at, outward(q.part, q.at), (x, y) => {
          if (!pieceOf.has(`${x},${y}`)) return false;
          const c = grid.peek(x, y);
          return !c || ((!c.h || c.h === net) && (!c.v || c.v === net));
        }, box);
        if (path) break;
      }
      if (!path) { pieces.push([]); add(q.at, pieces.length - 1); failed.push(`${net}: ${q.part.ref}`); continue; }
      commit(net, path);
      const i = pieceOf.get(key(path[path.length - 1]))!;
      for (const c of path) if (!pieceOf.has(key(c))) add(c, i);
    }
    return pieces;
  };

  /** A free cell next to the piece where a label (or symbol) can sit, reached by a short stub. */
  /** `needed`: the name carries a connection (a labelled net, a net in pieces, a lone pin);
   *  otherwise it is only for reading and is left out where it has no clear place. */
  const placeName = (net: string, piece: Pt[], needed = true) => {
    const w = Math.ceil((net.length * 6 + 4) / g);
    // what the name's row (above the point, reading to the right) would lie on: never a part or
    // a pin; each wire costs 10, other text 1
    const rowScore = (x: number, y: number) => {
      let sc = 0;
      // (from one cell on: the text starts right of the point, above its own stub)
      for (let k = 1; k <= w; k++) {
        const cl = grid.peek(x + k * g, y - g);
        if (!cl) continue;
        if (cl.body || cl.pt) return Infinity;
        if (cl.h || cl.v) sc += 10;
        if (cl.text) sc += 1;
      }
      return sc;
    };
    let best: { at: Pt; stub: Pt[]; score: number } | undefined;
    const offer = (at: Pt, stub: Pt[], extra: number) => {
      const sc = rowScore(at.x, at.y) + extra + stub.length * 0.1;
      if (sc < Infinity && (!best || sc < best.score)) best = { at, stub, score: sc };
    };
    // a stub of `reach` cells from a point of the piece, then the name
    for (const reach of [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]) {
      // a clear spot at this reach: no longer stub is better (long stubs only when nothing is clear)
      if (best && (best.score < 1 || (reach > 8 && best.score < 10))) break;
      for (const c of piece) for (const d of [3, 1, 0, 2] as Dir[]) {
      let ok = true, txt = 0;
      const cells: Pt[] = [];
      for (let k = 1; k <= reach; k++) {
        const x = c.x + DX[d] * k * g, y = c.y + DY[d] * k * g, cl = grid.peek(x, y);
        // a wire of another net may be crossed straight, not run along or ended on
        const along = cl && (horiz(d) ? cl.h : cl.v), across = cl && (horiz(d) ? cl.v : cl.h);
        if (cl && (cl.body || cl.pt || along || (across && (k === reach || across === net)))) { ok = false; break; }
        if (across) txt += 3;
        if (cl?.text) txt++;
        cells.push({ x, y });
      }
      if (ok) offer(cells[cells.length - 1], [c, ...cells], txt);
      }
    }
    // still nothing clear: a stub with one bend (out, then sideways)
    if (!best || best.score >= 1) for (const c of piece) for (const d of [3, 1, 0, 2] as Dir[]) for (const r1 of [1, 2, 3]) for (const d2 of ([0, 1, 2, 3] as Dir[]).filter((x) => x !== d && x !== ((d + 2) & 3))) for (const r2 of [1, 2, 3, 4]) {
      let ok = true, txt = 0;
      const cells: Pt[] = [];
      for (let k = 1; k <= r1 + r2 && ok; k++) {
        const dd = k <= r1 ? d : d2, base = k <= r1 ? c : { x: c.x + DX[d] * r1 * g, y: c.y + DY[d] * r1 * g }, kk = k <= r1 ? k : k - r1;
        const x = base.x + DX[dd] * kk * g, y = base.y + DY[dd] * kk * g, cl = grid.peek(x, y);
        if (cl && (cl.body || cl.pt || cl.h || cl.v || cl.esc)) ok = false;
        else { if (cl?.text) txt++; cells.push({ x, y }); }
      }
      if (ok) offer(cells[cells.length - 1], [c, ...cells], txt + 0.5);
    }
    // or on the piece's own wire (not at a pin, not at a crossing with another net)
    const reached = new Set(piece.map(key)), own: Wire[] = [];
    for (let grew = true; grew;) {
      grew = false;
      for (const wr of wires) if (!own.includes(wr) && (reached.has(key(wr.a)) || reached.has(key(wr.b)))) { own.push(wr); reached.add(key(wr.a)); reached.add(key(wr.b)); grew = true; }
    }
    for (const wr of own) {
      const n = Math.round((Math.abs(wr.b.x - wr.a.x) + Math.abs(wr.b.y - wr.a.y)) / g);
      for (let k = 0; k <= n; k++) {
        const x = wr.a.x + Math.sign(wr.b.x - wr.a.x) * k * g, y = wr.a.y + Math.sign(wr.b.y - wr.a.y) * k * g, cl = grid.peek(x, y);
        if (pinCells.has(key({ x, y })) || (cl && ((cl.h && cl.h !== net) || (cl.v && cl.v !== net)))) continue;
        // only where every wire through the point is the piece's own
        if (wires.some((o2) => !own.includes(o2) && onSegment({ x, y }, o2.a, o2.b))) continue;
        offer({ x, y }, [], 0.05);
      }
    }
    // a name only for reading: on a clear spot or not at all
    if (!needed && best && best.score >= 10) best = undefined;
    if (best) {
      const b = best.at;
      if (best.stub.length) commit(net, best.stub);
      else {
        // a label joins a wire anywhere along it; split the segment so the point is an end too
        const i = wires.findIndex((wr) => onSegment(b, wr.a, wr.b) && !samePt(b, wr.a) && !samePt(b, wr.b));
        if (i >= 0) { const wr = wires[i]; wires.splice(i, 1, { id: newId('w'), a: wr.a, b }, { id: newId('w'), a: b, b: wr.b }); }
      }
      labels.push({ id: newId('l'), name: net, x: b.x, y: b.y });
      // a label joins whatever passes through its point: no other net may cross there later
      grid.at(b.x, b.y).pt = net;
      for (let k = 0; k <= w; k++) grid.at(b.x + k * g, b.y - g).text = true;
      return b;
    }
    // nowhere: on one of the piece's points, not a pin and not a crossing with another net
    if (!needed) return piece[0];
    const onWire = piece.find((c) => { const cl = grid.peek(c.x, c.y); return !pinCells.has(key(c)) && !(cl && ((cl.h && cl.h !== net) || (cl.v && cl.v !== net))); });
    const at = onWire ?? piece[0];
    labels.push({ id: newId('l'), name: net, x: at.x, y: at.y });
    return at;
  };

  /** A power or ground symbol for a rail pin, at the end of a short stub pointing outwards. */
  const railSymbol = (net: string, q: { part: Part; at: Pt }) => {
    const out = outward(q.part, q.at);
    const sym = net === 'GND' ? 'gnd' : 'power';
    // the symbol's graphic points down (ground) or up (rail) at rotation 0
    const natural: Dir = sym === 'gnd' ? 1 : 3;
    const tries: Dir[] = [out, natural, ...([0, 1, 2, 3] as Dir[]).filter((d) => d !== out && d !== natural)];
    for (const reach of [1, 2, 3, 4, 5, 6, 8]) for (const d of tries) {
      const cells: Pt[] = [];
      let ok = true;
      for (let k = 1; k <= reach + 2; k++) {
        const x = q.at.x + DX[d] * k * g, y = q.at.y + DY[d] * k * g, cl = grid.peek(x, y);
        if (cl && (cl.body || cl.pt || cl.h || cl.v)) { ok = false; break; }
        if (k <= reach) cells.push({ x, y });
      }
      if (!ok) continue;
      const end = cells[cells.length - 1];
      const rot = (((d - natural) + 4) % 4) as Rot;
      const part: Part = { id: newId('p'), ref: '#PWR', sym, x: end.x, y: end.y, rot, mirror: false, props: { value: net } };
      // its name must stay readable: no wire, pin or part where the text goes
      const tc = textCells(part, 'val', net, 8);
      if (tc.some((c) => { const cl = grid.peek(c.x, c.y); return cl && (cl.body || cl.pt || cl.h || cl.v || cl.text); })) continue;
      commit(net, [q.at, ...cells]);
      symbols.push(part);
      for (let k = 1; k <= 2; k++) grid.at(end.x + DX[d] * k * g, end.y + DY[d] * k * g).body = true;
      for (const c of tc) grid.at(c.x, c.y).body = true;
      return;
    }
    // no room: the symbol on the pin
    symbols.push({ id: newId('p'), ref: '#PWR', sym, x: q.at.x, y: q.at.y, rot: 0, mirror: false, props: { value: net } });
  };

  // short nets first: they have the least choice
  const order = [...nets.entries()].filter(([n]) => !rails.has(n)).sort(([, a], [, b]) => {
    const span = (l: { at: Pt }[]) => Math.max(...l.map((q) => q.at.x)) - Math.min(...l.map((q) => q.at.x)) + Math.max(...l.map((q) => q.at.y)) - Math.min(...l.map((q) => q.at.y));
    return span(a) - span(b);
  });
  // rails first: their symbols sit right at the pins
  for (const [net, list] of nets) if (rails.has(net)) for (const q of list) railSymbol(net, q);
  // names go on after all the wiring, where no later wire can cross them
  const later: (() => void)[] = [];
  for (const [net, list] of order) {
    if (list.length < 2 && !labelled.has(net)) {
      // a single pin on a named net (a test point, an open contact): its label
      if (!/^N\(/.test(net)) later.push(() => placeName(net, [list[0].at]));
      continue;
    }
    if (labelled.has(net)) {
      const byBlock = new Map<string, { part: Part; at: Pt }[]>();
      for (const q of list) { const b = blockOf(q.part); byBlock.set(b, [...(byBlock.get(b) ?? []), q]); }
      for (const group of byBlock.values()) for (const piece of wireGroup(net, group)) later.push(() => placeName(net, piece));
      continue;
    }
    const pieces = wireGroup(net, list);
    const autoName = /^N\(/.test(net) || o.unnamed?.(net);
    pieces.forEach((piece, i) => { if (!autoName || pieces.length > 1 || i > 0) later.push(() => named.set(net, placeName(net, piece, pieces.length > 1))); });
  }
  for (const f of later) f();

  const out: Sheet = { ...sheet, parts: [...parts, ...symbols], wires, labels };
  // probes: voltage probes move to the new place of their net
  const conn1 = connectivity(out);
  const probes: Probe[] = sheet.probes.map((p) => {
    if (p.kind !== 'v') return p;
    const net = conn0.nets.find((n) => n.labels.length && sheet.labels.some((l) => !l.note && l.x === p.at.x && l.y === p.at.y && n.labels.includes(l.name)));
    const lbl = net && labels.find((l) => !l.note && l.name === net.name);
    return lbl ? { ...p, at: { x: lbl.x, y: lbl.y } } : p;
  });
  void conn1;
  const result = { ...out, probes };
  const got = pinPartition(result);
  if (!o.noCheck && got.join('\n') !== reference.join('\n')) {
    const ref = new Set(reference), diff = got.filter((x) => !ref.has(x)).slice(0, 5);
    throw new Error(`autowire changed the circuit: ${diff.join(' | ')}`);
  }
  return { sheet: result, failed };
}
