# Increment 1 — test report (TEST-03)

- Baseline: prompt v3.8 (v3.7 plus D16)
- Date: 12 October 2026
- Scope: docs/inc1/SCOPE.md. Detail per work package: WP1.1_report.md (Rust core),
  WP1.2_report.md (shell and UI), WP1.3_report.md (packaging, installers, helper).
- Status key:
  - **B** = verified by the builder, with evidence;
  - **P** = partly verified (what is missing is stated);
  - **U** = awaiting user execution (TEST-02);
  - **N** = not verified, with the reason.
- Human review record (DOC-12): pending
- **Gate:** this report is part of the Increment 1 delivery (section 22 step 5). The
  increment is **not complete** until the items in section 5 are done, the main one being a
  signed release, which needs your release keys.

## 1. Evidence summary

| Check | Where | Result |
|---|---|---|
| Rust core tests | `cd core && cargo test --locked` | 58 passed |
| Tauri shell tests | `cd app/src-tauri && cargo test` | 5 passed |
| UI unit tests | `cd app/ui && npm test` | 13 passed |
| Browser tests, incl. axe and both usability scenarios | `npx playwright test` | 13 passed, 3 consecutive runs |
| Lint | clippy `-D warnings`: core and shell, Linux and Windows targets | 0 warnings |
| Licence gate (linked crates) | `tools/check_licences.py core` | PASS, 72 crates |
| Development medium → install → VAPP-03/04/05 → uninstall | builder container (WP 1.3 §1) | PASS |
| CI on GitHub-hosted runners | `core`, `ui`, `package` workflows | see section 2 |

## 2. CI (TEST-01 (a), (b))

The hosted runners first ran these workflows on 5 October; until then they had never run.
They found three real defects, which are fixed:
- hand-built JSON in a helper test broke on Windows paths;
- `minisign` has no Ubuntu 22.04 package;
- the Windows build needs `icons/icon.ico`.

CI status of the last commit is recorded in the session log; the self-hosted jobs
(installation-medium assembly with signing, VAPP-06, profile gates) wait for your runners
(F3-06).

## 3. Per requirement

| Req | Status | Summary | Detail |
|---|---|---|---|
| UI-01 | B | Navigator tree of every UI-01 artefact group; later groups name their increment | WP 1.2 |
| UI-02 | B | One highlight bus; direct links by default, transitive on request | WP 1.2 |
| UI-03 | B | Related artefacts listed and navigable | WP 1.2 |
| UI-17 | B | Library browsers with search and filters; a search that finds nothing names the libraries that match (U-1) | WP 1.2, usability.md |
| UI-20 | B | Every command in the palette; keyboard-only operation | WP 1.2; expert scenario |
| UI-21 | B | Themes, 80–200 % font, compact layout at 1366×768 | WP 1.2; beginner scenario |
| UI-22 | P | Settings fully undoable; other editors arrive with their increments | WP 1.2 |
| UI-23 | B | Context help per view, F1 | WP 1.2 |
| SS-01 | P | Media per host OS, packs ≤ 1.9 GiB spanning parts, signed index, bootstraps, optional packs with consequences, one-run install, local dependency .debs. **Missing:** real dependency sets (CI `collect-deps`), exFAT mount, never-online clean hosts (U) | WP 1.3 |
| SS-02 | P | Increment 1 ships the app; WebView2 terms presented; EmbedForge source on the medium. Bundled runtimes and toolchains arrive with their increments | WP 1.3 |
| SS-03 | B / U | Everything under the install root; audit in the container: 0 files outside | WP 1.3; VAPP-03 |
| SS-04 | P | udev rules, uaccess, group membership; Windows lists the drivers not bundled and the affected boards. Board detection with drivers: Increment 2 | WP 1.3 |
| SS-05 | P | Rights only in the installer; one helper; closed request set; caller check against the signed app; boot-medium guard; .deb allowlist; log; per-user mode with missing functions; **(d) restore implemented (D16)**. (a)–(c) performed from Increment 2; Windows transport Increment 2 | WP 1.3, findings_for_D16.md |
| SS-07 | P | 13 offline pages with search (installation page added); library docs, pinouts and tutorials arrive later | WP 1.2 |
| SS-08 | P | Signed per-component manifests; F3-01 tiers; parallel start-up hashing; background pass; offline repair by the app, or through the helper on system-wide Linux installs; banner, status bar, Repair. **Missing:** Windows system-wide repair by the app (Increment 2); PERF-08 on hosts (U) | WP 1.1, WP 1.3 |
| SEC-02 | P | Verification everywhere; key rotation; signing scripts for your host; your primary and standby public keys are built in (`built_in_release_keys_are_valid_sec02`). **Missing:** a signed release (U) | WP 1.1, WP 1.3 |
| CM-01 | B | Configuration-item kinds | WP 1.1 |
| CM-02 | B | Semantic versions with changelog; immutable versions | WP 1.1 |
| CM-03 | B | App baselines restored in one action, exactly; project baselines as Git tags | WP 1.1, WP 1.3 |
| CM-04 | B | Dependency-checked downgrade, offline | WP 1.1, WP 1.3 |
| CM-09 | B | Content-addressed recovery store; retention with protection of pinned versions | WP 1.1 |
| DATA-01..04 | B | Git project of versioned JSON; migration; no host data; D14 size limits | WP 1.1 |
| HOST-04 | B / U | Checked at installation and at every start-up, with consequences. Windows and Pi 5 detection: U | WP 1.1–1.3 |
| DIAG-01 | P | (a) integrity with full verification and Repair; (f) storage headroom; (b)–(e) name their increments | WP 1.1, WP 1.3 |
| INV-01 | B / U | No network used by the app; installation inside a network namespace without network succeeded | WP 1.3 |
| INV-03 | B | Every configuration item is restorable through the recovery store | WP 1.1, WP 1.3 |
| INV-07 | P | The same code on all hosts; Windows covered by compile and lint checks and the hosted Windows CI job; per-user differences listed | WP 1.3 |
| INV-10 | P | No prerequisite installation on Linux, thanks to the dependency sets (to be collected); drivers not bundled are listed | WP 1.3 |

## 4. App verification (VAPP) and acceptance projects

| ID | Status | Notes |
|---|---|---|
| VAPP-01 | U | procedures/VAPP-01.md. Needs a signed release |
| VAPP-02 | N | Not in Increment 1 scope: nothing is bundled yet that could collide with Arduino IDE, KiCad or Python. Runs from Increment 2 |
| VAPP-03 | B (container) / U | 0 files outside the app and OS directories |
| VAPP-04 | B (container) / U | Deleted and corrupted files restored offline; as an unprivileged user through the helper |
| VAPP-05 | B (container) / U | Update from a USB package; refused rollback named its dependency; baseline restore |
| VAPP-06 | N | LLM corpus: Increment 3. The draft corpus and harness exist (Phase 0 (c), (j)) |
| VAPP-07 | P | Unsigned, wrongly signed and tampered packages are refused (tests). Import validation (SEC-03) and credentials (SEC-01): Increments 2 and 8 |
| ACC-01 / ACC-02 | N | Design functions start in Increment 3. The ACC-02 sample in the navigator is illustrative only |

**Performance.**

| Target | Status | Result |
|---|---|---|
| PERF-08 | P | 1 GiB start-up tier hashed in 1.5 s on 4 vCPU without SHA extensions. Real hosts: U (VAPP-01 step 10) |
| PERF-09 | U | Measured only on the 60 MB development medium (11 s) |
| PERF-10 | B in Chromium (43 ms) / U on hosts | — |
| PERF-01 | U | — |

**Usability:** usability.md. Both scenarios were completed in the scripted dry runs. Issue
U-1 was fixed. The human run is U.

## 5. Open before the Increment 1 gate

1. **Signed release.** Your release keys exist (12 October 2026). Their public keys are built in:
   primary 39F9D3BC8498721D, standby 4D305CEFEB27CFBB. Next: sign the three media on your
   PC, then tag **v0.1.0**.
2. **Your runs:**
   - VAPP-01 on each host OS;
   - the VAPP test kit;
   - the human usability run.

   Send me the result files and I will record them here.
3. **Self-hosted runners**, for signing and medium assembly in CI.
4. The earlier backup tags (phase0-s1…s9, inc1-wp1.1, inc1-wp1.2) still need a session that is
   allowed to push tags.

## 6. Decisions inside the requirements for your review

- WP1.1_report.md §4;
- WP1.2_report.md §3;
- findings_for_D16.md §2, which lists seven WP 1.3 items, among them the text-mode installer
  and signing through the signed index.
