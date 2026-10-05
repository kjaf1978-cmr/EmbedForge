# Increment 1 · WP 1.3 — Packaging, installers, privileged helper: test report (TEST-03 format)

- Baseline: prompt v3.7; v3.8 (D16) for SS-05(d)
- Date: 5 October 2026
- Code:
  - `core/ef-pack`, `ef-release`, `ef-install`, `ef-helper` (new);
  - `core/ef-integrity` (component manifests, start-up passes);
  - `app/src-tauri` and `app/ui` (start-up wiring);
  - `packaging/`;
  - `.github/workflows/package.yml`.
- Environment: builder container, Ubuntu 24.04 x86-64, 4 vCPU (Xeon 2.8 GHz, no SHA
  extensions), rustc 1.97. It is not a Profile A host and not a clean image. It has no
  systemd, no udev and no exFAT kernel module.
- Human review record (DOC-12): pending
- D16 / F1-01: option A, implemented (docs/inc1/findings_for_D16.md).

## 1. Evidence summary

| Check | Command | Result |
|---|---|---|
| Rust core: all tests | `cd core && cargo test --locked` | **58 passed** (31 in WP 1.1) |
| Clippy, Linux | `cargo clippy --all-targets --locked -- -D warnings` | **0 warnings** |
| Clippy, Windows target | `cargo clippy --target x86_64-pc-windows-gnu --workspace --all-targets -- -D warnings` | **0 warnings**; `embedforge-setup.exe` links (MinGW) |
| Formatting | `cargo fmt --all -- --check` | clean |
| Linked-crate licence gate | `python3 tools/check_licences.py core` | **PASS: 72 crates** (new: tar, zstd, libc; all MIT/Apache) |
| Tauri shell | `cd app/src-tauri && cargo test && cargo clippy … -D warnings` | **5 passed**, 0 warnings |
| UI | `npm test`, `npm run build`, `npx playwright test` ×3 | 12 unit; **11 browser tests passed in 3 consecutive runs** (new: start-up banner + axe) |
| Development medium, end to end | `packaging/build-medium.sh ubuntu-x86_64 … --dev-key --allow-missing` | stage → sign → pack → index → sign → `ef-release verify`: **PASS**. 60 MB medium (debug binaries) |
| Real installation from it | `sh install.sh --yes` as root | installed in **11–12 s**; udev rules, systemd units and desktop entry written; `systemctl`/`udevadm` warn because the container has no systemd |
| Installation with **no network** (INV-01) | `unshare -n sh install.sh --yes` | **installed** (curl inside the namespace fails, as it should): `evidence/wp1.3/install-offline-netns.log` |
| Scripted VAPP-04/05/03 on that installation | `embedforge-setup vapp --package usb-update` (Xvfb) | **PASS, PASS, PASS**: `evidence/wp1.3/vapp-container-run.txt` |
| Start-up repair in the real app | delete a file and corrupt the helper, then start the app | both restored before the window was used; banner shown; `foreground_ms` 1 560: `evidence/native-linux-startup-repair-banner.png` |
| D16: unprivileged app on a system-wide install | system install, file corrupted, app run as a new non-root user | the helper restored it (`restore_files` → `done`); banner shown: `evidence/native-linux-user-repair-via-helper.png`, `evidence/wp1.3/helper-restore-d16.log` |
| Helper refuses a foreign caller | Python client on the installed helper's socket | `rejected: caller /usr/bin/python3.11 is not the EmbedForge app`, logged: `evidence/wp1.3/helper-foreign-caller.log` |
| Per-user installation and uninstallation | `sh install.sh --per-user --yes` as a new unprivileged user | installed with the missing functions listed; no root command run; uninstalled cleanly |
| Uninstallation through dpkg | `dpkg -r embedforge-setup` | `/opt/embedforge`, udev rules, units and desktop entry removed |
| PERF-08 throughput | `cargo test --release -p ef-integrity --test perf -- --ignored` | 1 GiB start-up tier + 200 deferred files: **1.5 s (660 MiB/s)** with parallel hashing; it was 6.0 s single-threaded |
| CI | `.github/workflows/package.yml` | Written (Linux medium + install + VAPP + helper + uninstall on ubuntu-22.04; Pi OS medium on ubuntu-24.04-arm; Windows medium + install + VAPP-04/05 + uninstall on windows-2025). **Not yet run here**; it runs on the next push |

## 2. Per requirement

Status key:
- **B** = verified by the builder, with evidence.
- **P** = partially verified (what is missing is stated).
- **U** = awaiting user execution.
- **N** = not verified, with the reason.

| Req | What WP 1.3 delivers | Status | Evidence |
|---|---|---|---|
| SS-01 | One medium per host OS. Bootstrap: Windows EXE, Ubuntu x86-64 .deb, Pi OS arm64 .deb. Signed component packs: zstd tar streams split into parts ≤ 1.9 GiB, so one component may span several parts, each part hashed. Optional packs selectable, with their consequence shown. Dependency .debs for the running release only, installed through the local package path (`dpkg -i`, only missing or older ones). One run installs everything. exFAT image script | P | `component_spans_several_parts_and_round_trips_ss01`, `part_limit_is_1_9_gib`, `names_must_be_portable_to_exfat_and_fat32`, `plan_selects_packs_and_states_consequences_ss01`, `system_install_verifies_stores_activates_and_integrates_ss01_ss04_ss05`; container install and no-network install. **Missing:** real dependency sets (`collect-deps.sh` needs docker, so it runs on CI, UNVERIFIED); exFAT mount (the container kernel has no exFAT driver; `mkfs.exfat` works); never-online clean host (U, VAPP-01) |
| SS-02 | Increment 1 ships only the app. The WebView2 terms are presented and must be accepted (notice mechanism). Source pack: EmbedForge source archive on the medium, with a script for the dependency .deb sources | P | `plan_blocks_with_reasons` (terms not accepted → blocked). **Missing:** the bundled runtimes and toolchains arrive with their increments; the WebView2 fixed runtime has no stable download URL (`fetch-webview2.sh` takes your file) |
| SS-03 | Everything is installed below the install root; the app finds its root from its own path. The VAPP-03 audit tool counts system-wide copies of bundled tools as *outside* | B (container) / U | `audit_classifies_files_vapp03`; container audit **0 files outside** (`vapp03-audit-container.json`) |
| SS-04 | Linux: udev rules for CH340/CP210x/FTDI/Arduino/RP2040/RP2350, `uaccess`, dialout/plugdev membership. Windows: no driver bundled (first release); the installer lists the drivers not included and the affected boards (INV-10) | P | system-install test; container install wrote the rules. **Missing:** accepting your own copy of a driver, with board detection (Increment 2); real serial access (U, Increment 2) |
| SS-05 | Administrator rights only in the installer (system mode checks it; the app never elevates). One helper with exactly three request types (closed set: unknown operations and fields are rejected). Caller check: SO_PEERCRED → `/proc/<pid>/exe` must be the installed app binary *and* its SHA-256 must match the signed manifest. Boot-medium guard: whole removable disk only; never a disk holding `/`, `/boot*`, `/usr`, `/var`, `/home`, `/opt`, swap or the install root; device-mapper layers resolved. .deb allowlist from the signed dependency sets. Every request logged. Per-user installation without drivers or helper, with the missing functions listed. systemd socket activation | P | `requests_are_a_closed_set_ss05`, `boot_medium_guard_ss05a`, `caller_check_allowlist_and_log`, `unix_socket_identifies_the_caller_by_so_peercred`, `per_user_installation_lists_missing_functions_ss05`; installed helper rejects a foreign caller. Function (d) `restore_files` (D16) is performed: `restores_only_signed_files_of_the_active_version_ss05d`. **Missing:** performing (a)–(c) (Increment 2, by scope); Windows service transport (Increment 2) |
| SS-08 | Start-up wiring: the foreground pass runs on its own thread while the window opens; the background pass follows. Whole components are restored if their folder or signed manifest is missing or tampered. Files are restored from the recovery store. Status bar, start-up banner, and **Repair** in Self-diagnosis | P | `installed_view_and_component_restore`, `self_repair_offline_vapp04_ss08`, `read_only_install_reports_that_repair_needs_the_installer` (as non-root); real app run (screenshot). System-wide Linux installs repair through the helper (D16, container run). **Missing:** Windows system-wide installs until the helper's Windows transport (Increment 2); PERF-08 on hosts (U) |
| SS-09 | Signed update package from USB (`embedforge-setup update --package`). Same signature checks as the medium. Host and app-version checks. CM-04 dependency check before anything changes. After activation the install-time check (CM-05(b): DIAG-01 (a)); a failure rolls every changed item back | P | `offline_update_and_rollback_from_usb_vapp05_ss09_cm04`, `update_refusals_change_nothing_sec02_cm04`; container VAPP-05 PASS. **Missing:** the smoke-project set of CM-05(b) (no buildable projects before Increment 3); the update manager UI (Increment 8) |
| SEC-02 | Every index and component manifest verified against the trusted keys; several keys allowed (rotation); unsigned, wrong-key and tampered files refused at plan, update and start-up. Signing scripts for your host only (minisign; Authenticode via signtool). Key-rotation procedure | P | `index_signature_and_part_hashes_are_enforced_sec02`, `damaged_medium_is_refused_before_anything_changes`, `update_refusals_change_nothing_sec02_cm04`; `procedures/SEC-02_key_rotation.md`. **Missing:** your release keys (`trusted-keys.txt` is empty) and a signed release (U) |
| CM-03 / CM-04 / CM-09 (install level) | Baseline `install-<version>` tagged at installation. Restoring a baseline sets exactly its versions, and items added later are deactivated. Rollback with dependency check; every version kept for offline rollback | B | `baseline_restore_undoes_an_update_completely_cm03`, `baseline_restore_in_one_action_cm03` (extended), VAPP-05 run |
| HOST-04 | The installer runs the host check and shows every shortfall with its consequence; a host outside HOST-01 blocks installation. The app checks again at start-up and shows a banner | B | `plan_blocks_with_reasons`; container installer output; app banner (screenshot) |
| DIAG-01 (a) | Reads the component layout (signed manifest per component); full verification on demand; Repair | B | `diagnostics_section_a_reads_the_installed_components_diag01` |
| PERF-08 | Start-up tier hashed on every core | P | 660 MiB/s on 4 vCPU without SHA extensions. With the Phase 0 (g) estimate of about 3.5 GiB start-up tier, about 5–6 s with a warm cache. Profile A/B, cold cache: U (VAPP-01 step 10) |
| PERF-09 | Duration estimate from the measured medium speed | P | 11 s for the 60 MB development medium. Full media: U |
| VAPP-01 | Procedure | U | `procedures/VAPP-01.md` |
| VAPP-03 | `embedforge-setup vapp` / `audit --pid` | B (container) / U | container: 0 outside; Windows audit covers the main process only |
| VAPP-04 | `embedforge-setup vapp` | B (container) / U | `vapp-container-run.txt` |
| VAPP-05 | `embedforge-setup vapp --package` with the test kit | B (container) / U | `vapp-container-run.txt` |
| INV-01 (installation) | Installation and first start use no network | B (container) / U | no-network install log |
| INV-10 | Unbundled drivers listed by the installer | B | Windows spec; `print_plan` |

## 3. Measurements and limits of this environment

- **Hashing speed.** The container CPU has no SHA extensions, so 660 MiB/s is a low bound.
  Current Profile A CPUs (Intel since Ice Lake, AMD Zen) hash several times faster per core,
  and the Pi 5 uses the ARMv8 SHA-2 instructions.
- **Install time.** The 11 s were measured with debug binaries. They are not representative
  of PERF-09 for a full medium of about 8–10 GiB (Phase 0 (g)).
- **No systemd or udev.** Unit and rule files were written, but loading them was only
  attempted. The `package` CI job checks `systemctl is-enabled` on a real Ubuntu runner.

## 4. Decisions taken inside the requirements (please review)

See `findings_for_D16.md` section 2 (7 items). The most visible:
- the text-mode installer;
- signing through the signed index;
- Linux package ownership.

## 5. Remaining Increment 1 work (WP 1.4)

- Increment 1 test report (TEST-03) across WP 1.1–1.3.
- The two usability scenarios.
- The user-executed procedures run by you.
- Your release keys, a signed release, and tag v0.1.0.
