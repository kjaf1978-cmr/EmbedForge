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

- **Host tests:** `make test` (g++). 19 tests, 97 checks: the sequences (open, close, stop,
  reverse), the start-up hold-off, the limit switches, STOP, the photo-beam and its test before
  each close (a bridged beam, one that does not come back), obstacles, the release move, the
  lockout after the third trip (released first), a trip during a release, the maximum travel time,
  ten minutes of random inputs against the invariants (never both relays, no relay change while
  the motor runs, the motor only with a relay, no close without a beam test just before), the NEC
  decoder (frames, tolerance, repeats, noise), the pairing (the oldest replaced after a power cut,
  erasing).
- **The Nano:** `make nano` (avr-gcc with the Arduino AVR core: Ubuntu's `gcc-avr`, `avr-libc`,
  `arduino-core-avr`), or `pio run -e nano` (PlatformIO, D48). It uses about 6.6 kB of the 30 kB
  of flash and 0.7 kB of the 2 kB of RAM.
- **Flash:** `pio run -e nano -t upload`, or `avrdude -p m328p -c arduino -P /dev/ttyUSB0 -b 115200
  -U flash:w:build/gate-controller.hex`. **A Nano with the new bootloader (Optiboot) only:** the old
  bootloader does not stop the watchdog after a watchdog reset and resets again and again (the
  program then never runs; the gate stays still). Burn Optiboot first if the Nano has the old one.

## What the program does

See the header of `src/gate_logic.h`, and `src/main.cpp` for the pins and the LED. The end stops,
the photo-beam, STOP and the current cut-off stop the motor in hardware, and at any reset (the
watchdog's included) the drivers' pull-downs switch RUN, the relays and the beam's transmitter
off. What the gate's safety still needs from the program (reversing after an obstacle, the beam
test before each close, not misusing CLR and RUN) is in the DFMEA, GC-10.

## Pairing a remote

Hold LEARN on the board and press the remote's button that is to work the gate: the Nano's LED
flashes three times and that code is stored (up to four; the oldest is replaced). Hold LEARN for
10 s without a remote to erase every pairing (the LED flashes fast), for example when a remote is
lost; then pair the remaining ones again. The remote must use the NEC protocol (most simple
infrared remotes do). An infrared code can be copied by a learning remote: the remote is a
convenience, not a lock (USER_MANUAL.md).

## The LED (the Nano's, D13)

| Pattern | Meaning |
|---|---|
| a short flash every second | running |
| on | LEARN held, or STOP pressed |
| three flashes | a remote paired |
| fast flashing for 2 s | every pairing erased |
| two flashes every second | lockout (three obstacles), or the photo-beam failed its test |
