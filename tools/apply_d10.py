"""Apply decision D10 to the EmbedForge prompt: v3.1 -> v3.2.
Every replacement must match exactly once; the script aborts otherwise."""
import sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent / "docs" / "requirements"
t = (root / "EmbedForge_prompt_v3.1.md").read_text(encoding="utf-8")

R = [
("hdr", "# EmbedForge — Build Prompt (v3.1)", "# EmbedForge — Build Prompt (v3.2)"),
("hdr", "listed in section 26, traced to the v3 review findings (C3-, F3-, A3-, M3-, E3-) and\ndecision D9.",
 "listed in section 26, traced to the v3 review findings (C3-, F3-, A3-, M3-, E3-) and\ndecision D9. Changes from v3.1 (decision D10) are listed in section 27."),
("C3-11", "each pack file shall be ≤ 3.9 GB so that FAT32 remains possible,",
 "each pack file shall be ≤ 1.9 GiB (the GitHub Releases asset limit\n       of CM-10; also FAT32-safe),"),
("C3-11", "distribution shall require no user account and shall collect no telemetry.",
 "distribution shall require no user account and shall collect no telemetry.\n       Every release asset shall be ≤ 1.9 GiB; the same pack files shall be used for\n       online and USB distribution."),
("F3-06", "environment for functional tests. Performance targets for profile B require a\n        physical Pi 5.",
 "environment for functional tests. Performance targets for profile B require a\n        physical Pi 5. GitHub-hosted runners shall run compile, unit, static-analysis,\n        emulation and schema jobs, pack by pack. Two self-hosted runners on my hardware\n        — the Profile A test PC (x86-64) and a Raspberry Pi 5 host (arm64) — shall run\n        installation-medium assembly, the VAPP-06 corpus, profile-level gates and\n        signing."),
("F3-06", "TEST-04 Infrastructure provided by me: a GitHub repository and GitHub Actions with\n        Windows, Ubuntu and arm64 runners;",
 "TEST-04 Infrastructure provided by me: a public GitHub repository\n        (github.com/kjaf1978-cmr/EmbedForge) and GitHub Actions with Windows, Ubuntu\n        and arm64 hosted runners, plus the self-hosted runners of TEST-01;"),
("R-11", "(m) emulator evaluation for RP2040 and RP2350 against EM-05 and EM-06;",
 "(m) emulator evaluation for RP2040 and RP2350 against EM-05 and EM-06, and a spike\n      on time-accurate emulation of CPython for Raspberry Pi targets (virtual clock for\n      sleep, GPIO callbacks and IIO devices);"),
("D10", "decision D9 (accept all proposed resolutions) is applied\nin this version (section 26).",
 "decision D9 (accept all proposed resolutions) is applied\nin v3.1 (section 26). Decision D10 is applied in this version (section 27)."),
]
for fid, old, new in R:
    n = t.count(old)
    if n != 1:
        sys.exit(f"ABORT {fid}: expected 1 match, found {n}: {old[:70]!r}")
    t = t.replace(old, new)

t = t.rstrip("\n") + """

## 27. CHANGE LOG v3.1 → v3.2
Findings are those raised in Phase 0 (k) (docs/phase0/k_risk_register.md, section 2);
decision D10 (26 September 2026): accept all proposed resolutions.
| Finding | Decision | Change |
| --- | --- | --- |
| C3-11 | D10 | SS-01 and CM-10: pack files and release assets ≤ 1.9 GiB, same files online and on USB. |
| F3-06 | D10 | TEST-01: job split between hosted and self-hosted runners; TEST-04: public repository, self-hosted runners. |
| R-11 | D10 | Phase 0 (m): CPython time-virtualisation spike for Raspberry Pi targets. |
"""
(root / "EmbedForge_prompt_v3.2.md").write_text(t, encoding="utf-8")
print(f"OK: {len(R)} replacements + section 27")
