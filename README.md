# EmbedForge

An offline-first desktop application that turns a plain-English description and a target
board into a verified, documented Arduino / Raspberry Pi / Pico project: firmware, pin map,
schematic, breadboard, PCB or perfboard, manufacturing files, BOM, emulation and assembly
guide.

Licence: GPL-3.0-or-later (LICENSE file added with the first code, Increment 1).

## Current state
**Phase 0 — reconnaissance (read-only).** No application code is written until you approve
Phase 0.

- Requirements baseline: `docs/requirements/EmbedForge_prompt_v3.7.md`
- v3 review findings (D9): `docs/requirements/v3_review_findings.md`
- Phase 0 tracker and decisions: `docs/phase0/STATUS.md`
- Session log: `docs/SESSION_LOG.md`

## Layout
```
docs/requirements/   build prompt baselines, review findings, change logs
docs/phase0/         Phase 0 deliverables (a)–(o)
tools/               scripts used to produce or check documents
```
