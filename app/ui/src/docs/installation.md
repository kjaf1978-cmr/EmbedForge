# Installation, updates and repair

EmbedForge installs from one offline medium per host OS (SS-01). No network is needed at any
step.

## Installing

- **Windows:** double-click `EmbedForge-Setup-<version>-x64.exe` on the medium. The installer
  asks whether to install for all users (administrator rights; includes the privileged helper)
  or just for you.
- **Ubuntu and Raspberry Pi OS:** open a terminal on the medium and run `sh install.sh`. It
  asks for your password for a system-wide installation; `sh install.sh --per-user` installs
  without administrator rights.

The installer first checks the signature of the medium (SEC-02) and every pack file, runs
the host check (HOST-04) and shows each shortfall with its consequence, and lists the
optional packs with what you lose without them. It then shows the expected duration.

## Per-user installation

Without administrator rights there are no USB drivers or udev rules and no privileged helper
(SS-05). The installer lists the functions that are therefore missing.

## Updates from USB (SS-09)

`embedforge-setup update --package <folder>` applies a signed update package. The package is
checked exactly like an online update. After the update, the integrity check runs; if it
fails, the previous versions are put back automatically.

## Rolling back (CM-04)

`embedforge-setup versions` lists every version kept in the local recovery store;
`embedforge-setup rollback --item <id> --to <version>` goes back to one of them, offline.

## Repair (SS-08)

At every start the app checks its own files and restores damaged or missing ones from the
local recovery store. **Self-diagnosis → Repair** checks every file. If the installation
folder is read-only for your account (system-wide installation), run
`embedforge-setup repair` as administrator.

## Removing

Use *Apps → Installed apps* on Windows, or `sudo embedforge-setup uninstall` on Linux. Your
projects are not touched.
