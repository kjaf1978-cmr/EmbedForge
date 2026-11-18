// Gate controller (P9, D25, D48): the gate's sequencing, independent of the Arduino.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The board's discrete circuits stop the motor without this code: the limit switches, the
// photo-beam and STOP in the relays' coils, the latching current cut-off (which also drops both
// relays), the power-on reset, the relays' brake. This logic sequences the motor on top of them
// (what the gate's safety still needs from it: DFMEA GC-10):
// - a move: RUN off, the direction relay on, 50 ms for its contacts, a CLR pulse (the cut-off
//   latches at power-up and after every trip), then RUN on. A stop: RUN off, 30 ms for the current
//   to fall, then the relays off (the motor shorted: braking). The relays never change with RUN on
//   (at the ends the hardware drops a relay under the running current: GC-6).
// - before every close, the photo-beam is tested: its transmitter is switched off (the receiver
//   must report the beam broken within 0.3 s) and on again (the beam made within 1 s). A beam
//   that does not break (bridged, a stuck receiver contact) or does not come back: no close, and
//   beamFault() is set until a close passes the test.
// - one button (a paired remote, or the push-button / key-switch input): closed or unknown ->
//   open; open -> close; moving -> stop; stopped -> the other way than the last full move.
// - the open limit (A0 low) ends an opening; the close limit (A2 low) ends a closing; the beam
//   broken while closing (A1 low with A2 high) stops the gate and reopens it fully; a close is not
//   started while the beam is broken. STOP (A0 and A2 low together: the limit switches' feed is
//   cut) stops any move; nothing starts while it is pressed.
// - the cut-off tripped (an obstacle) while closing: stop and reopen fully; while opening: stop and
//   close for 0.5 s to release it. The third trip without reaching an end: stop, move back for
//   0.5 s to release, then lockout until the next command (which opens). A trip during a release
//   move: stop and lockout.
// - a move longer than the maximum travel time stops the gate (a slipping clutch, a lost limit).
// - for 0.5 s after start-up no command is taken (the board's power-on reset holds the cut-off
//   tripped for about 0.1 s).

#pragma once
#include <stdint.h>

namespace gate {

struct Inputs {
  bool fault;          // the cut-off has tripped (FLTN low)
  bool openLimitOk;    // the open limit switch closed: not at the open end (A0 high)
  bool closeLimitOk;   // the close limit switch closed: not at the closed end (A2 high)
  bool closeChainOk;   // the close limit and the photo-beam both closed (A1 high)
  bool command;        // a command (one event per press)
};

struct Outputs {
  bool open = false, close = false, run = false, clr = false;
  bool beamTx = true;  // the photo-beam transmitter's supply (off only for its test)
};

enum class State : uint8_t { Unknown, Opening, Closing, Open, Closed, Stopped, Lockout };
enum class Dir : uint8_t { None, Open, Close };

struct Config {
  uint32_t relayMs = 50;      // relay contacts settle before RUN
  uint32_t clrMs = 5;         // CLR pulse
  uint32_t brakeMs = 30;      // RUN off before the relays drop
  uint32_t maxTravelMs = 60000;
  uint32_t releaseMs = 500;   // the short reverse after an obstacle
  uint8_t maxTrips = 3;
  uint32_t beamOffMs = 300;   // the receiver must report the beam broken within this
  uint32_t beamOnMs = 1000;   // and made again within this
  uint32_t startupMs = 500;   // no command taken before this
};

class Logic {
 public:
  explicit Logic(const Config& c = Config()) : cfg_(c) {}
  // Call often (every few ms) with the time in ms and the inputs; read outputs() after.
  void step(uint32_t nowMs, const Inputs& in);
  const Outputs& outputs() const { return out_; }
  State state() const { return state_; }
  uint8_t trips() const { return trips_; }
  bool beamFault() const { return beamFault_; }
  bool stopPressed() const { return stopIn_; }

 private:
  enum class Phase : uint8_t { Idle, BeamOff, BeamOn, Prep, Clear, Running, Braking };
  void startMove(uint32_t now, Dir d, uint32_t limitMs, State after, bool timed);
  void stopMove(uint32_t now, State after);
  void applyPhase();
  void cancelPending() { reopenPending_ = false; releasePending_ = false; }

  Config cfg_;
  Outputs out_;
  State state_ = State::Unknown;
  Phase phase_ = Phase::Idle;
  Dir dir_ = Dir::None, lastDir_ = Dir::None, releaseDir_ = Dir::None;
  uint32_t phaseAt_ = 0, moveAt_ = 0, moveLimitMs_ = 0, bootAt_ = 0;
  State afterStop_ = State::Stopped;
  State afterMove_ = State::Stopped;     // for a timed move (the release after an obstacle)
  State afterRelease_ = State::Stopped;  // Stopped, or Lockout after the last trip
  State stateBeforeTest_ = State::Stopped;
  uint8_t trips_ = 0;
  bool booted_ = false, stopIn_ = false, timed_ = false, beamFault_ = false;
  bool reopenPending_ = false;   // reopen fully once braked (an obstacle or the beam while closing)
  bool releasePending_ = false;  // move back briefly once braked (an obstacle)
};

}  // namespace gate
