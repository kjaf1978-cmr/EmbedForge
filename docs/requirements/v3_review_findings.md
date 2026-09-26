# EmbedForge — v3 Review Before Phase 0 (section 24)

Scope: new ambiguities, conflicts and offline infeasibilities that the v3 changes
introduced or exposed. Findings from the v2 review that v3 resolved are not repeated.
Under section 0, I am reporting each conflict and not choosing a resolution myself.
Each finding has a proposed resolution for your decision.

ID prefixes: **C3** conflict · **F3** offline/technical infeasibility · **A3** ambiguity ·
**M3** missing item · **E3** editorial. "Origin" is the v3 change (section 25 row) that
introduced or exposed the finding.

---

## 1. Conflicts (decision required before Phase 0 outputs depend on them)

**C3-01 — The term "build style" has two meanings** · PC-03 vs §3 *build style*, VER-13 · Origin C-02
Section 3 defines *build style* as PCB / perfboard / breadboard. PC-03 uses "Build style"
for module vs discrete. VER-13 ("footprint matching the selected build style") can be read
either way.
*Proposed:* Rename PC-03 to **part style** (module / discrete) and treat it as a separate
axis from *build style*. VER-13 then reads: "…a footprint matching the selected *build
style* and part style (breadboard build: 2.54 mm-pitch through-hole or header-mounted only)."

**C3-02 — KiCad files hold connectivity, but views may store geometry only** · INV-08 vs DATA-01 · Origin C-13
DATA-01 stores the schematic and PCB in KiCad formats. KiCad schematic and PCB files carry
connectivity of their own (wires, labels, pad nets). DATA-01 also stores the "pin map" as a
separate file. Both make a second source of connectivity.
*Proposed:* (a) The netlist and a native geometry store (JSON) are the only stored sources.
KiCad files are **derived artefacts**, regenerated on save and committed so that Git diffs
and advanced mode still work. (b) On load, any disagreement between the KiCad files and the
netlist goes through the INV-08 advanced-mode diff approval. (c) The pin map is a view of the
netlist and is not stored separately. Remove "pin map" from the DATA-01 list, or mark it
"derived, cached".

**C3-03 — The privileged helper cannot install dependencies for deployment to the host** · HOST-07(b), BRD-03 vs SS-05 · Origin C-06
BRD-03 installs .deb and wheel dependencies. Installing a .deb needs root. The helper's
only functions are writing images and managing one service. Imager-style first-boot
customisation (user, SSH key, Wi-Fi) is also not explicitly covered by SS-05(a).
*Proposed:* Add helper function (c): "install .deb packages taken only from the signed
offline dependency set of the running EmbedForge version (allowlist by package hash)."
Install wheels without root into a per-project virtual environment. Extend SS-05(a) to
"…and writing first-boot configuration files to that medium."

**C3-04 — A user-supplied driver is a prerequisite installation** · SS-04 vs INV-10 · Origin M-04
If a driver's licence does not allow bundling, SS-04 asks the user for their own copy.
INV-10 forbids any prerequisite installation.
*Proposed:* Add to INV-10: "…except USB drivers listed under SS-04 whose licence does not
permit redistribution; the affected boards shall be listed in the installer and in DOC-11."
Phase 0 (a) will say whether this exception is actually needed. Windows 10/11 include a
built-in driver for ATmega16U2 boards, so the real candidates are CH340 and CP210x.

**C3-05 — The GPL-compatibility test would reject WebView2, drivers and datasheets** · Phase 0 (a), §21 vs WebView2 bundling · Origin M-03 / F-05
Phase 0 (a) requires every bundled component to be "compatible with GPL-3.0-or-later".
The WebView2 fixed-version runtime, vendor USB drivers and manufacturer datasheets are
proprietary but redistributable. There is no replacement for WebView2 under Tauri on
Windows. Separately executed programs and data are mere aggregation under GPL-3 §5, so they
do not need GPL compatibility.
*Proposed:* Redefine the Phase 0 (a) test in two classes. **Linked** (code compiled or linked
into EmbedForge binaries or the web UI) must be GPL-3.0-or-later compatible. **Aggregated**
(separate executables, runtimes, drivers, model weights, datasheets, images) needs only
redistribution rights with no conditions that conflict with SS-01/SS-09. List both classes in
the licence inventory (DOC-11).

**C3-06 — The Mega shield is larger than the DATA-04 board limit** · DATA-04 vs ACC-02 · Origin M-05
The Arduino Mega 2560 outline is about 101.6 × 53.3 mm. A Mega shield is therefore bigger
than the 100 × 100 mm limit, so the ACC-02 Mega run would trigger the size warning and fall
outside the PERF targets. ACC-02 with full ED-04 conditioning, a motor driver, decoupling,
connectors and PCB-09 test points may also come close to the 40-part limit.
*Proposed:* Change the outline limit to "longest side ≤ 110 mm and area ≤ 10 000 mm²".
In Phase 0 (h), confirm the part limit against a hand-estimated ACC-02 BOM.

**C3-07 — Hosts differ in function because the LLM profile differs** · INV-07 vs HOST-03(e), VAPP-06 per-profile thresholds; SS-05 per-user install · Origin F-01, C-06
Profile B uses the smaller model by default and has its own VAPP-06 thresholds. The same
prompt can then produce different clarification questions, which is more than a performance
difference. The per-user installation also lacks functions, but it is not listed in HOST-07.
*Proposed:* Add HOST-07(d): "LLM profile — the requirement extraction and clarification
questions may differ between profiles within their VAPP-06 thresholds; everything
downstream of the approved requirement set is deterministic (LLM-05) and identical across
hosts." Add to INV-07: "…and the functions listed as missing for a per-user installation
(SS-05)."

**C3-08 — "Returns to Draft" contradicts ST-07** · UI-05 vs ST-07 · Origin A-08 / C-01
ST-07 sets the highest status whose conditions are still met. After an approved block edit,
the drafted requirements may still satisfy Clarified, so ST-07 gives Clarified while UI-05
says Draft.
*Proposed:* UI-05: "…on approval the NL-02 checks run on the changed requirements, the status
is recomputed under ST-07, and code and circuit are regenerated and re-verified."

**C3-09 — Automated tests cannot reach "Verified" because it needs a human review** · VAPP-06, ACC-02(c), CM-05 vs VER-06 · Origin C-10
Verified includes VER-06, which requires a current human review record for every document.
VAPP-06 (40 prompts in CI), CM-05(a) regression runs and builder-run ACC tests have no human
reviewer, and I must not create review records in your name. VAPP-06 also needs someone to
answer the clarification questions, and no one is defined.
*Proposed:* (a) Define **Verified-auto**: every ST-04 condition except the human-review part
of VER-06. VAPP-06 and CM-05 measure Verified-auto. (b) Each corpus entry holds scripted
answers to its expected questions; unexpected questions take the proposed default, and that
is logged. (c) Builder-run ACC tests report Verified-auto. You record the review, and only
then is full Verified claimed (TEST-02).

**C3-10 — Users cannot create parameter sheets for their own parts** · EM-04 vs SS-07 · Origin C-04 / F-09
EM-04 lets a user part count as a *standard part*. SS-07 requires a reviewed datasheet or
parameter sheet, and defines parameter sheets as generated at *release-time*.
*Proposed:* SS-07: "…or, for user catalogue extensions (EM-04), a parameter sheet generated
at *install-time* from a datasheet in the local library, with the user recorded as reviewer."

## 2. Offline / technical infeasibility

**F3-01 — The start-up integrity check cannot meet PERF-08** · SS-08 vs PERF-08 · Origin F-02
The tiers are set by file size, but most of the volume is in files under 64 MB: toolchains,
the Python runtime, the JRE, KiCad symbol and footprint libraries, and the KiCad 3D model
library (several GB on its own), plus datasheets. Hashing all of that with SHA-256 from a cold
cache is well beyond 15 s on a SATA SSD and 45 s on a Pi 5 with microSD.
*Proposed:* Tier by criticality instead of size. At start-up, SHA-256 every executable,
shared library, script and grammar/schema file. Check everything else by size and a signed
cached hash (plus mtime), and hash it in full in the background. Phase 0 (h) measures the
result on both profiles.

**F3-02 — The Linux bootstrap may not run on a clean offline host** · SS-01, INV-10, HOST-01(b)(c) · Origin D4
Classic AppImages need libfuse2. Ubuntu 22.04 and later do not install it by default. A .deb
needs its dependencies (WebKitGTK 4.1 and others) resolvable offline. Ubuntu Server and Pi OS
Lite do not ship them. HOST-01 does not say whether Desktop or Server/Lite editions are
supported.
*Proposed:* (a) Supported editions: Ubuntu Desktop and Raspberry Pi OS with desktop only.
(b) Use a .deb bootstrap whose component pack carries every dependency .deb missing from a
clean image of each supported release, installed through the local apt path. If an AppImage
is kept, use the static type-2 runtime, which does not need libfuse2. (c) VAPP-01 covers every
Ubuntu LTS in range.

**F3-03 — FAT32 media and very large model files** · SS-01 · Origin C-07 / F-07
(a) On Windows 10, the built-in formatting tools refuse FAT32 on volumes over 32 GB, and the
Profile A medium is likely to be larger than that. (b) A larger-profile GGUF model will exceed
3.9 GB as one file.
*Proposed:* (a) Use exFAT as the medium format. It is native on Windows 10/11, Ubuntu 22.04+
and Pi OS Bookworm+. Keep the 3.9 GB per-file limit only if you also want FAT32 compatibility.
(b) State that one component may span several pack files. Models use llama.cpp split GGUF,
and SS-08 hashes each part.

**F3-04 — Release gating on "both host profiles" in CI** · CM-05(a) vs TEST-01 · Origin C-14 / D7
Profile B is defined as physical Pi 5 hardware (HOST-03). CI has arm64 runners, not Pi 5s,
so every release would wait for you to run tests.
*Proposed:* For CM-05(a), the functional gates run on the arm64 runner with a Pi OS userland
and count as Profile B. PERF checks for Profile B stay user-executed (TEST-02) and do not
block a release.

**F3-05 — pylint will flag MicroPython and Pi-only imports** · VER-02 · Origin A-04
pylint reports `import-error` (an error-category message) for `machine`, `rp2` and
`lgpio`/`gpiozero` when it runs on the *host*, so VER-02 would always fail for MicroPython
and Pi projects.
*Proposed:* Bundle type stubs for MicroPython ports and the Pi GPIO libraries as a pinned
library item (CM-06). Run pylint against those stubs.

## 3. Ambiguities

**A3-01 — Python for Raspberry Pi has no compile-gate level** · VER-01 · Origin A-03
VER-01 defines the level for C++ and MicroPython but not for CPython (CG-01).
*Proposed:* "For CPython: `py_compile` passes under the target image's Python version
(3.11 Bookworm, 3.13 Trixie), and VER-02 passes."

**A3-02 — *Active* status of generic modules with no identifiable main IC** · §3 *active* · Origin A-01
Several EM-03 and kit modules use unmarked or unnamed ICs (HC-SR04 variants, some PIR and IR
modules), so "its main IC is active" cannot be evaluated for them.
*Proposed:* "If the main IC cannot be identified, the module is *active* when at least two
listed sources stock it and it has a reviewed parameter sheet. The parameter sheet records
that the main IC is unidentified."

**A3-03 — A part named in an ACC project may fail the *active* test** · ACC-01, ACC-02 vs EM-02A · Origin C-05
Example: the original Hitachi HD44780 has long been discontinued. 16×2 modules use
compatible controllers, so the "16×2 I²C LCD" in ACC-01 may be modelled as a *kit part* and
be excluded from generated designs.
*Proposed:* "An ACC part that fails the *active* test is satisfied by its EM-02A substitute.
The substitution shall appear in DOC-09 and in the ACC test report." In Phase 0 (n), check
DHT22, the 16×2 I²C LCD and its backpack, and the motor-driver candidates first.

**A3-04 — "Target board regulator" on boards whose 5 V pin is a pass-through** · SAF-02, ED-03(g) · Origin A-16
On a Raspberry Pi, and on an Uno powered from USB, the 5 V header pin carries the input
supply, not the output of a regulator. It is unclear whether a servo on that pin is allowed.
*Proposed:* "…a supply separate from every supply pin of the *target board* (regulator
outputs and 5 V/USB pass-through pins)."

**A3-05 — Steady-state or transient net voltage** · SAF-04 · Origin A-02
Inductive switching produces transients above 24 V even in low-voltage designs.
*Proposed:* "Net voltage = maximum steady-state voltage from the design's sources; clamped
switching transients (ED-03(f)) are excluded."

**A3-06 — What happens when no block template covers a requirement** · LLM-05, LLM-06 · Origin F-01
The deterministic core can only build what the template library covers, and the prompt does
not say what happens otherwise.
*Proposed:* Add NL-02(i) "function not covered by a qualified template", with options: nearest
template with the stated deviations, simplify the requirement, or cover it with a manual code
block outside *generated regions* (UI-12, marked unverified until gates pass). VAPP-06
includes at least two uncovered prompts.

**A3-07 — The LLM-01 library-approval path no longer applies** · LLM-01 vs LLM-05 · Origin C-04 / F-01
Under LLM-05, the LLM does not write code, so it can never choose a library.
*Proposed:* Move the approval to the user: "A code library not in the curated set may be used
only after the user imports it as a package (SEC-03) and approves it for the project."

**A3-08 — Which Pi is the ACC-01 HAT+ target, and how is DHT22 read there** · ACC-01
The target Pi is not named. Reliable DHT22 reads on Linux usually go through the kernel `dht11`
overlay (IIO) rather than user-space bit-banging, which the Python/GPIO emulation (EM-05)
does not model.
*Proposed:* The target is the Raspberry Pi 5. The DHT22 is read through the IIO overlay, and
EM-05 includes an IIO device model. Otherwise, requirements that depend on the DHT22 are
HIL-pending for this variant.

**A3-09 — Which language to use for the ACC-02 Pico run** · ACC-02, CG-01
*Proposed:* Arduino-core C++ is the acceptance run; MicroPython is a second run from
Increment 5.

**A3-10 — ACC-01(d) signals** · ACC-01(b) "as for ACC-02" · Origin A-13
ACC-02(d) names A–E, U, V and W, which do not exist in ACC-01.
*Proposed:* ACC-01(d): "The user drives temperature, humidity and sensor-failure injection;
the dashboard shows fan PWM duty, fan speed, LCD content and alarm LED state, behaving as
specified; all scenarios pass."

**A3-11 — Status gates per build style** · ST-04, ST-05, VER-09 · Origin C-02
VER-09 is written as schematic ↔ PCB. "Released for fabrication" (VER-12, fabrication package)
has no meaning for perfboard and breadboard builds.
*Proposed:* Add VER-15 "breadboard ↔ netlist consistency" (the equivalent of VER-14) and use
it in ST-04. State in ST-05: "Applies to PCB builds only."

**A3-12 — Human review record inside the lint** · DOC-10, ST-02 vs VER-06 · Origin C-10
DOC-10 contains both the lint and the review-record rule, so "passes DOC-10" in ST-02 would
need a human review before Clarified.
*Proposed:* Move the review-record sentence into a new DOC-12 and have VER-06 reference DOC-12.
ST-02 then needs lint only.

**A3-13 — Whether HIL-pending counts as a traceability gap** · VER-06, DOC-07
*Proposed:* "An HIL-pending result is not a gap. A gap is a requirement with no verification
method, block, or test."

**A3-14 — Is the target board a BOM part** · INV-11, VER-13 · Origin A-10
*Proposed:* Yes. Each target board is a catalogue entry (generic module or discrete part) and
a BOM line.

**A3-15 — "Known project" for pruning protection** · CM-09 · Origin C-09
*Proposed:* "A known project is one in the app's project registry: opened, created or imported
on this *host* and not removed from the registry."

**A3-16 — Pi OS images are optional but required for Pi targets** · SS-01 vs TB-02, BRD-03 · Origin F-07
*Proposed:* The offline dependency sets (BRD-03) are always installed. Only the base images
are optional. Without them, imaging is unavailable, but deployment to an already imaged Pi
still works. The installer lists this consequence.

**A3-17 — PCB-03(b) measures along routed copper, but it is a placement rule** · Origin A-07
*Proposed:* Placement targets the distance as the straight-line pad-edge distance. The
routed-copper distance is checked after routing, as a custom DRC rule inside VER-08.

**A3-18 — Scope of the Phase 0 (c) benchmark** · Phase 0 (c) vs LLM-05 · Origin F-01
Reaching "Verified" needs Increments 3–7, so it cannot be measured in Phase 0.
*Proposed:* Phase 0 (c) measures only NL-02 question recall (using the tag matching in
VAPP-06), schema-valid extraction under the grammar, and generation time, per candidate model
and profile.

## 4. Missing items

**M3-01 — Nothing programs the HAT+ ID EEPROM** · PCB-01, BRD-02 · Origin A-20
*Proposed:* Add BRD-04: "For HAT+ builds, the app shall generate the EEPROM image and program
it over SSH on the *target board* with bundled tools. The step and its verification shall
appear in DOC-05 and VER-12."

## 5. Editorial

- **E3-01** TEST-04 sits between TEST-01 and TEST-02. Renumber or reorder.
- **E3-02** HOST-07(c) is "enforced on every host", so it is not host-dependent. Move it to
  SS-05(a).

---

## 6. Constraints on how I can run Phase 0 from this session (not prompt defects)

- **No access to your infrastructure yet.** I have no GitHub repository access or credentials,
  so I cannot push work or run Actions (TEST-01, TEST-04). A repository URL and a scoped
  token or deploy key are needed, or you push the deliverables I hand over.
- **No Profile A PC, Pi 5 or target boards.** My workspace is a Linux x86-64 cloud container.
  Phase 0 (c), (g) and (h) measurements on real hosts will be scripted procedures that you run
  (TEST-02). I can run CPU-only llama.cpp benchmarks here only as indicative data.
- **Phase 0 is several sessions of work.** Proposed order: (k) risk register seeded from this
  list → (a)/(o) licences and data sources → (b) arm64 builds → (m) emulator evaluation →
  (d)/(n) kit inventory and *active* equivalents → (l) template plan → (j) draft corpus →
  (c) model benchmarks → (e), (f), (g), (h) → (i) wireframes. Each session ends with its
  deliverables and a status per item.

## 7. Decision requested

Please reply with **D9**: accept all proposed resolutions, or list the IDs you want changed.
I will then start Phase 0, beginning with the risk register (k).
