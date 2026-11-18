// Gate controller (P9, D25, D48): the Arduino Nano's program. The board: hardware/gate-controller,
// the circuit: app/ui/src/eda/gate.ts.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Pins (the schematic's Nano U2, its pin numbers in brackets):
//   D2 (5)  FLTN   input, low: the cut-off has tripped (latched in hardware)
//   D3 (6)  IRO    input, the TSOP38238's output (INT1, every edge timed)
//   D4 (7)  LRN    input, the LEARN button (pulled up, low while pressed)
//   D5 (8)  OPEN   output, the open relay's driver
//   D6 (9)  CLOSE  output, the close relay's driver
//   D7 (10) CLR    output, releases the cut-off's latch (on its rising edge)
//   D8 (11) BTX    output, the photo-beam transmitter's supply (high: on)
//   D9 (12) RUN    output, the motor MOSFET
//   D13 (16)       the Nano's LED: the program's state (below)
//   A0 (19) LOI    input, high: the open limit switch closed (not at the open end)
//   A1 (20) LCI    input, high: the close limit and the photo-beam both closed
//   A2 (21) LBI    input, high: the close limit closed (not at the closed end)
//   A3 (22) KSI    input, low: the push-button / key-switch pressed
// The watchdog (250 ms) resets a hung program. At any reset the pins are inputs: the drivers'
// pull-downs turn RUN, both relays and the beam's transmitter off, so the motor stops and a close
// cannot start; nothing moves until the program runs again and a command is given.
//
// The LED: a short flash every second (running); on while LEARN is held; three flashes when a
// remote is paired; fast flashing after 10 s of LEARN (every pairing erased); two flashes every
// second: lockout or a failed beam test; on steadily while STOP is pressed.

#include <Arduino.h>
#include <EEPROM.h>
#include <avr/wdt.h>
#include "gate_logic.h"
#include "nec.h"
#include "remotes.h"

// A watchdog reset leaves the watchdog running at its shortest period; the bootloader or this
// program must stop it at once, or the Nano resets again and again. Before main():
void wdtOff() __attribute__((naked, used, section(".init3")));
void wdtOff() { MCUSR = 0; wdt_disable(); }

namespace {

constexpr uint8_t kFltn = 2, kIr = 3, kLearn = 4, kOpen = 5, kClose = 6, kClr = 7, kBeamTx = 8, kRun = 9, kLed = 13;
constexpr uint8_t kLoi = A0, kLci = A1, kLbi = A2, kKey = A3;

gate::Logic logic;
nec::Decoder decoder;
remotes::Table table;
remotes::Debounce debounce;

// ---- the IR receiver: each edge's level and duration into a small ring (read in loop)
struct Edge { uint32_t us; bool low; };
volatile Edge ring[64];
volatile uint8_t head = 0, tail = 0;
volatile uint32_t lastEdgeUs = 0;

void onIrEdge() {
  const uint32_t now = micros();
  // the level that just ended: the pin is now high, so it was low (a burst), and the reverse
  const bool endedLow = digitalRead(kIr) == HIGH;
  const uint8_t next = (uint8_t)((head + 1) & 63);
  if (next != tail) { ring[head].us = now - lastEdgeUs; ring[head].low = endedLow; head = next; }
  lastEdgeUs = now;
}

// ---- the limit and beam inputs, read together as one word: it must hold for 20 ms (switch
// bounce), so inputs that change together (the close limit opens A1 and A2) are taken together
struct Inputs3 {
  uint8_t level = 0, candidate = 0; uint32_t since = 0;  // at power-up: "at the end / broken"
  uint8_t read(uint32_t now) {
    const uint8_t v = (uint8_t)((digitalRead(kLoi) == HIGH) | ((digitalRead(kLci) == HIGH) << 1) | ((digitalRead(kLbi) == HIGH) << 2));
    if (v != candidate) { candidate = v; since = now; }
    else if (v != level && now - since >= 20) level = v;
    return level;
  }
} limits;

// ---- the push-button / key-switch: 50 ms stable, one command per press
struct Key {
  bool level = false, candidate = false; uint32_t since = 0;
  bool pressed(uint32_t now) {
    const bool v = digitalRead(kKey) == LOW;
    if (v != candidate) { candidate = v; since = now; return false; }
    if (v != level && now - since >= 50) { level = v; return v; }
    return false;
  }
} key;

// ---- the EEPROM: four slots of 7 bytes (a marker 0xA6, the sequence number, the frame)
constexpr uint8_t kSlot = 7, kMarker = 0xA6;
void loadRemotes() {
  for (uint8_t s = 0; s < remotes::kMax; ++s) {
    const int a = s * kSlot;
    uint32_t f = 0;
    for (uint8_t b = 0; b < 4; ++b) f |= (uint32_t)EEPROM.read(a + 3 + b) << (8 * b);
    const uint16_t seq = (uint16_t)(EEPROM.read(a + 1) | (EEPROM.read(a + 2) << 8));
    table.load(s, f, EEPROM.read(a) == kMarker, seq);
  }
}
void saveRemote(uint8_t s) {
  const int a = s * kSlot;
  const uint32_t f = table.code(s);
  EEPROM.update(a, 0xFF);  // invalid while it is written
  EEPROM.update(a + 1, (uint8_t)table.seq(s)); EEPROM.update(a + 2, (uint8_t)(table.seq(s) >> 8));
  for (uint8_t b = 0; b < 4; ++b) EEPROM.update(a + 3 + b, (uint8_t)(f >> (8 * b)));
  EEPROM.update(a, kMarker);
}
void eraseRemotes() {
  table.clear();
  for (uint8_t s = 0; s < remotes::kMax; ++s) EEPROM.update(s * kSlot, 0xFF);
}

// ---- the LED
uint32_t flashUntil = 0, learnSince = 0;
uint8_t flashKind = 0;  // 1: paired (three flashes), 2: erased (fast flashing)
bool learnHeld = false, erased = false;
bool led(uint32_t now) {
  if (now < flashUntil) return flashKind == 1 ? (now / 150) % 2 == 0 : (now / 60) % 2 == 0;
  if (learnHeld) return true;
  if (logic.stopPressed()) return true;
  const uint32_t ph = now % 1000;
  if (logic.state() == gate::State::Lockout || logic.beamFault()) return ph < 80 || (ph >= 200 && ph < 280);
  return ph < 50;
}

}  // namespace

void setup() {
  // outputs low before anything else (the drivers are pulled down on the board too)
  const uint8_t outs[] = {kOpen, kClose, kClr, kRun, kBeamTx, kLed};  // (no <initializer_list> on avr-gcc)
  for (uint8_t p : outs) { digitalWrite(p, LOW); pinMode(p, OUTPUT); }
  pinMode(kFltn, INPUT);
  pinMode(kIr, INPUT);
  pinMode(kLearn, INPUT_PULLUP);
  pinMode(kLoi, INPUT); pinMode(kLci, INPUT); pinMode(kLbi, INPUT); pinMode(kKey, INPUT);
  loadRemotes();
  attachInterrupt(digitalPinToInterrupt(kIr), onIrEdge, CHANGE);
  wdt_enable(WDTO_250MS);
}

void loop() {
  wdt_reset();
  const uint32_t now = millis();

  // LEARN: held 10 s without pairing erases every pairing
  const bool learn = digitalRead(kLearn) == LOW;
  if (learn && !learnHeld) { learnSince = now; erased = false; }
  learnHeld = learn;
  if (learn && !erased && now - learnSince >= 10000) { eraseRemotes(); erased = true; flashKind = 2; flashUntil = now + 2000; }

  // the remote: decode the received edges; a paired frame is a command, LEARN pairs one
  bool command = false;
  while (tail != head) {
    noInterrupts();
    const Edge e{ring[tail].us, ring[tail].low};
    tail = (uint8_t)((tail + 1) & 63);
    interrupts();
    if (decoder.feed(e.low, e.us) != nec::Result::Frame) continue;
    const uint32_t f = decoder.frame();
    if (learn) {
      const uint8_t s = table.learn(f);
      if (s < remotes::kMax) saveRemote(s);
      learnSince = now;  // pairing restarts the 10 s
      flashKind = 1; flashUntil = now + 900;
      continue;
    }
    if (table.contains(f) && debounce.accept(now)) command = true;
  }
  if (key.pressed(now)) command = true;

  const uint8_t l = limits.read(now);
  gate::Inputs in;
  in.fault = digitalRead(kFltn) == LOW;
  in.openLimitOk = l & 1;
  in.closeChainOk = l & 2;
  in.closeLimitOk = l & 4;
  in.command = command;
  logic.step(now, in);

  const gate::Outputs& o = logic.outputs();
  // RUN off first, relays after; the logic never changes a relay with RUN on
  if (!o.run) digitalWrite(kRun, LOW);
  digitalWrite(kOpen, o.open ? HIGH : LOW);
  digitalWrite(kClose, o.close ? HIGH : LOW);
  digitalWrite(kClr, o.clr ? HIGH : LOW);
  digitalWrite(kBeamTx, o.beamTx ? HIGH : LOW);
  if (o.run) digitalWrite(kRun, HIGH);
  digitalWrite(kLed, led(now) ? HIGH : LOW);
}
