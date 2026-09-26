# Phase 0 (d) — ELEGOO and SunFounder kit inventory (EM-02)

- Baseline: prompt v3.3
- Version: 0.1.0 (26 September 2026)
- Status: draft; desk research only. Human review record (DOC-12): pending.

**Evidence rule:** only the vendors' own pages and docs were used (elegoo.com and its regional
stores; sunfounder.com; docs.sunfounder.com), plus manufacturer pages for lifecycle flags.
Where a list could not be read, the item is marked UNVERIFIED; contents were not guessed.

## 1. Frozen kit list (proposed)

| Code | Kit | Vendor | SKU | Platform | URL | Checked | Fetch status |
|---|---|---|---|---|---|---|---|
| E3 | UNO R3 Super Starter Kit | ELEGOO | SPUK-EL-KIT-003 | Arduino (UNO R3 clone) | https://www.elegoo.com/products/elegoo-uno-r3-super-starter-kit | 2026-09-26 | **Partial**: page text names only some parts; packing list is an image |
| E1 | UNO R3 Most Complete Starter Kit (V2.0, "63 items") | ELEGOO | EL-KIT-001 | Arduino (UNO R3 clone) | https://www.elegoo.com/products/elegoo-uno-most-complete-starter-kit | 2026-09-26 | **Partial**: as E3 |
| E8 | Mega 2560 The Most Complete Starter Kit | ELEGOO | EL-KIT-008 | Arduino (MEGA2560 clone) | https://www.elegoo.com/products/elegoo-mega-2560-the-most-complete-starter-kit | 2026-09-26 | **Partial**: as E3 |
| SE | Elite Explorer Kit (with Arduino UNO R4 WiFi) | SunFounder | CN0531D | Arduino | https://docs.sunfounder.com/projects/elite-explorer-kit/en/latest/components/00_component_list.html | 2026-09-26 | Full component list (no quantities); PDF list not machine-readable |
| S3 | 3-in-1 Super Starter Kit (with Arduino UNO R4 Minima) | SunFounder | CN0423D | Arduino | https://docs.sunfounder.com/projects/3in1-kit-r4/en/latest/components/component_list.html | 2026-09-26 | Full component list (no quantities) |
| SU | Ultimate Sensor Kit (with Arduino UNO R4 Minima) | SunFounder | CN0422D | Arduino | https://docs.sunfounder.com/projects/ultimate-sensor-kit/en/latest/components_basic/00-component_list.html | 2026-09-26 | Full list; PDF list partly readable |
| UM | Universal Maker Sensor Kit (no board) | SunFounder | CN0450D | Arduino / Raspberry Pi / Pico W / ESP32 | https://docs.sunfounder.com/projects/umsk/en/latest/01_components_basic/00-component_list.html | 2026-09-26 | Full component list |
| SR | Raphael Kit — Raspberry Pi Ultimate Starter Kit (no Pi) | SunFounder | CN0348D | Raspberry Pi 5/4B/3B+/3B/Zero 2 W | https://docs.sunfounder.com/projects/raphael-kit/en/latest/component.html | 2026-09-26 | Full component list (no quantities) |
| SEU | Euler Kit — Raspberry Pi Pico Ultimate Starter Kit | SunFounder | CN0359D | Raspberry Pi Pico | https://docs.sunfounder.com/projects/euler-kit/en/latest/component/what_is_included_in_this_kit.html | 2026-09-26 | Full component list (no quantities) |
| SK | Kepler Kit — Raspberry Pi Pico W Ultimate Starter Kit | SunFounder | CN0412D | Raspberry Pi Pico W | https://docs.sunfounder.com/projects/kepler-kit/en/latest/component/what_is_included_in_this_kit.html | 2026-09-26 | Full component list (no quantities) |

Product/SKU pages (all checked 2026-09-26): SunFounder SKUs come from the store's product data at
sunfounder.com/products/… (sunfounder-elite-explorer-kit-with-official-arduino-uno-r4-wifi,
sunfounder-3-in-1-ultimate-starter-kit-with-original-arduino-uno-r4-minima,
sunfounder-ultimate-sensor-kit-with-original-arduino-uno-r4-minima,
sunfounder-universal-maker-sensor-kit, raphael-kit, sunfounder-euler-kit,
sunfounder-raspberry-pi-pico-w-ultimate-starter-kit). ELEGOO SKUs come from the elegoo.com product data.

**Candidates considered and left out (for review):**
- ELEGOO UNO Basic Starter Kit (SPUK-EL-KIT-004): page names no modules ("all the basic
  components"); nothing to verify. Add only if the list can be read from the tutorial PDF.
- ELEGOO Raspberry Pi kit: none on the current ELEGOO store or download centre. A legacy
  "Raspberry Pi 3 Model B Basic Starter Kit" appears only on an old staging host that could not
  be fetched. Result: **no ELEGOO Raspberry Pi kit** in scope.
- SunFounder Da Vinci Kit (Raspberry Pi starter): the component list page is an image; UNVERIFIED.
- SunFounder 3in1 Kit (UNO R3 version) and 3in1 v2: superseded by the R4 version (S3) in the docs.
- SunFounder Thales Kit (Pico): not checked in this pass.

**Kit revisions:** E1 is the "V2.0" kit per the ELEGOO tutorial page. SunFounder docs give no
hardware revision (Euler and Kepler docs are "1.0"). The Elite Explorer list names both a GY-87
module and a "10 Axis IMU module"; which one ships now is UNVERIFIED.

## 2. Unique parts

Kit codes as in section 1. ELEGOO rows contain only parts named in the product text; the full
ELEGOO contents are UNVERIFIED (section 4). Classes: *full model* = deterministic electrical or
protocol behaviour that can be modelled and qualified; *behavioural stub* = coarse model with a
user-driven value and no physical fidelity; *not emulated* = radio, camera, audio playback.

| Part | Kits | Main IC | Interface | Emulation class | In EM-03? | Lifecycle flag | Notes |
|---|---|---|---|---|---|---|---|
| ELEGOO UNO R3 board | E3, E1 | Microchip ATmega328P (+ USB bridge UNVERIFIED) | Board | Full model (board) | n/a (board) | Not checked | Target board; covered by board model scope, not EM-03 |
| ELEGOO MEGA2560 R3 board | E8 | Microchip ATmega2560 | Board | Full model (board) | n/a (board) | Not checked | Target board |
| Arduino UNO R4 WiFi | SE | Renesas RA4M1 + Espressif ESP32-S3 | Board | Full model (board) | n/a (board) | Not checked | Wi-Fi/BLE side not emulated; LED matrix on board |
| Arduino UNO R4 Minima | S3, SU | Renesas RA4M1 | Board | Full model (board) | n/a (board) | Not checked | Target board |
| Raspberry Pi Pico | SEU | Raspberry Pi RP2040 | Board | Full model (board) | n/a (board) | Not checked | Pre-soldered per product page |
| Raspberry Pi Pico W | SK | RP2040 + Infineon CYW43439 | Board | Full model (board) | n/a (board) | Not checked | Wi-Fi not emulated; product page: 'Board Included: Pico W' |
| GPIO extension board (T-type) | SR | None (passive) | Wiring | Full model | n/a (accessory) | — | Raspberry Pi board itself not included in kit |
| ELEGOO expansion board | E1, E8 | UNVERIFIED | UNVERIFIED | Behavioural stub | No | — | Named on product page only; type UNVERIFIED |
| Breadboard power supply module | E3, SE, SEU, SR, UM | Regulator IC UNVERIFIED | Power | Full model | Yes (voltage regulator) | UNVERIFIED | Regulator IC to be identified from sample |
| Li-po charger module | SK | Charger IC UNVERIFIED | Power | Behavioural stub | No | UNVERIFIED | Charge state as user-set value |
| 9 V battery with DC plug | E3 | — | Power | Behavioural stub | No | — | Ideal source with user-set voltage |
| Resistors (assorted) | E1, E8, SE, S3, SR, SEU, SK, SU | — | Passive | Full model | Yes | — | Values per kit UNVERIFIED |
| Capacitors (assorted) | SE, S3, SR, SEU, SK, SU | — | Passive | Full model | Yes | — | Values UNVERIFIED |
| Diodes (rectifier) | E1, E8, SE, SR, SEU, SK | Type UNVERIFIED | Passive | Full model | Yes | — |  |
| Transistors (BJT) | SE, SR, SEU, SK | Type UNVERIFIED | Analogue/switch | Full model | Yes (BJT) | — | NPN/PNP types UNVERIFIED |
| LED (single colour) | E3, E1, E8, SE, S3, SR, SEU, SK | — | Digital/PWM | Full model | Yes | — |  |
| RGB LED (discrete) | SE, S3, SR, SEU, SK | — | PWM | Full model | Yes | — | Common anode/cathode UNVERIFIED |
| RGB LED module | SU, UM | — | PWM | Full model | Yes (RGB LED) | — |  |
| Traffic light module | SU, UM | 3 LEDs | Digital | Full model | Yes (LEDs) | — |  |
| LED bar graph (10-segment) | SR, SEU, SK | — | Digital | Full model | Yes (LEDs) | — | Package of LEDs |
| Potentiometer | E1, E8, SE, S3, SR, SEU, SK | — | Analogue | Full model | Yes | — |  |
| Potentiometer module | SU, UM | — | Analogue | Full model | Yes | — |  |
| Push-button | E1, E8, SE, S3, SR, SEU, SK | — | Digital | Full model | Yes | — |  |
| Button module | SU, UM | — | Digital | Full model | Yes | — |  |
| Micro switch | SR, SEU, SK | — | Digital | Full model | Yes (switch) | — |  |
| Slide switch | SR, SEU, SK | — | Digital | Full model | Yes (switch) | — |  |
| Tilt switch (ball) | SE, SR, SEU, SK | — | Digital | Full model | Yes (switch) | — | Contact state driven by virtual tilt |
| Reed switch / module | S3, SR, SEU, SK | — | Digital | Full model | Yes (switch) | — | Raphael supplies module form |
| Photoresistor (LDR) | SE, S3, SR, SEU, SK | CdS cell | Analogue | Full model | Yes (LDR) | — | CdS content: RoHS status to check |
| Photoresistor module | SU, UM | CdS cell | Analogue | Full model | Yes (LDR) | — |  |
| Thermistor (NTC) | SE, S3, SR, SEU, SK | — | Analogue | Full model | No | — | Beta model |
| Buzzer (active/passive) | SE, S3, SR, SEU, SK | — | Digital/PWM | Full model | Yes | — | Active vs passive per kit UNVERIFIED |
| Passive buzzer module | SU, UM | — | PWM | Full model | Yes | — |  |
| 74HC595 shift register | E3, E1, E8, SE, S3, SR, SEU, SK | 74HC595 (maker UNVERIFIED) | Serial (SPI-like) | Full model | No | Not checked (multi-source) |  |
| L293D motor driver IC | E1, E8, SR, SEU | L293D | Digital/PWM | Full model | Yes | Active (TI, ST per item n) |  |
| ULN2003 stepper driver board | E3 | ULN2003A | Digital | Full model | Yes | Active (TI, ST per item n) | Paired with stepper motor |
| TA6586 motor driver IC | SE, SK | Fuman TA6586 | Digital/PWM | Full model | No | UNVERIFIED | H-bridge truth table |
| L9110 motor driver module | S3, SU, UM | L9110 (maker UNVERIFIED) | Digital/PWM | Full model | No | UNVERIFIED | Could be substituted by TB6612FNG (EM-03) |
| ADC0834 ADC IC | SR | TI ADC0834 | Serial (3-wire) | Full model | No | Active (TI ADC0834-N; newer ADS7958 offered) |  |
| MCP3008 ADC IC | SR | Microchip MCP3008 | SPI | Full model | No | UNVERIFIED |  |
| PCF8591 ADC/DAC module | UM | NXP PCF8591 | I²C | Full model | No | EOL (NXP) → EM-02A substitute needed | Candidate substitute: ADS1115 + MCP4725 (both EM-03) |
| MPR121 capacitive touch module | SE, SEU, SK | NXP MPR121 | I²C | Full model | No | Discontinued (NXP) → EM-02A substitute needed | Electrode touches user-driven |
| 7-segment display (1 digit) | SE, S3, SR, SEU, SK | — | Digital | Full model | Yes | — |  |
| 4-digit 7-segment display | E3, SR, SEU, SK | — | Digital (multiplexed) | Full model | Yes | — |  |
| 8×8 LED matrix (bare) | SEU, SK | 788BS (Euler); Kepler type UNVERIFIED | Digital (multiplexed) | Full model | No | — |  |
| MAX7219 8×8 LED matrix module | SR | ADI MAX7219 | SPI-like | Full model | No | Active (ADI 'PRODUCTION') |  |
| LCD1602 (parallel) | E3, E1, E8 | HD44780-compatible (controller UNVERIFIED) | Parallel 4/8-bit | Full model | Partly (EM-03 has I²C form) | HD44780 original discontinued → treat as generic module | I²C backpack not stated on ELEGOO pages |
| I²C LCD1602 | SE, S3, SU, UM, SR, SEU, SK | HD44780-compatible + PCF8574-type backpack | I²C | Full model | Yes | PCF8574: NXP EOL, TI active; backpack maker UNVERIFIED |  |
| OLED display module | SE, SU, UM | SSD1306 (UM); SE/SU controller UNVERIFIED | I²C | Full model | Yes | UNVERIFIED |  |
| WS2812 RGB 8-LED strip | SE, SEU, SK | Worldsemi WS2812 | Single-wire 800 kHz | Full model | No | UNVERIFIED |  |
| Audio module and speaker | SE, SR | HXJ8002 amplifier | Analogue audio | Not emulated | No | UNVERIFIED | Audio playback out of emulation scope |
| DC motor (small) | E1, E8, SE, SR, SEU, SK | — | Power | Full model | Yes | — |  |
| TT gear motor | S3, SU, UM | — | Power | Full model | Yes (DC motor) | — |  |
| Servo (SG90-class) | SE, S3, SU, UM, SR, SEU, SK | SG90 named in SU/UM; others UNVERIFIED | PWM | Full model | Yes | — |  |
| Stepper motor (28BYJ-48-class) | E3, SE | Model UNVERIFIED | Coils (4-phase) | Full model | Yes (with ULN2003) | — | SE driver UNVERIFIED |
| DC water pump (centrifugal) | SE, S3, SU, UM, SEU, SK | — | Power | Behavioural stub | Yes (DC motor) | — | Electrical side as DC motor; flow not modelled |
| Relay / 5 V relay module | SE, SR, SEU, SK, SU, UM | Relay part UNVERIFIED | Digital | Full model | Yes | — | SU/UM: module form |
| Joystick module | SE, S3, SU, UM, SR, SEU, SK | 2 pots + switch | Analogue + digital | Full model | Yes | — |  |
| 4×4 membrane keypad | SE, SR, SEU, SK | — | Matrix scan | Full model | Yes | — | Size stated only for Kepler; others UNVERIFIED |
| IR receiver | SE, S3, SEU, SK | Part UNVERIFIED | IR NEC (demodulated) | Full model | Yes | UNVERIFIED | Remote control not listed on pages |
| Rotary encoder module | SR, UM | — | Quadrature digital | Full model | Yes | — |  |
| Touch sensor module | SR, SU, UM | IC UNVERIFIED | Digital | Behavioural stub | No | UNVERIFIED | Raphael: 'Touch Switch Module' |
| HC-SR04 ultrasonic module | SE, S3, SU, UM, SR, SEU, SK | Unmarked / varies | Trigger/echo pulse | Full model | Yes | — | Distance user-driven |
| HC-SR501 PIR module | SE, SU, UM, SR, SEU, SK | BISS0001-type (UNVERIFIED) | Digital | Full model | Yes | UNVERIFIED |  |
| DHT11 humidity/temperature | SE, S3, SU, UM, SEU, SK, SR | Aosong DHT11 | Proprietary single-wire | Full model | Yes | UNVERIFIED | Raphael sensor chip UNVERIFIED (page not fetched) |
| MPU-6050 module (GY-521) | E8, SU, UM, SR, SEU, SK | TDK MPU-6050 | I²C | Full model | No (replaced by ICM-42688-P) | Obsolete (TDK) → EM-02A substitute ICM-42688-P | ELEGOO E8 names GY-521 |
| GY-87 10-DOF IMU | SE | MPU-6050 + QST QMC5883L + Bosch BMP180 | I²C | Full model | No | MPU-6050 obsolete; BMP180 not on Bosch site → EM-02A substitute needed | Listed alongside 10-axis IMU; kit revision UNVERIFIED |
| 10-axis IMU module | SE | SH3001 + QST QMC6310 + Goertek SPL06-001 | I²C | Full model | No | UNVERIFIED | Possibly newer kit revision |
| MFRC522 RFID module | SE, SR, SEU, SK, E1, E8 | NXP MFRC522 (ELEGOO chip UNVERIFIED) | SPI + RF 13.56 MHz | Behavioural stub | No | EOL (NXP; successor CLRC663 plus) → EM-02A substitute needed | SPI register model with virtual cards; RF not emulated |
| Water level sensor module | SEU, SK, UM | — | Analogue | Behavioural stub | No | — |  |
| Soil moisture module | SE, S3, SU, UM | Capacitive (SU, UM); SE/S3 type UNVERIFIED | Analogue | Behavioural stub | No | — |  |
| IR obstacle avoidance module | S3, SU, UM, SR | IR pair + comparator (UNVERIFIED) | Digital | Behavioural stub | No | — |  |
| Line tracking module | S3 | IR reflective sensor (UNVERIFIED) | Digital | Behavioural stub | No | — |  |
| IR speed sensor module (slotted) | SU, UM, SR | Photo-interrupter (UNVERIFIED) | Digital pulses | Behavioural stub | No | — | Raphael: 'Speed Sensor Module' |
| MQ-2 gas/smoke module | SU, UM | Winsen/Hanwei MQ-2 (UNVERIFIED) | Analogue + digital | Behavioural stub | No | UNVERIFIED | Heater current relevant to power budget |
| Flame sensor module | SU, UM | IR photodiode + comparator | Analogue + digital | Behavioural stub | No | — |  |
| SW-420 vibration module | SU, UM | SW-420 switch + comparator | Digital | Behavioural stub | No | — |  |
| Raindrop detection module | SU, UM | Resistive pad + comparator | Analogue + digital | Behavioural stub | No | — |  |
| Hall sensor module | UM | IC UNVERIFIED | Digital/analogue | Behavioural stub | No | UNVERIFIED |  |
| DS18B20 temperature module | UM | ADI DS18B20 | 1-Wire | Full model | Yes | Active (ADI, per item n) |  |
| BMP280 module | SU, UM | Bosch BMP280 | I²C | Full model | Yes | UNVERIFIED (see item n) |  |
| MAX30102 pulse oximeter module | SU, UM | ADI MAX30102 | I²C | Behavioural stub | No | Active (ADI 'PRODUCTION') | Synthetic PPG waveform |
| DS1302 RTC module | SU, UM | ADI DS1302 | 3-wire serial | Full model | No | Active (ADI 'PRODUCTION') |  |
| VL53L0X ToF module | SU, UM | ST VL53L0X | I²C | Behavioural stub | No | Active (ST; longevity to Dec 2029) | Register model coarse; distance user-driven |
| ESP8266 Wi-Fi module | S3, SU, UM, SEU | Espressif ESP8266EX (module type UNVERIFIED) | UART (AT) | Not emulated | No | UNVERIFIED | Radio |
| JDY-31 Bluetooth module | SU, UM | IC UNVERIFIED | UART | Not emulated | No | UNVERIFIED | Radio |
| Camera module (5 MP) | SR | Sensor UNVERIFIED | CSI | Not emulated | No | UNVERIFIED | Camera |
## 3. Counts

| Measure | Count |
|---|---|
| Unique rows | 87 |
| Target boards (UNO R3 clone, MEGA2560 clone, UNO R4 WiFi, UNO R4 Minima, Pico, Pico W) | 6 |
| Kit parts (excluding boards) | 81 |
| — Full model | 59 (includes the passive GPIO extension board) |
| — Behavioural stub | 18 |
| — Not emulated | 4 (audio module, ESP8266, JDY-31, camera) |
| Kit parts **not in EM-03** (must be added to the model library scope) | 36 |
| Kit parts partly in EM-03 (parallel LCD1602; EM-03 names only the I²C form) | 1 |
| Kit parts flagged "EM-02A substitute needed" | 5 (MPU-6050, GY-87, MFRC522, MPR121, PCF8591) |

Parts not in EM-03, by class:
- **Full model (15):** thermistor, 74HC595, TA6586, L9110, ADC0834, MCP3008, PCF8591, MPR121,
  bare 8×8 LED matrix, MAX7219 matrix, WS2812 strip, MPU-6050 module, GY-87, 10-axis IMU, DS1302.
  (MPU-6050 is already required by EM-03 as a *kit part* under EM-02A, so 14 are new.)
- **Behavioural stub (17):** ELEGOO expansion board, Li-po charger, 9 V battery, touch module,
  MFRC522, water level, soil moisture, IR obstacle, line tracking, IR speed, MQ-2, flame, SW-420,
  raindrop, Hall, MAX30102, VL53L0X.
- **Not emulated (4):** audio module and speaker, ESP8266, JDY-31, camera.

Key risks:
1. ELEGOO contents are mostly unverified: official pages show packing lists as images only.
   The EM-02 inventory cannot be approved for ELEGOO until someone reads the tutorial PDFs or a
   physical kit.
2. Five kit parts rely on discontinued ICs (MPU-6050, MFRC522, MPR121, PCF8591; BMP180 likely, UNVERIFIED). Each
   needs an EM-02A substitute. MPU-6050 → ICM-42688-P, BMP180 → BMP280 and PCF8591 → ADS1115 +
   MCP4725 are already in EM-03; MFRC522 (NXP names CLRC663 plus) and MPR121 have no active
   equivalent chosen yet — item (n) must add them.
3. Many "Main IC" cells are UNVERIFIED (regulators, touch IC, IR receiver, backpack maker, OLED
   controller in two kits). Unidentified main ICs trigger the generic-module rule from item (n).
4. Behavioural stubs (18 in total) cannot support *Code verified* claims about physical behaviour; the UI
   must say so.
5. SunFounder lists have no quantities; quantities do not affect model scope but affect the
   initial catalogue.

## 4. UNVERIFIED

- Full packing lists of ELEGOO E3, E1 and E8 (product pages and tutorial pages give no text
  list; the download links were not exposed; the browser tool was not available).
- ELEGOO parts named only generically: "RFID module" chip, "expansion board" type, "LCD1602"
  controller and whether an I²C backpack is fitted, stepper model, "IC chips".
- ELEGOO Raspberry Pi kit (legacy staging host unreachable).
- SunFounder Da Vinci Kit list (image only); Thales Kit (not checked).
- Elite Explorer: GY-87 vs 10-axis IMU revision; OLED controller; keypad size; component PDF
  (not machine-readable).
- Raphael: humiture sensor chip (page 404); camera sensor (named only "5MP 1080p").
- Kepler: bare matrix type; Li-po charger IC.
- Lifecycle status: MCP3008, TA6586, L9110, ESP8266EX, WS2812, SH3001, QMC6310, SPL06-001,
  QMC5883L, HXJ8002, DHT11, BMP280 (see item n), BMP180 (no longer on Bosch Sensortec's
  pressure-sensor page, which lists BMP280/380/388/390; not a formal notice).

## 5. Sources (all checked 2026-09-26)

ELEGOO
- https://www.elegoo.com/products/elegoo-uno-r3-super-starter-kit (and .json product data)
- https://www.elegoo.com/products/elegoo-uno-most-complete-starter-kit (and .json)
- https://www.elegoo.com/products/elegoo-mega-2560-the-most-complete-starter-kit (and .json)
- https://www.elegoo.com/products/elegoo-uno-basic-starter-kit (and .json)
- https://www.elegoo.com/blogs/arduino-projects/elegoo-uno-r3-project-the-most-complete-starter-kit-tutorial
- https://www.elegoo.com/pages/download

SunFounder
- Component lists: URLs in section 1
- https://docs.sunfounder.com/projects/ultimate-sensor-kit/en/latest/_downloads/3863a12f746f463f4697b9f2a6853fcf/sunfounder_ultimate_sensor_kit_components_list.pdf
- https://docs.sunfounder.com/projects/elite-explorer-kit/en/latest/components/component_gy87.html
- https://docs.sunfounder.com/projects/elite-explorer-kit/en/latest/components/component_audio_speaker.html
- https://docs.sunfounder.com/projects/elite-explorer-kit/en/latest/components/component_humiture_sensor.html
- https://docs.sunfounder.com/projects/ai-lab-kit/en/latest/_shared/component/cpn_10_axis_imu.html
- https://docs.sunfounder.com/projects/raphael-kit/en/latest/component/component_dot_matrix.html
- https://docs.sunfounder.com/projects/kepler-kit/en/latest/_sources/component/component_lipo_charger.rst.txt
- https://www.sunfounder.com/products/sunfounder-raspberry-pi-pico-w-ultimate-starter-kit
- https://www.sunfounder.com/products/raphael-kit

Manufacturers (lifecycle)
- NXP MFRC522: https://www.nxp.com/products/MFRC52202HN1 ("End of Life"; CLRC663 plus recommended)
- NXP MPR121: https://www.nxp.com/products/no-longer-manufactured/proximity-capacitive-touch-sensor-controller:MPR121
- NXP PCF8591: https://www.nxp.com/products/PCF8591T
- ADI DS1302, MAX30102, MAX7219: https://www.analog.com/en/products/ds1302.html, …/max30102.html, …/max7219.html
- ST VL53L0X: https://www.st.com/en/imaging-and-photonics-solutions/vl53l0x.html
- TI ADC0834-N: https://www.ti.com/product/ADC0834-N
- Bosch Sensortec pressure sensors: https://www.bosch-sensortec.com/bst/products/all_products/bmp180
- MPU-6050, PCF8574, HD44780, L293D, ULN2003, DS18B20: see phase0/n_active_equivalents.md
