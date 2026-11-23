// Block moulding machine (P9, D24, D48): the Arduino Nano's program. The board:
// hardware/block-machine, the circuit: app/ui/src/eda/blockMachine.ts.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Pins (the Nano U-pin numbers of the schematic in brackets). Inputs through PC817s: low = the
// sensor sees its target (or START pressed):
//   D2 (5)  IN1  mould up          D6 (9)  IN5  feeder home
//   D3 (6)  IN2  mould down        D7 (10) IN6  pallet in place
//   D4 (7)  IN3  tamper up         D8 (11) IN7  START
//   D5 (8)  IN4  tamper down       A5 (24) IN8  STOP (NC): high = pressed or its cable broken
//   A4 (23) SRS  the safety rail (V24S through 47k / 10k): high = on
// Outputs (IRLZ44N drivers with 10k pull-downs: off while the Nano resets):
//   D9 (12)  PUMP        D10 (13) valve 1 tamper down   D11 (14) valve 2 tamper up
//   D12 (15) valve 3 mould up   A3 (22) valve 4 mould down
//   A0 (19)  MIXER / feeder     A1 (20), A2 (21) the vibrators   D13 (16) READY / FAULT lamp
// The watchdog (250 ms) resets a hung program; at any reset every output is off.

#include <Arduino.h>
#include <avr/wdt.h>
#include "machine_logic.h"

// A watchdog reset leaves the watchdog running: stop it before anything else (with the Optiboot
// bootloader; the old one loops after a watchdog reset)
void wdtOff() __attribute__((naked, used, section(".init3")));
void wdtOff() { MCUSR = 0; wdt_disable(); }

namespace {

constexpr uint8_t kMouldUp = 2, kMouldDown = 3, kTamperUp = 4, kTamperDown = 5, kFeederHome = 6, kPallet = 7, kStart = 8;
constexpr uint8_t kPump = 9, kV1 = 10, kV2 = 11, kV3 = 12, kLamp = 13;
constexpr uint8_t kV4 = A3, kMixer = A0, kVib1 = A1, kVib2 = A2, kRail = A4, kStop = A5;

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
// the sensors (20 ms; at power-up "not seen": high), START (50 ms), the rail (20 ms)
Debounced sensors[] = {{kMouldUp, 20, true, true, 0}, {kMouldDown, 20, true, true, 0}, {kTamperUp, 20, true, true, 0},
                       {kTamperDown, 20, true, true, 0}, {kFeederHome, 20, true, true, 0}, {kPallet, 20, true, true, 0}};
Debounced startIn{kStart, 50, true, true, 0}, rail{kRail, 20, false, false, 0}, stopRelease{kStop, 50, true, true, 0};
bool lastStart = false;

}  // namespace

void setup() {
  const uint8_t outs[] = {kPump, kV1, kV2, kV3, kV4, kMixer, kVib1, kVib2, kLamp};  // (no <initializer_list> on avr-gcc)
  for (uint8_t p : outs) { digitalWrite(p, LOW); pinMode(p, OUTPUT); }
  const uint8_t ins[] = {kMouldUp, kMouldDown, kTamperUp, kTamperDown, kFeederHome, kPallet, kStart, kRail, kStop};
  for (uint8_t p : ins) pinMode(p, INPUT);  // the board's 10k pull-ups and PC817s
  wdt_enable(WDTO_250MS);
}

void loop() {
  wdt_reset();
  const uint32_t now = millis();

  bm::Inputs in;
  // STOP acts at once (no debounce to stop); it is released only once low for 50 ms
  const bool stopRaw = digitalRead(kStop) == HIGH;
  const bool stopHeld = stopRelease.read(now);
  in.stop = stopRaw || stopHeld;
  in.railOn = rail.read(now);
  const bool start = !startIn.read(now);
  in.start = start && !lastStart;  // one event per press
  lastStart = start;
  in.mouldUp = !sensors[0].read(now);
  in.mouldDown = !sensors[1].read(now);
  in.tamperUp = !sensors[2].read(now);
  in.tamperDown = !sensors[3].read(now);
  in.feederHome = !sensors[4].read(now);
  in.palletIn = !sensors[5].read(now);
  logic.step(now, in);

  const bm::Outputs& o = logic.outputs();
  digitalWrite(kPump, o.pump ? HIGH : LOW);
  digitalWrite(kV1, o.tamperDown ? HIGH : LOW);
  digitalWrite(kV2, o.tamperUp ? HIGH : LOW);
  digitalWrite(kV3, o.mouldUp ? HIGH : LOW);
  digitalWrite(kV4, o.mouldDown ? HIGH : LOW);
  digitalWrite(kMixer, o.feeder ? HIGH : LOW);
  digitalWrite(kVib1, o.vibrators ? HIGH : LOW);
  digitalWrite(kVib2, o.vibrators ? HIGH : LOW);
  digitalWrite(kLamp, o.lamp ? HIGH : LOW);
}
