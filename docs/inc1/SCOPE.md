# Increment 1 — scope (step 1 of the increment process, section 22)

- Baseline: prompt v3.7; v3.8 from 5 October 2026 (D16, SS-05(d))
- Started: 5 October 2026
- **Phase 0 gate:** treated as approved with the gate report's conditions. You replied "Please
  continue from here" to the approval request. If you did not mean approval, say so and work
  stops at the gate.
- **Gate conditions carried forward:**
  - The kit list is used as proposed. It first matters in Increment 4 (catalogue), so you can
    still change it before then.
  - The self-hosted runners are still pending; CI jobs that need them are marked "self-hosted".
  - Bundle pushes continue.

## Requirement IDs covered

| Area | IDs |
|---|---|
| App shell, navigator, highlight bus, library browsers, accessibility | UI-01, UI-02, UI-03, UI-17, UI-20, UI-21, UI-22, UI-23 |
| Packaging pipeline, signed offline installers, integrity check, recovery store | SS-01, SS-02, SS-03, SS-04, SS-05, SS-08, SEC-02 |
| CM backbone and data formats | CM-01, CM-02, CM-03, CM-04, CM-09, DATA-01, DATA-02, DATA-03, DATA-04 |
| Offline docs viewer | SS-07 |
| Host checks | HOST-04 |
| Self-diagnosis skeleton | DIAG-01 |
| Invariants exercised | INV-01, INV-03, INV-07 (structure), INV-10 (bundling rules) |

## Work packages (delivered across several sessions)

| WP | Content | Verification |
|---|---|---|
| 1.1 | Rust workspace `core/`: data formats and migration (`ef-schema`), CM backbone and recovery store (`ef-cm`), integrity and signatures (`ef-integrity`), host checks (`ef-host`), self-diagnosis (`ef-diag`) | `cargo test`, clippy with zero warnings, licence audit of dependencies |
| 1.2 | Tauri application shell: navigator, highlight bus, library browsers, docs viewer, themes, font scaling, keyboard map, undo, context help | Unit tests (UI logic), Playwright UI tests, axe accessibility checks, PERF-10 instrumentation |
| 1.3 | Packaging pipeline: pack builder (≤ 1.9 GiB files, zstd), signed manifest, bootstrap installers (Windows EXE, .deb ×2), privileged helper skeleton | CI on hosted runners; signing steps scripted for your infrastructure; VAPP-01/03/04/05 procedures |
| 1.4 | Increment 1 test report (TEST-03), usability scenarios, user-executed procedures, version tag | — |

Status on 5 October 2026:
- WP 1.1, 1.2 and 1.3 are done; see WP1.1_report.md, WP1.2_report.md and WP1.3_report.md.
- WP 1.3 raised F1-01; D16 chose option A (prompt v3.8), implemented.
- The user-executed procedures are in procedures/.

## Out of scope for Increment 1

- Board definitions, flashing and the real helper actions: Increment 2.
- LLM: Increment 3.
- Everything else from Increment 2 onwards.
