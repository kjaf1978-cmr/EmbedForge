# VAPP-03 — Dependency audit

**Requirement.** VAPP-03: every file loaded at run time is inside the app directory or among
the OS standard libraries.

**How.** `embedforge-setup vapp` starts the installed app, waits 20 s, and lists every file
the app and its child processes have mapped or opened:
- on Linux from `/proc/<pid>/maps` and `/proc/<pid>/fd`;
- on Windows, the modules loaded by the main process.

Each file is classified as one of:
- in the app folder;
- OS standard library or data;
- the app's own per-user data (settings, web-view cache);
- outside.

System-wide copies of tools the app bundles count as *outside* even though they sit in OS
folders, for example a system Python or KiCad (SS-03).

## Steps

1. After VAPP-01, with the network still off, copy the **VAPP test kit** folder to the
   computer or leave it on the stick.
2. Run the kit's checks:
   - **Windows:** right-click `run-vapp.cmd` → *Run as administrator*.
   - **Linux:** open a terminal in the kit folder and type `sh run-vapp.sh`.

   The app window opens for about 20 s and closes again. Do not use it meanwhile.

## Expected result

```
PASS VAPP-03 — Dependency audit of the running app
    N process(es): … files in the app directory, … OS standard, … app data, 0 outside
```

A FAIL lists every file outside: send me `vapp-result.txt`.

**Limitation on Windows (Increment 1):** only the modules of the main process are listed. The
WebView2 child processes are not audited yet.
