# VAPP-04 — Self-repair, offline

**Requirement.** VAPP-04 / SS-08: a deleted or corrupted bundled component is detected and
restored offline.

## Steps (part of the same run as VAPP-03)

1. Network off. Run the kit's checks, as in VAPP-03: `run-vapp.cmd` as administrator, or
   `sh run-vapp.sh`.
2. The check deletes `embedforge-app/share/embedforge.png`. It also corrupts one byte of
   `embedforge-app/bin/embedforge-helper` (the size stays the same). Then it runs the full
   integrity check with repair.

## Expected result

```
PASS VAPP-04 — Self-repair from the local recovery store, offline (SS-08)
    found: [… embedforge-helper HashMismatch, … embedforge.png Missing]
    restored: [… embedforge-helper, … embedforge.png]
    second full check: clean
```

## Optional manual variant (shows the start-up path in the app)

1. Delete `share\embedforge.png` in the installation's `embedforge-app` folder (administrator
   rights needed on a system-wide installation).
2. Start EmbedForge.

**Expected:** the yellow "Start-up checks" banner reports that 1 file was restored. The file is
back, and `state/integrity.log` has a `restored` event.

**Known limitation (finding F1-01, decision D16):** the app runs without administrator rights.
It therefore cannot write into a system-wide installation folder. In that case the banner
says that the file could not be restored and that you should run `embedforge-setup repair`
as administrator. Per-user installations repair themselves at start-up.
