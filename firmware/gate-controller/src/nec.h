// NEC infrared protocol decoder (38 kHz remotes), independent of the Arduino.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Fed with each level of the receiver's output and how long it lasted (the TSOP38238's output is
// low while a burst is received). A frame: 9 ms burst, 4.5 ms space, 32 bits LSB first (a
// 562 µs burst, then a 562 µs space for 0 or 1687 µs for 1), a final 562 µs burst. A repeat
// (button held): 9 ms burst, 2.25 ms space, 562 µs burst. Timings are accepted within ±25 %.
// The 32 bits are address, its inverse (or an extended address), command, its inverse; a frame
// whose command byte and its inverse disagree is rejected.

#pragma once
#include <stdint.h>

namespace nec {

enum class Result : uint8_t { None, Frame, Repeat };

class Decoder {
 public:
  // `low`: the level that just ended was low (a burst); `us`: how long it lasted.
  Result feed(bool low, uint32_t us);
  uint32_t frame() const { return frame_; }

 private:
  enum class St : uint8_t { Idle, LeadSpace, BitBurst, BitSpace, RepeatBurst };
  St st_ = St::Idle;
  uint32_t bits_ = 0, frame_ = 0;
  uint8_t n_ = 0;
};

// ±25 % of a nominal duration
inline bool near(uint32_t us, uint32_t nominal) { return us >= nominal - nominal / 4 && us <= nominal + nominal / 4; }

}  // namespace nec
