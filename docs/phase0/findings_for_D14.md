# Phase 0 findings requiring decision D14

Sources: (h) h_perf_thresholds.md · (i) i_wireframes.html (5 October 2026).

**F0-21 — PERF-09 on Profile B with microSD** · PERF-09, HOST-03(b)
The estimate from (g) is about 35 min with zstd packs, close to the 40 min limit on microSD.
*Proposed:*
- Keep ≤ 40 min on NVMe.
- Allow ≤ 60 min on microSD; the installer shows the expected duration.

**F0-22 — PERF-05 emulator build for RP2040** · PERF-05, EM-05 (m)
Speeds measured in the builder's container:
- TypeScript engine (rp2040js): about 0.4× real time.
- Native-C engine (rp2350js running in RP2040 mode): about 1.0× real time.

*Proposed:*
- The RP2040 target is met with the native-C emulator engine, which is the one to bundle.
- No change to the numbers.

**F0-23 — DATA-04 part limit** · DATA-04 (h §3)
A hand-estimated ACC-02 Uno-shield BOM has 43 parts, above the 40-part limit. Mega and Pico
variants are estimated at 43–50.
*Proposed:* at most **60 parts** and 120 nets. The outline rule is unchanged: longest side
≤ 110 mm and area ≤ 10 000 mm².

**F0-24 — Wireframe open points** · UI-02, UI-18, UI-16, INV-06, UI-09 (i)
*Proposed:*
- **(a) Cross-highlight depth:** direct links by default; transitive highlighting on request.
- **(b) Guided-mode review step:** views are read-only, with a "Change…" action that returns
  to the step that owns the artefact.
- **(c) Flashing code that is not *Code verified*:** allowed only after an explicit
  confirmation that names the failing gates. The flash log records the override.
- **(d) At 1366×768:** split views are off by default and side panes open as overlays. A
  usability check with the real toolkit is due in Increment 1.
- **(e) Breadboard wire colour code:** red = supply, black = ground, other colours by signal
  class.
