# VAPP-01 — Clean-machine offline installation (Increment 1 scope)

**Requirement.** VAPP-01: offline installation from USB on a freshly installed OS image of
each host OS, with networking disabled, then ACC-01 and ACC-02 run end to end *as far as
delivered features allow*. In Increment 1 that means: the app installs, starts, and its
Increment 1 functions work. ACC-01/02 design functions arrive from Increment 3.

**Also measured:**
- PERF-09: installation duration;
- PERF-01: cold start;
- PERF-08: start-up integrity check;
- HOST-04: shortfalls shown at installation and at start-up.

## Preparation

1. **Hosts**, each freshly installed, with no updates and no other software:
   - Windows 10 22H2 and Windows 11;
   - Ubuntu Desktop 22.04 and 24.04;
   - Raspberry Pi OS 64-bit with desktop (Bookworm) on a Pi 5 with NVMe;
   - optionally the same Pi on microSD (PERF-09: 60 min limit).
2. **Medium:** copy the signed release medium for that OS onto an **exFAT** USB stick, or
   write the `.img` file with Raspberry Pi Imager → "Use custom".
3. **Disconnect the network** before you plug in the stick: unplug the cable and switch
   Wi-Fi off (airplane mode on Windows). Leave it off for the whole procedure.

## Steps and expected results

| # | Step | Expected result |
|---|---|---|
| 1 | **Windows:** open the stick and double-click `EmbedForge-Setup-0.1.0-x64.exe`. **Linux:** open a terminal in the stick's folder (right-click → "Open in Terminal") and type `sh install.sh`. Note the time. | Windows asks for administrator permission; Linux asks for your password. |
| 2 | Answer "Install for all users?" with **Y**. | The installer shows the host check (HOST-04), the packs with their sizes, and the free space needed. On Windows it also lists the USB drivers that are not included (CH340, CP210x, FTDI) and the boards they affect. |
| 3 | Windows only: read the WebView2 terms and type `ACCEPT`. | Installation continues. |
| 4 | Confirm "Start the installation?". | "checking the medium" goes to 100 %, then "expected remaining duration", then each pack. It ends with "EmbedForge 0.1.0 is installed in … (N s)". **Write down N** (PERF-09: ≤ 20 min Profile A, ≤ 40 min Pi 5 NVMe, ≤ 60 min microSD). |
| 5 | Linux only: log out and log in again. | (Group membership for serial ports takes effect.) |
| 6 | Start EmbedForge from the Start menu or the applications menu. Time it from the click until the window shows the Welcome page. | **PERF-01:** ≤ 10 s on Profile A, ≤ 20 s on the Pi 5. No "start-up checks" banner appears, unless the host has a shortfall; in that case the banner names it. |
| 7 | Look at the status bar. | It reads `Integrity: OK (N components)`. |
| 8 | Press Ctrl+Shift+D (Self-diagnosis), then **Full verification**. | (a) Integrity: Pass. (f) Storage headroom: Pass or Warn. (b)–(e): "delivered in Increment N". |
| 9 | Open Project, Libraries, Documentation, Host check and Settings in turn. Use the keyboard only (Ctrl+Shift+P, then type the view name). | Each view opens. Host check lists this computer's profile and any shortfalls. |
| 10 | Close the app. Open the integrity log: Windows `C:\Program Files\EmbedForge\state\integrity.log`, Linux `/opt/embedforge/state/integrity.log`. | The last line is a `startup_check` event. **Write down `foreground_ms`** (PERF-08: ≤ 15 000 on Profile A, ≤ 45 000 on the Pi 5). |
| 11 | Reconnect the network only now, if you need it. | — |

**Send me:**
- the installation time N;
- the cold-start time;
- the `foreground_ms` value;
- a photo or screenshot of step 2 (the host check);
- any message that differs from the expected result.

## Per-user installation (SS-05)

Repeat steps 1–10 on one Windows and one Ubuntu host with a standard (non-administrator)
account:
- **Windows:** answer **N** at step 2.
- **Linux:** type `sh install.sh --per-user`.

**Expected:** the installer lists the functions that are not available:
- SD-card imaging;
- dependency packages (Linux);
- serial-port group (Linux).

The app then works as in steps 6–9.
