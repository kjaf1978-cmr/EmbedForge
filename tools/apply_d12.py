"""Apply decision D12 (exclude discontinued kit parts with no successor): v3.3 -> v3.4.
Every replacement must match exactly once; the script aborts otherwise."""
import sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / "docs" / "requirements"
t = (root / "EmbedForge_prompt_v3.3.md").read_text(encoding="utf-8")
R = [
("hdr", "# EmbedForge — Build Prompt (v3.3)", "# EmbedForge — Build Prompt (v3.4)"),
("hdr", "changes from v3.2 (decision D11) in section 28.",
 "changes from v3.2 (decision D11) in section 28; changes from v3.3 (decision D12) in\nsection 29."),
("D12", "       model, behavioural stub, or \"not emulated\".\nEM-02A",
 "       model, behavioural stub, or \"not emulated\". A *kit part* whose main IC is\n       discontinued (end of life, obsolete or no longer manufactured) and for which no\n       *active* equivalent with the same function and interface has been identified\n       shall be excluded: it shall have no component model and no catalogue entry, and\n       it shall be listed with its reason in DOC-11. A description that names an\n       excluded part shall raise an NL-02 clarification offering catalogue\n       alternatives.\nEM-02A"),
("D12", "in this version\n(section 28).", "in v3.3\n(section 28). Decision D12 is applied in this version (section 29)."),
]
for fid, old, new in R:
    n = t.count(old)
    if n != 1: sys.exit(f"ABORT {fid}: expected 1 match, found {n}: {old[:70]!r}")
    t = t.replace(old, new)
t = t.rstrip("\n") + """

## 29. CHANGE LOG v3.3 → v3.4
Decision D12 (5 October 2026): exclude discontinued kit parts that have no successor.
| Finding | Decision | Change |
| --- | --- | --- |
| (n) MPR121 | D12 | EM-02: discontinued kit parts without an *active* equivalent of the same function and interface are excluded from the model library and the catalogue, listed in DOC-11, and raise an NL-02 clarification when named. Applies today to NXP MPR121. |
"""
(root / "EmbedForge_prompt_v3.4.md").write_text(t, encoding="utf-8")
print(f"OK: {len(R)} replacements + section 29")
