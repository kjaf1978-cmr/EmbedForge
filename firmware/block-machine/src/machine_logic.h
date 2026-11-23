// Block moulding machine (P9, D24, D48): the machine's sequence, independent of the Arduino.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The safety does not depend on this code: the E-stop and the guards (two channels) drop the
// safety contactors K1 and K2, which feed every contactor coil and valve (the safety rail); a
// welded contactor refuses the reset. This logic runs the cycle on top of them:
//
// - Homing (START while not at home): tamper up, then the feeder home (it only runs with the tamper
//   up), then the mould down onto a pallet (it waits for one). At home: the mould down, the tamper
//   up, the feeder home, a pallet in place: READY (the lamp on).
// - The cycle (START while READY), one cycle per press:
//   1. the pump on (2 s for the pressure);
//   2. FILL: the feeder runs out and back (it must leave home within 3 s and be home again within
//      20 s) with the vibrators on (pre-vibration);
//   3. PRESS: the tamper down (valve 1) with the vibrators, until "tamper down" (within 10 s);
//   4. VIBRATE: the tamper pressing and the vibrators on for 4 s;
//   5. DEMOULD: the mould up (valve 3) with the tamper still pressing on the blocks, until
//      "mould up" (within 8 s);
//   6. TAMPER UP (valve 2) until "tamper up" (within 8 s);
//   7. PALLET: the pallet with the blocks taken out and an empty one put in ("pallet in place" off,
//      then on again: no time limit);
//   8. MOULD DOWN (valve 4) until "mould down" (within 8 s): READY again.
// - A step that does not reach its sensor in time: FAULT (every output off, the lamp flashing
//   fast; the step's number is kept). STOP clears a fault; the next START homes.
// - STOP (its NC contact open, or its cable broken): every output off at once; the next START
//   homes. The safety rail off (E-stop, a guard, the reset not given): every output off; when it
//   returns nothing starts until START.
// - Interlocks, checked at every step: valves 1 and 2 never together, nor 3 and 4; at most two
//   valves at once; the feeder only with the tamper up; the tamper down only with the feeder home
//   (a sensor that changes against them: FAULT); the vibrators only in FILL, PRESS and VIBRATE.
// - The pump stops after 60 s without hydraulic work; a hydraulic step waits 2 s for it to start.
// - For 0.5 s after start-up nothing is taken (the inputs settle).

#pragma once
#include <stdint.h>

namespace bm {

struct Inputs {
  bool railOn;       // the safety rail (V24S) is on (A4)
  bool stop;         // STOP pressed or its cable broken (A5 high)
  bool start;        // START pressed (one event per press)
  bool mouldUp, mouldDown, tamperUp, tamperDown, feederHome, palletIn;  // the proximity sensors
};

struct Outputs {
  bool pump = false;
  bool tamperDown = false;  // valve 1
  bool tamperUp = false;    // valve 2
  bool mouldUp = false;     // valve 3
  bool mouldDown = false;   // valve 4
  bool feeder = false;      // the mixer / feeder motor's contactor
  bool vibrators = false;   // both vibrator motors' contactors
  bool lamp = false;        // READY / FAULT
};

enum class State : uint8_t {
  Off,          // the safety rail is off
  Idle,         // not homed (after power-up, STOP, a fault or the rail's return)
  HomeTamper, HomeFeeder, HomePallet, HomeMould,
  Ready,
  PumpStart, Fill, Press, Vibrate, Demould, TamperUp, Pallet, MouldDown,
  Fault
};

struct Config {
  uint32_t pumpStartMs = 2000;
  uint32_t feederLeaveMs = 3000;
  uint32_t fillMs = 20000;
  uint32_t pressMs = 10000;
  uint32_t vibrateMs = 4000;
  uint32_t demouldMs = 8000;
  uint32_t tamperUpMs = 8000;
  uint32_t mouldDownMs = 8000;
  uint32_t pumpIdleMs = 60000;
  uint32_t startupMs = 500;
};

class Logic {
 public:
  explicit Logic(const Config& c = Config()) : cfg_(c) {}
  void step(uint32_t nowMs, const Inputs& in);
  const Outputs& outputs() const { return out_; }
  State state() const { return state_; }
  // the step that timed out or broke an interlock (its State), kept while in Fault
  State faultAt() const { return faultAt_; }
  uint32_t cycles() const { return cycles_; }

 private:
  // a new state drives its outputs from the next step: the motion outputs stop for one step (1 ms,
  // far shorter than a valve or a contactor responds), so no state's outputs outlive it
  void enter(uint32_t now, State s) { state_ = s; at_ = now; leftHome_ = false; const bool p = out_.pump; out_ = Outputs(); out_.pump = p; }
  void fault(uint32_t now, State where) { faultAt_ = where; enter(now, State::Fault); }
  bool timedOut(uint32_t now, uint32_t ms) const { return now - at_ >= ms; }
  bool hydraulic(State s) const;
  void drive(uint32_t now, const Inputs& in);

  Config cfg_;
  Outputs out_;
  State state_ = State::Off, faultAt_ = State::Off;
  uint32_t at_ = 0, bootAt_ = 0, pumpOnAt_ = 0, pumpUsedAt_ = 0, cycles_ = 0;
  bool booted_ = false, leftHome_ = false, pumpOn_ = false, palletOut_ = false;
};

}  // namespace bm
