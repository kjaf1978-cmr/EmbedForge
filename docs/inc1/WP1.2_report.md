# Increment 1 · WP 1.2 — Application shell and UI: test report (TEST-03 format)

- Baseline: prompt v3.7
- Date: 5 October 2026
- Code:
  - `app/ui`: Preact + TypeScript + Vite.
  - `app/src-tauri`: Tauri 2 shell over the Rust core.
- Environment: builder container, Linux x86-64, Chromium 1194 for browser tests, Xvfb for the
  native run. Not a Profile A host.
- Human review record (DOC-12): pending

## 1. Evidence summary

| Check | Command | Result |
|---|---|---|
| UI logic unit tests | `npm test` (vitest) | **12 passed** |
| Browser tests incl. accessibility | `npx playwright test` | **10 passed, 5 consecutive runs**. One test was flaky on the first run (an undo race); it was fixed and then stable |
| Type check + production build | `npm run build` | clean; bundle 170 kB JS / 5 kB CSS; no remote resources (only XML namespace strings) |
| Tauri shell tests | `cargo test` (app/src-tauri) | **2 passed** |
| Clippy, warnings as errors | `cargo clippy --all-targets -- -D warnings` | **0 warnings** |
| Native app launch (Linux, Xvfb) | `target/debug/embedforge` | **Starts and talks to the Rust core** (version, diagnostics from the real back-end). Driven by keyboard: Ctrl+Shift+D, Ctrl+Shift+L, F1 |
| Accessibility | axe-core 4.14 on all 7 views, light and dark | **0 serious/critical violations** |
| CI | `.github/workflows/ui.yml` | Written: UI on Ubuntu; shell on Ubuntu 22.04, Windows 2025, Ubuntu arm64. **Not yet run** (repository not connected) |

Screenshots are in `docs/inc1/evidence/`:
- native Linux app (welcome; diagnostics in dark theme);
- browser cross-highlight of R3;
- 1366×768 dark library view.

## 2. Per requirement

| Req | What WP 1.2 delivers | Status | Evidence |
|---|---|---|---|
| UI-01 | Navigator: an ARIA tree of every artefact group in UI-01. Groups not yet delivered name their increment | B | unit `lists every UI-01 artefact group`; e2e `UI-01/02/03 + PERF-10` |
| UI-02 | One highlight bus for all views; direct links by default, transitive in Settings (F0-24(a)) | B | unit `highlight bus …`; e2e `UI-01/02/03`, `F0-24(a)` |
| UI-03 | Artefact view lists related artefacts with navigation; the trace view selects any artefact | B | e2e `UI-01/02/03` (navigates R3 → BLK-CMP) |
| PERF-10 | Latency measured from selection to the last view's repaint acknowledgement, shown in the status bar | P | Measured here: **43 ms** in Chromium, under the 200 ms target. Profile A/B measurement is user-executed (U) |
| UI-17 | Library browsers (boards 11, component models 81, code libraries 33, datasheets 19) with search and filters. Seed data built by script from Phase 0 files and marked "not yet qualified" | B | unit `library browser filtering`; e2e `UI-17` |
| UI-20 | 25 commands, all in the palette; shortcut conflicts rejected; F6 pane cycling; keyboard-only tree navigation | B | unit `keyboard (UI-20)`; e2e `UI-20`, `UI-01/02/03` (keyboard only) |
| UI-21 | Light/dark/system themes; font 80–200 % in 10 % steps; 1366×768 compact layout (F0-24(d)) with no page scroll at 200 % | B | unit `settings (UI-21)`; e2e `UI-21/22`, `HOST-02(e)` |
| UI-22 | Undo/redo stack; every settings change is undoable; no-op changes are not recorded | P | unit `undo/redo`; e2e `UI-21/22`. **Other editors** (requirements, blocks, layout) get their own stacks when they arrive |
| UI-23 | Context help pane per view; F1 opens it | B | e2e `SS-07 + UI-23` |
| SS-07 | Offline documentation: 12 pages (manual, glossary, requirement-writing rules as an original summary) with in-app search | P | unit `docs search`; e2e `SS-07 + UI-23`. **Missing:** library documentation, board pinouts, tutorials, parameter sheets (Increments 2/4/5) |
| HOST-04 | Host-check view; the display size comes from the UI; native back-end call | P | native launch; shell test `host_check_reports_profile`. Windows/Pi 5 detection is user-executed (U) |
| DIAG-01 | Diagnostics view on the real back-end: a dev build is reported as untrusted (unsigned manifest), which is correct | B | shell test `dev_build_trusts_nothing_and_says_so`; screenshot `native-linux-diagnostics-dark.png` |
| INV-01 | No remote resources in the bundle; CSP `default-src 'self'`; no Tauri plugin for file system, shell or HTTP | B | build check; `capabilities/default.json` |

## 3. Decisions taken inside the requirements (please review)

1. **UI stack: Preact + TypeScript + Vite** (all MIT; 170 kB bundle), chosen for a small,
   fast web view on the Pi 5. Canvas/WebGL editors arrive from Increment 4.
2. **Compact layout threshold:** window width below 1500 px. Side panes become overlays,
   closed until opened.
3. **The ACC-02 sample in the navigator is illustrative.** It is labelled "not a generated
   design" and exists only so that the shell can be exercised before Increment 3.

## 4. Remaining Increment 1 work

- **WP 1.3:**
  - packaging pipeline and signed manifest generation;
  - installers (Windows EXE, Ubuntu .deb, Pi OS .deb);
  - privileged-helper skeleton;
  - recovery-store integration at start-up;
  - VAPP-01/03/04/05 procedures.
- **WP 1.4:** the Increment 1 test report, the two usability scenarios (beginner/expert),
  user-executed procedures, and tag v0.1.0.
