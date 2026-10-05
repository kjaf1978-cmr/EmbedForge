import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ArtefactGraph, Highlight, HighlightBus } from '../core/highlightBus';
import { DocsIndex } from '../core/docsIndex';
import { facetValues, filterItems, type LibraryItem } from '../core/library';
import { FONT_MAX, FONT_MIN, type UiSettings } from '../core/settings';
import type { Backend, DiagSection, HostFinding } from '../backend';
import { Markdown } from './Markdown';

/** Subscribes a view to the highlight bus and acknowledges each repaint (PERF-10). */
function useHighlight(bus: HighlightBus, viewId: string): Highlight {
  const [hl, setHl] = useState<Highlight>(bus.state);
  useEffect(() => bus.subscribe(viewId, setHl), [bus, viewId]);
  useEffect(() => {
    const id = requestAnimationFrame(() => bus.ack(viewId, hl.seq));
    return () => cancelAnimationFrame(id);
  }, [hl, bus, viewId]);
  return hl;
}

const KIND_LABEL: Record<string, string> = {
  requirement: 'Requirements', block: 'Blocks', code: 'Code', test: 'Tests', parameter: 'Parameters', net: 'Nets', part: 'Parts',
};

/** UI-03: the selected artefact with navigation to each related artefact. */
export function ArtefactView({ bus, graph }: { bus: HighlightBus; graph: ArtefactGraph }) {
  const hl = useHighlight(bus, 'artefact');
  if (!hl.selected) return <p class="muted">Select an artefact in the navigator.</p>;
  const a = graph.get(hl.selected);
  const rel = [...hl.related].map((id) => graph.get(id)!).filter(Boolean);
  return (
    <section aria-label="Artefact details">
      <h2>{a?.label}</h2>
      <p class="muted">Kind: {a?.kind} · highlighting: {hl.mode} links</p>
      <h3>Related ({rel.length})</h3>
      <ul class="rel">
        {rel.map((r) => (
          <li key={r.id}><button class="link" onClick={() => bus.select(r.id)}>{r.kind}: {r.label}</button></li>
        ))}
      </ul>
    </section>
  );
}

/** A second view on the same bus: every artefact grouped by kind, lit when related (UI-02). */
export function TraceView({ bus, graph, ids }: { bus: HighlightBus; graph: ArtefactGraph; ids: string[] }) {
  const hl = useHighlight(bus, 'trace');
  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const id of ids) {
      const k = graph.get(id)?.kind ?? 'other';
      m.set(k, [...(m.get(k) ?? []), id]);
    }
    return [...m.entries()];
  }, [ids, graph]);
  return (
    <section aria-label="Trace view" class="trace">
      {groups.map(([k, list]) => (
        <div class="trace-col" key={k}>
          <h3>{KIND_LABEL[k] ?? k}</h3>
          {list.map((id) => {
            const cls = hl.selected === id ? 'chip is-selected' : hl.related.has(id) ? 'chip is-related' : 'chip';
            return <button class={cls} key={id} aria-pressed={hl.selected === id} onClick={() => bus.select(id)}>{id.slice(id.indexOf(':') + 1)}</button>;
          })}
        </div>
      ))}
    </section>
  );
}

const LIB_TABS: [string, string, string[]][] = [
  ['boards', 'Boards', ['logic', 'MCU']],
  ['models', 'Component models', ['interface', 'emulation', 'in EM-03']],
  ['code_libraries', 'Code libraries', ['platform', 'licence']],
  ['datasheets', 'Datasheets', ['manufacturer', 'handling']],
];

/** UI-17 library browsers with search and filters. */
export function LibraryView({ seed }: { seed: Record<string, LibraryItem[]> }) {
  const [tab, setTab] = useState('boards');
  const [q, setQ] = useState('');
  const [facets, setFacets] = useState<Record<string, string>>({});
  const def = LIB_TABS.find((t) => t[0] === tab)!;
  const items = seed[tab] ?? [];
  const shown = filterItems(items, q, facets);
  return (
    <section aria-label="Library browsers">
      <div role="tablist" aria-label="Libraries" class="tabs">
        {LIB_TABS.map(([id, label]) => (
          <button role="tab" aria-selected={tab === id} key={id} onClick={() => { setTab(id); setFacets({}); setQ(''); }}>{label} ({(seed[id] ?? []).length})</button>
        ))}
      </div>
      <div class="filters">
        <input aria-label="Search library" placeholder="Search…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        {def[2].map((f) => (
          <label key={f}>{f}{' '}
            <select value={facets[f] ?? ''} onChange={(e) => setFacets({ ...facets, [f]: (e.target as HTMLSelectElement).value })}>
              <option value="">all</option>
              {facetValues(items, f).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        ))}
        <span class="muted" aria-live="polite">{shown.length} shown</span>
      </div>
      <p class="banner">Seed data from Phase 0 — not yet qualified. Nothing here can be used in a design until it passes qualification.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col">Name</th>{def[2].map((f) => <th scope="col" key={f}>{f}</th>)}<th scope="col">Details</th></tr></thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id}><td>{i.name}</td>{def[2].map((f) => <td key={f}>{i.facets[f] ?? ''}</td>)}<td class="small">{i.text}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** SS-07 offline docs viewer with search. */
export function DocsView({ index, pageId, onPage }: { index: DocsIndex; pageId: string; onPage: (id: string) => void }) {
  const [q, setQ] = useState('');
  const hits = q ? index.search(q) : [];
  const page = index.page(pageId);
  return (
    <section aria-label="Documentation" class="docs">
      <input aria-label="Search documentation" placeholder="Search documentation…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      {q && (
        <ul class="hits" aria-label="Search results">
          {hits.map((h) => <li key={h.id}><button class="link" onClick={() => { onPage(h.id); setQ(''); }}>{h.title}</button><div class="small muted">{h.snippet}</div></li>)}
          {hits.length === 0 && <li class="muted">No page matches.</li>}
        </ul>
      )}
      {page ? <Markdown text={page.body} /> : <p>Page not found.</p>}
    </section>
  );
}

const STATUS_LABEL: Record<string, string> = { pass: 'Pass', warn: 'Warning', fail: 'Fail', not_yet_available: 'Not yet available' };

/** DIAG-01 report view. */
export function DiagView({ backend }: { backend: Backend }) {
  const [rep, setRep] = useState<{ overall: string; sections: DiagSection[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (full: boolean) => { setBusy(true); setRep(await backend.diagnose(full)); setBusy(false); };
  useEffect(() => { void run(false); }, []);
  return (
    <section aria-label="Self-diagnosis">
      <div class="row"><button onClick={() => run(false)} disabled={busy}>Run check</button>
        <button onClick={() => run(true)} disabled={busy}>Full verification</button>
        {rep && <span class={`status s-${rep.overall}`}>Overall: {STATUS_LABEL[rep.overall] ?? rep.overall}</span>}</div>
      {busy && <p aria-live="polite">Checking…</p>}
      {rep?.sections.map((s) => (
        <article key={s.id} class={`diag s-${s.status}`}>
          <h3>({s.id}) {s.title} — {STATUS_LABEL[s.status]}</h3>
          <ul>{s.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
          {s.remediation.length > 0 && <ul class="remedy">{s.remediation.map((r, i) => <li key={i}>→ {r}</li>)}</ul>}
        </article>
      ))}
    </section>
  );
}

/** HOST-04 view. */
export function HostView({ backend }: { backend: Backend }) {
  const [res, setRes] = useState<{ profile: string; findings: HostFinding[] } | null>(null);
  useEffect(() => { void backend.hostCheck([window.screen.width, window.screen.height]).then(setRes); }, []);
  if (!res) return <p aria-live="polite">Checking this computer…</p>;
  return (
    <section aria-label="Host check">
      <p>Profile <strong>{res.profile}</strong> · {res.findings.length === 0 ? 'no shortfalls' : `${res.findings.length} finding(s)`}</p>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Check</th><th scope="col">Required</th><th scope="col">Found</th><th scope="col">Severity</th><th scope="col">Consequence</th></tr></thead>
        <tbody>{res.findings.map((f, i) => <tr key={i}><td>{f.check} <span class="small muted">{f.requirement}</span></td><td>{f.required}</td><td>{f.found}</td><td>{f.severity}</td><td>{f.consequence}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
}

/** UI-21 / F0-24 settings; every change goes through the undo stack (UI-22). */
export function SettingsView({ settings, onChange }: { settings: UiSettings; onChange: (s: UiSettings, label: string) => void }) {
  return (
    <section aria-label="Settings" class="settings">
      <fieldset><legend>Theme</legend>
        {(['system', 'light', 'dark'] as const).map((t) => (
          <label key={t}><input type="radio" name="theme" checked={settings.theme === t} onChange={() => onChange({ ...settings, theme: t }, `Theme: ${t}`)} /> {t}</label>
        ))}
      </fieldset>
      <label>Font size: {Math.round(settings.fontScale * 100)} %{' '}
        <input type="range" min={FONT_MIN} max={FONT_MAX} step={0.1} value={settings.fontScale}
               aria-valuetext={`${Math.round(settings.fontScale * 100)} percent`}
               onChange={(e) => onChange({ ...settings, fontScale: Number((e.target as HTMLInputElement).value) }, 'Font size')} />
      </label>
      <fieldset><legend>Cross-highlighting</legend>
        <label><input type="radio" name="hl" checked={settings.highlightMode === 'direct'} onChange={() => onChange({ ...settings, highlightMode: 'direct' }, 'Highlight: direct')} /> direct links (default)</label>
        <label><input type="radio" name="hl" checked={settings.highlightMode === 'transitive'} onChange={() => onChange({ ...settings, highlightMode: 'transitive' }, 'Highlight: transitive')} /> transitive</label>
      </fieldset>
      <fieldset><legend>Mode</legend>
        <label><input type="radio" name="mode" checked={settings.mode === 'expert'} onChange={() => onChange({ ...settings, mode: 'expert' }, 'Mode: expert')} /> expert</label>
        <label><input type="radio" name="mode" checked={settings.mode === 'guided'} onChange={() => onChange({ ...settings, mode: 'guided' }, 'Mode: guided')} /> guided (steps arrive in Increment 8)</label>
      </fieldset>
    </section>
  );
}
