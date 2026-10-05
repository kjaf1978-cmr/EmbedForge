# VAPP-04 — Self-repair, offline

**Requirement.** VAPP-04 / SS-08: a deleted or corrupted bundled component is detected and
restored offline.

## Steps (part of the same run as VAPP-03)

1. Network off. Run the kit's checks, as in VAPP-03: `run-vapp.cmd` as administrator, or
   `sh run-vapp.sh`.
2. The check deletes `embedforge-app/share/embedforge.png`. It also corrupts one byte of
   `embedforge-app/bin/embedforge` (the size stays the same; the app is not running at that
   moment). Then it runs the full
   integrity check with repair.

## Expected result

```
PASS VAPP-04 — Self-repair from the local recovery store, offline (SS-08)
    found: [… bin/embedforge HashMismatch, … embedforge.png Missing]
    restored: [… bin/embedforge, … embedforge.png]
    second full check: clean
```

## Optional manual variant (shows the start-up path in the app)

1. Delete `share\embedforge.png` in the installation's `embedforge-app` folder (administrator
   rights needed on a system-wide installation).
2. Start EmbedForge.

**Expected:** the yellow "Start-up checks" banner reports that 1 file was restored. The file is
back, and `state/integrity.log` has a `restored` event.

**System-wide installations (decision D16):** the app runs without administrator rights, so
on Linux it asks the privileged helper to put the file back (SS-05(d)); the helper's log
`/var/log/embedforge/helper.log` shows a `restore_files` request with decision `done`. Run
this variant once as a standard (non-administrator) user.
**Windows, until Increment 2:** the helper's Windows transport is not there yet, so the banner
says the file could not be restored and that you should run `embedforge-setup repair` as
administrator. Per-user installations repair themselves at start-up on every host.
