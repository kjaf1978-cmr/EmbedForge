"""Apply decision D9 (v3 review) to the EmbedForge prompt: v3 -> v3.1.
Every replacement must match exactly once; the script aborts otherwise."""
import sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent / "docs" / "requirements"
src = (root / "EmbedForge_prompt_v3.md").read_text(encoding="utf-8")
t = src

R = [
# header
("C3", "# EmbedForge — Build Prompt (v3)", "# EmbedForge — Build Prompt (v3.1)"),
("C3", "Changes from v2 are listed in section 25, each traced to the pre-Phase 0 review\nfinding (C-, A-, F-, M-) and decision (D1–D8) that caused it.",
 "Changes from v2 are listed in section 25, each traced to the pre-Phase 0 review\nfinding (C-, A-, F-, M-) and decision (D1–D8) that caused it. Changes from v3 are\nlisted in section 26, traced to the v3 review findings (C3-, F3-, A3-, M3-, E3-) and\ndecision D9."),
# definitions
("C3-01", "  jumper wires.\n",
 "  jumper wires.\n- *Part style*: one of (a) module build — *generic modules* on a carrier shield/HAT\n  or breadboard with headers; (b) discrete build — *discrete parts* only (PC-03).\n  *Part style* and *build style* are independent.\n"),
("A3-02", "  snapshot date, and its main IC is *active* as a *discrete part*.",
 "  snapshot date, and its main IC is *active* as a *discrete part*. If the main IC\n  cannot be identified, the module is *active* when at least two listed sources stock\n  it and it has a reviewed parameter sheet recording that the main IC is unidentified."),
("C3-09/A3-15", "- *Weak word*: any term listed in the documentation lint word list (DOC-10).",
 "- *Weak word*: any term listed in the documentation lint word list (DOC-10).\n- *Verified-auto*: every condition of status Verified (ST-04) except the human review\n  record check of VER-06 (DOC-12).\n- *Known project*: a project in the app's project registry — opened, created or\n  imported on this *host* and not removed from the registry."),
# invariants
("C3-07", "host-dependent functions listed in HOST-07; hosts shall otherwise differ only in\n        performance.",
 "host-dependent functions listed in HOST-07 and the functions listed as missing for\n        a per-user installation (SS-05); hosts shall otherwise differ only in\n        performance."),
("C3-02", "        applied only after user approval.\nINV-09",
 "        applied only after user approval. The netlist and a native geometry store\n        (versioned JSON) shall be the only stored sources of design data; KiCad\n        schematic and PCB files shall be derived artefacts, regenerated on save and\n        committed; any disagreement found on load between them and the netlist shall be\n        handled as an advanced-mode netlist diff.\nINV-09"),
("C3-04", "Use of the local network for\n        INV-02(b) is not an internet dependency.",
 "Use of the local network for\n        INV-02(b) is not an internet dependency. Exception: USB drivers whose licence\n        does not permit redistribution (SS-04); the affected boards shall be listed in the\n        installer and in DOC-11."),
("A3-14", "INV-11  Every part in a generated design shall be a *standard part* with a *standard\n        value*.",
 "INV-11  Every part in a generated design shall be a *standard part* with a *standard\n        value*. The *target board* counts as a part: it shall be a catalogue entry and a\n        BOM line."),
# status model
("A3-12", "requirement set passes\n       DOC-10.",
 "requirement set passes\n       the DOC-10 lint (the review record of DOC-12 is not required)."),
("A3-11", "breadboard build — VER-09 applied to the breadboard view.", "breadboard build — VER-15."),
("A3-11", "ST-05  Released for fabrication: Verified,", "ST-05  Released for fabrication (PCB builds only): Verified,"),
("C3-09", "       \"HIL-pending\" until a result is recorded.\n",
 "       \"HIL-pending\" until a result is recorded.\nST-09  Automated test harnesses (VAPP-06, CM-05, builder-run ACC tests) shall measure\n       and report *Verified-auto*. Status Verified shall be claimed only after the user\n       has recorded the review (DOC-12, TEST-02).\n"),
# hosts
("F3-02", "(b) Ubuntu LTS releases, x86-64,", "(b) Ubuntu Desktop LTS releases, x86-64,"),
("F3-02", "(c) Raspberry Pi OS 64-bit,", "(c) Raspberry Pi OS 64-bit with desktop,"),
("C3-07/E3-02", "(c) protection against writing an image to the *host*'s own\n        boot medium — enforced on every host, relevant on Pi 5 hosts.",
 "(c) LLM profile — requirement extraction and clarification\n        questions may differ between LLM profiles within their VAPP-06 thresholds;\n        everything downstream of the approved requirement set is deterministic (LLM-05)\n        and identical across hosts."),
# self-sufficiency
("F3-02/F3-03", "(Windows EXE; Linux AppImage or\n       .deb; Raspberry Pi OS arm64 .deb) and (b) signed component packs, each file\n       ≤ 3.9 GB so that the medium may be formatted FAT32.",
 "(Windows EXE; Ubuntu x86-64 .deb;\n       Raspberry Pi OS arm64 .deb) and (b) signed component packs. The medium shall be\n       formatted exFAT; each pack file shall be ≤ 3.9 GB so that FAT32 remains possible,\n       and one component may span several pack files (models as split GGUF; SS-08\n       hashes each part). The Linux component packs shall carry every dependency .deb\n       missing from a clean image of each supported release, installed through the local\n       package path."),
("A3-16", "packs (second LLM profile, Pi OS target images) shall be selectable at\n       installation.",
 "packs (second LLM profile, Pi OS target images) shall be selectable at\n       installation. The offline dependency sets of BRD-03 shall always be installed;\n       without the Pi OS images, imaging is unavailable and deployment to an already\n       imaged Pi remains available; the installer shall state this consequence."),
("C3-03/E3-02", "(a) writing an\n       image to a removable medium, with the HOST-07(c) guard; (b) installing,\n       starting, stopping and removing the single EmbedForge project service used by\n       HOST-07(b).",
 "(a) writing an\n       image to a removable medium and writing first-boot configuration files to it,\n       with a guard against writing to the *host*'s own boot medium, enforced on every\n       host; (b) installing, starting, stopping and removing the single EmbedForge\n       project service used by HOST-07(b); (c) installing .deb packages taken only from\n       the signed offline dependency set of the running EmbedForge version (allowlist by\n       package hash). Python wheels shall be installed without root into a per-project\n       virtual environment."),
("C3-10", "checked against the datasheet. Each\n       parameter sheet",
 "checked against the datasheet. For user catalogue extensions\n       (EM-04), a parameter sheet may be generated at *install-time* from a datasheet in\n       the local library, with the user recorded as reviewer. Each parameter sheet"),
("F3-01", "SS-08  At start-up the app shall verify the SHA-256 checksums of all executables,\n       libraries and files under 64 MB, and the size and cached checksum of larger\n       files (models, OS images, packs); it shall then verify the full checksums of\n       the larger files in the background.",
 "SS-08  At start-up the app shall verify the SHA-256 checksums of every executable,\n       shared library, script, grammar and schema file, and the size, modification time\n       and signed cached checksum of every other file (models, OS images, packs, part\n       libraries, 3D models, documents); it shall then verify the full checksums of\n       those other files in the background."),
# safety
("A3-04", "a supply separate from the *target\n       board* regulator, regardless",
 "a supply separate from every supply pin\n       of the *target board* (regulator outputs and 5 V/USB pass-through pins), regardless"),
("A3-05", "       The limit applies to voltages on nets inside the design, not to part ratings.",
 "       The limit applies to voltages on nets inside the design, not to part ratings.\n       Net voltage is the maximum steady-state voltage produced by the design's\n       sources; switching transients clamped under ED-03(f) are excluded."),
# emulation / catalogue
("A3-03", "       interface, and record the substitution in DOC-09.",
 "       interface, and record the substitution in DOC-09. An ACC part (section 19) that\n       fails the *active* test is satisfied by its EM-02A substitute; the substitution\n       shall appear in DOC-09 and in the ACC test report."),
("C3-01", "PC-03  Build style shall be selectable per project:", "PC-03  *Part style* shall be selectable per project, independently of *build style*:"),
# UI
("C3-08", "on approval the project\n       returns to Draft (ST-07) and code and circuit are regenerated and\n       re-verified.",
 "on approval the NL-02\n       checks shall run on the changed requirements, the status shall be recomputed under\n       ST-07, and code and circuit shall be regenerated and re-verified."),
# NL
("A3-06", "(h) *target\n       board* capability gaps (TB-05).",
 "(h) *target\n       board* capability gaps (TB-05); (i) functions not covered by a qualified block\n       template (LLM-05), with the options: nearest template with the stated deviations,\n       simplified requirement, or a manual code block outside *generated regions* (UI-12),\n       unverified until its gates pass."),
# ED
("A3-04", "(g) motor or actuator powered from the *target board* regulator.",
 "(g) motor or actuator powered from a supply pin of the *target board*."),
# PCB
("A3-17", "for every IC placed on the board; (c) thermal",
 "for every IC placed on the board — placement shall target the\n       straight-line pad-edge distance and the routed-copper distance shall be checked\n       after routing as a custom DRC rule within VER-08; (c) thermal"),
# board handling
("M3-01", "       access on the *target board*.\n",
 "       access on the *target board*.\nBRD-04 For HAT+ builds, the app shall generate the ID EEPROM image and program it over\n       SSH on the *target board* with bundled tools; the step and its verification shall\n       appear in DOC-05 and VER-12.\n"),
# LLM
("A3-07", "any other code library shall require explicit user\n       approval.",
 "a code library not in the curated set may be\n       used only after the user imports it as a package (SEC-03) and approves it for the\n       project."),
# data
("C3-02", "requirements,\n        interfaces, parameters, pin map, netlist and metadata in versioned JSON or YAML\n        schemas; code as source files; schematic and PCB in KiCad formats.",
 "requirements,\n        interfaces, parameters, netlist, view geometry and metadata in versioned JSON or\n        YAML schemas; code as source files; the pin map as a derived cache of the\n        netlist; schematic and PCB in KiCad formats as derived artefacts (INV-08)."),
("C3-06", "a board outline of 100 × 100 mm.",
 "a board outline with longest side ≤ 110 mm and area ≤ 10 000 mm² (part limit\n        confirmed in Phase 0 (h) against a hand-estimated ACC-02 BOM)."),
# CM
("F3-04", "emulation scenarios pass,\n           on both host profiles.",
 "emulation scenarios pass,\n           on both host profiles. For Profile B, the functional gates run on the arm64 CI\n           runner with a Raspberry Pi OS userland; Profile B PERF checks are\n           user-executed (TEST-02) and do not block a release."),
("A3-15", "pinned by a known project (CM-06)", "pinned by a *known project* (CM-06)"),
# docs
("A3-12", "Each document shall also carry a human review record. The\n       weak-word list", "The\n       weak-word list"),
("A3-12/C3-05", "self-diagnosis manual, component and licence inventory) shall follow DOC-01..04,\n       DOC-06, DOC-07 and DOC-10 and ship inside the app.",
 "self-diagnosis manual, component and licence inventory separating linked and\n       aggregated components per Phase 0 (a)) shall follow DOC-01..04, DOC-06, DOC-07,\n       DOC-10 and DOC-12 and ship inside the app.\nDOC-12 Review record: each document shall carry a human review record stating\n       reviewer, date and the document version reviewed."),
# verification
("A3-01", "mpy-cross compiles every file without\n       error, and VER-02 passes.",
 "mpy-cross compiles every file without\n       error, and VER-02 passes. For CPython (Raspberry Pi targets), the equivalent level\n       is: py_compile passes under the target image's Python version (3.11 on Bookworm,\n       3.13 on Trixie), and VER-02 passes."),
("F3-05", "pylint messages of category error or fatal.",
 "pylint messages of category error or fatal.\n       pylint shall run against bundled type stubs for MicroPython ports and the\n       Raspberry Pi GPIO libraries, pinned as a library item (CM-06)."),
("A3-12/A3-13", "the traceability matrix has no gaps, and\n       every document has a human review record newer than its last change.",
 "the traceability matrix has no gaps (a\n       gap is a requirement with no verification method, block or test; an HIL-pending\n       result is not a gap), and every document has a human review record (DOC-12)\n       newer than its last change."),
("C3-01", "a footprint matching the selected build style.",
 "a footprint matching the selected *build style* and *part style* (breadboard build:\n       2.54 mm-pitch through-hole or header-mounted parts only)."),
("A3-11", "       track-cut omissions.\n",
 "       track-cut omissions.\nVER-15 Breadboard consistency: the breadboard view implements every netlist\n       connection, with no missing, extra or mismatched connections.\n"),
("C3-09", "≥ 90 % of prompts reach status Verified within LLM-04's retry limit;\n        0 % reach Verified with",
 "≥ 90 % of prompts reach *Verified-auto* within LLM-04's retry limit;\n        0 % reach *Verified-auto* with"),
("C3-09/A3-06", "Expected questions shall be board-specific.",
 "Expected questions shall be board-specific.\n        Each corpus entry shall include scripted answers to its expected questions;\n        unexpected questions shall take the proposed default, which shall be logged. The\n        corpus shall include at least two prompts requiring functions not covered by a\n        qualified template (NL-02(i))."),
# ACC
("A3-08", "built as an Uno shield (2-layer PCB) and as a Raspberry\n       Pi HAT+ variant.",
 "built as an Uno shield (2-layer PCB) and as a Raspberry\n       Pi HAT+ variant on a Raspberry Pi 5. In the HAT+ variant the DHT22 shall be read\n       through the kernel dht11 overlay (IIO); EM-05 shall provide an IIO device model\n       for it, otherwise the requirements depending on the DHT22 are HIL-pending for\n       this variant."),
("A3-10", "       (b) to (e) as for ACC-02, with the PCB form factors Uno shield and HAT+.",
 "       (b), (c) and (e) as for ACC-02, with the PCB form factors Uno shield and HAT+.\n       (d) Emulation lets the user drive temperature, humidity and sensor-failure\n           injection, and shows fan PWM duty, fan speed, LCD content and alarm LED\n           state behaving as specified; all scenarios pass."),
("A3-09", "Target: ELEGOO UNO R3; repeated on ELEGOO MEGA 2560 R3 and Raspberry Pi Pico.",
 "Target: ELEGOO UNO R3; repeated on ELEGOO MEGA 2560 R3 and Raspberry Pi Pico.\n       The Pico acceptance run uses the Arduino core (C++); a MicroPython run is added\n       from Increment 5."),
# Phase 0
("C3-05", "and confirmation that each is compatible with\n      EmbedForge's GPL-3.0-or-later licence, or a proposed replacement;",
 "each classified as linked (compiled or linked into EmbedForge\n      binaries or the web UI; shall be compatible with GPL-3.0-or-later) or aggregated\n      (separate executables, runtimes, drivers, model weights, datasheets, images; shall\n      permit redistribution with no conditions conflicting with SS-01 or SS-09), or a\n      proposed replacement;"),
("A3-18", "(c) LLM model profiles, with benchmark results on a draft of the VAPP-06 corpus;",
 "(c) LLM model profiles, with benchmark results on a draft of the VAPP-06 corpus,\n      limited to NL-02 question recall (VAPP-06 tag matching), schema-valid extraction\n      under the grammar, and generation time, per candidate model and profile;"),
("C3-06", "(h) confirmed or corrected PERF targets and VAPP-06 thresholds;",
 "(h) confirmed or corrected PERF targets and VAPP-06 thresholds, and the DATA-04\n      part limit checked against a hand-estimated ACC-02 BOM;"),
# increments
("A3-11/M3-01", "Increment 6: PCB and perfboard layout (PCB-01..09, UI-10); VER-08..14; hardware",
 "Increment 6: PCB and perfboard layout (PCB-01..09, UI-10); HAT+ EEPROM programming\n  (BRD-04); VER-08..15; hardware"),
("A3-12", "traceability (DOC-01..11)", "traceability (DOC-01..12)"),
("C3-09", "model (ST-01..08).", "model (ST-01..09)."),
# section 24
("D9", "The pre-Phase 0 review of v2 is complete and its decisions (D1–D8) are applied in\nthis version.",
 "The pre-Phase 0 review of v2 is complete and its decisions (D1–D8) are applied. The\nreview of v3 is complete and decision D9 (accept all proposed resolutions) is applied\nin this version (section 26)."),
]

for fid, old, new in R:
    n = t.count(old)
    if n != 1:
        sys.exit(f"ABORT {fid}: expected 1 match, found {n}: {old[:70]!r}")
    t = t.replace(old, new)

# E3-01: move TEST-04 after TEST-03
start = t.index("TEST-04 Infrastructure provided by me:")
end = t.index("TEST-02 Tests requiring physical hardware")
block = t[start:end]
t = t[:start] + t[end:]
anchor = t.index("## 21. TECHNOLOGY BASELINE")
t = t[:anchor].rstrip("\n") + "\n" + block.rstrip("\n") + "\n\n" + t[anchor:]

t = t.rstrip("\n") + "\n" + (root / "changelog_v3.1_section26.md").read_text(encoding="utf-8")
(root / "EmbedForge_prompt_v3.1.md").write_text(t, encoding="utf-8")
print(f"OK: {len(R)} replacements + TEST-04 move + section 26")
