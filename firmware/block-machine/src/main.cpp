// Block moulding machine (P9, D24, D48, D67): the Arduino Mega 2560's program. The board:
// hardware/block-machine, the circuit: app/ui/src/eda/blockMachine.ts.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Pins. Inputs through PC817s (low = the sensor sees its target, the button is pressed, the switch
// is closed):
//   D22 mould up     D23 mould down    D24 tamper up      D25 tamper down
//   D26 feeder home  D27 pallet in     D28 START          D29 STOP (NC: high = pressed or broken)
//   D30 pressure switch (low = the working pressure)      D31 oil temperature (NC: high = hot)
//   D32 the motor breakers (their auxiliary contacts in series: high = one has tripped)
// Outputs (BC547B level shifts to the IRF9540N high-side switches; 47k pull-downs: off while the
// Mega resets): D2 pump, D3 mixer / feeder, D4 vibrator 1, D5 vibrator 2, D6 valve 1 tamper down,
// D7 valve 2 tamper up, D8 valve 3 mould up, D9 valve 4 mould down; D11 the outputs' enable;
// D10 the READY / FAULT lamp.
// Read-backs (47k / 10k: 24 V → 4.2 V), read as analogue values: A0 … A7 the outputs in the order
// above, A9 the outputs' supply after the enable; A8 the safety rail (digital).
// The watchdog (250 ms) resets a hung program; at any reset every output and the enable are off.

#include <Arduino.h>
#include <avr/wdt.h>
#include "machine_logic.h"

// A watchdog reset leaves the watchdog running: stop it before anything else (the Mega's stk500v2
// bootloader since 2012 does too; this covers a board without it)
void wdtOff() __attribute__((naked, used, section(".init3")));
void wdtOff() { MCUSR = 0; wdt_disable(); }

namespace {

constexpr uint8_t kOut[bm::NOut] = {2, 3, 4, 5, 6, 7, 8, 9};
constexpr uint8_t kLamp = 10, kEnable = 11;
constexpr uint8_t kRb[bm::NOut] = {A0, A1, A2, A3, A4, A5, A6, A7};
constexpr uint8_t kRail = A8, kEnableRb = A9;
// the inputs: D22 … D32
enum In : uint8_t { MouldUp, MouldDown, TamperUp, TamperDown, FeederHome, Pallet, Start, Stop, Pressure, Oil, Breakers, NIn };

bm::Logic logic;

// a level that must hold for `ms` before it counts
struct Debounced {
  uint8_t pin; uint16_t ms; bool level; bool candidate; uint32_t since;
  bool read(uint32_t now) {
    const bool v = digitalRead(pin) == HIGH;
    if (v != candidate) { candidate = v; since = now; }
    else if (v != level && now - since >= ms) level = v;
    return level;
  }
};
// at power-up every input reads "not active" (high) until it has been read stable
Debounced ins[NIn] = {
  {22, 20, true, true, 0}, {23, 20, true, true, 0}, {24, 20, true, true, 0}, {25, 20, true, true, 0},
  {26, 20, true, true, 0}, {27, 20, true, true, 0}, {28, 50, true, true, 0}, {29, 50, true, true, 0},
  {30, 50, true, true, 0}, {31, 200, true, true, 0}, {32, 50, true, true, 0}};
Debounced rail{kRail, 20, false, false, 0};
bool lastStart = false;

}  // namespace

void setup() {
  for (uint8_t p : kOut) { digitalWrite(p, LOW); pinMode(p, OUTPUT); }
  digitalWrite(kLamp, LOW); pinMode(kLamp, OUTPUT);
  digitalWrite(kEnable, LOW); pinMode(kEnable, OUTPUT);
  for (const Debounced& d : ins) pinMode(d.pin, INPUT);  // the board's 10k pull-ups and PC817s
  for (uint8_t p : kRb) pinMode(p, INPUT);
  pinMode(kRail, INPUT); pinMode(kEnableRb, INPUT);
  wdt_enable(WDTO_250MS);
}

void loop() {
  wdt_reset();
  const uint32_t now = millis();

  bm::Inputs in;
  bool v[NIn];
  for (uint8_t k = 0; k < NIn; ++k) v[k] = !ins[k].read(now);  // true: active (low)
  // STOP acts at once (no debounce to stop); it is released only once closed for 50 ms
  in.stop = digitalRead(29) == HIGH || !v[Stop];
  in.railOn = rail.read(now);
  in.start = v[Start] && !lastStart;  // one event per press
  lastStart = v[Start];
  in.mouldUp = v[MouldUp]; in.mouldDown = v[MouldDown]; in.tamperUp = v[TamperUp]; in.tamperDown = v[TamperDown];
  in.feederHome = v[FeederHome]; in.palletIn = v[Pallet];
  in.pressureOk = v[Pressure];
  in.oilOk = v[Oil];
  in.breakersOk = v[Breakers];
  // the read-backs in volts, undebounced (an output on while commanded off must be seen within
  // 5 ms): 47k / 10k, so 5 V at the pin is 28.5 V; nine conversions take about 1 ms
  auto mv = [](uint8_t pin) -> uint16_t { return (uint16_t)((uint32_t)analogRead(pin) * 28500UL / 1023UL); };
  for (uint8_t k = 0; k < bm::NOut; ++k) in.fedMv[k] = mv(kRb[k]);
  in.enableMv = mv(kEnableRb);
  logic.step(now, in);

  const bm::Outputs& o = logic.outputs();
  // the outputs before the enable when it goes off, after it when it comes on
  if (!o.enable) digitalWrite(kEnable, LOW);
  for (uint8_t k = 0; k < bm::NOut; ++k) digitalWrite(kOut[k], o.out[k] ? HIGH : LOW);
  if (o.enable) digitalWrite(kEnable, HIGH);
  digitalWrite(kLamp, o.lamp ? HIGH : LOW);
}
