# Block moulding machine firmware (P9)

The Arduino Mega 2560's program (D67) for the block moulding machine (circuit `app/ui/src/eda/blockMachine.ts`,
board `hardware/block-machine`). Arduino C++ (D48), GPL-3.0-or-later.

| File | Contents |
|---|---|
| `src/machine_logic.h/.cpp` | the machine's sequence (no Arduino calls: tested on the host) |
| `src/main.cpp` | the Arduino glue: pins, input debouncing, the read-backs, the watchdog |
| `test/test_main.cpp` | the host unit tests, with a simulated machine |

## Build

- **Host tests:** `make test` (g++). 19 tests, 487 checks, against a simulated machine whose loads
  are fed only through the outputs' enable and act 20 ms after they are fed (a contactor's or a
  valve's pull-in): start-up, READY, homing from anywhere, a full cycle with its timings, one cycle
  per START, the pump's idle stop, a broken sensor, a stuck feeder, STOP, the safety rail lost, an
  interlock broken by a sensor, a pallet taken away; an output stuck on at the rail's return (the
  enable never given, the contactor never pulls in), an output shorted to the frame, the enable
  switch stuck on, a motor breaker tripped, hot oil, no working pressure, a fault kept while the
  rail is off; and ten minutes of random sensors, faults, shorts, STOP, E-stops and presses against
  the invariants (opposing valves never together, at most two valves, the feeder only with the
  tamper up, the tamper down only with the feeder home, nothing with the rail off or STOP pressed,
  no output without the enable, the vibrators only while filling, pressing and vibrating).
- **The Mega:** `make mega` (avr-gcc with the Arduino AVR core: Ubuntu's `gcc-avr`, `avr-libc`,
  `arduino-core-avr`), or `pio run -e mega` (PlatformIO, D48). It uses about 8.5 kB of the 248 kB
  of flash and 1 kB of the 8 kB of RAM.
- **Flash:** `pio run -e mega -t upload`, or `avrdude -p m2560 -c wiring -P /dev/ttyACM0 -b 115200
  -D -U flash:w:build/block-machine.hex`.

## What the program does

See the header of `src/machine_logic.h` (the cycle, homing, faults, the interlocks) and
`src/main.cpp` (the pins). The machine's safety does not depend on it: the E-stop and the guards
(certified safety relays) drop the safety contactors, which feed every coil and valve. What it adds:
the outputs' read-back (a shorted output switch is found before its load can act, a short to the
frame switches the output off), the motor breakers, the oil temperature and the working pressure.

## The lamp (READY / FAULT, on the panel's door)

| Lamp | Meaning |
|---|---|
| on | READY: at home, START begins a cycle |
| flashing slowly | homing, a cycle running, or waiting for a pallet |
| flashing fast | FAULT: a step did not reach its sensor in time, an interlock broke, an output read back wrong, a motor breaker tripped, the oil is hot, or no working pressure; press STOP, then START (it homes). The fault is kept while the safety rail is off |
| off | the safety rail is off (E-stop, a guard open, RESET not given), STOP pressed, or not homed: press START |
