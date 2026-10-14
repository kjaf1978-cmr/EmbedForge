// PCB view (UI-10): the board of the open schematic. Outline, footprints with their pads,
// tracks and vias on two copper layers, silkscreen, and the ratsnest of the connections still
// to make. Parts are placed by dragging or with the keyboard; tracks are drawn from pad to pad
// with the route tool, changing layer through a via (V). The board follows the schematic
// (PCB-07): parts added there appear below the outline, parts deleted there leave the board.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Sheet } from '../../eda/schematic';
import { connectivity } from '../../eda/connectivity';
import { boardPads, courtyardOf, newBoard, onBoard, place, syncBoard, TEMPLATES, type Board, type BoardPad, type Layer, type Placement, type Track } from '../../pcb/board';
import { ratsnest, segDist } from '../../pcb/ratsnest';
import { footprintOf } from '../../pcb/library';
import { EF_PROTO_STD } from '../../pcb/profile';

type Tool = 'select' | 'route';
interface Props { sheet: Sheet; commit: (s: Sheet, label: string) => void; announce: (m: string) => void }

const GRID = 0.635; // 25 mil: half the 0.1 in pitch of the through-hole parts
const snapMm = (v: number) => Math.round(v / GRID) * GRID;
const fmt = (v: number) => `${(Math.round(v * 100) / 100).toString()} mm`;
let idc = 0;
const newId = (p: string) => `${p}${Date.now().toString(36)}${(idc++).toString(36)}`;

/** Path of a pad shape at its board position. */
function padPath(p: BoardPad): string {
  const { x, y, w, h } = p;
  if (p.pad.shape === 'rect') return `M ${x - w / 2} ${y - h / 2} h ${w} v ${h} h ${-w} Z`;
  const r = Math.min(w, h) / 2;
  if (p.pad.shape === 'circle' || w === h) return `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  // oval: a stadium along its long side
  return w > h
    ? `M ${x - w / 2 + r} ${y - r} h ${w - 2 * r} a ${r} ${r} 0 0 1 0 ${2 * r} h ${-(w - 2 * r)} a ${r} ${r} 0 0 1 0 ${-2 * r} Z`
    : `M ${x - r} ${y - h / 2 + r} a ${r} ${r} 0 0 1 ${2 * r} 0 v ${h - 2 * r} a ${r} ${r} 0 0 1 ${-2 * r} 0 Z`;
}

export function PcbView({ sheet, commit, announce }: Props) {
  // the board shown is always in step with the schematic
  const synced = useMemo(() => (sheet.board ? syncBoard(sheet, sheet.board) : null), [sheet]);
  const board = synced?.board ?? null;
  const conn = useMemo(() => connectivity(sheet), [sheet]);
  const pads = useMemo(() => (board ? boardPads(sheet, board, conn) : []), [sheet, board, conn]);
  const rn = useMemo(() => (board ? ratsnest(pads, board) : { airwires: [], shorts: [] }), [pads, board]);
  const set = (b: Board, label: string) => commit({ ...sheet, board: b }, label);

  const [tool, setTool] = useState<Tool>('select');
  const [layer, setLayer] = useState<Layer>('F');
  const [width, setWidth] = useState(0.4);
  const [show, setShow] = useState({ F: true, B: true, silk: true, rats: true });
  const [sel, setSel] = useState<{ kind: 'part' | 'track' | 'via'; id: string } | null>(null);
  const [route, setRoute] = useState<{ net: string; layer: Layer; pts: [number, number][]; vias: [number, number][]; segLayers: Layer[] } | null>(null);
  const [cursor, setCursor] = useState<[number, number]>([0, 0]);
  const [view, setView] = useState({ x: -5, y: -5, s: 8 }); // board mm at the top-left, pixels per mm
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ ref: string; dx: number; dy: number; moved: boolean } | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const dragPreview = useRef<{ ref: string; x: number; y: number } | null>(null);
  const [, forceDraw] = useState(0);

  // fit the board when it first appears
  const fitted = useRef(false);
  useEffect(() => { if (board && !fitted.current) { fit(); fitted.current = true; } }, [board]);
  const fit = () => {
    const el = svg.current;
    if (!el || !board) return;
    const r = el.getBoundingClientRect();
    const extraH = Math.max(0, ...board.parts.map((p) => p.y)) + 10;
    const h = Math.max(board.outline.h + 10, extraH), w = board.outline.w + 10;
    const s = Math.max(1, Math.min(r.width / w, r.height / h));
    setView({ x: -5, y: -5, s });
  };

  const toMm = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [view.x + (e.clientX - r.left) / view.s, view.y + (e.clientY - r.top) / view.s];
  };

  if (!board) return <StartBoard sheet={sheet} onCreate={(b) => { set(syncBoard(sheet, b).board, 'Start the board'); announce('Board created; the parts wait below the outline'); }} />;

  const partAt = (p: [number, number]): Placement | null => {
    for (const pl of [...board.parts].reverse()) {
      const part = sheet.parts.find((x) => x.ref === pl.ref);
      const f = part && footprintOf(part);
      if (!f) continue;
      const c = courtyardOf(pl, f.fp);
      if (p[0] >= c.x0 && p[0] <= c.x1 && p[1] >= c.y0 && p[1] <= c.y1) return pl;
    }
    return null;
  };
  const padAt = (p: [number, number], ly?: Layer) => pads.find((q) => (!ly || q.layers.includes(ly)) && Math.abs(p[0] - q.x) <= q.w / 2 && Math.abs(p[1] - q.y) <= q.h / 2) ?? null;
  const trackAt = (p: [number, number]) => board.tracks.find((t) => t.pts.slice(1).some((q, k) => segDist(p, t.pts[k], q) <= t.width / 2 + 0.2)) ?? null;
  const viaAt = (p: [number, number]) => board.vias.find((v) => Math.hypot(p[0] - v.x, p[1] - v.y) <= v.pad / 2) ?? null;

  /** Next routing point: horizontal, vertical or 45° from the last one (KiCad's 45° mode). */
  const bend = (from: [number, number], to: [number, number]): [number, number] => {
    const dx = to[0] - from[0], dy = to[1] - from[1];
    if (Math.abs(dx) > 2 * Math.abs(dy)) return [to[0], from[1]];
    if (Math.abs(dy) > 2 * Math.abs(dx)) return [from[0], to[1]];
    const d = Math.min(Math.abs(dx), Math.abs(dy));
    return [from[0] + Math.sign(dx) * d, from[1] + Math.sign(dy) * d];
  };

  const finishRoute = (r: NonNullable<typeof route>) => {
    // one track per layer run; vias where the layer changes
    const tracks: Track[] = [];
    let start = 0;
    for (let k = 1; k <= r.segLayers.length; k++) {
      if (k === r.segLayers.length || r.segLayers[k] !== r.segLayers[start]) {
        tracks.push({ id: newId('t'), net: r.net, layer: r.segLayers[start], width, pts: r.pts.slice(start, k + 1) });
        start = k;
      }
    }
    const vias = r.vias.map(([x, y]) => ({ id: newId('v'), net: r.net, x, y, drill: 0.4, pad: 0.8 }));
    set({ ...board, tracks: [...board.tracks, ...tracks], vias: [...board.vias, ...vias] }, `Route ${r.net}`);
    setRoute(null);
    announce(`Routed a track of ${r.net}`);
  };

  const onDown = (e: PointerEvent) => {
    const p = toMm(e);
    if (e.button === 1 || e.button === 2) { pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; return; }
    if (tool === 'route') {
      const sp: [number, number] = [snapMm(p[0]), snapMm(p[1])];
      if (!route) {
        const pad = padAt(p, layer);
        if (!pad?.net) { announce('Start a track on a pad that is connected on the schematic'); return; }
        setRoute({ net: pad.net, layer, pts: [[pad.x, pad.y]], vias: [], segLayers: [] });
        return;
      }
      const last = route.pts[route.pts.length - 1];
      const end = padAt(p, route.layer);
      if (end && end.net === route.net) {
        // the last leg goes to the pad centre through a bend
        const mid = bend(last, [end.x, end.y]);
        const pts = [...route.pts, ...(mid[0] !== end.x || mid[1] !== end.y ? [mid] : []), [end.x, end.y] as [number, number]].filter((q, k, a) => k === 0 || q[0] !== a[k - 1][0] || q[1] !== a[k - 1][1]);
        finishRoute({ ...route, pts, segLayers: [...route.segLayers, ...Array(pts.length - route.pts.length).fill(route.layer)] });
        return;
      }
      if (end && end.net !== route.net) { announce(`That pad is on ${end.net ?? 'no net'}, not ${route.net}`); return; }
      const nxt = bend(last, sp);
      if (nxt[0] === last[0] && nxt[1] === last[1]) return;
      setRoute({ ...route, pts: [...route.pts, nxt], segLayers: [...route.segLayers, route.layer] });
      return;
    }
    const pl = partAt(p);
    if (pl) { setSel({ kind: 'part', id: pl.ref }); drag.current = { ref: pl.ref, dx: p[0] - pl.x, dy: p[1] - pl.y, moved: false }; (e.target as Element).setPointerCapture?.(e.pointerId); return; }
    const v = viaAt(p);
    if (v) { setSel({ kind: 'via', id: v.id }); return; }
    const t = trackAt(p);
    setSel(t ? { kind: 'track', id: t.id } : null);
  };
  const onMove = (e: PointerEvent) => {
    const p = toMm(e);
    setCursor(p);
    if (pan.current) { const d = pan.current; setView((v) => ({ ...v, x: d.vx - (e.clientX - d.x) / v.s, y: d.vy - (e.clientY - d.y) / v.s })); return; }
    const d = drag.current;
    if (d) {
      const nx = snapMm(p[0] - d.dx), ny = snapMm(p[1] - d.dy);
      const pl = board.parts.find((x) => x.ref === d.ref)!;
      if (nx !== pl.x || ny !== pl.y) { d.moved = true; dragPreview.current = { ref: d.ref, x: nx, y: ny }; forceDraw((n) => n + 1); }
    }
  };
  const onUp = () => {
    pan.current = null;
    const d = drag.current, pv = dragPreview.current;
    drag.current = null; dragPreview.current = null;
    if (d?.moved && pv) set({ ...board, parts: board.parts.map((x) => (x.ref === pv.ref ? { ...x, x: pv.x, y: pv.y } : x)) }, `Move ${pv.ref}`);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = toMm(e), k = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    setView((v) => { const s = Math.min(200, Math.max(1, v.s * k)); return { s, x: p[0] - (p[0] - v.x) * (v.s / s), y: p[1] - (p[1] - v.y) * (v.s / s) }; });
  };

  const selPart = sel?.kind === 'part' ? board.parts.find((x) => x.ref === sel.id) ?? null : null;
  const updatePart = (ref: string, ch: Partial<Placement>, label: string) => set({ ...board, parts: board.parts.map((x) => (x.ref === ref ? { ...x, ...ch } : x)) }, label);
  const rotate = () => selPart && updatePart(selPart.ref, { rot: ((selPart.rot + 90) % 360) as Placement['rot'] }, `Rotate ${selPart.ref}`);
  const flip = () => selPart && updatePart(selPart.ref, { side: selPart.side === 'top' ? 'bottom' : 'top' }, `${selPart.ref} to the ${selPart.side === 'top' ? 'bottom' : 'top'}`);
  const del = () => {
    if (sel?.kind === 'track') set({ ...board, tracks: board.tracks.filter((t) => t.id !== sel.id) }, 'Delete track');
    else if (sel?.kind === 'via') set({ ...board, vias: board.vias.filter((v) => v.id !== sel.id) }, 'Delete via');
    else if (selPart) announce(`${selPart.ref} comes from the schematic: delete it there`);
    setSel(null);
  };
  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === 'Escape') { if (route) setRoute(null); else { setTool('select'); setSel(null); } e.preventDefault(); return; }
    if (k === 'x' || k === 'X') { setTool('route'); e.preventDefault(); return; }
    if (k === 's' || k === 'S') { setTool('select'); e.preventDefault(); return; }
    if ((k === 'v' || k === 'V') && route) {
      // a via at the last point; the track continues on the other layer
      const last = route.pts[route.pts.length - 1];
      const other: Layer = route.layer === 'F' ? 'B' : 'F';
      setRoute({ ...route, layer: other, vias: [...route.vias, last] });
      setLayer(other);
      announce(`Via; now on the ${other === 'F' ? 'top' : 'bottom'} layer`);
      e.preventDefault();
      return;
    }
    if ((k === 'v' || k === 'V') && !route) { setLayer((l) => (l === 'F' ? 'B' : 'F')); e.preventDefault(); return; }
    if (k === 'r' || k === 'R') { rotate(); e.preventDefault(); return; }
    if (k === 'f' || k === 'F') { flip(); e.preventDefault(); return; }
    if (k === 'Delete' || k === 'Backspace') { del(); e.preventDefault(); return; }
    if (selPart && k.startsWith('Arrow')) {
      const step = e.shiftKey ? GRID * 4 : GRID;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k as 'ArrowLeft']!;
      updatePart(selPart.ref, { x: snapMm(selPart.x + d[0]), y: snapMm(selPart.y + d[1]) }, `Move ${selPart.ref}`);
      e.preventDefault();
    }
  };

  const shownParts = board.parts.map((pl) => (dragPreview.current?.ref === pl.ref ? { ...pl, x: dragPreview.current.x, y: dragPreview.current.y } : pl));
  const shownPads = dragPreview.current ? boardPads(sheet, { ...board, parts: shownParts }, conn) : pads;
  const offBoard = shownParts.filter((pl) => { const part = sheet.parts.find((x) => x.ref === pl.ref); const f = part && footprintOf(part); return f && !onBoard(pl, f.fp, board); }).map((pl) => pl.ref);
  const preview = route ? bend(route.pts[route.pts.length - 1], [snapMm(cursor[0]), snapMm(cursor[1])]) : null;
  const vb = svg.current?.getBoundingClientRect();
  const vbw = (vb?.width ?? 800) / view.s, vbh = (vb?.height ?? 600) / view.s;
  const layerOrder: Layer[] = layer === 'F' ? ['B', 'F'] : ['F', 'B'];
  const o = board.outline;

  return (
    <div class="pcb-view">
      <div class="pcb-bar row wrap" role="toolbar" aria-label="PCB tools">
        <button aria-pressed={tool === 'select'} onClick={() => { setTool('select'); setRoute(null); }}>Select <kbd>S</kbd></button>
        <button aria-pressed={tool === 'route'} onClick={() => setTool('route')}>Route <kbd>X</kbd></button>
        <label>Layer <select value={layer} onChange={(e) => setLayer((e.target as HTMLSelectElement).value as Layer)} aria-label="Active copper layer">
          <option value="F">Top copper (F.Cu)</option><option value="B">Bottom copper (B.Cu)</option>
        </select></label>
        <label>Track width <select value={String(width)} onChange={(e) => setWidth(Number((e.target as HTMLSelectElement).value))}>
          {[0.25, 0.3, 0.4, 0.5, 0.8, 1.0, 1.5, 2.0].map((w) => <option key={w} value={w}>{w} mm</option>)}
        </select></label>
        <button onClick={rotate} disabled={!selPart}>Rotate <kbd>R</kbd></button>
        <button onClick={flip} disabled={!selPart}>Flip side <kbd>F</kbd></button>
        <button onClick={del} disabled={!sel}>Delete</button>
        <button onClick={fit}>Fit</button>
        <span class="small muted">Show:</span>
        {(['F', 'B', 'silk', 'rats'] as const).map((k) => (
          <label key={k} class="small"><input type="checkbox" checked={show[k]} onChange={() => setShow((s) => ({ ...s, [k]: !s[k] }))} /> {{ F: 'top copper', B: 'bottom copper', silk: 'silkscreen', rats: 'ratsnest' }[k]}</label>
        ))}
      </div>
      <div class="pcb-main">
        <svg ref={svg} class={`pcb-canvas tool-${tool}`} {...{ tabindex: 0 }} role="application" aria-label={`PCB canvas, ${board.parts.length} parts, ${rn.airwires.length} connections to route. S select, X route, V via or layer, R rotate, F flip, arrow keys move, Escape cancels.`}
             viewBox={`${view.x} ${view.y} ${vbw} ${vbh}`} onPointerDown={onDown as never} onPointerMove={onMove as never} onPointerUp={onUp} onWheel={onWheel as never} onKeyDown={onKey as never}
             onContextMenu={(e) => e.preventDefault()}>
          <rect x={0} y={0} width={o.w} height={o.h} class="pcb-board" />
          {o.holes.map((h, k) => <circle key={k} cx={h.x} cy={h.y} r={h.d / 2} class="pcb-hole" />)}
          {layerOrder.filter((l) => show[l]).map((l) => (
            <g key={l} class={`pcb-layer layer-${l}${l !== layer ? ' dim' : ''}`}>
              {board.tracks.filter((t) => t.layer === l).map((t) => (
                <polyline key={t.id} points={t.pts.map((q) => q.join(',')).join(' ')} stroke-width={t.width} class={`pcb-track${sel?.id === t.id ? ' is-sel' : ''}`} />
              ))}
              {shownPads.filter((p) => p.layers.includes(l)).map((p, k) => <path key={`${p.ref}.${p.pad.id}.${k}`} d={padPath(p)} class="pcb-pad" data-pad={`${p.ref}.${p.pad.id}`} data-net={p.net ?? ''} />)}
            </g>
          ))}
          {shownPads.filter((p) => p.pad.drill).map((p, k) => <circle key={`d${k}`} cx={p.x} cy={p.y} r={p.pad.drill! / 2} class="pcb-drill" />)}
          {board.vias.map((v) => <g key={v.id} class={`pcb-via${sel?.id === v.id ? ' is-sel' : ''}`}><circle cx={v.x} cy={v.y} r={v.pad / 2} /><circle cx={v.x} cy={v.y} r={v.drill / 2} class="pcb-drill" /></g>)}
          {show.silk && shownParts.map((pl) => <PartSilk key={pl.ref} pl={pl} sheet={sheet} selected={sel?.id === pl.ref} off={offBoard.includes(pl.ref)} />)}
          {show.rats && rn.airwires.map((a, k) => <line key={k} x1={a.a.x} y1={a.a.y} x2={a.b.x} y2={a.b.y} class="pcb-rats" />)}
          {rn.shorts.map((s, k) => <circle key={`s${k}`} cx={s.at[0]} cy={s.at[1]} r={1.5} class="pcb-short" />)}
          {route && (
            <g class={`pcb-route layer-${route.layer}`}>
              {route.pts.slice(1).map((q, k) => <line key={k} x1={route.pts[k][0]} y1={route.pts[k][1]} x2={q[0]} y2={q[1]} stroke-width={width} class={`pcb-track layer-${route.segLayers[k]}`} />)}
              {preview && <line x1={route.pts[route.pts.length - 1][0]} y1={route.pts[route.pts.length - 1][1]} x2={preview[0]} y2={preview[1]} stroke-width={width} class="pcb-track ghost" />}
              {route.vias.map(([x, y], k) => <circle key={k} cx={x} cy={y} r={0.4} class="pcb-via" />)}
            </g>
          )}
        </svg>
        <aside class="pcb-side" aria-label="Board">
          <BoardPanel sheet={sheet} board={board} set={set} />
          <h3>Status</h3>
          <p role="status" class={rn.airwires.length || rn.shorts.length || offBoard.length ? 's-warn' : 's-ok'}>
            {rn.airwires.length ? `${rn.airwires.length} connection${rn.airwires.length > 1 ? 's' : ''} to route` : 'Every connection is routed'}
            {rn.shorts.length ? ` · ${rn.shorts.length} short${rn.shorts.length > 1 ? 's' : ''} between nets (${rn.shorts.map((s) => s.nets.join('–')).join(', ')})` : ''}
            {offBoard.length ? ` · not on the board yet: ${offBoard.join(', ')}` : ''}
          </p>
          {synced && synced.added.length > 0 && <p class="small">From the schematic: {synced.added.join(', ')} (placed below the board; drag them onto it)</p>}
          {route && <p class="small">Routing {route.net} on the {route.layer === 'F' ? 'top' : 'bottom'} layer: click to bend, click the target pad to finish, V for a via, Escape cancels.</p>}
          {selPart && <PartInfo pl={selPart} sheet={sheet} />}
          <p class="small muted">Cursor {fmt(cursor[0])}, {fmt(cursor[1])} · grid {GRID} mm · profile {EF_PROTO_STD.id} {EF_PROTO_STD.version}</p>
          <h3>Parts</h3>
          <ul class="pcb-parts small">
            {board.parts.map((pl) => (
              <li key={pl.ref}><button class="link" aria-pressed={sel?.id === pl.ref} onClick={() => { setSel({ kind: 'part', id: pl.ref }); svg.current?.focus(); }}>{pl.ref}</button> {footprintOf(sheet.parts.find((p) => p.ref === pl.ref)!)?.fp.name}{offBoard.includes(pl.ref) ? ' · off the board' : ''}</li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function PartSilk({ pl, sheet, selected, off }: { pl: Placement; sheet: Sheet; selected: boolean; off: boolean }) {
  const part = sheet.parts.find((p) => p.ref === pl.ref);
  const f = part && footprintOf(part);
  if (!f) return null;
  const c = courtyardOf(pl, f.fp);
  return (
    <g class={`pcb-silk${pl.side === 'bottom' ? ' bottom' : ''}${selected ? ' is-sel' : ''}${off ? ' off' : ''}`}>
      {f.fp.silk.map((s, k) => {
        if (s.t === 'circle') { const [x, y] = place(pl, s.x, s.y); return <circle key={k} cx={x} cy={y} r={s.r} />; }
        const [x1, y1] = place(pl, s.x1, s.y1), [x2, y2] = place(pl, s.x2, s.y2);
        return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      {selected && <rect x={c.x0} y={c.y0} width={c.x1 - c.x0} height={c.y1 - c.y0} class="pcb-courtyard" />}
      <text x={c.x0} y={c.y0 - 0.4} class="pcb-ref">{pl.ref}</text>
    </g>
  );
}

function PartInfo({ pl, sheet }: { pl: Placement; sheet: Sheet }) {
  const part = sheet.parts.find((p) => p.ref === pl.ref)!;
  const f = footprintOf(part)!;
  return (
    <div class="small">
      <h4>{pl.ref}</h4>
      <p>{f.fp.name}{f.choice.note ? ` (${f.choice.note})` : ''}</p>
      <p>At {fmt(pl.x)}, {fmt(pl.y)} · {pl.rot}° · {pl.side === 'top' ? 'top' : 'bottom'} side</p>
      <p class="muted">Change the footprint in the part's properties on the schematic.</p>
    </div>
  );
}

function BoardPanel({ board, set }: { sheet: Sheet; board: Board; set: (b: Board, label: string) => void }) {
  const o = board.outline;
  const t = TEMPLATES.find((x) => x.id === o.template);
  return (
    <div>
      <h3>Board</h3>
      <label class="field">Outline
        <select value={o.template} onChange={(e) => { const nb = newBoard((e.target as HTMLSelectElement).value); set({ ...board, outline: nb.outline }, `Outline: ${TEMPLATES.find((x) => x.id === nb.outline.template)?.name}`); }}>
          {TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      {o.template === 'custom' ? (
        <div class="row">
          <label class="field">Width (mm)<input type="number" min={10} max={500} step={0.5} value={o.w} onChange={(e) => set({ ...board, outline: { ...o, w: Math.max(10, Number((e.target as HTMLInputElement).value) || o.w) } }, 'Board width')} /></label>
          <label class="field">Height (mm)<input type="number" min={10} max={500} step={0.5} value={o.h} onChange={(e) => set({ ...board, outline: { ...o, h: Math.max(10, Number((e.target as HTMLInputElement).value) || o.h) } }, 'Board height')} /></label>
        </div>
      ) : <p class="small muted">{fmt(o.w)} × {fmt(o.h)}, {o.holes.length} mounting holes. {t?.note}</p>}
      <label class="field">Revision (silkscreen and file names)<input value={board.revision} maxLength={8} onChange={(e) => set({ ...board, revision: (e.target as HTMLInputElement).value.trim() || 'A' }, 'Board revision')} /></label>
    </div>
  );
}

function StartBoard({ sheet, onCreate }: { sheet: Sheet; onCreate: (b: Board) => void }) {
  const [tpl, setTpl] = useState('custom');
  const n = sheet.parts.filter((p) => footprintOf(p)).length;
  return (
    <div class="pcb-start">
      <h2>Make a board from this schematic</h2>
      <p>Every part of the schematic gets a footprint; you place them on the board and draw the tracks, or let the router do it (coming next). {n ? `${n} parts are ready.` : 'Draw a schematic first: it has no parts yet.'}</p>
      <label class="field">Outline
        <select value={tpl} onChange={(e) => setTpl((e.target as HTMLSelectElement).value)}>
          {TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.w} × {x.h} mm)</option>)}
        </select>
      </label>
      <button class="primary" disabled={!n} onClick={() => onCreate(newBoard(tpl))}>Start the board</button>
    </div>
  );
}
