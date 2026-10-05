import { describe, expect, it } from 'vitest';
import { ArtefactGraph, HighlightBus } from '../src/core/highlightBus';
import { UndoStack } from '../src/core/undo';
import { Keymap, eventKeys, normaliseKeys } from '../src/core/keymap';
import { clampScale, sanitise, resolvedTheme } from '../src/core/settings';
import { filterItems, facetValues } from '../src/core/library';
import { DocsIndex } from '../src/core/docsIndex';
import { buildModel, visibleIds } from '../src/core/projectModel';
import sample from '../src/sample/acc02.json';

describe('highlight bus (UI-02, PERF-10)', () => {
  const g = new ArtefactGraph();
  for (const id of ['r1', 'b1', 'c1', 'n1']) g.add({ id, kind: 'requirement', label: id });
  g.link('r1', 'b1');
  g.link('b1', 'c1');
  g.link('c1', 'n1');

  it('direct links by default, transitive on request (F0-24a)', () => {
    expect([...g.related('r1', 'direct')]).toEqual(['b1']);
    expect([...g.related('r1', 'transitive')].sort()).toEqual(['b1', 'c1', 'n1']);
  });

  it('notifies every view and measures latency until the last acknowledgement', () => {
    let t = 0;
    const bus = new HighlightBus(g, () => t);
    const seen: string[] = [];
    let seqA = 0, seqB = 0;
    bus.subscribe('a', (h) => { seen.push(`a:${h.selected}`); seqA = h.seq; });
    bus.subscribe('b', (h) => { seen.push(`b:${h.selected}`); seqB = h.seq; });
    bus.select('r1');
    expect(seen.slice(-2)).toEqual(['a:r1', 'b:r1']);
    t = 30; bus.ack('a', seqA);
    expect(bus.lastLatencyMs).toBeNull();
    t = 120; bus.ack('b', seqB);
    expect(bus.lastLatencyMs).toBe(120);
    bus.ack('b', seqB - 1); // stale acks are ignored
    expect(bus.lastLatencyMs).toBe(120);
  });

  it('refuses links to unknown artefacts', () => {
    expect(() => g.link('r1', 'nope')).toThrow();
  });
});

describe('undo/redo (UI-22)', () => {
  it('undoes, redoes and clears redo after a new edit', () => {
    let x = 0;
    const s = new UndoStack(3);
    const inc = (n: number) => ({ label: `+${n}`, apply: () => { x += n; }, revert: () => { x -= n; } });
    s.execute(inc(1)); s.execute(inc(2));
    expect(x).toBe(3);
    expect(s.undo()).toBe('+2'); expect(x).toBe(1);
    expect(s.redo()).toBe('+2'); expect(x).toBe(3);
    s.undo(); s.execute(inc(10));
    expect(s.canRedo).toBe(false); expect(x).toBe(11);
    s.execute(inc(1)); s.execute(inc(1)); s.execute(inc(1));
    expect(s.history.length).toBe(3); // limit
  });
});

describe('keyboard (UI-20)', () => {
  it('normalises shortcuts and rejects conflicts', () => {
    expect(normaliseKeys('shift+ctrl+p')).toBe('Ctrl+Shift+P');
    expect(normaliseKeys('cmd+z')).toBe('Ctrl+Z');
    const k = new Keymap();
    let ran = '';
    k.register({ id: 'undo', title: 'Undo', keys: 'Ctrl+Z', category: 'Edit', run: () => { ran = 'undo'; } });
    expect(() => k.register({ id: 'x', title: 'X', keys: 'ctrl+z', category: 'Edit', run: () => {} })).toThrow(/already used/);
    expect(k.handle('Ctrl+Z')).toBe(true);
    expect(ran).toBe('undo');
    expect(k.search('edit und').map((c) => c.id)).toEqual(['undo']);
  });

  it('maps keyboard events', () => {
    expect(eventKeys({ key: 'P', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBe('Ctrl+Shift+P');
    expect(eventKeys({ key: 'F6', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe('F6');
    expect(eventKeys({ key: 'z', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false })).toBe('Ctrl+Z');
  });
});

describe('settings (UI-21)', () => {
  it('clamps font scale to 80–200 % and sanitises input', () => {
    expect(clampScale(0.5)).toBe(0.8);
    expect(clampScale(2.54)).toBe(2);
    expect(clampScale(1.27)).toBe(1.3);
    expect(sanitise({ theme: 'neon', fontScale: 'big', mode: 'guided' })).toEqual({ theme: 'system', fontScale: 1, highlightMode: 'direct', mode: 'guided' });
    expect(resolvedTheme('system', true)).toBe('dark');
  });
});

describe('library browser filtering (UI-17)', () => {
  const items = [
    { id: 'dht22', name: 'DHT22', facets: { interface: 'single-wire', status: 'active' } },
    { id: 'bme280', name: 'BME280', facets: { interface: 'I²C', status: 'active' } },
    { id: 'mpu6050', name: 'MPU-6050', facets: { interface: 'I²C', status: 'kit part' } },
  ];
  it('combines text search and facets', () => {
    expect(filterItems(items, '', { interface: 'I²C' }).map((i) => i.id)).toEqual(['bme280', 'mpu6050']);
    expect(filterItems(items, 'kit', {}).map((i) => i.id)).toEqual(['mpu6050']);
    expect(facetValues(items, 'status')).toEqual(['active', 'kit part']);
  });
});

describe('docs search (SS-07)', () => {
  const idx = new DocsIndex([
    { id: 'a', title: 'Baselines', body: 'A baseline is a tagged set of versions.' },
    { id: 'b', title: 'Recovery store', body: 'Older versions stay in the recovery store; baselines refer to them.' },
  ]);
  it('ranks title hits first and matches prefixes while typing', () => {
    expect(idx.search('baseline').map((h) => h.id)).toEqual(['a', 'b']);
    expect(idx.search('recov').map((h) => h.id)).toEqual(['b']);
    expect(idx.search('recovery baselines').map((h) => h.id)).toEqual(['b']);
    expect(idx.search('')).toEqual([]);
  });
});

describe('project model (UI-01, INV-08)', () => {
  const { tree, graph } = buildModel(sample as never);
  it('lists every UI-01 artefact group', () => {
    const groups = tree.children!.map((c) => c.id);
    for (const g of ['requirements', 'clarifications', 'blocks', 'parameters', 'code', 'netlist', 'pinmap', 'schematic',
                     'breadboard', 'layout', 'bom', 'scenarios', 'tests', 'documentation', 'history'])
      expect(groups).toContain(g);
  });
  it('links requirement → block → code, and nets ↔ parts from the netlist only', () => {
    expect(graph.related('req:R3', 'direct').has('blk:BLK-CMP')).toBe(true);
    expect(graph.related('req:R3', 'transitive').has('code:src/cmp.cpp')).toBe(true);
    expect(graph.related('net:NET_A', 'direct').has('part:J2')).toBe(true);
  });
  it('keyboard tree navigation sees only expanded nodes', () => {
    expect(visibleIds(tree, new Set(['project']))).toHaveLength(1 + tree.children!.length);
  });
});
