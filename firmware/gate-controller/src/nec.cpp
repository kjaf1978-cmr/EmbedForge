// SPDX-License-Identifier: GPL-3.0-or-later
#include "nec.h"

namespace nec {

Result Decoder::feed(bool low, uint32_t us) {
  switch (st_) {
    case St::Idle:
      if (low && near(us, 9000)) st_ = St::LeadSpace;
      return Result::None;
    case St::LeadSpace:
      if (!low && near(us, 4500)) { st_ = St::BitBurst; bits_ = 0; n_ = 0; return Result::None; }
      if (!low && near(us, 2250)) { st_ = St::RepeatBurst; return Result::None; }
      st_ = St::Idle;
      return feed(low, us);  // it may be the start of a new frame
    case St::RepeatBurst:
      st_ = St::Idle;
      return low && near(us, 562) ? Result::Repeat : Result::None;
    case St::BitBurst:
      if (!(low && near(us, 562))) { st_ = St::Idle; return feed(low, us); }
      if (n_ == 32) {  // the final burst
        st_ = St::Idle;
        const uint8_t cmd = (bits_ >> 16) & 0xFF, inv = (bits_ >> 24) & 0xFF;
        if ((uint8_t)(cmd ^ inv) != 0xFF) return Result::None;
        frame_ = bits_;
        return Result::Frame;
      }
      st_ = St::BitSpace;
      return Result::None;
    case St::BitSpace:
      if (!low && near(us, 562)) { ++n_; st_ = St::BitBurst; return Result::None; }
      if (!low && near(us, 1687)) { bits_ |= (uint32_t)1 << n_; ++n_; st_ = St::BitBurst; return Result::None; }
      st_ = St::Idle;
      return feed(low, us);
  }
  return Result::None;
}

}  // namespace nec
