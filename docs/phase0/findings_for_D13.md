# Phase 0 findings requiring decision D13

Sources: (c) c_llm_benchmark_plan.md · (e) e_curated_sets.md · (f) f_fab_profile.md ·
(g) g_installer_sizes.md (5 October 2026). Each finding has a proposed resolution; if D13
accepts them, they will be applied to the prompt as v3.5.

**F0-12 — Licence of code emitted from templates** · LLM-05, CG-01 (e: Q-E1)
Template code fragments are copied into users' firmware. Under GPL-3.0-or-later, that firmware
would arguably carry GPL obligations.
*Proposed:* license block-template packages under **MIT**, as separate data configuration items
from the GPL application. Generated firmware, documents and design files belong to the user.
Generated files carry an MIT notice where template code appears.

**F0-13 — Curated code libraries exclude GPL-only libraries** · LIB-01, LLM-01 (e)
Keypad, AccelStepper, hd44780 and NewPing are GPL-3.0; NewPing's licence is UNVERIFIED.
LiquidCrystal_I2C has no licence at all.
*Proposed:* the curated set contains only permissive (MIT/BSD/Apache) or LGPL libraries. The
excluded ones are replaced by own drivers in templates, StepperDriver (MIT) and
LiquidCrystal_PCF8574 (BSD-3). That gives 20 Arduino, 10 MicroPython and 10 Pi Python
packages.

**F0-14 — Arduino board documentation** · SS-07, F0-09 (e: Q-E2)
F0-09 is about manufacturer datasheets. Arduino's documentation content is CC-BY-SA 4.0, which
allows redistribution.
*Proposed:* bundle Arduino board pinouts and documentation excerpts, with attribution and
ShareAlike and without trademarks, the same way as the Raspberry Pi documentation (CC-BY-SA).

**F0-15 — KiCad library gaps** · PCB-02, TB-01 (e)
We must make about 78 items ourselves: 26 symbols, 23 footprints and 27 3D models, covering
22 breakout modules, the ICM-42688-P, Pico 2/2 W and Mega 2560, plus HAT+ and Pico carrier
templates.
- No official Raspberry Pi KiCad HAT+ template was found.
- The community template is CERN-OHL-S, which would bind users' boards, so it is rejected.

*Proposed:* our own library additions are CC-BY-SA 4.0, as required by the KiCad libraries'
licence for derived work; users' designs remain free under KiCad's design exception. Our own
HAT+ and Pico-carrier templates are made from the official specifications.

**F0-16 — Default fabrication profile** · PCB-05 (f)
*Proposed:*
- Ship **EF-PROTO-STD v1.0.0** as the default profile. It is the common denominator of JLCPCB,
  PCBWay, OSH Park, AISLER and Eurocircuits:
  - track 0.25 mm and clearance 0.20 mm;
  - component holes ≥ 0.6 mm;
  - via 0.4/0.9 mm;
  - copper to edge 0.5 mm;
  - text height 1.0 mm.
- Generated-board defaults stay more generous: clearance 0.3 mm, with a local 0.25 mm rule
  between 2.54 mm-pitch header pads.

**F0-17 — Pi OS images and the source pack** · F0-03, SS-02 (g: G-1)
The images' corresponding source would add 6–12 GiB to the medium.
*Proposed:* no change while images are user-imported (F0-03). If Raspberry Pi Ltd allows
shipping them, ship only the current Lite image (Trixie) and use a written offer (GPL-3 §6(b) /
GPL-2 §3(b)) for that pack's sources.

**F0-18 — Size reductions** · SS-01, SS-02 (g: G-2, G-3, G-4)
*Proposed:*
- (a) **Drop the RISC-V toolchain.** RP2350 targets use their Arm cores. This saves about
  0.8 GiB installed.
- (b) **Ship KiCad 3D models only for catalogue parts.** The full 3D library becomes an
  optional pack. This saves about 4.4 GiB installed.
- (c) **Evaluate Freerouting 2.5.0 native command-line builds in (b).** If they are
  self-contained, drop the JRE, which supersedes F0-07.

**F0-19 — KiCad on Ubuntu** · SS-03, F3-02 (g: G-5)
The official x86-64 AppImage needs FUSE 2, which clean Ubuntu 22.04+ images lack.
*Proposed:* the installer extracts the AppImage into the application directory and never runs
it as an AppImage.

**F0-20 — Storage requirement wording** · HOST-02(c), CM-09 (g)
Totals including the recovery store:
- Core and typical installs: ≤ 26 GiB.
- Every optional pack with ×2 recovery: about 55 GiB.

*Proposed:*
- Keep 60 GB as the minimum for default and typical selections.
- The installer warns that selecting every optional pack needs about 75 GB.
- The recovery store is content-addressed, so unchanged items are never stored twice.

**Resolved without decision**
- **BMP280** is active under the evidence rule: the manufacturer page has no notice, rechecked
  5 October 2026. It stays in EM-03.
- **Benchmark repositories:** all 7 first-choice model repositories are confirmed (licence and
  Q4 GGUF) through the Hugging Face API.
