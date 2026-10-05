# Glossary

**Active:**
- For a part with a manufacturer part number: in production and not marked not-recommended or
  obsolete.
- For a module: stocked by at least two sources, with its main chip active.

**Baseline:** a named, restorable set of versions.

**Build style:** how the project is built: manufactured PCB, perfboard/stripboard, or
solderless breadboard.

**Code verified:** the label on generated code that has passed compilation, static analysis,
unit tests, pin consistency and emulation checks.

**Emulatable requirement:** a requirement whose behaviour depends only on parts, including the
board, that have a qualified emulation model.

**Generated region:** code produced from the pin map or parameters, shown read-only and
changed only through those views.

**HIL (hardware-in-the-loop):** a check you perform on the physical build. Until you record a
result, the requirement shows "HIL-pending".

**Host:** the computer running EmbedForge.

**Kit part:** a part supplied in an ELEGOO or SunFounder kit. If it is not a standard part it
can be emulated for learning, but a design uses an active equivalent.

**Part style:** module build (breakout modules) or discrete build (individual components).

**Standard part:** a catalogue part, discrete or module, that is active and has a reviewed
datasheet or parameter sheet.

**Standard value:**
- Resistors: E12, E24 or E96 values.
- Capacitors: E6 or E12, or a value listed as stocked.
- Other parts: a value listed as stocked.

**Target board:** the Arduino, Pico or Raspberry Pi that the project runs on.

**Verified-auto:** every automated condition of "Verified" is met; only your review record is
still missing.
