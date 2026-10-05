# Findings for decision D16 (raised in Increment 1, WP 1.3)

- Baseline: prompt v3.7
- Date: 5 October 2026
- Status: **open — your decision is needed**. Nothing has been chosen for you. What is
  implemented now is the behaviour that changes no requirement, and it is described as such.

## F1-01 — SS-08 repair vs SS-05 rights on a system-wide installation (conflict)

**The two requirements.**
- SS-08: at start-up the app shall restore any corrupted or missing component from the local
  recovery store, without network access.
- SS-05: administrator rights shall be requested only during installation, update
  installation and uninstallation, never during normal operation. The privileged helper has
  exactly three functions: (a) imaging, (b) the project service, (c) allowlisted .debs.

**The conflict.** A system-wide installation lives in a folder that only an administrator may
write:
- `C:\Program Files\EmbedForge` on Windows;
- `/opt/embedforge` on Linux.

The app runs as the user, so at start-up it can *detect* damage there but cannot *restore*
it. Restoring would need administrator rights during normal operation (against SS-05), or a
helper function that SS-05 does not list.

**What is implemented now (no requirement changed):**

| Installation | Behaviour |
|---|---|
| Per-user installation | Repairs itself at start-up. SS-08 is fully met. |
| System-wide installation | Detects and logs at start-up. The banner and DIAG-01 say which files could not be restored and that `embedforge-setup repair` must be run as administrator. That is an installer action, so SS-05 is not breached, but SS-08's "restore … at start-up" is only partly met. |

Verified by the test `read_only_install_reports_that_repair_needs_the_installer`, run as a
non-root user.

**Options.**

| Option | Change | For | Against |
|---|---|---|---|
| **A (recommended)** | SS-05: add helper function (d), "restore files of the installed EmbedForge version from the local recovery store". The helper writes a file only if its content hash matches the signed component manifest and the path is listed there. | SS-08 is met on every installation. The helper stays narrow: it can only put back signed content of the installed version. | The helper gains a fourth function. It writes into the program folder, so its own checks matter more. |
| B | Install system-wide, but make the app folder writable for the installing user. | No helper change. | Weakens the protection of the program folder. Other users of the PC cannot repair. Unusual on Windows. |
| C | Amend SS-08: on system-wide installations, repair is an installer action (`embedforge-setup repair`, administrator). | No new privileged code. | The user must act. The app does not heal itself on the most common installation type. |

**Please reply with A, B or C**, or with another rule. I then change the prompt text (v3.8) and
the code accordingly.

## Decisions taken inside the requirements (no conflict; please review)

1. **"Signed component packs" (SS-01)** are signed through the signed index.
   - `medium.json` / `update.json` lists the SHA-256 of every pack part.
   - Each component also carries its own signed manifest.
   - There is therefore no separate `.minisig` per pack file.
   - This gives the same assurance, with one signature step per medium instead of one per
     file.
2. **Trust root of a first installation.** The bootstrap is the program that checks
   signatures, so it cannot check itself.
   - Windows: Windows checks the EXE's Authenticode signature.
   - Linux: `install.sh` and the `.deb` are trusted because of where the medium came from.
     Their hashes are in the signed index, and `embedforge-setup verify-medium` checks them.
     For an out-of-band check, the release page will publish the SHA-256 of each medium file.
3. **Linux package ownership.** Only the bootstrap (`embedforge-setup`) is a dpkg package.
   - The installed tree under `/opt/embedforge` belongs to EmbedForge's own CM (recovery
     store, baselines, rollback), not to dpkg.
   - `apt remove embedforge-setup` removes EmbedForge completely, through its own
     uninstaller.
4. **Dependency packages and group memberships stay at uninstallation,** because other
   software may use them. The uninstaller says so.
5. **Windows privileged helper:**
   - The binary is built and installed in Increment 1.
   - Its service and named-pipe transport arrive with its first function in Increment 2.
   - Nothing in Increment 1 needs it.
   - The boot-medium guard and the allowlist are host-independent code that the Windows
     transport will reuse.
6. **Windows Start-menu entry** is an Internet shortcut (`.url`) to the installed EXE. A
   `.lnk` shortcut needs COM; it can replace the `.url` later, for example together with a
   graphical installer.
7. **The installer is a text-mode program** (console window on Windows, terminal on Linux),
   with prompts and defaults.
   - It shows everything SS-01, SS-02, SS-04, SS-05 and HOST-04 require: host check, packs and
     consequences, drivers not included, WebView2 terms, missing functions and duration.
   - A graphical installer is possible later, without changing the installation logic.
