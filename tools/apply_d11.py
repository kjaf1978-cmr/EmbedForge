"""Apply decision D11 (Phase 0 findings F0-01..F0-11) to the prompt: v3.2 -> v3.3.
Every replacement must match exactly once; the script aborts otherwise."""
import sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent / "docs" / "requirements"
t = (root / "EmbedForge_prompt_v3.2.md").read_text(encoding="utf-8")

R = [
("hdr", "# EmbedForge — Build Prompt (v3.2)", "# EmbedForge — Build Prompt (v3.3)"),
("hdr", "Changes from v3.1 (decision D10) are listed in section 27.",
 "Changes from v3.1 (decision D10) are listed in section 27;\nchanges from v3.2 (decision D11) in section 28."),
("F0-02", "installer shall instead accept the user's own copy of it and list the affected\n       boards.",
 "installer shall instead accept the user's own copy of it and list the affected\n       boards. In the first release no Windows USB-serial driver shall be bundled:\n       ATmega16U2 boards shall use the Windows built-in CDC driver, and CH340, CP210x and\n       FTDI boards fall under the INV-10 exception unless written redistribution\n       permission is obtained."),
("F0-07/F0-04", "runtime; a JRE if any bundled component requires one;",
 "runtime; a JRE if any bundled component requires one (Temurin 25 for\n       Freerouting);"),
("F0-04/F0-01/F0-03", "SS-03  Bundled components shall",
 "       LLM weights shall be licensed Apache-2.0 or MIT. The Windows installer shall\n       present the WebView2 runtime licence terms for acceptance. A source pack shall\n       carry the corresponding source of every copyleft component and package on the\n       medium.\nSS-03  Bundled components shall"),
("F0-09", "Each parameter sheet shall record its reviewer and review date;",
 "The user may import datasheet files they obtained into a\n       per-host local library; imported datasheets shall not be included in project\n       files, exports to other users or signed packages. Each parameter sheet shall\n       record its reviewer and review date;"),
("F0-03", "Raspberry Pi *target boards* shall be supported with the Raspberry Pi OS\n       64-bit Bookworm and Trixie images held in the local library.",
 "Raspberry Pi *target boards* shall be supported with the Raspberry Pi OS\n       Lite 64-bit Trixie and Bookworm (Legacy) images held in the local library;\n       desktop and Full images shall not be shipped. Until Raspberry Pi Ltd confirms\n       that unmodified images may be redistributed, the images shall be imported by\n       the user from a downloaded file and verified against a signed list of SHA-256\n       hashes."),
("F0-11", "rotary encoder, MPU-6050, BMP280,", "rotary encoder, ICM-42688-P, BMP280,"),
("F0-11", "(for\n       example MPU-6050, reported end-of-life by its manufacturer, to be confirmed in\n       Phase 0)",
 "(for\n       example MPU-6050, confirmed obsolete by its manufacturer in Phase 0 and replaced\n       here by ICM-42688-P)"),
("F0-05", "sources, lifecycle status, and catalogue snapshot date.",
 "sources, lifecycle status, and catalogue snapshot date. The catalogue shall be an\n       original, fact-only dataset licensed CC-BY-4.0 and curated by hand: lifecycle\n       status from the manufacturer's own product page or notice; each source recorded\n       with vendor, SKU, URL, check date and in-stock flag; every field with its source\n       URL and date. No data obtained through distributor APIs or bulk extraction shall\n       be included."),
("F0-01", "- Licence: EmbedForge is licensed GPL-3.0-or-later.",
 "- Licence: EmbedForge is licensed GPL-3.0-or-later, with a section 7 additional\n  permission allowing combination with the Microsoft Edge WebView2 runtime."),
("F0-04", "- Local LLM: llama.cpp with quantised GGUF models,",
 "- Local LLM: llama.cpp with quantised GGUF models (Apache-2.0/MIT weights; shortlist\n  in docs/phase0/a_licence_analysis.md),"),
("F0-08", "- Build/flash: arduino-cli with pre-installed cores (",
 "- Build/flash: arduino-cli with pre-installed cores; the same avr-gcc version on every\n  host, built natively for arm64 if the upstream arm64 build fails qualification ("),
("F0-10", "Python GPIO emulation or QEMU for Pi targets,",
 "Python GPIO emulation under a virtual clock for Pi targets,"),
("F0-06", "- PCB: KiCad 9+ engine headless (kicad-cli)",
 "- PCB: KiCad 10.0.x engine headless (kicad-cli; private arm64 build on the self-hosted\n  Pi runner)"),
("D11", "Decision D10 is applied in this version (section 27).",
 "Decision D10 is applied in v3.2 (section 27). Decision D11 is applied in this version\n(section 28)."),
]
for fid, old, new in R:
    n = t.count(old)
    if n != 1:
        sys.exit(f"ABORT {fid}: expected 1 match, found {n}: {old[:70]!r}")
    t = t.replace(old, new)

t = t.rstrip("\n") + """

## 28. CHANGE LOG v3.2 → v3.3
Findings: docs/phase0/findings_for_D11.md; decision D11 (26 September 2026): accept all.
| Finding | Decision | Change |
| --- | --- | --- |
| F0-01 | D11 | Section 21: GPL-3 §7 additional permission for WebView2; SS-02: installer presents WebView2 terms. |
| F0-02 | D11 | SS-04: no Windows USB-serial driver bundled in the first release. |
| F0-03 | D11 | TB-02: Pi OS Lite images only; user import with hash check until redistribution confirmed; SS-02: source pack. |
| F0-04 | D11 | SS-02 and section 21: Apache-2.0/MIT LLM weights only. |
| F0-05 | D11 | PC-01: hand-curated, fact-only CC-BY-4.0 catalogue; no API or bulk data. |
| F0-06 | D11 | Section 21: KiCad 10.0.x, private arm64 build. |
| F0-07 | D11 | SS-02: Temurin 25 JRE for Freerouting. |
| F0-08 | D11 | Section 21: identical avr-gcc on every host. |
| F0-09 | D11 | SS-07: user-imported datasheets, per host, never redistributed. |
| F0-10 | D11 | Section 21: Python GPIO emulation under a virtual clock for Pi targets; upstream QEMU dropped. |
| F0-11 | D11 | EM-03: ICM-42688-P replaces MPU-6050 (kit part). |
"""
(root / "EmbedForge_prompt_v3.3.md").write_text(t, encoding="utf-8")
print(f"OK: {len(R)} replacements + section 28")
