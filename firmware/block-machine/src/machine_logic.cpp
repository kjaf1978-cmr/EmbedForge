// SPDX-License-Identifier: GPL-3.0-or-later
#include "machine_logic.h"

namespace bm {

bool Logic::hydraulic(State s) const {
  switch (s) {
    case State::HomeTamper: case State::HomeMould: case State::PumpStart: case State::Press:
    case State::Vibrate: case State::Demould: case State::TamperUp: case State::MouldDown:
      return true;
    default:
      return false;
  }
}

void Logic::step(uint32_t now, const Inputs& in) {
  if (!booted_) { booted_ = true; bootAt_ = now; }
  out_ = Outputs();
  if (now - bootAt_ < cfg_.startupMs) return;

  // the safety rail off: everything off; nothing starts again without START
  if (!in.railOn) { pumpOn_ = false; if (state_ != State::Off) enter(now, State::Off); return; }
  if (state_ == State::Off) enter(now, State::Idle);

  // STOP: everything off at once; it also clears a fault
  if (in.stop) { pumpOn_ = false; if (state_ != State::Idle) enter(now, State::Idle); return; }

  drive(now, in);

  // the interlocks, whatever the state asked for
  if ((out_.feeder && !in.tamperUp) || (out_.tamperDown && !in.feederHome) ||
      (out_.tamperDown && out_.tamperUp) || (out_.mouldUp && out_.mouldDown)) {
    const State where = state_;
    out_ = Outputs();
    pumpOn_ = false;
    fault(now, where);
  }

  // the lamp: on when READY, slow while working or waiting, fast on a fault, off otherwise
  switch (state_) {
    case State::Ready: out_.lamp = true; break;
    case State::Fault: out_.lamp = (now / 125) % 2 == 0; break;
    case State::Idle: case State::Off: out_.lamp = false; break;
    default: out_.lamp = (now / 500) % 2 == 0; break;
  }
}

void Logic::drive(uint32_t now, const Inputs& in) {
  const bool atHome = in.mouldDown && in.tamperUp && in.feederHome && in.palletIn;

  // the pump: on for a hydraulic step, off after a minute without one; a hydraulic step waits for
  // the pressure (its time limit starts once the pump is ready)
  if (hydraulic(state_)) {
    if (!pumpOn_) { pumpOn_ = true; pumpOnAt_ = now; }
    pumpUsedAt_ = now;
  } else if (pumpOn_ && now - pumpUsedAt_ >= cfg_.pumpIdleMs) {
    pumpOn_ = false;
  }
  if (state_ == State::Fault) pumpOn_ = false;
  out_.pump = pumpOn_;
  const bool pressure = pumpOn_ && now - pumpOnAt_ >= cfg_.pumpStartMs;
  if (hydraulic(state_) && !pressure) { at_ = now; return; }  // waiting for the pressure

  switch (state_) {
    case State::Idle:
      if (in.start) enter(now, atHome ? State::Ready : State::HomeTamper);
      break;
    case State::HomeTamper:
      if (in.tamperUp) { enter(now, State::HomeFeeder); break; }
      out_.tamperUp = true;
      if (timedOut(now, cfg_.tamperUpMs)) fault(now, state_);
      break;
    case State::HomeFeeder:
      if (in.feederHome) { enter(now, State::HomePallet); break; }
      out_.feeder = true;
      if (timedOut(now, cfg_.fillMs)) fault(now, state_);
      break;
    case State::HomePallet:
      if (in.palletIn) enter(now, State::HomeMould);
      break;
    case State::HomeMould:
      if (!in.palletIn) { enter(now, State::HomePallet); break; }
      if (in.mouldDown) { enter(now, State::Ready); break; }
      out_.mouldDown = true;
      if (timedOut(now, cfg_.mouldDownMs)) fault(now, state_);
      break;
    case State::Ready:
      if (!atHome) { enter(now, State::Idle); break; }
      if (in.start) enter(now, State::PumpStart);
      break;
    case State::PumpStart:
      enter(now, State::Fill);  // the pressure is there (the wait above)
      break;
    case State::Fill:
      out_.feeder = true;
      out_.vibrators = true;
      if (!leftHome_) {
        if (!in.feederHome) leftHome_ = true;
        else if (timedOut(now, cfg_.feederLeaveMs)) { fault(now, state_); break; }
      } else if (in.feederHome) {
        enter(now, State::Press);
        out_.feeder = false;
        break;
      }
      if (timedOut(now, cfg_.fillMs)) fault(now, state_);
      break;
    case State::Press:
      out_.tamperDown = true;
      out_.vibrators = true;
      if (in.tamperDown) enter(now, State::Vibrate);
      else if (timedOut(now, cfg_.pressMs)) fault(now, state_);
      break;
    case State::Vibrate:
      out_.tamperDown = true;
      out_.vibrators = true;
      if (timedOut(now, cfg_.vibrateMs)) enter(now, State::Demould);
      break;
    case State::Demould:
      out_.tamperDown = true;  // the tamper holds the blocks while the mould lifts off them
      out_.mouldUp = true;
      if (in.mouldUp) enter(now, State::TamperUp);
      else if (timedOut(now, cfg_.demouldMs)) fault(now, state_);
      break;
    case State::TamperUp:
      out_.tamperUp = true;
      if (in.tamperUp) { enter(now, State::Pallet); palletOut_ = false; }
      else if (timedOut(now, cfg_.tamperUpMs)) fault(now, state_);
      break;
    case State::Pallet:
      if (!in.palletIn) palletOut_ = true;
      else if (palletOut_) enter(now, State::MouldDown);
      break;
    case State::MouldDown:
      if (!in.palletIn) { enter(now, State::Pallet); palletOut_ = true; break; }
      out_.mouldDown = true;
      if (in.mouldDown) { ++cycles_; enter(now, State::Ready); }
      else if (timedOut(now, cfg_.mouldDownMs)) fault(now, state_);
      break;
    case State::Fault:
    case State::Off:
      break;
  }
  if (state_ == State::Fault) { out_ = Outputs(); pumpOn_ = false; }
}

}  // namespace bm
