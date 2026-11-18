// SPDX-License-Identifier: GPL-3.0-or-later
#include "gate_logic.h"

namespace gate {

void Logic::startMove(uint32_t now, Dir d, uint32_t limitMs, State after, bool timed) {
  // RUN is off whenever a move starts (Idle); a close starts with the beam test
  dir_ = d;
  if (!timed) lastDir_ = d;  // a release does not change which way the next press goes
  timed_ = timed;
  moveLimitMs_ = limitMs;
  afterMove_ = after;
  phaseAt_ = now;
  if (d == Dir::Close) { stateBeforeTest_ = state_; phase_ = Phase::BeamOff; }
  else phase_ = Phase::Prep;
  state_ = d == Dir::Open ? State::Opening : State::Closing;
  applyPhase();
}

void Logic::stopMove(uint32_t now, State after) {
  if (phase_ == Phase::Braking) return;  // already stopping: its end state stands
  if (phase_ == Phase::Idle) { state_ = after; return; }
  if (phase_ == Phase::BeamOff || phase_ == Phase::BeamOn) {  // no relay on yet
    phase_ = Phase::Idle; dir_ = Dir::None; state_ = after; applyPhase(); return;
  }
  phase_ = Phase::Braking;
  phaseAt_ = now;
  afterStop_ = after;
  applyPhase();
}

void Logic::applyPhase() {
  const bool relay = phase_ == Phase::Prep || phase_ == Phase::Clear || phase_ == Phase::Running || phase_ == Phase::Braking;
  out_.open = relay && dir_ == Dir::Open;
  out_.close = relay && dir_ == Dir::Close;
  out_.clr = phase_ == Phase::Clear;
  out_.run = phase_ == Phase::Running;
  out_.beamTx = phase_ != Phase::BeamOff;
}

void Logic::step(uint32_t now, const Inputs& in) {
  if (!booted_) { booted_ = true; bootAt_ = now; }
  // STOP: the limit switches' feed cut, so both ends read "reached" at once
  stopIn_ = !in.openLimitOk && !in.closeLimitOk;

  // ---- sequencing of the current phase
  switch (phase_) {
    case Phase::BeamOff:
      if (!in.closeChainOk) { phase_ = Phase::BeamOn; phaseAt_ = now; }
      else if (now - phaseAt_ >= cfg_.beamOffMs) {  // the beam did not break: bridged or stuck
        beamFault_ = true; phase_ = Phase::Idle; dir_ = Dir::None; state_ = stateBeforeTest_; cancelPending();
      }
      break;
    case Phase::BeamOn:
      if (in.closeChainOk) { beamFault_ = false; phase_ = Phase::Prep; phaseAt_ = now; }
      else if (now - phaseAt_ >= cfg_.beamOnMs) {  // the beam did not come back: broken, misaligned
        beamFault_ = true; phase_ = Phase::Idle; dir_ = Dir::None; state_ = stateBeforeTest_; cancelPending();
      }
      break;
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
      }
      break;
    default: break;
  }
  applyPhase();

  // ---- STOP: stops any move, cancels what was pending
  if (stopIn_) {
    cancelPending();
    if (phase_ != Phase::Idle) stopMove(now, State::Stopped);
    return;
  }

  // ---- while running: ends, beam, cut-off, time
  if (phase_ == Phase::Running) {
    const uint32_t ran = now - moveAt_;
    if (dir_ == Dir::Open && !in.openLimitOk) { trips_ = 0; stopMove(now, State::Open); return; }
    if (dir_ == Dir::Close && !in.closeLimitOk) { trips_ = 0; stopMove(now, State::Closed); return; }
    if (dir_ == Dir::Close && !in.closeChainOk) {
      // the beam broken while closing (the hardware has already dropped the close relay): reopen
      if (!timed_) reopenPending_ = true;
      stopMove(now, State::Stopped);
      return;
    }
    if (in.fault) {
      ++trips_;
      if (timed_) { stopMove(now, State::Lockout); return; }  // obstructed while releasing
      const bool last = trips_ >= cfg_.maxTrips;
      if (dir_ == Dir::Close && !last) { reopenPending_ = true; stopMove(now, State::Stopped); return; }
      // an obstacle while opening, or the last trip: move back briefly to release it
      releasePending_ = true;
      releaseDir_ = dir_ == Dir::Open ? Dir::Close : Dir::Open;
      afterRelease_ = last ? State::Lockout : State::Stopped;
      stopMove(now, State::Stopped);
      return;
    }
    if (ran >= moveLimitMs_) { stopMove(now, afterMove_); return; }
  }
  if (phase_ == Phase::Idle && reopenPending_) {
    reopenPending_ = false;
    if (in.openLimitOk) startMove(now, Dir::Open, cfg_.maxTravelMs, State::Stopped, false);
    return;
  }
  if (phase_ == Phase::Idle && releasePending_) {
    releasePending_ = false;
    const bool can = releaseDir_ == Dir::Open ? in.openLimitOk : (in.closeChainOk && in.closeLimitOk);
    if (can) startMove(now, releaseDir_, cfg_.releaseMs, afterRelease_, true);
    else state_ = afterRelease_;
    return;
  }

  // ---- the command
  if (!in.command || now - bootAt_ < cfg_.startupMs) return;
  switch (state_) {
    case State::Opening:
    case State::Closing:
      cancelPending();
      stopMove(now, timed_ ? afterMove_ : State::Stopped);
      break;
    case State::Unknown:
    case State::Closed:
    case State::Lockout:
      trips_ = 0;
      if (in.openLimitOk) startMove(now, Dir::Open, cfg_.maxTravelMs, State::Stopped, false);
      else state_ = State::Open;  // already at the open end: the next command closes
      break;
    case State::Open:
      if (in.closeChainOk && in.closeLimitOk) startMove(now, Dir::Close, cfg_.maxTravelMs, State::Stopped, false);
      break;  // the beam broken: a close is not started
    case State::Stopped:
      if (lastDir_ == Dir::Open) { if (in.closeChainOk && in.closeLimitOk) startMove(now, Dir::Close, cfg_.maxTravelMs, State::Stopped, false); }
      else if (in.openLimitOk) startMove(now, Dir::Open, cfg_.maxTravelMs, State::Stopped, false);
      break;
  }
}

}  // namespace gate
