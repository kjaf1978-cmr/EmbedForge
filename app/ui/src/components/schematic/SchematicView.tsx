// Schematic editor and simulator (UI-08, ED-08, ED-09, SIM-01..05, UI-19 for this view).
// Tools and shortcuts follow KiCad (A add part, W wire, L label, P power, G ground, R rotate,
// X mirror, Del delete); probing follows LTspice (click a wire for its voltage, a pin for its
// current); switches, push-buttons and potentiometers work on the sheet as in Falstad.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { CATEGORIES, outOfLimits, searchSymbols, symbolOf, SYMBOLS, type ParamDef, type Pt, type SymbolDef } from '../../eda/symbols';
import { GRID, TEMP_REF, annotate, key, netLabels, newId, toLocal, onSegment, pinPositions, samePt, snap, snapPt, type Part, type Probe, type Rot, type Sheet, type MonteCarlo, type SimSettings, type StepAxis, type StepSweep } from '../../eda/schematic';
import {
  addLabel, addWire, mirrorSelectionV, rotateSelectionCcw, selectionBounds, connectionAt, copySelection, deleteSelection, hitTest, inRect, isEmpty, mirrorSelection, moveSelection, noSelection, paste,
  placePart, rotateSelection, routeAround, setProps, setRef, sheetBounds, wireCollisions, noCollision, type Clip, type Hit, type Selection,
} from '../../eda/editor';
import type { SchematicPrefs } from '../../core/settings';
import { connectivity, netAt } from '../../eda/connectivity';
import { erc, type ErcIssue } from '../../eda/erc';
import { buildNetlist, describeDiff, diffNetlist } from '../../eda/netlist';
import { sweepTargets } from '../../eda/simnet';
import { bomCsv, buildBom } from '../../eda/bom';
import { importModel } from '../../eda/spicemodel';
import { smoke } from '../../eda/smoke';
import { BJTS, DIODES, MOSFETS, OPAMPS, ZENERS } from '../../eda/models';
import { formatValue, parseValue, shortValue } from '../../eda/units';
import { MAX_RUNS, schematicSpice, stepValues } from '../../sim/run';
import type { SimClient, SimOutcome } from '../../sim/client';
import { toCsv } from '../../sim/measure';
import { motionAt, shownTorque, type Motion } from '../../sim/motion';
import { footprintChoices, footprintOf } from '../../pcb/library';
import { FOOTPRINTS } from '../../pcb/footprint';
import { unbuyable } from '../../eda/standard';
import { FIRST_CIRCUIT } from '../../eda/tutorial';
import { GfxEl, SheetContent, partTransform } from './SheetSvg';
import { Plot, type Trace } from './Plot';

/** A transient plays on the schematic in this many seconds. */
const PLAY_SECONDS = 8;

export type Tool = 'select' | 'place' | 'wire' | 'label' | 'note' | 'probe-v' | 'probe-i' | 'pan' | 'zoom';

export interface EditorApi { run(cmd: string): void }

export const EDITOR_COMMANDS: { id: string; title: string; key: string }[] = [
  { id: 'add', title: 'Add part', key: 'A' },
  { id: 'wire', title: 'Draw wire', key: 'W' },
  { id: 'label', title: 'Add net label', key: 'L' },
  { id: 'note', title: 'Add a text note', key: 'T' },
  { id: 'power', title: 'Add power rail', key: 'P' },
  { id: 'ground', title: 'Add ground', key: 'G' },
  { id: 'probe-v', title: 'Voltage probe', key: 'V' },
  { id: 'probe-i', title: 'Current probe', key: 'I' },
  { id: 'rotate', title: 'Rotate clockwise', key: 'R / Ctrl+R' },
  { id: 'rotate-ccw', title: 'Rotate counter-clockwise', key: 'Shift+R / Ctrl+Shift+R' },
  { id: 'mirror', title: 'Mirror left–right', key: 'X' },
  { id: 'mirror-v', title: 'Mirror top–bottom', key: 'Y' },
  { id: 'pan', title: 'Pan tool (drag to move the view)', key: 'H' },
  { id: 'zoom-box', title: 'Zoom to an area (drag a rectangle)', key: 'Z' },
  { id: 'zoom-sel', title: 'Zoom to the selection', key: 'Shift+Home' },
  { id: 'zoom-100', title: 'Zoom to 100 %', key: '1' },
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
  { id: 'export-bom', title: 'Export bill of materials (CSV)', key: '' },
  { id: 'print', title: 'Print schematic', key: '' },
  { id: 'escape', title: 'Cancel tool / clear selection', key: 'Esc' },
  { id: 'layout-below', title: 'Layout: results below the schematic (tile horizontally)', key: 'Ctrl+Alt+↓' },
  { id: 'layout-beside', title: 'Layout: results beside the schematic (tile vertically)', key: 'Ctrl+Alt+→' },
  { id: 'max-schematic', title: 'Layout: maximise the schematic (toggle)', key: 'Ctrl+Alt+S' },
  { id: 'max-results', title: 'Layout: maximise the results (toggle)', key: 'Ctrl+Alt+W' },
  { id: 'toggle-library', title: 'Layout: show or hide the part library', key: 'Ctrl+Alt+L' },
  { id: 'toggle-side', title: 'Layout: show or hide the properties panel', key: 'Ctrl+Alt+P' },
  { id: 'layout-reset', title: 'Layout: reset to the default', key: '' },
];

/** A wire or edit that would touch something it was not aimed at, waiting for the user's choice. */
interface Pending {
  title: string;
  detail: string[];
  points: Pt[];
  overlaps: [Pt, Pt][];
  connect: { sheet: Sheet; label: string; after?: () => void };
  around?: { sheet: Sheet; label: string; path: Pt[]; after?: () => void };
  cancelLabel: string;
  onCancel?: () => void;
}

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
  prefs: SchematicPrefs;
  setPrefs: (p: Partial<SchematicPrefs>) => void;
}

type Drag =
  | { kind: 'move'; start: Pt; sel: Selection; base: Sheet; dx: number; dy: number; hit: Hit | null }
  | { kind: 'box'; a: Pt; b: Pt; add: boolean }
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'vprobe'; a: Pt; b: Pt }
  | { kind: 'wiper'; part: string; pos: number }
  | { kind: 'zoombox'; a: Pt; b: Pt };

const PROBE_COLOURS = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#8c564b', '#e377c2'];
/** Runs fn after the pending render (Preact renders in a microtask), before the next event. */
const afterRender = (fn: () => void) => queueMicrotask(() => queueMicrotask(fn));
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
  const [tab, setTab] = useState<'props' | 'sim' | 'erc' | 'nets' | 'bom' | 'stress'>('props');
  const [result, setResult] = useState<SimOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState(true);
  const [hasRun, setHasRun] = useState(false);
  const [showValues, setShowValues] = useState(true);
  const [highlightNet, setHighlightNet] = useState<string | null>(null);
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [override, setOverride] = useState<Record<string, Record<string, string>>>({});
  const [selTrace, setSelTrace] = useState<string | null>(null);
  const [spiceText, setSpiceText] = useState<string | null>(null);
  const [tutStep, setTutStep] = useState(0);
  const [hintOpen, setHintOpen] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);
  const [preview, setPreview] = useState<'connect' | 'around' | null>(null);
  const [remember, setRemember] = useState(false);
  const prefs = props.prefs;
  const tutStart = useRef<Sheet>(sheet);
  const clip = useRef<Clip | null>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
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
  const ercIssues = useMemo(() => erc(shown, conn), [shown, conn]);
  const [derate, setDerate] = useState(80);
  // stress check (smoke analysis) of the last result: overstressed parts become checks too
  const okResult = result && !('error' in result) ? result : null;
  const stress = useMemo(() => (okResult ? smoke(sheet, connectivity(sheet), okResult, derate) : null), [okResult, derate]);
  const issues = useMemo(() => [...ercIssues, ...(stress?.rows ?? []).filter((r) => r.status !== 'ok').map((r, k): ErcIssue => {
    const p = sheet.parts.find((x) => x.ref === r.ref);
    return { id: `stress:${k}`, severity: r.status === 'over' ? 'error' : 'warning', rule: 'stress', refs: [r.ref], at: p ? { x: p.x, y: p.y } : null,
      message: `${r.ref} ${r.what} ${formatValue(r.value, r.unit)} is ${Math.round(r.pct)} % of its rating (${formatValue(r.rating, r.unit)})${r.status === 'over' ? ': over the maximum rating' : `: above ${derate} %`}.` };
  })], [ercIssues, stress]);
  const nErr = issues.filter((i) => i.severity === 'error').length, nWarn = issues.filter((i) => i.severity === 'warning').length;

  // ---- geometry helpers
  // layout effects: the size and the first view are set before the user can act on them
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth || 900, h: el.clientHeight || 600 });
    read();
    const ro = new ResizeObserver(read);
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
  useLayoutEffect(() => { userView.current = false; fit(); setResult(null); setHasRun(false); setSel(noSelection()); setTool('select'); setWirePts([]); setTutStep(0); tutStart.current = sheet; setHintOpen(true); svgRef.current?.focus({ preventScroll: true }); }, [props.docKey]);
  // until the user zooms, pans or edits, the view follows the canvas size (the results panel takes room)
  useLayoutEffect(() => { if (!userView.current) fit(); }, [size.w, size.h]);
  const zoomTo = (b: { x0: number; y0: number; x1: number; y1: number }) => {
    userView.current = true;
    const pad = 40;
    const z = Math.min(8, Math.max(0.2, Math.min(size.w / (b.x1 - b.x0 + 2 * pad), size.h / (b.y1 - b.y0 + 2 * pad))));
    setView({ x: (b.x0 + b.x1) / 2 - size.w / z / 2, y: (b.y0 + b.y1) / 2 - size.h / z / 2, z });
  };
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
  // ---- collisions (the user decides; Settings → Schematic editor sets a default)
  const netAtPoint = (p: Pt) => netAt(sheet, conn, p);
  /** Pins of the given parts in `next` that land in the middle of a wire or on another part's
   *  pin, parts whose pins end up shorted together, and wire overlaps that were not there. */
  const editCollisions = (next: Sheet, partIds: Set<string>) => {
    const points: Pt[] = [], detail: string[] = [];
    const others = next.parts.filter((p) => !partIds.has(p.id));
    for (const p of next.parts.filter((x) => partIds.has(x.id))) {
      const pins = pinPositions(p);
      for (const pp of pins) {
        const midWire = next.wires.find((w) => onSegment(pp.at, w.a, w.b) && !samePt(pp.at, w.a) && !samePt(pp.at, w.b));
        const onPin = others.find((o) => pinPositions(o).some((q) => samePt(q.at, pp.at)));
        if (midWire || onPin) { points.push(pp.at); detail.push(`${p.ref} pin ${pp.pin} lands ${midWire ? 'in the middle of a wire' : `on a pin of ${onPin!.ref}`}`); }
      }
    }
    const nc = connectivity(next);
    for (const p of next.parts.filter((x) => partIds.has(x.id) && !symbolOf(x.sym).power)) {
      const nets = symbolOf(p.sym).pins.map((q) => nc.pinNet.get(`${p.ref}.${q.id}`)).filter(Boolean);
      if (nets.length > 1 && new Set(nets).size < nets.length) detail.push(`${p.ref} would be short-circuited (two pins on net ${nets.find((n, i) => nets.indexOf(n) !== i)})`);
    }
    const overlapsOf = (sh: Sheet) => {
      const out: [Pt, Pt][] = [];
      for (let i = 0; i < sh.wires.length; i++) for (let j = i + 1; j < sh.wires.length; j++) {
        const c = wireCollisions({ ...sh, parts: [], labels: [], wires: [sh.wires[j]] }, [sh.wires[i].a, sh.wires[i].b]);
        out.push(...c.overlaps);
      }
      return out;
    };
    const before = new Set(overlapsOf(sheet).map(([a, b]) => `${key(a)}|${key(b)}`));
    const overlaps = overlapsOf(next).filter(([a, b]) => !before.has(`${key(a)}|${key(b)}`));
    if (overlaps.length) detail.push(`${overlaps.length} wire stretch(es) would run along another wire`);
    return { points, overlaps, detail };
  };
  /** What the touched points are, and whether connecting would short a part. */
  const describeTouches = (points: Pt[], nets: string[]): string[] => {
    const names: string[] = [];
    const byPart = new Map<string, number>();
    for (const p of points) {
      const pins = sheet.parts.flatMap((part) => pinPositions(part).filter((q) => samePt(q.at, p)).map((q) => ({ part, pin: q.pin })));
      if (pins.length) for (const { part, pin } of pins) {
        names.push(symbolOf(part.sym).power ? String(part.props[symbolOf(part.sym).value.key]) : `${part.ref}.${pin}`);
        byPart.set(part.ref, (byPart.get(part.ref) ?? 0) + 1);
      }
      else if (netLabels(sheet).some((l) => samePt({ x: l.x, y: l.y }, p))) names.push(`label ${netLabels(sheet).find((l) => samePt({ x: l.x, y: l.y }, p))!.name}`);
      else names.push(`a wire end${netAtPoint(p) ? ` (net ${netAtPoint(p)})` : ''}`);
    }
    const out: string[] = [];
    if (names.length) out.push(`It passes through ${names.join(', ')}.`);
    if (nets.length) out.push(`Connecting joins net${nets.length > 1 ? 's' : ''} ${nets.join(', ')}.`);
    const shorted = [...byPart].filter(([, n]) => n >= 2).map(([r]) => r);
    if (shorted.length) out.push(`Connecting would short-circuit ${shorted.join(', ')} (two of its pins on one wire).`);
    out.push('The places are marked in red on the sheet.');
    return out;
  };
  /** Applies an edit that moves or adds parts; asks first when it collides (unless set to connect). */
  const applyEdit = (next: Sheet, label: string, partIds: Set<string>, after?: () => void) => {
    if (prefs.collision === 'connect') { apply(next, label); after?.(); return; }
    const c = editCollisions(next, partIds);
    if (!c.detail.length) { apply(next, label); after?.(); return; }
    setPending({ title: `${label}: this would connect things that were not connected`, detail: c.detail, points: c.points, overlaps: c.overlaps,
      connect: { sheet: next, label, after }, cancelLabel: 'Cancel (leave it as it was)' });
  };
  const choose = (what: 'connect' | 'around' | 'cancel') => {
    const p = pending;
    if (!p) return;
    setPending(null); setPreview(null);
    if (remember && what !== 'cancel') props.setPrefs({ collision: what === 'around' ? 'avoid' : 'connect' });
    setRemember(false);
    if (what === 'connect') { apply(p.connect.sheet, `${p.connect.label} (connected)`); p.connect.after?.(); }
    else if (what === 'around' && p.around) { apply(p.around.sheet, p.around.label); p.around.after?.(); }
    else { p.onCancel?.(); announce('Cancelled: nothing changed'); }
    svgRef.current?.focus({ preventScroll: true });
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
    applyEdit(r.sheet, `Add ${ref}`, new Set([r.id]), () => setSel({ ...noSelection(), parts: [r.id] }));
    if (!keep) { setTool('select'); setPlacing(null); setTab('props'); }
  };
  const wireClick = (raw: Pt) => {
    const tol = 8 / view.z;
    const at = connectionAt(sheet, raw, tol) ?? snapPt(raw);
    if (!wirePts.length) { setWirePts([at]); announce('Wire started: click the next point; click a pin or wire to end; Esc stops.'); return; }
    const last = wirePts[wirePts.length - 1];
    if (last.x === at.x && last.y === at.y) { setWirePts([]); return; }
    const endsOnSomething = !!connectionAt(sheet, at, 0.01);
    const done = () => {
      setSel(noSelection()); // arrow keys now move the cursor, not the last placed part
      setWirePts(endsOnSomething ? [] : [at]);
      // a wire that ends on a pin or wire is done: back to Select (click a pin end to draw the next)
      if (endsOnSomething) setTool('select');
    };
    const c = wireCollisions(sheet, [last, at], vFirst, netAtPoint);
    if (noCollision(c) || prefs.collision === 'connect') { apply(addWire(sheet, [last, at], vFirst), 'Wire'); done(); return; }
    const path = routeAround(sheet, last, at, vFirst);
    const around = path ? { sheet: addWire(sheet, path), label: 'Wire (routed around)', path, after: done } : undefined;
    if (prefs.collision === 'avoid' && around) { apply(around.sheet, around.label); done(); return; }
    const what = [
      c.points.length ? `touches ${c.points.length} pin(s) or wire end(s) on its way` : '',
      c.overlaps.length ? `runs along ${c.overlaps.length} existing wire stretch(es)` : '',
    ].filter(Boolean).join(' and ');
    setPending({
      title: `This wire ${what}`,
      detail: describeTouches(c.points, c.nets),
      points: c.points, overlaps: c.overlaps,
      connect: { sheet: addWire(sheet, [last, at], vFirst), label: 'Wire', after: done },
      around, cancelLabel: 'Cancel this segment',
    });
  };
  const nextLabel = () => { for (let i = 1; ; i++) { const n = `NET${i}`; if (!netLabels(sheet).some((l) => l.name === n)) return n; } };
  const placeNote = (at: Pt) => {
    const r = addLabel(sheet, 'Note', at, true);
    apply(r.sheet, 'Add note');
    setSel({ ...noSelection(), labels: [r.id] });
    setTool('select');
    setTab('props');
    afterRender(() => { valueRef.current?.focus(); (valueRef.current as HTMLInputElement | null)?.select?.(); });
  };
  const placeLabel = (at: Pt) => {
    const r = addLabel(sheet, nextLabel(), at);
    apply(r.sheet, 'Add label');
    setSel({ ...noSelection(), labels: [r.id] });
    setTool('select');
    setTab('props');
    afterRender(() => valueRef.current?.focus());
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
      case 'add': setTool('select'); searchRef.current?.focus(); searchRef.current?.select(); break;
      case 'wire': setTool('wire'); setWirePts([]); setPlacing(null); setSel(noSelection()); announce('Wire tool: click a start point.'); break;
      case 'label': setTool('label'); setPlacing(null); announce('Label tool: click on a wire.'); break;
      case 'note': setTool('note'); setPlacing(null); announce('Note tool: click where the text goes.'); break;
      case 'power': startPlace('power'); break;
      case 'ground': startPlace('gnd'); break;
      case 'probe-v': setTool('probe-v'); setPlacing(null); announce('Voltage probe: click a wire or pin; drag from one net to another for the difference.'); break;
      case 'probe-i': setTool('probe-i'); setPlacing(null); announce('Current probe: click a part pin.'); break;
      case 'rotate':
        if (tool === 'place' && placing) setPlacing({ ...placing, rot: ((placing.rot + 1) % 4) as Rot });
        else if (!isEmpty(ss)) applyEdit(rotateSelection(sheet, ss), 'Rotate', new Set(ss.parts));
        else announce('Select something to rotate first');
        break;
      case 'mirror':
        if (tool === 'place' && placing) setPlacing({ ...placing, mirror: !placing.mirror });
        else if (!isEmpty(ss)) applyEdit(mirrorSelection(sheet, ss), 'Mirror', new Set(ss.parts));
        else announce('Select something to mirror first');
        break;
      case 'rotate-ccw':
        if (tool === 'place' && placing) setPlacing({ ...placing, rot: ((placing.rot + 3) % 4) as Rot });
        else if (!isEmpty(ss)) applyEdit(rotateSelectionCcw(sheet, ss), 'Rotate counter-clockwise', new Set(ss.parts));
        else announce('Select something to rotate first');
        break;
      case 'mirror-v':
        if (tool === 'place' && placing) setPlacing({ ...placing, mirror: !placing.mirror, rot: ((6 - placing.rot) % 4) as Rot });
        else if (!isEmpty(ss)) applyEdit(mirrorSelectionV(sheet, ss), 'Mirror top–bottom', new Set(ss.parts));
        else announce('Select something to mirror first');
        break;
      case 'pan': setTool(tool === 'pan' ? 'select' : 'pan'); setPlacing(null); setWirePts([]); announce('Pan tool: drag to move the view; Esc returns to Select.'); break;
      case 'zoom-box': setTool(tool === 'zoom' ? 'select' : 'zoom'); setPlacing(null); setWirePts([]); announce('Zoom tool: drag a rectangle to zoom into it; a click zooms in; Esc returns to Select.'); break;
      case 'zoom-sel': {
        const b = selectionBounds(sheet, ss);
        if (b) zoomTo(b); else { userView.current = false; fit(); }
        break;
      }
      case 'zoom-100': { userView.current = true; const c = { x: view.x + size.w / view.z / 2, y: view.y + size.h / view.z / 2 }; setView({ z: 1, x: c.x - size.w / 2, y: c.y - size.h / 2 }); break; }
      case 'delete': if (!isEmpty(ss)) { apply(deleteSelection(sheet, ss), 'Delete'); setSel(noSelection()); } break;
      case 'copy': if (!isEmpty(ss)) { clip.current = copySelection(sheet, ss); announce('Copied'); } break;
      case 'cut': if (!isEmpty(ss)) { clip.current = copySelection(sheet, ss); apply(deleteSelection(sheet, ss), 'Cut'); setSel(noSelection()); } break;
      case 'paste': case 'duplicate': {
        const c = cmd === 'duplicate' ? (isEmpty(ss) ? null : copySelection(sheet, ss)) : clip.current;
        if (!c) break;
        const r = paste(sheet, c, 4 * GRID, 4 * GRID);
        applyEdit(r.sheet, cmd === 'duplicate' ? 'Duplicate' : 'Paste', new Set(r.sel.parts), () => setSel(r.sel));
        break;
      }
      case 'select-all': setSel({ parts: sheet.parts.map((p) => p.id), wires: sheet.wires.map((w) => w.id), labels: sheet.labels.map((l) => l.id) }); break;
      case 'fit': userView.current = false; fit(); break;
      case 'zoom-in': zoomBy(1.25); break;
      case 'zoom-out': zoomBy(0.8); break;
      case 'annotate': apply(annotate(sheet), 'Annotate'); break;
      case 'layout-below': props.setPrefs({ results: 'below', maximize: 'none' }); announce('Results below the schematic'); break;
      case 'layout-beside': props.setPrefs({ results: 'beside', maximize: 'none' }); announce('Results beside the schematic'); break;
      case 'max-schematic': props.setPrefs({ maximize: prefs.maximize === 'schematic' ? 'none' : 'schematic' }); break;
      case 'max-results': props.setPrefs({ maximize: prefs.maximize === 'results' ? 'none' : 'results' }); break;
      case 'toggle-library': props.setPrefs({ showLibrary: !prefs.showLibrary }); break;
      case 'toggle-side': props.setPrefs({ showSide: !prefs.showSide }); break;
      case 'layout-reset': props.setPrefs({ results: 'below', split: 0.6, maximize: 'none', showLibrary: true, showSide: true }); announce('Layout reset'); break;
      case 'simulate': void simulateNow(true); break;
      case 'export-svg': void exportSvg(); break;
      case 'export-png': void exportPng(); break;
      case 'export-spice': void exportSpice(); break;
      case 'export-bom': void exportBom(); break;
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
    if (pending) { if (k === 'Escape') { stop(); choose('cancel'); } return; }
    if (ctrl && e.altKey) {
      const m: Record<string, string> = { ArrowDown: 'layout-below', ArrowRight: 'layout-beside', s: 'max-schematic', w: 'max-results', l: 'toggle-library', p: 'toggle-side' };
      const c = m[k.length === 1 ? k.toLowerCase() : k];
      if (c) { stop(); run(c); }
      return;
    }
    if (ctrl) {
      // Ctrl+R rotates (and never reloads the page); Ctrl+Shift+R rotates the other way
      if (k.toLowerCase() === 'r') { stop(); run(e.shiftKey ? 'rotate-ccw' : 'rotate'); return; }
      const m: Record<string, string> = { c: 'copy', x: 'cut', v: 'paste', d: 'duplicate', a: 'select-all' };
      const c = m[k.toLowerCase()];
      if (c && !e.shiftKey) { stop(); run(c); }
      return;
    }
    if (e.shiftKey && k === 'Home') { stop(); run('zoom-sel'); return; }
    if (e.shiftKey && k.toLowerCase() === 'r') { stop(); run('rotate-ccw'); return; }
    if (e.altKey) return;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[k]) {
      stop();
      const [dx, dy] = arrows[k];
      if (tool === 'select' && !isEmpty(sel)) applyEdit(moveSelection(sheet, sel, dx * step, dy * step), 'Move', new Set(sel.parts));
      else { setKbCursor(true); setCursor((c) => ({ x: snap(c.x) + dx * step, y: snap(c.y) + dy * step })); }
      return;
    }
    if (k === 'Enter') {
      if (tool === 'place') { stop(); doPlace(cursor, e.shiftKey); }
      else if (tool === 'wire') { stop(); wireClick(cursor); }
      else if (tool === 'label') { stop(); placeLabel(cursor); }
      else if (tool === 'note') { stop(); placeNote(cursor); }
      else if (tool === 'probe-v') { stop(); probeV(cursor); }
      else if (tool === 'probe-i') { stop(); probeI(cursor); }
      else {
        const h = hitTest(sheet, cursor, 1);
        if (h?.kind === 'pin') { stop(); setTool('wire'); setWirePts([h.at]); announce('Wire started at a pin: move with the arrow keys, Enter for each corner.'); }
        else if (selectedParts.length === 1) { stop(); setTab('props'); afterRender(() => valueRef.current?.focus()); }
      }
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
      a: 'add', w: 'wire', l: 'label', t: 'note', p: 'power', g: 'ground', v: 'probe-v', i: 'probe-i', r: 'rotate', x: 'mirror', y: 'mirror-v',
      h: 'pan', z: 'zoom-box', '1': 'zoom-100',
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
    if (pending) { e.preventDefault(); return; }
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
    if (tool === 'pan') { userView.current = true; setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }); return; }
    if (tool === 'zoom') { setDrag({ kind: 'zoombox', a: p, b: p }); return; }
    if (tool === 'select') {
      // the wiper arrow of a potentiometer is a handle: drag it along the track
      for (const part of [...sheet.parts].reverse()) {
        if (symbolOf(part.sym).interactive !== 'pot') continue;
        const l = toLocal(part, p);
        if (l.x >= -17 && l.x <= 17 && l.y >= -24 && l.y <= -7) {
          setSel({ ...noSelection(), parts: [part.id] }); setTab('props');
          const pos = Math.round(Math.min(1, Math.max(0, (l.x + 13) / 26)) * 100);
          setOverride((o) => ({ ...o, [part.id]: { position: String(pos) } }));
          setDrag({ kind: 'wiper', part: part.id, pos });
          return;
        }
      }
    }
    if (tool === 'place') { doPlace(p, e.shiftKey); return; }
    if (tool === 'wire') { wireClick(p); return; }
    if (tool === 'label') { placeLabel(connectionAt(sheet, p, 8 / view.z) ?? p); return; }
    if (tool === 'note') { placeNote(p); return; }
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
    else if (drag.kind === 'vprobe' || drag.kind === 'zoombox') setDrag({ ...drag, b: p });
    else if (drag.kind === 'wiper') {
      const part = sheet.parts.find((x) => x.id === drag.part);
      if (!part) return;
      const pos = Math.round(Math.min(1, Math.max(0, (toLocal(part, p).x + 13) / 26)) * 100);
      if (pos !== drag.pos) { setDrag({ ...drag, pos }); setOverride((o) => ({ ...o, [part.id]: { position: String(pos) } })); }
    }
  };
  const onPointerUp = () => {
    const d = drag;
    setDrag(null);
    if (held.size && !spaceDown.current) setHeld(new Set());
    if (!d) return;
    if (d.kind === 'move') {
      if (d.dx || d.dy) applyEdit(moveSelection(d.base, d.sel, d.dx, d.dy), 'Move', new Set(d.sel.parts));
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
    } else if (d.kind === 'zoombox') {
      const w = Math.abs(d.b.x - d.a.x), h = Math.abs(d.b.y - d.a.y);
      if (w > 8 / view.z && h > 8 / view.z) zoomTo({ x0: Math.min(d.a.x, d.b.x) + 40, y0: Math.min(d.a.y, d.b.y) + 40, x1: Math.max(d.a.x, d.b.x) - 40, y1: Math.max(d.a.y, d.b.y) - 40 });
      else zoomBy(1.5, d.a);
    } else if (d.kind === 'wiper') {
      const part = sheet.parts.find((x) => x.id === d.part);
      setOverride((o) => { const n = { ...o }; delete n[d.part]; return n; });
      if (part && String(d.pos) !== part.props.position) apply(setProps(sheet, part.id, { position: String(d.pos) }), `${part.ref} wiper ${d.pos} %`);
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = toWorldPt(e);
    if (e.shiftKey && !e.ctrlKey) {
      // Shift+wheel pans sideways; a touchpad's horizontal scroll pans too
      userView.current = true;
      const d = (e.deltaY || e.deltaX) / view.z;
      setView((v) => ({ ...v, x: v.x + d }));
      return;
    }
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) { userView.current = true; setView((v) => ({ ...v, x: v.x + e.deltaX / v.z })); return; }
    if (hasRun && !e.ctrlKey) {
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
    if (h?.kind === 'part' || h?.kind === 'label') { setTab('props'); afterRender(() => valueRef.current?.focus()); }
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
  // playback of a transient on the schematic: the time shown (null: the end of the run)
  const [playT, setPlayT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setPlaying(false); setPlayT(null); }, [result]);
  const tEnd = ok?.analysis === 'tran' ? ok.x[ok.x.length - 1] : 0;
  useEffect(() => {
    if (!playing || !(tEnd > 0)) return;
    // the whole run plays in PLAY_SECONDS; it stops at the end
    let last = performance.now(), raf = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      let stop = false;
      setPlayT((t) => { const n = (t ?? 0) + (dt * tEnd) / PLAY_SECONDS; if (n >= tEnd) { stop = true; return tEnd; } return n; });
      if (stop) setPlaying(false); else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, tEnd]);
  const shownK = useMemo(() => {
    if (!ok) return 0;
    if (ok.analysis === 'op') return 0;
    if (playT === null || ok.analysis !== 'tran') return ok.x.length - 1;
    let lo = 0, hi = ok.x.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ok.x[m] <= playT) lo = m; else hi = m; }
    return lo;
  }, [ok, playT]);
  const op = useMemo(() => {
    if (!ok) return null;
    const pick = (o: Record<string, number[]>, k: number) => Object.fromEntries(Object.entries(o).map(([n, v]) => [n, v[k]]));
    return { v: pick(ok.v, shownK), i: pick(ok.i, shownK), final: ok.analysis !== 'op' };
  }, [ok, shownK]);
  const torques = useMemo(() => (ok ? shownTorque(ok) : {}), [ok]);
  const motion = useMemo(() => {
    const m = new Map<string, Motion>();
    if (!ok?.mech) return m;
    const byRef = motionAt(ok, torques, shownK);
    for (const p of shown.parts) { const x = byRef.get(p.ref); if (x) m.set(p.id, x); }
    return m;
  }, [ok, torques, shownK, shown]);
  const glow = useMemo(() => {
    const m = new Map<string, number>();
    if (!op || ok?.analysis === 'ac') return m;
    for (const p of shown.parts) if (p.sym === 'led') { const i = op.i[`${p.ref}.2`] ?? 0; m.set(p.id, Math.min(1, Math.max(0, i / 0.02))); }
    return m;
  }, [op, shown]);

  // hover readout (LTspice style): what is under the pointer, with its value after a simulation
  const hoverText = useMemo(() => {
    if (drag || tool !== 'select') return '';
    const h = hitTest(shown, cursor, 6 / view.z);
    if (!h) return '';
    const vOf = (net: string | null | undefined) => (net && op && ok?.analysis !== 'ac' && op.v[net] !== undefined ? ` = ${formatValue(op.v[net], 'V')}${op.final ? ' (end)' : ''}` : '');
    if (h.kind === 'wire') { const n = conn.wireNet.get(h.wire); return n ? `net ${n}${vOf(n)}` : 'wire, not connected'; }
    if (h.kind === 'pin') {
      const p = shown.parts.find((x) => x.id === h.part)!;
      const s = symbolOf(p.sym);
      if (s.power) return `${p.props[s.value.key]}`;
      const n = conn.pinNet.get(`${p.ref}.${h.pin}`);
      const i = op && ok?.analysis !== 'ac' ? op.i[`${p.ref}.${h.pin}`] : undefined;
      return `${p.ref} pin ${h.pin} (${s.pins.find((q) => q.id === h.pin)?.name}) · ${n ?? 'not connected'}${vOf(n)}${i !== undefined ? ` · I in ${formatValue(i, 'A')}` : ''}`;
    }
    if (h.kind === 'part') { const p = shown.parts.find((x) => x.id === h.part)!; const s = symbolOf(p.sym); return s.power ? `${s.name} ${p.props[s.value.key]}` : `${p.ref} · ${s.name} ${p.props[s.value.key] ?? ''}${s.interactive && hasRun ? ' · click to operate' : ''}`; }
    if (h.kind === 'label') { const l = shown.labels.find((x) => x.id === h.label)!; return l.note ? 'text note' : `label ${l.name}${vOf(l.name)}`; }
    return '';
  }, [cursor, shown, conn, op, ok, tool, drag, view.z, hasRun]);

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
    type Data = { v: Record<string, number[]>; vi?: Record<string, number[]>; i: Record<string, number[]>; ii?: Record<string, number[]> };
    const series = (pr: Probe, d: Data = ok): { re: number[]; im?: number[]; unit: string } | null => {
      if (pr.kind === 'i') { const p = shown.parts.find((x) => x.id === pr.part); const k = p ? `${p.ref}.${pr.pin}` : ''; return d.i[k] ? { re: d.i[k], im: d.ii?.[k], unit: 'A' } : null; }
      const a = netAt(shown, conn, pr.at);
      if (!a || !d.v[a]) return null;
      if (pr.kind === 'v') return { re: d.v[a], im: d.vi?.[a], unit: 'V' };
      const b = netAt(shown, conn, pr.at2);
      if (!b || !d.v[b]) return null;
      return { re: d.v[a].map((v, j) => v - d.v[b][j]), im: d.vi ? d.vi[a].map((v, j) => v - d.vi![b][j]) : undefined, unit: 'V' };
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
    // a parameter sweep draws one trace per run: colours by run, names with the stepped value
    const runs: { suffix: string; data: Data; colour: (pr: Probe) => string; key: string }[] = ok.steps
      ? ok.steps.map((r, k) => ({ suffix: ` · ${r.label}`, data: r, colour: () => PROBE_COLOURS[k % PROBE_COLOURS.length], key: `:s${k}` }))
      : [{ suffix: '', data: ok, colour: (pr: Probe) => pr.colour, key: '' }];
    for (const pr of probes) for (const run of runs) {
      const s = series(pr, run.data);
      if (!s) continue;
      const name = probeName(pr) + run.suffix, colour = run.colour(pr), id = pr.id + run.key;
      if (ac && s.im) {
        out.push({ id, name: `|${probeName(pr)}|${run.suffix}`, colour, unit: 'dB', y: s.re.map((r, j) => 20 * Math.log10(Math.hypot(r, s.im![j]) || 1e-30)) });
        out.push({ id: `${id}:ph`, name: `∠${probeName(pr)}${run.suffix}`, colour, unit: '°', dashed: true, y: s.re.map((r, j) => (Math.atan2(s.im![j], r) * 180) / Math.PI) });
      } else out.push({ id, name, colour, unit: s.unit, y: s.re });
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
    // a data: URL, which the content security policy allows for images (blob: is not allowed)
    const loaded = await new Promise<boolean>((res) => { img.onload = () => res(true); img.onerror = () => res(false); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
    if (!loaded) { announce('PNG export failed: the drawing could not be rendered'); return; }
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth || 1600; cv.height = img.naturalHeight || 1000;
    cv.getContext('2d')!.drawImage(img, 0, 0);
    const blob: Blob | null = await new Promise((res) => cv.toBlob(res, 'image/png'));
    if (!blob) { announce('PNG export failed'); return; }
    await report(props.exportFile(`${baseName}.png`, new Uint8Array(await blob.arrayBuffer()), 'image/png'));
  };
  const exportBom = async () => {
    setTab('bom');
    await report(props.exportFile(`${baseName}-bom.csv`, bomCsv(buildBom(sheet)), 'text/csv'));
  };
  const exportSpice = async () => {
    const t = schematicSpice(sheet, props.name || 'NETApps schematic');
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
    if (drag?.kind === 'zoombox') return <rect class="sel-box ghost" x={Math.min(drag.a.x, drag.b.x)} y={Math.min(drag.a.y, drag.b.y)} width={Math.abs(drag.b.x - drag.a.x)} height={Math.abs(drag.b.y - drag.a.y)} />;
    if (drag?.kind === 'vprobe') return <line class="ghost" x1={drag.a.x} y1={drag.a.y} x2={drag.b.x} y2={drag.b.y} stroke-dasharray="4 3" />;
    return null;
  })();

  const filtered = query.trim() ? searchSymbols(query) : SYMBOLS;
  const toolBtn = (t: Tool | 'power' | 'ground', label: string, key: string, onClick: () => void) => (
    <button aria-pressed={t === tool || (t === 'power' && placing?.sym === 'power') || (t === 'ground' && placing?.sym === 'gnd')} title={`${label} (${key})`} onClick={onClick}>{label} <kbd>{key}</kbd></button>
  );
  const status = !result ? null : 'error' in result ? <span class="s-fail">{result.error}</span> : <span class="s-pass">Simulated in {result.ms.toFixed(0)} ms</span>;

  // ---- layout (LTspice-style tiling: results below or beside the schematic, splitter, maximise)
  const centerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLElement>(null);
  const firstChoice = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (pending) afterRender(() => firstChoice.current?.focus()); }, [pending]);
  const beside = prefs.results === 'beside';
  const plotResult = ok && ok.analysis !== 'op' ? ok : null;
  // the results pane is shown when there are waveforms, or always when it is placed beside
  const showResults = !!plotResult || beside || prefs.maximize === 'results';
  const maximize = showResults ? prefs.maximize : 'none';
  const canvasStyle = showResults && maximize === 'none' ? { flex: `0 0 ${(prefs.split * 100).toFixed(1)}%` } : { flex: '1 1 auto' };
  const [plotBox, setPlotBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPlotBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [showResults, maximize]);
  const groups = new Set(traces.map((t) => t.unit)).size || 1;
  // each plot gets an equal share of the pane, leaving room for the header and the table
  const plotHeight = Math.round(Math.min(420, Math.max(100, (plotBox.h - 90 - 26 * (traces.length + 1)) / groups)));
  const onSplitDown = (e: PointerEvent) => {
    const el = centerRef.current;
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const f = beside ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height;
      props.setPrefs({ split: Math.min(0.8, Math.max(0.2, f)) });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const layoutMenu = useRef<HTMLDetailsElement>(null);

  return (
    <div class="sch" onKeyDown={onKeyDown as never} onKeyUp={onKeyUp as never}>
      <div class="sch-tools" role="toolbar" aria-label="Schematic tools">
        {toolBtn('select', 'Select', 'Esc', () => run('escape'))}
        {toolBtn('place', 'Add part', 'A', () => run('add'))}
        {toolBtn('wire', 'Wire', 'W', () => run('wire'))}
        {toolBtn('label', 'Label', 'L', () => run('label'))}
        {toolBtn('note', 'Text', 'T', () => run('note'))}
        {toolBtn('power', 'Power', 'P', () => run('power'))}
        {toolBtn('ground', 'Ground', 'G', () => run('ground'))}
        <span class="sep" />
        <button title="Rotate clockwise (R or Ctrl+R)" onClick={() => run('rotate')}><span aria-hidden="true">⟳</span> Rotate <kbd>R</kbd></button>
        <button title="Rotate counter-clockwise (Shift+R or Ctrl+Shift+R)" onClick={() => run('rotate-ccw')}><span aria-hidden="true">⟲</span> Rotate left <kbd>⇧R</kbd></button>
        <button title="Mirror left–right (X)" onClick={() => run('mirror')}><span aria-hidden="true">⇋</span> Mirror <kbd>X</kbd></button>
        <button title="Flip top–bottom (Y)" onClick={() => run('mirror-v')}><span aria-hidden="true">⇵</span> Flip <kbd>Y</kbd></button>
        <button title="Delete (Del)" onClick={() => run('delete')} disabled={isEmpty(sel)}>Delete</button>
        <span class="sep" />
        {toolBtn('probe-v', 'V probe', 'V', () => run('probe-v'))}
        {toolBtn('probe-i', 'I probe', 'I', () => run('probe-i'))}
        <button class="primary" title="Simulate (F5)" onClick={() => run('simulate')} disabled={running}>{running ? '… Simulating' : '▶ Simulate'} <kbd>F5</kbd></button>
        <span class="sep" />
        {toolBtn('pan', '✋ Pan', 'H', () => run('pan'))}
        {toolBtn('zoom', '⌕ Zoom area', 'Z', () => run('zoom-box'))}
        <button title="Zoom to fit (Home)" onClick={() => run('fit')}>Fit</button>
        <button title="Zoom to the selection (Shift+Home)" onClick={() => run('zoom-sel')} disabled={isEmpty(sel)}>Fit selection</button>
        <details class="menu" ref={menuRef}>
          <summary>Export</summary>
          <div class="menu-list" onClick={() => { if (menuRef.current) menuRef.current.open = false; }}>
            <button onClick={() => run('export-svg')}>Schematic as SVG</button>
            <button onClick={() => run('export-png')}>Schematic as PNG</button>
            <button onClick={() => run('export-spice')}>SPICE netlist (.cir)</button>
            <button onClick={() => run('export-bom')}>Bill of materials (.csv)</button>
            <button onClick={() => void exportCsv()} disabled={!ok || ok.analysis === 'op'}>Waveforms as CSV</button>
            <button onClick={() => run('print')}>Print…</button>
          </div>
        </details>
        <button onClick={() => run('annotate')} title="Renumber references by position">Annotate</button>
        <details class="menu" ref={layoutMenu}>
          <summary>Layout</summary>
          <div class="menu-list" onClick={() => { if (layoutMenu.current) layoutMenu.current.open = false; }}>
            <button aria-pressed={!beside && prefs.maximize === 'none'} onClick={() => run('layout-below')}>Results below the schematic <kbd>Ctrl+Alt+↓</kbd></button>
            <button aria-pressed={beside && prefs.maximize === 'none'} onClick={() => run('layout-beside')}>Results beside the schematic <kbd>Ctrl+Alt+→</kbd></button>
            <button aria-pressed={prefs.maximize === 'schematic'} onClick={() => run('max-schematic')}>Maximise the schematic <kbd>Ctrl+Alt+S</kbd></button>
            <button aria-pressed={prefs.maximize === 'results'} onClick={() => run('max-results')}>Maximise the results <kbd>Ctrl+Alt+W</kbd></button>
            <button aria-pressed={prefs.showLibrary} onClick={() => run('toggle-library')}>Part library panel <kbd>Ctrl+Alt+L</kbd></button>
            <button aria-pressed={prefs.showSide} onClick={() => run('toggle-side')}>Properties panel <kbd>Ctrl+Alt+P</kbd></button>
            <button onClick={() => run('layout-reset')}>Reset the layout</button>
          </div>
        </details>
      </div>
      <div class="sch-body" style={{ gridTemplateColumns: [prefs.showLibrary && 'var(--lib-w)', 'minmax(0, 1fr)', prefs.showSide && 'var(--side-w)'].filter(Boolean).join(' ') }}>
        {prefs.showLibrary && <aside class="sch-lib" aria-label="Part library">
          <input ref={searchRef} type="search" placeholder="Search parts (A)…" aria-label="Search parts" value={query}
                 onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && filtered[0]) {
                     e.preventDefault();
                     startPlace(filtered[0].id);
                     // keyboard placement starts at the origin of an empty sheet, else at the view centre
                     setCursor(sheet.parts.length ? { x: snap(view.x + size.w / view.z / 2), y: snap(view.y + size.h / view.z / 2) } : { x: 0, y: 0 });
                     setKbCursor(true);
                   }
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
        </aside>}
        <div class={`sch-center ${beside ? 'beside' : 'below'}${maximize !== 'none' ? ` max-${maximize}` : ''}`} ref={centerRef}>
          {maximize !== 'results' && (
          <div class="sch-canvas-wrap" style={canvasStyle}>
            <svg ref={svgRef} class={`sch-canvas tool-${tool}`} viewBox={vb} tabindex={0} role="application"
                 aria-label="Schematic canvas. Tab selects parts; arrow keys move; Enter places or edits; letters choose tools (A, W, L, P, G, V, I, R, X)."
                 onPointerDown={onPointerDown as never} onPointerMove={onPointerMove as never} onPointerUp={onPointerUp as never}
                 onWheel={onWheel as never} onDblClick={onDblClick as never} onContextMenu={(e) => { e.preventDefault(); if (tool === 'wire') setWirePts([]); }}>
              <defs>
                <pattern id="sch-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse"><circle cx={0} cy={0} r={0.7} class="grid-dot" /></pattern>
              </defs>
              <rect class="grid-bg" x={view.x} y={view.y} width={size.w / view.z} height={size.h / view.z} fill={view.z > 0.5 ? 'url(#sch-grid)' : 'none'} />
              <SheetContent sheet={shown} view={{ conn, selected: selOf(sel), highlightNet, op: op && ok?.analysis === 'op' ? op : null, showValues, erc: issues, glow, motion, probeLabels }} />
              {ghost}
              {drag?.kind === 'box' && <rect class="sel-box" x={Math.min(drag.a.x, drag.b.x)} y={Math.min(drag.a.y, drag.b.y)} width={Math.abs(drag.b.x - drag.a.x)} height={Math.abs(drag.b.y - drag.a.y)} />}
              {pending && (
                <g class="collision no-export">
                  {pending.overlaps.map(([p, q], i) => <line key={`o${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />)}
                  {pending.points.map((p, i) => <circle key={`p${i}`} cx={p.x} cy={p.y} r={6} />)}
                  {preview === 'around' && pending.around && <polyline class="route-preview" points={pending.around.path.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" />}
                </g>
              )}
              {(kbCursor || tool !== 'select') && <g class="kb-cursor"><line x1={cursor.x - 6} y1={cursor.y} x2={cursor.x + 6} y2={cursor.y} /><line x1={cursor.x} y1={cursor.y - 6} x2={cursor.x} y2={cursor.y + 6} /></g>}
            </svg>
            {!sheet.parts.length && !sheet.wires.length && (
              <div class="sch-empty" role="note">
                <strong>The sheet is empty.</strong>
                <span>Pick a part on the left (or press <kbd>A</kbd>), then click here to place it. Draw wires with <kbd>W</kbd>. Add <kbd>G</kbd> ground, then <kbd>F5</kbd> to simulate.</span>
              </div>
            )}
            {pending && (
              <div class="collide" role="alertdialog" aria-modal="false" aria-labelledby="collide-title" aria-describedby="collide-detail">
                <strong id="collide-title">{pending.title}.</strong>
                <div id="collide-detail" class="small">{pending.detail.map((d) => <p key={d}>{d}</p>)}<p>What do you want to do?</p></div>
                <div class="row wrap">
                  <button ref={firstChoice} onClick={() => choose('connect')} onMouseEnter={() => setPreview('connect')} onFocus={() => setPreview('connect')}>Connect them</button>
                  {pending.around && <button class="primary" onClick={() => choose('around')} onMouseEnter={() => setPreview('around')} onFocus={() => setPreview('around')}>Route around (dashed preview)</button>}
                  <button onClick={() => choose('cancel')} onMouseEnter={() => setPreview(null)} onFocus={() => setPreview(null)}>{pending.cancelLabel}</button>
                </div>
                <label class="small"><input type="checkbox" checked={remember} onChange={(e) => setRemember((e.target as HTMLInputElement).checked)} /> Do the same from now on without asking (Settings → Schematic editor changes it back)</label>
              </div>
            )}
            <div class="nav-kit" role="toolbar" aria-label="View">
              <button aria-label="Pan tool" title="Pan (H; or drag with the right or middle button, or hold Space)" aria-pressed={tool === 'pan'} onClick={() => run('pan')}>✋</button>
              <button aria-label="Zoom in" title="Zoom in (+, wheel)" onClick={() => run('zoom-in')}>+</button>
              <button aria-label="Zoom out" title="Zoom out (−, wheel)" onClick={() => run('zoom-out')}>−</button>
              <button aria-label="Zoom to fit" title="Zoom to fit (Home)" onClick={() => run('fit')}>⤢</button>
              <button aria-label="Rotate selection clockwise" title="Rotate clockwise (R, Ctrl+R)" onClick={() => run('rotate')}>⟳</button>
              <button aria-label="Rotate selection counter-clockwise" title="Rotate counter-clockwise (Shift+R)" onClick={() => run('rotate-ccw')}>⟲</button>
            </div>
            <div class="sch-status small" aria-hidden="true">
              {Math.round(cursor.x)}, {Math.round(cursor.y)} · zoom {Math.round(view.z * 100)} % · {tool === 'wire' ? `wire (${vFirst ? 'vertical' : 'horizontal'} first, / switches)` : tool}
              {hoverText && <> · <strong>{hoverText}</strong></>}
            </div>

          </div>
          )}
          {showResults && maximize !== 'schematic' && (
            <>
              {maximize === 'none' && (
                <div class={`splitter ${beside ? 'v' : 'h'}`} role="separator" tabIndex={0} aria-orientation={beside ? 'vertical' : 'horizontal'}
                     aria-label="Resize the schematic and the results" aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(prefs.split * 100)}
                     onPointerDown={onSplitDown as never} onDblClick={() => props.setPrefs({ split: 0.6 })}
                     onKeyDown={(e) => {
                       const d = (beside ? { ArrowLeft: -0.05, ArrowRight: 0.05 } : { ArrowUp: -0.05, ArrowDown: 0.05 }) as Record<string, number>;
                       if (d[e.key] !== undefined) { e.preventDefault(); e.stopPropagation(); props.setPrefs({ split: Math.min(0.8, Math.max(0.2, prefs.split + d[e.key])) }); }
                       if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); props.setPrefs({ split: 0.6 }); }
                     }} />
              )}
              <section class="sch-plot" aria-label="Waveform viewer" ref={plotRef}>
                <div class="row">
                  <h3 class="pane-title">Results{ok && ok.analysis !== 'op' ? ` · ${ok.analysis === 'tran' ? 'Transient' : ok.analysis === 'ac' ? 'AC sweep' : 'DC sweep'}` : ''}</h3>
                  <button onClick={() => run('max-results')} aria-pressed={maximize === 'results'} title="Maximise the results (Ctrl+Alt+W)">{maximize === 'results' ? 'Restore' : 'Maximise'}</button>
                  <button onClick={() => run(beside ? 'layout-below' : 'layout-beside')} title={beside ? 'Results below (Ctrl+Alt+↓)' : 'Results beside (Ctrl+Alt+→)'}>{beside ? 'Move below' : 'Move beside'}</button>
                  <button onClick={() => run('max-schematic')} title="Hide the results (Ctrl+Alt+S)">Hide</button>
                  {plotResult && !sheet.probes.length && <span class="small muted">Showing the named nets. Press V and click a wire to choose what to plot.</span>}
                </div>
                {plotResult ? (traces.length ? (
                  <Plot x={plotResult.x} xLabel={plotResult.xLabel} xUnit={plotResult.xUnit} log={plotResult.analysis === 'ac'} traces={traces} selected={selTrace} onSelect={setSelTrace}
                        onRemove={(id) => { const pid = id.replace(/:ph$/, ''); if (sheet.probes.some((p) => p.id === pid)) apply({ ...sheet, probes: sheet.probes.filter((p) => p.id !== pid) }, 'Remove probe'); }}
                        onExportCsv={() => void exportCsv()} height={plotHeight} />
                ) : <p class="muted">Nothing to plot: add a probe (V, then click a wire).</p>)
                  : <p class="muted small">Waveforms appear here after a transient, AC or DC-sweep simulation (Simulation tab, then F5). The operating point is shown on the schematic.</p>}
              </section>
            </>
          )}
        </div>
        {prefs.showSide && <aside class="sch-side" aria-label="Properties and simulation">
          {props.tutorial && <TutorialCard step={tutStep} onEnd={props.onTutorialEnd} />}
          {!props.tutorial && props.hint && hintOpen && (
            <div class="tutorial hint" role="note" aria-label="Example hint">
              <p><strong>Try this:</strong> {props.hint}</p>
              <button onClick={() => setHintOpen(false)}>Close</button>
            </div>
          )}
          <div role="tablist" class="tabs">
            {([['props', 'Properties'], ['sim', 'Simulation'], ['erc', `Checks${nErr + nWarn ? ` (${nErr + nWarn})` : ''}`], ['nets', 'Netlist'], ['bom', 'Parts'], ['stress', 'Stress']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} class={id === 'erc' && nErr ? 'has-err' : ''}>{label}</button>
            ))}
          </div>
          {tab === 'props' && <Inspector sheet={sheet} sel={sel} conn={conn} op={op} apply={apply} valueRef={valueRef} setOverride={setOverride} onProbe={(p) => addProbe(p)} colour={colourFor()} />}
          {tab === 'sim' && (
            <SimPanel sheet={sheet} apply={apply} running={running} status={status} live={live} setLive={setLive} showValues={showValues} setShowValues={setShowValues}
                      run={() => run('simulate')} result={result} op={op} conn={conn} probeLabels={probeLabels} setTool={setTool} held={held} setHeld={setHeld} setOverride={setOverride}
                      playback={tEnd > 0 ? { t: playT ?? tEnd, end: tEnd, playing, setT: (t) => { setPlaying(false); setPlayT(t); }, toggle: () => { if (!playing && (playT === null || playT >= tEnd)) setPlayT(0); setPlaying(!playing); } } : null}
                      onRemoveProbe={(id) => apply({ ...sheet, probes: sheet.probes.filter((p) => p.id !== id) }, 'Remove probe')} />
          )}
          {tab === 'erc' && <ErcPanel issues={issues} onPick={(i) => {
            const ids = sheet.parts.filter((p) => i.refs.includes(p.ref)).map((p) => p.id);
            setSel({ ...noSelection(), parts: ids });
            if (i.at) setView((v) => ({ ...v, x: i.at!.x - size.w / v.z / 2, y: i.at!.y - size.h / v.z / 2 }));
          }} />}
          {tab === 'stress' && <StressPanel stress={stress} derate={derate} setDerate={setDerate} hasRun={!!okResult} onPick={(ref) => { const p = sheet.parts.find((x) => x.ref === ref); if (p) { setSel({ ...noSelection(), parts: [p.id] }); setTab('props'); } }} />}
          {tab === 'bom' && <BomPanel sheet={sheet} onExport={() => run('export-bom')} onPick={(ref) => { const p = sheet.parts.find((x) => x.ref === ref); if (p) { setSel({ ...noSelection(), parts: [p.id] }); setTab('props'); } }} />}
          {tab === 'nets' && <NetsPanel conn={conn} highlight={highlightNet} setHighlight={setHighlightNet} spice={spiceText} onSpice={() => setSpiceText(schematicSpice(sheet, props.name))} />}
        </aside>}
      </div>
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
    if (l.note) return (
      <div class="inspector">
        <h3>Text note</h3>
        <label>Text <input ref={valueRef as never} value={l.name} size={40} onChange={(e) => {
          const v = (e.target as HTMLInputElement).value.trim();
          if (v && v !== l.name) apply({ ...sheet, labels: sheet.labels.map((x) => (x.id === l.id ? { ...x, name: v } : x)) }, `Edit note`);
        }} /></label>
        <p class="small muted">A note is text on the sheet only: it connects to nothing. Move it like a part; Del removes it.</p>
      </div>
    );
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

/** The part's footprint on the board (PCB-02), with what its pads connect to. */
function FootprintField({ part, sheet, apply }: { part: Part; sheet: Sheet; apply: (s: Sheet, label: string) => void }) {
  const choices = footprintChoices(part);
  const cur = footprintOf(part);
  if (!cur) return null;
  const id = `fp-${part.id}`;
  const pad = Object.entries(cur.choice.pins).map(([pin, pads]) => `${symbolOf(part.sym).pins.find((q) => q.id === pin)?.name ?? pin} → ${pads.join(', ')}`).join(' · ');
  return (
    <div class="field">
      {choices.length < 2 ? <span><span class="small muted">Footprint</span><br />{cur.fp.name}</span> : <>
      <label for={id}>Footprint</label>
      <select id={id} value={cur.fp.id} onChange={(e) => {
        const v = (e.target as HTMLSelectElement).value;
        apply(setProps(sheet, part.id, { footprint: v === choices[0].footprint ? '' : v }), `${part.ref} footprint ${v}`);
      }}>
        {choices.map((c) => <option key={c.footprint} value={c.footprint}>{FOOTPRINTS[c.footprint].name}</option>)}
      </select>
      </>}
      <span class="small muted">Pads: {pad}{cur.choice.note ? ` (${cur.choice.note})` : ''}</span>
    </div>
  );
}

function PartInspector({ part, sheet, conn, op, apply, valueRef, setOverride, onProbe, colour }: Omit<InspectorProps, 'sel'> & { part: Part }) {
  const s = symbolOf(part.sym);
  const [refText, setRefText] = useState(part.ref);
  const [refNote, setRefNote] = useState('');
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
    if (d.key === 'spice') {
      const r = v.trim() ? importModel(part.sym, v) : null;
      return (
        <div class="field" key={d.key}>
          <label for={id}>{d.label}</label>
          <textarea id={id} rows={3} spellcheck={false} placeholder=".model 1N4001 D(IS=29.5n RS=73.6m N=1.98 BV=50)" value={v}
                    onChange={(e) => set((e.target as HTMLTextAreaElement).value.trim())} aria-describedby={`${id}-h`} />
          <span id={`${id}-h`} class={`small ${r && 'error' in r ? 's-fail' : 'muted'}`}>
            {!r ? d.help : 'error' in r ? `Not used: ${r.error}.` : `Uses ${r.name} (${r.used.join(', ') || 'defaults'})${r.ignored.length ? `; ignored: ${r.ignored.join(', ')}` : ''}. It replaces the model above.`}
          </span>
        </div>
      );
    }
    if (d.key === 'position' && s.interactive === 'pot') {
      return (
        <div class="field" key={d.key}>
          <PotSlider id={id} label={d.label} value={v} setOverride={setOverride} partId={part.id} onCommit={set} />
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
          <input id={`ref-${part.id}`} value={refText} aria-describedby={`ref-${part.id}-h`} onInput={(e) => { setRefText((e.target as HTMLInputElement).value); setRefNote(''); }}
                 onChange={() => {
                   const r = refText.trim();
                   if (!r || r === part.ref) { setRefText(part.ref); return; }
                   if (sheet.parts.some((p) => p.ref === r && p.id !== part.id)) { setRefNote(`${r} is already used; ${part.ref} kept.`); setRefText(part.ref); return; }
                   setRefNote('');
                   apply(setRef(sheet, part.id, r), `Rename ${part.ref} to ${r}`);
                 }} />
          <span id={`ref-${part.id}-h`} class={`small ${refNote ? 's-warn' : 'muted'}`} role={refNote ? 'status' : undefined}>{refNote}</span>
        </div>
      )}
      {field(s.value, true)}
      {s.params.map((p) => field(p, false))}
      {!s.power && unbuyable(part).map((u) => (
        <p key={u.key} class="small s-warn" role="note">{u.message}{u.options.length > 0 && ': '}
          {u.options.map((o) => <button key={o} class="link" onClick={() => apply(setProps(sheet, part.id, { [u.key]: o }), `${part.ref} ${u.key} = ${o} (standard)`)}>use {o}</button>)}
        </p>
      ))}
      <FootprintField part={part} sheet={sheet} apply={apply} />
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
  const range = parsed !== null ? outOfLimits(def, parsed) : null;
  const bad = def.kind === 'value' && text.trim() !== '' && (parsed === null || range !== null);
  return (
    <div class="field">
      <label for={id}>{def.label}{def.unit ? ` (${def.unit})` : ''}</label>
      <input id={id} ref={inputRef as never} value={text} aria-invalid={bad} aria-describedby={`${id}-h`}
             onInput={(e) => setText((e.target as HTMLInputElement).value)}
             onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setText(value); (e.target as HTMLInputElement).blur(); } }}
             onChange={() => { if (!bad && text.trim()) onSet(text.trim()); else setText(value); }} />
      <span id={`${id}-h`} class={`small ${bad ? 's-fail' : 'muted'}`}>
        {bad ? (range ? `Not allowed: ${range}` : 'Not a value: use 10k, 4k7, 100n, 2.2M…') : parsed !== null && def.unit ? `= ${formatValue(parsed, def.unit)}` : def.help ?? ''}
      </span>
    </div>
  );
}

/**
 * Potentiometer wiper slider (SIM-03). It keeps its own value while it is dragged: the
 * committed property only changes on release, and the re-renders of the live preview must not
 * pull the thumb back. Each input step previews through the override; release commits once.
 */
function PotSlider({ id, label, value, partId, setOverride, onCommit }: {
  id: string; label: string; value: string; partId: string;
  setOverride: InspectorProps['setOverride']; onCommit: (v: string) => void;
}) {
  const committed = Math.min(100, Math.max(0, Math.round(parseValue(value) ?? 50)));
  const [local, setLocal] = useState<number | null>(null);
  const shown = local ?? committed;
  const clear = () => setOverride((o) => { if (!(partId in o)) return o; const n = { ...o }; delete n[partId]; return n; });
  const commit = (nv: number) => {
    setLocal(null);
    clear();
    if (nv !== committed) onCommit(String(nv));
  };
  return (
    <>
      <label for={id}>{label}: <output for={id}>{shown}</output> %</label>
      <input id={id} type="range" min={0} max={100} step={1} value={shown} aria-valuetext={`${shown} %`}
             onInput={(e) => { const nv = Number((e.target as HTMLInputElement).value); setLocal(nv); setOverride((o) => ({ ...o, [partId]: { position: String(nv) } })); }}
             onChange={(e) => commit(Number((e.target as HTMLInputElement).value))}
             onBlur={() => { if (local !== null) commit(local); }} />
    </>
  );
}

/** Parameter sweep (.step): up to three part properties, each over a list or a range; every
 *  combination runs. */
function StepPanel({ sheet, apply }: { sheet: Sheet; apply: (s: Sheet, label: string) => void }) {
  const st: StepSweep = sheet.step ?? { on: false, ref: '', param: 'value', mode: 'list', list: '', start: '', stop: '', step: '' };
  const set = (next: StepSweep, label: string) => apply({ ...sheet, step: next }, label);
  const candidates = sheet.parts.filter((p) => !symbolOf(p.sym).power).flatMap((p) => {
    const sd = symbolOf(p.sym);
    return [sd.value, ...sd.params].filter((d) => d.kind === 'value' || d.kind === 'select').map((d) => ({ ref: p.ref, param: d.key, label: `${p.ref} ${d.label.toLowerCase()}`, def: d, now: p.props[d.key] ?? d.default }));
  });
  // the circuit temperature can be stepped like a part property
  const tempDef: ParamDef = { key: 'value', label: 'Circuit temperature', kind: 'value', unit: '°C', default: '27' };
  candidates.unshift({ ref: TEMP_REF, param: 'value', label: 'circuit temperature (°C)', def: tempDef, now: sheet.temp?.trim() || '27' });
  const { on, more, ...first } = st;
  const axes: StepAxis[] = [first, ...(more ?? [])];
  const setAxes = (next: StepAxis[], label: string) => { const [a0, ...rest] = next; set({ on, ...a0, ...(rest.length ? { more: rest } : {}) }, label); };
  const setAxis = (k: number, a: StepAxis, label: string) => setAxes(axes.map((x, j) => (j === k ? a : x)), label);
  const suggest = (key: string): StepAxis | null => {
    const c = candidates.find((x) => `${x.ref}|${x.param}` === key);
    if (!c) return null;
    // a sensible first list: the options of a model choice, or half, the value and double
    const n = parseValue(c.now);
    const list = c.ref === TEMP_REF ? '-20 27 85'
      : c.def.kind === 'select' ? (c.def.options ?? []).map((o) => o.value).join(' ') : n !== null ? [n / 2, n, n * 2].map((x) => shortValue(x)).join(' ') : c.now;
    return { ref: c.ref, param: c.param, mode: 'list', list, start: '', stop: '', step: '' };
  };
  const counts = axes.map((a) => (a.ref ? stepValues(a) : null));
  const total = counts.reduce((n, c) => n * (c && !('error' in c) ? c.values.length : 1), 1);
  const used = new Set(axes.map((a) => `${a.ref}|${a.param}`));
  return (
    <fieldset>
      <legend>Parameter sweep (.step)</legend>
      <label><input type="checkbox" checked={on} onChange={(e) => set({ ...st, on: (e.target as HTMLInputElement).checked }, (e.target as HTMLInputElement).checked ? 'Parameter sweep on' : 'Parameter sweep off')} /> Run the analysis once per value of a part property</label>
      {on && (
        <>
          {axes.map((a, k) => {
            const cur = candidates.find((c) => c.ref === a.ref && c.param === a.param);
            const vals = counts[k];
            const inp = (label: string, value: string, key: 'list' | 'start' | 'stop' | 'step') => (
              <label class="field">{label}<input value={value} onChange={(e) => setAxis(k, { ...a, [key]: (e.target as HTMLInputElement).value.trim() }, `Step ${key} ${(e.target as HTMLInputElement).value.trim()}`)} /></label>
            );
            return (
              <div class="step-axis" key={k} role="group" aria-label={`Stepped property ${k + 1}`}>
                <div class="row wrap">
                  <label class="field">{k ? `Stepped property ${k + 1}` : 'Stepped property'}
                    <select value={cur ? `${cur.ref}|${cur.param}` : ''} onChange={(e) => { const n = suggest((e.target as HTMLSelectElement).value); if (n) setAxis(k, n, `Step ${n.ref} ${n.param}`); }}>
                      {!cur && <option value="">choose…</option>}
                      {candidates.filter((c) => `${c.ref}|${c.param}` === `${a.ref}|${a.param}` || !used.has(`${c.ref}|${c.param}`)).map((c) => <option key={`${c.ref}|${c.param}`} value={`${c.ref}|${c.param}`}>{c.label}</option>)}
                    </select>
                  </label>
                  <label class="field">Values
                    <select value={a.mode} onChange={(e) => setAxis(k, { ...a, mode: (e.target as HTMLSelectElement).value as StepAxis['mode'] }, 'Step mode')}>
                      <option value="list">a list</option><option value="lin">from, to, step</option><option value="dec">from, to, per decade</option>
                    </select>
                  </label>
                  {k > 0 && <button aria-label={`Remove stepped property ${k + 1}`} title="Remove this property" onClick={() => setAxes(axes.filter((_, j) => j !== k), 'Remove stepped property')}>✕</button>}
                </div>
                {a.mode === 'list'
                  ? <div class="row wrap">{inp(cur?.def.kind === 'select' ? 'Models (separated by spaces)' : 'Values (separated by spaces)', a.list, 'list')}</div>
                  : <div class="row wrap">{inp('From', a.start, 'start')}{inp('To', a.stop, 'stop')}{inp(a.mode === 'dec' ? 'Points per decade' : 'Step', a.step, 'step')}</div>}
                <p class="small muted">{vals && ('error' in vals ? vals.error : `${vals.values.length} values: ${vals.values.join(', ')}${cur?.def.unit ? ` ${cur.def.unit}` : ''}`)}</p>
              </div>
            );
          })}
          <div class="row wrap">
            {axes.length < 3 && <button onClick={() => setAxes([...axes, { ref: '', param: 'value', mode: 'list', list: '', start: '', stop: '', step: '' }], 'Add stepped property')}>＋ Add a property</button>}
            <span class={`small ${total > MAX_RUNS ? 's-fail' : 'muted'}`}>{axes.length > 1 ? `${total} runs (every combination; at most ${MAX_RUNS}). ` : `${total} runs. `}Each probe gets one trace per run.</span>
          </div>
        </>
      )}
    </fieldset>
  );
}

/** Tolerance analysis (Monte Carlo): runs with resistors, capacitors and inductors varied. */
function McPanel({ sheet, apply }: { sheet: Sheet; apply: (s: Sheet, label: string) => void }) {
  const mc: MonteCarlo = sheet.mc ?? { on: false, runs: '20', seed: '1', dist: 'gauss', tolR: '5', tolC: '10', tolL: '10' };
  const set = (next: MonteCarlo, label: string) => apply({ ...sheet, mc: next }, label);
  const varied = sheet.parts.filter((p) => ['resistor', 'potentiometer', 'capacitor', 'capacitor_pol', 'inductor'].includes(p.sym)).length;
  const inp = (label: string, key: 'runs' | 'seed' | 'tolR' | 'tolC' | 'tolL', unit = '') => (
    <label class="field">{label}{unit && ` (${unit})`}<input value={mc[key]} size={5} onChange={(e) => set({ ...mc, [key]: (e.target as HTMLInputElement).value.trim() }, `Tolerance ${key} ${(e.target as HTMLInputElement).value.trim()}`)} /></label>
  );
  return (
    <fieldset>
      <legend>Tolerance analysis (Monte Carlo)</legend>
      <label><input type="checkbox" checked={mc.on} onChange={(e) => set({ ...mc, on: (e.target as HTMLInputElement).checked }, (e.target as HTMLInputElement).checked ? 'Tolerance analysis on' : 'Tolerance analysis off')} /> Run with part values varied within their tolerances</label>
      {mc.on && (
        <>
          <div class="row wrap">
            {inp('Runs', 'runs')}
            {inp('Seed', 'seed')}
            <label class="field">Spread
              <select value={mc.dist} onChange={(e) => set({ ...mc, dist: (e.target as HTMLSelectElement).value as MonteCarlo['dist'] }, 'Tolerance spread')}>
                <option value="gauss">Gaussian (tolerance = 3 σ)</option><option value="uniform">even within ± tolerance</option>
              </select>
            </label>
          </div>
          <div class="row wrap">{inp('Resistors', 'tolR', '± %')}{inp('Capacitors', 'tolC', '± %')}{inp('Inductors', 'tolL', '± %')}</div>
          <p class="small muted">Run 1 uses the drawn values; {varied} part{varied === 1 ? '' : 's'} vary in the others. The same seed gives the same runs. An operating point shows every result over the runs (see Min, Max and Average in the table).{sheet.step?.on ? ' Turn off the parameter sweep to run it.' : ''}</p>
        </>
      )}
    </fieldset>
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
  setOverride: InspectorProps['setOverride'];
  /** Playback of a transient on the schematic (LEDs, motors, servos follow the time shown). */
  playback: { t: number; end: number; playing: boolean; setT: (t: number) => void; toggle: () => void } | null;
}

function SimPanel({ sheet, apply, running, status, live, setLive, showValues, setShowValues, run, result, op, conn, probeLabels, setTool, held, setHeld, onRemoveProbe, setOverride, playback }: SimPanelProps) {
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
      <div class="row wrap">
        {field('Temperature', sheet.temp ?? '', (v) => apply({ ...sheet, temp: v || undefined }, `Temperature ${v || '27'} °C`), '°C',
          sheet.temp?.trim() && parseValue(sheet.temp) !== null ? `semiconductors and resistors at ${formatValue(parseValue(sheet.temp)!, '°C')}` : 'empty: 27 °C (SPICE .temp)')}
      </div>
      {s.type === 'tran' && (
        <div class="row wrap">
          {field('Stop time', s.stop, (v) => set({ ...s, stop: v }, `Stop time ${v}`), 's')}
          {field('Time step', s.step, (v) => set({ ...s, step: v }, `Time step ${v}`), 's', 'empty: stop time / 1000')}
          <label class="field">Start from
            <select value={s.start ?? 'op'} onChange={(e) => set({ ...s, start: (e.target as HTMLSelectElement).value as 'op' | 'zero' }, 'Transient start')}>
              <option value="op">the DC operating point</option>
              <option value="zero">discharged capacitors (power-on)</option>
            </select>
            <span class="small muted">Oscillators such as a 555 astable need "discharged".</span>
          </label>
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
      {playback && (
        <fieldset>
          <legend>Playback on the schematic</legend>
          <p class="small muted">LEDs, motors and servos on the schematic show the time below; a motor's rotor turns at a rate proportional to its torque.</p>
          <div class="row wrap">
            <button aria-pressed={playback.playing} onClick={playback.toggle}>{playback.playing ? '⏸ Pause' : '▶ Play'}</button>
            <input type="range" min={0} max={1000} step={1} value={Math.round((1000 * playback.t) / playback.end)} aria-label="Time shown on the schematic"
                   aria-valuetext={formatValue(playback.t, 's')} onInput={(e) => playback.setT((Number((e.target as HTMLInputElement).value) / 1000) * playback.end)} />
            <span class="small" aria-live="off">t = {formatValue(playback.t, 's')} of {formatValue(playback.end, 's')}</span>
          </div>
        </fieldset>
      )}
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
              <div key={p.id} class="field">
                <PotSlider id={`ctl-${p.id}`} label={`${p.ref} wiper`} value={p.props.position ?? '50'} setOverride={setOverride} partId={p.id}
                           onCommit={(nv) => apply(setProps(sheet, p.id, { position: nv }), `${p.ref} wiper ${nv} %`)} />
              </div>
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
      <StepPanel sheet={sheet} apply={apply} />
      <McPanel sheet={sheet} apply={apply} />
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

function StressPanel({ stress, derate, setDerate, hasRun, onPick }: { stress: ReturnType<typeof smoke> | null; derate: number; setDerate: (n: number) => void; hasRun: boolean; onPick: (ref: string) => void }) {
  if (!hasRun || !stress) return <p class="small muted">Run a simulation (operating point, transient or DC sweep): the stress check compares every part's voltages, currents and power with its maximum ratings.</p>;
  if (stress.note) return <p class="small">{stress.note}</p>;
  const over = stress.rows.filter((r) => r.status === 'over').length, warn = stress.rows.filter((r) => r.status === 'derated').length;
  return (
    <div class="stress">
      <div class="row wrap">
        <strong class={over ? 's-fail' : warn ? 's-warn' : 's-pass'}>{over ? `${over} over the rating` : warn ? `${warn} above ${derate} %` : 'Every part within its ratings'}</strong>
        <label>Warn above <input type="number" min={10} max={100} step={5} value={derate} style={{ width: '4.5em' }} onChange={(e) => setDerate(Math.min(100, Math.max(10, Number((e.target as HTMLInputElement).value) || 80)))} /> % of the rating</label>
      </div>
      <table class="plot-table">
        <thead><tr><th>Part</th><th>Quantity</th><th>Value</th><th>Rating</th><th>% of rating</th></tr></thead>
        <tbody>
          {stress.rows.map((r, k) => (
            <tr key={k} class={r.status === 'over' ? 'stress-over' : r.status === 'derated' ? 'stress-warn' : ''}>
              <td><button class="link" onClick={() => onPick(r.ref)}>{r.ref}</button></td><td>{r.what}</td>
              <td>{formatValue(r.value, r.unit)}</td><td>{formatValue(r.rating, r.unit)}</td>
              <td><span class={r.status === 'over' ? 's-fail' : r.status === 'derated' ? 's-warn' : ''}>{Math.round(r.pct)} %</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="small muted">Peak values for voltages and currents; averages over the run for power and rectifier current. Ratings: datasheet absolute maximums of the built-in models (TO-92 and TO-220 in free air, no heatsink); passives use their rating properties.{stress.unrated.length ? ` No ratings for ${stress.unrated.join(', ')} (imported SPICE models).` : ''}</p>
    </div>
  );
}

function BomPanel({ sheet, onExport, onPick }: { sheet: Sheet; onExport: () => void; onPick: (ref: string) => void }) {
  const lines = useMemo(() => buildBom(sheet), [sheet]);
  if (!lines.length) return <p class="small muted">No parts yet.</p>;
  const total = lines.reduce((a, l) => a + l.qty, 0);
  return (
    <div class="bom">
      <div class="row"><strong>{total} parts, {lines.length} lines</strong><button onClick={onExport}>Export CSV</button></div>
      <table class="plot-table">
        <thead><tr><th>Qty</th><th>References</th><th>Part</th><th>Value</th><th>Details</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.refs.join(' ')}>
              <td>{l.qty}</td>
              <td>{l.refs.map((r, k) => <span key={r}>{k ? ', ' : ''}<button class="link" onClick={() => onPick(r)}>{r}</button></span>)}</td>
              <td>{l.part}</td><td>{l.value}</td><td class="small">{l.details}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="small muted">Generic library parts: the parts catalogue with manufacturer part numbers arrives in Increment 6.</p>
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
