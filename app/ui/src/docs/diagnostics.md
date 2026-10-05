# Self-diagnosis and integrity

Open with **Ctrl+Shift+D**. The report has six sections:

| Section | Checks | Status in this build |
|---|---|---|
| (a) Integrity | Bundled files are checked against the signed manifest | Available |
| (b) Toolchains | Test compilation | Increment 2 |
| (c) USB and drivers | Serial ports and drivers | Increment 2 |
| (d) LLM runtime | Local language model | Increment 3 |
| (e) Emulator | Emulator health | Increment 5 |
| (f) Storage headroom | Free space on the installation volume | Available |

**At every start-up**, executables, libraries, scripts and schemas are fully checked.

- Large files, such as models and 3D libraries, are checked by size at start-up and fully
  checked in the background.
- **Full verification** checks everything at once.
- A damaged or missing file is restored from the local recovery store, with no network needed,
  and the event is logged.
- If the signed manifest itself is not trusted, reinstall from the installation medium.
- **Repair** checks every file and restores what is damaged. The status bar shows the result
  of the start-up check (*Integrity: OK*, or how many files could not be restored).
- If the installation folder is read-only for your account, the app reports the files it
  could not restore; run `embedforge-setup repair` as administrator (see *Installation,
  updates and repair*).
