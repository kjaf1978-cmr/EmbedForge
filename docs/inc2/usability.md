# Increment 2 — usability check (section 22 step 4)

Scripted in app/ui/e2e/usability.spec.ts. The timings are the builder's dry runs (an automated
browser), not a person's times. They show that every step works and how many actions it
takes. The run with a person is yours (TEST-02).

## Beginner scenario: the tutorial circuit with the mouse (1366×768)

| Step | Task | Dry-run time |
|---|---|---|
| S1 | Start the tutorial from the start screen | 0.25 s |
| S2 | Place a DC source, a resistor, an LED (rotated with R) and two grounds | 0.49 s |
| S3 | Wire the circuit by clicking pin ends | 0.35 s |
| S4 | Simulate; the LED lights up | 0.09 s |
| S5 | Change the resistor to 330 Ω; the result updates live | 0.22 s |

## Expert scenario: keyboard only (1920×1080)

| Step | Task | Dry-run time |
|---|---|---|
| X1 | New schematic from the command palette | 0.34 s |
| X2 | Place a source, a resistor and a ground with A, search, the arrow keys and Enter | 0.50 s |
| X3 | Wire with W, the arrow keys and Enter | 0.35 s |
| X4 | Simulate (F5) and read the pin currents in Properties | 0.04 s |
| X5 | Switch to a DC sweep and run it | 0.14 s |

## Issues found and fixed

| # | Issue | Fix |
|---|---|---|
| U2-1 | After placing a part, the canvas lost keyboard focus. Shortcuts were ignored until the next click (the canvas was not focusable, and the element under the pointer was re-rendered away). | The canvas is focusable and keeps focus. |
| U2-2 | Keys typed right after pressing A or opening the palette were lost or ran as commands. Typing "resistor" searched for "istor", and the "r" rotated the selected part. | Focus moves at once, not on the next frame. |
| U2-3 | After a wire ended on a pin, the wire tool stayed active, so clicking a part started a new wire. | A finished wire returns to Select. Clicking a pin end starts the next wire. |
| U2-4 | After wiring, the arrow keys moved the last placed part instead of the cursor. | Wiring clears the selection. |
| U2-5 | On a laptop screen, the tutorial card covered part of the canvas. | Tutorial and example hints sit in the side panel. |
| U2-6 | At 1366×768, the results panel squeezed the canvas, and the circuit was cut off. | Panels scale with the window; the view refits until the first edit. |
| U2-7 | The Export menu stayed open after use. | It closes after a choice. |
