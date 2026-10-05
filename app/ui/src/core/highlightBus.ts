// UI-02 cross-highlight bus. One shared graph of project artefacts; selecting an artefact
// highlights every related artefact in every open view. Default = direct links; transitive on
// request (D14 F0-24(a)). Each view acknowledges after repainting so that the latency from
// selection to the last repaint is measured (PERF-10).

export type ArtefactKind =
  | 'requirement' | 'clarification' | 'block' | 'interface' | 'parameter' | 'code'
  | 'pin' | 'net' | 'part' | 'trace' | 'widget' | 'test' | 'doc' | 'baseline';

export interface Artefact {
  id: string;
  kind: ArtefactKind;
  label: string;
}

export type HighlightMode = 'direct' | 'transitive';

export class ArtefactGraph {
  private nodes = new Map<string, Artefact>();
  private edges = new Map<string, Set<string>>();

  add(a: Artefact): void {
    this.nodes.set(a.id, a);
    if (!this.edges.has(a.id)) this.edges.set(a.id, new Set());
  }

  link(a: string, b: string): void {
    if (!this.nodes.has(a) || !this.nodes.has(b)) throw new Error(`link to unknown artefact: ${a} – ${b}`);
    if (a === b) return;
    this.edges.get(a)!.add(b);
    this.edges.get(b)!.add(a);
  }

  get(id: string): Artefact | undefined {
    return this.nodes.get(id);
  }

  neighbours(id: string): string[] {
    return [...(this.edges.get(id) ?? [])];
  }

  related(id: string, mode: HighlightMode): Set<string> {
    const out = new Set<string>();
    if (!this.nodes.has(id)) return out;
    if (mode === 'direct') {
      for (const n of this.edges.get(id)!) out.add(n);
      return out;
    }
    const queue = [id];
    const seen = new Set([id]);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of this.edges.get(cur)!) {
        if (!seen.has(n)) {
          seen.add(n);
          out.add(n);
          queue.push(n);
        }
      }
    }
    return out;
  }

  get size(): number {
    return this.nodes.size;
  }
}

export interface Highlight {
  selected: string | null;
  related: Set<string>;
  mode: HighlightMode;
  seq: number;
}

type Listener = (h: Highlight) => void;

export class HighlightBus {
  private listeners = new Map<string, Listener>();
  private current: Highlight = { selected: null, related: new Set(), mode: 'direct', seq: 0 };
  private startedAt = 0;
  private pending = new Set<string>();
  /** Mode used when select() is called without one (the user's setting, F0-24(a)). */
  defaultMode: HighlightMode = 'direct';
  /** Milliseconds from the last selection until the last view acknowledged its repaint. */
  lastLatencyMs: number | null = null;

  constructor(private graph: ArtefactGraph, private now: () => number = () => performance.now()) {}

  setGraph(g: ArtefactGraph): void {
    this.graph = g;
    this.select(null);
  }

  subscribe(viewId: string, cb: Listener): () => void {
    this.listeners.set(viewId, cb);
    cb(this.current);
    return () => {
      this.listeners.delete(viewId);
      this.pending.delete(viewId);
    };
  }

  select(id: string | null, mode: HighlightMode = this.defaultMode): Highlight {
    const related = id ? this.graph.related(id, mode) : new Set<string>();
    this.current = { selected: id, related, mode, seq: this.current.seq + 1 };
    this.startedAt = this.now();
    this.pending = new Set(this.listeners.keys());
    this.lastLatencyMs = null;
    for (const cb of this.listeners.values()) cb(this.current);
    if (this.pending.size === 0) this.lastLatencyMs = 0;
    return this.current;
  }

  /** A view calls this after it has repainted for highlight `seq`. */
  ack(viewId: string, seq: number): void {
    if (seq !== this.current.seq || !this.pending.has(viewId)) return;
    this.pending.delete(viewId);
    if (this.pending.size === 0) this.lastLatencyMs = this.now() - this.startedAt;
  }

  get state(): Highlight {
    return this.current;
  }
}
