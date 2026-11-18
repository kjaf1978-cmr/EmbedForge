// The paired remotes: up to four NEC frames, kept in the EEPROM by the Arduino glue.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// LEARN held while a remote's button is pressed pairs that button; when four are stored the
// oldest pairing is replaced (each slot keeps a sequence number, so this holds after a power cut).
// LEARN held for 10 s without a remote erases every pairing (a lost remote). A paired frame is one
// command; the NEC repeats of a held button and a second frame within 600 ms are ignored, so one
// press is one command.

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
    const uint8_t slot = nextSlot();
    codes_[slot] = f; used_[slot] = true; seq_[slot] = ++top_;
    return slot;
  }
  void load(uint8_t slot, uint32_t f, bool used, uint16_t seq) {
    if (slot >= kMax) return;
    codes_[slot] = f; used_[slot] = used; seq_[slot] = used ? seq : 0;
    if (used && seq > top_) top_ = seq;
  }
  void clear() { for (uint8_t i = 0; i < kMax; ++i) { used_[i] = false; codes_[i] = 0; seq_[i] = 0; } top_ = 0; }
  uint32_t code(uint8_t slot) const { return codes_[slot]; }
  bool used(uint8_t slot) const { return used_[slot]; }
  uint16_t seq(uint8_t slot) const { return seq_[slot]; }
  uint8_t count() const { uint8_t n = 0; for (uint8_t i = 0; i < kMax; ++i) n += used_[i]; return n; }

 private:
  // the first free slot, else the oldest (the lowest sequence number)
  uint8_t nextSlot() const {
    uint8_t best = 0;
    for (uint8_t i = 0; i < kMax; ++i) { if (!used_[i]) return i; if (seq_[i] < seq_[best]) best = i; }
    return best;
  }
  uint32_t codes_[kMax] = {0, 0, 0, 0};
  bool used_[kMax] = {false, false, false, false};
  uint16_t seq_[kMax] = {0, 0, 0, 0};
  uint16_t top_ = 0;
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
