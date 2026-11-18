// Host unit tests of the gate controller's logic (D48): g++ on the host, no Arduino.
//   make -C firmware/gate-controller test
// SPDX-License-Identifier: GPL-3.0-or-later
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <string>
#include <vector>
#include "../src/gate_logic.h"
#include "../src/nec.h"
#include "../src/remotes.h"

static int failures = 0, checks = 0;
#define CHECK(c) do { ++checks; if (!(c)) { ++failures; std::printf("  FAIL %s:%d: %s\n", __FILE__, __LINE__, #c); } } while (0)

// ---- a gate on the bench: steps the logic every ms and checks the invariants at every step
struct Bench {
  gate::Logic g;
  gate::Inputs in{false, true, true, true, false};
  uint32_t t = 0;
  bool lastOpen = false, lastClose = false;
  int invariantFailures = 0;
  void step(int ms = 1) {
    for (int i = 0; i < ms; ++i, ++t) {
      g.step(t, in);
      in.command = false;
      const auto& o = g.outputs();
      // never both relays; a relay never changes while RUN is on; RUN only with one relay
      if (o.open && o.close) ++invariantFailures;
      if (o.run && (o.open != lastOpen || o.close != lastClose)) ++invariantFailures;
      if (o.run && !(o.open || o.close)) ++invariantFailures;
      lastOpen = o.open; lastClose = o.close;
    }
  }
  void press() { in.command = true; step(); }
  // runs until pred() or the time limit; returns whether pred() held
  bool until(const std::function<bool()>& pred, int ms) { for (int i = 0; i < ms; ++i) { if (pred()) return true; step(); } return pred(); }
};

static void test(const char* name, const std::function<void()>& body) { std::printf("%s\n", name); body(); }

int main() {
  test("power-up: nothing moves; the first command opens: relay first, CLR pulse, then RUN", [] {
    Bench b;
    b.step(500);
    CHECK(!b.g.outputs().run && !b.g.outputs().open && !b.g.outputs().close);
    CHECK(b.g.state() == gate::State::Unknown);
    b.press();
    CHECK(b.g.outputs().open && !b.g.outputs().run);
    CHECK(b.until([&] { return b.g.outputs().clr; }, 100));
    const uint32_t clrAt = b.t;
    CHECK(clrAt >= 50);  // the relay settled first
    CHECK(b.until([&] { return b.g.outputs().run; }, 20));
    CHECK(!b.g.outputs().clr);
    CHECK(b.g.state() == gate::State::Opening);
    CHECK(b.invariantFailures == 0);
  });
  test("the open limit ends the opening: RUN off, then the relay after 30 ms (braking); state Open", [] {
    Bench b; b.press(); b.step(200);
    CHECK(b.g.outputs().run);
    b.in.openLimitOk = false; b.step();
    CHECK(!b.g.outputs().run && b.g.outputs().open);
    b.step(40);
    CHECK(!b.g.outputs().open);
    CHECK(b.g.state() == gate::State::Open);
    CHECK(b.invariantFailures == 0);
  });
  test("open -> command closes; the close limit ends it; state Closed", [] {
    Bench b; b.press(); b.step(200); b.in.openLimitOk = false; b.step(50);
    b.in.openLimitOk = true;  // the gate leaves the open end when it moves
    b.press();
    CHECK(b.until([&] { return b.g.outputs().run && b.g.outputs().close; }, 100));
    b.step(500);
    b.in.closeLimitOk = false; b.in.closeChainOk = false; b.step(50);
    CHECK(b.g.state() == gate::State::Closed);
    CHECK(!b.g.outputs().run && !b.g.outputs().close);
    CHECK(b.invariantFailures == 0);
  });
  test("a command while moving stops; the next command moves the other way", [] {
    Bench b; b.press(); b.step(300);
    b.press(); b.step(50);
    CHECK(b.g.state() == gate::State::Stopped && !b.g.outputs().run);
    b.press();
    CHECK(b.until([&] { return b.g.outputs().run && b.g.outputs().close; }, 100));
    CHECK(b.invariantFailures == 0);
  });
  test("the photo-beam broken while closing: stop, then reopen fully", [] {
    Bench b; b.in.openLimitOk = false; b.press(); b.step(10);  // at the open end: Open
    CHECK(b.g.state() == gate::State::Open);
    b.in.openLimitOk = true; b.press();
    CHECK(b.until([&] { return b.g.outputs().run && b.g.outputs().close; }, 100));
    b.step(200);
    b.in.closeChainOk = false; b.step();  // the beam (the close limit still closed)
    CHECK(!b.g.outputs().run);
    CHECK(b.until([&] { return b.g.outputs().run && b.g.outputs().open; }, 200));
    b.in.closeChainOk = true;
    b.step(300); b.in.openLimitOk = false; b.step(50);
    CHECK(b.g.state() == gate::State::Open);
    CHECK(b.invariantFailures == 0);
  });
  test("a close is not started while the beam is broken", [] {
    Bench b; b.in.openLimitOk = false; b.press(); b.step(10);
    b.in.openLimitOk = true; b.in.closeChainOk = false;
    b.press(); b.step(200);
    CHECK(!b.g.outputs().run && !b.g.outputs().close);
    CHECK(b.g.state() == gate::State::Open);
  });
  test("an obstacle (the cut-off) while closing: stop and reopen fully", [] {
    Bench b; b.in.openLimitOk = false; b.press(); b.step(10);
    b.in.openLimitOk = true; b.press(); b.step(500);
    b.in.fault = true; b.step();
    CHECK(!b.g.outputs().run);
    b.step(20); b.in.fault = false;  // the next start clears the latch (CLR)
    CHECK(b.until([&] { return b.g.outputs().run && b.g.outputs().open; }, 200));
    CHECK(b.g.trips() == 1);
    CHECK(b.invariantFailures == 0);
  });
  test("an obstacle while opening: stop, then close for about 0.5 s to release, then stopped", [] {
    Bench b; b.press(); b.step(500);
    b.in.fault = true; b.step(); b.step(20); b.in.fault = false;
    CHECK(b.until([&] { return b.g.outputs().run && b.g.outputs().close; }, 200));
    const uint32_t t0 = b.t;
    CHECK(b.until([&] { return !b.g.outputs().run; }, 1000));
    CHECK(b.t - t0 >= 490 && b.t - t0 <= 520);
    b.step(50);
    CHECK(b.g.state() == gate::State::Stopped);
    CHECK(b.invariantFailures == 0);
  });
  test("three obstacles without reaching an end: lockout; the next command opens", [] {
    Bench b; b.in.openLimitOk = false; b.press(); b.step(10); b.in.openLimitOk = true;
    b.press(); b.step(300);
    for (int k = 0; k < 3; ++k) {  // each closing obstacle reopens; obstruct the reopening too
      CHECK(b.until([&] { return b.g.outputs().run; }, 300));
      b.step(100); b.in.fault = true; b.step(); b.step(20); b.in.fault = false;
    }
    b.step(100);
    CHECK(b.g.state() == gate::State::Lockout);
    CHECK(!b.g.outputs().run);
    b.step(2000);
    CHECK(!b.g.outputs().run);  // stays off without a command
    b.press();
    CHECK(b.until([&] { return b.g.outputs().run && b.g.outputs().open; }, 200));
    CHECK(b.invariantFailures == 0);
  });
  test("the maximum travel time stops a move that never reaches its end", [] {
    gate::Config c; c.maxTravelMs = 2000;
    Bench b; b.g = gate::Logic(c);
    b.press();
    CHECK(b.until([&] { return b.g.outputs().run; }, 100));
    CHECK(b.until([&] { return !b.g.outputs().run; }, 2100));
    b.step(50);
    CHECK(b.g.state() == gate::State::Stopped);
  });
  test("random commands and inputs for 10 minutes: the invariants always hold", [] {
    Bench b; std::srand(1);
    for (int i = 0; i < 600000; ++i) {
      const int r = std::rand() % 2000;
      if (r == 0) b.in.command = true;
      if (r == 1) b.in.fault = !b.in.fault;
      if (r == 2) b.in.openLimitOk = !b.in.openLimitOk;
      if (r == 3) b.in.closeLimitOk = !b.in.closeLimitOk;
      if (r == 4) b.in.closeChainOk = !b.in.closeChainOk;
      if (!b.in.closeLimitOk) b.in.closeChainOk = false;  // the chain includes the close limit
      b.step();
    }
    CHECK(b.invariantFailures == 0);
  });

  // ---- the NEC decoder
  auto send = [](nec::Decoder& d, uint32_t frame, std::vector<nec::Result>& out) {
    auto f = [&](bool low, uint32_t us) { out.push_back(d.feed(low, us)); };
    f(true, 9000); f(false, 4500);
    for (int i = 0; i < 32; ++i) { f(true, 560); f(false, (frame >> i) & 1 ? 1690 : 560); }
    f(true, 560);
  };
  test("NEC: a frame decodes (address 0x00, command 0x45)", [&] {
    nec::Decoder d; std::vector<nec::Result> r;
    const uint32_t frame = 0x00u | (0xFFu << 8) | (0x45u << 16) | ((0x45u ^ 0xFFu) << 24);
    send(d, frame, r);
    CHECK(r.back() == nec::Result::Frame);
    CHECK(d.frame() == frame);
  });
  test("NEC: a frame with ±20 % timing decodes; a corrupted command byte is rejected", [&] {
    nec::Decoder d;
    const uint32_t frame = 0x12u | (0x34u << 8) | (0x0Cu << 16) | ((0x0Cu ^ 0xFFu) << 24);
    nec::Result last = nec::Result::None;
    auto f = [&](bool low, uint32_t us) { last = d.feed(low, us); };
    f(true, 9000 * 12 / 10); f(false, 4500 * 8 / 10);
    for (int i = 0; i < 32; ++i) { f(true, 560 * 12 / 10); f(false, (frame >> i) & 1 ? 1690 * 8 / 10 : 560 * 12 / 10); }
    f(true, 560);
    CHECK(last == nec::Result::Frame && d.frame() == frame);
    std::vector<nec::Result> r;
    send(d, frame ^ (1u << 20), r);  // one bit of the command flipped
    CHECK(r.back() == nec::Result::None);
  });
  test("NEC: a repeat code is recognised and is not a frame", [&] {
    nec::Decoder d;
    CHECK(d.feed(true, 9000) == nec::Result::None);
    CHECK(d.feed(false, 2250) == nec::Result::None);
    CHECK(d.feed(true, 560) == nec::Result::Repeat);
  });
  test("NEC: noise (bursts of other lengths) gives no frame", [&] {
    nec::Decoder d; int frames = 0; std::srand(2);
    for (int i = 0; i < 100000; ++i) if (d.feed(i & 1, 100 + std::rand() % 12000) == nec::Result::Frame) ++frames;
    CHECK(frames == 0);
  });

  // ---- the paired remotes
  test("remotes: four slots, the oldest replaced; one command per press", [] {
    remotes::Table t;
    CHECK(t.learn(1) == 0); CHECK(t.learn(2) == 1); CHECK(t.learn(3) == 2); CHECK(t.learn(4) == 3);
    CHECK(t.learn(2) == remotes::kMax);  // already paired
    CHECK(t.learn(5) == 0);              // the oldest replaced
    CHECK(!t.contains(1) && t.contains(5) && t.contains(4));
    remotes::Debounce d;
    CHECK(d.accept(1000)); CHECK(!d.accept(1100)); CHECK(!d.accept(1650)); CHECK(d.accept(2300));
  });

  std::printf("\n%d checks, %d failed\n", checks, failures);
  return failures ? 1 : 0;
}
