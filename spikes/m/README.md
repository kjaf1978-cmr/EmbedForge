# Phase 0 spike — not application code

Throwaway evaluation code for Phase 0 item (m) (emulator evaluation). Nothing here is part of
the EmbedForge application, and none of it is to be copied into it without review.
Report: `docs/phase0/m_emulator_evaluation.md`.

- `rp2040_bench/` — rp2040js (npm 1.4.0) benchmark harness (Pico SDK binaries, MicroPython via USB CDC)
- `pico_fw/` — Pico SDK 2.2.0 test firmware (`blink.c`, `busy.c`) for RP2040 and RP2350-ARM
- `avr_bench/` — ATmega328P firmware + libsimavr harness (IRQ-attached LED/ADC/UART/PWM models, VCD)
- `rp2350_eval/` — RP2350 emulator trials (c1570/rp2350js, picoem)
- `pi_virtual_clock/` — CPython virtual-clock prototype for gpiozero scripts (MockFactory)
- Cloned upstream sources (`simavr/`, `rp2040js/`, `pico-sdk/`, `micropython/`, `rp2350_eval/*`) are
  third-party code under their own licences.
