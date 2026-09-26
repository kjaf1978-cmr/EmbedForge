# Phase 0 (k) — Risk Register and Open Requirement Issues

- Baseline: EmbedForge_prompt_v3.1 (D9 applied)
- Version: 0.1.0 (26 September 2026)
- Prepared by: builder (Claude)
- Status: draft for your review. Human review record (DOC-12): pending.

## 1. Scoring

- Likelihood (L) and Impact (I) are scored 1–5. Score = L × I.
- **High** ≥ 15 · **Medium** 8–14 · **Low** ≤ 7.
- Impact 5 means a protected invariant or an increment gate cannot be met. Impact 3 means a
  PERF target or planned scope slips. Impact 1 is cosmetic.
- "Retired by" names the Phase 0 item or increment whose evidence will close or re-score the
  risk.
- Owner: **B** = builder, **J** = you (Jules).

## 2. New requirement issues found during this item (decision D10 requested)

These came up while preparing the register. I checked both facts against GitHub's current
documentation today.

**C3-11 — GitHub Releases cannot host the 3.9 GB pack files** · SS-01 vs CM-10
GitHub caps each release asset at 2 GiB (1000 assets per release, with no limit on the total).
SS-01 allows pack files up to 3.9 GB, so online distribution through GitHub Releases would
fail.
*Proposed:* Set the pack file limit to ≤ 1.9 GiB everywhere (USB and online). The format is
the same on both routes, the files stay FAT32-safe, and the multi-file rule from F3-03
already handles components that span several files.

**F3-06 — GitHub-hosted runners are too small for the release pipeline** · TEST-01, CM-05(a), SS-01
Standard runners have 14 GB of SSD. Private repositories get 2 cores and 8 GB of RAM; public
repositories get 4 cores and 16 GB. A complete installation medium (tens of GB), full LLM
regression runs (VAPP-06) and KiCad/Freerouting jobs will not fit. On a private repository,
the runners are also below Profile A's minimum RAM.
*Proposed:*
- (a) Hosted runners do compile, unit, static-analysis, emulation and schema jobs, pack by
  pack.
- (b) Two self-hosted runners on your hardware do media assembly, the VAPP-06 corpus and
  profile-level gates: the Profile A PC (x86-64) and a Pi 5 (arm64). Signing already happens
  on that hardware (TEST-04).
- (c) Make the repository public. This fits GPL-3.0-or-later and doubles hosted-runner
  resources. Keep it private until your first review if you prefer.

## 3. Risk register

| ID | Risk (cause → consequence) | Reqs | L | I | Score | Mitigation | Retired by | Owner |
|---|---|---|---|---|---|---|---|---|
| R-01 | Very large total scope (EDA suite, emulators, local LLM, installers for 3 OSs) delivered by one builder across many sessions → schedule overrun, partial increments | all | 5 | 5 | **25 H** | Strict gates; one increment in flight; the repository is the only memory (session log, status tracker); scope cuts proposed at gates rather than silent approximation | Every gate | B/J |
| R-02 | Builder has no repository access from this session → work can't be pushed; CI can't run (TEST-01, TEST-04) | TEST-01, TEST-04 | 5 | 4 | **20 H** | Hand over git bundles that you push; long-term, bind the repository to the Claude session (GitHub integration) so the builder can push and read CI results | Repository connected | J |
| R-03 | Hosted CI too small (F3-06) → release pipeline and VAPP-06 can't run in CI | TEST-01, CM-05 | 5 | 4 | **20 H** | F3-06 proposal (self-hosted runners on Profile A PC and Pi 5) | D10 | J |
| R-04 | GitHub 2 GiB asset limit (C3-11) → online update distribution fails | CM-10, SS-01 | 5 | 4 | **20 H** | Packs ≤ 1.9 GiB | D10 | B |
| R-05 | Small LLM profile on Pi 5 misses NL-02 questions → VAPP-06 recall < 95 % on Profile B | LLM-05, VAPP-06, HOST-03 | 4 | 4 | **16 H** | Deterministic NL-02 detectors for (c) type conflicts, (g) unused signals and (h) capability gaps, so the LLM covers only the semantic types; per-profile thresholds; grammar-constrained output | (c), (j) | B |
| R-06 | Catalogue data sources (distributor/aggregator APIs) forbid redistribution → no offline catalogue with 2 sources and lifecycle status (PC-01) | PC-01, INV-11 | 4 | 5 | **20 H** | Build the catalogue from redistributable sources plus manual curation limited to EM-03, kit and ACC parts; record the source and date per field | (o) | B |
| R-07 | Every catalogue part needs a human-reviewed datasheet or parameter sheet (SS-07) → review workload on you gates the catalogue | SS-07, INV-11 | 4 | 4 | **16 H** | Keep the first-release catalogue small (≈ 150–250 parts); in-app review queue showing the source next to each field; batch reviews per increment | (d), (e) | J |
| R-08 | Most manufacturer datasheets are not redistributable → parameter sheets become the norm, which adds to R-07 | SS-07 | 4 | 3 | 12 M | Parameter-sheet generator with field-level source references | (e) | B |
| R-09 | No qualified RP2350 emulator → Pico 2 / Pico 2 W projects "Verified" with no dynamic verification | TB-02, EM-05 | 4 | 3 | 12 M | Accepted in TB-02 note (HIL-pending); report it clearly in UI-13 | (m) | B |
| R-10 | rp2040js fidelity (PIO, timers, ADC, USB) or time accuracy (EM-06) insufficient for ACC-02 on Pico | EM-05, EM-06, ACC-02 | 3 | 4 | 12 M | Qualification suite per peripheral used by templates; restrict templates to qualified peripherals | (m) | B |
| R-11 | Time-accurate emulation of CPython on Pi targets (virtual time for sleep, GPIO callbacks, IIO) is novel → EM-06 unmet for Pi | EM-05, EM-06, ACC-01 | 3 | 4 | 12 M | Spike in Phase 0: patch time and GPIO backends (gpiozero mock pin factory) under a virtual clock | Add to (m) | B |
| R-12 | Private arm64 KiCad 9+ build and headless kicad-cli on Pi OS are heavy (build time, Qt/wx deps, size) | SS-02, INV-07 | 3 | 4 | 12 M | Evaluate distribution arm64 builds repackaged privately vs. source build; use kicad-cli only (no GUI) for the core path | (b) | B |
| R-13 | Native in-app schematic, breadboard and PCB editors (placement, routing, DRC markers, 3D) take a very large effort | UI-08..10, INV-08 | 5 | 4 | **20 H** | Limit to DATA-04 size, 1–2 layers, THT-first; reuse kicad-cli for DRC and output; Freerouting for autoroute; editors handle geometry only | (i), Inc 4/6 | B |
| R-14 | WebKitGTK WebGL performance on Pi 5 too low for PCB/3D views | UI-10, PERF-10 | 3 | 3 | 9 M | Canvas 2D fallback (section 21); spike during wireframes | (i), (h) | B |
| R-15 | Installed size and offline install time (models, toolchains, KiCad 3D libraries, Pi OS images, GPL source offer) exceed HOST-02(c) 60 GB or PERF-09 | SS-01, PERF-09 | 3 | 3 | 9 M | Measure per component; 3D models only for catalogue parts; optional packs | (g), (h) | B |
| R-16 | GPL-3 obligations for aggregated GPL tools (gcc, avrdude, KiCad, Freerouting, gerbv…) need corresponding source or a written offer → media size or legal gap | Phase 0 (a) | 3 | 4 | 12 M | Ship a written offer plus a source pack on the GitHub release; verify the obligations per component | (a) | B |
| R-17 | LLM weight licences (e.g. use-restricted licences) not redistributable under SS-01/SS-09 | INV-10, (a) | 3 | 4 | 12 M | Shortlist only permissively licensed models (Apache-2.0 / MIT) | (a), (c) | B |
| R-18 | Grammar-constrained decoding lowers quality or speed on small models → PERF-03 or VAPP-06 missed | LLM-05, PERF-03 | 3 | 3 | 9 M | Keep schemas shallow; two-stage extraction; benchmark with and without grammar | (c) | B |
| R-19 | USB driver licences (CH340, CP210x) do not permit bundling → INV-10 exception used | SS-04 | 3 | 2 | 6 L | Exception already accepted (C3-04) | (a) | B |
| R-20 | Windows SmartScreen or antivirus flag bundled tools or the privileged helper → install blocked on a clean offline PC | SS-01, SS-05 | 3 | 3 | 9 M | Authenticode-sign every own binary; submit to Microsoft malware analysis before release; VAPP-01 with Defender on | Inc 1 | B/J |
| R-21 | Kit contents change between kit revisions; many kit parts fail *active* → EM-02 inventory unstable, many substitutions | EM-02, EM-02A | 4 | 3 | 12 M | Freeze the inventory to named kit SKUs and revisions at Phase 0; substitutes chosen once | (d), (n) | B |
| R-22 | Component-model effort (behaviour, symbol, footprint, 3D, widget, qualification) × kit + EM-03 parts | EM-01..03 | 4 | 4 | **16 H** | Classify each part as full model, behavioural stub or not emulated; full models for ACC parts first | (d) | B |
| R-23 | Block-template library too narrow → many user descriptions end in NL-02(i) | LLM-05, LLM-06 | 4 | 3 | 12 M | Template plan driven by EM-03 and kit tutorials; measure coverage on the corpus | (l), (j) | B |
| R-24 | SPICE-reduced behavioural models (EM-05 standard mode) diverge from full SPICE → false passes | EM-05, VER-05 | 2 | 4 | 8 M | Qualification compares reduced and accurate mode per sub-circuit, with a tolerance | Inc 5 | B |
| R-25 | User-executed tests (TEST-02, HIL, Pi 5 PERF, signing) queue behind your availability, including travel → gates wait | TEST-02, ST-06 | 4 | 3 | 12 M | Batch procedures per increment; scripts that print pass/fail with minimal interaction; separate "builder-verified" and "awaiting you" in each report | Every gate | J |
| R-26 | Test matrix: Windows 10/11, Ubuntu 22.04/24.04/26.04, Pi OS Bookworm/Trixie (hosts) × Pi OS Bookworm/Trixie (targets) | HOST-01, TB-02 | 4 | 3 | 12 M | Hosted runners cover the Ubuntu set; VM images for VAPP-01; the Pi OS host matrix is user-executed | (b), (g) | B |
| R-27 | Windows 10 past end of support → WebView2, toolchains or drivers may drop it during the project | HOST-01 | 2 | 3 | 6 L | Pin the fixed-version WebView2; review at each gate | Every gate | B |
| R-28 | Pi 5 8 GB running LLM + KiCad + emulator at once → swapping, PERF missed | HOST-03, PERF | 3 | 3 | 9 M | Unload the LLM after requirement approval; run processes sequentially | (h) | B |
| R-29 | Imaging helper writes to the wrong disk → data loss on your machine | SS-05(a) | 1 | 5 | 5 L | Removable-only guard, boot-medium guard, typed confirmation, VAPP test with a decoy disk | Inc 2 | B |
| R-30 | Emulation speed on Pi 5 (simavr + models + animated UI) below 25 % of real time | PERF-05 | 3 | 3 | 9 M | Decouple UI frame rate from emulation; batch model updates | (m), (h) | B |
| R-31 | Offline signing with a hardware token → every release waits for your manual step | SEC-02, TEST-04 | 5 | 2 | 10 M | One signing script run on the self-hosted Profile A runner with the token attached | Inc 1 | J |
| R-32 | About 300 normative requirement items → traceability overhead at every gate | section 0, TEST-03 | 4 | 2 | 8 M | Machine-readable requirement index generated from the prompt; test reports generated from it | Inc 1 | B |
| R-33 | HAT+ specification details (EEPROM content, stacking rules) incomplete in the local library | PCB-01, BRD-04 | 2 | 3 | 6 L | Collect the current specification and tools in (e) | (e) | B |

## 4. Summary

- High (≥ 15): R-01, R-02, R-03, R-04, R-05, R-06, R-07, R-13, R-22.
- R-02 to R-04 are infrastructure risks you can retire quickly (D10 + repository connection).
- R-06 and R-07 are the largest content risks. They decide whether INV-11 (standard parts
  only) is practical, so (o) and (d) come next.
- Proposed prompt change: add the Pi-target time-virtualisation spike to Phase 0 (m) (R-11).
  This is included in D10.
