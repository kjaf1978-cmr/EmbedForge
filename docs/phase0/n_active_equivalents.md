# Phase 0 (n) — Active equivalents (first pass: EM-03 and ACC parts)

- Baseline: prompt v3.2
- Version: 0.1.0 (26 September 2026)
- Status: partial. The kit inventory (d) will add more parts. Human review record (DOC-12):
  pending.

**Evidence rule:** the manufacturer's own page or PCN notice is preferred. Distributor data is
marked "(dist.)". UNVERIFIED means no status could be confirmed.

## 1. Parts that fail, or may fail, the *active* test

| Part | Status | Evidence | Proposed active equivalent | Impact |
|---|---|---|---|---|
| TDK MPU-6050 | **Obsolete** (dist.: last-time-buy 31 January 2024) | product.tdk.com MPU-6050 | **ICM-42688-P** (TDK "Production"; I²C/SPI; widely sold as a breakout). TDK's own named alternate is ICM-42670-P. Register maps differ, so a new driver template is needed | MPU-6050 becomes a *kit part* (EM-02A) |
| TDK ICM-20948 | **EOL** | invensense.tdk.com | Not to be used as a substitute | — |
| NXP PCF8574 / PCF8574A (and PCA8574) | **End of Life / no longer manufactured** | nxp.com | **TI PCF8574 / PCF8574A** (Active; same pinout and addresses) | Catalogue names the TI MPNs; the I²C LCD backpack stays standard |
| Hitachi HD44780 | No longer manufactured (secondary source) | crystalfontz.com | "HD44780-compatible 16×2 module" as a *generic module*. Its controller (ST7066U / SPLC780D / KS0066) is UNVERIFIED, so the unidentifiable-main-IC rule applies | ACC-01 LCD stays usable once its parameter sheet is reviewed |
| Bosch BMP280 | **UNVERIFIED**; Bosch page gives no status; forum reports "not recommended for new designs" | bosch-sensortec.com; Bosch community forum | BMP390 (precautionary) | You or I confirm with Bosch; hold the decision |
| Nexperia BSS138P | "Not for design in" | nexperia.com | Nexperia BSS138BK (Production) or onsemi BSS138 (UNVERIFIED) | Level-shifter MPN choice |

## 2. Confirmed active

| Part | Status and evidence |
|---|---|
| TI PCF8574/A, TI DRV8825, TI L293D, TI ULN2003A, TI ADS1115, TI LM1117, TI TXS0108E | Active (ti.com) |
| ST L298, ST L293D, ST ULN2003 | Active / in volume production (st.com) |
| Allegro A4988 | Active (dist. Arrow; datasheet has no NFND banner) |
| Toshiba TB6612FNG | Production (dist.); orderable on toshiba.semicon-storage.com |
| ADI DS1307, DS3231, DS18B20 | "PRODUCTION" (analog.com) |
| Microchip MCP4725, MCP23017, ATmega328P, ATmega2560, ATmega16U2 | Production (dist. Octopart, manufacturer status "REL"; Microchip pages did not render) |
| Bosch BME280, BMI270 | No discontinuation notice (bosch-sensortec.com) |
| ST LSM6DSOX; TDK ICM-42688-P, ICM-42670-P | In production (manufacturer sites) |
| Aosong DHT22/AM2302 | No discontinuation notice (asairsensors.com); DHT11 UNVERIFIED |
| Vishay TSOP38238 | Active (vishay.com) |
| Silicon Labs CP2102 | Full production until at least March 2029 (silabs.com) |
| Raspberry Pi RP2040 / RP2350 | In production until at least January 2041 / January 2045 |

**Raspberry Pi board commitments** (raspberrypi.com product pages):

| Board | In production until at least |
|---|---|
| Pi 5 | January 2036 (a September 2025 Raspberry Pi blog post says January 2038) |
| Pi 4 Model B | January 2034 |
| Pi 3 Model B+ | January 2030 |
| Zero 2 W | January 2030 |
| Pico 1 series | January 2036 |
| Pico 2 series | January 2040 |

## 3. Still UNVERIFIED

- SSD1306: listed by the manufacturer, but no status is shown.
- The controllers used on 16×2 modules: ST7066U, SPLC780D, KS0066.
- DHT11.
- BISS0001 (the HC-SR501 PIR controller).
- CH340G / CH340C: the WCH site needs JavaScript; LCSC lists the CH340G as active.
- AMS1117-3.3. Equivalent: TI LM1117-3.3, which is active.
- onsemi BSS138.

Where the main IC stays unidentifiable, the module is handled by the D9 rule (A3-02).

## 4. EM-03 change proposed (D11)

- Replace **MPU-6050 with ICM-42688-P** in EM-03, as the prompt text anticipates. MPU-6050
  remains a *kit part* under EM-02A.
- Keep BMP280 pending a manufacturer confirmation.
