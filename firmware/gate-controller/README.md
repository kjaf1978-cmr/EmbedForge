# Gate controller firmware (P9)

The Arduino Nano's program for the gate controller (circuit `app/ui/src/eda/gate.ts`, board
`hardware/gate-controller`). Arduino C++ (D48), GPL-3.0-or-later.

| File | Contents |
|---|---|
| `src/gate_logic.h/.cpp` | the gate's sequencing (no Arduino calls: tested on the host) |
| `src/nec.h/.cpp` | the NEC infrared protocol decoder |
| `src/remotes.h` | the paired remotes (four) and one command per press |
| `src/main.cpp` | the Arduino glue: pins, the receiver's interrupt, input debouncing, the EEPROM, the watchdog |
| `test/test_main.cpp` | the host unit tests |

## Build

- **Host tests:** `make test` (g++). 69 checks: the sequences (open, close, stop, reverse), the
  limit switches, the photo-beam, obstacles, the lockout, the maximum travel time, ten minutes of
  random inputs against the invariants (never both relays, no relay change while the motor runs,
  the motor only with a relay), the NEC decoder (frames, tolerance, repeats, noise), the pairing.
- **The Nano:** `make nano` (avr-gcc with the Arduino AVR core: Ubuntu's `gcc-avr`, `avr-libc`,
  `arduino-core-avr`), or `pio run -e nano` (PlatformIO, D48). It uses about 5 kB of the 30 kB of
  flash and 0.6 kB of the 2 kB of RAM.
- **Flash:** `pio run -e nano -t upload`, or `avrdude -p m328p -c arduino -P /dev/ttyUSB0 -b 115200
  -U flash:w:build/gate-controller.hex` (57600 Bd for a Nano with the old bootloader).

## What the program does

See the header of `src/gate_logic.h`. The safety of the gate does not depend on it: the limit
switches and the photo-beam stop the motor in hardware, the current cut-off latches in hardware,
and after any reset (the watchdog's included) the motor cannot move until the program has cleared
the cut-off.

## Pairing a remote

Hold LEARN on the board and press the remote's button that is to work the gate: that code is
stored (up to four; the oldest is replaced). The remote must use the NEC protocol (most simple
infrared remotes do). An infrared code can be copied by a learning remote: the remote is a
convenience, not a lock (USER_MANUAL.md).
