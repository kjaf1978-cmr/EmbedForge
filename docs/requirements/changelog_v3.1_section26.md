
## 26. CHANGE LOG v3 → v3.1
Review findings are those of the v3 review (docs/requirements/v3_review_findings.md);
decision D9 (26 September 2026): accept all proposed resolutions.
| Finding | Decision | Change |
| --- | --- | --- |
| C3-01 | D9 | *Part style* defined; PC-03 renamed; VER-13 uses *build style* and *part style*. |
| C3-02 | D9 | INV-08: netlist + geometry store are the only sources; KiCad files derived. DATA-01: pin map is a derived cache. |
| C3-03 | D9 | SS-05: helper function (c) allowlisted .deb install; first-boot configuration writing; wheels in per-project venv. |
| C3-04 | D9 | INV-10: exception for non-redistributable USB drivers. |
| C3-05 | D9 | Phase 0 (a): linked vs aggregated licence classes; DOC-11 inventory separates them. |
| C3-06 | D9 | DATA-04: outline longest side ≤ 110 mm, area ≤ 10 000 mm²; Phase 0 (h) checks part limit. |
| C3-07 | D9 | INV-07: per-user installation exception; HOST-07(c) LLM profile. |
| C3-08 | D9 | UI-05: status recomputed under ST-07. |
| C3-09 | D9 | *Verified-auto* defined; ST-09 added; VAPP-06 measures *Verified-auto* with scripted answers. |
| C3-10 | D9 | SS-07: install-time parameter sheets for user catalogue extensions. |
| F3-01 | D9 | SS-08: tiering by criticality, not file size. |
| F3-02 | D9 | HOST-01: Desktop editions; SS-01: .deb bootstraps with bundled dependency .debs. |
| F3-03 | D9 | SS-01: exFAT medium; components may span several pack files. |
| F3-04 | D9 | CM-05(a): Profile B functional gates on arm64 CI; Profile B PERF user-executed. |
| F3-05 | D9 | VER-02: pylint against bundled stubs. |
| A3-01 | D9 | VER-01: CPython level defined. |
| A3-02 | D9 | *Active*: rule for modules with unidentifiable main IC. |
| A3-03 | D9 | EM-02A: ACC parts satisfied by substitutes. |
| A3-04 | D9 | SAF-02 and ED-03(g): every supply pin of the target board. |
| A3-05 | D9 | SAF-04: net voltage is steady-state. |
| A3-06 | D9 | NL-02(i) added; VAPP-06 includes uncovered prompts. |
| A3-07 | D9 | LLM-01: approval via user package import. |
| A3-08 | D9 | ACC-01: HAT+ variant on Pi 5, DHT22 via IIO overlay. |
| A3-09 | D9 | ACC-02: Pico run in Arduino core C++; MicroPython from Increment 5. |
| A3-10 | D9 | ACC-01(d) defined. |
| A3-11 | D9 | VER-15 added; ST-04 breadboard uses VER-15; ST-05 PCB builds only. |
| A3-12 | D9 | DOC-12 review record split from DOC-10; ST-02 lint only. |
| A3-13 | D9 | VER-06: gap defined; HIL-pending is not a gap. |
| A3-14 | D9 | INV-11: target board is a catalogue part and BOM line. |
| A3-15 | D9 | *Known project* defined; CM-09 uses it. |
| A3-16 | D9 | SS-01: dependency sets always installed; Pi OS images optional. |
| A3-17 | D9 | PCB-03(b): placement target and post-route DRC check. |
| A3-18 | D9 | Phase 0 (c) benchmark scope. |
| M3-01 | D9 | BRD-04 HAT+ EEPROM programming (Increment 6). |
| E3-01 | D9 | TEST-04 moved after TEST-03. |
| E3-02 | D9 | Boot-medium guard moved from HOST-07(c) to SS-05(a). |
