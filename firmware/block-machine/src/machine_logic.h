// Block moulding machine (P9, D24, D48): the machine's sequence, independent of the Arduino.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The safety does not depend on this code: the E-stop and the guards (each on a certified safety
// relay) drop the safety contactors K1 and K2, which feed every contactor coil and valve (the
// safety rail); a welded contactor refuses the reset. This logic runs the cycle on top of them,
// and checks the outputs (D66):
// - the outputs' common enable switch is turned on only with every output off, and never while
//   STOP is held or in FAULT; each output is read back in volts: one above 5 V while commanded off
//   (a shorted switch) drops the enable within 5 ms, before its contactor or valve can pull in
//   (15 … 40 ms), and is a FAULT; one more than 1.2 V below the outputs' supply 5 ms after it was
//   commanded on (a short, a wire to the frame, a partial short holding it in its current limit:
//   its MOSFET would overheat) is a FAULT; the enable is read back the same way;
// - the motor breakers' auxiliary contacts (a trip), the oil temperature switch (hot): FAULT;
// - PRESS ends at "tamper down" with the working pressure (the pressure switch).
//
// - Homing (START while not at home): tamper up, then the feeder home (it only runs with the tamper
//   up), then the mould down onto a pallet (it waits for one). At home: the mould down, the tamper
//   up, the feeder home, a pallet in place: READY (the lamp on).
// - The cycle (START while READY), one cycle per press:
//   1. the pump on (2 s for the pressure);
//   2. FILL: the feeder runs out and back (it must leave home within 3 s and be home again within
//      20 s) with the vibrators on (pre-vibration);
//   3. PRESS: the tamper down (valve 1) with the vibrators, until "tamper down" and the pressure
//      switch (within 10 s);
//   4. VIBRATE: the tamper pressing and the vibrators on for 4 s;
//   5. DEMOULD: the mould up (valve 3) with the tamper still pressing on the blocks, until
//      "mould up" (within 8 s);
//   6. TAMPER UP (valve 2) until "tamper up" (within 8 s);
//   7. PALLET: the pallet with the blocks taken out and an empty one put in ("pallet in place" off,
//      then on again: no time limit);
//   8. MOULD DOWN (valve 4) until "mould down" (within 8 s): READY again.
// - A step that does not reach its sensor in time: FAULT (every output off, the lamp flashing
//   fast; the step and the cause are kept, also while the safety rail is off). STOP clears a
//   fault on its release (a STOP held or its cable broken does not); the next START homes.
// - STOP (its NC contact open, or its cable broken): every output off at once; the next START
//   homes. The safety rail off (E-stop, a guard, the reset not given): every output off; when it
//   returns nothing starts until START.
// - Sensor plausibility: a cylinder's two end sensors both on, or the end a move starts from still
//   seen 1 s after the move began (a sensor or its opto stuck on): FAULT (sensor).
// - Interlocks, checked at every step: valves 1 and 2 never together, nor 3 and 4; at most two
//   valves at once; the feeder only with the tamper up; the tamper down only with the feeder home
//   (a sensor that changes against them: FAULT); the vibrators only in FILL, PRESS and VIBRATE.
// - The pump stops after 60 s without hydraulic work; a hydraulic step waits 2 s for it to start.
// - For 0.5 s after start-up nothing is taken (the inputs settle).

#pragma once
#include <stdint.h>

namespace bm {

// the eight outputs, in the order of their read-backs (A0 … A7)
enum Out : uint8_t { Pump, Feeder, Vib1, Vib2, TamperDown, TamperUp, MouldUp, MouldDown, NOut };

struct Inputs {
  bool railOn;       // the safety rail (V24S) is on
  bool stop;         // STOP pressed or its cable broken
  bool start;        // START pressed (one event per press)
  bool mouldUp, mouldDown, tamperUp, tamperDown, feederHome, palletIn;  // the proximity sensors
  bool pressureOk = true;   // the pressure switch: the working pressure reached
  bool oilOk = true;        // the oil temperature switch closed (not hot)
  bool breakersOk = true;   // every motor breaker on (their auxiliary contacts)
  uint16_t fedMv[NOut] = {};  // the outputs read back (mV at the output, from the 47k / 10k divider)
  uint16_t enableMv = 0;      // the outputs' supply after the enable switch (mV)
};

struct Outputs {
  bool out[NOut] = {};      // valve 1 tamper down, 2 tamper up, 3 mould up, 4 mould down
  bool enable = false;      // the outputs' common enable switch
  bool lamp = false;        // READY / FAULT
  bool any() const { for (bool b : out) if (b) return true; return false; }
};

enum class Cause : uint8_t { None, Timeout, Interlock, OutputStuck, OutputShort, EnableFault, Breaker, OilHot, NoPressure, Sensor };

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
  uint32_t leaveMs = 1000;      // a cylinder leaves its end sensor within this
  uint32_t startupMs = 500;
};

class Logic {
 public:
  explicit Logic(const Config& c = Config()) : cfg_(c) {}
  void step(uint32_t nowMs, const Inputs& in);
  const Outputs& outputs() const { return out_; }
  State state() const { return state_; }
  // the step where the fault arose (its State) and its cause, kept while in Fault
  State faultAt() const { return faultAt_; }
  Cause cause() const { return cause_; }
  uint32_t cycles() const { return cycles_; }

 private:
  // a new state drives its outputs from the next step: the motion outputs stop for one step (1 ms,
  // far shorter than a valve or a contactor responds), so no state's outputs outlive it
  void enter(uint32_t now, State s) { state_ = s; at_ = now; leftHome_ = false; const bool p = out_.out[Pump]; clearMotion(); out_.out[Pump] = p; }
  void clearMotion() { for (bool& b : out_.out) b = false; }
  void fault(uint32_t now, State where, Cause c) { faultAt_ = where; cause_ = c; enter(now, State::Fault); clearMotion(); pumpOn_ = false; }
  bool checkOutputs(uint32_t now, const Inputs& in);
  bool timedOut(uint32_t now, uint32_t ms) const { return now - at_ >= ms; }
  bool hydraulic(State s) const;
  void drive(uint32_t now, const Inputs& in);

  Config cfg_;
  Outputs out_;
  State state_ = State::Off, faultAt_ = State::Off;
  Cause cause_ = Cause::None;
  uint32_t at_ = 0, bootAt_ = 0, pumpOnAt_ = 0, pumpUsedAt_ = 0, cycles_ = 0;
  bool booted_ = false, leftHome_ = false, pumpOn_ = false, palletOut_ = false;
  // the read-back checks: what was commanded at the last step, since when each output (and the
  // enable) has been commanded on, since when a disagreement has lasted
  Outputs last_;
  uint32_t onAt_[NOut] = {}, enableAt_ = 0, wrongAt_[NOut + 1] = {};
  bool wrong_[NOut + 1] = {};
  bool lastRail_ = false, lastStop_ = false;
  uint32_t railOnAt_ = 0;  // the enable waits 10 ms after the rail comes on (its own check first)
};

}  // namespace bm
