// The paired remotes: up to four NEC frames, kept in the EEPROM by the Arduino glue.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// LEARN held while a remote's button is pressed pairs that button (the oldest pairing is replaced
// when four are stored). A paired frame is one command; the NEC repeats of a held button and a
// second frame within 600 ms are ignored, so one press is one command.

#pragma once
#include <stdint.h>

namespace remotes {

constexpr uint8_t kMax = 4;

class Table {
 public:
  bool contains(uint32_t f) const { for (uint8_t i = 0; i < kMax; ++i) if (used_[i] && codes_[i] == f) return true; return false; }
  // pairs f; returns the slot written (so the glue saves it), or kMax if it was already paired
  uint8_t learn(uint32_t f) {
    if (contains(f)) return kMax;
    const uint8_t slot = next_;
    codes_[slot] = f; used_[slot] = true; next_ = (uint8_t)((next_ + 1) % kMax);
    return slot;
  }
  void load(uint8_t slot, uint32_t f, bool used) { if (slot < kMax) { codes_[slot] = f; used_[slot] = used; if (used) next_ = (uint8_t)((slot + 1) % kMax); } }
  uint32_t code(uint8_t slot) const { return codes_[slot]; }
  bool used(uint8_t slot) const { return used_[slot]; }

 private:
  uint32_t codes_[kMax] = {0, 0, 0, 0};
  bool used_[kMax] = {false, false, false, false};
  uint8_t next_ = 0;
};

// one command per press: a paired frame at least 600 ms after the last accepted one
class Debounce {
 public:
  bool accept(uint32_t nowMs) { if (seen_ && nowMs - last_ < 600) { last_ = nowMs; return false; } seen_ = true; last_ = nowMs; return true; }
 private:
  uint32_t last_ = 0;
  bool seen_ = false;
};

}  // namespace remotes
