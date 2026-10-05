# Phase 0 (e) — Curated code, symbol, footprint and datasheet sets

- Baseline: prompt v3.4
- Version: 0.1.0 (5 October 2026)
- Status: draft. Desk research only; this is not legal advice. Human review record (DOC-12): pending.

**Method.** Licences come from each repository's LICENSE file, or from source headers where no
LICENSE file exists, read from shallow git clones on 5 October 2026. Versions are taken from
`library.properties`, git tags or PyPI. "Released" is the commit date of the latest tag (or the
PyPI upload date). github.com web pages, bitbucket.org, gitlab.com, kicad.org and
datasheets.raspberrypi.com were refused by the proxy. These refusals were not worked around.
KiCad libraries were read from the Ubuntu archive tarballs (symbols/footprints/3D 10.0.5,
templates 10.0.0). **UNVERIFIED** means the primary source was not readable.

**Licence model (D9).** Code libraries are *aggregated* into EmbedForge, shipped as source in
the LIB-01 cache. They are compiled only into the **user's** firmware, so they impose nothing
on EmbedForge's GPL-3.0-or-later. A user who distributes firmware must:
- **MIT/BSD/Apache:** keep the notices. Apache-2.0 also needs the licence text.
- **LGPL:** allow relinking (object files or source). The Arduino AVR core and Arduino-Pico
  core are already LGPL-2.1, so LGPL libraries add no new kind of obligation.
- **GPL-only:** release the whole firmware under GPL. These libraries are **avoided where an
  alternative exists**.

## 1. Code libraries (LIB-01)

### 1.1 Selected libraries

| # | Library (platform) | Repo | Version · released | SPDX (source) | Arch notes |
|---|---|---|---|---|---|
| A1 | DHT sensor library (C++) | github.com/adafruit/DHT-sensor-library | 1.4.7 · 2026-02-26 | MIT (license.txt) | arch `*`; needs A2 |
| A2 | Adafruit Unified Sensor (C++) | adafruit/Adafruit_Sensor | 1.1.15 · 2025-01-06 | Apache-2.0 (LICENSE.txt) | header only |
| A3 | Adafruit BusIO (C++) | adafruit/Adafruit_BusIO | 1.17.4 · 2025-09-22 | MIT | dependency of A5, A6, A8 |
| A4 | DallasTemperature (C++) | milesburton/Arduino-Temperature-Control-Library | 4.0.6 · 2026-02-13 | MIT | needs A4b |
| A4b | OneWire (C++) | PaulStoffregen/OneWire | 2.3.8 · 2024-02-08 | MIT-style + Dallas notice (header only, no LICENSE file) | arch `*` |
| A5 | Adafruit BME280 (C++) | adafruit/Adafruit_BME280_Library | 2.3.0 · 2025-04-30 | BSD-3-Clause (LICENSE) | needs A2, A3 |
| A6 | Adafruit BMP280 (C++) | adafruit/Adafruit_BMP280_Library | 3.0.0 · 2026-01-13 | MIT (LICENSE.txt) | needs A2, A3 |
| A7 | ICM42688 (C++) | finani/ICM42688 | 1.1.0 · 2023-01-11 (last commit 2024-07-01) | MIT | **low maintenance**; own driver is the fallback |
| A8 | RTClib (C++) — DS1307, DS3231 | adafruit/RTClib | 2.1.4 · 2024-04-09 | MIT | needs A3 |
| A9 | ADS1X15 (C++) | RobTillaart/ADS1X15 | 0.6.2 · 2026-04-20 | MIT | no dependencies (smaller on AVR than Adafruit + BusIO) |
| A10 | MCP4725 (C++) | RobTillaart/MCP4725 | 0.4.3 · 2026-01-16 | MIT | no dependencies |
| A11 | PCF8574 (C++) | RobTillaart/PCF8574 | 0.4.5 · 2026-05-08 | MIT | no dependencies |
| A12 | MCP23017_RT (C++) | RobTillaart/MCP23017_RT | 0.9.3 · 2026-04-18 | MIT | no dependencies |
| A13 | LiquidCrystal_PCF8574 (C++) | mathertel/LiquidCrystal_PCF8574 | 2.3.0 · 2026-02-22 | BSD-3-Clause | arch `*` |
| A14 | U8g2 (C++) — SSD1306 | olikraus/u8g2 | 2.37.1 · 2026-05-26 | BSD-2-Clause for code; fonts per group | On AVR use page-buffer or U8x8 mode: Adafruit_SSD1306 allocates WIDTH×HEIGHT/8 bytes (1 KB at 128×64, half the Uno's RAM). Ship only X11-group fonts (marked public domain on the u8g2 wiki) |
| A15 | IRremote (C++) | Arduino-IRremote/Arduino-IRremote | 4.7.1 · 2026-04-08 | MIT | rp2040 listed in architectures |
| A16 | Servo (C++, AVR) | arduino-libraries/Servo | 1.3.0 · 2025-11-06 | LGPL-2.1 | arch list **excludes** Arduino-Pico; Pico uses the core's Servo (LGPL-2.1-or-later, Arduino-Pico 6.2.0 · 2026-09-30) |
| A17 | Stepper (C++) — ULN2003 | arduino-libraries/Stepper | 1.1.3 · 2016-03-08 (commit 2026-07-01) | LGPL-2.1 | stable |
| A18 | StepperDriver (C++) — A4988, DRV8825 | laurb9/StepperDriver | 1.6.0 · 2026-07-17 | MIT | replaces AccelStepper |
| A19 | LedControl (C++) — MAX7219 | wayoda/LedControl | 1.0.6 · 2015-04-03 | MIT | **stale**; includes `avr/pgmspace.h` (Arduino-Pico ships a compatible header). Alternative: MD_MAX72XX 3.5.1, LGPL-2.1 |
| M1 | dht, onewire, ds18x20, neopixel (MicroPython, frozen in the rp2 port) | micropython/micropython-lib | v1.29.0 · 2026-08-17 | MIT | built in, no install |
| M2 | ssd1306 (MicroPython) | micropython-lib `micropython/drivers/display/ssd1306` | 0.1.0 (lib v1.29.0) | MIT (repo default; no module licence field) | uses framebuf |
| M3 | python_lcd: lcd_api + machine_i2c_lcd (MicroPython) | dhylands/python_lcd | no tags · last commit 2023-02-16 | MIT | stale but small |
| M4 | BME280 (float), also BMP280 (MicroPython) | robert-hh/BME280 | no tags · 2025-06-15 | MIT (LICENSE embeds the MIT text) | — |
| M5 | ads1x15 (MicroPython) | robert-hh/ads1x15 | no tags · 2025-09-17 | MIT (file header; no LICENSE file) | — |
| M6 | micropython_ir (NEC receiver) | peterhinch/micropython_ir | no tags · 2026-04-27 | MIT | — |
| M7 | max7219 (MicroPython) | mcauser/micropython-max7219 | no tags · 2018-11-11 | MIT | stale; small enough to vendor and maintain |
| P1 | gpiozero (+ lgpio pin factory) (Pi Python) | gpiozero/gpiozero | 2.0.1.post3 · 2026-07-27 | BSD-3-Clause; lgpio 0.2.2.0 Unlicense (PyPI) | already in (a) |
| P2 | smbus2 (Pi Python) | kplindegaard/smbus2 | 0.6.1 · 2026-04-09 | MIT | carries all own I²C drivers |
| P3 | RPLCD (Pi Python) | dbrgn/RPLCD | 1.4.0 · 2025-03-29 | MIT | I²C via smbus2 |
| P4 | luma.oled (+ luma.core 2.6.0 MIT, Pillow 12.3.0 MIT-CMU, spidev 3.8 MIT) (Pi Python) | rm-hull/luma.oled | 3.16.0 · 2026-10-03 | MIT | Pillow is the largest dependency |
| P5 | luma.led_matrix (Pi Python) | rm-hull/luma.led_matrix | 1.9.0 · 2026-02-01 | MIT | MAX7219 |
| P6 | evdev (Pi Python) | gvalkov/python-evdev | 2.0.0 · 2026-08-23 | BSD-3-Clause | IR via kernel `gpio-ir` overlay |

### 1.2 Choice per device template (§3.2 of (l))

"Own" means own driver in the template. Own drivers are GPL-3.0-or-later template code. They
need a decision: templates emit code into the user's project, so a permissive licence for
emitted code (e.g. MIT) is recommended. This is **open question Q-E1**.

| Template | Arduino C++ (AVR + Arduino-Pico) | MicroPython (Pico) | Python (Pi) |
|---|---|---|---|
| Button / switch / tilt / limit | Own | Own (`machine.Pin`) | P1 Button |
| 4×4 keypad | Own (Keypad is GPL-3.0) | Own | Own on P1 |
| Rotary encoder | Own (PaulStoffregen/Encoder is MIT 1.4.4, but has no Pico interrupt mapping) | Own (IRQ) | P1 RotaryEncoder |
| PIR HC-SR501 | Own | Own | P1 MotionSensor |
| IR receiver (NEC) | A15 | M6 | Kernel `gpio-ir` + P6 |
| Analog in / pot / LDR / joystick / thermistor | Own (`analogRead`) | Own (`machine.ADC`) | Pi has no ADC → requires ADS1115 + own driver on P2 |
| DHT11/DHT22 | A1 (+A2) | M1 `dht` | Kernel dht11 IIO overlay, no library (ACC-01) |
| DS18B20 | A4 + A4b | M1 `onewire` / `ds18x20` | Kernel w1-gpio + own sysfs read (alternative: w1thermsensor 2.3.0, MIT, released 2023-09-27) |
| HC-SR04 | Own (`pulseIn`; NewPing excluded, §4) | Own (`time_pulse_us`) | P1 DistanceSensor |
| BME280 / BMP280 | A5 / A6 | M4 | Own on P2 (RPi.bme280 0.2.4 is stale, 2021) |
| ICM-42688-P | A7 | Own | Own on P2 |
| DS3231 / DS1307 | A8 | Own | Own on P2 (or kernel `i2c-rtc` for timekeeping) |
| ADS1115 | A9 | M5 | Own on P2 |
| Digital out, LED, RGB LED, PWM, PWM + RC | Own (core) | Own (`machine.PWM`) | P1 LED / PWMLED / RGBLED |
| Buzzer | Own (core `tone()`) | Own (PWM) | P1 Buzzer / TonalBuzzer |
| Relay module | Own | Own | P1 OutputDevice |
| MCP4725 | A10 | Own | Own on P2 |
| Servo | A16 / core Servo (Pico) | Own (PWM) | P1 AngularServo (software-PWM jitter; hardware-PWM overlay option) |
| DC motor (L298N, TB6612FNG, L293D, MOSFET) | Own (SparkFun TB6612 library is MIT but AVR-only and last changed 2019) | Own | P1 Motor / PWMOutputDevice |
| Stepper ULN2003 | A17 | Own | Own on P1 |
| Stepper A4988 / DRV8825 | A18 | Own | Own on P1 |
| HD44780 16×2 + PCF8574 backpack | A13 | M3 | P3 |
| SSD1306 | A14 | M2 | P4 |
| 7-segment (direct / 74HC595) | Own (`shiftOut`) | Own | Own on P1 |
| MAX7219 | A19 | M7 | P5 |
| PCF8574 | A11 | Own | Own on P2 |
| MCP23017 | A12 | Own | Own on P2 |
| 74HC595 | Own | Own | Own on P1 |

## 2. Symbols, footprints, 3D, board templates (KiCad 10)

Licence: CC-BY-SA-4.0 with the design exception (LICENSE.md, read in the templates tarball).
Our own additions are CC-BY-SA-4.0. The libraries read are 10.0.5 (Ubuntu). (a) cites KiCad
10.0.6, so the pin must be re-checked against the 10.0.6 library tags (gitlab.com was refused).

### 2.1 Coverage of EM-03 parts

| Part | Symbol | Footprint | 3D |
|---|---|---|---|
| R, C, pot, LED, RGB LED, diode, BJT, MOSFET (AO3400A, IRLZ44N, IRLB8721PBF), buzzer, thermistor | Device / Transistor_* | Resistor_*, Capacitor_*, Potentiometer_*, LED_*, Buzzer_Beeper | yes (spot-checked) |
| Push-button, reed, slide, tilt | Switch | Button_Switch_* | yes |
| Relay (Songle-type SRD) | Relay:SANYOU_SRD_Form_C | Relay_THT | yes |
| Opto-coupler, LM1117, BSS138, TXS0108EPW | Isolator, Regulator_Linear, Transistor_FET, Logic_LevelTranslator | standard packages | yes |
| DC motor, servo, unipolar/bipolar stepper | Motor | via connectors | n/a |
| L298N, L293D, TB6612FNG, ULN2003A | Driver_Motor, Transistor_Array | TO-220-15 / DIP-16 / SSOP-24 | DIP-16 and SSOP-24 present |
| A4988, DRV8825 (Pololu carrier) | Driver_Motor:Pololu_Breakout_* | Module:Pololu_Breakout-16 | **referenced model missing** |
| HD44780 16×2 (parallel) | Display_Character:WC1602A, LCD-016N002L | Display | yes |
| SSD1306 | Display_Graphic:OLED-128O064D | Display:Adafruit_SSD1306 (Adafruit pinout only) | yes |
| 7-segment, 4-digit | Display_Character (KCSA02, CA56-12…) | Display_7Segment | partial |
| DHT11, DHT22/AM2302 (bare) | Sensor:DHT11, Sensor:AM2302 | Sensor | DHT11 yes; AM2302 no |
| DS18B20 | Sensor_Temperature | TO-92 | yes |
| BME280 / BMP280 (chip) | Sensor / Sensor_Pressure | Package_LGA:Bosch_LGA-* | yes |
| ICM-42688-P (chip) | **missing** (Sensor_Motion has MPU-6050, ICM-20602…) | LGA-14 3×2.5 mm exists (pads to check) | yes |
| DS1307, DS3231M, MCP4725, ADS1115, PCF8574, MCP23017, 74HC595, MAX7219 | Timer_RTC, Analog_DAC, Analog_ADC, Interface_Expansion, 74xx, Driver_LED | standard packages | yes |
| IR receiver (TSOP) | Interface_Optical:TSOP3xxxx | Vishay MOLD | yes |
| LDR | Sensor_Optical:LDR03/07 | OptoDevice:R_LDR_* | not checked |
| Rotary encoder (bare EC11) | Device:RotaryEncoder_Switch | Rotary_Encoder (Alps EC11E) | no |
| HC-SR04, HC-SR501, keypad, joystick, all breakout **modules** | **missing** | **missing** | **missing** |

### 2.2 Tier-1 boards and templates

| Board | Symbol | Footprint | KiCad project template |
|---|---|---|---|
| Uno R3 | MCU_Module:Arduino_UNO_R3 | Module:Arduino_UNO_R3 (3D model referenced but missing) | **Arduino_Uno** shield |
| Nano | Arduino_Nano_v3.x | Module:Arduino_Nano | Arduino_Nano |
| Mega 2560 | **missing** | **missing** | **Arduino_Mega** shield (generic connectors) |
| Pico / Pico W | RaspberryPi_Pico(_W) | RaspberryPi_Pico_* (3D yes) | none → own carrier template |
| Pico 2 / Pico 2 W | **missing** (derive from the Pico symbol; same pinout) | reuse Pico | — |
| Pi 5 / 4B / 3B+ | Connector:Raspberry_Pi_4 / _2_3 (40-pin) | via PinSocket 2×20 | **RaspberryPi-HAT** (legacy HAT; CAT24C256 ID EEPROM; info.html lists Pi 1–4 only) |
| Zero 2 W | same 40-pin | Module:Raspberry_Pi_Zero_Socketed | RaspberryPi-uHAT |

**HAT+.** No official Raspberry Pi KiCad HAT+ template was found. raspberrypi/hats is
deprecated (BSD-3, docs only, last commit 2023-12-19). The community template
MisterHW/RPi5-HATplus is CERN-OHL-S-2.0 and **strongly reciprocal**: it would bind users' board
designs, so it is **not used**. Proposal: an own HAT+ template derived from KiCad's
RaspberryPi-HAT and checked against the HAT+ specification (CC BY-ND, bundled). EEPROM per
BRD-04.

### 2.3 Own-made items (CC-BY-SA-4.0), estimate

| Item | Symbols | Footprints | 3D |
|---|---|---|---|
| 22 modules: HC-SR04, HC-SR501, IR receiver module, LCD1602 + I²C backpack, SSD1306 0.96″ I²C module, DHT11 module, DHT22 module, BME280/BMP280 breakout, ICM-42688-P breakout, DS3231 (ZS-042), DS1307 module, ADS1115, MCP4725, PCF8574, MCP23017 modules, MAX7219 matrix, L298N module, TB6612FNG breakout, ULN2003 board, relay module, joystick, KY-040 encoder | 22 | 22 | 22 |
| ICM-42688-P chip | 1 | (reuse) | — |
| Pico 2, Pico 2 W | 2 | (reuse) | — |
| Mega 2560 R3 | 1 | 1 | 1 |
| Missing 3D models (Uno R3, Nano, Pololu carrier, AM2302) | — | — | 4 |
| Templates: HAT+, Pico carrier | — | — | 2 projects |
| **Total** | **26** | **23** | **27** (+2 templates) ≈ **78 items** |

Module pinouts vary by vendor. Each module footprint needs a pin-order variant parameter
measured from samples (TEST-02).

## 3. Datasheets (SS-07, F0-09)

Bundle = **yes** only for Raspberry Pi Ltd documents, CC BY-ND 4.0 per their colophon. Of
these, (a) verified the colophon only for the RP2040 hardware design guide and the HAT+
specification; the others are UNVERIFIED (datasheets.raspberrypi.com was refused). Everything
else gets a **parameter sheet + URL**. URLs are product pages, not fetched in this pass; check
them at catalogue curation.

| Part | Manufacturer | URL | Bundle? |
|---|---|---|---|
| RP2040, RP2350, Pico, Pico W, Pico 2, Pico 2 W | Raspberry Pi Ltd | datasheets.raspberrypi.com (rp2040/, rp2350/, pico/, picow/) | **Yes** (colophon check pending) |
| Pi 5, Pi 4B, Pi 3B+, Zero 2 W product briefs; HAT+ spec | Raspberry Pi Ltd | datasheets.raspberrypi.com (rpi5/, rpi4/, rpi3/, rpi-zero-2-w/, hat/) | **Yes** (HAT+ verified in (a)) |
| Uno R3, Nano, Mega 2560 boards | Arduino | docs.arduino.cc/hardware/… | Parameter sheet + URL (Arduino docs are CC-BY-SA; F0-09 still applies → Q-E2) |
| ATmega328P, ATmega2560, MCP4725, MCP23017 | Microchip | microchip.com/en-us/product/<MPN> | Parameter sheet + URL |
| ADS1115, PCF8574/A, L293D, ULN2003A, DRV8825, SN74HC595, TXS0108E, LM1117 | TI | ti.com/product/<MPN> | Parameter sheet + URL |
| L298 | ST | st.com/en/motor-drivers/l298.html | Parameter sheet + URL |
| TB6612FNG | Toshiba | toshiba.semicon-storage.com (TB6612FNG) | Parameter sheet + URL |
| A4988 | Allegro | allegromicro.com (A4988) | Parameter sheet + URL |
| DS18B20, DS1307, DS3231, MAX7219 | ADI (Maxim) | analog.com/en/products/<part>.html | Parameter sheet + URL |
| BME280, BMP280 | Bosch Sensortec | bosch-sensortec.com/products/environmental-sensors/ | Parameter sheet + URL |
| ICM-42688-P | TDK InvenSense | invensense.tdk.com/products/motion-tracking/6-axis/icm-42688-p/ | Parameter sheet + URL |
| DHT11, DHT22/AM2302 | Aosong (ASAIR) | asairsensors.com | Parameter sheet + URL |
| SSD1306 | Solomon Systech | solomon-systech.com | Parameter sheet + URL |
| TSOP38238 | Vishay | vishay.com (TSOP382) | Parameter sheet + URL |
| BSS138BK | Nexperia | nexperia.com/products/…/BSS138BK | Parameter sheet + URL |
| AO3400A / IRLZ44N (ACC-01 MOSFET, MPN to choose) | Alpha & Omega / Infineon | aosmd.com / infineon.com | Parameter sheet + URL |
| HD44780-compatible 16×2 + backpack | generic (controller ST7066U/SPLC780D/KS0066, UNVERIFIED) | module vendor page | Generic-module parameter sheet |
| HC-SR04, HC-SR501 (BISS0001), KY-040, joystick, 4×4 keypad, relay module (SRD-05VDC), SG90 servo, 28BYJ-48, buzzer, LDR (GL55xx), LEDs, 7-segment | generic / unidentifiable | vendor page if any | Generic-module parameter sheet (D9 rule) |
| Resistors, capacitors, diodes (1N4148/1N400x/1N5819), BJTs, opto-coupler (PC817-type), DC motor, fan | generic / multi-source | representative MPN page | Parameter sheet |

About **45** EM-03/ACC part entries plus **11** Raspberry Pi Ltd documents. Only the Raspberry
Pi set is bundled.

## 4. Summary

**Libraries per platform**
- **Arduino C++:** 20 packages (A1–A19 with A4b). Arduino-Pico Servo comes from the core.
- **MicroPython:** 4 frozen modules (M1) + 6 external (M2–M7).
- **Pi Python:** 6 direct (P1–P6) + 4 dependencies (lgpio, luma.core, Pillow, spidev).
- **Own drivers:** 44 of 84 template × platform cells.

**Licence mix:** MIT 27, BSD 5, Apache-2.0 1, LGPL 3 (Servo ×2, Stepper), MIT-CMU 1, Unlicense
1, GPL **0**.

**GPL-flagged or excluded, with alternatives**

| Library | Licence (source) | Alternative |
|---|---|---|
| Keypad (Chris--A) 3.1.1 | GPL-3.0 (LICENSE) | Own driver |
| AccelStepper 1.64 | GPL-3.0 or commercial (LICENSE) | StepperDriver (MIT), Stepper (LGPL) |
| hd44780 (duinoWitchery) 1.3.2 | GPL-3.0 (licenseInfo.txt) | LiquidCrystal_PCF8574 (BSD-3) |
| NewPing | GPL-3.0 per a third-party mirror header; primary (bitbucket) refused → UNVERIFIED | Own `pulseIn` driver |
| LiquidCrystal_I2C (johnrickman / marcoschwartz) 1.1.4 | No LICENSE, no header licence → not redistributable | LiquidCrystal_PCF8574 |
| Adafruit NeoPixel 1.15.5 (WS2812, kit part) | LGPL-3.0 (COPYING) | Acceptable when a WS2812 template is added; MicroPython uses the built-in `neopixel` |

**KiCad gaps:** about 78 own-made items: 26 symbols, 23 footprints, 27 3D models, plus 2
project templates (§2.3). Covered by KiCad: every bare EM-03 IC except ICM-42688-P, and the
Uno/Nano/Pico boards and the Uno/Mega/Nano/HAT/uHAT templates.

**Risks** (propose adding to (k))
- Stale libraries: A7 (2023), A19 (2015), M3 (2023), M7 (2018). Mitigation: vendor a pinned
  copy; own-driver fallback qualified in Q4–Q7.
- U8g2 fonts carry mixed licences. Mitigation: X11 fonts only.
- Breakout pinouts vary between vendors (§2.3).
- No HAT+ template exists; the KiCad HAT template predates Pi 5.
- KiCad 10.0.5 vs 10.0.6 pin.
- The emitted-code licence of own drivers is undecided (Q-E1).

**Questions**
- **Q-E1:** Licence of code emitted from templates. Recommended: MIT, so users' firmware is
  unencumbered.
- **Q-E2:** Bundle Arduino board docs (CC-BY-SA) as an exception to F0-09?

**UNVERIFIED**
- NewPing licence (primary source).
- Raspberry Pi document colophons other than the RP2040 hardware design guide and the HAT+
  spec.
- KiCad 10.0.6 library contents.
- Datasheet URLs (not fetched).
- RP2040 runtime behaviour of A1, A7, A13, A19. All are declared arch `*`; Q4/Q7 will confirm.

**Sources**
- Git clones (5 October 2026) of every repository named in §1 and §4 tables (github.com/<owner>/<repo>), plus olikraus/u8g2.wiki (fntgrp, fntgrpx11), bolderflight/invensense-imu (no ICM-42688 support), raspberrypi/hats, MisterHW/RPi5-HATplus.
- pypi.org JSON for all P-packages and dependencies, w1thermsensor, RPi.bme280.
- NewPing header: raw.githubusercontent.com/eduherminio/NewPing (third-party mirror).
- KiCad: archive.ubuntu.com/ubuntu/pool/universe/k/ (kicad-symbols, -footprints, -packages3d 10.0.5; kicad-templates 10.0.0).
- **Refused, not bypassed:** github.com web pages, bitbucket.org, gitlab.com, kicad.org, downloads.arduino.cc, datasheets.raspberrypi.com, deb.debian.org.
