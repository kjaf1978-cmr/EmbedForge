# Phase 0 findings requiring decision D11

Sources: (a) a_licence_analysis.md · (n) n_active_equivalents.md · (o) o_catalogue_sources.md
(26 September 2026). Each finding has a proposed resolution. If D11 accepts them, they will be
applied to the prompt as v3.3.

**F0-01 — WebView2 Fixed Version runtime terms** · section 21, SS-02, INV-10
Microsoft's distributable-code terms allow bundling, with three conditions:
- end users accept terms at least as protective as Microsoft's;
- the app adds "significant primary functionality";
- the runtime must not be subjected to a copyleft licence.

Aggregation does not subject it to the GPL. Whether Tauri's use of it counts as linking is the
open question.
*Proposed:*
- (a) Keep the Fixed Version runtime, which gives pinned CM (INV-03).
- (b) Add a GPL-3 §7 additional permission from you, as copyright holder, allowing EmbedForge
  to be combined with the WebView2 runtime.
- (c) The Windows installer shows the WebView2 terms for acceptance.

The alternative is the Evergreen runtime, which Windows 11 includes but which cannot be pinned.

**F0-02 — Windows USB-serial drivers** · SS-04, INV-10
- ATmega16U2 boards use the built-in Windows usbser.sys, so no driver is needed. To be
  confirmed on your boards (TEST-02).
- FTDI's licence is limited to genuine FTDI chips, and clones are common in kits.
- No redistribution terms were found for WCH CH340.
- CP210x can be bundled, with conditions, and matters mainly for Tier 2 (ESP32).

*Proposed:*
- Bundle no Windows USB-serial driver in the first release.
- CH340 and FTDI boards fall under the INV-10 exception (C3-04): a user-supplied driver, or
  Windows Update when the host is online. The installer lists the affected boards.
- **Action for you:** ask WCH in writing for permission to redistribute CH341SER. With that
  permission it would be bundled, which matters for Nano clones.
- Decide CP210x at Increment 9.

**F0-03 — Raspberry Pi OS images** · TB-02, SS-01, BRD-03
- Raspberry Pi publishes no licence terms for the images.
- The Broadcom firmware may be used only on Raspberry Pi devices and only unmodified.
- GPL packages need their corresponding source to be available.
- The "Full" image includes Mathematica, which is licensed for non-commercial use only.

Current releases (15 September 2026): Trixie (Debian 13) and "Legacy" Bookworm (Debian 12).
*Proposed:*
- (a) Target images are **Raspberry Pi OS Lite 64-bit** only (Trixie, and Bookworm Legacy).
  Desktop and Full images are never shipped.
- (b) The source pack carries the corresponding source for every GPL package on the medium,
  images included.
- (c) **Action for you:** ask Raspberry Pi Ltd to confirm that unmodified images may be
  redistributed.
- (d) Until they confirm, the optional Pi OS pack is not shipped. Instead the app imports an
  image file that you downloaded and checks it against a signed list of SHA-256 hashes. That
  is a one-time step, and imaging (SS-05(a)) then works offline.

**F0-04 — LLM weights licence policy** · Phase 0 (c), INV-10
*Proposed:*
- Only Apache-2.0 or MIT weights.
- Small-profile shortlist: Qwen3-4B, Phi-4-mini, Granite-4.0-micro.
- Large-profile shortlist: Qwen3-8B/14B, Qwen2.5-Coder-7B/14B, Ministral-3-8B-2512, Phi-4.
- Excluded:
  - Gemma: its use-policy flow-down and remote-restriction clause.
  - Llama: its acceptable-use policy and branding requirements.
  - Qwen2.5-Coder-3B and Ministral-8B-2410: research-only licences.

**F0-05 — Catalogue sourcing** · PC-01, PC-04, INV-11
No distributor API allows redistribution.
*Proposed:* adopt the strategy in o_catalogue_sources.md section 3:
- a curated, fact-only catalogue under CC-BY-4.0, separate from the GPL code;
- lifecycle status taken from the manufacturer;
- two sources recorded by hand (vendor, SKU, URL, date, in-stock yes/no);
- about 150–250 parts, with no bulk or API imports.

**F0-06 — KiCad on arm64** · SS-02, INV-07, section 21
There is no official stable arm64 Linux KiCad build; the PPA's arm64 builds are nightly-only.
KiCad 10 is released (10.0.6).
*Proposed:*
- Pin KiCad 10.0.x.
- Build a private arm64 KiCad (kicad-cli plus the libraries) on the self-hosted Pi 5 runner.
- The core path uses only kicad-cli; the optional advanced mode (SS-06) on arm64 uses the same
  build.
- Risk R-12 is raised to High.

**F0-07 — Freerouting needs Java 25** · SS-02, section 21
*Proposed:* bundle the Temurin 25 JRE instead of 21. Arm64 availability will be confirmed in
(b).

**F0-08 — Arduino's arm64 avr-gcc build is suspect** · SS-02, INV-07
An open issue (arduino/toolchain-avr#73) reports that its "aarch64" build is 32-bit ARM.
*Proposed:*
- Test it on a Pi 5 as a user-executed check.
- If it fails, build the same avr-gcc version (7.3.0-atmel3.6.1-arduino7) natively for aarch64
  on the Pi runner, so that both profiles compile with an identical compiler (INV-07).

**F0-09 — Datasheets** · SS-07
Only Raspberry Pi Ltd documents can be bundled (CC BY-ND, unmodified). Every other
manufacturer's terms forbid redistribution.
*Proposed:*
- Every other part gets a parameter sheet plus the datasheet URL.
- Add to SS-07: "The user may import datasheet files they obtained into a per-host local
  library; imported datasheets shall not be included in project files, exports to other
  users, or signed packages."
- The user's own SS-10 backup may include them.

**F0-10 — Pi-target emulation back-end** · section 21, EM-05
Upstream QEMU publishes no official binaries, and it is not needed for AVR or RP2040.
*Proposed:*
- Use Python/GPIO emulation under a virtual clock for Pi targets, as tested in the D10 spike
  in (m).
- Drop QEMU from section 21, except Espressif QEMU for Tier 2.

**F0-11 — EM-03 part changes** · EM-03, EM-02A
- MPU-6050 is Obsolete at TDK.
- NXP's PCF8574 is EOL; TI's PCF8574 is Active.
- BMP280's status is unconfirmed.

*Proposed:*
- EM-03: replace MPU-6050 with **ICM-42688-P**. MPU-6050 stays a *kit part*.
- The catalogue names TI PCF8574/A MPNs.
- BMP280 stays in EM-03 until the manufacturer confirms its status.
