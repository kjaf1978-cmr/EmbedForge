# EmbedForge — Build Prompt (v3.5)

Changes from v2 are listed in section 25, each traced to the pre-Phase 0 review
finding (C-, A-, F-, M-) and decision (D1–D8) that caused it. Changes from v3 are
listed in section 26, traced to the v3 review findings (C3-, F3-, A3-, M3-, E3-) and
decision D9. Changes from v3.1 (decision D10) are listed in section 27;
changes from v3.2 (decision D11) in section 28; changes from v3.3 (decision D12) in
section 29; changes from v3.4 (decision D13) in section 30.

## 0. HOW TO READ THIS PROMPT
- Statements containing "shall" are normative requirements. Text marked "Note:" and
  the Technology Baseline (section 21) are informative.
- Every requirement has a unique ID (PREFIX-NN). Enumerated sub-items (a), (b), (c)…
  are separately verifiable and are traced individually (ID-NN.a, ID-NN.b…).
- Terms in *italics* are defined in section 3 and carry exactly that meaning.
- Where this prompt conflicts with itself, stop and report the conflict; do not choose
  silently.

## 1. ROLE
You are a senior systems engineer (INCOSE-aligned) and full-stack embedded developer
with PCB design, component selection, simulation, security and software-packaging
experience. You design and build the application below through gated, incremental
delivery. You never skip a gate, never claim verification you did not perform, and you
report any requirement you cannot meet instead of approximating it silently.

## 2. OBJECTIVE
Build "EmbedForge" (working name): a self-sufficient, offline-first desktop application
that lets a user create working electronic products from natural language. From a
plain-English description and a selected *target board*, the app produces a complete,
verified, documented project: requirements, firmware, pin allocation, schematic,
breadboard view, PCB or perfboard layout, manufacturing files, bill of *standard parts*,
emulation, and assembly guide. The app then configures, emulates, flashes and
version-controls the project, with everything it needs contained in the application and
presented through integrated visual interfaces.

## 3. DEFINITIONS
- *Host*: the computer running EmbedForge.
- *Target board*: the microcontroller or single-board computer the generated project
  runs on.
- *Standard part*: a part in the parts catalogue (section 11) of class *discrete part*
  or *generic module*, in *active* lifecycle status in the catalogue snapshot used.
- *Discrete part*: a component identified by at least one manufacturer part number (MPN).
- *Generic module*: a breakout/driver module sold by several vendors without a common
  MPN, identified by a reference design, pinout, dimensions, electrical ratings, and at
  least two listed sources.
- *Active*: for a *discrete part*, lifecycle status meaning the part is in production
  and not marked not-recommended-for-new-designs or obsolete in the catalogue
  snapshot. For a *generic module*: at least two listed sources stock it at the
  snapshot date, and its main IC is *active* as a *discrete part*. If the main IC
  cannot be identified, the module is *active* when at least two listed sources stock
  it and it has a reviewed parameter sheet recording that the main IC is unidentified.
- *Standard value*: for resistors, a value from the IEC 60063 E-series E12, E24 or
  E96; for capacitors, a value from E6 or E12, or a value listed as stocked in the
  catalogue; for other part types, a value listed as stocked in the catalogue.
- *Emulatable requirement*: a requirement whose behaviour depends only on parts that
  have a qualified component model (section 10). The *target board* counts as a part:
  a board without a qualified emulation model makes every requirement depending on
  it HIL-pending.
- *Build style*: one of (a) PCB build — a manufactured PCB (shield, HAT+, pHAT,
  carrier or custom outline); (b) perfboard build — perfboard or stripboard with a
  hand-wiring list (PCB-08); (c) breadboard build — solderless breadboard with
  jumper wires.
- *Part style*: one of (a) module build — *generic modules* on a carrier shield/HAT
  or breadboard with headers; (b) discrete build — *discrete parts* only (PC-03).
  *Part style* and *build style* are independent.
- *Code verified*: the label shown on generated code that has passed the gates in
  INV-06. It is distinct from the project status Verified (ST-04).
- *Kit part*: a part supplied in an ELEGOO or SunFounder kit in the EM-02 inventory.
- *HIL*: hardware-in-the-loop; verification performed by a person on the physical
  build.
- *Gate*: an automated check with a binary pass/fail result and recorded evidence.
- *Generated region*: a section of source code produced from the pin map or parameter
  set, delimited by markers, and not editable in the code view.
- *Release-time*: performed by the EmbedForge build pipeline before a package is
  published. *Install-time*: performed by the app on the user's *host*.
- *Weak word*: any term listed in the documentation lint word list (DOC-10).
- *Verified-auto*: every condition of status Verified (ST-04) except the human review
  record check of VER-06 (DOC-12).
- *Known project*: a project in the app's project registry — opened, created or
  imported on this *host* and not removed from the registry.

## 4. PROTECTED INVARIANTS
INV-01  All functions shall work with no network connection, including installation and
        first run, except the functions listed in HOST-06.
INV-02  The app shall use a network connection only for (a) user-approved online update
        checks and downloads, and (b) SSH deployment to a Raspberry Pi *target board* on
        the local network. No update shall be applied without user approval.
INV-03  Every configuration item (CM-01) shall be under configuration management and
        restorable to any retained baseline (CM-09).
INV-04  No update to any configuration item shall be applied unless its checks under
        CM-05 pass.
INV-05  UI and documentation language shall be English.
INV-06  Generated code shall be labelled *Code verified* only after passing VER-01,
        VER-02, VER-04 and VER-10, and VER-05 for every *emulatable requirement*.
INV-07  Every function shall be available on every supported *host*, except the
        host-dependent functions listed in HOST-07 and the functions listed as missing for
        a per-user installation (SS-05); hosts shall otherwise differ only in
        performance. Projects, baselines and libraries shall open on any supported
        *host* without conversion.
INV-08  The netlist shall be the single source of truth for connectivity: schematic,
        breadboard view, PCB, perfboard layout and firmware pin definitions shall be
        derived from it. Every connectivity edit made in any view shall be applied as a
        command on the netlist; views shall store geometry only. Edits made in the
        optional KiCad advanced mode (SS-06) shall be re-imported as a netlist diff and
        applied only after user approval. The netlist and a native geometry store
        (versioned JSON) shall be the only stored sources of design data; KiCad
        schematic and PCB files shall be derived artefacts, regenerated on save and
        committed; any disagreement found on load between them and the netlist shall be
        handled as an advanced-mode netlist diff.
INV-09  A project shall reach status "Released for fabrication" only as defined in
        ST-05.
INV-10  Self-sufficiency: the app shall ship every runtime, toolchain, engine, model,
        library, driver and document it needs to perform its functions, and shall
        require no prerequisite installation, external application, user account,
        internet service or remote AI (including Claude). Use of the local network for
        INV-02(b) is not an internet dependency. Exception: USB drivers whose licence
        does not permit redistribution (SS-04); the affected boards shall be listed in the
        installer and in DOC-11.
INV-11  Every part in a generated design shall be a *standard part* with a *standard
        value*. The *target board* counts as a part: it shall be a catalogue entry and a
        BOM line.
INV-12  Every ambiguity, contradiction or missing item of information detected in the
        user's description (NL-02) shall be resolved by a user answer or by a
        user-approved documented assumption before design generation starts.

## 5. PROJECT STATUS MODEL
ST-01  Each project shall carry exactly one status: Draft, Clarified, Designed,
       Verified, Released for fabrication, Hardware-validated.
ST-02  Clarified: all NL-02 items are resolved (INV-12) and the requirement set passes
       the DOC-10 lint (the review record of DOC-12 is not required).
ST-03  Designed: code, pin map, schematic, BOM and layout exist for the current
       requirement set.
ST-04  Verified: VER-01..VER-06, VER-10 and VER-13 pass, plus the gates for the
       project's *build style*: PCB build — VER-08, VER-09, VER-11; perfboard
       build — VER-14; breadboard build — VER-15.
ST-05  Released for fabrication (PCB builds only): Verified, plus VER-12 checklists generated and the
       user has approved the fabrication package.
ST-06  Hardware-validated: for a PCB build, Released for fabrication plus every HIL
       item in VER-07 and VER-12 has a recorded pass result; for perfboard and
       breadboard builds, Verified plus every HIL item in VER-07 has a recorded pass
       result.
ST-07  Any change to a requirement, the netlist, the code or the layout shall set the
       project to the highest status whose conditions are all still met.
ST-08  The app shall display requirements that can only be verified on hardware as
       "HIL-pending" until a result is recorded.
ST-09  Automated test harnesses (VAPP-06, CM-05, builder-run ACC tests) shall measure
       and report *Verified-auto*. Status Verified shall be claimed only after the user
       has recorded the review (DOC-12, TEST-02).
Note: this model defines "100 % verification": every requirement has at least one
verification method, every automated gate passes, and every hardware-only item is
visibly HIL-pending until validated. The app never claims physical correctness it has
not demonstrated.

## 6. HOST PLATFORMS
HOST-01 Supported *host* operating systems: (a) Windows 10 (22H2) and 11, x86-64;
        (b) Ubuntu Desktop LTS releases, x86-64, from 22.04 up to the latest LTS release
        available when each app version is built; (c) Raspberry Pi OS 64-bit with desktop,
        Bookworm or later, arm64, on Raspberry Pi 5. macOS is out of scope for the
        first release.
        Note: Windows 10 is past Microsoft's end of support (14 October 2025); the
        app's support for it does not extend to OS security updates.
HOST-02 Host profile A (laptop/PC): (a) CPU with ≥ 4 cores / 8 threads, x86-64 with
        AVX2; (b) RAM ≥ 16 GB, 32 GB recommended; (c) ≥ 60 GB free SSD storage for the
        default and typical selections, the installer warning that selecting every
        optional pack needs about 75 GB; (d) GPU optional, used for LLM acceleration
        (CUDA or Vulkan) when present, CPU fallback otherwise; (e) display
        ≥ 1920×1080 for the full workspace, with all functions reachable at 1366×768
        through collapsible panes.
HOST-03 Host profile B (Raspberry Pi 5): (a) RAM ≥ 8 GB, 16 GB recommended;
        (b) NVMe SSD ≥ 256 GB recommended, A2 high-endurance microSD ≥ 128 GB minimum;
        (c) active cooling; (d) official 27 W USB-C power supply; (e) the smaller LLM
        profile selected automatically, with the expected generation time displayed,
        and a user option to switch to the larger profile after a warning;
        (f) display ≥ 1920×1080.
HOST-04 The app shall check HOST-02 or HOST-03 at installation and at every start-up,
        and shall display each shortfall with its consequence.
HOST-05 Every *host* shall provide at least one USB port for *target board* connection.
        Raspberry Pi imaging shall require a USB SD-card reader.
HOST-06 Functions requiring a network: (a) online update check and download;
        (b) SSH deployment to a Raspberry Pi *target board*. Online downloads shall be
        resumable after interruption.
HOST-07 Host-dependent functions: (a) GPU acceleration — hosts with a supported GPU;
        (b) deployment of a generated Raspberry Pi project to the *host* itself — Pi 5
        hosts only, with a confirmation step and automatic rollback of the deployed
        service on failure, performed through the privileged helper (SS-05); (c) LLM profile — requirement extraction and clarification
        questions may differ between LLM profiles within their VAPP-06 thresholds;
        everything downstream of the approved requirement set is deterministic (LLM-05)
        and identical across hosts.
HOST-08 Performance targets (confirmed or corrected in Phase 0). Times exclude time
        spent waiting for user input.
                                          Profile A      Profile B
        PERF-01  App cold start             ≤ 10 s         ≤ 20 s
        PERF-02  LLM model load             ≤ 60 s         ≤ 120 s
        PERF-03  Description → requirement  ≤ 3 min        ≤ 10 min
                 draft (per ACC project)
        PERF-04  Compile + flash            ≤ 60 s         ≤ 120 s
        PERF-05  Emulation display rate     ≥ 50 % of      ≥ 25 % of
                 (ACC projects)             real time      real time
        PERF-06  Autoroute ACC PCB          ≤ 5 min        ≤ 15 min
        PERF-07  DRC + Gerber export        ≤ 30 s         ≤ 90 s
        PERF-08  Start-up integrity check   ≤ 15 s         ≤ 45 s
        PERF-09  Offline installation       ≤ 20 min       ≤ 40 min
        PERF-10  Cross-highlight response   ≤ 200 ms       ≤ 500 ms
        PERF-05 applies to the standard emulation mode, in which analog sub-circuits
        run as reduced behavioural models characterised by SPICE at design time
        (EM-05). The accurate mode (full SPICE co-simulation) is excluded from PERF-05.
        PERF-08 applies to the start-up check defined in SS-08.
        All PERF targets apply to projects within the size limits of DATA-04.

## 7. SELF-SUFFICIENCY
SS-01  The app shall be delivered, per *host* OS, as one installation medium image
       containing (a) a signed bootstrap installer (Windows EXE; Ubuntu x86-64 .deb;
       Raspberry Pi OS arm64 .deb) and (b) signed component packs. The medium shall be
       formatted exFAT; each pack file shall be ≤ 1.9 GiB (the GitHub Releases asset limit
       of CM-10; also FAT32-safe),
       and one component may span several pack files (models as split GGUF; SS-08
       hashes each part). The Linux component packs shall carry every dependency .deb
       missing from a clean image of each supported release, installed through the local
       package path. The bootstrap shall install
       the complete application and all packs in one run. Installation from USB
       storage on a *host* that has never been online shall succeed. Large optional
       packs (second LLM profile, Pi OS target images) shall be selectable at
       installation. The offline dependency sets of BRD-03 shall always be installed;
       without the Pi OS images, imaging is unavailable and deployment to an already
       imaged Pi remains available; the installer shall state this consequence.
SS-02  The installer shall bundle private copies of: LLM runtime and models; Python
       runtime; a JRE if any bundled component requires one (Temurin 25 for
       Freerouting); the compiler toolchains and
       arduino-cli cores for every board tier delivered in that release; MicroPython
       firmware images; emulators; PCB engine; Gerber viewer; Git engine; PDF and
       diagram renderers. KiCad 3D models shall be installed by default only for
       catalogue parts; the full 3D library shall be an optional pack. The RISC-V
       toolchain for RP2350 shall not be bundled.
       LLM weights shall be licensed Apache-2.0 or MIT. The Windows installer shall
       present the WebView2 runtime licence terms for acceptance. A source pack shall
       carry the corresponding source of every copyleft component and package on the
       medium.
SS-03  Bundled components shall be installed inside the app's own directory and shall
       neither use nor modify system-wide installations of the same tools.
SS-04  The installer shall bundle and install the USB-serial drivers required by
       supported boards (CH340/CH341, CP210x, FTDI, ATmega16U2) and, on Linux, the udev
       rules and group membership required for serial access. A driver whose
       licence does not permit redistribution (Phase 0 (a)) shall not be bundled; the
       installer shall instead accept the user's own copy of it and list the affected
       boards. In the first release no Windows USB-serial driver shall be bundled:
       ATmega16U2 boards shall use the Windows built-in CDC driver, and CH340, CP210x and
       FTDI boards fall under the INV-10 exception unless written redistribution
       permission is obtained.
SS-05  Administrator/root rights shall be requested only during installation, update
       installation and uninstallation, never during normal operation. The installer
       shall install one privileged helper whose only functions are: (a) writing an
       image to a removable medium and writing first-boot configuration files to it,
       with a guard against writing to the *host*'s own boot medium, enforced on every
       host; (b) installing, starting, stopping and removing the single EmbedForge
       project service used by HOST-07(b); (c) installing .deb packages taken only from
       the signed offline dependency set of the running EmbedForge version (allowlist by
       package hash). Python wheels shall be installed without root into a per-project
       virtual environment. The helper shall accept requests only from the app's own signed
       executable and shall log every request. A per-user installation without
       drivers and without the helper shall be offered for users without
       administrator rights, with the missing functions listed.
SS-06  Every function shall have its user interface inside the app (section 12). A
       bundled private copy of the full KiCad editor may be offered as an optional
       "advanced mode" launched from the app; no function shall depend on it.
SS-07  All documentation (app manual, library documentation, board pinouts,
       tutorials, requirement-writing rules, glossary) shall be available offline
       and searchable in-app. Copyrighted standards and guides (INCOSE Guide to Writing
       Requirements, IPC-2221, IEC 60063) shall not be redistributed: the app shall
       ship an original summary of their rules with citations, and the values and
       formulas it uses. For each catalogue part, the app shall include the
       manufacturer datasheet when its licence permits redistribution; otherwise the app
       shall include a parameter sheet (pinout, ratings, key characteristics, source
       reference) generated at *release-time* and checked against the datasheet. For user catalogue extensions
       (EM-04), a parameter sheet may be generated at *install-time* from a datasheet in
       the local library, with the user recorded as reviewer. The user may import datasheet files they obtained into a
       per-host local library; imported datasheets shall not be included in project
       files, exports to other users or signed packages. Each parameter sheet shall
       record its reviewer and review date; only parts with a
       reviewed datasheet or parameter sheet shall count as *standard parts*.
       Board documentation licensed CC-BY-SA (Arduino, Raspberry Pi) may be bundled
       with attribution, under the same licence and without trademarks.
SS-08  At start-up the app shall verify the SHA-256 checksums of every executable,
       shared library, script, grammar and schema file, and the size, modification time
       and signed cached checksum of every other file (models, OS images, packs, part
       libraries, 3D models, documents); it shall then verify the full checksums of
       those other files in the background. It shall restore any corrupted or missing
       component from a local recovery store without network access, logging the
       event. DIAG-01 shall offer a full verification on demand.
SS-09  Every update (app, models, libraries, component models, catalogue, profiles)
       shall be available as a signed package file importable from USB storage, subject
       to the same signature and CM-05 checks as an online update.
SS-10  The full app state (projects, baselines, settings, custom profiles, custom
       component models) shall be exportable to and restorable from a single archive.

## 8. SECURITY AND SAFETY
SEC-01 SSH credentials and keys for *target boards* shall be stored encrypted in the
       OS credential store (Windows Credential Manager, Secret Service/libsecret) and
       never in project files. Where no OS credential store is running, the app shall
       store them in a file encrypted with a key derived from a user passphrase
       (Argon2id, AES-256-GCM) and shall label this fallback in the UI.
SEC-02 Installers and update packages shall be signed; the app shall reject unsigned
       or wrongly signed packages. The signing key shall be held offline, with a
       documented key-rotation procedure.
SEC-03 Imported projects, component models and board definitions shall be validated
       against their schema before use; executable content in imported files shall be
       rejected.
SEC-04 Generated firmware shall not include network services unless a requirement
       explicitly asks for them; any network service generated shall require
       authentication and shall be listed in DOC-04.
SAF-01 The assembly guide (DOC-05) shall include safety instructions for every build:
       ESD handling, first power-up through a current-limited supply, and polarity
       checks.
SAF-02 Designs with motors, servos, solenoids or relays shall include flyback
       protection where the load is inductive and a supply separate from every supply pin
       of the *target board* (regulator outputs and 5 V/USB pass-through pins), regardless of load size (micro-servos and vibration motors
       included); the guide shall state the required supply voltage and current.
SAF-03 Battery-powered designs shall use only catalogue charger/protection modules for
       the battery chemistry chosen; direct charging of lithium cells from a *target
       board* pin shall be blocked.
SAF-04 Any design with a net voltage above 24 V DC shall be rejected (see section 23).
       The limit applies to voltages on nets inside the design, not to part ratings.
       Net voltage is the maximum steady-state voltage produced by the design's
       sources; switching transients clamped under ED-03(f) are excluded.

## 9. SUPPORTED TARGET BOARDS
TB-01  Every supported board shall have a qualified board-definition package containing:
       (a) pin capabilities — digital I/O, analog input, PWM, DAC, I²C, SPI, UART,
       interrupt, voltage level and 5 V tolerance, maximum current per pin and per port;
       (b) schematic symbol; (c) footprint and shield/HAT outline; (d) 3D model;
       (e) emulation model; (f) flashing procedure; (g) pinout diagram for the docs;
       (h) USB VID/PID signatures for detection.
TB-02  Tier 1 boards (first release):
       (a) Arduino Uno R3 and compatibles: ELEGOO UNO R3, SunFounder Uno R3-compatible
           boards, in CH340 and ATmega16U2 USB variants;
       (b) Arduino Mega 2560 R3 and compatibles: ELEGOO MEGA 2560 R3, SunFounder Mega
           2560-compatible boards;
       (c) Arduino Nano (ATmega328P) and compatibles, CH340 variants, old and new
           bootloader;
       (d) Raspberry Pi 5, 4 Model B, 3 Model B+, Zero 2 W (Python, GPIO via
           gpiozero/lgpio);
       (e) Raspberry Pi Pico, Pico W, Pico 2, Pico 2 W (Arduino core and MicroPython,
           UF2 flashing).
       Note: if Phase 0 finds no RP2350 emulator that passes qualification, Pico 2
       and Pico 2 W stay in Tier 1 with their requirements HIL-pending (definition
       of *emulatable requirement*). Wireless functions of Pico W and Pico 2 W are
       "not emulated" (EM-08).
       Raspberry Pi *target boards* shall be supported with the Raspberry Pi OS
       Lite 64-bit Trixie and Bookworm (Legacy) images held in the local library;
       desktop and Full images shall not be shipped. Until Raspberry Pi Ltd confirms
       that unmodified images may be redistributed, the images shall be imported by
       the user from a downloaded file and verified against a signed list of SHA-256
       hashes. If shipping is permitted, only the current Lite image shall be shipped,
       with a written offer for its corresponding source.
TB-03  Tier 2 boards (Increment 9): Arduino Uno R4 Minima and WiFi, Arduino Leonardo,
       ESP32 DevKit V1, ESP8266 NodeMCU, and their ELEGOO and SunFounder equivalents.
TB-04  Adding a board shall be a data-only operation (board-definition package) enabled
       only after passing the board-qualification test suite.
TB-05  When a request exceeds the selected board's resources (pins, PWM channels, ADC
       channels, DAC channels, memory, current), the app shall report each shortfall
       and offer resolution options (port expander, external ADC/DAC, driver module,
       larger board) for the user to choose.

## 10. COMPONENT MODELS AND EMULATION
EM-01  Every component model shall contain: (a) electrical interface — pins, voltages,
       currents, timing; (b) protocol — analog, digital, PWM, I²C, SPI, UART, 1-Wire or
       proprietary single-wire; (c) behavioural model including value ranges, noise and
       failure modes; (d) schematic symbol; (e) footprint; (f) 3D model;
       (g) datasheet or parameter sheet (SS-07); (h) emulation widget; (i) qualification
       test results.
EM-02  At first release the model library shall cover: (a) every sensor, actuator,
       display and module in the ELEGOO and SunFounder Arduino and Raspberry Pi starter
       and ultimate kits in the inventory approved in Phase 0; (b) the generic parts
       list in EM-03. The Phase 0 inventory shall class each *kit part* as full
       model, behavioural stub, or "not emulated". A *kit part* whose main IC is
       discontinued (end of life, obsolete or no longer manufactured) and for which no
       *active* equivalent with the same function and interface has been identified
       shall be excluded: it shall have no component model and no catalogue entry, and
       it shall be listed with its reason in DOC-11. A description that names an
       excluded part shall raise an NL-02 clarification offering catalogue
       alternatives.
EM-02A A *kit part* that is not a *standard part* shall be emulatable and documented
       for learning use, but shall not appear in a generated design; the app shall
       substitute an *active* catalogue equivalent with the same function and
       interface, and record the substitution in DOC-09. An ACC part (section 19) that
       fails the *active* test is satisfied by its EM-02A substitute; the substitution
       shall appear in DOC-09 and in the ACC test report.
EM-03  Generic parts list: resistors, capacitors, potentiometers, LEDs, RGB LEDs,
       push-buttons, switches, diodes, BJTs, MOSFETs, relays, opto-couplers, voltage
       regulators, level shifters, DC motors, servos, stepper motors with ULN2003,
       A4988 and DRV8825 drivers, DC motor drivers L298N, TB6612FNG and L293D, buzzers,
       HD44780 16×2 LCD with I²C backpack, SSD1306 OLED, 7-segment displays, 4×4 keypad,
       DHT11, DHT22, DS18B20, HC-SR04, HC-SR501 PIR, LDR, IR receiver, analog joystick,
       rotary encoder, ICM-42688-P, BMP280, BME280, DS1307, DS3231, MCP4725, ADS1115,
       PCF8574, MCP23017.
       Any listed part that fails the *active* test at the catalogue snapshot (for
       example MPU-6050, confirmed obsolete by its manufacturer in Phase 0 and replaced
       here by ICM-42688-P) shall be modelled as a *kit part* under EM-02A, and an *active*
       equivalent chosen in Phase 0 shall be added to this list.
EM-04  The user shall be able to add a model for any sensor or actuator with a public
       datasheet through a template-based model editor. The LLM may draft the model
       from a datasheet in the local library; the model shall be enabled only after
       passing the model-qualification test suite. The corresponding part shall enter
       a user catalogue extension and shall count as a *standard part* only if the
       user records its class, MPN or reference design, two sources and lifecycle
       status; otherwise it shall be usable in emulation only.
EM-05  Emulation shall couple (a) an instruction-level MCU emulator for AVR,
       RP2040/RP2350 and, from Tier 2, ESP32, or a Python/GPIO emulation for Raspberry
       Pi targets, (b) component behavioural models, and (c) SPICE for analog
       sub-circuits, through one component-model interface. In standard mode, SPICE
       shall characterise each analog sub-circuit at design time and produce a reduced
       behavioural model used during emulation; an accurate mode shall run full SPICE
       co-simulation.
EM-06  Emulation shall be time-accurate: all timing in emulated firmware and models
       shall follow emulated time. The display shall show the current ratio of emulated
       to real time.
EM-07  The user shall be able to (a) drive inputs interactively (analog value, button,
       temperature, joystick position) and (b) run scripted scenarios of time-stamped
       stimuli with expected outputs.
EM-08  Every part without a qualified model shall be labelled "not emulated" in every
       view, and requirements depending on it shall be marked HIL-pending (ST-08).

## 11. PARTS CATALOGUE
PC-01  The app shall include an offline parts catalogue with, for each part: class
       (*discrete part* or *generic module*), generic type, value, tolerance, ratings,
       package (through-hole and SMD variants), MPNs or reference design, at least two
       sources, lifecycle status, and catalogue snapshot date. The catalogue shall be an
       original, fact-only dataset licensed CC-BY-4.0 and curated by hand: lifecycle
       status from the manufacturer's own product page or notice; each source recorded
       with vendor, SKU, URL, check date and in-stock flag; every field with its source
       URL and date. No data obtained through distributor APIs or bulk extraction shall
       be included.
PC-02  Resistor and capacitor values shall be E12 by default; for resistors only, E24
       or E96 shall be used only when a calculated tolerance requires it, with the calculation recorded in
       DOC-09. A calculated non-standard value shall be replaced by the nearest
       *standard value* and the design re-verified with it.
PC-03  *Part style* shall be selectable per project, independently of *build style*: (a) module build — *generic modules*
       on a carrier shield/HAT or breadboard with headers; (b) discrete build —
       *discrete parts* only. Through-hole shall be the default package; SMD shall be
       optional.
PC-04  The catalogue shall be updatable online or by USB package as a managed update
       (CM-05). Every BOM shall display the catalogue snapshot date.
PC-05  Every part choice shall be justified in DOC-09: reason for the part, reason for
       the value, derating applied.

## 12. USER INTERFACE, VISUALISATION AND NAVIGATION
UI-01  Project navigator: a tree of all project artefacts — requirements,
       clarifications, blocks, interfaces, parameters, code, pin map, schematic,
       breadboard, layout, BOM, emulation scenarios, tests, documentation, history.
UI-02  Selecting any artefact shall highlight every related artefact in every open view
       (requirement → block → code lines → pins → nets → traces → emulation widgets →
       tests), within PERF-10.
UI-03  Every view shall provide navigation to each related artefact.
UI-04  Natural-language workspace: prompt entry; generated requirement set beside the
       original text; clarification questions with proposed defaults and answer
       fields; assumption list requiring user approval.
UI-05  Functional block diagram view: blocks and interfaces editable. An edit shall
       produce drafted requirement changes for user approval; on approval the NL-02
       checks shall run on the changed requirements, the status shall be recomputed under
       ST-07, and code and circuit shall be regenerated and re-verified.
UI-06  Behaviour view: state machines and truth tables generated from the requirements.
UI-07  Pin allocation view: an image of the selected board showing, per allocated pin,
       name, function, direction, voltage level and served requirement, plus a
       summary of used and free resources (PWM, ADC, DAC, timers, buses).
UI-08  Schematic view, editable.
UI-09  Breadboard view, editable, showing each part's physical form, pin labels and
       colour-coded wires.
UI-10  PCB view: per-layer 2D view, interactive placement and route editing, DRC
       markers, 3D view of the assembled board.
UI-11  Emulation dashboard: animated breadboard view; virtual multimeter, oscilloscope,
       logic analyser, serial monitor, serial plotter; pin-state panel;
       start/pause/step/speed controls; emulated-to-real-time ratio (EM-06).
UI-12  Code view: syntax highlighting, block boundaries, interface annotations,
       compile errors linked to lines. *Generated regions* shall be read-only and
       changeable only through the pin map (UI-07) or the parameter set (ED-06).
       Manual edits outside *generated regions* shall be recorded and re-verified.
       When code is regenerated, manual edits shall be preserved per block by a Git
       three-way merge; merge conflicts shall be shown to the user for resolution.
UI-13  Verification dashboard: status of every gate per requirement with evidence
       drill-down, and the project status (section 5).
UI-14  Assembly guide viewer: one step per screen, with the step's parts and wires
       highlighted in the breadboard or 3D view, a completion checkbox, and expected
       measurements.
UI-15  History view: timeline of baselines and visual diffs of requirements, code,
       schematic and PCB between any two versions.
UI-16  Board manager and flashing view: detected boards, ports, driver status, flash
       progress and logs.
UI-17  Library browsers for boards, component models, parts catalogue, code libraries
       and datasheets, with search and filters.
UI-18  Guided mode (board → describe → clarify → review → emulate → build) and expert
       mode (all views freely accessible), switchable at any time.
UI-19  Every view shall export to PDF, PNG and SVG and shall be printable. The 3D
       view, oscilloscope, logic analyser and animated emulation views may export SVG
       as an embedded raster image.
UI-20  Every function shall be reachable by keyboard.
UI-21  Light and dark themes and font scaling from 80 % to 200 %.
UI-22  Undo and redo in every editor.
UI-23  Context help in every view, linked to the offline documentation.

## 13. FUNCTIONAL REQUIREMENTS
### 13.1 Natural language to requirements
NL-01  The app shall accept a natural-language description in English plus a selected
       *target board* and produce a structured requirement set (DOC-01) for user review
       before any code or circuit is generated.
NL-02  The app shall detect and present as clarification questions, each with a proposed
       default: (a) undefined terms; (b) contradictions; (c) type conflicts (a signal
       declared with one type and used as another); (d) missing tolerances for analog
       comparisons; (e) missing ranges or units; (f) missing event semantics (level- or
       edge-triggered, repetition rate); (g) declared but unused signals; (h) *target
       board* capability gaps (TB-05); (i) functions not covered by a qualified block
       template (LLM-05), with the options: nearest template with the stated deviations,
       simplified requirement, or a manual code block outside *generated regions* (UI-12),
       unverified until its gates pass.
NL-03  The app shall decompose the project into functional blocks, each with a
       documented interface: inputs, outputs, types, units, ranges, timing, error codes,
       version.

### 13.2 Electrical design
ED-01  The app shall allocate pins automatically within the pin capabilities of TB-01(a).
ED-02  The app shall generate the schematic and breadboard view from the netlist.
ED-03  The electrical rule check shall flag: (a) pin reuse; (b) voltage-level mismatch;
       (c) per-pin or per-port current over limit; (d) missing pull-up or pull-down;
       (e) I²C address clash; (f) inductive load without flyback protection;
       (g) motor or actuator powered from a supply pin of the *target board*.
ED-04  The app shall generate interface circuits: (a) input protection and signal
       conditioning; (b) 5 V ↔ 3.3 V level shifting; (c) analog output by PWM with RC
       filter or by external DAC, with the choice and its cut-off/resolution
       calculation recorded; (d) transistor, MOSFET or driver stages for loads;
       (e) separate load supply with common ground; (f) decoupling capacitors.
ED-05  The app shall compute a power budget per rail and check it against the *target
       board* regulator and USB limits; where exceeded, it shall add an external supply
       to the design.
ED-06  The app shall generate one versioned parameter file containing every parameter
       (clock, baud rate, thresholds, tolerances, debounce times, PWM frequency,
       calibration constants, timings) with unit and valid range.
ED-07  The app shall generate a BOM from the catalogue only (INV-11), with class, MPN or
       reference design, footprint, ratings, quantity, alternatives, and catalogue
       snapshot date.

### 13.3 Code generation
CG-01  The app shall generate source code per functional block: C++ for Arduino-core
       targets, MicroPython or C++ for Pico targets, Python for Raspberry Pi targets.
CG-02  An integration layer shall connect blocks exclusively through their NL-03
       interfaces.
CG-03  Pin definitions and parameters shall appear in code only inside *generated
       regions* derived from the netlist and the parameter file.
CG-04  Each project's firmware shall include a self-test mode: power-on checks, sensor
       and actuator presence and range checks, bus communication checks, with
       documented error codes and remediation steps (DOC-06).

### 13.4 PCB and perfboard layout
PCB-01 Form factors: Arduino Uno shield, Arduino Mega shield, Arduino Nano carrier,
       Raspberry Pi HAT+ (per the latest official HAT+ specification held in the local
       library, including the ID EEPROM, which may be an SMD part in a through-hole
       build and shall then be flagged in DOC-05), Raspberry Pi Zero pHAT, Pico carrier, and custom outline with
       user-defined dimensions and mounting holes.
PCB-02 Every schematic component shall have a verified footprint from the offline
       library; layout shall be blocked until all components have one. Symbols,
       footprints, 3D models and board templates made for EmbedForge shall be licensed
       CC-BY-SA 4.0 with the KiCad library design exception; third-party templates whose
       licence would bind users' designs shall not be used.
PCB-03 Automatic placement shall apply: (a) connectors on board edges; (b) decoupling
       capacitors ≤ 3 mm from the IC supply pin, measured pad edge to pad edge along
       the routed copper, for every IC placed on the board — placement shall target the
       straight-line pad-edge distance and the routed-copper distance shall be checked
       after routing as a custom DRC rule within VER-08; (c) thermal separation of heat
       sources; (d) separation of load-current paths from signal paths; (e) keep-out
       areas. The user shall be able to adjust placement before routing.
PCB-04 Routing: 1 or 2 layers by default, 4 layers optional; net classes power, load,
       signal, ground; trace widths computed from current per IPC-2221 and recorded in
       DOC-08; ground pour on the ground net; manual route editing in-app.
PCB-05 Fabrication capability profiles (minimum track/space, drill, annular ring, solder
       mask, silkscreen) shall be selectable and versioned; the app shall ship at least
       one standard prototype profile and allow user-defined profiles. The shipped default
       profile shall be EF-PROTO-STD (docs/phase0/f_fab_profile.md).
PCB-06 Fabrication package: Gerber RS-274X with X2 attributes, Excellon drill files,
       drill map, pick-and-place file, assembly BOM, fabrication and assembly drawings
       (PDF), STEP export of the assembled board for parts with 3D models.
PCB-07 A pin change in any view shall be applied through the netlist, propagated to all
       views and to the *generated regions*, and shall trigger re-verification.
PCB-08 For builds without a manufactured PCB, the app shall generate a perfboard or
       stripboard layout with a hand-wiring list.
PCB-09 Where a PCB is generated, it shall include test points for every power rail and
       every bus, referenced in DOC-06.

### 13.5 Board handling
BRD-01 The app shall detect connected boards by USB VID/PID and bootloader probe and
       present a ranked list of candidate boards; the user shall confirm the board once,
       and the choice shall be stored in the project. Manual board and port selection
       shall always be available.
BRD-02 The app shall configure board options (FQBN, fuses/bootloader, Raspberry Pi OS
       settings) and flash or deploy the project, logging every operation. Bootloader
       and fuse programming shall use the Arduino-as-ISP method only.
BRD-03 Deployment to a Raspberry Pi *target board* shall install every dependency of
       the generated project from offline packages (Python wheels and .deb files)
       shipped for each supported target OS image; it shall not require internet
       access on the *target board*.
BRD-04 For HAT+ builds, the app shall generate the ID EEPROM image and program it over
       SSH on the *target board* with bundled tools; the step and its verification shall
       appear in DOC-05 and VER-12.

### 13.6 Emulation of projects
EMU-01 The app shall emulate the complete project (firmware, circuit, component models)
       and display the results in the emulation dashboard (UI-11).
EMU-02 The app shall generate at least one emulation scenario per *emulatable
       requirement* and run it as part of VER-05.

### 13.7 Libraries
LIB-01 The app shall include an offline cache of the curated Arduino, Raspberry Pi and
       Pico code libraries approved in Phase 0, with their documentation. The curated set
       shall contain only permissively licensed (MIT, BSD, Apache-2.0) or LGPL
       libraries.
LIB-02 The app shall check for new versions of code libraries, cores, board
       definitions, component models, the catalogue and symbol/footprint libraries,
       online or from an imported package; list them with changelogs; and apply them
       only after CM-05 passes.

### 13.8 LLM
LLM-01 The LLM shall use only boards, libraries, parts, models and footprints present in
       the local libraries; a code library not in the curated set may be
       used only after the user imports it as a package (SEC-03) and approves it for the
       project. Parts are governed by INV-11 and cannot be approved this way.
LLM-02 Every generated artefact shall record the LLM model version, prompt-template
       version and generation parameters.
LLM-03 Every LLM output (requirement, code, pin allocation, part choice, component model)
       shall pass deterministic checks — parser, schema, rule checker, compiler,
       ERC/DRC, emulation — before acceptance.
LLM-04 When an LLM output fails a check, the app shall retry with the check result as
       feedback, up to 3 retries after the first attempt (4 attempts in total), then
       stop and present the failure and its evidence to the user.
LLM-05 Deterministic design core: firmware, pin allocation, interface circuits,
       schematic and layout shall be produced by deterministic generators from a
       library of qualified, parameterised block templates and a rule engine. The LLM
       shall be limited to: (a) extracting the requirement set from the description;
       (b) raising NL-02 clarification questions and proposing defaults; (c) selecting
       and parameterising block templates; (d) drafting text for documentation and
       component models (EM-04). Every LLM output shall conform to a fixed JSON schema
       enforced by constrained decoding (grammar) and shall then pass LLM-03.
LLM-06 A block template shall be enabled only after passing the template-qualification
       test suite (compile, unit tests, emulation scenarios on every supported board it
       declares). Adding a template shall be a data-only operation. Block-template
       packages shall be licensed MIT, as configuration items separate from the GPL
       application; generated firmware, documents and design files belong to the user
       and carry an MIT notice where template code appears.

### 13.9 App self-diagnosis
DIAG-01 The app shall provide a self-diagnosis function covering: (a) bundled component
        integrity (SS-08); (b) toolchain health by test compilation; (c) USB/serial and
        driver status; (d) LLM runtime health; (e) emulator health; (f) storage
        headroom; with a report and remediation steps.

## 14. DATA AND FILE FORMATS
DATA-01 A project shall be stored as a Git repository of text files: requirements,
        interfaces, parameters, netlist, view geometry and metadata in versioned JSON or
        YAML schemas; code as source files; the pin map as a derived cache of the
        netlist; schematic and PCB in KiCad formats as derived artefacts (INV-08).
DATA-02 Every schema shall be versioned; the app shall migrate projects from every
        earlier schema version automatically and record the migration. Schema
        migration is not a "conversion" in the sense of INV-07.
DATA-03 Project files shall contain no absolute paths and no *host*-specific data.
DATA-04 Supported project size for the first release: at most 40 parts, 120 nets and
        a board outline with longest side ≤ 110 mm and area ≤ 10 000 mm² (part limit
        confirmed in Phase 0 (h) against a hand-estimated ACC-02 BOM). The app shall warn when a project exceeds a
        limit; PERF targets and VAPP-06 apply only within these limits.

## 15. CONFIGURATION MANAGEMENT
CM-01  Configuration items: app front-end; app back-end modules; bundled runtimes and
       toolchains; LLM models; prompt templates; code libraries; board definitions;
       component models; parts catalogue; symbol/footprint/3D libraries; fabrication
       profiles; each generated project.
CM-02  Every configuration item shall carry a semantic version and a changelog.
CM-03  Any set of configuration-item versions shall be taggable as a baseline and
       restorable in one action.
CM-04  Any configuration item shall be downgradable to any earlier version kept in the
       recovery store, after a dependency check.
CM-05  Update acceptance:
       (a) *Release-time*: the build pipeline shall accept a package only if interface
           contracts are unchanged or declared backward-compatible, the regression
           project set compiles, and all automated gates and emulation scenarios pass,
           on both host profiles. For Profile B, the functional gates run on the arm64 CI
           runner with a Raspberry Pi OS userland; Profile B PERF checks are
           user-executed (TEST-02) and do not block a release.
       (b) *Install-time*: the app shall apply a package to a project only if that
           project compiles and its automated gates and emulation scenarios pass with
           the new version on the current *host*. For app-level items (front-end,
           back-end modules, runtimes, toolchains, LLM models, prompt templates), the
           install-time check shall be DIAG-01 plus the bundled smoke-project set;
           a failed check shall roll the item back.
CM-06  Each project shall pin the versions of every library, core, board definition,
       component model and catalogue snapshot it uses. Updates shall be applied per
       project; a project failing CM-05(b) shall keep its pinned versions and the app
       shall report the reason.
CM-07  Interface definitions shall be versioned; a breaking change shall require a
       major version increment.
CM-08  A project's hardware revision (schematic, layout, fabrication package) shall be
       versioned together with its firmware; the revision and baseline tag shall appear
       on the silkscreen and in fabrication file names.
CM-09  Previous versions of every configuration item shall be kept in the local recovery
       store so that rollback needs no network. The user may set a retention limit; the
       app shall list the rollbacks a new limit removes before applying it. Versions
       pinned by a *known project* (CM-06) shall be protected from pruning. Pruning the
       versions of a baseline shall delete that baseline record, after user
       confirmation. The recovery store shall be content-addressed, so that unchanged
       items are stored once.
CM-10  Online updates shall be distributed as signed packages with a signed manifest
       from static file hosting (GitHub Releases in the first release); the
       distribution shall require no user account and shall collect no telemetry.
       Every release asset shall be ≤ 1.9 GiB; the same pack files shall be used for
       online and USB distribution.

## 16. DOCUMENTATION PER GENERATED PROJECT
All documents shall be generated, versioned, and viewable in-app.
DOC-01 Requirements specification following the INCOSE Guide to Writing Requirements
       (necessary, singular, unambiguous, verifiable, traceable), with verification
       method per requirement, the original description, clarification Q&A and
       approved assumptions.
DOC-02 Architecture description: functional decomposition, block diagram, data flow.
DOC-03 Design description per block: state machines, truth tables, timing.
DOC-04 Interface Control Document: every signal and API with name, type, unit, range,
       rate, error behaviour, version and compatibility rules; pin allocation table;
       connector pinouts; test points; network services (SEC-04).
DOC-05 User guide: step-by-step build and wiring with diagrams, commented code
       snippets, flashing procedure, first-run check, safety instructions (SAF-01..03);
       for PCB builds also ordering, soldering order and current-limited first power-up.
DOC-06 Self-diagnosis manual: error codes, symptoms, causes, fixes, test-point
       measurements with expected values and tolerances.
DOC-07 Traceability matrix: requirement → block → code/netlist → part → test → result →
       status.
DOC-08 PCB design report: stack-up, fabrication profile, net classes, trace-width
       calculations, DRC report, placement rationale, limitations.
DOC-09 Electrical design report: pin allocation rationale, interface circuit
       calculations, part selection and derating (PC-05), power budget (ED-05).
DOC-10 Documentation lint: every requirement and interface shall have no undefined
       terms, no TBD/TBC, units, ranges, tolerances for analog comparisons, and no *weak
       words* from the maintained list (initial list: fast, slow, approximately, about,
       appropriate, adequate, user-friendly, easy, etc., and/or, as needed, if possible,
       popular, typical). The
       weak-word list shall be a configuration item (CM-01) with a shipped default,
       extendable per project.
DOC-11 The app's own documentation (requirements, architecture, ICD, user manual,
       self-diagnosis manual, component and licence inventory separating linked and
       aggregated components per Phase 0 (a)) shall follow DOC-01..04, DOC-06, DOC-07,
       DOC-10 and DOC-12 and ship inside the app.
DOC-12 Review record: each document shall carry a human review record stating
       reviewer, date and the document version reviewed.

## 17. VERIFICATION GATES FOR GENERATED PROJECTS
VER-01 Generated code compiles with zero errors and zero warnings at -Wall (C++) or the
       equivalent level; warnings originating in third-party libraries, the Arduino
       core or board packages shall be logged and shown, and shall not fail the gate.
       For MicroPython, the equivalent level is: mpy-cross compiles every file without
       error, and VER-02 passes. For CPython (Raspberry Pi targets), the equivalent level
       is: py_compile passes under the target image's Python version (3.11 on Bookworm,
       3.13 on Trixie), and VER-02 passes.
VER-02 Static analysis reports no high-severity finding in generated code.
       High-severity means: cppcheck severities "error" and "warning"; ruff rule
       families F and E9; pylint messages of category error or fatal.
       pylint shall run against bundled type stubs for MicroPython ports and the
       Raspberry Pi GPIO libraries, pinned as a library item (CM-06).
VER-03 ERC (ED-03) and power budget (ED-05) pass.
VER-04 Unit tests per block pass on the *host* with hardware mocks.
VER-05 Emulation scenarios (EMU-02) pass for every *emulatable requirement*.
VER-06 Documentation lint (DOC-10) passes, the traceability matrix has no gaps (a
       gap is a requirement with no verification method, block or test; an HIL-pending
       result is not a gap), and every document has a human review record (DOC-12)
       newer than its last change. (The
       review is a user action; the gate checks only that the record exists and is
       current.)
VER-07 HIL checklist per requirement generated; user results recorded in DOC-07.
       (Manual; required for ST-06 only.)
VER-08 PCB DRC passes against the selected fabrication profile, with zero unrouted
       nets.
VER-09 Schematic ↔ PCB netlist consistency: no missing, extra or mismatched nets or
       footprints.
VER-10 Firmware *generated regions* ↔ netlist ↔ board definition consistency: every
       pin used within its capabilities and limits.
VER-11 Exported Gerber and drill files re-read by an independent viewer and checked for
       layer completeness, board outline and drill-to-pad alignment.
VER-12 Bare-board and assembled-board checklist generated (continuity, rail-to-rail
       shorts, rail voltages at test points); user results recorded in DOC-07.
       (Manual; required for ST-06 only.)
VER-13 Implementability: every BOM line is a *standard part* with a *standard value* and
       a footprint matching the selected *build style* and *part style* (breadboard build:
       2.54 mm-pitch through-hole or header-mounted parts only).
VER-14 Perfboard consistency: the perfboard or stripboard layout and hand-wiring list
       (PCB-08) implement every netlist connection, with no extra connections and no
       track-cut omissions.
VER-15 Breadboard consistency: the breadboard view implements every netlist
       connection, with no missing, extra or mismatched connections.

## 18. VERIFICATION OF THE APP
VAPP-01 Clean-machine test: offline installation from USB on a freshly installed OS
        image of each *host* OS with networking disabled, then ACC-01 and ACC-02 run end
        to end as far as delivered features allow.
VAPP-02 Isolation test: VAPP-01 repeated on a *host* with Arduino IDE, KiCad and Python
        already installed; neither installation affects the other.
VAPP-03 Dependency audit: every file loaded at runtime is inside the app directory or
        in the OS standard libraries.
VAPP-04 Self-repair test: a deleted or corrupted bundled component is detected and
        restored offline (SS-08).
VAPP-05 Offline update and rollback test with a USB package (SS-09, CM-09).
VAPP-06 LLM regression corpus: at least 40 natural-language prompts covering every
        Tier-1 board, every EM-03 part class and every NL-02 ambiguity type, each with
        expected clarification questions and expected verified outcome. Pass criteria,
        confirmed in Phase 0: ≥ 95 % of expected clarification questions raised;
        ≥ 90 % of prompts reach *Verified-auto* within LLM-04's retry limit;
        0 % reach *Verified-auto* with a design that violates an expected outcome.
        Thresholds shall be set and measured per host profile. Each expected question
        shall be tagged with its NL-02 type and the signal it concerns; a raised
        question matches when both tags match. Each expected outcome shall be an
        executable emulation assertion. Expected questions shall be board-specific.
        Each corpus entry shall include scripted answers to its expected questions;
        unexpected questions shall take the proposed default, which shall be logged. The
        corpus shall include at least two prompts requiring functions not covered by a
        qualified template (NL-02(i)).
VAPP-07 Security tests: unsigned package rejected (SEC-02); malformed or
        executable-content import rejected (SEC-03); no credentials in project files
        (SEC-01).

## 19. ACCEPTANCE PROJECTS (carried through every increment)
ACC-01 "Temperature-controlled fan: DHT22 sensor, PWM fan via MOSFET, 16×2 I²C LCD,
       alarm LED above 35 °C", built as an Uno shield (2-layer PCB) and as a Raspberry
       Pi HAT+ variant on a Raspberry Pi 5. In the HAT+ variant the DHT22 shall be read
       through the kernel dht11 overlay (IIO); EM-05 shall provide an IIO device model
       for it, otherwise the requirements depending on the DHT22 are HIL-pending for
       this variant.
       Pass criteria:
       (a) NL-02 raises at least these questions, each with a proposed default:
           1. fan type (2-, 3- or 4-wire), voltage and current;
           2. PWM frequency;
           3. control law relating temperature to fan speed (on/off, proportional,
              stepped), with its range;
           4. hysteresis for the 35 °C alarm threshold and for fan switching;
           5. LCD content, layout and refresh rate;
           6. DHT22 read interval;
           7. behaviour on sensor failure or out-of-range reading;
           8. for the HAT+ variant: 5 V LCD backpack on a 3.3 V I²C bus (level
              shifting or 3.3 V operation).
       (b), (c) and (e) as for ACC-02, with the PCB form factors Uno shield and HAT+.
       (d) Emulation lets the user drive temperature, humidity and sensor-failure
           injection, and shows fan PWM duty, fan speed, LCD content and alarm LED
           state behaving as specified; all scenarios pass.
ACC-02 Target: ELEGOO UNO R3; repeated on ELEGOO MEGA 2560 R3 and Raspberry Pi Pico.
       The Pico acceptance run uses the Arduino core (C++); a MicroPython run is added
       from Increment 5.
       Prompt, verbatim:
       "Create a module with 2 generic analog inputs (named A and B), 3 generic digital
       inputs (named C, D, E), 2 digital outputs (named U and V) and one analog output
       (named W). Whenever A is equal to B, switch U ON. Whenever C and D are ON but E
       is OFF, increment the value of U, output it on a PWM output of the board and set
       the speed of a controlled motor proportionally."
       Pass criteria:
       (a) NL-02 raises at least these questions, each with a proposed default:
           1. tolerance and hysteresis for A = B;
           2. U is a digital output but is incremented and output as PWM — separate
              counter/PWM signal, or redefine U;
           3. increment on the rising edge of the condition, or at a stated rate while
              it holds; counter range; wrap or saturate; reset condition;
           4. motor speed proportional to which quantity, with which scaling;
           5. motor type, voltage, current and driver;
           6. behaviour of W, or removal (declared, unused);
           7. behaviour of V, or removal (declared, unused);
           8. the target board has no DAC (true for Uno, Mega and Pico) — PWM + RC
              filter or external DAC for W;
           9. voltage ranges of A and B;
           10. type of C, D, E inputs, pull-up/pull-down and debounce time.
       (b) After clarification: requirements pass DOC-10; pins allocated within board
           capabilities; interface circuits (ED-04), power budget (ED-05) and motor
           driver with separate supply generated.
       (c) Schematic, breadboard, PCB (Uno shield, Mega shield or Pico carrier, per
           target) and fabrication package generated from
           *standard parts* only; project reaches status Verified.
       (d) Emulation lets the user drive A–E and shows U, V, W, PWM and motor speed
           behaving as specified; all scenarios pass.
       (e) DOC-01..09 and the assembly guide complete and viewable in-app.

## 20. TEST ENVIRONMENT AND RESPONSIBILITIES
TEST-01 The builder (you) shall run automated tests on: (a) Windows and Ubuntu x86-64
        CI runners; (b) native arm64 Linux CI runners with a Raspberry Pi OS
        environment for functional tests. Performance targets for profile B require a
        physical Pi 5. GitHub-hosted runners shall run compile, unit, static-analysis,
        emulation and schema jobs, pack by pack. Two self-hosted runners on my hardware
        — the Profile A test PC (x86-64) and a Raspberry Pi 5 host (arm64) — shall run
        installation-medium assembly, the VAPP-06 corpus, profile-level gates and
        signing.
TEST-02 Tests requiring physical hardware — Pi 5 host performance, board detection and
        flashing on real boards, HIL checks — shall be delivered as scripted test
        procedures with expected results, executed by the user, and recorded in the
        test report. The builder shall mark these results "user-executed" and shall not
        claim them before they are recorded.
TEST-03 Each increment's test report shall state, per requirement: verified by builder
        (with evidence), awaiting user execution, or not verified (with reason).
TEST-04 Infrastructure provided by me: a public GitHub repository
        (github.com/kjaf1978-cmr/EmbedForge) and GitHub Actions with Windows, Ubuntu
        and arm64 hosted runners, plus the self-hosted runners of TEST-01; the Authenticode code-signing certificate
        and its hardware token; the offline Ed25519 signing key; a Profile A test PC;
        Raspberry Pi 5 hosts (8 GB and 16 GB, NVMe); every Tier 1 *target board* in
        TB-02 including the CH340 and ATmega16U2 Uno variants and old- and
        new-bootloader Nanos; a USB SD-card reader; a current-limited bench supply;
        the ACC-01 and ACC-02 parts. The builder shall push all work to the
        repository at the end of every working session. Signing steps shall run only
        on my infrastructure; the builder shall never hold the private keys.

## 21. TECHNOLOGY BASELINE (informative — propose alternatives with justification)
All components are bundled privately inside the app (SS-02, SS-03).
- Licence: EmbedForge is licensed GPL-3.0-or-later, with a section 7 additional
  permission allowing combination with the Microsoft Edge WebView2 runtime.
- Shell: Tauri (Rust back-end + web UI) for native USB/serial access and small size.
  Bundle the fixed-version WebView2 runtime on Windows, as a clean offline Windows
  10 image may lack it.
- UI rendering: canvas/WebGL for schematic, breadboard and PCB; three.js for 3D; one
  shared selection/highlight bus for UI-02. Check WebKitGTK WebGL performance on
  Pi 5 in Phase 0; fall back to CPU-rendered 2D canvas for 2D views if needed.
- Local LLM: llama.cpp with quantised GGUF models (Apache-2.0/MIT weights; shortlist
  in docs/phase0/a_licence_analysis.md), two size profiles, constrained
  decoding with JSON grammars (LLM-05).
- Design core: block-template library and rule engine (LLM-05, LLM-06).
- Build/flash: arduino-cli with pre-installed cores; the same avr-gcc version on every
  host, built natively for arm64 if the upstream arm64 build fails qualification (avrdude, bossac, picotool/UF2,
  esptool from Tier 2); SSH/SCP deployment and Imager-style SD-card imaging through
  the privileged helper (SS-05) for Pi targets, with Pi OS base images and offline
  dependency packages (BRD-03) in the local library.
- Emulation: simavr (AVR), rp2040js or equivalent (RP2040/RP2350), Espressif QEMU
  (ESP32, Tier 2), Python GPIO emulation under a virtual clock for Pi targets, ngspice for analog.
- Schematic/breadboard: native views; Fritzing .fzz/.fzp import/export for
  interoperability only.
- PCB: KiCad 10.0.x engine headless (kicad-cli; private arm64 build on the self-hosted
  Pi runner; on Ubuntu the official AppImage is extracted at installation and never run
  as an AppImage) for DRC and output; KiCad files written
  by a native S-expression writer; confirm in Phase 0 whether the KiCad IPC API can
  run without a KiCad GUI instance, and the effort of a private arm64 KiCad build.
  KiCad and Freerouting run as separate processes. Native in-app placement and
  routing editors; Freerouting (Specctra DSN/SES)
  as the Freerouting 2.5.0 native command-line build if it is self-contained (no JRE),
  otherwise with the bundled Temurin 25 JRE, or a native autorouter; gerbv or equivalent for VER-11.
- Configuration management: libgit2.
- Packaging: one reproducible build pipeline; Ed25519 signatures (minisign or
  equivalent); Windows Authenticode signing.

## 22. DEVELOPMENT PROCESS
Phase 0 — Reconnaissance (read-only). Deliver:
  (a) licence analysis of every bundled component (KiCad GPL, Freerouting GPL,
      arduino-cli, toolchains, emulators, ngspice, LLM weights, datasheets, board and
      part images, USB drivers) each classified as linked (compiled or linked into EmbedForge
      binaries or the web UI; shall be compatible with GPL-3.0-or-later) or aggregated
      (separate executables, runtimes, drivers, model weights, datasheets, images; shall
      permit redistribution with no conditions conflicting with SS-01 or SS-09), or a
      proposed replacement;
  (b) confirmation of x86-64 and arm64 builds for every component;
  (c) LLM model profiles, with benchmark results on a draft of the VAPP-06 corpus,
      limited to NL-02 question recall (VAPP-06 tag matching), schema-valid extraction
      under the grammar, and generation time, per candidate model and profile;
  (d) ELEGOO/SunFounder kit part inventory (EM-02) and initial parts catalogue;
  (e) curated code, symbol, footprint and datasheet sets, with redistribution status;
  (f) default fabrication profile;
  (g) installer and installed size per *host* OS;
  (h) confirmed or corrected PERF targets and VAPP-06 thresholds, and the DATA-04
      part limit checked against a hand-estimated ACC-02 BOM;
  (i) UI wireframes for UI-01..UI-23;
  (j) draft VAPP-06 corpus;
  (k) risk register and list of infeasible or conflicting requirements with proposed
      resolutions, seeded from the pre-Phase 0 review;
  (l) block-template library plan (LLM-05, LLM-06): template list covering EM-03 and
      the ACC projects, parameter schemas, and qualification suite;
  (m) emulator evaluation for RP2040 and RP2350 against EM-05 and EM-06, and a spike
      on time-accurate emulation of CPython for Raspberry Pi targets (virtual clock for
      sleep, GPIO callbacks and IIO devices);
  (n) active equivalents for every EM-03 or kit part that fails the *active* test
      (EM-02A);
  (o) parts-catalogue data sources and their redistribution terms (PC-01).
  STOP for my approval.
Increment 1: app shell, navigator, highlight bus, library browsers, accessibility
  (UI-01..03, UI-17, UI-20..23); packaging pipeline, signed offline installers,
  integrity check, recovery store (SS-01..05, SS-08, SEC-02); CM backbone and data
  formats (CM-01..04, CM-09, DATA-01..04); offline docs viewer (SS-07); host checks
  (HOST-04); self-diagnosis skeleton (DIAG-01).
Increment 2: Tier-1 board definitions (TB-01, TB-02, TB-04); detection, drivers,
  flashing, SSH and local deployment (BRD-01..03, SS-04, HOST-07(b), SEC-01);
  board manager view (UI-16).
Increment 3: LLM integration; NL workspace and clarification (UI-04, NL-01..03);
  block and behaviour views (UI-05, UI-06); code generation (CG-01..03, SEC-04);
  LLM-01..06 and the first block templates; board capability-gap detection (the
  shortfall report of TB-05, used by NL-02(h)); GPU acceleration (HOST-07(a)).
  ACC-01(a) and ACC-02(a) shall pass; VAPP-06 clarification threshold shall be met.
Increment 4: parts catalogue (PC-01..05); electrical design (ED-01..07, TB-05
  resolution options); pin,
  schematic and breadboard views (UI-07..09); safety rules (SAF-01..04); Fritzing
  import/export.
Increment 5: component models and emulation (EM-01..08, EM-02A, EMU-01, EMU-02); emulation
  dashboard (UI-11); firmware self-test (CG-04). ACC-02(d) shall pass.
Increment 6: PCB and perfboard layout (PCB-01..09, UI-10); HAT+ EEPROM programming
  (BRD-04); VER-08..15; hardware
  versioning (CM-08); optional KiCad advanced mode (SS-06).
Increment 7: documentation generator, lint, traceability (DOC-01..12); code view,
  verification dashboard, assembly guide, history, exports (UI-12..15, UI-19); status
  model (ST-01..09). ACC-01 and ACC-02 shall pass completely.
Increment 8: update manager online and USB, per-project pinning (LIB-02, CM-05..07, CM-10,
  SS-09, SS-10, SEC-03); model editor (EM-04); guided and expert modes (UI-18);
  VAPP-06 all thresholds met.
Increment 9: Tier-2 boards (TB-03) with their toolchains and emulators; extended
  component-model coverage.
For each increment:
  1. Restate scope and requirement IDs covered.
  2. Implement.
  3. Verify per TEST-01..03: run all tests, show evidence (commands, output,
     screenshots), check PERF targets reachable in the test environment, run
     VAPP-01..07 and ACC-01/02 as far as delivered features allow, and list what was
     not verified.
  4. Usability check: one scripted beginner scenario (guided mode) and one expert
     scenario, with task completion time and issues found.
  5. Deliver: signed offline installers, source, updated docs, changelog, test report,
     user-executed test procedures, version tag.
  6. STOP at the gate and wait for my approval before the next increment.

## 23. OUT OF SCOPE (unless I approve otherwise)
Mobile devices and macOS as *hosts*; PCBs with more than 4 layers; high-speed, RF or
impedance-controlled design; BGA and parts with pitch below 0.5 mm; ordering through
fabrication-house web APIs; designs above 24 V DC; mains-voltage (AC) circuits other
than switching through isolated catalogue relay modules with the mains side outside the
generated design; safety-certified designs; cloud accounts; telemetry.

## 24. BEFORE YOU START
The pre-Phase 0 review of v2 is complete and its decisions (D1–D8) are applied. The
review of v3 is complete and decision D9 (accept all proposed resolutions) is applied
in v3.1 (section 26). Decision D10 is applied in v3.2 (section 27). Decision D11 is applied in v3.3
(section 28). Decision D12 is applied in v3.4 (section 29). Decision D13 is applied in this version
(section 30). Before starting Phase 0, list any new ambiguity, conflict or offline
infeasibility introduced by the v3 changes, with a proposed resolution. Phase 0 is
authorised. Do not write application code until I approve Phase 0.

## 25. CHANGE LOG v2 → v3
Review findings are those of the pre-Phase 0 review; decisions D1–D8 were made by me.
| Finding | Decision | Change |
| --- | --- | --- |
| C-01 | D1 | ST-07 reworded: highest status whose conditions are all still met. |
| C-02 | D1 | *Build style* defined; ST-04 and ST-06 gates depend on build style; VER-14 added. |
| C-03 | D1 | *Code verified* defined; INV-06 uses it and adds VER-10. |
| C-04 | D1 | EM-04: user catalogue extension; LLM-01: approval covers code libraries only. |
| C-05 | D2 | *Kit part* defined; EM-02A added; EM-03 end-of-life parts replaced by *active* equivalents; Phase 0 (n). |
| C-06 | D3 | SS-05: narrow privileged helper; HOST-07(b) and section 21 use it. |
| C-07 | D4 | SS-01: signed bootstrap plus component packs ≤ 3.9 GB. |
| C-08 | D1 | SS-07: no redistribution of copyrighted standards; original summaries. |
| C-09 | D1 | INV-03 "retained baseline"; CM-09 protects pinned versions. |
| C-10 | D1 | VER-06: gate checks the human review record only. |
| C-11 | D1 | DOC-11 applies DOC-01..04, 06, 07, 10. |
| C-12 | D1 | Increment 3 includes TB-05 capability-gap detection. |
| C-13 | D1 | INV-08: edits are netlist commands; KiCad advanced-mode diff approval. |
| C-14 | D1 | CM-05(b): install-time check for app-level items. |
| C-15 | D1 | *Standard value* and PC-02: capacitors E6/E12 or stocked only. |
| A-01 | D1 | *Active* defined for *generic modules*. |
| A-02 | D1 | SAF-04 applies to net voltages. |
| A-03, A-04 | D1 | VER-01 and VER-02 severity and scope defined. |
| A-05 | D1 | LLM-04: 1 attempt plus 3 retries. |
| A-06 | D1 | BRD-01: ranked candidates confirmed by the user. |
| A-07 | D1 | PCB-03(b) measurement defined. |
| A-08, A-09 | D1 | UI-05 approval flow; UI-12 three-way merge. |
| A-10 | D1 | *Emulatable requirement*: target board counts as a part. |
| A-11 | D8 | NL-01: English input. |
| A-12 | D1 | TB-02: target Pi OS 64-bit Bookworm and Trixie. |
| A-13 | D1 | ACC-01 pass criteria added. |
| A-14, A-15 | D1 | ACC-02 question 8 and (c) per target; VAPP-06 matching and oracle defined. |
| A-16 | D8 | SAF-02 strict for every motor, servo, solenoid and relay. |
| A-17 | D1 | UI-19 raster-in-SVG allowed for 3D and animated views. |
| A-18 | D8 | HOST-01: Windows 10 kept (22H2); Ubuntu LTS range defined. |
| A-19 | D1 | DATA-02: migration is not conversion. |
| A-20 | D1 | PCB-01 HAT+ EEPROM note. |
| A-21 | D1 | BRD-02: Arduino-as-ISP only. |
| A-22 | D1 | SEC-01 passphrase-encrypted fallback. |
| F-01 | D6 | LLM-05 and LLM-06: deterministic design core; VAPP-06 thresholds per profile. |
| F-02 | D1 | SS-08 tiered integrity check. |
| F-03 | D1 | EM-05 standard and accurate modes; PERF-05 scope. |
| F-04 | D1 | TB-02 note on RP2350; Phase 0 (m). |
| F-05, F-06 | D1 | Section 21: KiCad 9+, WebView2, WebGL fallback. |
| F-07 | D4 | SS-01 optional packs. |
| F-08 | D1 | Phase 0 (o). |
| F-10 | D1 | EM-02 inventory classes. |
| F-11 | D1 | BRD-03 offline target dependencies. |
| F-12 | D6 | Full Tier 1 scope kept. |
| M-01 | D1 | CM-10 static update hosting (GitHub Releases). |
| M-02, M-07 | D7 | TEST-04 infrastructure, keys and hardware provided by me. |
| M-03 | D5 | GPL-3.0-or-later (section 21, Phase 0 (a)). |
| M-04 | D1 | SS-04 driver licence rule. |
| M-05 | D1 | DATA-04 project size limits. |
| M-06 | D8 | macOS out of scope (HOST-01, section 23). |
| M-08 | D1 | DOC-10 weak-word list is a configuration item. |
| Section E | D7 | TEST-01 uses GitHub Actions runners (Windows, Ubuntu, arm64). |
| F-09 | D1 | SS-07 parameter sheets carry reviewer and date. |

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

## 27. CHANGE LOG v3.1 → v3.2
Findings are those raised in Phase 0 (k) (docs/phase0/k_risk_register.md, section 2);
decision D10 (26 September 2026): accept all proposed resolutions.
| Finding | Decision | Change |
| --- | --- | --- |
| C3-11 | D10 | SS-01 and CM-10: pack files and release assets ≤ 1.9 GiB, same files online and on USB. |
| F3-06 | D10 | TEST-01: job split between hosted and self-hosted runners; TEST-04: public repository, self-hosted runners. |
| R-11 | D10 | Phase 0 (m): CPython time-virtualisation spike for Raspberry Pi targets. |

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

## 29. CHANGE LOG v3.3 → v3.4
Decision D12 (5 October 2026): exclude discontinued kit parts that have no successor.
| Finding | Decision | Change |
| --- | --- | --- |
| (n) MPR121 | D12 | EM-02: discontinued kit parts without an *active* equivalent of the same function and interface are excluded from the model library and the catalogue, listed in DOC-11, and raise an NL-02 clarification when named. Applies today to NXP MPR121. |

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
