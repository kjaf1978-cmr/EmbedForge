// Gate controller (P9, D25, D48): the gate's sequencing, independent of the Arduino.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The board's discrete circuits keep the gate safe whatever this code does (the limit switches and
// the photo-beam in the relays' coils, the latching current cut-off, the relays' brake). This logic
// sequences the motor on top of them:
// - a move: RUN off, the direction relay on, 50 ms for its contacts, a CLR pulse (the cut-off
//   latches at power-up and after every trip), then RUN on. A stop: RUN off, 30 ms for the current
//   to fall, then the relays off (the motor shorted: braking). The relays never change with RUN on.
// - one remote button: closed or unknown -> open; open -> close; moving -> stop; stopped -> the
//   other way than the last move.
// - the open limit (A0 low) ends an opening; the close limit (A2 low) ends a closing; the beam
//   broken while closing (A1 low with A2 high) stops the gate and reopens it fully; a close is not
//   started while the beam is broken.
// - the cut-off tripped (an obstacle) while closing: stop and reopen fully; while opening: stop and
//   close for 0.5 s to release. Three trips without reaching an end: lockout until the next
//   command (which opens).
// - a move longer than the maximum travel time stops the gate (a slipping clutch, a lost limit).

#pragma once
#include <stdint.h>

namespace gate {

struct Inputs {
  bool fault;          // the cut-off has tripped (FLTN low)
  bool openLimitOk;    // the open limit switch closed: not at the open end (A0 high)
  bool closeLimitOk;   // the close limit switch closed: not at the closed end (A2 high)
  bool closeChainOk;   // the close limit and the photo-beam both closed (A1 high)
  bool command;        // a remote command (one event per press)
};

struct Outputs {
  bool open = false, close = false, run = false, clr = false;
};

enum class State : uint8_t { Unknown, Opening, Closing, Open, Closed, Stopped, Lockout };
enum class Dir : uint8_t { None, Open, Close };

struct Config {
  uint32_t relayMs = 50;      // relay contacts settle before RUN
  uint32_t clrMs = 5;         // CLR pulse
  uint32_t brakeMs = 30;      // RUN off before the relays drop
  uint32_t maxTravelMs = 60000;
  uint32_t releaseMs = 500;   // the short reverse after an obstacle while opening
  uint8_t maxTrips = 3;
};

class Logic {
 public:
  explicit Logic(const Config& c = Config()) : cfg_(c) {}
  // Call often (every few ms) with the time in ms and the inputs; read outputs() after.
  void step(uint32_t nowMs, const Inputs& in);
  const Outputs& outputs() const { return out_; }
  State state() const { return state_; }
  uint8_t trips() const { return trips_; }

 private:
  enum class Phase : uint8_t { Idle, Prep, Clear, Running, Braking };
  void startMove(uint32_t now, Dir d, uint32_t limitMs, State after);
  void stopMove(uint32_t now, State after);
  void applyPhase(uint32_t now);

  Config cfg_;
  Outputs out_;
  State state_ = State::Unknown;
  Phase phase_ = Phase::Idle;
  Dir dir_ = Dir::None, lastDir_ = Dir::None;
  uint32_t phaseAt_ = 0, moveAt_ = 0, moveLimitMs_ = 0;
  State afterStop_ = State::Stopped;
  State afterMove_ = State::Stopped;  // for a timed move (the release after an obstacle)
  uint8_t trips_ = 0;
  bool reopenPending_ = false;   // reopen fully once braked (an obstacle or the beam while closing)
  bool releasePending_ = false;  // close briefly once braked (an obstacle while opening)
};

}  // namespace gate
