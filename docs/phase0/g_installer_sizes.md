# Phase 0 (g) — Installer and installed size per host OS

- Baseline: prompt v3.4
- Version: 0.1.0
- Date: 2026-10-05
- Status: draft
- Human review record (DOC-12): pending

**Scope.** This file sizes the SS-01 installation medium (exFAT, pack files ≤ 1.9 GiB = 1945.6 MiB), the installed tree (SS-02, SS-03) and the CM-09 recovery store for the three hosts:
- **W**: Windows 10/11 x64
- **U**: Ubuntu 22.04/24.04/26.04 x64
- **P**: Raspberry Pi OS 64-bit on a Pi 5

It then compares them with HOST-02(c), HOST-03 and PERF-09.

**Method and units.**
- Sizes are in MiB/GiB. Figures shown as "MB" on GitHub and as "GB" on Hugging Face (decimal) were converted. The GitHub MB ≈ MiB approximation is accurate to about ±5 %.
- "pub" means a published size from a primary page, accessed 2026-10-05.
- **est.** means an estimate. The method is given in the note for each row.
- Installed size is est. throughout unless a distribution package page states it. The usual factor for est. installed size is ×2.5–3 of the compressed archive (typical tar.gz/zip ratio for binaries).
- Packs are assumed to be zstd-compressed. GGUF and .xz files are stored as they are, because they do not compress further.

## 1. Component sizes (pack = on medium; inst = installed)

| # | Component | W pack / inst | U pack / inst | P pack / inst | Basis |
|---|---|---|---|---|---|
| 1 | App: Tauri shell, UI, three.js, libgit2 | 25 / 60 | 25 / 60 | 22 / 55 | est. (typical Tauri binary plus assets) |
| 2 | WebView2 Fixed Version runtime | 180 / 480 | — | — | est. Microsoft page refused earlier (see (a)); UNVERIFIED |
| 3 | llama.cpp b10456: CPU + Vulkan (P: CPU) | 51 / 130 | 48 / 120 | 13 / 35 | pub zips: win-cpu 17.6 + win-vulkan 33.2; ubuntu-x64 15.9 + vulkan 31.7; ubuntu-arm64 12.9. inst est. ×2.5 |
| 4 | CPython 3.13.16 (pbs 20261003) install_only + wheels (pylint, asyncssh, pyserial…) | 75 / 210 | 95 / 270 | 80 / 230 | pub: 44.4 / 63.8 / 49.9 (stripped: 21 / 32.7 / 27.9). Wheels est. 30 MiB |
| 5 | Temurin 25.0.4.1 JRE | 50 / 140 | 59 / 150 | 58 / 150 | pub: win MSI 49.6; linux x64 58.5; aarch64 57.7. inst est. |
| 6 | Freerouting 2.5.0 jar | 62 / 62 | 62 / 62 | 62 / 62 | pub 61.6 (see finding G-4) |
| 7 | arduino-cli 1.5.1 | 17 / 45 | 17 / 45 | 15 / 42 | pub 17.1 / 16.8 / 15.4 |
| 8 | AVR core 1.8.8 + avr-gcc 7.3.0-arduino7 + avrdude 8.0.0-arduino1 | 45 / 220 | 45 / 220 | 45 / 220 | core pub 6.8 MiB (package_index.json). Tool archives est.: not in the fetched index excerpt |
| 9 | Arduino-Pico 6.1.x + Arm toolchain + picotool/pioasm/mklittlefs | 220 / 1100 | 200 / 1000 | 190 / 950 | est. Index fetch blocked by robots.txt. Anchored to the pico-sdk-tools RISC-V toolchain sizes (row 10) |
| 10 | RISC-V toolchain (RP2350 Hazard3) — **optional, recommend drop** | 145 / 800 | 124 / 750 | 115 / 700 | pub riscv-toolchain-16: 145 / 124 / 115. inst est. |
| 11 | pico-sdk-tools 2.3.1 + picotool 2.3.1 + openocd | 11 / 35 | 4 / 15 | 4 / 15 | pub: 0.75 + 1.65 + 7.84 (W); 0.15 + 1.0 + 2.18 (U); 0.14 + 0.95 + 2.1 (P) |
| 12 | MicroPython 1.29 firmware (Pico, Pico W, Pico 2, Pico 2 W) + mpy-cross | 9 / 10 | 9 / 10 | 9 / 10 | est. 0.6–1.8 MiB per .uf2 (micropython.org blocked in (m)) |
| 13 | simavr (own build) + rp2040js/rp2350js | 5 / 15 | 3 / 10 | 3 / 10 | Ubuntu simavr 1.6 deb 10 kB / 36 kB inst (+ libsimavr2). Rest est. |
| 14 | ngspice | 25 / 80 | 5 / 30 | 5 / 28 | Ubuntu 26.04 ngspice 45.2: amd64 4.46 / 28.8; arm64 4.14 / 27.2 (pub). W est. |
| 15 | KiCad 10.0.6 app + kicad-cli, without libraries | 450 / 1300 | 450 / 1300 | 250 / 900 | Win installer **923 MB pub** (includes libraries and 3D). Minus 3D, est. U: AppImage extracted, est. (Lite size not shown). P: own build, est. from Ubuntu arm64 kicad 9.0.8 deb 33.8 / 124 inst plus private deps |
| 16 | KiCad symbols + footprints | 10 / 380 | 10 / 380 | 10 / 380 | Ubuntu 26.04 v9.0.7 (pub): symbols 2.4 / 212 MiB inst; footprints 6.6 / 154 MiB inst. v10 assumed similar |
| 17 | KiCad 3D models, **catalogue subset** (STEP + WRL) | 40 / 250 | 40 / 250 | 40 / 250 | est.: a few hundred footprints out of the full library |
| 18 | gerbv | 15 / 40 | 2 / 13 | 2 / 13 | Ubuntu 26.04 gerbv 2.10.0 (pub): 1.78 / 12.9 (amd64), 1.77 / 12.9 (arm64). W 2.13 zip est. |
| 19 | cppcheck 2.22 | 23 / 60 | 5 / 30 | 5 / 30 | W MSI 22.8 pub. Ubuntu 2.19 deb 2.3 / 9.9 pub. Own 2.22 build est. |
| 20 | ruff 0.16.10 + pylint 4.0.9 | 10 / 28 | 10 / 28 | 9 / 26 | ruff pub 9.3 / 9.54 / 8.97 |
| 21 | PDF / diagram renderers | 30 / 80 | 30 / 80 | 30 / 80 | est. (component not yet chosen) |
| 22 | Docs, catalogue, templates, code/symbol sets | 300 / 600 | 300 / 600 | 300 / 600 | est. (depends on (e) and (o)) |
| 23 | Host .deb dependency sets (SS-01), one per supported release | — | 450 / 450* | 500 / 500* | est.: about 150 MiB × 3 Ubuntu releases; about 250 MiB × 2 Pi OS releases (Bookworm, Trixie; includes KiCad build deps). *installed into the system, not the app dir |
| 24 | BRD-03 Pi target sets (arm64 Bookworm + Trixie) | 120 / 120 | 120 / 120 | 120 / 120 | est. 60 MiB per release |
| 25 | **LLM default profile** | 8B: 4797 | 8B: 4797 | 4B: 2384 | pub Qwen3-8B-Q4_K_M 5.03 GB; Qwen3-4B-Q4_K_M 2.5 GB |
| 26 | *Optional:* second LLM profile | 4B: 2384 | 4B: 2384 | 8B: 4797 | pub (as above) |
| 27 | *Optional:* Qwen3-14B Q4_K_M (A only) | 8583 | 8583 | not offered | pub 9 GB. P: too large for 8 GB RAM |
| 28 | *Optional:* Pi OS Lite 64-bit images, kept as .xz | 895 | 895 | 895 | pub: Trixie 516 MB, Bookworm (legacy) 422 MB (2026-09-15). Uncompressed est. 2.6–3.0 GiB each; UNVERIFIED |
| 29 | *Optional:* llama.cpp CUDA + cudart | 612 / 1500 | — | — | pub: 239 + 373 (CUDA 12.4) |
| 30 | *Optional:* full KiCad 3D library | 500 / 4700 | 500 / 4700 | 500 / 4700 | Ubuntu 26.04 kicad-packages3d 9.0.7: 344 MiB deb / **4.55 GiB inst** (pub). 24.04 v7: 395 MiB / 5.44 GiB. zstd pack est. |
| 31 | Source pack (copyleft); stays on the medium, not installed | 1500 | 2100 | 1900 | est., see section 4 |

Notes on the table:
- LLM sizes are identical for pack and inst, since GGUF is stored as is.
- The P LLM row: the default 4B model is 2.33 GiB, which gives 2 pack files.

## 2. Totals per host OS

"Core" means everything always installed, including the default LLM. "Typical" means core plus the second LLM profile and the Pi OS images.

| | W | U | P |
|---|---|---|---|
| Medium: core + source pack | **7.9 GiB** | **8.7 GiB** | **5.9 GiB** |
| Medium: + 2nd LLM + Pi OS images | 11.1 GiB (16 GB stick) | 11.9 GiB (16 GB stick) | 11.5 GiB (16 GB stick) |
| Medium: every optional pack | 20.7 GiB (32 GB stick) | 20.9 GiB (32 GB stick) | 12.0 GiB (16 GB stick) |
| Installed: core | 10.0 GiB | 9.8 GiB | 6.9 GiB |
| Installed: typical | 13.2 GiB | 13.0 GiB | 12.5 GiB |
| Installed: every option | 27.6 GiB | 26.0 GiB | 17.1 GiB |
| + recovery store, ×1.5–2 (core) | 15–20 GiB | 15–20 GiB | 10–14 GiB |
| + recovery, ×1.5–2 (typical) | 20–26 GiB | 20–26 GiB | 19–25 GiB |
| + recovery, ×1.5–2 (every option) | 41–55 GiB | 39–52 GiB | 26–34 GiB |
| Limit | HOST-02(c) 60 GB = 55.9 GiB | same | HOST-03(b) microSD ≥ 128 GB (≈ 119 GiB, minus OS about 12 GiB est.) |
| **Verdict** | Core and typical fit with room for projects and temp files. **Every option with ×2 recovery reaches 55 GiB, about the full 60 GB** | As W, 52 GiB | Fits with a wide margin |
| Pack files, core (≤ 1.9 GiB) | **8**: LLM 3, KiCad + libs 1, toolchains 1, runtimes 1, docs 1, BRD-03 1 | **10**: as W, plus 3 host .deb packs | **9**: LLM 2, KiCad 1, toolchains 1, runtimes 1, docs 1, BRD-03 1, 2 host .deb packs |
| Pack files, source | 1 | 2 | 1 (1.86 GiB, close to the limit) |
| Pack files, optional | 2nd LLM 2 · Pi OS 1 · 14B 5 · CUDA 1 · 3D full 1 · RISC-V 1 | 2nd LLM 2 · Pi OS 1 · 14B 5 · 3D full 1 · RISC-V 1 | 2nd LLM (8B) 3 · Pi OS 1 · 3D full 1 · RISC-V 1 |

Notes on the totals:
- "Every option" on the installed rows leaves out RISC-V (row 10, recommended for dropping). On P it also leaves out the 14B model, which is not offered there.
- The recovery factor follows the brief: total = installed × 1.5–2, so recovery is 0.5–1.0 × installed.
- At first install the recovery store is empty. It grows to about 1 × an item's size after that item's first update.
- If the store is content-addressed, unchanged items, models in particular, are never duplicated.
- The pack-file counts above group small components into a handful of packs. Packing one component per pack file gives about 25–30 files with the same total.
- The bootstrap EXE or .deb is separate from the pack-file counts (est. < 30 MiB).

**Proposed HOST-02(c) wording:** keep **60 GB** as the minimum for the default and typical selections. These need ≤ 26 GiB including recovery, leaving room for projects, logs and temp files. The installer warns that selecting **every** optional pack (14B + full 3D + CUDA) needs about **75 GB** free. Optionally, the recovery store could be specified as content-addressed.

## 3. PERF-09 feasibility (offline install ≤ 20 min A / ≤ 40 min B)

**Assumptions (all est.; to be measured in (h)):**
- **USB read from the medium:** 100 MB/s on a USB 3 stick; 30 MB/s on a USB 2 port or slow stick.
- **SSD write:**
  - Profile A: ≥ 400 MB/s.
  - Pi 5 NVMe: ≥ 300 MB/s.
  - A2 microSD: **20–40 MB/s sustained**; 10 MB/s for a poor card.
- **Decompression and hashing:**
  - zstd decompression: ≥ 800 MB/s on A, ≥ 400 MB/s on Pi 5.
  - SHA-256: ≥ 1 GB/s with SHA-NI, ~0.4 GB/s with AVX2 only; ≥ 0.5 GB/s on Pi 5 with ARMv8 crypto extensions.
- **Small-file creation** (about 70 k files, est.; KiCad footprints alone ≈ 14 k):
  - Windows with Defender: 1 500 files/s.
  - ext4 on SSD: 5 000 files/s.
  - microSD: 500 files/s.
- **Pipeline:**
  - Read, hash, decompress and write run as one pipeline, so time ≈ the slowest stage.
  - A second read of the installed tree builds the SS-08 baseline.
- **Fixed steps:**
  - Windows: WebView2 terms, drivers, shortcuts, about 2 min.
  - Linux: local dpkg/apt of the dependency set, about 3 min on U, 6–8 min on P.

| Case | Data | Estimated time | Target | Feasible? |
|---|---|---|---|---|
| A, W core, USB 3 | 6.4 GiB read / 10 GiB written | 70 s read + 47 s files + 11 s re-hash + 2 min ≈ **4 min** | 20 min | Yes |
| A, W typical, USB 2 | 9.6 GiB | 344 s + 60 s + 15 s + 2 min ≈ **9 min** | 20 min | Yes |
| A, W every option, USB 2 | 19.1 GiB | 683 s + 70 s + 30 s + 2 min ≈ **15–16 min** | 20 min | Yes, but tight |
| A, U typical, USB 3 | 10.3 GiB | ≈ **5–6 min** (includes dpkg) | 20 min | Yes |
| B, P core, NVMe | 4.1 GiB / 6.9 GiB | 44 s + 14 s + 15 s + 6 min ≈ **8 min** | 40 min | Yes |
| B, P typical, A2 microSD at 30 MB/s | 12.5 GiB written | 447 s write + 140 s files + 170 s re-hash + 8 min ≈ **21 min** | 40 min | Yes |
| B, P typical, poor microSD at 10 MB/s | 12.5 GiB | 1 340 s + 140 s + 170 s + 8 min ≈ **35 min** | 40 min | **At risk** |

**Conclusion:**
- PERF-09 is feasible on both profiles when packs use **zstd**. With xz they would not be, since xz decompresses at only about 30–60 MB/s on a Pi.
- The binding risk is microSD sustained write on profile B. Mitigations:
  - HOST-04 checks card write speed before installing.
  - The installer recommends NVMe.
  - The second LLM pack is offered after the main install, when time is short.

## 4. Source pack estimate (SS-02)

| Item | est. MiB | Basis |
|---|---|---|
| KiCad 10 source, plus LGPL deps bundled on W/P (wxWidgets, OCCT) | 200 | est.: tarballs typically 60 + 30 + 50, plus build scripts |
| avr-gcc 7.3 toolchain (gcc, binutils, gdb) + avrdude | 105 | est. from GNU tarball sizes |
| Arm GCC (Arduino-Pico pqt-gcc / Arm GNU 15.2: gcc, binutils, newlib, gdb) | 170 | est.; the Arm full source bundle may be 400+ (UNVERIFIED) |
| RISC-V toolchain source (only if row 10 is kept) | 170 | est. |
| OpenJDK 25 (Temurin) | 110 | est. |
| Freerouting, arduino-cli, simavr, gerbv, cppcheck, pylint, libgit2 | 70 | est. |
| GPL/LGPL source of the BRD-03 target .debs | 100 | est. |
| GPL/LGPL source of the host .deb sets | U ≈ 900 (3 releases); P ≈ 600 | est. 300 MiB per release; WebKitGTK alone is ~45 |
| **Total** | **W ≈ 0.75–1.5 GiB; U ≈ 1.6–2.1 GiB; P ≈ 1.3–1.9 GiB** | Planning upper values used in section 2 |
| *If Pi OS images are bundled:* source for every GPL package in each image | **3–6 GiB per image** | est.; UNVERIFIED |

## 5. Findings

- **G-1 — Pi OS images and source obligations.** As SS-02 is worded, bundling Pi OS images brings the corresponding source of the images' packages onto the medium: about 6–12 GiB for two images, which needs a 32 GB stick.
  - Option 1: use a written offer instead (GPL-2.0 §3(b), GPL-3.0 §6(b)) for the image packs only.
  - Option 2: ship only the current (Trixie) image.
  - This is linked to F0-03 and needs legal review.
- **G-2 — Drop the RISC-V toolchain.** RP2350 boards run fine on their Arm cores. Dropping RISC-V saves about 120–145 MiB of pack and 0.7–0.8 GiB installed per host, plus about 170 MiB of source.
- **G-3 — Ship only a catalogue subset of KiCad 3D models by default.** STEP export (PCB-06) needs models only for the parts actually placed. This saves about 4.4 GiB installed and about 0.45 GiB of pack. The full library becomes an optional pack.
- **G-4 — Freerouting 2.5.0 has native CLI builds**, including linux-arm64, at 19–20 MB each (pub). If these are self-contained (UNVERIFIED), the Temurin JRE (50–59 MiB pack, about 150 MiB installed, plus 110 MiB of OpenJDK source) could be dropped. That would also resolve the Temurin 25 arm64 question from (a). The licence analysis (a) lists Freerouting 2.4.1, so it should be updated to 2.5.0.
- **G-5 — KiCad on Ubuntu needs extraction.** The official KiCad x64 AppImage is offered in Full and Lite variants. It is tar-wrapped (`kicad-10.0.6-x86_64[-lite].AppImage.tar`). It needs FUSE 2, which clean 22.04+ images lack. It should therefore be extracted at install into the app dir (SS-03). Installed size is about 3× the AppImage (est.).
- **G-6 — Clean images must be measured.** The host .deb sets (row 23) can only be sized by diffing clean images of 22.04, 24.04, 26.04, Pi OS Bookworm and Pi OS Trixie Desktop in CI (TEST-01). WebKitGTK 4.1 presence on clean images is UNVERIFIED.

## 6. UNVERIFIED

- WebView2 Fixed Version runtime size.
- Arduino tool archive sizes (avr-gcc, avrdude, Arduino-Pico pqt-* tools).
- KiCad AppImage Full/Lite sizes and installed size on every OS.
- KiCad 10 library sizes. The v9.0.7 Ubuntu figures are used as a proxy.
- Uncompressed Pi OS Lite image sizes. The imager JSON was refused with 403 and was not bypassed.
- MicroPython .uf2 sizes.
- Freerouting native CLI self-containment.
- All installed-size factors marked est.
- All PERF-09 throughput assumptions.
- Source tarball sizes.
- Debian package pages (packages.debian.org) returned a JavaScript bot challenge. They were not bypassed; Ubuntu package pages were used instead.

## 7. Sources (accessed 2026-10-05)

- **GitHub release assets** (via `/releases/expanded_assets/<tag>`):
  - arduino/arduino-cli v1.5.1
  - freerouting/freerouting v2.5.0
  - raspberrypi/pico-sdk-tools v2.3.1-0
  - adoptium/temurin25-binaries jdk-25.0.4.1+1
  - astral-sh/python-build-standalone 20261003
  - ggml-org/llama.cpp b10456
  - danmar/cppcheck 2.22.0
  - astral-sh/ruff 0.16.10
  - KiCad/kicad-source-mirror 10.0.6
  - gerbv/gerbv v2.13.0 (no sizes shown)
- **Models:** https://huggingface.co/Qwen/Qwen3-4B-GGUF, https://huggingface.co/Qwen/Qwen3-8B-GGUF, https://huggingface.co/Qwen/Qwen3-14B-GGUF (file trees)
- **KiCad downloads:** https://www.kicad.org/download/windows/ and https://www.kicad.org/download/linux/
- **Ubuntu packages** (26.04 "resolute"; 24.04 "noble" for the v7 3D figure): https://packages.ubuntu.com/resolute/{kicad, kicad-symbols, kicad-footprints, kicad-packages3d, ngspice, gerbv, cppcheck, simavr} and https://packages.ubuntu.com/noble/kicad-packages3d
- **Arduino package index:** https://downloads.arduino.cc/packages/package_index.json (AVR core size only)
- **Raspberry Pi OS:** https://www.raspberrypi.com/software/operating-systems/
- **Refused or blocked (not bypassed):**
  - https://downloads.raspberrypi.com/os_list_imagingutility_v4.json (403)
  - https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json (robots.txt)
  - packages.debian.org (bot challenge)
