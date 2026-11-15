# Increment 1 — VAPP-01, 03, 04, 05 procedures (user-executed, U)

- Baseline: prompt v3.7
- Date: 15 November 2026

## What CI already covers

The automated parts run in `.github/workflows/package.yml`, on hosted runners, from a test
medium signed with a throwaway key. These procedures add what CI cannot show:
- real, freshly installed hosts with networking physically off;
- the Pi 5;
- Windows 10;
- a human looking at the screens.

## Record for each run

Copy this table into `docs/inc1/evidence/VAPP_<host>_<date>.md`:

| Field | Value |
|---|---|
| Host OS + version, hardware | |
| Medium (release, `SHA256SUMS` of `medium.json`) | |
| Networking | off how (cable out, Wi-Fi off, airplane mode) |
| Start / end time | |
| Result per step | pass / fail + note |
| Files attached | `install-events.jsonl`, screenshots, audit report |

## Hosts

| ID | OS | Notes |
|---|---|---|
| W10 | Windows 10 22H2 x64, fresh install | WebView2 may be missing: the installer must install it from the medium |
| W11 | Windows 11 x64, fresh install | |
| U22 | Ubuntu 22.04 x86-64, fresh install | oldest supported Ubuntu |
| U24 | Ubuntu 24.04 x86-64, fresh install | |
| PI5 | Raspberry Pi OS Bookworm arm64 on a Pi 5 (8 GB), fresh image | NVMe and microSD (PERF-09 timing) |

---

## VAPP-01 — clean-machine offline installation

1. Install the OS fresh. Do not connect it to any network at any time. Disconnect it
   physically before the first boot.
2. Plug in the exFAT USB medium.
   - **Windows:** run `EmbedForge-Setup-<v>.exe`.
   - **Linux / Pi:** open a terminal on the medium and run:

     ```bash
     sudo sh install-linux.sh
     ```

   To include optional packs on Linux, add `--with <id>,…`. On Windows, tick them on the
   *Components* page.
3. Check that the installer shows:
   1. the GPL licence and (Windows) the WebView2 licence, both for acceptance (SS-02);
   2. (Windows) the choice of all users or only you. For "only you" it lists what is not
      available (SS-05);
   3. every optional pack, with what is unavailable without it (SS-01). On Linux,
      `install-linux.sh` prints the same list;
   4. the expected duration on Pi microSD (PERF-09). **Not delivered in WP 1.3:** record the
      measured time instead.
4. Start EmbedForge from the menu. Pass if:
   - the status bar shows **"Integrity: verified"** within the PERF-08 time (record the
     time);
   - *Self-diagnosis* section (a) is **pass**.
5. Run ACC-01 and ACC-02 as far as Increment 1 allows. Increment 1 has the shell and
   libraries but no design generation, so record which steps were possible.
6. Attach `install-events.jsonl`:
   - Windows: `%ProgramFiles%\EmbedForge\state\`, or for a per-user install
     `%LOCALAPPDATA%\Programs\EmbedForge\state\`.
   - Linux: `/opt/embedforge/state/`.

## VAPP-03 — dependency audit

Every file loaded at runtime must be inside the app directory or in the OS standard
libraries.

### Linux / Pi

```bash
sudo apt-get install strace
```

`strace` is only on the test host. Install it from a separate offline medium, or run this
step after VAPP-01 is recorded.

```bash
strace -f -qq -e trace=openat,open,execve -o trace.log /opt/embedforge/embedforge
```

Use the app for 2 minutes: every view, Self-diagnosis with *full verification*, and the
docs search. Then close it and run:

```bash
python3 tools/vapp03_audit.py trace.log --app /opt/embedforge --json vapp03.json
```

Pass = `PASS` (0 violations).

### Windows

1. Run Sysinternals Process Monitor.
2. Filter on `Process Name is embedforge.exe` and `msedgewebview2.exe`.
3. Do the same 2-minute session.
4. Export as CSV (`trace.csv`), then run:

   ```bash
   python tools/vapp03_audit.py trace.csv --procmon --app "C:/Program Files/EmbedForge"
   ```

The audit classifies every file. Review each violation it lists: either it is a real
dependency outside the app (fail), or it is an OS file the allowlist does not yet know. In
the second case, record it, and the allowlist is extended in a reviewed change.

## VAPP-04 — offline self-repair

Do this with the medium **unplugged** and networking off.

1. Pick two files in the installation:
   - one executable or library, for example `ef-bootstrap` or a `.dll` under `components/`;
   - one document, for example a file under `components/app-docs/`.
2. Delete the first. In the second, change one character with a text editor, keeping its
   size.
3. **Per-user installation (Windows "only for me"):** start EmbedForge. Pass if:
   - the status bar reports **"N file(s) restored offline"**;
   - Self-diagnosis (a) is pass afterwards.
4. **Per-machine installation (Windows "all users", Linux, Pi):** start EmbedForge.
   1. The status bar must report that restoring needs administrator rights. This is open
      decision **D16-a** in the WP 1.3 report.
   2. Then run the repair:
      - Windows (as administrator):

        ```bash
        "C:\Program Files\EmbedForge\ef-bootstrap.exe" --root "C:\Program Files\EmbedForge" --repair
        ```

      - Linux:

        ```bash
        sudo /opt/embedforge/ef-bootstrap --root /opt/embedforge --repair
        ```

   3. Pass if both files are listed as `restored`, and the next start shows
      **"Integrity: verified"**.
5. Attach the `integrity-events.jsonl` from the per-user data directory, and
   `install-events.jsonl`.

## VAPP-05 — offline update and rollback

The test needs two releases. For Increment 1, use the **test update package** built from the
same release with the component `app-docs` at version `<v>+1` (`packaging/test-medium.sh`
run twice, see the WP 1.3 report).

1. Install release N (VAPP-01).
2. Copy the update package (`packs/app-docs-<v+1>.pack.json`, `.minisig` and parts) to a USB
   stick. With networking off, install it as root:

   ```bash
   sudo /opt/embedforge/ef-bootstrap --medium <stick> --root /opt/embedforge
   ```

   **Missing:** the in-app *Updates* view arrives with update handling in a later increment
   (CM-05/SS-09 UI). The bootstrap path above is the Increment 1 mechanism.
3. Pass if:
   - `components/app-docs` holds the new version;
   - Self-diagnosis (a) is pass.
4. Unplug the stick. With networking off, roll back as root:

   ```bash
   sudo /opt/embedforge/ef-bootstrap --root /opt/embedforge --rollback app-docs=<v>
   ```

   On Windows, run the same command as administrator.
5. Pass if:
   - `components/app-docs` holds version N again;
   - Self-diagnosis (a) is pass;
   - `install-events.jsonl` has a `rolled_back` event.

   Rolling "back" to a later version must be refused.
