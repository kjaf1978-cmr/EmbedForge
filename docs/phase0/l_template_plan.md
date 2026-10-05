# Phase 0 (l) — Block-template library plan (LLM-05, LLM-06)

- Baseline: prompt v3.3
- Version: 0.1.0 (5 October 2026)
- Status: draft. Human review record (DOC-12): pending.

## 1. Principle

Every artefact that matters for correctness — firmware, pin allocation, interface circuits,
schematic, layout — comes from deterministic generators fed by **qualified block templates**
and a rule engine (LLM-05). The LLM only selects templates and fills their parameters, always
as JSON that must match a fixed schema (constrained decoding). After that:

- Same template versions + same parameters → byte-identical output. This is the determinism
  test in §5.
- A request that no template covers is raised as NL-02(i). No code is improvised.

## 2. What a template is

Adding a template is a data-only operation (LLM-06). Each template is a versioned package
(CM-01, CM-07):

```
templates/<id>/<semver>/
  manifest.yaml        id, version, kind, summary, targets[], languages[], depends[], licence
  params.schema.json   JSON Schema: every parameter with type, unit, range, default, description
  interface.yaml       NL-03 ports: name, direction, type, unit, range, rate/timing, error codes, version
  resources.yaml       claims: pin capabilities, timers, PWM/ADC channels, bus + address, current per pin
  code/<lang>/*.j2     code fragments per language (C++, MicroPython, Python), *generated region* markers
  circuit/fragment.yaml  netlist fragment (hardware templates): parts by catalogue class, nets, value formulas
  calc.yaml            design calculations (e.g. RC cut-off, divider ratio, flyback rating) with references
  tests/unit/*         host unit tests with hardware mocks (VER-04)
  tests/emu/*.yaml     emulation scenarios: time-stamped stimuli + expected outputs (EM-07, VER-05)
  docs/*.md            text for DOC-03/04/05/09 (passes DOC-10 lint)
```

- **Template kinds:**
  - `logic`: firmware only.
  - `device`: firmware driver plus a circuit fragment for one part or module.
  - `interface`: circuit only, e.g. a level shifter or RC filter.
  - `integration`: the per-target main loop and scheduler, plus parameter-file binding.
- **Rendering:** templates render through a sandboxed template engine with no I/O and no
  execution. Imported templates are validated by schema (SEC-03) and may not carry executable
  content.

## 3. Template list (first release)

### 3.1 Logic templates (all targets)

| ID | Purpose | Key parameters | Used by |
|---|---|---|---|
| L-CMP | Compare two quantities with tolerance and hysteresis | tolerance, hysteresis, units, output on equal / greater / less | ACC-02 (A = B), ACC-01 (35 °C alarm) |
| L-THR | Threshold with hysteresis on one quantity | threshold, hysteresis, direction | ACC-01 alarm, fan on/off |
| L-EDGE | Edge / level detection on a boolean condition | edge (rising/falling/both), min interval | ACC-02 increment trigger |
| L-CNT | Counter | min, max, step, wrap or saturate, reset condition, persistence (none/EEPROM) | ACC-02 counter |
| L-MAP | Linear scaling with clamp | in range, out range, units | ACC-02 counter → PWM, motor speed |
| L-CTRL | Control law | mode (on/off, proportional, stepped table), range, hysteresis | ACC-01 fan law |
| L-AND/OR/TT | Boolean combination / truth table (from UI-06) | table | ACC-02 "C and D ON, E OFF" |
| L-SM | Table-driven state machine (from UI-06) | states, transitions, guards, actions | General |
| L-DEB | Debounce | time, sampling period | Digital inputs |
| L-FILT | Filter | moving average N, or first-order τ | Analog inputs |
| L-SCHED | Periodic task scheduler | period per task, priority | All projects |
| L-FAULT | Fault policy | on sensor failure / out of range: hold last, safe value, alarm; retry count | ACC-01 Q7 |
| L-FMT | Text/number formatting for displays | layout, units, decimals, refresh rate | ACC-01 LCD |
| L-SELFTEST | Power-on self-test (CG-04) | checks list, error codes | All projects |

### 3.2 Device templates (firmware driver + circuit fragment)

| Group | Templates |
|---|---|
| Digital in | Push-button/switch (pull, active level), 4×4 keypad, rotary encoder, PIR HC-SR501, IR receiver (NEC), tilt/limit switch |
| Analog in | Generic analog input (range, divider), potentiometer, LDR (divider calc), joystick, thermistor (β model) |
| Sensors | DHT11/DHT22, DS18B20 (1-Wire), HC-SR04, BME280/BMP280, ICM-42688-P, DS3231/DS1307, ADS1115 |
| Outputs | Digital out (LED + resistor calc), RGB LED, buzzer (active/passive tone), relay module (isolated, SAF-02), PWM out, PWM + RC analog out (ED-04c), MCP4725 DAC (ED-04c) |
| Motors | Servo (separate supply), DC motor via L298N / TB6612FNG / L293D / low-side MOSFET, stepper via ULN2003 / A4988 / DRV8825 |
| Displays | HD44780-compatible 16×2 with I²C backpack (TI PCF8574 MPN), SSD1306 OLED, 7-segment (direct or 74HC595), MAX7219 matrix |
| Expanders | PCF8574, MCP23017, 74HC595 |

### 3.3 Interface-circuit templates (ED-04)

- **Inputs:**
  - input protection (series R + clamp)
  - voltage divider
  - pull-up and pull-down resistors
  - I²C pull-ups (sized for bus capacitance)
- **Analog:** RC low-pass for PWM-DAC (cut-off and ripple calculation)
- **Level shifting:** level shifter, either BSS138BK per channel or TXS0108E
- **Load drivers:**
  - low-side MOSFET with flyback diode
  - NPN transistor driver
- **Power:**
  - separate load supply with common ground (SAF-02)
  - decoupling per IC (PCB-03(b))
  - power entry with reverse-polarity protection

### 3.4 Integration templates (per target)

| Target | Runtime pattern |
|---|---|
| AVR (Uno, Nano, Mega), Arduino core C++ | Cooperative `loop()` scheduler (L-SCHED), `millis()` time base, parameter header in a generated region |
| Pico, Arduino-Pico C++ | Same as AVR; optional second core not used in the first release |
| Pico, MicroPython | `machine.Timer` / asyncio scheduler, parameters module in a generated region |
| Raspberry Pi, Python | asyncio + gpiozero (lgpio pin factory), systemd service, parameters YAML |

**Total:** about 14 logic + 35 device + 12 interface + 4 integration ≈ **65 templates**.

## 4. ACC coverage

| ACC requirement | Templates |
|---|---|
| ACC-01 Uno shield | DHT22, L-SCHED, L-FAULT, L-THR (alarm), L-CTRL (fan), PWM out + low-side MOSFET + flyback + separate supply, HD44780 I²C + L-FMT, digital out (LED), L-SELFTEST, decoupling, power entry |
| ACC-01 HAT+ variant | Same, Python integration, DHT22 via IIO overlay (A3-08), level shifter for the 5 V backpack (Q8), HAT+ EEPROM (BRD-04) |
| ACC-02 (Uno/Mega/Pico) | Analog in ×2 + input protection, L-CMP (A = B), digital in ×3 + L-DEB, L-TT (C·D·¬E), L-EDGE, L-CNT, L-MAP, PWM out, DC motor via TB6612FNG or L298N + separate supply, digital out (U, V), W via PWM + RC or MCP4725 (Q8), L-SELFTEST |

Every ACC question in NL-02 maps to a parameter of one of these templates. That is how the
clarification questions and proposed defaults are generated: a missing required parameter,
or one whose value is not inside its schema range, becomes a question.

## 5. Qualification suite (LLM-06)

A template is enabled only if all the checks below pass, for every target it declares.

| # | Check | Gate mapping |
|---|---|---|
| Q1 | Package schema valid; manifest, params, interface and resources consistent | SEC-03 |
| Q2 | Render with defaults and with boundary parameter sets (min, max, typical) | — |
| Q3 | **Determinism:** two renders → byte-identical | LLM-05 |
| Q4 | Compile, zero warnings at the VER-01 level (C++, mpy-cross, py_compile) | VER-01 |
| Q5 | Static analysis, no high-severity finding | VER-02 |
| Q6 | Host unit tests with mocks pass | VER-04 |
| Q7 | Emulation scenarios pass on every declared board with a qualified emulator. Boards without one: scenarios marked HIL-pending (Pico 2, per (m)) | VER-05 |
| Q8 | Resource claims consistent with each declared board definition | VER-10 |
| Q9 | Circuit fragment passes ERC (ED-03), calculations reproduced from calc.yaml, all parts *standard* | VER-03, VER-13 |
| Q10 | Documentation text passes DOC-10 lint | DOC-10 |
| Q11 | **Pair tests:** template combined with the integration template and with every other template it declares compatible, compiled and emulated | CG-02 |
| Q12 | Human review record of the template package (DOC-12) | DOC-12 |

Q1–Q11 run in CI per template and per target. A change to any template re-runs Q1–Q11 for
the templates that depend on it.

## 6. Delivery plan

| Increment | Templates |
|---|---|
| 3 | All logic templates; integration templates; device templates needed by ACC-01/02; NL-02 question generation from parameter schemas |
| 4 | Interface-circuit templates; circuit fragments of the device templates; remaining EM-03 device templates |
| 5 | Emulation scenarios Q7 for all templates; self-test template |
| 8–9 | Template editor; Tier-2 targets |

## 7. Risks

- **Combinatorial growth of pair tests (Q11).** Mitigation: templates talk only through NL-03
  interfaces, and pair tests are limited to declared compatibilities.
- **Coverage gap for free-form descriptions (R-23).** Mitigation: measure on the VAPP-06
  corpus (j), with NL-02(i) as the honest fallback.
- **Pico 2 emulation unavailable.** Templates declaring Pico 2 can be enabled with Q7
  HIL-pending, per TB-02.
