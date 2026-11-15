# Mains voltage stabiliser 1 kVA (P4): user manual

A step-type automatic voltage regulator (AVR) for appliances up to 1 kVA (4.3 A at 230 V) on a
grid whose voltage wanders: refrigerators, freezers, televisions, pumps, small workshops.

> **Safety.** This unit works at mains voltage, and the whole control board is live. It must be
> installed and serviced by a qualified electrician, following the local wiring rules. It has
> not been certified, and no prototype has been built yet (see TYPE_TESTS.md). It is not an
> isolating transformer: the output is not separated from the mains.

## 1. What it does

The input is connected to one of seven taps of an autotransformer (150, 170, 190, 210, 230,
250 and 280 V). The output is taken from its 230 V tap. A relay chain chooses the tap from the
measured input voltage:

| Input voltage | Tap used | Output (calculated, V_in · 230 / tap) |
|---|---|---|
| below about 160 V | 150 V | 215 … 245 V (140 … 160 V in) |
| 160 … 180 V | 170 V | 216 … 244 V |
| 180 … 200 V | 190 V | 218 … 242 V |
| 200 … 220 V | 210 V | 219 … 241 V |
| 220 … 240 V | 230 V | 220 … 240 V |
| 240 … 265 V | 250 V | 221 … 244 V |
| above about 265 V | 280 V | 218 … 246 V (265 … 300 V in) |

The voltages in the table are the rising switching points. On the way down, each step changes
about 5 V lower (hysteresis), so the relays do not change back and forth.

Behaviour:

- **Output range.** Over 140 … 300 V of input, the output stays within 230 V ± 10 %, and never
  above 253 V.
- **A short gap at each tap change.** The input relay opens before a tap changes and closes
  again afterwards, so no tap relay switches current. The load sees a gap of about 60 ms at
  each tap change: lamps blink, and a computer without its own UPS may restart. A running motor
  restarts from the gap like after a short dip.
- **Start-up.** At switch-on the unit first measures the input (about 1 s, the input relay
  open), then connects the transformer, and connects the load after a restart delay. The load
  is supplied about 8.5 s after switch-on. The same delay runs after every cut-off. Fridge
  compressors need longer: give them their own 3-minute restart-delay relay (INSTALLATION.md).
- **Independent protection.** A second circuit, with its own sense transformer, reference and
  its own output relay, watches the output. If the output leaves 190 … 255 V, its relay opens.
  This happens if the input is outside about 124 … 310 V, or if a tap relay or the control has
  failed. The restart delay then starts again.
- **Overheating.** A thermal cut-out in the transformer winding (115 °C, resets itself when the
  winding has cooled) opens the input relay and the output relay: the transformer is switched
  off, not only its load. After cooling, the start-up and the restart delay run again.
- **Surges.** A thermally protected varistor limits surges between L and N.

## 2. Indicators

| LED | Colour | Meaning |
|---|---|---|
| TAP 1 … TAP 6 | yellow | the tap relays that are energised; the first one in the chain chooses the tap |
| OUTPUT | green | the restart delay has run and the output relay is closed |
| FAULT | red | the independent protection does not find the output within 190 … 255 V |

The number of yellow LEDs shows how low the input is:

| Yellow LEDs on | Input |
|---|---|
| none | above about 265 V |
| TAP 6 | 240 … 265 V |
| TAP 5 and 6 | 220 … 240 V |
| TAP 4 to 6 | 200 … 220 V |
| TAP 3 to 6 | 180 … 200 V |
| TAP 2 to 6 | 160 … 180 V |
| all six | below about 160 V |

| What you see | Meaning | What to do |
|---|---|---|
| Green on | normal | nothing |
| Red for about 1 s, then green after about 8.5 s, at switch-on | start-up and restart delay | wait |
| Green off, red on, the input normal (yellow LEDs as in the table) | the output is out of range: a relay or the control has failed; or the transformer is too hot (the cut-out has opened the input relay) | switch off. If the unit is hot, let it cool and reduce the load. Otherwise, or if it repeats with a normal load, call the electrician |
| Green off, red on, the input known to be very low or high | the input is outside about 124 … 310 V | wait for the grid to recover |
| Nothing on | no input, the breaker Q1 has tripped, or the supply fuse F1 has blown | check the breaker; then the electrician |

## 3. Use

Connect only up to 1 kVA (4.3 A at 230 V). A motor's starting current counts: for a fridge, the
rule of thumb is three times its running power.

The stabiliser draws more current from a low grid than it delivers: up to 7.1 A at 140 V input.
For this reason the input breaker Q1 is a C10.

## 4. Maintenance

**Every year (electrician):**

- Check the terminal screws to the torques in INSTALLATION.md.
- Look for heat discolouration at the transformer and the relays.
- Clean the dust from the vents.
- Repeat the protection checks (COMMISSIONING.md, section 5).
- Watch a few tap changes (raise or lower the input with a variac, COMMISSIONING.md section 4)
  and listen for a relay that buzzes.

**Relays:** the input relay K8 makes and breaks the load current at every tap change, so it is
the part that wears. The tap relays switch without current. The life is confirmed by type test
TT-4. Replace a relay whose LED lights but whose tap does not change.

**Varistor:** check it after a known lightning event, or every 5 years (COMMISSIONING.md
section 6).

## 5. Technical data

| | |
|---|---|
| Rated power | 1 kVA at the output (4.3 A at 230 V) |
| Input range | 140 … 300 V, 50 Hz (the output stays within 230 V ± 10 %) |
| Input current | up to 7.1 A at 140 V |
| Tap change | 6 steps, about 5 V hysteresis; the load sees a gap of about 60 ms at each change |
| Protection window | output 190 … 255 V, else the load is cut off by the protection's own relay |
| Start-up, restart delay | load supplied about 8.5 s after switch-on and after each cut-off |
| Input protection | C10 breaker 1P+N; T 1 A fuse for the control supply; thermally protected 300 V varistor L–N |
| Control supply | AC-DC module 85 … 305 V AC to 12 V, 15 W |
| Transformer | autotransformer 1 kVA, 7 taps, class F, thermal cut-out 115 °C, self-resetting |
| Insulation | protection class I; the control board is not isolated from the mains |
| Efficiency, no-load loss | set by the autotransformer (its data sheet; measured in TT-1) |
| Ambient | designed and simulated at 25 °C; the range is set by the type tests |
