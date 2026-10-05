// UI-01 project navigator model, built from the project files (DATA-01), and the artefact
// graph used by the highlight bus (UI-02). Connectivity comes only from netlist.json (INV-08).

import { ArtefactGraph, type ArtefactKind } from './highlightBus';

export interface ProjectDocs {
  project: { name: string; target_board: string; status: string; build_style: string; part_style: string };
  requirements: { items: { id: string; text: string; verification?: string; tests?: string[] }[] };
  interfaces: { blocks: { id: string; name?: string; template?: string; satisfies?: string[]; code?: string[] }[] };
  parameters: { params: { name: string; value?: unknown; unit: string; used_by?: string[] }[] };
  netlist: { parts: { ref: string; catalogue_id?: string }[]; nets: { name: string; pins: string[] }[] };
}

export interface TreeNode {
  id: string;
  label: string;
  kind?: ArtefactKind;
  children?: TreeNode[];
  /** e.g. "not yet generated", "Increment 4" */
  note?: string;
}

const LATER: [string, string, string][] = [
  ['pinmap', 'Pin map', 'Increment 4'],
  ['schematic', 'Schematic', 'Increment 4'],
  ['breadboard', 'Breadboard', 'Increment 4'],
  ['layout', 'Layout (PCB / perfboard)', 'Increment 6'],
  ['bom', 'BOM', 'Increment 4'],
  ['scenarios', 'Emulation scenarios', 'Increment 5'],
  ['documentation', 'Documentation', 'Increment 7'],
];

export function buildModel(d: ProjectDocs): { tree: TreeNode; graph: ArtefactGraph } {
  const g = new ArtefactGraph();
  const reqs = d.requirements.items.map((r) => {
    g.add({ id: `req:${r.id}`, kind: 'requirement', label: `${r.id} ${r.text}` });
    return { id: `req:${r.id}`, label: `${r.id} ${truncate(r.text)}`, kind: 'requirement' as const };
  });
  const tests = new Map<string, TreeNode>();
  for (const r of d.requirements.items) {
    for (const t of r.tests ?? []) {
      if (!tests.has(t)) {
        g.add({ id: `test:${t}`, kind: 'test', label: t });
        tests.set(t, { id: `test:${t}`, label: t, kind: 'test' });
      }
      g.link(`req:${r.id}`, `test:${t}`);
    }
  }
  const code = new Map<string, TreeNode>();
  const blocks = d.interfaces.blocks.map((b) => {
    g.add({ id: `blk:${b.id}`, kind: 'block', label: b.name ?? b.id });
    for (const r of b.satisfies ?? []) if (g.get(`req:${r}`)) g.link(`blk:${b.id}`, `req:${r}`);
    for (const f of b.code ?? []) {
      if (!code.has(f)) {
        g.add({ id: `code:${f}`, kind: 'code', label: f });
        code.set(f, { id: `code:${f}`, label: f, kind: 'code' });
      }
      g.link(`blk:${b.id}`, `code:${f}`);
    }
    return { id: `blk:${b.id}`, label: `${b.id}${b.template ? ` (${b.template})` : ''}`, kind: 'block' as const };
  });
  const params = d.parameters.params.map((p) => {
    g.add({ id: `par:${p.name}`, kind: 'parameter', label: p.name });
    for (const b of p.used_by ?? []) if (g.get(`blk:${b}`)) g.link(`par:${p.name}`, `blk:${b}`);
    return { id: `par:${p.name}`, label: `${p.name} = ${String(p.value ?? '—')} ${p.unit}`, kind: 'parameter' as const };
  });
  const parts = d.netlist.parts.map((p) => {
    g.add({ id: `part:${p.ref}`, kind: 'part', label: p.ref });
    return { id: `part:${p.ref}`, label: `${p.ref}${p.catalogue_id ? ` · ${p.catalogue_id}` : ''}`, kind: 'part' as const };
  });
  const nets = d.netlist.nets.map((n) => {
    g.add({ id: `net:${n.name}`, kind: 'net', label: n.name });
    for (const pin of n.pins) {
      const ref = pin.split('.')[0];
      if (g.get(`part:${ref}`)) g.link(`net:${n.name}`, `part:${ref}`);
    }
    return { id: `net:${n.name}`, label: `${n.name} (${n.pins.length} pins)`, kind: 'net' as const };
  });
  const group = (id: string, label: string, children: TreeNode[], empty = 'none yet'): TreeNode =>
    children.length ? { id, label: `${label} (${children.length})`, children } : { id, label, children: [], note: empty };
  const tree: TreeNode = {
    id: 'project',
    label: `${d.project.name} — ${d.project.target_board} · ${d.project.status}`,
    children: [
      group('requirements', 'Requirements', reqs),
      { id: 'clarifications', label: 'Clarifications', children: [], note: 'Increment 3' },
      group('blocks', 'Blocks', blocks),
      group('parameters', 'Parameters', params),
      group('code', 'Code', [...code.values()]),
      group('netlist', 'Netlist', [group('parts', 'Parts', parts), group('nets', 'Nets', nets)]),
      ...LATER.map(([id, label, inc]) => ({ id, label, children: [], note: inc })),
      group('tests', 'Tests', [...tests.values()]),
      { id: 'history', label: 'History', children: [], note: 'baselines (Increment 7 view)' },
    ],
  };
  return { tree, graph: g };
}

function truncate(s: string, n = 48): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Depth-first list of visible node ids, used for keyboard navigation in the tree. */
export function visibleIds(n: TreeNode, expanded: Set<string>, out: string[] = []): string[] {
  out.push(n.id);
  if (n.children && expanded.has(n.id)) for (const c of n.children) visibleIds(c, expanded, out);
  return out;
}
