// Schematic editor and simulator (UI-08, ED-08, ED-09, SIM-01..05, UI-19 for this view).
// Tools and shortcuts follow KiCad (A add part, W wire, L label, P power, G ground, R rotate,
// X mirror, Del delete); probing follows LTspice (click a wire for its voltage, a pin for its
// current); switches, push-buttons and potentiometers work on the sheet as in Falstad.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { CATEGORIES, searchSymbols, symbolOf, SYMBOLS, type Pt, type SymbolDef } from '../../eda/symbols';
import { GRID, annotate, newId, pinPositions, snap, snapPt, type Part, type Probe, type Rot, type Sheet, type SimSettings } from '../../eda/schematic';
import {
  addLabel, addWire, connectionAt, copySelection, deleteSelection, hitTest, inRect, isEmpty, mirrorSelection, moveSelection, noSelection, paste,
  placePart, rotateSelection, setProps, setRef, sheetBounds, type Clip, type Hit, type Selection,
} from '../../eda/editor';
import { connectivity, netAt } from '../../eda/connectivity';
import { erc, type ErcIssue } from '../../eda/erc';
import { buildNetlist, describeDiff, diffNetlist } from '../../eda/netlist';
import { sweepTargets } from '../../eda/simnet';
import { BJTS, DIODES, MOSFETS, OPAMPS, ZENERS } from '../../eda/models';
import { formatValue, parseValue } from '../../eda/units';
import { schematicSpice } from '../../sim/run';
import type { SimClient, SimOutcome } from '../../sim/client';
import { toCsv } from '../../sim/measure';
import { FIRST_CIRCUIT } from '../../eda/tutorial';
import { GfxEl, SheetContent, partTransform } from './SheetSvg';
import { Plot, type Trace } from './Plot';

export type Tool = 'select' | 'place' | 'wire' | 'label' | 'probe-v' | 'probe-i';

export interface EditorApi { run(cmd: string): void }

export const EDITOR_COMMANDS: { id: string; title: string; key: string }[] = [
  { id: 'add', title: 'Add part', key: 'A' },
  { id: 'wire', title: 'Draw wire', key: 'W' },
  { id: 'label', title: 'Add net label', key: 'L' },
  { id: 'power', title: 'Add power rail', key: 'P' },
  { id: 'ground', title: 'Add ground', key: 'G' },
  { id: 'probe-v', title: 'Voltage probe', key: 'V' },
  { id: 'probe-i', title: 'Current probe', key: 'I' },
  { id: 'rotate', title: 'Rotate', key: 'R' },
  { id: 'mirror', title: 'Mirror', key: 'X' },
  { id: 'delete', title: 'Delete selection', key: 'Del' },
  { id: 'copy', title: 'Copy', key: 'Ctrl+C' },
  { id: 'cut', title: 'Cut', key: 'Ctrl+X' },
  { id: 'paste', title: 'Paste', key: 'Ctrl+V' },
  { id: 'duplicate', title: 'Duplicate', key: 'Ctrl+D' },
  { id: 'select-all', title: 'Select all', key: 'Ctrl+A' },
  { id: 'fit', title: 'Zoom to fit', key: 'Home' },
  { id: 'zoom-in', title: 'Zoom in', key: '+' },
  { id: 'zoom-out', title: 'Zoom out', key: '−' },
  { id: 'annotate', title: 'Annotate (renumber references)', key: '' },
  { id: 'simulate', title: 'Simulate', key: 'F5' },
  { id: 'export-svg', title: 'Export schematic as SVG', key: '' },
  { id: 'export-png', title: 'Export schematic as PNG', key: '' },
  { id: 'export-spice', title: 'Export SPICE netlist', key: '' },
  { id: 'print', title: 'Print schematic', key: '' },
  { id: 'escape', title: 'Cancel tool / clear selection', key: 'Esc' },
];

interface Props {
  sheet: Sheet;
  name: string;
  /** Applies an edit as one undoable command. */
  commit: (next: Sheet, label: string) => void;
  sim: SimClient;
  exportFile: (name: string, data: string | Uint8Array, mime: string) => Promise<string>;
  apiRef: { current: EditorApi | null };
  announce: (s: string) => void;
  tutorial: boolean;
  onTutorialEnd: () => void;
  /** Changes when another document is opened: the view refits. */
  docKey: string;
  /** Short hint shown on the canvas (examples: what to try). */
  hint?: string;
}

type Drag =
  | { kind: 'move'; start: Pt; sel: Selection; base: Sheet; dx: number; dy: number; hit: Hit | null }
  | { kind: 'box'; a: Pt; b: Pt; add: boolean }
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'vprobe'; a: Pt; b: Pt };

const PROBE_COLOURS = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#8c564b', '#e377c2'];
const isTyping = (t: EventTarget | null) => !!t && ['INPUT', 'SELECT', 'TEXTAREA'].includes((t as HTMLElement).tagName);

export function SchematicView(props: Props) {
  const { sheet, commit, sim, announce } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [view, setView] = useState({ x: -300, y: -250, z: 1.4 });
  const userView = useRef(false);
  const [tool, setTool] = useState<Tool>('select');
  const [placing, setPlacing] = useState<{ sym: string; rot: Rot; mirror: boolean; props?: Record<string, string> } | null>(null);
  const [wirePts, setWirePts] = useState<Pt[]>([]);
  const [vFirst, setVFirst] = useState(false);
  const [sel, setSel] = useState<Selection>(noSelection());
  const [cursor, setCursor] = useState<Pt>({ x: 0, y: 0 });
  const [kbCursor, setKbCursor] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'props' | 'sim' | 'erc' | 'nets'>('props');
  const [result, setResult] = useState<SimOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState(true);
  const [hasRun, setHasRun] = useState(false);
  const [showValues, setShowValues] = useState(true);
  const [highlightNet, setHighlightNet] = useState<string | null>(null);
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [override, setOverride] = useState<Record<string, Record<string, string>>>({});
  const [selTrace, setSelTrace] = useState<string | null>(null);
  const [plotOpen, setPlotOpen] = useState(true);
  const [spiceText, setSpiceText] = useState<string | null>(null);
  const [tutStep, setTutStep] = useState(0);
  const [hintOpen, setHintOpen] = useState(true);
  const tutStart = useRef<Sheet>(sheet);
  const clip = useRef<Clip | null>(null);
  const spaceDown = useRef(false);

  // the sheet as shown: move preview, held push-buttons, slider previews
  const shown = useMemo(() => {
    let s = drag?.kind === 'move' ? moveSelection(drag.base, drag.sel, drag.dx, drag.dy) : sheet;
    if (held.size || Object.keys(override).length) {
      s = { ...s, parts: s.parts.map((p) => {
        const o = override[p.id];
        const h = held.has(p.id) ? { pressed: 'true' } : null;
        return o || h ? { ...p, props: { ...p.props, ...(o ?? {}), ...(h ?? {}) } } : p;
      }) };
    }
    return s;
  }, [sheet, drag, held, override]);
  const conn = useMemo(() => connectivity(shown), [shown]);
  const issues = useMemo(() => erc(shown, conn), [shown, conn]);
  const nErr = issues.filter((i) => i.severity === 'error').length, nWarn = issues.filter((i) => i.severity === 'warning').length;

  // ---- geometry helpers
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 900, h: el.clientHeight || 600 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const toWorldPt = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: view.x + (e.clientX - r.left) / view.z, y: view.y + (e.clientY - r.top) / view.z };
  };
  const fit = (s = sheet) => {
    const b = sheetBounds(s);
    if (!b) { setView({ x: -size.w / 2 / 1.4, y: -size.h / 2 / 1.4, z: 1.4 }); return; }
    const pad = 60;
    const z = Math.min(size.w / (b.x1 - b.x0 + 2 * pad), size.h / (b.y1 - b.y0 + 2 * pad), 3);
    setView({ x: (b.x0 + b.x1) / 2 - size.w / z / 2, y: (b.y0 + b.y1) / 2 - size.h / z / 2, z });
  };
  useEffect(() => { userView.current = false; fit(); setResult(null); setHasRun(false); setSel(noSelection()); setTutStep(0); tutStart.current = sheet; setHintOpen(true); svgRef.current?.focus({ preventScroll: true }); }, [props.docKey]);
  // until the user zooms or pans, the view follows the canvas size (the results panel takes room)
  useEffect(() => { if (!userView.current) fit(); }, [size.w, size.h]);
  const zoomBy = (k: number, at?: Pt) => {
    userView.current = true;
    const c = at ?? { x: view.x + size.w / view.z / 2, y: view.y + size.h / view.z / 2 };
    const z = Math.min(8, Math.max(0.2, view.z * k));
    setView({ z, x: c.x - (c.x - view.x) * (view.z / z), y: c.y - (c.y - view.y) * (view.z / z) });
  };

  // ---- edits
  const apply = (next: Sheet, label: string) => {
    const d = describeDiff(diffNetlist(buildNetlist(sheet), buildNetlist(next)));
    const full = d ? `${label}: ${d}` : label;
    userView.current = true; // from the first edit on, the view no longer refits by itself
    commit(next, full);
    announce(full);
  };
  const selOf = (s: Selection) => ({ parts: new Set(s.parts), wires: new Set(s.wires), labels: new Set(s.labels) });
  const selectedParts = sheet.parts.filter((p) => sel.parts.includes(p.id));

  const startPlace = (sym: string, props?: Record<string, string>) => {
    setPlacing({ sym, rot: 0, mirror: false, props });
    setTool('place');
    setWirePts([]);
    svgRef.current?.focus();
    announce(`Placing ${symbolOf(sym).name}: click on the sheet or press Enter. R rotates, X mirrors, Esc cancels.`);
  };
  const doPlace = (at: Pt, keep: boolean) => {
    if (!placing) return;
    const r = placePart(sheet, placing.sym, at, placing.rot, placing.mirror, placing.props);
    const ref = r.sheet.parts.find((p) => p.id === r.id)!.ref;
    apply(r.sheet, `Add ${ref}`);
    setSel({ ...noSelection(), parts: [r.id] });
    if (!keep) { setTool('select'); setPlacing(null); setTab('props'); }
  };
  const wireClick = (raw: Pt) => {
    const tol = 8 / view.z;
    const at = connectionAt(sheet, raw, tol) ?? snapPt(raw);
    if (!wirePts.length) { setWirePts([at]); announce('Wire started: click the next point; click a pin or wire to end; Esc stops.'); return; }
    const last = wirePts[wirePts.length - 1];
    if (last.x === at.x && last.y === at.y) { setWirePts([]); return; }
    const endsOnSomething = !!connectionAt(sheet, at, 0.01);
    apply(addWire(sheet, [last, at], vFirst), 'Wire');
    setWirePts(endsOnSomething ? [] : [at]);
  };
  const nextLabel = () => { for (let i = 1; ; i++) { const n = `NET${i}`; if (!sheet.labels.some((l) => l.name === n)) return n; } };
  const placeLabel = (at: Pt) => {
    const r = addLabel(sheet, nextLabel(), at);
    apply(r.sheet, 'Add label');
    setSel({ ...noSelection(), labels: [r.id] });
    setTool('select');
    setTab('props');
    requestAnimationFrame(() => valueRef.current?.focus());
  };
  const colourFor = () => PROBE_COLOURS[sheet.probes.length % PROBE_COLOURS.length];
  const addProbe = (p: Probe) => { apply({ ...sheet, probes: [...sheet.probes, p] }, 'Add probe'); setTab('sim'); setTool('select'); };
  const probeV = (a: Pt, b?: Pt) => {
    const na = netAt(sheet, conn, a) ? a : snapPt(a);
    if (!netAt(sheet, conn, na)) { announce('No wire or pin here: click on a wire or a pin to probe its voltage.'); return; }
    if (b && netAt(sheet, conn, b) && netAt(sheet, conn, b) !== netAt(sheet, conn, na)) addProbe({ id: newId('pr'), kind: 'vd', at: na, at2: b, colour: colourFor() });
    else addProbe({ id: newId('pr'), kind: 'v', at: na, colour: colourFor() });
  };
  const probeI = (at: Pt) => {
    const h = hitTest(sheet, at, 8 / view.z);
    if (h?.kind === 'pin') { const p = sheet.parts.find((x) => x.id === h.part)!; if (!symbolOf(p.sym).power) return addProbe({ id: newId('pr'), kind: 'i', part: h.part, pin: h.pin, colour: colourFor() }); }
    if (h?.kind === 'part') { const p = sheet.parts.find((x) => x.id === h.part)!; if (!symbolOf(p.sym).power) return addProbe({ id: newId('pr'), kind: 'i', part: h.part, pin: symbolOf(p.sym).pins[0].id, colour: colourFor() }); }
    announce('Click on a part pin to probe the current into it.');
  };
  const operate = (p: Part) => {
    const s = symbolOf(p.sym);
    if (s.interactive === 'toggle') apply(setProps(sheet, p.id, { closed: p.props.closed === 'true' ? 'false' : 'true' }), `${p.props.closed === 'true' ? 'Open' : 'Close'} ${p.ref}`);
    if (s.interactive === 'throw') apply(setProps(sheet, p.id, { position: p.props.position === 'B' ? 'A' : 'B' }), `Switch ${p.ref}`);
  };

  // ---- commands (keyboard, toolbar, command palette)
  const run = (cmd: string) => {
    const ss = sel;
    switch (cmd) {
      case 'add': setTool('select'); requestAnimationFrame(() => { searchRef.current?.focus(); searchRef.current?.select(); }); break;
      case 'wire': setTool('wire'); setWirePts([]); setPlacing(null); announce('Wire tool: click a start point.'); break;
      case 'label': setTool('label'); setPlacing(null); announce('Label tool: click on a wire.'); break;
      case 'power': startPlace('power'); break;
      case 'ground': startPlace('gnd'); break;
      case 'probe-v': setTool('probe-v'); setPlacing(null); announce('Voltage probe: click a wire or pin; drag from one net to another for the difference.'); break;
      case 'probe-i': setTool('probe-i'); setPlacing(null); announce('Current probe: click a part pin.'); break;
      case 'rotate':
        if (tool === 'place' && placing) setPlacing({ ...placing, rot: ((placing.rot + 1) % 4) as Rot });
        else if (!isEmpty(ss)) apply(rotateSelection(sheet, ss), 'Rotate');
        break;
      case 'mirror':
        if (tool === 'place' && placing) setPlacing({ ...placing, mirror: !placing.mirror });
        else if (!isEmpty(ss)) apply(mirrorSelection(sheet, ss), 'Mirror');
        break;
      case 'delete': if (!isEmpty(ss)) { apply(deleteSelection(sheet, ss), 'Delete'); setSel(noSelection()); } break;
      case 'copy': if (!isEmpty(ss)) { clip.current = copySelection(sheet, ss); announce('Copied'); } break;
      case 'cut': if (!isEmpty(ss)) { clip.current = copySelection(sheet, ss); apply(deleteSelection(sheet, ss), 'Cut'); setSel(noSelection()); } break;
      case 'paste': case 'duplicate': {
        const c = cmd === 'duplicate' ? (isEmpty(ss) ? null : copySelection(sheet, ss)) : clip.current;
        if (!c) break;
        const r = paste(sheet, c, 4 * GRID, 4 * GRID);
        apply(r.sheet, cmd === 'duplicate' ? 'Duplicate' : 'Paste');
        setSel(r.sel);
        break;
      }
      case 'select-all': setSel({ parts: sheet.parts.map((p) => p.id), wires: sheet.wires.map((w) => w.id), labels: sheet.labels.map((l) => l.id) }); break;
      case 'fit': userView.current = false; fit(); break;
      case 'zoom-in': zoomBy(1.25); break;
      case 'zoom-out': zoomBy(0.8); break;
      case 'annotate': apply(annotate(sheet), 'Annotate'); break;
      case 'simulate': void simulateNow(true); break;
      case 'export-svg': void exportSvg(); break;
      case 'export-png': void exportPng(); break;
      case 'export-spice': void exportSpice(); break;
      case 'print': window.print(); break;
      case 'escape':
        if (wirePts.length) setWirePts([]);
        else if (tool !== 'select') { setTool('select'); setPlacing(null); }
        else { setSel(noSelection()); setHighlightNet(null); }
        break;
    }
  };
  props.apiRef.current = { run };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    const step = (e.shiftKey ? 5 : 1) * GRID;
    if (ctrl) {
      const m: Record<string, string> = { c: 'copy', x: 'cut', v: 'paste', d: 'duplicate', a: 'select-all' };
      const c = m[k.toLowerCase()];
      if (c && !e.shiftKey) { stop(); run(c); }
      return;
    }
    if (e.altKey) return;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[k]) {
      stop();
      const [dx, dy] = arrows[k];
      if (tool === 'select' && !isEmpty(sel)) apply(moveSelection(sheet, sel, dx * step, dy * step), 'Move');
      else { setKbCursor(true); setCursor((c) => ({ x: snap(c.x) + dx * step, y: snap(c.y) + dy * step })); }
      return;
    }
    if (k === 'Enter') {
      if (tool === 'place') { stop(); doPlace(cursor, e.shiftKey); }
      else if (tool === 'wire') { stop(); wireClick(cursor); }
      else if (tool === 'label') { stop(); placeLabel(cursor); }
      else if (tool === 'probe-v') { stop(); probeV(cursor); }
      else if (tool === 'probe-i') { stop(); probeI(cursor); }
      else if (selectedParts.length === 1) { stop(); setTab('props'); requestAnimationFrame(() => valueRef.current?.focus()); }
      return;
    }
    if (k === ' ' && tool === 'select' && selectedParts.length === 1) {
      const p = selectedParts[0], s = symbolOf(p.sym);
      if (s.interactive === 'momentary') { stop(); if (!e.repeat) setHeld(new Set([p.id])); return; }
      if (s.interactive === 'toggle' || s.interactive === 'throw') { stop(); operate(p); return; }
    }
    if (k === ' ') { spaceDown.current = true; }
    if (k === 'Tab' && document.activeElement === svgRef.current) {
      stop();
      const parts = [...sheet.parts].sort((a, b) => a.y - b.y || a.x - b.x);
      if (!parts.length) return;
      const i = parts.findIndex((p) => p.id === sel.parts[0]);
      const n = parts[(i + (e.shiftKey ? -1 : 1) + parts.length) % parts.length];
      setSel({ ...noSelection(), parts: [n.id] });
      setCursor({ x: n.x, y: n.y });
      announce(`${n.ref}, ${symbolOf(n.sym).name} ${n.props[symbolOf(n.sym).value.key] ?? ''}`);
      return;
    }
    const keys: Record<string, string> = {
      a: 'add', w: 'wire', l: 'label', p: 'power', g: 'ground', v: 'probe-v', i: 'probe-i', r: 'rotate', x: 'mirror',
      Delete: 'delete', Backspace: 'delete', Home: 'fit', f: 'fit', '+': 'zoom-in', '=': 'zoom-in', '-': 'zoom-out', F5: 'simulate', Escape: 'escape',
    };
    const c = keys[k.length === 1 ? k.toLowerCase() : k];
    if (k === '/' && tool === 'wire') { stop(); setVFirst((x) => !x); return; }
    if (c) { stop(); run(c); }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ') { spaceDown.current = false; if (held.size) setHeld(new Set()); }
  };

  // ---- pointer
  const onPointerDown = (e: PointerEvent) => {
    // the element under the pointer may be re-rendered away (the placement ghost): keep the
    // browser from moving focus on the mousedown that follows, and focus the canvas here
    e.preventDefault();
    svgRef.current?.focus({ preventScroll: true });
    setKbCursor(false);
    const p = toWorldPt(e);
    if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceDown.current)) {
      e.preventDefault();
      userView.current = true;
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
      svgRef.current?.setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    svgRef.current?.setPointerCapture?.(e.pointerId);
    if (tool === 'place') { doPlace(p, e.shiftKey); return; }
    if (tool === 'wire') { wireClick(p); return; }
    if (tool === 'label') { placeLabel(connectionAt(sheet, p, 8 / view.z) ?? p); return; }
    if (tool === 'probe-v') { setDrag({ kind: 'vprobe', a: p, b: p }); return; }
    if (tool === 'probe-i') { probeI(p); return; }
    const h = hitTest(sheet, p, 6 / view.z);
    if (h?.kind === 'pin') {
      // a pin end starts a wire (EasyEDA/Fritzing style)
      setTool('wire');
      setWirePts([h.at]);
      announce('Wire started at a pin: click the next point.');
      return;
    }
    if (h?.kind === 'probe') { setSelTrace(h.probe); setTab('sim'); return; }
    if (h) {
      const id = h.kind === 'part' ? h.part : h.kind === 'wire' ? h.wire : h.label;
      const field = h.kind === 'part' ? 'parts' : h.kind === 'wire' ? 'wires' : 'labels';
      let next = sel;
      if (!(sel[field] as string[]).includes(id)) next = e.shiftKey ? { ...sel, [field]: [...sel[field], id] } : { ...noSelection(), [field]: [id] };
      setSel(next);
      if (h.kind === 'wire') setHighlightNet(conn.wireNet.get(h.wire) ?? null);
      else if (h.kind === 'part') setHighlightNet(null);
      if (h.kind === 'part') {
        const part = sheet.parts.find((x) => x.id === h.part)!;
        if (symbolOf(part.sym).interactive === 'momentary') setHeld(new Set([part.id]));
        setTab('props');
      }
      setDrag({ kind: 'move', start: snapPt(p), sel: next, base: sheet, dx: 0, dy: 0, hit: h });
      return;
    }
    setDrag({ kind: 'box', a: p, b: p, add: e.shiftKey });
    if (!e.shiftKey) { setSel(noSelection()); setHighlightNet(null); }
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = toWorldPt(e);
    setCursor(tool === 'select' ? p : snapPt(p));
    if (!drag) return;
    if (drag.kind === 'pan') setView((v) => ({ ...v, x: drag.vx - (e.clientX - drag.sx) / v.z, y: drag.vy - (e.clientY - drag.sy) / v.z }));
    else if (drag.kind === 'move') { const s = snapPt(p); setDrag({ ...drag, dx: s.x - drag.start.x, dy: s.y - drag.start.y }); }
    else if (drag.kind === 'box') setDrag({ ...drag, b: p });
    else if (drag.kind === 'vprobe') setDrag({ ...drag, b: p });
  };
  const onPointerUp = () => {
    const d = drag;
    setDrag(null);
    if (held.size && !spaceDown.current) setHeld(new Set());
    if (!d) return;
    if (d.kind === 'move') {
      if (d.dx || d.dy) apply(moveSelection(d.base, d.sel, d.dx, d.dy), 'Move');
      else if (d.hit?.kind === 'part' && hasRun) {
        const part = sheet.parts.find((x) => x.id === (d.hit as { part: string }).part);
        if (part) operate(part);
      }
    } else if (d.kind === 'box') {
      const r = inRect(sheet, d.a, d.b);
      setSel(d.add ? { parts: [...new Set([...sel.parts, ...r.parts])], wires: [...new Set([...sel.wires, ...r.wires])], labels: [...new Set([...sel.labels, ...r.labels])] } : r);
    } else if (d.kind === 'vprobe') {
      const moved = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) > 10 / view.z;
      probeV(d.a, moved ? d.b : undefined);
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = toWorldPt(e);
    if (hasRun) {
      const h = hitTest(sheet, p, 4 / view.z);
      const part = h?.kind === 'part' ? sheet.parts.find((x) => x.id === h.part) : null;
      if (part && symbolOf(part.sym).interactive === 'pot') {
        const pos = Math.min(100, Math.max(0, (parseValue(part.props.position) ?? 50) + (e.deltaY < 0 ? 5 : -5)));
        apply(setProps(sheet, part.id, { position: String(pos) }), `${part.ref} wiper ${pos} %`);
        return;
      }
    }
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, p);
  };
  const onDblClick = (e: MouseEvent) => {
    if (tool === 'wire') { setWirePts([]); return; }
    const h = hitTest(sheet, toWorldPt(e), 6 / view.z);
    if (h?.kind === 'part' || h?.kind === 'label') { setTab('props'); requestAnimationFrame(() => valueRef.current?.focus()); }
  };

  // ---- simulation
  const simulateNow = async (manual: boolean) => {
    setRunning(true);
    const r = await sim.run(shown);
    setRunning(false);
    if (!r) return;
    setResult(r);
    setHasRun(true);
    if (manual) {
      if ('error' in r) { announce(`Simulation failed: ${r.error}`); setTab('sim'); }
      else announce(`Simulated in ${r.ms.toFixed(0)} ms`);
    }
  };
  useEffect(() => {
    if (!live || !hasRun || (drag?.kind === 'move' && (drag.dx || drag.dy))) return;
    const t = setTimeout(() => void simulateNow(false), sheet.sim.type === 'op' ? 60 : 250);
    return () => clearTimeout(t);
  }, [shown, live]);

  const ok = result && !('error' in result) ? result : null;
  const op = useMemo(() => {
    if (!ok) return null;
    const pick = (o: Record<string, number[]>, k: number) => Object.fromEntries(Object.entries(o).map(([n, v]) => [n, v[k]]));
    const k = ok.analysis === 'op' ? 0 : ok.x.length - 1;
    return { v: pick(ok.v, k), i: pick(ok.i, k), final: ok.analysis !== 'op' };
  }, [ok]);
  const glow = useMemo(() => {
    const m = new Map<string, number>();
    if (!op || ok?.analysis === 'ac') return m;
    for (const p of shown.parts) if (p.sym === 'led') { const i = op.i[`${p.ref}.2`] ?? 0; m.set(p.id, Math.min(1, Math.max(0, i / 0.02))); }
    return m;
  }, [op, shown]);

  // probes → traces
  const probeName = (pr: Probe): string => {
    if (pr.kind === 'i') { const p = shown.parts.find((x) => x.id === pr.part); return p ? `I(${p.ref}.${pr.pin})` : 'I(?)'; }
    const a = netAt(shown, conn, pr.at) ?? '?';
    if (pr.kind === 'vd') return `V(${a}, ${netAt(shown, conn, pr.at2) ?? '?'})`;
    return `V(${a})`;
  };
  const probeLabels = useMemo(() => new Map(shown.probes.map((p) => [p.id, probeName(p)])), [shown, conn]);
  const traces: Trace[] = useMemo(() => {
    if (!ok || ok.analysis === 'op') return [];
    const out: Trace[] = [];
    const ac = ok.analysis === 'ac';
    const series = (pr: Probe): { re: number[]; im?: number[]; unit: string } | null => {
      if (pr.kind === 'i') { const p = shown.parts.find((x) => x.id === pr.part); const k = p ? `${p.ref}.${pr.pin}` : ''; return ok.i[k] ? { re: ok.i[k], im: ok.ii?.[k], unit: 'A' } : null; }
      const a = netAt(shown, conn, pr.at);
      if (!a || !ok.v[a]) return null;
      if (pr.kind === 'v') return { re: ok.v[a], im: ok.vi?.[a], unit: 'V' };
      const b = netAt(shown, conn, pr.at2);
      if (!b || !ok.v[b]) return null;
      return { re: ok.v[a].map((v, j) => v - ok.v[b][j]), im: ok.vi ? ok.vi[a].map((v, j) => v - ok.vi![b][j]) : undefined, unit: 'V' };
    };
    let probes = shown.probes;
    if (!probes.length) {
      // nothing probed: show the named nets so a first run shows something
      probes = conn.nets.filter((n) => n.named && n.name !== 'GND').slice(0, 6).map((n, k) => {
        const w = shown.wires.find((x) => n.wires.includes(x.id));
        const at = w ? w.a : (() => { const [r, pin] = n.pins[0].split('.'); const part = shown.parts.find((p) => p.ref === r)!; return pinPositions(part).find((q) => q.pin === pin)!.at; })();
        return { id: `auto${k}`, kind: 'v', at, colour: PROBE_COLOURS[k % PROBE_COLOURS.length] } as Probe;
      });
    }
    for (const pr of probes) {
      const s = series(pr);
      if (!s) continue;
      const name = probeName(pr);
      if (ac && s.im) {
        out.push({ id: pr.id, name: `|${name}|`, colour: pr.colour, unit: 'dB', y: s.re.map((r, j) => 20 * Math.log10(Math.hypot(r, s.im![j]) || 1e-30)) });
        out.push({ id: `${pr.id}:ph`, name: `∠${name}`, colour: pr.colour, unit: '°', dashed: true, y: s.re.map((r, j) => (Math.atan2(s.im![j], r) * 180) / Math.PI) });
      } else out.push({ id: pr.id, name, colour: pr.colour, unit: s.unit, y: s.re });
    }
    return out;
  }, [ok, shown, conn]);

  // ---- exports (UI-19, SIM-04)
  const baseName = (props.name || 'schematic').replace(/[^\w.-]+/g, '_');
  const svgString = (): string => {
    const src = svgRef.current!;
    const b = sheetBounds(sheet) ?? { x0: -100, y0: -100, x1: 100, y1: 100 };
    const pad = 30;
    const clone = src.cloneNode(true) as SVGSVGElement;
    // inline the computed styles, drop the screen-only layers
    const a = src.querySelectorAll('*'), c = clone.querySelectorAll('*');
    const keep = ['stroke', 'fill', 'stroke-width', 'font-size', 'font-family', 'font-weight', 'opacity', 'stroke-dasharray', 'text-anchor', 'stroke-linecap'];
    a.forEach((el, k) => {
      const cs = getComputedStyle(el);
      const st = keep.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
      (c[k] as Element).setAttribute('style', st);
    });
    clone.querySelectorAll('.no-export, .grid-bg, .ghost, .sel-box, .kb-cursor').forEach((el) => el.remove());
    clone.setAttribute('viewBox', `${b.x0 - pad} ${b.y0 - pad} ${b.x1 - b.x0 + 2 * pad} ${b.y1 - b.y0 + 2 * pad}`);
    clone.setAttribute('width', String(Math.round((b.x1 - b.x0 + 2 * pad) * 2)));
    clone.setAttribute('height', String(Math.round((b.y1 - b.y0 + 2 * pad) * 2)));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.removeAttribute('class');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(b.x0 - pad)); bg.setAttribute('y', String(b.y0 - pad));
    bg.setAttribute('width', String(b.x1 - b.x0 + 2 * pad)); bg.setAttribute('height', String(b.y1 - b.y0 + 2 * pad));
    bg.setAttribute('fill', getComputedStyle(src).getPropertyValue('--sch-bg') || '#ffffff');
    clone.insertBefore(bg, clone.firstChild);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
  };
  const report = async (p: Promise<string>) => { try { announce(await p); } catch (e) { announce(`Export failed: ${(e as Error).message}`); } };
  const exportSvg = async () => report(props.exportFile(`${baseName}.svg`, svgString(), 'image/svg+xml'));
  const exportPng = async () => {
    const svg = svgString();
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('could not render the SVG')); img.src = url; }).catch((e) => { announce(String(e)); });
    const cv = document.createElement('canvas');
    cv.width = img.width || 1600; cv.height = img.height || 1000;
    cv.getContext('2d')!.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const blob: Blob | null = await new Promise((res) => cv.toBlob(res, 'image/png'));
    if (!blob) { announce('PNG export failed'); return; }
    await report(props.exportFile(`${baseName}.png`, new Uint8Array(await blob.arrayBuffer()), 'image/png'));
  };
  const exportSpice = async () => {
    const t = schematicSpice(sheet, props.name || 'EmbedForge schematic');
    setSpiceText(t);
    setTab('nets');
    await report(props.exportFile(`${baseName}.cir`, t, 'text/plain'));
  };
  const exportCsv = async () => {
    if (!ok) return;
    await report(props.exportFile(`${baseName}-${ok.analysis}.csv`, toCsv(`${ok.xLabel || 'x'} (${ok.xUnit})`, ok.x, traces.map((t) => ({ name: `${t.name} (${t.unit})`, y: t.y }))), 'text/csv'));
  };

  // ---- tutorial
  useEffect(() => {
    if (!props.tutorial) return;
    const st = FIRST_CIRCUIT[tutStep];
    if (st && st.done(sheet, result, tutStart.current)) { tutStart.current = sheet; setTutStep((s) => s + 1); announce(`Tutorial: ${st.title} done`); }
  }, [sheet, result, props.tutorial, tutStep]);

  // ---- render helpers
  const vb = `${view.x} ${view.y} ${size.w / view.z} ${size.h / view.z}`;
  const ghost = (() => {
    if (tool === 'place' && placing) {
      const s = symbolOf(placing.sym);
      const p = { x: snap(cursor.x), y: snap(cursor.y), rot: placing.rot, mirror: placing.mirror };
      return <g class="ghost" transform={partTransform(p)}>{s.gfx({ ...Object.fromEntries([[s.value.key, s.value.default]]), ...(placing.props ?? {}) }).map((g, i) => <GfxEl key={i} g={g} />)}</g>;
    }
    if (tool === 'wire' && wirePts.length) {
      const last = wirePts[wirePts.length - 1];
      const at = connectionAt(sheet, cursor, 8 / view.z) ?? snapPt(cursor);
      const m = vFirst ? { x: last.x, y: at.y } : { x: at.x, y: last.y };
      return <polyline class="ghost wire-ghost" points={`${last.x},${last.y} ${m.x},${m.y} ${at.x},${at.y}`} fill="none" />;
    }
    if (drag?.kind === 'vprobe') return <line class="ghost" x1={drag.a.x} y1={drag.a.y} x2={drag.b.x} y2={drag.b.y} stroke-dasharray="4 3" />;
    return null;
  })();

  const filtered = query.trim() ? searchSymbols(query) : SYMBOLS;
  const toolBtn = (t: Tool | 'power' | 'ground', label: string, key: string, onClick: () => void) => (
    <button aria-pressed={t === tool || (t === 'power' && placing?.sym === 'power') || (t === 'ground' && placing?.sym === 'gnd')} title={`${label} (${key})`} onClick={onClick}>{label} <kbd>{key}</kbd></button>
  );
  const status = !result ? null : 'error' in result ? <span class="s-fail">{result.error}</span> : <span class="s-pass">Simulated in {result.ms.toFixed(0)} ms</span>;

  return (
    <div class="sch" onKeyDown={onKeyDown as never} onKeyUp={onKeyUp as never}>
      <div class="sch-tools" role="toolbar" aria-label="Schematic tools">
        {toolBtn('select', 'Select', 'Esc', () => run('escape'))}
        {toolBtn('place', 'Add part', 'A', () => run('add'))}
        {toolBtn('wire', 'Wire', 'W', () => run('wire'))}
        {toolBtn('label', 'Label', 'L', () => run('label'))}
        {toolBtn('power', 'Power', 'P', () => run('power'))}
        {toolBtn('ground', 'Ground', 'G', () => run('ground'))}
        <span class="sep" />
        <button title="Rotate (R)" onClick={() => run('rotate')}>⟳ Rotate <kbd>R</kbd></button>
        <button title="Mirror (X)" onClick={() => run('mirror')}>⇋ Mirror <kbd>X</kbd></button>
        <button title="Delete (Del)" onClick={() => run('delete')} disabled={isEmpty(sel)}>Delete</button>
        <span class="sep" />
        {toolBtn('probe-v', 'V probe', 'V', () => run('probe-v'))}
        {toolBtn('probe-i', 'I probe', 'I', () => run('probe-i'))}
        <button class="primary" title="Simulate (F5)" onClick={() => run('simulate')} disabled={running}>{running ? '… Simulating' : '▶ Simulate'} <kbd>F5</kbd></button>
        <span class="sep" />
        <button title="Zoom to fit (Home)" onClick={() => run('fit')}>Fit</button>
        <button title="Zoom in (+)" aria-label="Zoom in" onClick={() => run('zoom-in')}>+</button>
        <button title="Zoom out (−)" aria-label="Zoom out" onClick={() => run('zoom-out')}>−</button>
        <details class="menu">
          <summary>Export</summary>
          <div class="menu-list">
            <button onClick={() => run('export-svg')}>Schematic as SVG</button>
            <button onClick={() => run('export-png')}>Schematic as PNG</button>
            <button onClick={() => run('export-spice')}>SPICE netlist (.cir)</button>
            <button onClick={() => void exportCsv()} disabled={!ok || ok.analysis === 'op'}>Waveforms as CSV</button>
            <button onClick={() => run('print')}>Print…</button>
          </div>
        </details>
        <button onClick={() => run('annotate')} title="Renumber references by position">Annotate</button>
      </div>
      <div class="sch-body">
        <aside class="sch-lib" aria-label="Part library">
          <input ref={searchRef} type="search" placeholder="Search parts (A)…" aria-label="Search parts" value={query}
                 onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && filtered[0]) { e.preventDefault(); startPlace(filtered[0].id); setCursor({ x: snap(view.x + size.w / view.z / 2), y: snap(view.y + size.h / view.z / 2) }); setKbCursor(true); }
                   if (e.key === 'Escape') { e.stopPropagation(); setQuery(''); svgRef.current?.focus(); }
                 }} />
          {CATEGORIES.map((cat) => {
            const list = filtered.filter((s) => s.category === cat);
            if (!list.length) return null;
            return (
              <section key={cat}>
                <h3>{cat}</h3>
                <div class="lib-grid">
                  {list.map((s) => <LibButton key={s.id} s={s} active={placing?.sym === s.id} onPick={() => startPlace(s.id)} />)}
                </div>
              </section>
            );
          })}
          {!filtered.length && <p class="muted small">No part matches "{query}".</p>}
        </aside>
        <div class="sch-canvas-wrap">
          <svg ref={svgRef} class={`sch-canvas tool-${tool}`} viewBox={vb} tabindex={0} role="application"
               aria-label="Schematic canvas. Tab selects parts; arrow keys move; Enter places or edits; letters choose tools (A, W, L, P, G, V, I, R, X)."
               onPointerDown={onPointerDown as never} onPointerMove={onPointerMove as never} onPointerUp={onPointerUp as never}
               onWheel={onWheel as never} onDblClick={onDblClick as never} onContextMenu={(e) => { e.preventDefault(); if (tool === 'wire') setWirePts([]); }}>
            <defs>
              <pattern id="sch-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse"><circle cx={0} cy={0} r={0.7} class="grid-dot" /></pattern>
            </defs>
            <rect class="grid-bg" x={view.x} y={view.y} width={size.w / view.z} height={size.h / view.z} fill={view.z > 0.5 ? 'url(#sch-grid)' : 'none'} />
            <SheetContent sheet={shown} view={{ conn, selected: selOf(sel), highlightNet, op: op && ok?.analysis === 'op' ? op : null, showValues, erc: issues, glow, probeLabels }} />
            {ghost}
            {drag?.kind === 'box' && <rect class="sel-box" x={Math.min(drag.a.x, drag.b.x)} y={Math.min(drag.a.y, drag.b.y)} width={Math.abs(drag.b.x - drag.a.x)} height={Math.abs(drag.b.y - drag.a.y)} />}
            {(kbCursor || tool !== 'select') && <g class="kb-cursor"><line x1={cursor.x - 6} y1={cursor.y} x2={cursor.x + 6} y2={cursor.y} /><line x1={cursor.x} y1={cursor.y - 6} x2={cursor.x} y2={cursor.y + 6} /></g>}
          </svg>
          {!sheet.parts.length && !sheet.wires.length && (
            <div class="sch-empty" role="note">
              <strong>The sheet is empty.</strong>
              <span>Pick a part on the left (or press <kbd>A</kbd>), then click here to place it. Draw wires with <kbd>W</kbd>. Add <kbd>G</kbd> ground, then <kbd>F5</kbd> to simulate.</span>
            </div>
          )}
          <div class="sch-status small" aria-hidden="true">
            {Math.round(cursor.x)}, {Math.round(cursor.y)} · zoom {Math.round(view.z * 100)} % · {tool === 'wire' ? `wire (${vFirst ? 'vertical' : 'horizontal'} first, / switches)` : tool}
          </div>
          {props.tutorial && <TutorialCard step={tutStep} onEnd={props.onTutorialEnd} />}
          {!props.tutorial && props.hint && hintOpen && (
            <div class="tutorial hint" role="note" aria-label="Example hint">
              <p><strong>Try this:</strong> {props.hint}</p>
              <button onClick={() => setHintOpen(false)}>Close</button>
            </div>
          )}
        </div>
        <aside class="sch-side" aria-label="Properties and simulation">
          <div role="tablist" class="tabs">
            {([['props', 'Properties'], ['sim', 'Simulation'], ['erc', `Checks${nErr + nWarn ? ` (${nErr + nWarn})` : ''}`], ['nets', 'Netlist']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} class={id === 'erc' && nErr ? 'has-err' : ''}>{label}</button>
            ))}
          </div>
          {tab === 'props' && <Inspector sheet={sheet} sel={sel} conn={conn} op={op} apply={apply} valueRef={valueRef} setOverride={setOverride} onProbe={(p) => addProbe(p)} colour={colourFor()} />}
          {tab === 'sim' && (
            <SimPanel sheet={sheet} apply={apply} running={running} status={status} live={live} setLive={setLive} showValues={showValues} setShowValues={setShowValues}
                      run={() => run('simulate')} result={result} op={op} conn={conn} probeLabels={probeLabels} setTool={setTool} held={held} setHeld={setHeld}
                      onRemoveProbe={(id) => apply({ ...sheet, probes: sheet.probes.filter((p) => p.id !== id) }, 'Remove probe')} />
          )}
          {tab === 'erc' && <ErcPanel issues={issues} onPick={(i) => {
            const ids = sheet.parts.filter((p) => i.refs.includes(p.ref)).map((p) => p.id);
            setSel({ ...noSelection(), parts: ids });
            if (i.at) setView((v) => ({ ...v, x: i.at!.x - size.w / v.z / 2, y: i.at!.y - size.h / v.z / 2 }));
          }} />}
          {tab === 'nets' && <NetsPanel conn={conn} highlight={highlightNet} setHighlight={setHighlightNet} spice={spiceText} onSpice={() => setSpiceText(schematicSpice(sheet, props.name))} />}
        </aside>
      </div>
      {ok && ok.analysis !== 'op' && (
        <section class="sch-plot" aria-label="Waveform viewer">
          <div class="row">
            <h3 class="pane-title">Results · {ok.analysis === 'tran' ? 'Transient' : ok.analysis === 'ac' ? 'AC sweep' : 'DC sweep'}</h3>
            <button onClick={() => setPlotOpen((x) => !x)} aria-expanded={plotOpen}>{plotOpen ? 'Hide' : 'Show'}</button>
            {!sheet.probes.length && <span class="small muted">Showing the named nets. Press V and click a wire to choose what to plot.</span>}
          </div>
          {plotOpen && (traces.length ? (
            <Plot x={ok.x} xLabel={ok.xLabel} xUnit={ok.xUnit} log={ok.analysis === 'ac'} traces={traces} selected={selTrace} onSelect={setSelTrace}
                  onRemove={(id) => { const pid = id.replace(/:ph$/, ''); if (sheet.probes.some((p) => p.id === pid)) apply({ ...sheet, probes: sheet.probes.filter((p) => p.id !== pid) }, 'Remove probe'); }}
                  onExportCsv={() => void exportCsv()} height={window.innerHeight < 900 ? 120 : 170} />
          ) : <p class="muted">Nothing to plot: add a probe (V, then click a wire).</p>)}
        </section>
      )}
    </div>
  );
}

function LibButton({ s, active, onPick }: { s: SymbolDef; active: boolean; onPick: () => void }) {
  const props = Object.fromEntries([[s.value.key, s.value.default]]);
  const xs = s.pins.map((p) => p.x), ys = s.pins.map((p) => p.y);
  const x0 = Math.min(-20, ...xs) - 6, x1 = Math.max(20, ...xs) + 6, y0 = Math.min(-20, ...ys) - 6, y1 = Math.max(20, ...ys) + 6;
  return (
    <button class={`lib-item${active ? ' is-active' : ''}`} onClick={onPick} title={s.description} aria-pressed={active}>
      <svg viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`} width={44} height={34} aria-hidden="true">{s.gfx(props).map((g, i) => <GfxEl key={i} g={g} />)}</svg>
      <span>{s.name}</span>
    </button>
  );
}

function TutorialCard({ step, onEnd }: { step: number; onEnd: () => void }) {
  const st = FIRST_CIRCUIT[step];
  return (
    <div class="tutorial" role="region" aria-label="Tutorial" aria-live="polite">
      {st ? (
        <>
          <div class="row"><strong>{st.title}</strong><span class="small muted">step {step + 1} of {FIRST_CIRCUIT.length}</span></div>
          <p>{st.text}</p>
          <p class="small muted">{st.hint}</p>
          <button onClick={onEnd}>End tutorial</button>
        </>
      ) : (
        <>
          <strong>Well done: your first circuit works.</strong>
          <p>Next: open an example from the start screen, or try the AC and transient analyses in the Simulation tab.</p>
          <button onClick={onEnd}>Close</button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------- panels

interface InspectorProps {
  sheet: Sheet; sel: Selection; conn: ReturnType<typeof connectivity>;
  op: { v: Record<string, number>; i: Record<string, number>; final: boolean } | null;
  apply: (s: Sheet, label: string) => void;
  valueRef: { current: HTMLInputElement | HTMLSelectElement | null };
  setOverride: (f: (o: Record<string, Record<string, string>>) => Record<string, Record<string, string>>) => void;
  onProbe: (p: Probe) => void;
  colour: string;
}

function modelNote(sym: string, value: string): string {
  const lists: Record<string, { name: string; note: string }[]> = {
    diode: DIODES, zener: ZENERS, npn: BJTS, pnp: BJTS, nmos: MOSFETS, pmos: MOSFETS, opamp: OPAMPS,
  };
  return lists[sym]?.find((m) => m.name === value)?.note ?? '';
}

function Inspector({ sheet, sel, conn, op, apply, valueRef, setOverride, onProbe, colour }: InspectorProps) {
  const parts = sheet.parts.filter((p) => sel.parts.includes(p.id));
  if (parts.length === 1) return <PartInspector key={parts[0].id} part={parts[0]} sheet={sheet} conn={conn} op={op} apply={apply} valueRef={valueRef} setOverride={setOverride} onProbe={onProbe} colour={colour} />;
  if (sel.labels.length === 1 && !parts.length && !sel.wires.length) {
    const l = sheet.labels.find((x) => x.id === sel.labels[0])!;
    return (
      <div class="inspector">
        <h3>Net label</h3>
        <label>Name <input ref={valueRef as never} value={l.name} onChange={(e) => {
          const v = (e.target as HTMLInputElement).value.trim();
          if (v && v !== l.name) apply({ ...sheet, labels: sheet.labels.map((x) => (x.id === l.id ? { ...x, name: v } : x)) }, `Rename label to ${v}`);
        }} /></label>
        <p class="small muted">All labels with the same name are connected. Name a supply rail like +5V to make it a rail.</p>
      </div>
    );
  }
  if (sel.wires.length && !parts.length) {
    const nets = [...new Set(sel.wires.map((w) => conn.wireNet.get(w)).filter(Boolean))] as string[];
    const w = sheet.wires.find((x) => x.id === sel.wires[0]);
    return (
      <div class="inspector">
        <h3>{sel.wires.length === 1 ? 'Wire' : `${sel.wires.length} wires`}</h3>
        <p>Net: <strong>{nets.join(', ') || 'not connected'}</strong></p>
        {op && nets[0] && op.v[nets[0]] !== undefined && <p>Voltage{op.final ? ' (end of run)' : ''}: <strong>{formatValue(op.v[nets[0]], 'V')}</strong></p>}
        {w && <button onClick={() => onProbe({ id: newId('pr'), kind: 'v', at: { x: snap((w.a.x + w.b.x) / 2), y: snap((w.a.y + w.b.y) / 2) }, colour })}>Probe this net's voltage</button>}
      </div>
    );
  }
  if (parts.length > 1 || sel.wires.length || sel.labels.length) {
    return <div class="inspector"><h3>{parts.length} parts, {sel.wires.length} wires, {sel.labels.length} labels selected</h3><p class="small muted">R rotates, X mirrors, Del deletes, Ctrl+D duplicates, arrow keys move.</p></div>;
  }
  return (
    <div class="inspector">
      <h3>Nothing selected</h3>
      <p class="small">Click a part, wire or label to see and edit it. Drag on empty space to select an area.</p>
      <table class="keys small">
        <tbody>
          {EDITOR_COMMANDS.filter((c) => c.key).slice(0, 18).map((c) => <tr key={c.id}><td><kbd>{c.key}</kbd></td><td>{c.title}</td></tr>)}
          <tr><td><kbd>Wheel</kbd></td><td>Zoom; right or middle drag pans</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function PartInspector({ part, sheet, conn, op, apply, valueRef, setOverride, onProbe, colour }: Omit<InspectorProps, 'sel'> & { part: Part }) {
  const s = symbolOf(part.sym);
  const [refText, setRefText] = useState(part.ref);
  useEffect(() => setRefText(part.ref), [part.ref]);
  const field = (d: SymbolDef['value'], main: boolean): JSX.Element => {
    const v = part.props[d.key] ?? '';
    const set = (nv: string) => { if (nv !== v) apply(setProps(sheet, part.id, { [d.key]: nv }), `${part.ref} ${d.label.toLowerCase()} = ${nv}${d.unit && parseValue(nv) !== null ? d.unit : ''}`); };
    const id = `f-${part.id}-${d.key}`;
    if (d.kind === 'select') {
      const note = modelNote(part.sym, v);
      return (
        <div class="field" key={d.key}>
          <label for={id}>{d.label}</label>
          <select id={id} ref={main ? (valueRef as never) : undefined} value={v} onChange={(e) => set((e.target as HTMLSelectElement).value)}>
            {d.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {note && <span class="small muted">{note}</span>}
        </div>
      );
    }
    if (d.kind === 'bool') {
      return (
        <div class="field" key={d.key}>
          <label><input type="checkbox" ref={main ? (valueRef as never) : undefined} checked={v === 'true'} onChange={(e) => set((e.target as HTMLInputElement).checked ? 'true' : 'false')} /> {d.label}</label>
        </div>
      );
    }
    if (d.key === 'position' && s.interactive === 'pot') {
      return (
        <div class="field" key={d.key}>
          <label for={id}>{d.label}: {v} %</label>
          <input id={id} type="range" min={0} max={100} step={1} value={parseValue(v) ?? 50}
                 onInput={(e) => { const nv = (e.target as HTMLInputElement).value; setOverride((o) => ({ ...o, [part.id]: { position: nv } })); }}
                 onChange={(e) => { const nv = (e.target as HTMLInputElement).value; setOverride((o) => { const n = { ...o }; delete n[part.id]; return n; }); set(nv); }} />
          {d.help && <span class="small muted">{d.help}</span>}
        </div>
      );
    }
    return <ValueField key={d.key} id={id} def={d} value={v} onSet={set} inputRef={main ? valueRef : undefined} />;
  };
  const pins = pinPositions(part);
  return (
    <div class="inspector">
      <h3>{s.name}</h3>
      {!s.power && <p class="badge" title="ED-08: generic library parts are not catalogue parts until the parts catalogue (Increment 6)">not a standard part</p>}
      <p class="small muted">{s.description}</p>
      {!s.power && (
        <div class="field">
          <label for={`ref-${part.id}`}>Reference</label>
          <input id={`ref-${part.id}`} value={refText} onInput={(e) => setRefText((e.target as HTMLInputElement).value)}
                 onChange={() => {
                   const r = refText.trim();
                   if (!r || r === part.ref) { setRefText(part.ref); return; }
                   if (sheet.parts.some((p) => p.ref === r && p.id !== part.id)) { setRefText(part.ref); return; }
                   apply(setRef(sheet, part.id, r), `Rename ${part.ref} to ${r}`);
                 }} />
        </div>
      )}
      {field(s.value, true)}
      {s.params.map((p) => field(p, false))}
      {op && !s.power && (
        <>
          <h4>{op.final ? 'At the end of the run' : 'Operating point'}</h4>
          <table class="small">
            <thead><tr><th>Pin</th><th>Voltage</th><th>Current in</th></tr></thead>
            <tbody>
              {pins.map((pp) => {
                const net = conn.pinNet.get(`${part.ref}.${pp.pin}`);
                const v = net ? op.v[net] : undefined;
                const i = op.i[`${part.ref}.${pp.pin}`];
                return <tr key={pp.pin}><td>{pp.pin} ({pp.name})</td><td>{v === undefined ? '—' : formatValue(v, 'V')}</td><td>{i === undefined ? '—' : formatValue(i, 'A')}</td></tr>;
              })}
            </tbody>
          </table>
          {pins.length === 2 && (() => {
            const a = conn.pinNet.get(`${part.ref}.${pins[0].pin}`), b = conn.pinNet.get(`${part.ref}.${pins[1].pin}`);
            const i = op.i[`${part.ref}.${pins[0].pin}`];
            if (!a || !b || i === undefined) return null;
            const p = (op.v[a] - op.v[b]) * i;
            return <p class="small">Power: <strong>{formatValue(Math.abs(p), 'W')}</strong> {p < 0 ? '(delivered)' : '(absorbed)'}</p>;
          })()}
        </>
      )}
      {!s.power && <button onClick={() => onProbe({ id: newId('pr'), kind: 'i', part: part.id, pin: s.pins[0].id, colour })}>Probe the current into pin {s.pins[0].id}</button>}
    </div>
  );
}

function ValueField({ id, def, value, onSet, inputRef }: { id: string; def: SymbolDef['value']; value: string; onSet: (v: string) => void; inputRef?: { current: unknown } }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const parsed = def.kind === 'value' ? parseValue(text) : null;
  const bad = def.kind === 'value' && text.trim() !== '' && parsed === null;
  return (
    <div class="field">
      <label for={id}>{def.label}{def.unit ? ` (${def.unit})` : ''}</label>
      <input id={id} ref={inputRef as never} value={text} aria-invalid={bad} aria-describedby={`${id}-h`}
             onInput={(e) => setText((e.target as HTMLInputElement).value)}
             onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setText(value); (e.target as HTMLInputElement).blur(); } }}
             onChange={() => { if (!bad && text.trim()) onSet(text.trim()); else setText(value); }} />
      <span id={`${id}-h`} class={`small ${bad ? 's-fail' : 'muted'}`}>
        {bad ? 'Not a value: use 10k, 4k7, 100n, 2.2M…' : parsed !== null && def.unit ? `= ${formatValue(parsed, def.unit)}` : def.help ?? ''}
      </span>
    </div>
  );
}

interface SimPanelProps {
  sheet: Sheet; apply: (s: Sheet, label: string) => void; running: boolean; status: JSX.Element | null;
  live: boolean; setLive: (b: boolean) => void; showValues: boolean; setShowValues: (b: boolean) => void;
  run: () => void; result: SimOutcome | null;
  op: { v: Record<string, number>; i: Record<string, number>; final: boolean } | null;
  conn: ReturnType<typeof connectivity>; probeLabels: Map<string, string>;
  setTool: (t: Tool) => void; held: Set<string>; setHeld: (s: Set<string>) => void;
  onRemoveProbe: (id: string) => void;
}

function SimPanel({ sheet, apply, running, status, live, setLive, showValues, setShowValues, run, result, op, conn, probeLabels, setTool, held, setHeld, onRemoveProbe }: SimPanelProps) {
  const s = sheet.sim;
  const set = (next: SimSettings, label: string) => apply({ ...sheet, sim: next }, label);
  const field = (label: string, value: string, onChange: (v: string) => void, unit: string, help?: string) => {
    const bad = value.trim() !== '' && parseValue(value) === null;
    return (
      <label class="field">{label} ({unit})
        <input value={value} aria-invalid={bad} onChange={(e) => onChange((e.target as HTMLInputElement).value.trim())} />
        <span class={`small ${bad ? 's-fail' : 'muted'}`}>{bad ? 'not a value' : help ?? (parseValue(value) !== null ? `= ${formatValue(parseValue(value)!, unit)}` : '')}</span>
      </label>
    );
  };
  const targets = sweepTargets(sheet);
  const interactive = sheet.parts.filter((p) => symbolOf(p.sym).interactive);
  const types: [SimSettings['type'], string, string][] = [
    ['op', 'Operating point', 'DC voltages and currents, shown on the schematic. Updates live.'],
    ['tran', 'Transient', 'Voltages and currents over time.'],
    ['ac', 'AC sweep', 'Gain and phase over frequency (Bode plot).'],
    ['dc', 'DC sweep', 'Sweeps a source voltage or a resistor value.'],
  ];
  const choose = (t: SimSettings['type']) => {
    if (t === s.type) return;
    const def: Record<string, SimSettings> = {
      op: { type: 'op' },
      tran: { type: 'tran', stop: '10m', step: '' },
      ac: { type: 'ac', fstart: '10', fstop: '1meg', perDecade: '20' },
      dc: { type: 'dc', target: targets[0]?.ref ?? '', param: 'value', start: '0', stop: '10', step: '0.1' },
    };
    set(def[t], `Analysis: ${types.find((x) => x[0] === t)![1]}`);
  };
  return (
    <div class="sim-panel">
      <fieldset>
        <legend>Analysis</legend>
        {types.map(([t, label, help]) => (
          <label key={t} class="radio"><input type="radio" name="analysis" checked={s.type === t} onChange={() => choose(t)} /> <strong>{label}</strong> <span class="small muted">{help}</span></label>
        ))}
      </fieldset>
      {s.type === 'tran' && (
        <div class="row wrap">
          {field('Stop time', s.stop, (v) => set({ ...s, stop: v }, `Stop time ${v}`), 's')}
          {field('Time step', s.step, (v) => set({ ...s, step: v }, `Time step ${v}`), 's', 'empty: stop time / 1000')}
        </div>
      )}
      {s.type === 'ac' && (
        <div class="row wrap">
          {field('From', s.fstart, (v) => set({ ...s, fstart: v }, `AC from ${v}`), 'Hz')}
          {field('To', s.fstop, (v) => set({ ...s, fstop: v }, `AC to ${v}`), 'Hz')}
          {field('Points per decade', s.perDecade, (v) => set({ ...s, perDecade: v }, `AC points ${v}`), 'per decade')}
          <p class="small muted">The AC source is every source with an "AC magnitude" (sine sources: 1 V by default).</p>
        </div>
      )}
      {s.type === 'dc' && (
        <div class="row wrap">
          <label class="field">Sweep
            <select value={s.target} onChange={(e) => set({ ...s, target: (e.target as HTMLSelectElement).value }, 'Sweep target')}>
              {!targets.some((t) => t.ref === s.target) && <option value={s.target}>{s.target || 'choose…'}</option>}
              {targets.map((t) => <option key={t.ref} value={t.ref}>{t.label}</option>)}
            </select>
          </label>
          {field('Start', s.start, (v) => set({ ...s, start: v }, `Sweep start ${v}`), targets.find((t) => t.ref === s.target)?.unit ?? '')}
          {field('Stop', s.stop, (v) => set({ ...s, stop: v }, `Sweep stop ${v}`), targets.find((t) => t.ref === s.target)?.unit ?? '')}
          {field('Step', s.step, (v) => set({ ...s, step: v }, `Sweep step ${v}`), targets.find((t) => t.ref === s.target)?.unit ?? '')}
        </div>
      )}
      <div class="row">
        <button class="primary" onClick={run} disabled={running}>{running ? 'Simulating…' : '▶ Simulate (F5)'}</button>
        <label><input type="checkbox" checked={live} onChange={(e) => setLive((e.target as HTMLInputElement).checked)} /> Update live</label>
        <label><input type="checkbox" checked={showValues} onChange={(e) => setShowValues((e.target as HTMLInputElement).checked)} /> Voltages on schematic</label>
      </div>
      <p role="status">{status}</p>
      {result && 'error' in result && result.errors.length > 1 && <ul class="small s-fail">{result.errors.slice(1).map((e) => <li key={e}>{e}</li>)}</ul>}
      {result && !('error' in result) && result.rails.length > 0 && (
        <p class="small banner">{result.rails.map((r) => `${r.net} is driven by an ideal ${r.volts} V supply`).join('; ')} (no source on the rail).</p>
      )}
      {result && !('error' in result) && result.warnings.map((w) => <p key={w} class="small s-warn">{w}</p>)}
      {interactive.length > 0 && (
        <fieldset>
          <legend>Controls (SIM-03)</legend>
          {interactive.map((p) => {
            const sd = symbolOf(p.sym);
            if (sd.interactive === 'momentary') return (
              <button key={p.id} aria-pressed={held.has(p.id)} onPointerDown={() => setHeld(new Set([p.id]))} onPointerUp={() => setHeld(new Set())} onPointerLeave={() => held.has(p.id) && setHeld(new Set())}
                      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); setHeld(new Set([p.id])); } }} onKeyUp={() => setHeld(new Set())}>
                Hold {p.ref}
              </button>
            );
            if (sd.interactive === 'toggle') return <label key={p.id}><input type="checkbox" checked={p.props.closed === 'true'} onChange={() => apply(setProps(sheet, p.id, { closed: p.props.closed === 'true' ? 'false' : 'true' }), `Toggle ${p.ref}`)} /> {p.ref} closed</label>;
            if (sd.interactive === 'throw') return <label key={p.id}>{p.ref} <select value={p.props.position} onChange={(e) => apply(setProps(sheet, p.id, { position: (e.target as HTMLSelectElement).value }), `Switch ${p.ref}`)}><option>A</option><option>B</option></select></label>;
            return (
              <label key={p.id} class="field">{p.ref} wiper {p.props.position} %
                <input type="range" min={0} max={100} value={parseValue(p.props.position) ?? 50} onChange={(e) => apply(setProps(sheet, p.id, { position: (e.target as HTMLInputElement).value }), `${p.ref} wiper`)} />
              </label>
            );
          })}
        </fieldset>
      )}
      <fieldset>
        <legend>Probes (SIM-02)</legend>
        <div class="row"><button onClick={() => setTool('probe-v')}>+ Voltage (V)</button><button onClick={() => setTool('probe-i')}>+ Current (I)</button></div>
        {sheet.probes.length === 0 && <p class="small muted">No probes. Click "+ Voltage", then a wire; drag from one wire to another for a voltage difference.</p>}
        <ul class="probes">
          {sheet.probes.map((p) => <li key={p.id}><span class="swatch" style={{ background: p.colour }} />{probeLabels.get(p.id)} <button aria-label={`Remove probe ${probeLabels.get(p.id)}`} onClick={() => onRemoveProbe(p.id)}>✕</button></li>)}
        </ul>
      </fieldset>
      {op && !op.final && (
        <details open>
          <summary>Node voltages</summary>
          <table class="small">
            <tbody>{conn.nets.filter((n) => n.name !== 'GND').map((n) => <tr key={n.name}><td>{n.name}</td><td>{op.v[n.name] === undefined ? '—' : formatValue(op.v[n.name], 'V')}</td></tr>)}</tbody>
          </table>
        </details>
      )}
    </div>
  );
}

function ErcPanel({ issues, onPick }: { issues: ErcIssue[]; onPick: (i: ErcIssue) => void }) {
  const order = { error: 0, warning: 1, info: 2 } as const;
  const list = [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div>
      <p class="small muted">The electrical rule check runs on every change (ED-09).</p>
      {!list.some((i) => i.severity !== 'info') && <p class="s-pass">No errors or warnings.</p>}
      <ul class="erc-list">
        {list.map((i) => (
          <li key={i.id} class={`erc ${i.severity}`}>
            <button class="link" onClick={() => onPick(i)}><strong>{i.severity}</strong> · {i.message}</button> <span class="small muted">{i.rule}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NetsPanel({ conn, highlight, setHighlight, spice, onSpice }: { conn: ReturnType<typeof connectivity>; highlight: string | null; setHighlight: (n: string | null) => void; spice: string | null; onSpice: () => void }) {
  return (
    <div>
      <p class="small muted">The netlist is the single source of connectivity (INV-08). Click a net to highlight it.</p>
      <ul class="nets">
        {conn.nets.map((n) => (
          <li key={n.name} class={highlight === n.name ? 'is-selected' : ''}>
            <button class="link" onClick={() => setHighlight(highlight === n.name ? null : n.name)}><strong>{n.name}</strong></button>: {n.pins.join(', ') || <span class="muted">no part pins</span>}
          </li>
        ))}
      </ul>
      <button onClick={onSpice}>Show SPICE netlist</button>
      {spice && <pre class="spice" tabIndex={0} aria-label="SPICE netlist">{spice}</pre>}
    </div>
  );
}
