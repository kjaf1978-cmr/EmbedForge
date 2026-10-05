# Increment 1 · WP 1.1 — Rust core: test report (TEST-03 format)

- Baseline: prompt v3.7
- Date: 5 October 2026
- Code: `core/`, 5 crates, GPL-3.0-or-later
- Environment: builder container, Linux x86-64, rustc/cargo 1.95.0. Not a Profile A host.
- Human review record (DOC-12): pending

## 1. Evidence summary

| Check | Command | Result |
|---|---|---|
| Unit and integration tests | `cargo test` (in `core/`) | **31 passed, 0 failed** |
| Lint, warnings as errors | `cargo clippy --all-targets -- -D warnings` | **0 warnings** |
| Formatting | `cargo fmt --all -- --check` | clean |
| Linked-crate licence gate (C3-05) | `python3 tools/check_licences.py core` | **PASS**: 67 linked crates, all GPL-3.0-or-later compatible; libgit2 1.9.7 bundled under GPL-2.0 with linking exception |
| CI definition | `.github/workflows/core.yml` | Written: Ubuntu 22.04/24.04, Windows 2025, Ubuntu arm64. **Not yet run**, because GitHub is not reachable from this session |

## 2. Per requirement

Status key:
- **B** = verified by the builder, with the test named as evidence.
- **P** = partially verified (what is missing is stated).
- **U** = awaiting user execution.
- **N** = not verified, with the reason.

| Req | What WP 1.1 delivers | Status | Evidence |
|---|---|---|---|
| DATA-01 | Project = Git repository of versioned JSON files; deterministic JSON (sorted keys, trailing newline) for small diffs | B | `new_project_is_valid_and_portable`, `project_repo_baselines_cm03_data01` |
| DATA-02 | `schema` tag on every file; automatic migration with a registry; each migration recorded in `migrations.json`; refuses rather than guesses when no migration exists; refuses files newer than the app | B | `migration_is_applied_and_recorded`, `newer_schema_is_refused`, `schema_tag_parsing` |
| DATA-03 | Detector for absolute paths in path-like fields, home directories and serial-port names; KiCad net names like `/RESET` are not flagged; Git author identity fixed, so no user name is stored | B | `host_specific_data_is_found` |
| DATA-04 | Limits as set by D14 (100 parts, 120 nets, ≤ 110 mm, ≤ 10 000 mm²) reported as warnings with their consequence | B | `size_limits_d14` |
| INV-08 (data side) | Netlist validation: every pin belongs to an existing part and to at most one net | B | `netlist_rules` |
| ED-06 (data side) | Every parameter carries a unit; values inside min/max | B | `parameter_ranges_and_units` |
| CM-01 | Configuration-item kinds: the CM-01 list plus block templates and the weak-word list | B | type `CiKind`; used in all `ef-cm` tests |
| CM-02 | Semantic version per item; a changelog entry for the version is required; stored versions are immutable | B | `versions_need_changelog_and_are_immutable` |
| CM-03 | App-level baseline restored in one action (all-or-nothing, with roll-back on failure). Project baselines are Git tags; a restore is a new commit, so history is kept | B | `baseline_restore_in_one_action_cm03`, `project_repo_baselines_cm03_data01` |
| CM-04 | Downgrade to any stored earlier version after a dependency check; refused with the violated dependency named, leaving the install unchanged | B | `downgrade_with_dependency_check_cm04` |
| CM-09 | Content-addressed recovery store (F0-20), with retention limit planning. Active versions and versions pinned by a *known project* are protected. Baselines that would be removed are listed and need confirmation. Stale plans are refused, and unused objects are collected | B | `identical_files_are_stored_once`, `retention_protects_pinned_and_asks_before_deleting_baselines_cm09`, `stale_prune_plan_is_refused` |
| SS-08 | Signed manifest; F3-01 tiers; size + mtime + cached-hash quick path; background queue with changed files first; offline repair from the recovery store; corrupted recovery objects never restored; JSON-lines event log | P | `tiers_follow_f3_01`, `startup_check_then_offline_repair_ss08`, `missing_recovery_object_is_reported_not_hidden`, `corrupted_object_is_never_restored`. **Missing:** wiring into app start-up (WP 1.2) and PERF-08 timing on real hosts (U) |
| SEC-02 | minisign/Ed25519 verification of manifests and packages; unsigned, wrong-key and tampered files rejected; several trusted keys for rotation. The app only verifies, never signs | P | `signed_manifest_is_required_sec02`, `signed_update_package_sec02_ss09`. **Missing:** signing step on your infrastructure and key-rotation procedure document (WP 1.3) |
| HOST-04 | Profile A / B evaluation of OS, CPU, AVX2, RAM, disk, storage type, display, with consequences; detection through sysinfo | P | `good_profile_a_has_no_findings`, `weak_laptop_reports_each_shortfall_with_consequence`, `windows_versions`, `ubuntu_lts_only`, `pi5_profile_b`, `pi4_is_not_a_supported_host`, `detect_runs_on_this_host` (Linux container only). **Missing:** display size comes from the UI (WP 1.2); detection on Windows and Pi 5 is user-executed (U) |
| DIAG-01 | Report with (a) integrity, including full verification on demand, and (f) storage headroom, with remediation. (b)–(e) say "delivered in Increment N" rather than claiming a check | P | `healthy_install_reports_pass_and_honest_gaps`, `corruption_and_low_storage_give_remediation`, `untrusted_manifest_fails_section_a`. The headroom thresholds (warn 20 GB, fail 5 GB) are Increment 1 defaults |

## 3. Not in WP 1.1 (remaining Increment 1 work)

- **WP 1.2:** the UI, covering UI-01..03, 17, 20–23 and SS-07.
- **WP 1.3:**
  - packaging and installers (SS-01..05);
  - the privileged helper skeleton;
  - CI runs on your runners;
  - VAPP-01/03/04/05 procedures.
- **WP 1.4:** the Increment 1 test report and usability scenarios.

## 4. Decisions taken inside the requirements (please review)

- **App-level items are stored as a whole directory per version** (`install_root/<item>/`).
  A version switch replaces the directory atomically, by staging and then renaming.
- **Project Git commits use the fixed author `EmbedForge <embedforge@localhost>`.** This
  satisfies DATA-03: no user name or e-mail address is stored in projects.
- **Restoring a baseline is never a history rewrite.** It is a new commit equal to the
  baseline, so it can itself be undone.
