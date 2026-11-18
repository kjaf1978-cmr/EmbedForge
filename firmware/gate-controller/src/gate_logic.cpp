// SPDX-License-Identifier: GPL-3.0-or-later
#include "gate_logic.h"

namespace gate {

void Logic::startMove(uint32_t now, Dir d, uint32_t limitMs, State after) {
  // RUN is off whenever a move starts (Idle); the relay is set first
  dir_ = d;
  lastDir_ = d;
  phase_ = Phase::Prep;
  phaseAt_ = now;
  moveLimitMs_ = limitMs;
  afterMove_ = after;
  state_ = d == Dir::Open ? State::Opening : State::Closing;
  applyPhase(now);
}

void Logic::stopMove(uint32_t now, State after) {
  if (phase_ == Phase::Braking) return;  // already stopping: its end state stands
  if (phase_ == Phase::Idle) { state_ = after; return; }
  phase_ = Phase::Braking;
  phaseAt_ = now;
  afterStop_ = after;
  applyPhase(now);
}

void Logic::applyPhase(uint32_t) {
  out_.open = (phase_ != Phase::Idle) && dir_ == Dir::Open;
  out_.close = (phase_ != Phase::Idle) && dir_ == Dir::Close;
  out_.clr = phase_ == Phase::Clear;
  out_.run = phase_ == Phase::Running;
}

void Logic::step(uint32_t now, const Inputs& in) {
  // ---- sequencing of the current phase
  switch (phase_) {
    case Phase::Prep:
      if (now - phaseAt_ >= cfg_.relayMs) { phase_ = Phase::Clear; phaseAt_ = now; }
      break;
    case Phase::Clear:
      if (now - phaseAt_ >= cfg_.clrMs) { phase_ = Phase::Running; phaseAt_ = now; moveAt_ = now; }
      break;
    case Phase::Braking:
      if (now - phaseAt_ >= cfg_.brakeMs) {
        phase_ = Phase::Idle;
        dir_ = Dir::None;
        state_ = afterStop_;
        if (reopenPending_) { reopenPending_ = false; applyPhase(now); startMove(now, Dir::Open, cfg_.maxTravelMs, State::Stopped); return; }
      }
      break;
    default: break;
  }
  applyPhase(now);

  // ---- while running: ends, beam, cut-off, time
  if (phase_ == Phase::Running) {
    const uint32_t ran = now - moveAt_;
    if (dir_ == Dir::Open && !in.openLimitOk) { trips_ = 0; stopMove(now, State::Open); return; }
    if (dir_ == Dir::Close && !in.closeLimitOk) { trips_ = 0; stopMove(now, State::Closed); return; }
    if (dir_ == Dir::Close && !in.closeChainOk) {
      // the beam broken while closing (the hardware has already dropped the close relay): reopen
      reopenPending_ = true;
      stopMove(now, State::Stopped);
      return;
    }
    if (in.fault) {
      ++trips_;
      if (trips_ >= cfg_.maxTrips) { stopMove(now, State::Lockout); return; }
      if (dir_ == Dir::Close) { reopenPending_ = true; stopMove(now, State::Stopped); return; }
      // an obstacle while opening: stop, then close briefly to release it
      releasePending_ = true;
      stopMove(now, State::Stopped);
      return;
    }
    if (ran >= moveLimitMs_) { stopMove(now, afterMove_); return; }
  }
  if (phase_ == Phase::Idle && releasePending_) {
    releasePending_ = false;
    if (in.closeChainOk) startMove(now, Dir::Close, cfg_.releaseMs, State::Stopped);
    return;
  }

  // ---- the remote
  if (!in.command) return;
  switch (state_) {
    case State::Opening:
    case State::Closing:
      reopenPending_ = false;
      releasePending_ = false;
      stopMove(now, State::Stopped);
      break;
    case State::Unknown:
    case State::Closed:
    case State::Lockout:
      trips_ = 0;
      if (in.openLimitOk) startMove(now, Dir::Open, cfg_.maxTravelMs, State::Stopped);
      else state_ = State::Open;
      break;
    case State::Open:
      if (in.closeChainOk && in.closeLimitOk) startMove(now, Dir::Close, cfg_.maxTravelMs, State::Stopped);
      break;  // the beam broken: a close is not started
    case State::Stopped:
      if (lastDir_ == Dir::Open) { if (in.closeChainOk && in.closeLimitOk) startMove(now, Dir::Close, cfg_.maxTravelMs, State::Stopped); }
      else if (in.openLimitOk) startMove(now, Dir::Open, cfg_.maxTravelMs, State::Stopped);
      break;
  }
}

}  // namespace gate
