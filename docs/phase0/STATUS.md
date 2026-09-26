# Phase 0 status

Baseline: docs/requirements/EmbedForge_prompt_v3.2.md · Phase 0 is read-only (no application
code).

| Item | Deliverable | Status | Evidence / file |
|---|---|---|---|
| (a) | Licence analysis (linked / aggregated) | **Draft delivered**; UNVERIFIED items listed | phase0/a_licence_analysis.md |
| (b) | x86-64 and arm64 build confirmation | Partial: official-binary availability in (a); builds need CI | phase0/a_licence_analysis.md |
| (c) | LLM model profiles + benchmark | Not started (needs (j); host runs by you) | — |
| (d) | Kit inventory + initial catalogue | Not started | — |
| (e) | Code, symbol, footprint, datasheet sets | Not started | — |
| (f) | Default fabrication profile | Not started | — |
| (g) | Installer and installed size per OS | Not started | — |
| (h) | PERF / VAPP-06 thresholds, DATA-04 part limit | Not started (host runs by you) | — |
| (i) | UI wireframes UI-01..23 | Not started | — |
| (j) | Draft VAPP-06 corpus | Not started | — |
| (k) | Risk register | **v0.2.0 delivered** (36 risks, 10 high) | phase0/k_risk_register.md |
| (l) | Block-template library plan | Not started | — |
| (m) | RP2040/RP2350 emulator evaluation (+ Pi time-virtualisation spike, if D10) | Not started | — |
| (n) | Active equivalents | Partial: EM-03 and ACC parts; kit parts follow (d) | phase0/n_active_equivalents.md |
| (o) | Catalogue data sources and terms | **Draft delivered** | phase0/o_catalogue_sources.md |

Next: (d) kit inventory and initial catalogue → (m) emulator evaluation + Pi time spike → (l), (j) → (c), (e), (f), (g), (h) → (i).

Actions for you: request CH341SER redistribution permission from WCH (F0-02); ask Raspberry Pi Ltd about Pi OS image redistribution (F0-03).

## Decisions
| ID | Date | Decision |
|---|---|---|
| D1–D8 | before v3 | Applied in v3 (section 25). |
| D9 | 2026-09-26 | Accept all v3 review resolutions → v3.1 (section 26). |
| D10 | 2026-09-26 | Accept C3-11, F3-06, R-11 spike → v3.2 (section 27). |
| D11 | pending | F0-01..F0-11 (phase0/findings_for_D11.md). |
