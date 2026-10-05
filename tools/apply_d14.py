"""Apply decision D14 (F0-21..F0-24, with DATA-04 raised to 100 parts by the owner): v3.5 -> v3.6.
Every replacement must match exactly once; the script aborts otherwise."""
import sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / "docs" / "requirements"
t = (root / "EmbedForge_prompt_v3.5.md").read_text(encoding="utf-8")
R = [
("hdr", "# EmbedForge — Build Prompt (v3.5)", "# EmbedForge — Build Prompt (v3.6)"),
("hdr", "section 29; changes from v3.4 (decision D13) in section 30.",
 "section 29; changes from v3.4 (decision D13) in section 30; changes from v3.5 (decision\nD14) in section 31."),
("F0-21", "        PERF-08 applies to the start-up check defined in SS-08.",
 "        PERF-08 applies to the start-up check defined in SS-08. PERF-09 for Profile B\n        applies to NVMe storage; on microSD the limit is 60 min and the installer shall\n        show the expected duration."),
("F0-22", "The accurate mode (full SPICE co-simulation) is excluded from PERF-05.",
 "The accurate mode (full SPICE co-simulation) is excluded from PERF-05.\n        For RP2040 targets PERF-05 applies to the bundled native-C emulator engine."),
("F0-23", "at most 40 parts, 120 nets and", "at most 100 parts, 120 nets and"),
("F0-24a", "       tests), within PERF-10.",
 "       tests), within PERF-10. Highlighting follows direct links by default; transitive\n       highlighting is available on request."),
("F0-24e", "       colour-coded wires.",
 "       colour-coded wires (red: supply, black: ground, other colours by signal class)."),
("F0-24c", "UI-16  Board manager and flashing view: detected boards, ports, driver status, flash\n       progress and logs.",
 "UI-16  Board manager and flashing view: detected boards, ports, driver status, flash\n       progress and logs. Flashing code that is not labelled *Code verified* shall\n       require an explicit confirmation naming the failing gates; the override shall be\n       logged."),
("F0-24b", "       mode (all views freely accessible), switchable at any time.",
 "       mode (all views freely accessible), switchable at any time. In guided mode the\n       review views are read-only, with a Change action that returns to the step owning\n       the artefact."),
("F0-24d", "        through collapsible panes.",
 "        through collapsible panes (split views off by default, side panes as\n        overlays)."),
("D14", "Decision D13 is applied in this version\n(section 30).",
 "Decision D13 is applied in v3.5\n(section 30). Decision D14 is applied in this version (section 31)."),
]
for fid, old, new in R:
    n = t.count(old)
    if n != 1: sys.exit(f"ABORT {fid}: expected 1 match, found {n}: {old[:70]!r}")
    t = t.replace(old, new)
t = t.rstrip("\n") + """

## 31. CHANGE LOG v3.5 → v3.6
Findings: docs/phase0/findings_for_D14.md; decision D14 (5 October 2026): accept all, with
F0-23 changed by you to 100 parts.
| Finding | Decision | Change |
| --- | --- | --- |
| F0-21 | D14 | HOST-08: PERF-09 Profile B on NVMe; 60 min on microSD with displayed estimate. |
| F0-22 | D14 | HOST-08: PERF-05 for RP2040 applies to the native-C emulator engine. |
| F0-23 | D14 (modified) | DATA-04: at most 100 parts (proposed 60). |
| F0-24 | D14 | UI-02 direct-link highlighting; UI-18 read-only guided review; UI-16 confirmed and logged flash override; UI-09 wire colours; HOST-02(e) compact layout. |
"""
(root / "EmbedForge_prompt_v3.6.md").write_text(t, encoding="utf-8")
print(f"OK: {len(R)} replacements + section 31")
