// Project files of a schematic project (DATA-01..03, INV-08): netlist.json holds the parts and
// their connectivity; geometry.json (views.schematic) holds only geometry and display state.
// On open, the netlist is derived again from the geometry and compared with the stored one.

import { buildNetlist, describeDiff, diffIsEmpty, diffNetlist, type Netlist } from './netlist';
import { symbolOf } from './symbols';
import { emptySheet, type Part, type Sheet } from './schematic';

export interface ProjectFiles {
  'project.json': Record<string, unknown>;
  'netlist.json': Netlist | Record<string, unknown>;
  'geometry.json': Record<string, unknown>;
}

interface GeoPart { ref: string; sym: string; x: number; y: number; rot: number; mirror: boolean; props?: Record<string, string> }

export function toFiles(name: string, sheet: Sheet): ProjectFiles {
  const netlist = buildNetlist(sheet);
  const parts: GeoPart[] = sheet.parts.map((p) => {
    const g: GeoPart = { ref: p.ref, sym: p.sym, x: p.x, y: p.y, rot: p.rot, mirror: p.mirror };
    if (symbolOf(p.sym).power) g.props = { ...p.props }; // power symbols are not netlist parts
    return g;
  });
  return {
    'project.json': {
      schema: 'ef.project@1.0', name, target_board: '', build_style: 'pcb', part_style: 'discrete', status: 'Draft', pinned: {}, board_outline: null,
    },
    'netlist.json': netlist,
    'geometry.json': {
      schema: 'ef.geometry@1.0',
      views: {
        schematic: {
          parts,
          wires: sheet.wires.map((w) => ({ a: w.a, b: w.b })),
          labels: sheet.labels.map((l) => ({ name: l.name, x: l.x, y: l.y, ...(l.note ? { note: true } : {}) })),
          probes: sheet.probes.map((p) => (p.kind === 'i' ? { ...p, part: sheet.parts.find((q) => q.id === p.part)?.ref ?? p.part, id: undefined } : { ...p, id: undefined })),
          sim: sheet.sim,
          ...(sheet.step ? { step: sheet.step } : {}),
          ...(sheet.mc ? { mc: sheet.mc } : {}),
          ...(sheet.temp ? { temp: sheet.temp } : {}),
        },
        ...(sheet.board ? { pcb: sheet.board } : {}),
      },
    },
  };
}

export interface Loaded { sheet: Sheet; notes: string[] }

/** Rebuilds the sheet; reports where the stored netlist disagrees with the geometry. */
export function fromFiles(files: Partial<ProjectFiles>): Loaded {
  const notes: string[] = [];
  const sheet = emptySheet();
  const views = (files['geometry.json'] as { views?: { schematic?: Record<string, unknown>; pcb?: unknown } } | undefined)?.views;
  const geo = views?.schematic;
  const net = files['netlist.json'] as Netlist | undefined;
  if (!geo) return { sheet, notes: net && (net.parts?.length ?? 0) > 0 ? ['This project has a netlist but no schematic drawing yet.'] : [] };
  const props = new Map((net?.parts ?? []).map((p) => [p.ref, p.props]));
  let i = 0;
  const idOf = new Map<string, string>();
  for (const g of (geo.parts as GeoPart[]) ?? []) {
    let s;
    try { s = symbolOf(g.sym); } catch { notes.push(`Unknown symbol ${g.sym} for ${g.ref}: left out.`); continue; }
    const id = `p${i++}`;
    idOf.set(g.ref, id);
    const pr = s.power ? g.props ?? {} : props.get(g.ref);
    if (!s.power && !pr) notes.push(`${g.ref} is drawn but missing from netlist.json: default values used.`);
    const part: Part = { id, ref: g.ref, sym: g.sym, x: g.x, y: g.y, rot: (g.rot % 4) as Part['rot'], mirror: !!g.mirror, props: { ...defaults(s.id), ...(pr ?? {}) } };
    sheet.parts.push(part);
  }
  sheet.wires = ((geo.wires as { a: { x: number; y: number }; b: { x: number; y: number } }[]) ?? []).map((w, k) => ({ id: `w${k}`, a: w.a, b: w.b }));
  sheet.labels = ((geo.labels as { name: string; x: number; y: number; note?: boolean }[]) ?? []).map((l, k) => ({ id: `l${k}`, ...l }));
  sheet.probes = ((geo.probes as Record<string, unknown>[]) ?? []).flatMap((p, k) => {
    const id = `pr${k}`;
    if (p.kind === 'i') { const part = idOf.get(String(p.part)); return part ? [{ ...(p as object), id, part } as Sheet['probes'][number]] : []; }
    return [{ ...(p as object), id } as Sheet['probes'][number]];
  });
  if (geo.sim) sheet.sim = geo.sim as Sheet['sim'];
  if (geo.step) sheet.step = geo.step as Sheet['step'];
  if (geo.mc) sheet.mc = geo.mc as Sheet['mc'];
  if (typeof geo.temp === 'string') sheet.temp = geo.temp;
  if (views?.pcb && typeof views.pcb === 'object') sheet.board = views.pcb as Sheet['board'];
  if (net) {
    const d = diffNetlist(net as Netlist, buildNetlist(sheet));
    if (!diffIsEmpty(d)) notes.push(`netlist.json disagrees with the schematic drawing (${describeDiff(d)}). The drawing is used; saving writes a matching netlist.`);
  }
  return { sheet, notes };
}

function defaults(sym: string): Record<string, string> {
  const s = symbolOf(sym);
  const out: Record<string, string> = { [s.value.key]: s.value.default };
  for (const p of s.params) out[p.key] = p.default;
  return out;
}
