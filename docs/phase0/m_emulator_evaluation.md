# Phase 0 (m) — MCU emulator evaluation and Pi virtual-clock spike

- Baseline: prompt v3.3
- Version: 0.1.0
- Date: 2026-09-26
- Status: draft
- Human review record (DOC-12): pending

**Machine:** all numbers come from this Linux container, which is **not Profile A**. It has 2 shared vCPUs (Xeon @ 2.10 GHz) and runs Node 22.22, Python 3.11 and gcc 13. Each ratio is emulated seconds ÷ wall seconds, measured without pacing. Spike code is in `spikes/m/`.

**Blocked downloads:** the proxy refused micropython.org, downloads.arduino.cc, the CircuitPython S3 bucket and static.rust-lang.org (403). As a result:
- MicroPython v1.26.1 was built from source.
- The Arduino-AVR core was compiled by hand.
- Arduino-Pico could not be installed, because arduino-cli needs tools from downloads.arduino.cc.

## 1. rp2040js (RP2040)

**Setup:** `npm install rp2040js@latest` (1.4.0, MIT). Pico SDK 2.2.0 was built with apt `gcc-arm-none-eabi` (`-DPICO_NO_PICOTOOL=1`). Runs: `node rp2040_bench/bench.mjs <bin> <s>`, and `node rp2040_bench/mpy.mjs <firmware.bin> <script.py>`, which pastes the script over emulated USB CDC.

| Workload | Ratio |
|---|---|
| SDK `busy.c` (CPU-bound), 4 runs | **0.42 / 0.42 / 0.41 / 0.37** (32–37 MIPS) |
| SDK `blink.c` (`sleep_ms` → WFE; the core's idle time is skipped) | 22.8 |
| MicroPython blink (Pin/PWM/ADC, `sleep_ms(500)`) | **0.40** |
| MicroPython busy loop | 0.36 |

MicroPython's `sleep_ms` keeps the CPU busy servicing TinyUSB.

**EM-06 (time):** `SimulationClock` is advanced only by the cycle count (8 ns per cycle) and by alarm jumps. It is fully decoupled from wall time. LED edges were exactly 500.0 ms apart in emulated time. There is no pacer, so EmbedForge must throttle the emulator and compute the displayed ratio itself.

**Gaps against EM-06:**
- **PIO runs from `setTimeout(0)` batches**, so its timing follows the host event loop, not emulated time.
- UART TX is delivered instantly, with no time taken per byte at the set baud rate.
- I²C and SPI finish through host callbacks, with no bus timing.
- XIP flash wait states are not modelled.

**Peripherals present:** GPIO, ADC, PWM, I²C, SPI, UART×2, timer/alarms, RTC, watchdog, PIO×2, DMA, USB + CDC helper, interpolator. The component hooks are `setInputValue`, GPIO listeners, `channelValues` and `onADCRead`, `onConnect`, `onWriteByte`, `onReadByte` and `onTransmit`.

**Missing:**
- **Core 1** (single core only, so `multicore_launch_core1` and Arduino-Pico `setup1`/`loop1` do not work)
- SSI flash writes (the MicroPython file system is read-only)
- ROSC and VREG

**Maintenance:** 7 npm releases in 2026, the latest on 2026-09-25. The maintainer is not working on RP2350 (issue #142).

**Alternative:** c1570/rp2350js also emulates the RP2040. It supports dual core and steps PIO once per cycle.
- TypeScript: busy 0.37, blink 0.62 (no idle skip); GPIO edges correct.
- C build from `cts2c` (`npm run cts2c:full`, `gcc -O3 spike_cbench.c`): **busy 1.01 / 1.00**, blink 2.23.

## 2. RP2350 survey

**c1570/rp2350js** (MIT; commit 2026-09-10; thanh20VN is a fork of it):
- SDK 2.2.0 `rp2350-arm-s` firmware boots through the bootrom. UART output and 500 ms timestamps are correct.
- Speed: TypeScript blink 0.61, busy 0.31; **C busy 0.93 / 0.95**.
- MicroPython v1.26.1 PICO2 (ARM) reaches the REPL and runs scripts: blink 0.68, busy 0.28.
- **Defect 1: GPIO outputs never change**, in the SDK blink (SIO `GPIO_OUT` stays 0) and in MicroPython `Pin.toggle`. The SDK uses `mcrr p0` (64-bit GPIOC), but `cp0Gpioc` handles only MCR/MRC and treats MCRR as a no-op.
- **Defect 2: `clkSys` stays at 125 MHz** although the firmware sets 150 MHz. The README lists "timers when changing sys_clk/PLL" as missing.
- Other gaps listed in the README: TrustZone, exceptions, the 12-slice PWM, OTP, TRNG, SHA-256, HSTX and POWMAN.
- Hazard3 RISC-V was not tested (no toolchain set up).

**GhostRoboticsLab/GhLabs_RP2350_emulator** (MIT): Hazard3 RISC-V only. Default Pico 2 builds are ARM, so it was not run.

**0x4D44/picoem** (Rust, MIT/Apache-2.0; "personal research project"):
- It builds, and its own tests pass (4/4).
- SDK images, and its own `blinky.bin` loaded through the bootrom path, **stall in the bootrom at PC 0x3ee**.
- UART, SPI, I²C, DMA and timers are stubs.
- **Fail.**

**Others:**
- **QEMU:** only an RP2040 RFC patch series exists (v3, September 2026, not merged); there is no RP2350.
- **Renode / Unicorn:** no RP2350 platform was found.
- **Wokwi:** it hosts Pico 2 projects, but the engine is not in its public repository. Treated as closed (UNVERIFIED).
- **Velxio** (AGPL): its RP2350 engine is "online-only … not part of the OSS tree".

**Verdict:** no RP2350 emulator passes qualification today, so under TB-02, **Pico 2 / Pico 2 W stay HIL-pending.** The nearest candidate is c1570/rp2350js (ARM). Re-qualify it once the MCRR GPIOC handling and PLL-dependent clock are fixed.

## 3. simavr (AVR)

**Build steps:**
- `apt-get install gcc-avr avr-libc binutils-avr libelf-dev`
- `git clone buserror/simavr` (v1.8-17, HEAD 2026-09-26)
- `make build-simavr`, then `make -C tests run_tests` → **22/22 pass**
- The harness `avr_bench/harness.c` links `-lsimavr -lelf`.

| Firmware (ATmega328P @ 16 MHz), 3 × 10 s | Ratio |
|---|---|
| `fw.c`: Timer0 1 kHz ISR, busy millis loop, ADC, Timer1 PWM, USART printf | **4.15 / 4.63 / 4.17** |
| Arduino-core Blink with `delay`, `analogRead`, `analogWrite`, `Serial` | **5.51 / 5.56 / 5.67** |

**Time:** simulated time is `avr->cycle`, and the UART, SPI, ADC and TWI are timed by cycle timers. LED edges were at 0.178 / 500.073 / 1000.055 ms, identical across runs. **Exception:** the default `avr_callback_sleep_raw` calls `usleep()` on `SLEEP`, which ties it to the wall clock. EmbedForge must replace it with a no-op plus its own pacer.

**Peripherals:**
- Timers 0/1/2 with PWM
- ADC, with input injected in mV
- USART, TWI and SPI
- External interrupts and pin change
- EEPROM, watchdog, analog comparator

The `mega328`, `mega328pb`, `mega2560` and `mega32u4` cores cover the Uno, Nano and Mega.

**Component models:** `avr_irq_register_notify` and `avr_raise_irq` on port, ADC, UART, timer or TWI IRQs. The spike attached an LED, a potentiometer and a UART sink this way. Bundled parts include HD44780, SSD1306, DS1338, an I²C EEPROM, a button, a rotary encoder and a 74HC595.

**VCD:** a 3 s trace was 176 kB.

**Open item:** in the Arduino-core run, `TIMER_IRQ_OUT_PWM0` did not report `analogWrite(9)`. This was not investigated; add it to the qualification tests.

**Windows:** upstream CI builds with MSYS2 UCRT64 on `windows-latest`. The 32-bit build was dropped, and there is no MSVC build.

**Licence:** GPL-3.0-or-later.

## 4. Pi CPython virtual-clock spike (D11)

The code is in `spikes/m/pi_virtual_clock/` (`vclock.py`, `run_emulated.py`, `test_vclock.py`), using gpiozero 2.0.1 (BSD-3) with `MockFactory(pin_class=MockPWMPin)`.

**Design:**
- `time.sleep`, `monotonic`, `time`, `perf_counter`, the `*_ns` variants and `signal.pause` are patched before gpiozero is imported.
- `Thread.start` is wrapped so that every thread is counted.
- `threading.Event` is swapped for a virtual `VEvent` in gpiozero and in the user script (through an import proxy).
- **Emulated time jumps to the next wake-up only when every managed thread is blocked** (discrete-event simulation).
- A thread busy-polling the clock is charged 1 µs per read after 1000 reads.
- asyncio gets a virtual-time selector loop.
- Pin transitions are logged from `MockPin._change_state`.

**Results:** `python test_vclock.py` → **ALL PASSED**.

| Unmodified script (60 s emulated unless noted) | Wall time | Checked |
|---|---|---|
| `LED` on/off with `sleep(0.5)` | 0.0017 s | 120 edges at exactly k × 0.5 s |
| `Button.when_pressed = led.toggle` + `pause()`; presses at 10.0 s and 30.5 s | 0.0038 s | LED edges at exactly 10.0 s and 30.5 s |
| `LED.blink(0.25, 0.75)` + `PWMLED.pulse(1, 1)` | 0.027 s | Edges at 0/0.25/1.0/1.25 s; PWM peak at 1.0 s; **identical SHA-1 over 5 runs** |
| Busy `while monotonic() - t0 < 3: pass` (10 s) | 1.85 s | LED on at 3.000001 s |
| `asyncio.sleep(1)` toggle (10 s) | 0.002 s | Edges at 0…9 s |
| DHT11 IIO overlay read every 2 s (12 s) | — | Model values; modelled EIO appears as `OSError` 5 |

**Hard limits:**
1. **Unpatched timed waits hang or run in real time:** `queue.get(timeout)`, `Condition.wait`, `Lock.acquire(timeout)`, `join(timeout)`. The `queue.get(timeout=2)` test **hung**. Fix: add a virtual `Condition` and `Lock` to the proxy, and re-point `queue`'s threading reference.
2. **Busy loops** cost wall time for every clock read. Fix: a larger tick.
3. **C extensions** (`lgpio`, `RPi.GPIO`, `pigpio`, `smbus2`, `spidev`) cannot run on a PC. Fix: ship shims backed by MockFactory and the component models.
   - Callbacks from lgpio's C alert thread cannot be tracked. Under MockFactory, callbacks run on the thread that drives the pin, which is deterministic.
   - Sleeps inside C code, `select` and socket timeouts escape the virtual clock.
4. **asyncio** works only through the virtual loop policy. trio and anyio would need adapters.
5. **multiprocessing** is not supported: label such scripts "not emulated".
6. **Sysfs, IIO and 1-Wire** (for example `/sys/bus/iio/devices/iio:device0/in_temp_input` or `/sys/bus/w1/devices/28-*/w1_slave`): overlay `open`, `os.path.exists` and `os.listdir` for declared paths with models `fn(now) → str`, which may raise `OSError(EIO)`. This is demonstrated in `install_sysfs`. The paths come from the board's overlay list. `os.open`, `pathlib` and `ioctl` need the same hooks. FUSE is not portable to Windows.

## 5. Conclusions

| Target | Emulator | Licence | EM-05 | EM-06 | Speed measured (container) | Verdict |
|---|---|---|---|---|---|---|
| Uno, Nano, Mega | simavr | GPL-3.0+ | Yes (IRQ API) | Yes, after replacing `sleep_raw` | 4.2–5.7× | **Recommend** |
| Pico / Pico W | rp2040js 1.4.0 | MIT | Yes | Partial (PIO, UART, I²C/SPI untimed) | 0.37–0.42; MicroPython 0.36–0.40 | Usable fallback |
| Pico / Pico W | c1570/rp2350js, RP2040 mode | MIT | Yes | Better (PIO per cycle, dual core) | 0.37 TS / **1.00 C** | **Recommend, pending qualification** |
| Pico 2 / Pico 2 W | c1570/rp2350js, ARM | MIT | Yes | **No** (GPIO out, clk_sys) | 0.31 TS / 0.93–0.95 C | **Fail → HIL-pending** |
| Pico 2 | picoem | MIT/Apache | Stubs | Cycle-accurate core | Did not boot SDK images | Fail |
| Pi 5 / 4 / 3B+ / Zero 2 W | CPython + gpiozero Mock + virtual clock | BSD-3 | Yes | Yes (patched primitives) | 60 s in 0.002–0.03 s | **Recommend (D11)** |

**PERF-05 estimate (uncalibrated):** I assume Profile A has 1.3–2× the single-thread speed of this vCPU, and a Pi 5 has 0.5–0.8×.

| Emulator | Profile A (target ≥ 50 %) | Pi 5 (target ≥ 25 %) |
|---|---|---|
| AVR (simavr) | ~5×: pass | ≥ 2×: pass |
| RP, TypeScript engines | 0.4–0.8: marginal | 0.15–0.35: at risk |
| RP, `cts2c` C build | ~1.3–2: pass | ~0.5–0.8: pass |

The component models (≤ 40 parts) and the UI consume some of that headroom, not yet measured. **Recommendation:** use the C RP engine in a worker thread, with idle skipping. The Pi virtual clock is not a PERF-05 concern. Re-measure on real hardware in item (h).

**Qualification-suite outline:**
1. **ISA conformance:** simavr tests and gcc torture tests; for M0+ and M33, differential runs against QEMU.
2. **Boot matrix:** SDK blink, Arduino Blink, MicroPython and CircuitPython REPL, UF2 loaded via the bootrom.
3. **Timing goldens:** blink period (±1 cycle), `millis`/`time_us_64` against cycles, PWM from VCD, UART byte time, I²C/SPI clock rate, ADC conversion, ISR latency, behaviour after a PLL change.
4. **Peripheral tests:** GPIO through the SIO and GPIOC paths, ADC, PWM, I²C/SPI against reference models, UART, DMA, PIO (a cycle-exact WS2812 stream), multicore launch, USB CDC.
5. **Determinism:** identical VCD hash over N runs.
6. **Speed:** a fixed workload set on Profile A and B.
7. **Pi:** the gpiozero device matrix, timestamp assertions, hang watchdog.
8. **HIL comparison:** the same firmware on real hardware, checked with a logic analyser.

## 6. Risks

| # | Risk | Treatment |
|---|---|---|
| R-m1 | No RP2350 emulator qualifies, and defects may run deeper than MCRR and PLL. | Upstream fixes (MIT) or sponsorship; re-test each increment. |
| R-m2 | TypeScript RP engines may miss PERF-05 on the Pi 5. | `cts2c` C build or WASM; idle skipping. |
| R-m3 | The C build is generated code from a single-maintainer fork. | Pin a commit; run the qualification suite in our CI. |
| R-m4 | rp2040js PIO is not tied to emulated time and there is no core 1. | Use rp2350js RP2040 mode, or patch rp2040js. |
| R-m5 | simavr is GPL-3.0 and MinGW-only on Windows. | Compatible with GPL-3.0; ship a UCRT64 DLL. |
| R-m6 | Pi scripts with untracked waits or C extensions hang. | Wall-clock watchdog, shims, "not emulated" label. |
| R-m7 | Numbers come from a shared 2-vCPU container. | Re-measure on Profile A and B in item (h). |
| R-m8 | Arduino-Pico was not tested (tool downloads blocked). | Retest when downloads.arduino.cc is reachable. |

## 7. Sources

- rp2040js: https://github.com/wokwi/rp2040js , https://www.npmjs.com/package/rp2040js , issue https://github.com/wokwi/rp2040js/issues/142
- rp2350js: https://github.com/c1570/rp2350js (fork https://github.com/thanh20VN/rp2350js)
- GhLabs RP2350 emulator: https://github.com/GhostRoboticsLab/GhLabs_RP2350_emulator
- picoem: https://github.com/0x4D44/picoem
- QEMU RP2040 RFC: http://www.mail-archive.com/qemu-devel@nongnu.org/msg1223660.html ; QEMU RP2350 request: https://gitlab.com/qemu-project/qemu/-/work_items/3125
- Wokwi: https://docs.wokwi.com/parts/wokwi-pi-pico , https://wokwi.com/projects/419968142868036609
- Velxio: https://github.com/velxio/velxio
- simavr: https://github.com/buserror/simavr
- ArduinoCore-avr: https://github.com/arduino/ArduinoCore-avr
- Pico SDK: https://github.com/raspberrypi/pico-sdk
- MicroPython: https://github.com/micropython/micropython
- gpiozero: https://pypi.org/project/gpiozero/
