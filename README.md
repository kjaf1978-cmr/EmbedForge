# EmbedForge

An offline-first desktop application that turns a plain-English description and a target
board into a verified, documented Arduino / Raspberry Pi / Pico project: firmware, pin map,
schematic, breadboard, PCB or perfboard, manufacturing files, BOM, emulation and assembly
guide.

Licence: GPL-3.0-or-later (LICENSE file added with the first code, Increment 1).

## Current state
**Increment 1 in progress.** Phase 0 is approved with conditions (docs/phase0/phase0_gate_report.md).
WP 1.1 (Rust core), WP 1.2 (application shell and UI) and WP 1.3 (packaging, installers,
privileged-helper skeleton) are done; reports in docs/inc1/. Decision D16 is open.

- Requirements baseline: `docs/requirements/EmbedForge_prompt_v3.7.md`
- v3 review findings (D9): `docs/requirements/v3_review_findings.md`
- Phase 0 tracker and decisions: `docs/phase0/STATUS.md`
- Session log: `docs/SESSION_LOG.md`

## Layout
```
docs/requirements/   build prompt baselines, review findings, change logs
docs/phase0/         Phase 0 deliverables (a)–(o)
docs/inc1/           Increment 1 scope, reports, findings, user-executed procedures
core/                Rust workspace: ef-schema, ef-cm, ef-integrity, ef-host, ef-diag,
                     ef-pack, ef-release, ef-install (embedforge-setup), ef-helper
packaging/           installation media: staging, signing scripts, .deb, specs, CI tests
app/ui/              UI (Preact + TypeScript + Vite), unit and browser tests
app/src-tauri/       Tauri 2 desktop shell
spikes/              Phase 0 evaluation code (not application code)
.github/workflows/   CI
tools/               scripts used to produce or check documents
```
