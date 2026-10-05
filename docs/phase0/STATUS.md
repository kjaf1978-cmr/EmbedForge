# Phase 0 status

Baseline: docs/requirements/EmbedForge_prompt_v3.4.md · Phase 0 is read-only (no application
code).

| Item | Deliverable | Status | Evidence / file |
|---|---|---|---|
| (a) | Licence analysis (linked / aggregated) | **Draft delivered**; UNVERIFIED items listed | phase0/a_licence_analysis.md |
| (b) | x86-64 and arm64 build confirmation | Partial: official-binary availability in (a); builds need CI | phase0/a_licence_analysis.md |
| (c) | LLM model profiles + benchmark | Not started (needs (j); host runs by you) | — |
| (d) | Kit inventory + initial catalogue | **Draft inventory delivered** (10 kits, 81 kit parts + 6 boards). ELEGOO contents UNVERIFIED (packing lists are images). Catalogue follows | phase0/d_kit_inventory.md, .csv |
| (e) | Code, symbol, footprint, datasheet sets | Not started | — |
| (f) | Default fabrication profile | Not started | — |
| (g) | Installer and installed size per OS | Not started | — |
| (h) | PERF / VAPP-06 thresholds, DATA-04 part limit | Not started (host runs by you) | — |
| (i) | UI wireframes UI-01..23 | Not started | — |
| (j) | Draft VAPP-06 corpus | **Draft delivered**: 45 prompts, 148 tagged questions; tools/check_corpus.py PASS (11/11 boards, 9/9 NL-02 types, 45/45 EM-03 parts) | phase0/j_vapp06_corpus.yaml |
| (k) | Risk register | **v0.2.0 delivered** (36 risks, 10 high) | phase0/k_risk_register.md |
| (l) | Block-template library plan | **Draft delivered**: ~65 templates, package format, 12-check qualification suite, ACC coverage | phase0/l_template_plan.md |
| (m) | RP2040/RP2350 emulator evaluation + Pi virtual-clock spike | **Draft delivered**; measured in the container, not Profile A | phase0/m_emulator_evaluation.md, spikes/m/ |
| (n) | Active equivalents | Kit parts added: MFRC522 → PN5180, PCF8591 → ADS1115 + MCP4725, BMP180 → BME280. MPR121 excluded (D12). Still open: BMP280 status, GY-87 magnetometer | phase0/n_active_equivalents.md |
| (o) | Catalogue data sources and terms | **Draft delivered** | phase0/o_catalogue_sources.md |

Next: (c) model benchmark scripts → (e) code/symbol/footprint sets → (f) fabrication profile → (g) sizes → (h) PERF procedures → (i) wireframes.

Actions for you:
- Request CH341SER redistribution permission from WCH (F0-02).
- Ask Raspberry Pi Ltd about Pi OS image redistribution (F0-03).
- Answer Q-01.
- Confirm or correct the frozen kit list in d_kit_inventory.md section 1.
- If you own any of the three ELEGOO kits, send photos of their packing lists so the unverified contents can be confirmed.

## Decisions
| ID | Date | Decision |
|---|---|---|
| D1–D8 | before v3 | Applied in v3 (section 25). |
| D9 | 2026-09-26 | Accept all v3 review resolutions → v3.1 (section 26). |
| D10 | 2026-09-26 | Accept C3-11, F3-06, R-11 spike → v3.2 (section 27). |
| D11 | 2026-09-26 | Accept F0-01..F0-11 → v3.3 (section 28). |
| D12 | 2026-10-05 | Exclude discontinued kit parts with no successor (no active equivalent of the same function and interface) → v3.4 (section 29). Today: MPR121. You confirmed this reading on 2026-10-05 and declined the stricter "manufacturer-named successor" rule. |

## Open questions
| ID | Raised | Question |
|---|---|---|
| Q-01 | 2026-09-26 | You stated the app is for non-commercial use. GPL-3.0-or-later cannot carry a non-commercial restriction: §10 forbids imposing further restrictions, and §7 lets recipients remove them. Is this (1) your intended use only, keeping GPL-3.0-or-later (D5), or (2) a request to change the licence to a non-commercial one? A non-commercial licence would no longer be open source. It would reverse D5 and replace the §7 WebView2 permission (F0-01). It would not change the aggregated GPL tools, the datasheet and distributor-data restrictions, or the excluded research-only models. |
