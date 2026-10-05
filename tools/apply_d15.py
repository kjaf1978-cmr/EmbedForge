"""Apply decision D15 (answer to Q-01) to the prompt: v3.6 -> v3.7.
Every replacement must match exactly once; the script aborts otherwise."""
import sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / "docs" / "requirements"
t = (root / "EmbedForge_prompt_v3.6.md").read_text(encoding="utf-8")
R = [
("hdr", "# EmbedForge — Build Prompt (v3.6)", "# EmbedForge — Build Prompt (v3.7)"),
("hdr", "changes from v3.5 (decision\nD14) in section 31.", "changes from v3.5 (decision\nD14) in section 31; changes from v3.6 (decision D15) in section 32."),
("D15", "  permission allowing combination with the Microsoft Edge WebView2 runtime.",
 "  permission allowing combination with the Microsoft Edge WebView2 runtime. The\n  intended use is non-commercial; this is a statement of purpose, not a licence\n  restriction, because GPL-3.0-or-later permits no further restrictions. If the licence\n  prevents meeting a requirement, the builder shall report it at the next gate so that the\n  licence can be reconsidered."),
("D15", "Decision D14 is applied in this version (section 31).",
 "Decision D14 is applied in v3.6 (section 31). Decision D15 is applied in this version\n(section 32)."),
]
for fid, old, new in R:
    n = t.count(old)
    if n != 1: sys.exit(f"ABORT {fid}: expected 1 match, found {n}: {old[:70]!r}")
    t = t.replace(old, new)
t = t.rstrip("\n") + """

## 32. CHANGE LOG v3.6 → v3.7
Decision D15 (5 October 2026), answering Q-01: keep GPL-3.0-or-later for non-commercial
use, unless the licence limits implementation of the required specification.
| Finding | Decision | Change |
| --- | --- | --- |
| Q-01 | D15 | Section 21: non-commercial intended use recorded as purpose, not restriction; licence conflicts with requirements are reported at the next gate. |
"""
(root / "EmbedForge_prompt_v3.7.md").write_text(t, encoding="utf-8")
print(f"OK: {len(R)} replacements + section 32")
