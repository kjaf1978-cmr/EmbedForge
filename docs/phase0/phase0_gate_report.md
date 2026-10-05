# Phase 0 gate report (draft for your approval)

- Baseline: prompt v3.7 (D15 applied)
- Date: 5 October 2026
- Repository tag: phase0-s7
- Human review record (DOC-12): pending for every Phase 0 document

## 1. Deliverables (a)–(o)

| Item | Status | Builder verification | Awaiting you |
|---|---|---|---|
| (a) Licence analysis | Draft | Primary sources; UNVERIFIED items listed | Review |
| (b) x86-64 / arm64 builds | Partial: official binaries checked | Desk evidence | Build confirmation needs the self-hosted runners (TEST-01) |
| (c) LLM model profiles | Harness delivered | Mock-server self-test 7/7; 7 repositories confirmed | **Run on Profile A and B; send results** |
| (d) Kit inventory | Draft: 10 kits, 81 parts | Desk evidence | Confirm the kit list; ELEGOO packing lists |
| (e) Code / symbol / footprint / datasheet sets | Draft | Licences read from repositories | Review |
| (f) Default fabrication profile | Draft: EF-PROTO-STD v1.0.0 | 5 fabs' published capabilities | Review |
| (g) Installer sizes | Estimates | Published sizes + labelled estimates | Clean-image measurement in CI |
| (h) PERF / VAPP-06 / DATA-04 | Assessed; measurement methods fixed; D14 applied | Evidence from (c), (g), (m) | Measurements at each increment |
| (i) UI wireframes | Draft, 23/23 UI IDs | Rendered at 1920, 1366 and 390 px | Review |
| (j) Draft VAPP-06 corpus | 45 prompts | tools/check_corpus.py PASS | Review the expected questions |
| (k) Risk register | v0.2.0 | Score arithmetic checked | Review |
| (l) Block-template plan | Draft, about 65 templates | — | Review |
| (m) Emulator evaluation | Draft | Measured in the container | — |
| (n) Active equivalents | EM-03, ACC and kit parts done; GY-87 magnetometer open | Manufacturer pages | — |
| (o) Catalogue data sources | Draft | Primary terms pages | — |

## 2. Decisions

- **Taken:** D9–D15 (prompt v3.1 → v3.7). DATA-04 is now 100 parts, which adds a 100-part
  stress project to the PERF measurements (R-37).
- **Pending:** none. D15 answered Q-01: GPL-3.0-or-later for non-commercial use.
- **Licence check:** no requirement is currently limited by the licence.
  - WebView2 is covered by the §7 permission (F0-01).
  - Template output is MIT (F0-12).
  - The only GPL-only code libraries were replaced (F0-13).

## 3. Open external actions

- WCH: CH340 driver redistribution permission (F0-02).
- Raspberry Pi Ltd: Pi OS image redistribution (F0-03).

## 4. Proposed gate decision

**Approve Phase 0 with three entry conditions:**
1. **Before Increment 1:**
   - The kit list confirmed.
   - GitHub repository access for the builder, or continued bundle pushes.
   - Self-hosted runners registered on the Profile A PC and a Pi 5.
2. **Before Increment 3 (LLM integration):** (c) benchmark results from both profiles, the
   model choice per profile and the VAPP-06 thresholds per profile.
3. **Carried into each increment's test report:** the user-executed PERF measurements under
   (h).

Increment 1 does not depend on the LLM benchmark, so it can start while you run the
benchmark.
