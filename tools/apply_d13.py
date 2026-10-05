"""Apply decision D13 (Phase 0 findings F0-12..F0-20) to the prompt: v3.4 -> v3.5.
Every replacement must match exactly once; the script aborts otherwise."""
import sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / "docs" / "requirements"
t = (root / "EmbedForge_prompt_v3.4.md").read_text(encoding="utf-8")
R = [
("hdr", "# EmbedForge — Build Prompt (v3.4)", "# EmbedForge — Build Prompt (v3.5)"),
("hdr", "changes from v3.3 (decision D12) in\nsection 29.", "changes from v3.3 (decision D12) in\nsection 29; changes from v3.4 (decision D13) in section 30."),
("F0-20", "(c) ≥ 60 GB free SSD storage, exact\n        figure confirmed in Phase 0;",
 "(c) ≥ 60 GB free SSD storage for the\n        default and typical selections, the installer warning that selecting every\n        optional pack needs about 75 GB;"),
("F0-18", "       diagram renderers.\n       LLM weights",
 "       diagram renderers. KiCad 3D models shall be installed by default only for\n       catalogue parts; the full 3D library shall be an optional pack. The RISC-V\n       toolchain for RP2350 shall not be bundled.\n       LLM weights"),
("F0-14", "reviewed datasheet or parameter sheet shall count as *standard parts*.",
 "reviewed datasheet or parameter sheet shall count as *standard parts*.\n       Board documentation licensed CC-BY-SA (Arduino, Raspberry Pi) may be bundled\n       with attribution, under the same licence and without trademarks."),
("F0-17", "the user from a downloaded file and verified against a signed list of SHA-256\n       hashes.",
 "the user from a downloaded file and verified against a signed list of SHA-256\n       hashes. If shipping is permitted, only the current Lite image shall be shipped,\n       with a written offer for its corresponding source."),
("F0-15", "PCB-02 Every schematic component shall have a verified footprint from the offline\n       library; layout shall be blocked until all components have one.",
 "PCB-02 Every schematic component shall have a verified footprint from the offline\n       library; layout shall be blocked until all components have one. Symbols,\n       footprints, 3D models and board templates made for EmbedForge shall be licensed\n       CC-BY-SA 4.0 with the KiCad library design exception; third-party templates whose\n       licence would bind users' designs shall not be used."),
("F0-16", "one standard prototype profile and allow user-defined profiles.",
 "one standard prototype profile and allow user-defined profiles. The shipped default\n       profile shall be EF-PROTO-STD (docs/phase0/f_fab_profile.md)."),
("F0-13", "Pico code libraries approved in Phase 0, with their documentation.",
 "Pico code libraries approved in Phase 0, with their documentation. The curated set\n       shall contain only permissively licensed (MIT, BSD, Apache-2.0) or LGPL\n       libraries."),
("F0-12", "declares). Adding a template shall be a data-only operation.",
 "declares). Adding a template shall be a data-only operation. Block-template\n       packages shall be licensed MIT, as configuration items separate from the GPL\n       application; generated firmware, documents and design files belong to the user\n       and carry an MIT notice where template code appears."),
("F0-20", "versions of a baseline shall delete that baseline record, after user\n       confirmation.",
 "versions of a baseline shall delete that baseline record, after user\n       confirmation. The recovery store shall be content-addressed, so that unchanged\n       items are stored once."),
("F0-19", "Pi runner) for DRC and output;",
 "Pi runner; on Ubuntu the official AppImage is extracted at installation and never run\n  as an AppImage) for DRC and output;"),
("F0-18", "  with bundled JRE or a native autorouter;",
 "  as the Freerouting 2.5.0 native command-line build if it is self-contained (no JRE),\n  otherwise with the bundled Temurin 25 JRE, or a native autorouter;"),
("D13", "Decision D12 is applied in this version (section 29).",
 "Decision D12 is applied in v3.4 (section 29). Decision D13 is applied in this version\n(section 30)."),
]
for fid, old, new in R:
    n = t.count(old)
    if n != 1: sys.exit(f"ABORT {fid}: expected 1 match, found {n}: {old[:70]!r}")
    t = t.replace(old, new)
t = t.rstrip("\n") + """

## 30. CHANGE LOG v3.4 → v3.5
Findings: docs/phase0/findings_for_D13.md; decision D13 (5 October 2026): accept all.
| Finding | Decision | Change |
| --- | --- | --- |
| F0-12 | D13 | LLM-06: block templates licensed MIT; generated output belongs to the user. |
| F0-13 | D13 | LIB-01: curated libraries permissive or LGPL only. |
| F0-14 | D13 | SS-07: CC-BY-SA board documentation may be bundled. |
| F0-15 | D13 | PCB-02: own library items CC-BY-SA 4.0 with design exception; no templates that bind users' designs. |
| F0-16 | D13 | PCB-05: default profile EF-PROTO-STD. |
| F0-17 | D13 | TB-02: if Pi OS shipping is permitted, current Lite image only, written offer for sources. |
| F0-18 | D13 | SS-02: 3D models for catalogue parts by default, no RISC-V toolchain; section 21: Freerouting native build if self-contained. |
| F0-19 | D13 | Section 21: KiCad AppImage extracted on Ubuntu. |
| F0-20 | D13 | HOST-02(c): 60 GB default/typical, 75 GB warning; CM-09: content-addressed recovery store. |
"""
(root / "EmbedForge_prompt_v3.5.md").write_text(t, encoding="utf-8")
print(f"OK: {len(R)} replacements + section 30")
