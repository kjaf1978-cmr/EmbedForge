// Gate controller (P9, D25, D48): the Arduino Nano's program. The board: hardware/gate-controller,
// the circuit: app/ui/src/eda/gate.ts.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Pins (the schematic's Nano U1, its pin numbers in brackets):
//   D2 (5)  FLTN   input, low: the cut-off has tripped (latched in hardware; INT0 not needed)
//   D3 (6)  IRO    input, the TSOP38238's output (INT1, every edge timed)
//   D4 (7)  LRN    input, the LEARN button (pulled up, low while pressed)
//   D5 (8)  OPEN   output, the open relay's driver
//   D6 (9)  CLOSE  output, the close relay's driver
//   D7 (10) CLR    output, releases the cut-off's latch
//   D9 (12) RUN    output, the motor MOSFET
//   A0 (19) LOI    input, high: the open limit switch closed (not at the open end)
//   A1 (20) LCI    input, high: the close limit and the photo-beam both closed
//   A2 (21) LBI    input, high: the close limit closed (not at the closed end)
// The watchdog (250 ms) resets a hung program; after any reset the outputs are low and the
// cut-off has tripped (in hardware), so nothing moves until the program runs again.

#include <Arduino.h>
#include <EEPROM.h>
#include <avr/wdt.h>
#include "gate_logic.h"
#include "nec.h"
#include "remotes.h"

namespace {

constexpr uint8_t kFltn = 2, kIr = 3, kLearn = 4, kOpen = 5, kClose = 6, kClr = 7, kRun = 9;
constexpr uint8_t kLoi = A0, kLci = A1, kLbi = A2;

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

// ---- the limit and beam inputs: a level must hold for 20 ms (switch bounce)
struct Debounced {
  uint8_t pin; bool level; bool candidate; uint32_t since;
  bool read(uint32_t now) {
    const bool v = digitalRead(pin) == HIGH;
    if (v != candidate) { candidate = v; since = now; }
    else if (v != level && now - since >= 20) level = v;
    return level;
  }
};
// at power-up the inputs count as "at the end / broken" until they have been read stable
Debounced loi{kLoi, false, false, 0}, lci{kLci, false, false, 0}, lbi{kLbi, false, false, 0};

// ---- the EEPROM: four slots of 5 bytes (a marker 0xA5, then the frame)
void loadRemotes() {
  for (uint8_t s = 0; s < remotes::kMax; ++s) {
    const int a = s * 5;
    uint32_t f = 0;
    for (uint8_t b = 0; b < 4; ++b) f |= (uint32_t)EEPROM.read(a + 1 + b) << (8 * b);
    table.load(s, f, EEPROM.read(a) == 0xA5);
  }
}
void saveRemote(uint8_t s) {
  const int a = s * 5;
  const uint32_t f = table.code(s);
  for (uint8_t b = 0; b < 4; ++b) EEPROM.update(a + 1 + b, (uint8_t)(f >> (8 * b)));
  EEPROM.update(a, 0xA5);
}

}  // namespace

void setup() {
  // outputs low before anything else (the drivers are pulled down on the board too)
  const uint8_t outs[] = {kOpen, kClose, kClr, kRun};  // (no <initializer_list> on avr-gcc)
  for (uint8_t p : outs) { digitalWrite(p, LOW); pinMode(p, OUTPUT); }
  pinMode(kFltn, INPUT);
  pinMode(kIr, INPUT);
  pinMode(kLearn, INPUT_PULLUP);
  pinMode(kLoi, INPUT); pinMode(kLci, INPUT); pinMode(kLbi, INPUT);
  loadRemotes();
  attachInterrupt(digitalPinToInterrupt(kIr), onIrEdge, CHANGE);
  wdt_enable(WDTO_250MS);
}

void loop() {
  wdt_reset();
  const uint32_t now = millis();

  // the remote: decode the received edges; a paired frame is a command, LEARN pairs one
  bool command = false;
  while (tail != head) {
    noInterrupts();
    const Edge e{ring[tail].us, ring[tail].low};
    tail = (uint8_t)((tail + 1) & 63);
    interrupts();
    if (decoder.feed(e.low, e.us) != nec::Result::Frame) continue;
    const uint32_t f = decoder.frame();
    if (digitalRead(kLearn) == LOW) { const uint8_t s = table.learn(f); if (s < remotes::kMax) saveRemote(s); continue; }
    if (table.contains(f) && debounce.accept(now)) command = true;
  }

  gate::Inputs in;
  in.fault = digitalRead(kFltn) == LOW;
  in.openLimitOk = loi.read(now);
  in.closeChainOk = lci.read(now);
  in.closeLimitOk = lbi.read(now);
  in.command = command;
  logic.step(now, in);

  const gate::Outputs& o = logic.outputs();
  // RUN off first, relays after; the logic never changes a relay with RUN on
  if (!o.run) digitalWrite(kRun, LOW);
  digitalWrite(kOpen, o.open ? HIGH : LOW);
  digitalWrite(kClose, o.close ? HIGH : LOW);
  digitalWrite(kClr, o.clr ? HIGH : LOW);
  if (o.run) digitalWrite(kRun, HIGH);
}
