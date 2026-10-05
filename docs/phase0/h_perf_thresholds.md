# Phase 0 (h) — PERF targets, VAPP-06 thresholds and the DATA-04 part limit

- Baseline: prompt v3.5
- Version: 0.1.0 (5 October 2026)
- Status: draft. Human review record (DOC-12): pending.

**What Phase 0 can and cannot do here.** The app does not exist yet. Each target below is
therefore assessed from Phase 0 evidence and marked:
- **Plausible**: the evidence supports it.
- **At risk**: evidence suggests it may be missed, with a proposed correction.
- **Pending**: needs measurement.

Every PERF target is measured on Profile A and Profile B at the increment that delivers its
function (TEST-02, user-executed on your hardware). This document fixes **how** each target is
measured, so those measurements are comparable.

## 1. PERF targets

| ID | Target A / B | Phase 0 evidence | Assessment | Measured at | Method (fixed now) |
|---|---|---|---|---|---|
| PERF-01 App cold start | ≤ 10 s / ≤ 20 s | Tauri shell is small; the integrity check is separate (PERF-08) | Plausible | Inc 1 | Reboot host, launch app, stop at the first interactive frame (UI ready event logged). Median of 5 |
| PERF-02 LLM model load | ≤ 60 s / ≤ 120 s | Small Q4 models are about 2.5–3 GiB, large about 5–9 GiB (g). Pi 5 microSD reads about 90 MB/s (est.), so 8B loads in about 60 s | Plausible. On B, microSD with the 8B model is near the limit | (c) now; Inc 3 | `load_s_PERF02` in the (c) benchmark; cold cache (reboot first) |
| PERF-03 Description → requirement draft | ≤ 3 min / ≤ 10 min | (c) harness ready; no measurement yet | **Pending (c)** | (c) now; Inc 3 | `draft_s_max_PERF03` over the corpus ACC entries |
| PERF-04 Compile + flash | ≤ 60 s / ≤ 120 s | AVR builds of template-sized firmware take seconds. Pi deployment includes the offline dependency install | Plausible; Pi-target deployment is the risk | Inc 2 | ACC-02 Uno: clean build + upload, median of 5. Pi target: first deploy, then a re-deploy |
| PERF-05 Emulation rate (standard mode) | ≥ 50 % / ≥ 25 % real time | (m), 2-vCPU container: simavr 4.2–5.7×; RP2040 C engine about 1.0×; TS engine about 0.4× | **AVR: plausible. RP2040: plausible with the C engine only. RP2350: no emulator (HIL-pending)** | Inc 5 | ACC-02 scenarios, ratio reported by the dashboard (EM-06), with the UI animating |
| PERF-06 Autoroute ACC PCB | ≤ 5 min / ≤ 15 min | About 45 parts and 2 layers (section 3): small for Freerouting | Plausible | Inc 6 | ACC-02 Uno shield, Freerouting with fixed passes and seed |
| PERF-07 DRC + Gerber export | ≤ 30 s / ≤ 90 s | kicad-cli on a small 2-layer board | Plausible | Inc 6 | kicad-cli DRC + Gerber/drill export, wall time |
| PERF-08 Start-up integrity check | ≤ 15 s / ≤ 45 s | F3-01 tiering: only executables, libraries, scripts and schemas are hashed, about 1.5–2.5 GiB (est. from (g)). Pi on microSD: about 25 s at 90 MB/s | Plausible; on B with microSD near the limit, so the installer recommends NVMe (HOST-03(b)) | Inc 1 | Cold cache, wall time of the foreground check |
| PERF-09 Offline installation | ≤ 20 min / ≤ 40 min | (g): feasible with zstd packs; Pi microSD about 35 min | Plausible on A; **at risk on B with microSD** | Inc 1 | Clean OS image, USB 3 medium, from bootstrap start to first launch |
| PERF-10 Cross-highlight | ≤ 200 ms / ≤ 500 ms | Highlight bus in the UI; DATA-04 sizes are small | Plausible | Inc 1 / 7 | ACC-02 open in 4 views; select a requirement; time until the last view is repainted (instrumented) |

**Proposed corrections (D14):**
- **PERF-09 Profile B:** keep ≤ 40 min for NVMe. Allow ≤ 60 min on microSD, with the
  installer showing the expected duration.
- **PERF-05:** the RP2040 target applies to the native-C emulator build, not the TypeScript one
  (from (m)). No change to the number.

## 2. VAPP-06 thresholds

| Criterion | Current | Phase 0 status | Proposal |
|---|---|---|---|
| Expected clarification questions raised | ≥ 95 % | Pending real-model results from (c) | Keep. Set the per-profile value from the (c) results at the Phase 0 gate. Profile B may be lower, with the gap made visible (HOST-07(c)) |
| Prompts reaching *Verified-auto* within LLM-04 retries | ≥ 90 % | Not measurable before Increment 7 | Keep; first measured at Increment 7 |
| *Verified-auto* with a design violating an expected outcome | 0 % | Structural: emulation assertions gate VER-05 | Keep |

## 3. DATA-04 part limit — hand-estimated ACC-02 BOM (Uno shield, through-hole, module part style)

| Function | Parts | Count |
|---|---|---|
| Motor supply entry: terminal, reverse-polarity diode, resettable fuse | J1, D5, F1 | 3 |
| Analog inputs A, B: terminal, series R, filter C, clamp diodes ×2 each | J2, R1–R2, C1–C2, D1–D4 | 9 |
| Digital inputs C, D, E: terminal, series R, pull-down R, debounce C | J3, R3–R8, C3–C5 | 10 |
| Digital outputs U, V: terminal, LED + resistor each | J4, R9–R10, LED1–LED2 | 5 |
| Analog output W: PWM RC filter + op-amp buffer + decoupling + terminal | R11, C6, U1, C7, J5 | 5 |
| Motor driver: TB6612FNG module, motor terminal, bulk + ceramic capacitor | M1, J6, C8, C9 | 4 |
| Shield headers (stackable) | 4 strips | 4 |
| Test points (5 V, GND, VM) (PCB-09) | TP1–TP3 | 3 |
| **Total** | | **43** |

- The Mega shield and Pico carrier are similar or larger: more header strips on the Mega,
  level conditioning on the Pico. Estimate 43–50.
- Nets are about 35, well within 120.
- **Finding:** ACC-02 exceeds the 40-part limit as specified.

**Proposed DATA-04 correction (D14):** at most **60 parts**, 120 nets, and an outline with
longest side ≤ 110 mm and area ≤ 10 000 mm². The PERF-06 and PERF-10 assessments above
still hold at 60 parts.
