// SPDX-License-Identifier: GPL-3.0-or-later
#include "machine_logic.h"

namespace bm {

namespace {
constexpr uint32_t kStuckMs = 3;    // an output on while commanded off: before a coil pulls in
constexpr uint32_t kShortMs = 30;   // an output still off 30 ms after it was commanded on
}

bool Logic::hydraulic(State s) const {
  switch (s) {
    case State::HomeTamper: case State::HomeMould: case State::PumpStart: case State::Press:
    case State::Vibrate: case State::Demould: case State::TamperUp: case State::MouldDown:
      return true;
    default:
      return false;
  }
}

// the read-backs against what was commanded at the last step; true: a fault was raised
bool Logic::checkOutputs(uint32_t now, const Inputs& in) {
  for (uint8_t k = 0; k <= NOut; ++k) {
    const bool cmd = k < NOut ? last_.out[k] : last_.enable;
    const bool fed = k < NOut ? in.fed[k] : in.enableFed;
    const uint32_t since = k < NOut ? onAt_[k] : enableAt_;
    // an output's read-back needs the enable on; the enable's needs the rail (checked by the caller)
    const bool supplied = k == NOut || (last_.enable && in.enableFed);
    const bool stuck = supplied && !cmd && fed;
    const bool dead = supplied && cmd && !fed && now - since >= kShortMs;
    const bool bad = stuck || dead;
    if (bad && !wrong_[k]) { wrong_[k] = true; wrongAt_[k] = now; }
    if (!bad) wrong_[k] = false;
    if (bad && now - wrongAt_[k] >= (stuck ? kStuckMs : 0)) {
      fault(now, state_, k == NOut ? Cause::EnableFault : stuck ? Cause::OutputStuck : Cause::OutputShort);
      return true;
    }
  }
  return false;
}

void Logic::step(uint32_t now, const Inputs& in) {
  if (!booted_) { booted_ = true; bootAt_ = now; }
  const Outputs before = out_;
  out_ = Outputs();
  if (now - bootAt_ < cfg_.startupMs) { last_ = out_; return; }
  if (in.railOn && !lastRail_) railOnAt_ = now;
  lastRail_ = in.railOn;

  // the safety rail off: everything off; a fault is kept (shown); nothing starts without START
  if (!in.railOn) {
    pumpOn_ = false;
    if (state_ != State::Off && (state_ != State::Fault || in.stop)) enter(now, State::Off);  // STOP clears a fault here too
    clearMotion();
  } else if (in.stop) {
    // STOP: everything off at once; it also clears a fault
    pumpOn_ = false;
    if (state_ != State::Idle) enter(now, State::Idle);
    clearMotion();
    out_.enable = now - railOnAt_ >= 10;
  } else {
    if (state_ == State::Off) enter(now, State::Idle);
    out_ = before;
    if (state_ != State::Fault) {
      if (!checkOutputs(now, in)) {
        if (!in.breakersOk) fault(now, state_, Cause::Breaker);
        else if (!in.oilOk) fault(now, state_, Cause::OilHot);
        else drive(now, in);
      }
    }
    // the interlocks, whatever the state asked for
    const bool* o = out_.out;
    if ((o[Feeder] && !in.tamperUp) || (o[TamperDown] && !in.feederHome) ||
        (o[TamperDown] && o[TamperUp]) || (o[MouldUp] && o[MouldDown])) fault(now, state_, Cause::Interlock);
    // the enable: on with the rail and no fault; turned on with every output off
    out_.enable = state_ != State::Fault && now - railOnAt_ >= 10 && (last_.enable || !out_.any());
    if (!out_.enable) clearMotion();
  }

  // the bookkeeping for the read-backs
  for (uint8_t k = 0; k < NOut; ++k) if (out_.out[k] && !last_.out[k]) onAt_[k] = now;
  if (out_.enable && !last_.enable) enableAt_ = now;
  if (state_ == State::Fault) { clearMotion(); out_.enable = false; }

  // the lamp: on when READY, slow while working or waiting, fast on a fault, off otherwise
  switch (state_) {
    case State::Ready: out_.lamp = true; break;
    case State::Fault: out_.lamp = (now / 125) % 2 == 0; break;
    case State::Idle: case State::Off: out_.lamp = false; break;
    default: out_.lamp = (now / 500) % 2 == 0; break;
  }
  last_ = out_;
}

void Logic::drive(uint32_t now, const Inputs& in) {
  const bool atHome = in.mouldDown && in.tamperUp && in.feederHome && in.palletIn;
  clearMotion();

  // the pump: on for a hydraulic step, off after a minute without one; a hydraulic step waits
  // for it to run up (its time limit starts once it has)
  if (hydraulic(state_)) {
    if (!pumpOn_) { pumpOn_ = true; pumpOnAt_ = now; }
    pumpUsedAt_ = now;
  } else if (pumpOn_ && now - pumpUsedAt_ >= cfg_.pumpIdleMs) {
    pumpOn_ = false;
  }
  out_.out[Pump] = pumpOn_;
  const bool running = pumpOn_ && now - pumpOnAt_ >= cfg_.pumpStartMs;
  if (hydraulic(state_) && !running) { at_ = now; return; }

  bool* o = out_.out;
  switch (state_) {
    case State::Idle:
      if (in.start) enter(now, atHome ? State::Ready : State::HomeTamper);
      break;
    case State::HomeTamper:
      if (in.tamperUp) { enter(now, State::HomeFeeder); break; }
      o[TamperUp] = true;
      if (timedOut(now, cfg_.tamperUpMs)) fault(now, state_, Cause::Timeout);
      break;
    case State::HomeFeeder:
      if (in.feederHome) { enter(now, State::HomePallet); break; }
      o[Feeder] = true;
      if (timedOut(now, cfg_.fillMs)) fault(now, state_, Cause::Timeout);
      break;
    case State::HomePallet:
      if (in.palletIn) enter(now, State::HomeMould);
      break;
    case State::HomeMould:
      if (!in.palletIn) { enter(now, State::HomePallet); break; }
      if (in.mouldDown) { enter(now, State::Ready); break; }
      o[MouldDown] = true;
      if (timedOut(now, cfg_.mouldDownMs)) fault(now, state_, Cause::Timeout);
      break;
    case State::Ready:
      if (!atHome) { enter(now, State::Idle); break; }
      if (in.start) enter(now, State::PumpStart);
      break;
    case State::PumpStart:
      enter(now, State::Fill);  // the pump has run up (the wait above)
      break;
    case State::Fill:
      o[Feeder] = o[Vib1] = o[Vib2] = true;
      if (!leftHome_) {
        if (!in.feederHome) leftHome_ = true;
        else if (timedOut(now, cfg_.feederLeaveMs)) { fault(now, state_, Cause::Timeout); break; }
      } else if (in.feederHome) {
        enter(now, State::Press);
        break;
      }
      if (timedOut(now, cfg_.fillMs)) fault(now, state_, Cause::Timeout);
      break;
    case State::Press:
      o[TamperDown] = o[Vib1] = o[Vib2] = true;
      if (in.tamperDown && in.pressureOk) enter(now, State::Vibrate);
      else if (timedOut(now, cfg_.pressMs)) fault(now, state_, in.tamperDown ? Cause::NoPressure : Cause::Timeout);
      break;
    case State::Vibrate:
      o[TamperDown] = o[Vib1] = o[Vib2] = true;
      if (timedOut(now, cfg_.vibrateMs)) enter(now, State::Demould);
      break;
    case State::Demould:
      o[TamperDown] = true;  // the tamper holds the blocks while the mould lifts off them
      o[MouldUp] = true;
      if (in.mouldUp) enter(now, State::TamperUp);
      else if (timedOut(now, cfg_.demouldMs)) fault(now, state_, Cause::Timeout);
      break;
    case State::TamperUp:
      o[TamperUp] = true;
      if (in.tamperUp) { enter(now, State::Pallet); palletOut_ = false; }
      else if (timedOut(now, cfg_.tamperUpMs)) fault(now, state_, Cause::Timeout);
      break;
    case State::Pallet:
      if (!in.palletIn) palletOut_ = true;
      else if (palletOut_) enter(now, State::MouldDown);
      break;
    case State::MouldDown:
      if (!in.palletIn) { enter(now, State::Pallet); palletOut_ = true; break; }
      o[MouldDown] = true;
      if (in.mouldDown) { ++cycles_; enter(now, State::Ready); }
      else if (timedOut(now, cfg_.mouldDownMs)) fault(now, state_, Cause::Timeout);
      break;
    case State::Fault:
    case State::Off:
      break;
  }
  out_.out[Pump] = pumpOn_ && state_ != State::Fault;
}

}  // namespace bm
