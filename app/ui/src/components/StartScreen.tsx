// Start screen (UI-24): new project, open project, recent projects, examples, tutorial, and
// what this version can and cannot do yet.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { EXAMPLES, type Example } from '../eda/examples';
import { connectivity } from '../eda/connectivity';
import { sheetBounds } from '../eda/editor';
import { SheetContent } from './schematic/SheetSvg';
import type { Backend, ProjectInfo } from '../backend';
import { Logo } from './Logo';

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
        <div class="start-brand"><Logo size={56} title="NETApps logo" /><div><p class="start-name">NETApps Electric Simulation</p><h2>Design and simulate circuits — offline</h2></div></div>
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
        <p>NETApps Electric Simulation {version || ''} — Increment 3 of the plan has started (decision D19).</p>
        <ul>
          <li><strong>Now:</strong> schematic editor, electrical rule check, circuit simulator (cross-checked against ngspice) with parameter sweeps (up to three properties), temperature analysis, tolerance analysis, stress check, SPICE model import, probes, waveform viewer with FFT and pulse measurements, motors and servos that move on the schematic with transient playback, transformers (single- and three-phase), relays, motors (DC, AC, servo), protection and power parts (TVS diodes, IGBTs, bridge rectifiers, fuses), installation parts (contactors, circuit breakers and RCDs, surge arresters, PV modules, tapped autotransformers), catalogue values and ratings (E-series) with a rule check, power examples (mains change-over 1P and 3P+N, voltage stabiliser), optocouplers, the TL431, logic gates, parts list, SPICE/SVG/PNG/CSV export, projects under version control.</li>
          <li><strong>In progress — Increment 3:</strong> PCB layout and routing (footprints, placement, interactive and automatic routing, design rule check, Gerber files).</li>
          <li><strong>Increment 4 — boards:</strong> Arduino Uno, Mega and Nano, Raspberry Pi 5, 4, 3 B+ and Zero 2 W, Raspberry Pi Pico family: pin capabilities and limits, symbols, footprints and shield/HAT outlines, detection, flashing and deployment.</li>
          <li><strong>Increment 5 — offline AI design assistant:</strong> a language model built into the app (runs on your computer, no internet) turns a description in plain English into requirements, asks what is unclear, and drives the design.</li>
          <li><strong>Increment 6 — generated designs:</strong> parts catalogue, pin allocation and interfacing on the chosen board, schematic and PCB layout generated from the requirements and verified (ERC, DRC).</li>
          <li><strong>Increment 7 — board emulation:</strong> Arduino and Raspberry Pi firmware running in the simulator together with the circuit: animated breadboard, virtual multimeter, oscilloscope, logic analyser and serial monitor.</li>
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
      <div class="example-preview" onClick={onOpen} aria-hidden="true">
        <svg viewBox={`${b.x0 - pad} ${b.y0 - pad} ${b.x1 - b.x0 + 2 * pad} ${b.y1 - b.y0 + 2 * pad}`} class="sch-mini" aria-hidden="true">
          <SheetContent sheet={{ ...sheet, probes: [] }} view={{ conn }} />
        </svg>
      </div>
      <h3>{ex.title} <span class={`level ${ex.level}`}>{ex.level}</span></h3>
      <p class="small">{ex.summary}</p>
      <p class="small muted"><strong>Try this:</strong> {ex.tryThis}</p>
      <button onClick={onOpen} aria-label={`Open example: ${ex.title}`}>Open</button>
    </article>
  );
}
