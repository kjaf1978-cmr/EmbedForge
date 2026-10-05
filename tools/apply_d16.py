"""Apply decision D16 (finding F1-01, option A) to the prompt: v3.7 -> v3.8.
Every replacement must match exactly once; the script aborts otherwise."""
import sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / "docs" / "requirements"
t = (root / "EmbedForge_prompt_v3.7.md").read_text(encoding="utf-8")
R = [
("hdr", "# EmbedForge — Build Prompt (v3.7)", "# EmbedForge — Build Prompt (v3.8)"),
("hdr", "D14) in section 31; changes from v3.6 (decision D15) in section 32.",
 "D14) in section 31; changes from v3.6 (decision D15) in section 32; changes from v3.7\n(decision D16) in section 33."),
("F1-01", "       package hash). Python wheels shall be installed without root into a per-project",
 "       package hash); (d) restoring files of the installed EmbedForge version from the\n"
 "       local recovery store (SS-08), writing only paths listed in a signed component\n"
 "       manifest of the active version and only content whose hash matches that\n"
 "       manifest. Python wheels shall be installed without root into a per-project"),
("F1-01", "       component from a local recovery store without network access, logging the",
 "       component from a local recovery store without network access (through the\n"
 "       privileged helper, SS-05(d), where the installation directory is not writable for\n"
 "       the user), logging the"),
("D16", "Decision D15 is applied in this version\n(section 32).",
 "Decision D15 is applied in v3.7\n(section 32). Decision D16 is applied in this version (section 33)."),
]
for fid, old, new in R:
    n = t.count(old)
    if n != 1: sys.exit(f"ABORT {fid}: expected 1 match, found {n}: {old[:70]!r}")
    t = t.replace(old, new)
t = t.rstrip("\n") + """

## 33. CHANGE LOG v3.7 → v3.8
Decision D16 (5 October 2026): finding F1-01, option A.
| Finding | Decision | Change |
| --- | --- | --- |
| F1-01 | D16 | SS-05: helper function (d), restoring signed files of the installed version from the recovery store; SS-08: start-up repair uses it where the installation directory is not writable for the user. |
"""
(root / "EmbedForge_prompt_v3.8.md").write_text(t, encoding="utf-8")
print(f"OK: {len(R)} replacements + section 33")
