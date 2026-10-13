import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { HighlightBus } from './core/highlightBus';
import { Keymap, eventKeys } from './core/keymap';
import { DEFAULTS, clampScale, resolvedTheme, sanitise, type UiSettings } from './core/settings';
import { UndoStack } from './core/undo';
import { DocsIndex, type DocPage } from './core/docsIndex';
import { buildModel, type ProjectDocs } from './core/projectModel';
import type { LibraryItem } from './core/library';
import type { Backend, HostFinding, ProjectInfo, StartupStatus } from './backend';
import { StartScreen } from './components/StartScreen';
import { SchematicView, EDITOR_COMMANDS, type EditorApi } from './components/schematic/SchematicView';
import { emptySheet, type Sheet } from './eda/schematic';
import { fromFiles, toFiles } from './eda/project';
import type { Example } from './eda/examples';
import { SimClient } from './sim/client';
import { Navigator } from './components/Navigator';
import { CommandPalette } from './components/CommandPalette';
import { ArtefactView, DiagView, DocsView, HostView, LibraryView, SettingsView, TraceView } from './components/views';
import { Markdown } from './components/Markdown';
import sample from './sample/acc02.json';
import seed from './library/seed.json';

const docFiles = import.meta.glob('./docs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const DOCS: DocPage[] = Object.entries(docFiles).map(([path, body]) => ({
  id: path.split('/').pop()!.replace('.md', ''),
  title: (body.match(/^# (.+)$/m)?.[1] ?? path),
  body,
}));

type View = 'start' | 'schematic' | 'project' | 'library' | 'docs' | 'diagnostics' | 'host' | 'settings';
const VIEW_TITLE: Record<View, string> = {
  start: 'Start', schematic: 'Schematic', project: 'Traceability', library: 'Libraries', docs: 'Documentation', diagnostics: 'Self-diagnosis', host: 'Host check', settings: 'Settings',
};
/** UI-23 context help: view → help page. */
const HELP: Record<View, string> = {
  start: 'welcome', schematic: 'schematic', project: 'navigator', library: 'libraries', docs: 'keyboard', diagnostics: 'diagnostics', host: 'host-check', settings: 'appearance',
};
const PANES = ['navigator', 'workspace', 'help'] as const;

export function App({ backend }: { backend: Backend }) {
  const { tree, graph } = useMemo(() => buildModel(sample as unknown as ProjectDocs), []);
  const artefactIds = useMemo(() => {
    const out: string[] = [];
    const walk = (n: { id: string; kind?: string; children?: unknown[] }) => { if (n.kind) out.push(n.id); (n.children as never[] | undefined)?.forEach(walk); };
    walk(tree);
    return out;
  }, [tree]);
  const bus = useMemo(() => new HighlightBus(graph), [graph]);
  const docs = useMemo(() => new DocsIndex(DOCS), []);
  const undo = useRef(new UndoStack()).current;

  // ---- schematic project (Increment 2): one open document with its own undo stack (UI-22)
  interface Doc { id: string | null; name: string; sheet: Sheet; saved: string; key: string }
  const fresh = (name: string, sheet: Sheet, id: string | null = null, savedSheet: Sheet | null = null): Doc =>
    ({ id, name, sheet, saved: savedSheet ? JSON.stringify(savedSheet) : '', key: `${Date.now()}` });
  const [doc, setDoc] = useState<Doc>(() => fresh('Untitled', emptySheet()));
  const docRef = useRef(doc);
  docRef.current = doc;
  const schUndo = useRef(new UndoStack(500));
  const sim = useMemo(() => new SimClient(), []);
  const editorApi = useRef<EditorApi | null>(null);
  const [tutorial, setTutorial] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [modal, setModal] = useState<null | { kind: 'save-as' } | { kind: 'discard'; then: () => void }>(null);
  const dirty = JSON.stringify(doc.sheet) !== (doc.saved || JSON.stringify(emptySheet()));
  const commitSheet = (next: Sheet, label: string) => {
    const prev = docRef.current.sheet;
    const set = (s: Sheet) => { docRef.current = { ...docRef.current, sheet: s }; setDoc((d) => ({ ...d, sheet: s })); };
    schUndo.current.execute({ label, apply: () => set(next), revert: () => set(prev) });
    force((x) => x + 1);
  };
  const openDoc = (d: Doc, v: View = 'schematic') => { schUndo.current = new UndoStack(500); setDoc(d); setView(v); force((x) => x + 1); };
  const guard = (then: () => void) => { if (dirty) setModal({ kind: 'discard', then }); else then(); };
  const newSchematic = () => guard(() => { setTutorial(false); setNotes([]); openDoc(fresh('Untitled', emptySheet())); });
  const startTutorial = () => guard(() => { setNotes([]); openDoc(fresh('My first circuit', emptySheet())); setTutorial(true); });
  const openExample = (e: Example) => guard(() => { setTutorial(false); setNotes([`Example "${e.title}": ${e.tryThis} Save it (Ctrl+S) to keep your changes as a project.`]); const s = e.build(); openDoc(fresh(e.title, s, null, s)); });
  const openProject = (p: ProjectInfo) => guard(async () => {
    try {
      const r = await backend.loadProject(p.id);
      const l = fromFiles(r.files as never);
      setTutorial(false);
      setNotes(l.notes);
      openDoc(fresh(r.info.name, l.sheet, r.info.id, l.sheet));
      say(`Opened ${r.info.name}`);
    } catch (e) { setNotes([`Could not open ${p.name}: ${String(e)}`]); }
  });
  const saveAs = async (name: string) => {
    try {
      const info = await backend.createProject(name);
      const d = { ...docRef.current, id: info.id, name: info.name };
      docRef.current = d;
      setDoc(d);
      await save(d);
    } catch (e) { setNotes([`Could not create the project: ${String(e)}`]); }
  };
  const save = async (d = docRef.current) => {
    if (!d.id) { setModal({ kind: 'save-as' }); return; }
    try {
      const files = toFiles(d.name, d.sheet);
      const msg = schUndo.current.undoLabel ? `Save: ${schUndo.current.undoLabel}` : 'Save';
      const changed = await backend.saveProject(d.id, files as unknown as Record<string, unknown>, msg.slice(0, 200));
      setDoc((x) => ({ ...x, saved: JSON.stringify(d.sheet) }));
      say(changed ? `Saved ${d.name}` : `${d.name}: no changes to save`);
    } catch (e) { setNotes([`Saving failed: ${String(e)}`]); say('Saving failed'); }
  };
  const activeUndo = () => (view === 'schematic' ? schUndo.current : undo);

  const [settings, setSettingsRaw] = useState<UiSettings>(DEFAULTS);
  const [view, setViewRaw] = useState<View>('start');
  // the schematic editor needs the width: side panes close when it opens
  const setView = (v: View) => { setViewRaw(v); if (v === 'schematic') { setShowNav(false); setShowHelp(false); } else if (v === 'start') setShowNav(false); else if (v === 'project' && !compactRef.current) setShowNav(true); };
  const [docPage, setDocPage] = useState('welcome');
  const [palette, setPalette] = useState(false);
  const [compact, setCompact] = useState(window.innerWidth < 1500);
  const [showNav, setShowNav] = useState(true);
  const [showHelp, setShowHelp] = useState(true);
  const [latency, setLatency] = useState<number | null>(null);
  const [version, setVersion] = useState('');
  const [, force] = useState(0);
  const [announce, setAnnounce] = useState('');

  // SS-08 start-up check (runs in the back-end while the window opens) and HOST-04
  const [startup, setStartup] = useState<StartupStatus | null>(null);
  const [hostIssues, setHostIssues] = useState<HostFinding[]>([]);
  const [bannerClosed, setBannerClosed] = useState(false);
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      const s = await backend.startupStatus();
      if (stop) return;
      setStartup(s);
      if (s.phase === 'running' || s.phase === 'background') setTimeout(poll, 500);
    };
    void poll();
    void backend.hostCheck([window.screen.width, window.screen.height])
      .then((r) => setHostIssues(r.findings.filter((f) => f.severity !== 'advice')));
    return () => { stop = true; };
  }, []);
  useEffect(() => { void backend.appVersion().then(setVersion); void backend.loadSettings().then((s) => s && setSettingsRaw(sanitise(s))); }, []);
  // F0-24(d): in the compact layout the side panes are overlays, closed until asked for
  const compactRef = useRef(compact);
  compactRef.current = compact;
  useEffect(() => { setShowNav(!compact && view === 'project'); setShowHelp(!compact && view !== 'schematic'); }, [compact]);
  useEffect(() => {
    const on = () => setCompact(window.innerWidth < 1500);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useEffect(() => {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    document.documentElement.dataset.theme = resolvedTheme(settings.theme, dark);
    document.documentElement.style.setProperty('--font-scale', String(settings.fontScale));
  }, [settings]);
  useEffect(() => {
    const t = setInterval(() => setLatency(bus.lastLatencyMs), 250);
    return () => clearInterval(t);
  }, [bus]);

  // every settings change is an undoable command (UI-22)
  const settingsNow = useRef(settings);
  settingsNow.current = settings;
  const changeSettings = (next: UiSettings, label: string) => {
    const prev = settingsNow.current;
    if (JSON.stringify(prev) === JSON.stringify(next)) return; // no-op changes are not recorded
    settingsNow.current = next;
    const apply = (s: UiSettings) => { settingsNow.current = s; setSettingsRaw(s); void backend.saveSettings(s); };
    undo.execute({ label, apply: () => apply(next), revert: () => apply(prev) });
    force((x) => x + 1);
  };

  const focusPane = (p: (typeof PANES)[number]) => {
    if (p === 'navigator') setShowNav(true);
    if (p === 'help') setShowHelp(true);
    requestAnimationFrame(() => document.getElementById(`pane-${p}`)?.querySelector<HTMLElement>('[tabindex="0"], button, input, a, [tabindex]')?.focus());
  };
  const cyclePane = (dir: 1 | -1) => {
    const cur = PANES.findIndex((p) => document.getElementById(`pane-${p}`)?.contains(document.activeElement));
    focusPane(PANES[(cur + dir + PANES.length) % PANES.length]);
  };
  const say = (s: string) => setAnnounce(s);

  const keymap = useMemo(() => {
    const k = new Keymap();
    const open = (v: View) => () => { setView(v); if (compact) setShowNav(false); say(`${VIEW_TITLE[v]} opened`); };
    k.register({ id: 'palette', title: 'Command palette', keys: 'Ctrl+Shift+P', category: 'General', run: () => setPalette(true) });
    k.register({ id: 'focus.nav', title: 'Focus navigator', keys: 'Ctrl+1', category: 'Panes', run: () => focusPane('navigator') });
    k.register({ id: 'focus.work', title: 'Focus workspace', keys: 'Ctrl+2', category: 'Panes', run: () => focusPane('workspace') });
    k.register({ id: 'focus.help', title: 'Focus help pane', keys: 'Ctrl+3', category: 'Panes', run: () => focusPane('help') });
    k.register({ id: 'pane.next', title: 'Next pane', keys: 'F6', category: 'Panes', run: () => cyclePane(1) });
    k.register({ id: 'pane.prev', title: 'Previous pane', keys: 'Shift+F6', category: 'Panes', run: () => cyclePane(-1) });
    k.register({ id: 'toggle.nav', title: 'Show/hide navigator', keys: 'Ctrl+B', category: 'Panes', run: () => setShowNav((x) => !x) });
    k.register({ id: 'toggle.help', title: 'Show/hide help pane', keys: 'Ctrl+Alt+B', category: 'Panes', run: () => setShowHelp((x) => !x) });
    k.register({ id: 'view.start', title: 'Start screen', category: 'View', run: open('start') });
    k.register({ id: 'view.schematic', title: 'Schematic editor', category: 'View', run: open('schematic') });
    k.register({ id: 'project.new', title: 'New schematic', keys: 'Ctrl+N', category: 'Project', run: () => newSchematicRef.current() });
    k.register({ id: 'project.save', title: 'Save project', keys: 'Ctrl+S', category: 'Project', run: () => void saveRef.current() });
    k.register({ id: 'project.open', title: 'Open project or example (start screen)', keys: 'Ctrl+O', category: 'Project', run: open('start') });
    k.register({ id: 'project.tutorial', title: 'Tutorial: your first circuit', category: 'Help', run: () => tutorialRef.current() });
    for (const c of EDITOR_COMMANDS) {
      k.register({ id: `sch.${c.id}`, title: `${c.title}${c.key ? ` (${c.key})` : ''}`, keys: c.id === 'simulate' ? 'F5' : undefined, category: 'Schematic', run: () => { setView('schematic'); requestAnimationFrame(() => editorApi.current?.run(c.id)); } });
    }
    k.register({ id: 'view.project', title: 'Project: artefact and trace views', keys: 'Ctrl+Shift+E', category: 'View', run: open('project') });
    k.register({ id: 'view.library', title: 'Library browsers', keys: 'Ctrl+L', category: 'View', run: open('library') });
    k.register({ id: 'view.docs', title: 'Documentation', keys: 'Ctrl+Shift+H', category: 'Help', run: open('docs') });
    k.register({ id: 'view.diag', title: 'Self-diagnosis', keys: 'Ctrl+Shift+D', category: 'Tools', run: open('diagnostics') });
    k.register({ id: 'view.host', title: 'Host check', category: 'Tools', run: open('host') });
    k.register({ id: 'view.settings', title: 'Settings', keys: 'Ctrl+,', category: 'General', run: open('settings') });
    k.register({ id: 'help.context', title: 'Help for the current view', keys: 'F1', category: 'Help', run: () => setHelpRequest((x) => x + 1) });
    k.register({ id: 'edit.undo', title: 'Undo', keys: 'Ctrl+Z', category: 'Edit', run: () => { const l = activeUndoRef.current().undo(); say(l ? `Undone: ${l}` : 'Nothing to undo'); force((x) => x + 1); } });
    k.register({ id: 'edit.redo', title: 'Redo', keys: 'Ctrl+Y', category: 'Edit', run: () => { const l = activeUndoRef.current().redo(); say(l ? `Redone: ${l}` : 'Nothing to redo'); force((x) => x + 1); } });
    k.register({ id: 'font.bigger', title: 'Larger font', keys: 'Ctrl+=', category: 'Appearance', run: () => setSettingsRef.current((s) => ({ ...s, fontScale: clampScale(s.fontScale + 0.1) }), 'Font size') });
    k.register({ id: 'font.smaller', title: 'Smaller font', keys: 'Ctrl+-', category: 'Appearance', run: () => setSettingsRef.current((s) => ({ ...s, fontScale: clampScale(s.fontScale - 0.1) }), 'Font size') });
    k.register({ id: 'font.reset', title: 'Default font size', keys: 'Ctrl+0', category: 'Appearance', run: () => setSettingsRef.current((s) => ({ ...s, fontScale: 1 }), 'Font size') });
    k.register({ id: 'theme.toggle', title: 'Switch light/dark theme', keys: 'Ctrl+Shift+L', category: 'Appearance', run: () => setSettingsRef.current((s) => ({ ...s, theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }), 'Theme') });
    k.register({ id: 'hl.toggle', title: 'Switch direct/transitive highlighting', category: 'Project', run: () => setSettingsRef.current((s) => ({ ...s, highlightMode: s.highlightMode === 'direct' ? 'transitive' : 'direct' }), 'Highlight mode') });
    k.register({ id: 'hl.clear', title: 'Clear selection', keys: 'Escape', category: 'Project', run: () => bus.select(null) });
    return k;
  }, [compact]);

  const activeUndoRef = useRef(activeUndo); activeUndoRef.current = activeUndo;
  const newSchematicRef = useRef(newSchematic); newSchematicRef.current = newSchematic;
  const saveRef = useRef(save); saveRef.current = save;
  const tutorialRef = useRef(startTutorial); tutorialRef.current = startTutorial;
  // keyboard commands need the latest settings without rebuilding the keymap
  const setSettingsRef = useRef<(f: (s: UiSettings) => UiSettings, label: string) => void>(() => {});
  setSettingsRef.current = (f, label) => changeSettings(f(settingsNow.current), label);
  const [helpRequest, setHelpRequest] = useState(0);
  useEffect(() => { if (helpRequest) { setDocPage(HELP[view]); setShowHelp(true); focusPane('help'); } }, [helpRequest]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (palette) return;
      const keys = eventKeys(e);
      if (keys === 'Escape' && (document.activeElement as HTMLElement)?.tagName === 'INPUT') return;
      if (keymap.handle(keys)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keymap, palette]);

  // re-select with the configured highlight mode when it changes
  useEffect(() => { bus.defaultMode = settings.highlightMode; if (bus.state.selected) bus.select(bus.state.selected); }, [settings.highlightMode]);

  const navPane = (
    <aside id="pane-navigator" class={`pane nav ${compact ? 'drawer' : ''}`} aria-label="Navigator">
      <h2 class="pane-title">Navigator</h2>
      <Navigator tree={tree} bus={bus} onSelect={(id) => bus.select(id)}
                 onOpen={() => { setView('project'); if (compact) setShowNav(false); }} />
      <p class="small muted">Sample project for Increment 1 — not a generated design.</p>
    </aside>
  );
  const helpPane = (
    <aside id="pane-help" class={`pane help ${compact ? 'drawer right' : ''}`} aria-label="Context help">
      <h2 class="pane-title">Help · {VIEW_TITLE[view]}</h2>
      <div tabIndex={0}><Markdown text={docs.page(HELP[view])?.body ?? ''} /></div>
      <button onClick={() => { setDocPage(HELP[view]); setView('docs'); }}>Open in documentation</button>
    </aside>
  );

  return (
    <div class={`app ${compact ? 'compact' : ''}`}>
      <header class="toolbar" role="toolbar" aria-label="Main toolbar">
        <strong class="brand">EmbedForge</strong>
        <button onClick={() => keymap.run('edit.undo')} disabled={!activeUndo().canUndo} title={`Undo ${activeUndo().undoLabel ?? ''} (Ctrl+Z)`}>↶ Undo</button>
        <button onClick={() => keymap.run('edit.redo')} disabled={!activeUndo().canRedo} title={`Redo ${activeUndo().redoLabel ?? ''} (Ctrl+Y)`}>↷ Redo</button>
        <button onClick={() => void save()} title="Save project (Ctrl+S)">Save{dirty ? ' •' : ''}</button>
        <nav aria-label="Views" class="views">
          {(Object.keys(VIEW_TITLE) as View[]).map((v) => (
            <button key={v} aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>{VIEW_TITLE[v]}</button>
          ))}
        </nav>
        <button onClick={() => setShowNav((x) => !x)} aria-pressed={showNav}>Navigator</button>
        <button onClick={() => setShowHelp((x) => !x)} aria-pressed={showHelp}>Help</button>
        <button onClick={() => setPalette(true)} title="Ctrl+Shift+P">⌘ Commands</button>
      </header>
      {!bannerClosed && <StartupBanner startup={startup} host={hostIssues} onOpen={(v) => setView(v)} onClose={() => setBannerClosed(true)} />}
      <div class="body">
        {showNav && navPane}
        <main id="pane-workspace" class="pane work" aria-label={VIEW_TITLE[view]} tabIndex={-1}>
          <h1 class="view-title" tabIndex={0}>{view === 'schematic' ? `Schematic · ${doc.name}${dirty ? ' (unsaved)' : ''}` : VIEW_TITLE[view]}</h1>
          {notes.length > 0 && (view === 'schematic' || view === 'start') && (
            <div class="banner" role="status">{notes.map((n) => <p key={n}>{n}</p>)}<button onClick={() => setNotes([])}>Dismiss</button></div>
          )}
          {view === 'start' && <StartScreen backend={backend} version={version} onNew={newSchematic} onTutorial={startTutorial} onExample={openExample} onOpen={openProject} />}
          {view === 'schematic' && (
            <SchematicView sheet={doc.sheet} name={doc.name} commit={commitSheet} sim={sim} apiRef={editorApi} announce={say} docKey={doc.key}
                           tutorial={tutorial} onTutorialEnd={() => setTutorial(false)}
                           exportFile={(name, data) => backend.exportFile(doc.id, name, data)} />
          )}
          {view === 'project' && (<div class="split"><ArtefactView bus={bus} graph={graph} /><TraceView bus={bus} graph={graph} ids={artefactIds} /></div>)}
          {view === 'library' && <LibraryView seed={seed as unknown as Record<string, LibraryItem[]>} />}
          {view === 'docs' && <DocsView index={docs} pageId={docPage} onPage={setDocPage} />}
          {view === 'diagnostics' && <DiagView backend={backend} />}
          {view === 'host' && <HostView backend={backend} />}
          {view === 'settings' && <SettingsView settings={settings} onChange={changeSettings} />}
        </main>
        {showHelp && helpPane}
      </div>
      <footer class="status" role="status" aria-label="Status bar">
        <span>{view === 'schematic' ? `${doc.name}${dirty ? ' · unsaved changes' : doc.id ? ' · saved' : ''}` : 'ACC-02 sample · Draft'}</span>
        <span>Highlight: {settings.highlightMode}{latency !== null ? ` · last ${latency.toFixed(0)} ms` : ''}</span>
        <span>{settings.mode === 'guided' ? 'Guided' : 'Expert'} mode</span>
        <span>{compact ? 'Compact layout' : 'Full layout'}</span>
        <span>{integrityLabel(startup)}</span>
        <span class="muted">{version}</span>
      </footer>
      <div class="sr-only" aria-live="polite">{announce}</div>
      {palette && <CommandPalette keymap={keymap} onClose={() => setPalette(false)} />}
      {modal?.kind === 'save-as' && <SaveAsDialog initial={doc.name === 'Untitled' ? '' : doc.name} onCancel={() => setModal(null)} onSave={(n) => { setModal(null); void saveAs(n); }} />}
      {modal?.kind === 'discard' && (
        <div class="overlay" role="dialog" aria-modal="true" aria-label="Unsaved changes">
          <div class="palette dialog">
            <p><strong>{doc.name}</strong> has unsaved changes.</p>
            <div class="row">
              <button class="primary" onClick={() => { const then = modal.then; setModal(null); void save().then(() => { if (docRef.current.id) then(); }); }}>Save</button>
              <button onClick={() => { const then = modal.then; setModal(null); setDoc((d) => ({ ...d, saved: JSON.stringify(d.sheet) })); then(); }}>Discard changes</button>
              <button onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function integrityLabel(s: StartupStatus | null): string {
  if (!s) return 'Integrity: …';
  switch (s.phase) {
    case 'running': return 'Integrity: checking…';
    case 'background': return `Integrity: ${s.checked_full} files checked, background pass running`;
    case 'done': return s.unrecoverable.length ? `Integrity: ${s.unrecoverable.length} not restored` : `Integrity: OK (${s.components} components)`;
    case 'untrusted': return 'Integrity: development build';
    case 'preview': return 'Integrity: desktop app only';
    default: return 'Integrity: error';
  }
}

/** Shown at start-up when SS-08 repaired or could not repair something, or HOST-04 found a shortfall. */
function StartupBanner({ startup, host, onOpen, onClose }: { startup: StartupStatus | null; host: HostFinding[]; onOpen: (v: 'diagnostics' | 'host') => void; onClose: () => void }) {
  const restored = startup?.restored ?? [];
  const lost = startup?.unrecoverable ?? [];
  if (!restored.length && !lost.length && !host.length && startup?.phase !== 'error') return null;
  return (
    <div class="banner startup" role="alert" aria-label="Start-up checks">
      {restored.length > 0 && <p>Start-up integrity check: {restored.length} damaged or missing file(s) were restored from the local recovery store (no network needed): {restored.join(', ')}.</p>}
      {lost.length > 0 && <p><strong>{lost.length} file(s) could not be restored:</strong> {lost.join(', ')}.
        {startup?.needs_elevated_repair ? ' The installation folder is read-only for your account: run “embedforge-setup repair” as administrator.' : ' Reinstall the affected pack from the installation medium.'}</p>}
      {startup?.phase === 'error' && <p>The start-up integrity check failed: {startup.message}</p>}
      {host.length > 0 && <p>Host check: {host.length} shortfall(s) — {host.map((h) => h.check).join(', ')}.</p>}
      <div class="row">
        {(restored.length > 0 || lost.length > 0 || startup?.phase === 'error') && <button onClick={() => onOpen('diagnostics')}>Open self-diagnosis</button>}
        {host.length > 0 && <button onClick={() => onOpen('host')}>Open host check</button>}
        <button onClick={onClose}>Dismiss</button>
      </div>
    </div>
  );
}

function SaveAsDialog({ initial, onSave, onCancel }: { initial: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const ok = name.trim().length > 0 && name.trim().length <= 80;
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-label="Save project">
      <form class="palette dialog" onSubmit={(e) => { e.preventDefault(); if (ok) onSave(name.trim()); }}>
        <label>Project name <input ref={ref} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }} /></label>
        <p class="small muted">The project is saved as a folder with its own version history (one Git commit per save).</p>
        <div class="row"><button class="primary" type="submit" disabled={!ok}>Save</button><button type="button" onClick={onCancel}>Cancel</button></div>
      </form>
    </div>
  );
}
