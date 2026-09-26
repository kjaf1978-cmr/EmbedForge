# Phase 0 status

Baseline: docs/requirements/EmbedForge_prompt_v3.1.md · Phase 0 is read-only (no application
code).

| Item | Deliverable | Status | Evidence / file |
|---|---|---|---|
| (a) | Licence analysis (linked / aggregated) | Not started | — |
| (b) | x86-64 and arm64 build confirmation | Not started | — |
| (c) | LLM model profiles + benchmark | Not started (needs (j); host runs by you) | — |
| (d) | Kit inventory + initial catalogue | Not started | — |
| (e) | Code, symbol, footprint, datasheet sets | Not started | — |
| (f) | Default fabrication profile | Not started | — |
| (g) | Installer and installed size per OS | Not started | — |
| (h) | PERF / VAPP-06 thresholds, DATA-04 part limit | Not started (host runs by you) | — |
| (i) | UI wireframes UI-01..23 | Not started | — |
| (j) | Draft VAPP-06 corpus | Not started | — |
| (k) | Risk register | **Draft delivered, awaiting your review** | phase0/k_risk_register.md |
| (l) | Block-template library plan | Not started | — |
| (m) | RP2040/RP2350 emulator evaluation (+ Pi time-virtualisation spike, if D10) | Not started | — |
| (n) | Active equivalents | Not started | — |
| (o) | Catalogue data sources and terms | Not started | — |

Proposed order: (k) → (o), (a) → (d), (n) → (b), (m) → (l), (j) → (c), (e), (f), (g), (h) → (i).

## Decisions
| ID | Date | Decision |
|---|---|---|
| D1–D8 | before v3 | Applied in v3 (section 25). |
| D9 | 2026-09-26 | Accept all v3 review resolutions → v3.1 (section 26). |
| D10 | pending | C3-11 (packs ≤ 1.9 GiB), F3-06 (self-hosted runners, public repository), R-11 spike added to (m). |
