# Increment 1 · WP 1.3 — Packaging, signing, installers, helper skeleton: test report (TEST-03 format)

- Baseline: prompt v3.7; D16 applied afterwards → v3.8 (section 7)
- Date: 15 November 2026
- Code:
  - `core/ef-pack` (packs, media, bootstrap);
  - `core/ef-helper` (SS-05 policy);
  - `core/ef-release` (release machine);
  - changes to `ef-integrity` and `ef-diag`;
  - `app/src-tauri/src/startup.rs`;
  - `packaging/`;
  - `.github/workflows/package.yml`.
- Environment: builder container, Linux x86-64 (Ubuntu 24.04 userland), root. Unprivileged
  runs via `setpriv` to the `nobody` user. Xvfb for the native app. **Not a clean Profile A
  host.**
- Human review record (DOC-12): pending

## 1. Evidence summary

| Check | Result |
|---|---|
| Core tests (`cargo test --locked`) | **48 passed** (31 before WP 1.3; 17 new) |
| Clippy, warnings as errors (core and shell) | **0 warnings** |
| Licence gate (linked crates) | **PASS, 83 crates**. New: `tar` (MIT/Apache-2.0), `zstd` (BSD-3-Clause), `filetime` (MIT/Apache-2.0) |
| Shell tests | **7 passed**, both as root and as an unprivileged user. The read-only-install test skips itself as root, so it was run unprivileged to really exercise it |
| UI unit / browser tests | **13 / 11 passed**, browser tests 3 consecutive runs; axe 0 serious/critical, including the new status-bar control |
| **End-to-end pipeline, Linux x86-64** (section 3) | throwaway key → release build with the key compiled in → staging tree → signed manifest → `.deb` → signed packs → signed medium → **offline install** (network namespace with no interfaces) → start-up check → damage + offline repair → dependency audit → update + rollback. **All passed** after two defects found here were fixed (section 4) |
| Windows installer | `embedforge.nsi` **compiles** with makensis 3 (Linux build) into a 2.3 MB EXE. The placeholder guard for the WebView2 licence text works. **Not run on Windows** (CI job written, not yet run) |
| CI `package.yml` | Written: Ubuntu 22.04 amd64, Ubuntu 22.04 arm64, Windows 2025. **Not yet run.** The branch is pushed, but CI on it has not been checked from here |

Screenshot: `docs/inc1/evidence/native-linux-installed-integrity-verified.png` shows the
installed release build, with "Integrity: verified" in the status bar.

## 2. Per requirement

Status key as in WP 1.1: B = built and verified here, P = partly, U = user-executed.

| Req | What WP 1.3 delivers | Status | Evidence |
|---|---|---|---|
| SS-01 | **Packs:** one tar stream, zstd, split into parts of at most 1.9 GiB (the limit is a constant; larger values are refused); deterministic builds.<br>**Medium:** signed `medium.json` naming the host, the bootstrap and every pack. An optional pack must state its consequence, which the installers show.<br>**Install:** one run installs everything, from local storage only; re-running resumes.<br>**Linux dependency .debs:** installed in the same `dpkg` run from the medium's `deps/` | P | `pack_splits_into_parts_within_limit_ss01`, `pack_build_is_deterministic`, `medium_index_is_signed_and_optional_packs_state_consequence_ss01`, `release_to_offline_install_end_to_end`, end-to-end run. **Missing:**<br>- the real dependency closure per clean image (needs clean images, CI/U);<br>- Pi microSD duration display (PERF-09);<br>- real component packs (toolchains, models) from Increment 2 on |
| SS-03 | Everything is installed under one directory: `/opt/embedforge`, `%ProgramFiles%\EmbedForge`, or `%LOCALAPPDATA%\Programs\EmbedForge` for a per-user install. Outside it there is only the menu entry, the `/usr/bin` link and the uninstall registry key | B (Linux) / P (Windows) | end-to-end run; VAPP-03 audit 0 violations |
| SS-05 | **Helper policy:**<br>- (a) the boot-medium guard refuses system disks, devices holding a system mount point (a Pi booted from USB is caught), non-removable devices, and images larger than the target; only known first-boot files are accepted;<br>- (b) only the service `embedforge-project`, with a validated project id;<br>- (c) only `.deb` files from the signed dependency set of the **running** version, checked by hash.<br>**Every request** must come from the installed executable with its signed hash, and every request is logged.<br>**Installers:** root/admin only at install, repair and uninstall; NSIS offers per-user mode and lists what it lacks | P | `boot_medium_guard_ss05a`, `single_project_service_only_ss05b`, `debs_only_from_signed_dependency_set_ss05c`, `only_the_signed_app_may_call_and_every_request_is_logged`. **Skeleton:** actions are *planned*, not executed. Transport and helper installation arrive in Increment 2 (decision 3) |
| SS-08 | **Start-up check in the app:** both manifest kinds are verified (app, and every installed pack); start-up-tier files are hashed; repairs come from the recovery store; deferred files are hashed in a background pass and also repaired. The state is shown in the status bar, which opens Self-diagnosis.<br>**Per-user cache.** Application files are copied into the recovery store at installation, so they can be restored too.<br>`ef-bootstrap --verify` / `--repair` give a full check, and repair offline | P | shell tests `clean_install_verifies_ok`, `startup_and_background_damage_is_repaired_offline`, `untrusted_manifest_or_lost_recovery_object_fails_visibly`, `read_only_install_reports_that_repair_needs_the_installer`; `component_self_repair_vapp04`; end-to-end run. **Open:**<br>- decision D16-a (repair on read-only installs);<br>- "signed cached checksum": the cache is per-user and unsigned (section 5);<br>- PERF-08 timing on real hosts (U) |
| SS-09 | An update package is a medium with the new pack versions. Its install is verified like any pack and kept in the recovery store. `ef-bootstrap --rollback <ci>=<v>` rolls back offline, after the CM-04 check | P | `offline_update_and_rollback_vapp05`; end-to-end run. **Missing:** an in-app *Updates* view (later increment) |
| SEC-02 | All verification uses minisign/Ed25519 with several trusted keys, compiled in through `EF_TRUSTED_KEYS`.<br>`ef-release`:<br>- creates keys protected by scrypt (password ≥ 12 characters, no overwrite);<br>- signs with a trusted comment that binds the file name.<br>`docs/release/SIGNING.md`:<br>- the offline signing procedure;<br>- planned and emergency key rotation;<br>- the key register.<br>The installer builders refuse an unsigned tree | B | `unsigned_wrong_key_and_tampered_packs_are_rejected_sec02`, `keygen_refuses_weak_password_and_overwrite`, `release_to_offline_install_end_to_end`. **U:** the real release key, created by you |
| CM-09 | Pack installation stores versions in the content-addressed recovery store; rollback needs no medium | B | `offline_update_and_rollback_vapp05` |
| DIAG-01 | Section (a) now covers installed component packs | B | `component_pack_damage_is_reported` |
| SS-02 | The NSIS installer shows the WebView2 licence terms for acceptance. The text is supplied at release, and the build refuses the placeholder. The offline WebView2 installer is taken from the medium when the runtime is missing | P | compiled; **U:** the licence text and the redistributable come from Microsoft at release time; not checked here |
| SS-04 | Linux: the installing user is added to `dialout`. Windows: no driver bundled (as SS-04 says for the first release) | P | install script. udev rules arrive with boards (Increment 2) |

## 3. End-to-end run (Linux x86-64, this container)

1. **Key and build:** `ef-release keygen` created a throwaway key, `ci-test`.
   `packaging/stage.sh` built the release with that public key compiled in. The staging tree
   holds 4 files (`embedforge` 6.2 MB, `ef-bootstrap` 1.6 MB, licence, source note); the two
   executables are in the start-up tier.
2. **Test medium:** `packaging/test-medium.sh` signed everything and built
   `embedforge_0.1.0_amd64.deb` (2.1 MB). It also built two packs:
   - `app-docs` (required): the offline documentation;
   - `sample-optional`: 3 MB, split into **4 parts** with a 1 MB test limit.
3. **Offline install:** `unshare --net sh install-linux.sh --with sample-optional`
   (0 network interfaces).
   - Result: `dpkg` installed the app; the bootstrap listed the packs (required / optional
     with consequence) and installed both.
   - 17 files verified, 0 problems.
4. **VAPP-04:** three kinds of damage:
   - one byte flipped in `embedforge` (start-up tier);
   - one byte flipped in `LICENSE.txt` (deferred tier);
   - one component file deleted.

   `--verify` found all 3. `--repair` ran as root, offline, with no medium, and restored all
   3. The next check showed 17 files verified, 0 problems.
5. **The installed app:** its own start-up check (release build, Xvfb) hashed both
   executables and verified all 15 deferred files in the background. The status bar shows
   "Integrity: verified".
6. **VAPP-03:** a 20 s app run under `strace`. `tools/vapp03_audit.py` classified the files:

   | Class | Files |
   |---|---|
   | app | 21 |
   | OS libraries | 153 |
   | OS resources | 189 |
   | per-user data | 7 |
   | **violations** | **0** |

   All WebKitGTK helper processes are OS libraries.
7. **VAPP-05:**
   - A signed update package (`app-docs` 0.1.1) on a "stick" was installed offline; 18 files
     verified.
   - With the stick deleted, `--rollback app-docs=0.1.0` restored the earlier version; 17
     files verified.
   - A "rollback" to 0.1.1 was refused.
   - All events are in `install-events.jsonl`.

## 4. Defects found and fixed during WP 1.3

| # | Defect | Found by | Fix |
|---|---|---|---|
| 1 | `apt-get install` with no package sources refuses a local `.deb` ("Pathname to install is not absolute"), so the offline install failed | end-to-end run | `install-linux.sh` uses one `dpkg -i` run over the dependency .debs and the app; it removes the app again and states the cause if a dependency is missing |
| 2 | On a per-machine install, the checksum cache under `<root>/state` is not writable by the user, so every background pass would have failed | design review of the install layout | Cache and event log moved to the per-user data directory (`check_startup_in`, `check_full_in`) |
| 3 | The application files had no copies in the recovery store, so damage to them could be detected but never restored | review of SS-08 against the install flow | `record_app_files` at installation; covered by the end-to-end test |
| 4 | Test defects (no product defect):<br>- the smoke test wrote a fixed byte that was already in the binary, so it damaged nothing;<br>- the audit rule needed a trailing slash, so directory opens by fontconfig were misclassified | end-to-end run | The smoke test flips a byte and requires exactly 3 findings. The audit compares directory paths correctly and lists fontconfig's default `/usr/local/share/fonts` explicitly as an OS resource |

## 5. Decisions taken inside the requirements (please review)

1. **Packaging approach:** one staging tree per host with a signed manifest, then:
   - `.deb` built with `dpkg-deb` under `/opt/embedforge` (FHS place for self-contained
     software; SS-03);
   - our own NSIS script for Windows.

   Tauri's bundler was not used, because it places files itself and rebuilds the executable,
   which would break the signed manifest.
2. **Pack format:** tar + zstd, split by byte count; the signed pack manifest lists every
   part and file. An update package is a medium with a dummy bootstrap. A dedicated update
   format can follow with the *Updates* view.
3. **The privileged helper is not installed in Increment 1.** Its policy is complete and
   tested. Installing a root service that can do nothing yet would only add attack surface.
   It is installed with its transport and actions in Increment 2.
4. **The integrity cache is unsigned and per-user.** SS-08 says "signed cached checksum".
   - The cache can't be signed with the release key.
   - A per-user key would only protect against accidental edits, not against an attacker
     with the same rights.
   - The start-up tier is always fully hashed. The cache only lets *deferred* files skip a
     re-hash when size and mtime are unchanged.

   If you read "signed" as needing more, it becomes **D16-b**.
5. **The start-up check runs on a background thread from the first frame.** The UI shows
   "checking…". No bundled component is executed in Increment 1, so nothing runs before its
   check. From Increment 2, the toolchain runners must wait for "verified" or "repaired".

## 6. For your decision (D16)

- **D16-a — repair on a per-machine installation.** *Decided 2026-11-15: option (ii), see section 7.*
  - **Conflict:**
    - SS-08 wants damaged files restored at start-up.
    - SS-05 forbids admin rights in normal operation.
    - A per-machine install is read-only for the user.
  - **Behaviour now:** the app detects the damage and says that restoring needs
    administrator rights. `ef-bootstrap --repair` (as administrator/root) restores offline.
    A per-user install repairs automatically.
  - **Options:**
    - (i) keep this;
    - (ii) add "restore from the recovery store" as a fourth helper function. This needs a
      change to SS-05;
    - (iii) make per-user the default on all hosts. Per-machine remains for imaging and the
      project service.
  - **Recommendation:** (ii). Its scope is narrow: only files listed in the signed manifests,
    and only from the local store.
- **D16-b:** the reading of "signed cached checksum" (decision 4 above).

## 7. Decision D16 applied (15 November 2026)

You chose option (ii) for D16-a. Prompt **v3.8** (`tools/apply_d16.py`, section 33):
- **SS-05(d):** the privileged helper may restore files that fail the SS-08 check.
  - Only paths listed in the signed manifests of the running installation.
  - Only from the local recovery store.
  - Each object is verified against its manifest hash before it is put in place.
- **SS-08:** on an installation the user cannot write, the restore is done by the helper,
  with no administrator prompt.

### Implemented

- **`ef-helper`:** new request type `RestoreFiles`.
  - The helper re-checks every requested path itself and does not trust the caller's claim.
    It refuses:
    - paths outside the signed manifests;
    - requests in which no file actually fails;
    - requests when the manifests could not be verified.
  - `execute_restore` performs the restore. It reuses the tested SS-08 repair, logs every
    file, and never puts a corrupted recovery object in place.
  - Tests: `restore_only_signed_paths_that_really_fail_ss05d`,
    `restore_executes_from_the_local_store_and_logs_ss05d`.
- **App start-up check:** on a non-writable installation, damaged files are sent to the
  helper (`run_with_helper`), and the helper's result is what the status bar shows.
  - Test: `read_only_install_is_restored_through_the_helper`, run as an unprivileged user.

### Consequence for Increment 1

The helper is installed with its transport (named pipe / Unix socket with peer credentials)
in Increment 2 (decision 3 in section 5). Until then:
- on a per-machine install, the app reports "the EmbedForge helper is not installed yet" and
  names the offline `ef-bootstrap --repair`;
- a per-user install repairs by itself, as before.

If you want the helper installed in Increment 1 for this function alone, that is a scope
change to WP 1.4.

### Tests after D16

- 50 core tests;
- 8 shell tests;
- clippy 0 warnings.

D16-b remains open.

## 8. Remaining for Increment 1

- **WP 1.4:**
  - the Increment 1 test report;
  - usability scenarios;
  - user-executed procedures (`docs/inc1/VAPP_procedures.md`) on W10, W11, U22, U24 and PI5;
  - tag v0.1.0 after your D16 answer and a green `package` CI run.
- **For you:** create the release key offline (SIGNING.md section 2) and set the repository
  variable `EF_TRUSTED_KEYS` to its public key.
