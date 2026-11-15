# Mains voltage stabiliser 1 kVA (P4): user manual

A step-type automatic voltage regulator (AVR) for appliances up to 1 kVA (4.3 A at 230 V) on a
grid whose voltage wanders: refrigerators, freezers, televisions, pumps, small workshops.

> **Safety.** This unit works at mains voltage. It must be installed and serviced by a
> qualified electrician, following the local wiring rules. It has not been certified, and no
> prototype has been built yet (see TYPE_TESTS.md). It is not an isolating transformer: the
> output is not separated from the mains.

## 1. What it does

The input is connected to one of seven taps of an autotransformer (150, 170, 190, 210, 230,
250 and 280 V), and the output is taken from its 230 V tap. A relay chain chooses the tap from
the measured input voltage:

| Input voltage | Tap used | Output (calculated, V_in · 230 / tap) |
|---|---|---|
| below about 160 V | 150 V | 215 … 245 V (140 … 160 V in) |
| 160 … 180 V | 170 V | 216 … 244 V |
| 180 … 200 V | 190 V | 218 … 242 V |
| 200 … 220 V | 210 V | 219 … 241 V |
| 220 … 240 V | 230 V | 220 … 240 V |
| 240 … 265 V | 250 V | 221 … 244 V |
| above about 265 V | 280 V | 218 … 246 V (265 … 300 V in) |

Behaviour:

- **Output range.** Over 140 … 300 V of input, the output stays within 230 V ± 10 %. About 3 V of
  hysteresis at each step stops the relays changing back and forth.
- **Restart delay.** The output relay connects the load only after a delay of about 8 s, after
  power-on and after every cut-off. Fridge compressors need longer: give them their own
  3-minute restart-delay relay (INSTALLATION.md).
- **Independent protection.** A second circuit, with its own sense transformer, watches the
  output. If it leaves 190 … 255 V, for example because of a welded tap relay or a control fault,
  the output relay opens and the restart delay starts again.
- **Overheating.** A thermal cut-out in the transformer winding (115 °C) opens the output relay.
  The load stays off until the transformer has cooled; then the restart delay runs and the
  output returns.
- **Surges.** A thermally protected varistor limits surges between L and N.

## 2. Indicators

| LED | Colour | Meaning |
|---|---|---|
| TAP 1 … TAP 6 | yellow | the tap relays that are energised; the first one in the chain chooses the tap |
| OUTPUT | green | the output relay is closed: the load is supplied |
| FAULT | red | the independent protection has found the output outside 190 … 255 V |

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
| Green off for about 8 s after switch-on | restart delay | wait |
| Green off, red on | output out of range (input outside 140 … 300 V, or a fault) | if the input is normal, call the electrician (a relay may be welded) |
| Green off, red off, yellow LEDs normal | the transformer is too hot (thermal cut-out), or the output relay has failed | let it cool; reduce the load; if it repeats with a normal load, call the electrician |
| Nothing on | no input, the breaker Q1 has tripped, or the control fuse F1 has blown | check the breaker; then the electrician |

## 3. Use

Connect only up to 1 kVA (4.3 A at 230 V). A motor's starting current counts. For a fridge the
rule of thumb is three times its running power.

The stabiliser draws more current from a low grid than it delivers: up to 7 A at 140 V input.
The input breaker Q1 is C10 for this reason.

## 4. Maintenance

**Every year (electrician):**

- Check the terminal screws.
- Look for heat discolouration at the transformer and the relays.
- Clean the dust from the vents.
- Watch a few tap changes (raise or lower the input with a variac, COMMISSIONING.md step 4)
  and listen for a relay that buzzes.

**Relays:** the tap relays are the parts that wear. At 200 tap changes a day their calculated
life is more than 60 years (RELIABILITY.md). Replace a relay whose LED lights but whose tap does
not change.

**Varistor:** check it after a known lightning event, or every 5 years (COMMISSIONING.md
step 5).

## 5. Technical data

| | |
|---|---|
| Rated power | 1 kVA at the output (4.3 A at 230 V) |
| Input range | 140 … 300 V, 50 Hz (the output stays within 230 V ± 10 %) |
| Protection window | output 190 … 255 V, else the load is cut off |
| Restart delay | about 8 s |
| Input protection | C10 breaker; T 0.2 A fuse for the control supply; thermally protected 300 V varistor L–N |
| Transformer | autotransformer 1 kVA, 7 taps, class F, thermal cut-out 115 °C |
| Efficiency, no-load loss | set by the autotransformer (its data sheet; measured in TT-1) |
| Ambient | designed and simulated at 25 °C; the range is set by the type tests |
