# Increment 1 — user-executed procedures (TEST-02)

These procedures are for you to run on your hosts. Record each result in the WP 1.4 test
report, or send me the result files and I will record them. Until a result is recorded, the
report marks it **U (awaiting user execution)**.

| Procedure | What it checks | Hosts | Needs |
|---|---|---|---|
| [VAPP-01](VAPP-01.md) | Clean-machine offline installation; Increment 1 functions; PERF-01, PERF-08, PERF-09 | Windows 10 and 11, Ubuntu 22.04 and 24.04, Pi OS on a Pi 5 | Signed release medium; freshly installed OS |
| [VAPP-03](VAPP-03.md) | Every file loaded at run time is in the app folder or an OS library | Each host after VAPP-01 | VAPP test kit |
| [VAPP-04](VAPP-04.md) | Damaged or missing files are restored offline | Each host after VAPP-01 | VAPP test kit |
| [VAPP-05](VAPP-05.md) | Offline update from USB and rollback | Each host after VAPP-01 | VAPP test kit |
| [SEC-02 key rotation](SEC-02_key_rotation.md) | How release keys are created, used, rotated and replaced | Your offline signing host | minisign |
| [Signing a release](signing.md) | The signing steps that run on your infrastructure | Profile A test PC (self-hosted runner) | Offline key, Authenticode token |

**One run covers VAPP-03, 04 and 05.** After VAPP-01, run `run-vapp.cmd` (Windows) or
`sh run-vapp.sh` (Linux) from the VAPP test kit folder. Each check prints PASS or FAIL, and
the output is also saved as `vapp-result.txt`. Send me that file.

Before you can run these procedures:
- The release key pair must exist ([SEC-02 key rotation](SEC-02_key_rotation.md), step 1).
- Its public keys must be in `core/ef-integrity/trusted-keys.txt`.
- The self-hosted runners must be registered (F3-06).

Until then, the hosted CI runs the same checks on development media; see the WP 1.3 report.
