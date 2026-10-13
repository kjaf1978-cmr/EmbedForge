# NETApps Electric Simulation

(Formerly EmbedForge; renamed by decision D18. The repository keeps its name.)

An offline-first desktop application that turns a plain-English description and a target
board into a verified, documented Arduino / Raspberry Pi / Pico project: firmware, pin map,
schematic, breadboard, PCB or perfboard, manufacturing files, BOM, emulation and assembly
guide.

Licence: GPL-3.0-or-later (LICENSE file added with the first code, Increment 1).

## Current state
**Version 0.2.0: Increment 2, schematic entry and circuit simulation** (decision D17, prompt
v3.9: design tools first).
- Schematic editor with a generic part library and live electrical rule check.
- Circuit simulator: operating point, transient, AC and DC sweep, cross-checked against
  ngspice; probes and a waveform viewer.
- Start screen with examples and a tutorial; projects with version history; SVG, PNG, SPICE
  and CSV export.

Next: Increment 3, PCB layout and routing. Increment 1 (shell, signed offline installers,
integrity check) is delivered as 0.1.0.

- Requirements baseline: `docs/requirements/EmbedForge_prompt_v3.9.md`
- Current increment: `docs/inc2/` (scope, test report, usability)
- Decisions: `docs/phase0/STATUS.md`; session log: `docs/SESSION_LOG.md`

## Layout
```
docs/requirements/   build prompt baselines, review findings, change logs
docs/phase0/         Phase 0 deliverables (a)–(o)
docs/inc1/           Increment 1 scope, reports, findings, user-executed procedures
docs/inc2/           Increment 2 scope, test report, usability
core/                Rust workspace: ef-schema, ef-cm, ef-integrity, ef-host, ef-diag,
                     ef-pack, ef-release, ef-install (embedforge-setup), ef-helper
packaging/           installation media: staging, signing scripts, .deb, specs, CI tests
app/ui/              UI (Preact + TypeScript + Vite), unit and browser tests
app/src-tauri/       Tauri 2 desktop shell
spikes/              Phase 0 evaluation code (not application code)
.github/workflows/   CI
tools/               scripts used to produce or check documents
```
