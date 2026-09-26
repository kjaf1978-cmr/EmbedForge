# Phase 0 (a) — Licence analysis  ·  (b) platform availability (desk evidence)

- Baseline: prompt v3.2
- Version: 0.1.0 (26 September 2026)
- Status: draft. Desk research only; this is not legal advice. Human review record (DOC-12):
  pending.

## Method

- Licences come from primary sources: each project's LICENSE/COPYING file in its official
  repository, and the vendor's own terms pages. URLs are in section 5.
- **UNVERIFIED** means the primary source could not be fetched or states nothing. Nothing is
  guessed. No refused fetch was worked around.
- Components are classed as agreed in D9 (C3-05):
  - **Linked**: compiled into EmbedForge binaries or the web UI. Must be compatible with
    GPL-3.0-or-later.
  - **Aggregated**: separate programs or data. Need redistribution rights only.
- The (b) columns record whether official prebuilt binaries exist. A **build** confirmation
  needs CI (TEST-01), so (b) stays open until the self-hosted runners exist.

## 1. Software components

| Component | Version (Sept 2026) | SPDX | Class | Obligations | Win x64 | Linux x64 | Linux arm64 | Notes |
|---|---|---|---|---|---|---|---|---|
| Tauri 2 | 2.11.5 | Apache-2.0 OR MIT | Linked | Notices | crate | crate | crate | — |
| serialport-rs | 4.x | MPL-2.0 | Linked | MPL-2.0 §3.3 allows combination with GPL; check the files carry no "Incompatible With Secondary Licenses" marker (UNVERIFIED) | crate | crate | crate | — |
| three.js | r186 | MIT | Linked | Notice | JS | JS | JS | — |
| libgit2 + git2-rs | 1.9.7 / 0.21.0 | GPL-2.0-only WITH linking exception; MIT OR Apache-2.0 | Linked | Exception allows linking into GPL-3 | build | build | build | Use ≥ 1.9.7 (security fix) |
| minisign-verify (crate) | 0.3.0 | MIT | Linked | Notice | crate | crate | crate | No minisign CLI needed at runtime |
| rp2040js | 1.4.0 | MIT | Linked (JS) | Notice | JS | JS | JS | RP2040 only |
| llama.cpp / ggml | pin one build tag (e.g. b10456) | MIT | Aggregated (server) | Notice | yes | yes | yes | Rolling tags; pin the tag and hash |
| CPython (python-build-standalone) | 20260924 | PSF-2.0; build scripts MPL-2.0 | Aggregated | Ship the licence files | UNVERIFIED | UNVERIFIED | UNVERIFIED | Uses libedit, so no GPL readline |
| Temurin JRE | **25 needed** (21.0.12 checked) | GPL-2.0-only WITH Classpath-exception-2.0 | Aggregated | Source available (OpenJDK) | yes | yes | yes (21); 25 UNVERIFIED | Freerouting 2.4.1 requires Java 25 (F0-07) |
| arduino-cli | 1.5.1 | GPL-3.0-or-later | Aggregated | Source / written offer | yes | yes | yes | — |
| ArduinoCore-avr | 1.8.8 | LGPL-2.1-or-later | Aggregated (source) | Source (shipped as source) | n/a | n/a | n/a | — |
| avr-gcc (Arduino build) | 7.3.0-atmel3.6.1-arduino7 | GPL-3.0-or-later + GCC exception | Aggregated | Source / written offer | yes | yes | **suspect** | arduino/toolchain-avr#73: "aarch64" build reported as 32-bit ARM (F0-08) |
| avrdude | 8.3 (Arduino ships 8.0.0-arduino1) | GPL-2.0-or-later | Aggregated | Source / written offer | yes | yes | UNVERIFIED | — |
| Arduino-Pico core | 6.1.x | LGPL-2.1 (+ BSD/MIT parts) | Aggregated | Keep notices; GPL toolchain source | index | index | index | — |
| pico-sdk / picotool | 2.3.1 / 2.3.0 binaries | BSD-3-Clause | Aggregated | Notice | yes | yes | yes | Binaries from pico-sdk-tools |
| Arm GNU toolchain | 15.2.Rel1 | GPL-3.0-or-later WITH GCC-exception-3.1; newlib UNVERIFIED | Aggregated | Source / written offer | yes | yes | yes | — |
| MicroPython / mpy-cross | 1.29.0 | MIT | Aggregated | Notice | build | build | build | No official mpy-cross binaries |
| simavr | tags only | GPL-3.0 (only / or-later UNVERIFIED) | Aggregated | Source | build | build | build | Windows build takes effort |
| ngspice | 47 | BSD-3-Clause (XSPICE public domain) | Aggregated | Notice | yes | build | build | — |
| RP2350 emulators | rp2350js (early); rp2040-pio-emulator | MIT; Apache-2.0 | Linked | Notices | JS | JS | JS | Immature; feeds (m) |
| KiCad + kicad-cli | 10.0.6 (9.0.9) | GPL-3.0-or-later (+ MIT/BSD/Boost) | Aggregated | Source / written offer (large) | yes | yes | **no official stable** | F0-06 |
| Freerouting | 2.4.1 | GPL-3.0 | Aggregated | Source | yes | yes | jar only | Needs Java 25 |
| gerbv | 2.13.0 | GPL-2.0-or-later | Aggregated | Source | yes | deb | build | VER-11 viewer |
| cppcheck | 2.22.0 | GPL-3.0 | Aggregated | Source | MSI | build | build | CI build needed |
| ruff | 0.16.9 | MIT | Aggregated | Notice | yes | yes | yes | — |
| pylint | 4.0.9 | GPL-2.0-or-later | Aggregated | Source | wheel | wheel | wheel | — |
| gpiozero / lgpio / pyserial | 2.0.1.post2 / 0.2.2.0 / 3.5 | BSD-3 / Unlicense / BSD-3 | Aggregated (Pi target) | Notices | n/a | n/a | wheel (lgpio UNVERIFIED) | pyserial releases stale (2020) |
| asyncssh (or paramiko) | 2.24.0 / 5.0.0 | EPL-2.0 OR GPL-2.0-or-later / LGPL-2.1-or-later | Aggregated | Source | wheel | wheel | wheel | Either is fine |
| micropython-stubs | rolling | MIT | Aggregated (data) | Notice | — | — | — | For VER-02 (F3-05) |
| esptool, Espressif QEMU (Tier 2) | 5.4.0 / esp-develop-9.2.2 | GPL-2.0-or-later / GPL-2.0 (mixed) | Aggregated | Source | yes | yes | yes | Increment 9 |
| Upstream QEMU | 11.1.1 | GPL-2.0 (mixed) | — | — | no | distro | distro | **Proposed: drop** (F0-10) |
| WebKitGTK | 2.54 | UNVERIFIED (LGPL-2.1 / BSD expected) | System library (not shipped) | — | n/a | distro | distro | Supplied by the OS |

**Result:** every Linked component is compatible with GPL-3.0-or-later. Every Aggregated
copyleft component needs its corresponding source, or a written offer, on the medium and on
the GitHub release. This is planned as a separate source pack (R-16).

## 2. Drivers, runtimes, OS images

| Item | Terms | Redistribution | Conditions | Recommendation |
|---|---|---|---|---|
| ATmega16U2 boards (Windows) | Windows inbox usbser.sys loads for CDC-ACM | Not needed | — | Rely on inbox driver; confirm on real Uno/Mega (TEST-02) |
| WCH CH340/CH341 (Windows) | No terms found | UNVERIFIED | — | Don't bundle without written permission from WCH (F0-02) |
| Silicon Labs CP210x (Windows) | SLAB VCP licence | Yes, with conditions | Silicon Labs chips only; unmodified; end-user terms at least as protective | Mostly Tier 2 (ESP32); decide at Increment 9 |
| FTDI VCP (Windows) | FTDI driver licence | Yes, with conditions | Only with genuine FTDI parts; clones are common in kits | **Don't bundle** |
| Linux USB-serial | ch341, cp210x, ftdi_sio, cdc_acm in kernel | n/a | — | Ship only udev rules + dialout membership (SS-04) |
| WebView2 Fixed Version | Microsoft Distributable Code terms | Yes, with conditions | "Significant primary functionality"; end-user terms at least as protective; must not be subjected to a copyleft licence | F0-01 |
| Raspberry Pi OS images | No image terms published; Debian licences + Broadcom firmware (binary, unmodified, Raspberry Pi devices only) | UNVERIFIED | GPL source obligations; trademark; **the Full image includes Mathematica for non-commercial use only** | F0-03 |

Current Raspberry Pi OS releases (raspberrypi.com, releases of 15 September 2026):
- 64-bit, based on Debian 13 Trixie, kernel 6.18.
- "Legacy" 64-bit, based on Debian 12 Bookworm, kernel 6.12.

## 3. LLM weights (for Phase 0 (c))

| Model | Licence | Status |
|---|---|---|
| Qwen3-4B / 8B / 14B | Apache-2.0 (official GGUFs exist) | **Shortlist** |
| Qwen2.5-Coder-7B / 14B | Apache-2.0 | Shortlist (the **3B** is research-only, so excluded) |
| Ministral-3-8B-2512 | Apache-2.0 | Shortlist (Ministral-8B-2410 is research-only, so excluded) |
| Phi-4 / Phi-4-mini | MIT | Shortlist |
| IBM Granite 4.0 (micro verified) | Apache-2.0 | Shortlist |
| Gemma 3 | Gemma Terms + prohibited-use flow-down + remote-restriction clause | Excluded (F0-04) |
| Llama 3.x | Community licence, AUP, "Built with Llama" branding | Excluded (F0-04) |

Candidates per profile:
- **Small (Profile B default):** Qwen3-4B, Phi-4-mini, Granite-4.0-micro.
- **Large:** Qwen3-8B/14B, Qwen2.5-Coder-7B/14B, Ministral-3-8B, Phi-4.

## 4. Documents, libraries, images

| Item | Licence | Redistribute? | Use |
|---|---|---|---|
| Datasheets: TI, ST, Microchip, NXP, ADI/Maxim, Bosch, Toshiba, Allegro | Terms forbid redistribution without written permission | **No** | Parameter sheets + link (SS-07) |
| Datasheets: Aosong, Solomon Systech, Espressif | No grant found | No (default copyright) | Parameter sheets + link |
| Raspberry Pi Ltd documents (RP2040 hardware design, HAT+ specification; others to check per colophon) | CC BY-ND 4.0 | Yes, unmodified, with credit | Bundle as is |
| KiCad symbol/footprint/3D libraries | CC-BY-SA 4.0 + design exception | Yes | Bundle with licence. User designs carry no obligation. Our own library additions are CC-BY-SA |
| Fritzing parts | CC-BY-SA 3.0 Unported (LICENSE.txt, verified) | Yes | Import/export only (section 21) |
| Arduino docs content | CC-BY-SA 4.0 (trademarks excluded) | Yes, with attribution | Pinouts/doc excerpts; check each image |
| Raspberry Pi documentation | CC-BY-SA 4.0 | Yes, with attribution | Docs |
| ELEGOO tutorials | Site terms forbid redistribution | **No** | Write our own tutorials |
| SunFounder 3in1-kit | GPL-3.0 (other repositories vary / UNVERIFIED) | Yes (3in1-kit) | Check each repository |
| HAT+ EEPROM tools (raspberrypi/utils eeptools) | BSD-3-Clause | Yes | BRD-04 |

## 5. Sources

**Software**
- Code repositories and release pages on github.com:
  - Shell and core: tauri-apps/tauri, serialport/serialport-rs, mrdoob/three.js, libgit2/libgit2, rust-lang/git2-rs, ggml-org/llama.cpp, astral-sh/python-build-standalone, adoptium/temurin21-binaries.
  - Arduino and AVR: arduino/arduino-cli, arduino/ArduinoCore-avr, arduino/toolchain-avr/issues/73, avrdudes/avrdude.
  - Pico and MicroPython: earlephilhower/arduino-pico, raspberrypi/pico-sdk, raspberrypi/picotool, raspberrypi/pico-sdk-tools, micropython/micropython, Josverl/micropython-stubs.
  - Emulation: buserror/simavr, wokwi/rp2040js, c1570/rp2350js, NathanY3G/rp2040-pio-emulator.
  - PCB and analysis: KiCad/kicad-source-mirror, freerouting/freerouting, gerbv/gerbv, danmar/cppcheck, astral-sh/ruff, pylint-dev/pylint.
  - Pi target and SSH: gpiozero/gpiozero, joan2937/lg, pyserial/pyserial, paramiko/paramiko, ronf/asyncssh.
  - Tier 2 and signing: espressif/esptool, espressif/qemu, jedisct1/minisign, jedisct1/rust-minisign-verify.
- Other software sources:
  - ngspice.sourceforge.io
  - kicad.org/download/linux
  - forum.kicad.info/t/kicad-9-package-for-arm64-ubuntu-plucky-missing-in-ppa/61640
  - learn.arm.com/install-guides/gcc/arm-gnu
  - qemu.org/download

**Drivers and runtimes**
- scancode-licensedb.aboutcode.org/ftdi.html
- silabs.com CP210x release notes; SLAB VCP licence text (third-party copy)
- wch-ic.com/downloads/CH341SER_EXE.html
- learn.microsoft.com/…/usb-driver-installation-based-on-compatible-ids
- kernel.org/doc/html/latest/usb/usb-serial.html
- scancode-licensedb.aboutcode.org/ms-edge-webview2-fixed.html
- github.com/raspberrypi/firmware/blob/master/boot/LICENCE.broadcom
- raspberrypi.com/software/operating-systems

**Models**
- huggingface.co model cards: Qwen/Qwen3-4B, Qwen/Qwen3-8B-GGUF, Qwen/Qwen2.5-Coder-3B/7B/14B-Instruct, mistralai/Ministral-3-8B-Instruct-2512, mistralai/Ministral-8B-Instruct-2410, microsoft/phi-4, microsoft/Phi-4-mini-instruct, google/gemma-3-4b-it, meta-llama/Llama-3.2-3B-Instruct, ibm-granite/granite-4.0-micro
- ai.google.dev/gemma/terms

**Documents**
- Vendor terms: ti.com/legal/terms-of-use.html, st.com terms-of-use, onlinedocs.microchip.com/terms-and-conditions, nxp.com terms-of-use, analog.com copyright-notice, bosch-sensortec.com/legal-note.html, allegromicro.com/en/about-allegro/legal, elegoo.com/pages/terms-of-service
- Raspberry Pi documents: pip-assets.raspberrypi.com (RP2040 hardware design; HAT+ specification)
- Libraries and docs: kicad.org/libraries/license, github.com/fritzing/fritzing-parts (LICENSE.txt), github.com/arduino/docs-content, github.com/raspberrypi/documentation, github.com/raspberrypi/utils
- Kits: github.com/sunfounder/3in1-kit

**UNVERIFIED because the fetch was refused or blocked** (not bypassed):
- Pages: the Nexar/Octopart API terms, the Microsoft WebView2 distribution page, the Raspberry Pi OS image terms (none published) and the FTDI licence page.
- Details: the newlib licence, lgpio arm64 wheels, the python-build-standalone triples and Temurin 25 arm64.
