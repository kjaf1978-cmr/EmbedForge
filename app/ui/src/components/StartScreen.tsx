// Start screen (UI-24): new project, open project, recent projects, examples, tutorial, and
// what this version can and cannot do yet.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { EXAMPLES, type Example } from '../eda/examples';
import { connectivity } from '../eda/connectivity';
import { sheetBounds } from '../eda/editor';
import { SheetContent } from './schematic/SheetSvg';
import type { Backend, ProjectInfo } from '../backend';

interface Props {
  backend: Backend;
  onNew: () => void;
  onTutorial: () => void;
  onExample: (e: Example) => void;
  onOpen: (p: ProjectInfo) => void;
  version: string;
}

export function StartScreen({ backend, onNew, onTutorial, onExample, onOpen, version }: Props) {
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    backend.listProjects().then(setProjects).catch((e) => { setProjects([]); setError(String(e)); });
  }, []);
  return (
    <div class="start">
      <section class="start-hero">
        <h2>Design and simulate circuits — offline</h2>
        <p>Draw a schematic, simulate it (operating point, transient, AC, DC sweep), probe voltages and currents, and export SPICE, SVG or PNG. Everything runs on this computer.</p>
        <div class="row">
          <button class="primary big" onClick={onNew}>New schematic <kbd>Ctrl+N</kbd></button>
          <button class="big" onClick={onTutorial}>Tutorial: your first circuit (5 minutes)</button>
        </div>
      </section>

      <section aria-labelledby="h-recent">
        <h2 id="h-recent">Your projects</h2>
        {projects === null && <p class="muted">Loading…</p>}
        {projects && !projects.length && <p class="muted">No saved projects yet. Start a new schematic or open an example, then save it with Ctrl+S.</p>}
        {projects && projects.length > 0 && (
          <ul class="projects">
            {projects.map((p) => (
              <li key={p.id}><button class="link" onClick={() => onOpen(p)}><strong>{p.name}</strong></button> <span class="small muted">saved {p.modified}</span></li>
            ))}
          </ul>
        )}
        <p class="small muted">{backend.projectsLocation()}</p>
        {error && <p class="small s-fail">{error}</p>}
      </section>

      <section aria-labelledby="h-examples">
        <h2 id="h-examples">Examples</h2>
        <div class="examples">
          {EXAMPLES.map((e) => <ExampleCard key={e.id} ex={e} onOpen={() => onExample(e)} />)}
        </div>
      </section>

      <section class="roadmap" aria-labelledby="h-road">
        <h2 id="h-road">What this version does, and what comes next</h2>
        <p>EmbedForge {version || ''} — Increment 2 of the plan (decision D17: design tools first).</p>
        <ul>
          <li><strong>Now:</strong> schematic editor, electrical rule check, circuit simulator (cross-checked against ngspice), probes and waveform viewer, SPICE/SVG/PNG export, projects under version control.</li>
          <li><strong>Next — Increment 3:</strong> PCB layout and routing (footprints, placement, interactive and automatic routing, design rule check, Gerber files).</li>
          <li><strong>Then:</strong> boards and flashing (4), the natural-language design assistant (5), the parts catalogue and generated circuits (6), firmware emulation (7).</li>
        </ul>
      </section>
    </div>
  );
}

function ExampleCard({ ex, onOpen }: { ex: Example; onOpen: () => void }) {
  const sheet = useMemo(() => ex.build(), [ex]);
  const conn = useMemo(() => connectivity(sheet), [sheet]);
  const b = sheetBounds(sheet) ?? { x0: 0, y0: 0, x1: 100, y1: 100 };
  const pad = 20;
  return (
    <article class="example">
      <button class="example-preview" onClick={onOpen} aria-label={`Open example: ${ex.title}`}>
        <svg viewBox={`${b.x0 - pad} ${b.y0 - pad} ${b.x1 - b.x0 + 2 * pad} ${b.y1 - b.y0 + 2 * pad}`} class="sch-mini" aria-hidden="true">
          <SheetContent sheet={{ ...sheet, probes: [] }} view={{ conn }} />
        </svg>
      </button>
      <h3>{ex.title} <span class={`level ${ex.level}`}>{ex.level}</span></h3>
      <p class="small">{ex.summary}</p>
      <p class="small muted"><strong>Try this:</strong> {ex.tryThis}</p>
      <button onClick={onOpen}>Open</button>
    </article>
  );
}
