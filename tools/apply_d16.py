"""Apply decision D16 (D16-a of the WP 1.3 report) to the prompt: v3.7 -> v3.8.
Every replacement must match exactly once; the script aborts otherwise."""
import sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / "docs" / "requirements"
t = (root / "EmbedForge_prompt_v3.7.md").read_text(encoding="utf-8")
R = [
("hdr", "# EmbedForge — Build Prompt (v3.7)", "# EmbedForge — Build Prompt (v3.8)"),
("hdr", "D14) in section 31; changes from v3.6 (decision D15) in section 32.",
 "D14) in section 31; changes from v3.6 (decision D15) in section 32; changes from v3.7\n(decision D16) in section 33."),
("D16", "       package hash). Python wheels shall be installed without root",
 "       package hash); (d) restoring files of the installation that fail the SS-08 check,\n       only for paths listed in the signed manifests of the running installation and only\n       from the local recovery store, each restored file verified against its manifest\n       hash before it is put in place (SS-08). Python wheels shall be installed without root"),
("D16", "       event. DIAG-01 shall offer a full verification on demand.",
 "       event. Where the installation is not writable by the user, the restore shall be\n       performed by the privileged helper (SS-05(d)) without asking for administrator\n       rights. DIAG-01 shall offer a full verification on demand."),
("D16", "(section 30). Decision D14 is applied in v3.6 (section 31). Decision D15 is applied in this version\n(section 32).",
 "(section 30). Decision D14 is applied in v3.6 (section 31). Decision D15 is applied in v3.7\n(section 32). Decision D16 is applied in this version (section 33)."),
]
for fid, old, new in R:
    n = t.count(old)
    if n != 1: sys.exit(f"ABORT {fid}: expected 1 match, found {n}: {old[:70]!r}")
    t = t.replace(old, new)
t = t.rstrip("\n") + """

## 33. CHANGE LOG v3.7 → v3.8
Decision D16 (15 November 2026), answering D16-a of the Increment 1 WP 1.3 report: a
per-machine installation is read-only for the user, so SS-08 start-up repair could not
write restored files without administrator rights (SS-05). Option (ii) chosen: the
privileged helper gets a fourth, narrow function.
| Finding | Decision | Change |
| --- | --- | --- |
| WP1.3 D16-a | D16 | SS-05: new helper function (d), restore of SS-08 failures, limited to paths in the signed manifests and to the local recovery store, with hash verification. SS-08: on a non-writable installation the restore is done by the helper, with no administrator prompt. |
"""
(root / "EmbedForge_prompt_v3.8.md").write_text(t, encoding="utf-8")
print(f"OK: {len(R)} replacements + section 33")
