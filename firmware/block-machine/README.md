# Block moulding machine firmware (P9)

The Arduino Nano's program for the block moulding machine (circuit `app/ui/src/eda/blockMachine.ts`,
board `hardware/block-machine`). Arduino C++ (D48), GPL-3.0-or-later.

| File | Contents |
|---|---|
| `src/machine_logic.h/.cpp` | the machine's sequence (no Arduino calls: tested on the host) |
| `src/main.cpp` | the Arduino glue: pins, input debouncing, the watchdog |
| `test/test_main.cpp` | the host unit tests, with a simulated machine |

## Build

- **Host tests:** `make test` (g++). 12 tests, 463 checks, against a simulated machine (cylinders
  that move while their valve is on and the pump has pressure, a feeder that runs out and back,
  an operator who changes pallets): start-up, READY, homing from anywhere, a full cycle with its
  timings, one cycle per START, the pump's idle stop, a broken sensor (FAULT, its clearing), a
  stuck feeder, STOP, the safety rail lost, an interlock broken by a sensor, a pallet taken away,
  and ten minutes of random sensors, faults, STOP, E-stops and presses against the invariants
  (opposing valves never together, at most two valves, the feeder only with the tamper up, the
  tamper down only with the feeder home, nothing with the rail off or STOP pressed, the vibrators
  only while filling, pressing and vibrating).
- **The Nano:** `make nano` (avr-gcc with the Arduino AVR core: Ubuntu's `gcc-avr`, `avr-libc`,
  `arduino-core-avr`), or `pio run -e nano` (PlatformIO, D48). It uses about 4.8 kB of the 30 kB
  of flash and 0.4 kB of the 2 kB of RAM.
- **Flash:** `pio run -e nano -t upload`, or `avrdude -p m328p -c arduino -P /dev/ttyUSB0 -b 115200
  -U flash:w:build/block-machine.hex`. **A Nano with the new bootloader (Optiboot) only:** the old
  bootloader resets again and again after a watchdog reset.

## What the program does

See the header of `src/machine_logic.h` (the cycle, homing, faults, the interlocks) and
`src/main.cpp` (the pins). The machine's safety does not depend on it: the E-stop and the guards
drop the safety contactors, which feed every coil and valve.

## The lamp (READY / FAULT, on the panel's door)

| Lamp | Meaning |
|---|---|
| on | READY: at home, START begins a cycle |
| flashing slowly | homing, a cycle running, or waiting for a pallet |
| flashing fast | FAULT: a step did not reach its sensor in time, or an interlock broke; press STOP, then START (it homes) |
| off | the safety rail is off (E-stop, a guard open, RESET not given), STOP pressed, or not homed: press START |
