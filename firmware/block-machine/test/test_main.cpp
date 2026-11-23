// Host unit tests of the block machine's sequence (D48): g++ on the host, no Arduino.
//   make -C firmware/block-machine test
// SPDX-License-Identifier: GPL-3.0-or-later
#include <cstdio>
#include <cstdlib>
#include <functional>
#include "../src/machine_logic.h"

static int failures = 0, checks = 0;
#define CHECK(c) do { ++checks; if (!(c)) { ++failures; std::printf("  FAIL %s:%d: %s\n", __FILE__, __LINE__, #c); } } while (0)

using bm::State;

// ---- the machine on the bench: the cylinders move while their valve is on and the pump has run
// 1 s (positions 0 … 1000, a full stroke in 2 s); the feeder runs out and back in 4 s while its
// motor runs; the operator changes pallets. The invariants are checked at every millisecond.
struct Machine {
  bm::Logic g;
  bm::Inputs in{true, false, false, false, true, true, false, true, true};
  int tamper = 0, mould = 0, feeder = 0;  // tamper 0 up … 1000 down; mould 0 down … 1000 up; feeder 0 … 4000 (home near 0)
  bool rail = true, stopPressed = false, pallet = true;
  bool tamperSensorBroken = false, feederStuck = false;
  uint32_t t = 0, pumpSince = 0;
  bool pumpWas = false;
  int invariantFailures = 0;
  explicit Machine(const bm::Config& c = bm::Config()) : g(c) { step(600); }
  void sense() {
    in.railOn = rail;
    in.stop = stopPressed;
    in.tamperUp = tamper <= 20;
    in.tamperDown = !tamperSensorBroken && tamper >= 980;
    in.mouldDown = mould <= 20;
    in.mouldUp = mould >= 980;
    in.feederHome = feeder <= 50 || feeder >= 3950;
    in.palletIn = pallet;
  }
  void move() {
    const auto& o = g.outputs();
    if (o.pump && !pumpWas) pumpSince = t;
    pumpWas = o.pump;
    const bool pressure = o.pump && t - pumpSince >= 1000 && rail;
    if (pressure && o.tamperDown && tamper < 1000) tamper += 1;
    if (pressure && o.tamperUp && tamper > 0) tamper -= 1;
    if (pressure && o.mouldUp && mould < 1000) mould += 1;
    if (pressure && o.mouldDown && mould > 0) mould -= 1;
    if (o.feeder && rail && !feederStuck) feeder = (feeder + 1) % 4000;
  }
  void step(int ms = 1) {
    for (int i = 0; i < ms; ++i, ++t) {
      sense();
      g.step(t, in);
      in.start = false;
      const auto& o = g.outputs();
      const int valves = o.tamperDown + o.tamperUp + o.mouldUp + o.mouldDown;
      if (o.tamperDown && o.tamperUp) ++invariantFailures;
      if (o.mouldUp && o.mouldDown) ++invariantFailures;
      if (valves > 2) ++invariantFailures;
      if (o.feeder && !in.tamperUp) ++invariantFailures;
      if (o.tamperDown && !in.feederHome) ++invariantFailures;
      if ((!rail || stopPressed) && (o.pump || valves || o.feeder || o.vibrators)) ++invariantFailures;
      if (o.vibrators && !(g.state() == State::Fill || g.state() == State::Press || g.state() == State::Vibrate)) ++invariantFailures;
      move();
    }
  }
  void start() { in.start = true; step(); }
  bool until(const std::function<bool()>& p, int ms) { for (int i = 0; i < ms; ++i) { if (p()) return true; step(); } return p(); }
  bool reach(State s, int ms) { return until([&] { return g.state() == s; }, ms); }
  void changePallet() { pallet = false; step(2000); pallet = true; }
};

static void test(const char* name, const std::function<void()>& body) { std::printf("%s\n", name); body(); }

int main() {
  test("power-up: nothing for 0.5 s; with the safety rail off nothing at all, START ignored", [] {
    bm::Logic g; bm::Inputs in{true, false, true, false, true, true, false, true, true};
    for (uint32_t t = 0; t < 400; ++t) { g.step(t, in); CHECK(!g.outputs().pump && g.state() == State::Off); }
    Machine m; m.rail = false; m.step(100); m.start(); m.step(3000);
    CHECK(m.g.state() == State::Off && !m.g.outputs().pump && !m.g.outputs().lamp);
    m.rail = true; m.step(100);
    CHECK(m.g.state() == State::Idle);  // the rail back: nothing until START
    m.step(3000);
    CHECK(!m.g.outputs().pump && !m.g.outputs().feeder);
    CHECK(m.invariantFailures == 0);
  });
  test("START at home: READY (the lamp on) without moving anything", [] {
    Machine m; m.start(); m.step(10);
    CHECK(m.g.state() == State::Ready && m.g.outputs().lamp && !m.g.outputs().pump);
  });
  test("homing from anywhere: the tamper up first, then the feeder home, then the mould down onto a pallet", [] {
    Machine m; m.tamper = 600; m.feeder = 1500; m.mould = 1000; m.pallet = false;
    m.start();
    CHECK(m.reach(State::HomeFeeder, 5000));
    CHECK(m.tamper <= 20);           // the tamper up before the feeder moved
    CHECK(m.feeder == 1500);
    CHECK(m.reach(State::HomePallet, 5000));
    m.step(3000);
    CHECK(m.g.state() == State::HomePallet && m.mould == 1000);  // waits for a pallet
    m.pallet = true;
    CHECK(m.reach(State::Ready, 5000));
    CHECK(m.mould <= 20);
    CHECK(m.invariantFailures == 0);
  });
  test("a full cycle: pump, fill with the vibrators, press, vibrate 4 s, demould with the tamper holding, tamper up, the pallet changed, mould down: READY", [] {
    Machine m; m.start(); m.step(10);
    m.start();
    CHECK(m.reach(State::Fill, 3000));
    m.step();
    CHECK(m.g.outputs().vibrators && m.g.outputs().feeder);
    CHECK(m.reach(State::Press, 6000));
    CHECK(m.feeder <= 50 || m.feeder >= 3950);
    CHECK(m.reach(State::Vibrate, 3000));
    const uint32_t t0 = m.t;
    CHECK(m.reach(State::Demould, 5000));
    CHECK(m.t - t0 >= 3990 && m.t - t0 <= 4010);
    m.step();
    CHECK(m.g.outputs().tamperDown && m.g.outputs().mouldUp && !m.g.outputs().vibrators);
    CHECK(m.reach(State::TamperUp, 3000));
    CHECK(m.reach(State::Pallet, 3000));
    m.step(2000);
    CHECK(m.g.state() == State::Pallet);  // waits for the pallet change
    m.changePallet();
    CHECK(m.reach(State::Ready, 3000));
    CHECK(m.g.cycles() == 1 && m.mould <= 20 && m.tamper <= 20);
    CHECK(m.invariantFailures == 0);
  });
  test("one cycle per START: READY waits; the pump stops after 60 s without work", [] {
    Machine m; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Pallet, 30000));
    m.changePallet();
    CHECK(m.reach(State::Ready, 3000));
    m.step(10000);
    CHECK(m.g.state() == State::Ready && m.g.outputs().pump);
    m.step(51000);
    CHECK(!m.g.outputs().pump);
    CHECK(m.g.cycles() == 1);
  });
  test("the tamper's sensor broken: FAULT 10 s into PRESS, every output off, the lamp flashing; STOP clears it, START homes", [] {
    Machine m; m.tamperSensorBroken = true; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Press, 10000));
    const uint32_t t0 = m.t;
    CHECK(m.reach(State::Fault, 11000));
    CHECK(m.t - t0 >= 9990 && m.t - t0 <= 10010);
    CHECK(m.g.faultAt() == State::Press);
    m.step(1);
    const auto& o = m.g.outputs();
    CHECK(!o.pump && !o.tamperDown && !o.vibrators && !o.feeder);
    bool on = false, off = false;
    for (int i = 0; i < 300; ++i) { m.step(); (m.g.outputs().lamp ? on : off) = true; }
    CHECK(on && off);
    m.start(); m.step(100);
    CHECK(m.g.state() == State::Fault);  // START alone does not clear it
    m.stopPressed = true; m.step(10); m.stopPressed = false; m.step(100);
    CHECK(m.g.state() == State::Idle);
    m.tamperSensorBroken = false; m.start();
    CHECK(m.reach(State::Ready, 15000));
    CHECK(m.invariantFailures == 0);
  });
  test("the feeder does not leave home (its contactor or breaker): FAULT 3 s into FILL", [] {
    Machine m; m.feederStuck = true; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Fill, 3000));
    const uint32_t t0 = m.t;
    CHECK(m.reach(State::Fault, 4000));
    CHECK(m.t - t0 >= 2990 && m.t - t0 <= 3010 && m.g.faultAt() == State::Fill);
  });
  test("STOP during the press: every output off at once; nothing starts while it is held; START then homes", [] {
    Machine m; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Press, 10000)); m.step(300);
    m.stopPressed = true; m.step();
    const auto& o = m.g.outputs();
    CHECK(!o.pump && !o.tamperDown && !o.vibrators && m.g.state() == State::Idle);
    m.start(); m.step(2000);
    CHECK(!m.g.outputs().pump);
    m.stopPressed = false; m.step(10); m.start();
    CHECK(m.reach(State::HomeTamper, 100));
    CHECK(m.reach(State::Ready, 20000));
    CHECK(m.invariantFailures == 0);
  });
  test("the safety rail lost during the fill (E-stop): every output off; it returns: nothing until START", [] {
    Machine m; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Fill, 3000)); m.step(500);
    m.rail = false; m.step();
    CHECK(m.g.state() == State::Off && !m.g.outputs().feeder && !m.g.outputs().vibrators && !m.g.outputs().pump);
    m.step(1000); m.rail = true; m.step(5000);
    CHECK(m.g.state() == State::Idle && !m.g.outputs().feeder && !m.g.outputs().pump);
    m.start();
    CHECK(m.reach(State::Ready, 20000));  // homes: the feeder back first (the tamper is up)
    CHECK(m.invariantFailures == 0);
  });
  test("an interlock broken by a sensor: the tamper leaves its top while the feeder runs: FAULT, everything off", [] {
    Machine m; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Fill, 3000)); m.step(300);
    m.tamper = 500; m.step();  // (a sagging tamper)
    CHECK(m.g.state() == State::Fault && m.g.faultAt() == State::Fill && !m.g.outputs().feeder);
  });
  test("a pallet taken away while the mould comes down: the mould stops and waits", [] {
    Machine m; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Pallet, 30000)); m.changePallet();
    CHECK(m.reach(State::MouldDown, 100)); m.step(300);
    m.pallet = false; m.step();
    CHECK(m.g.state() == State::Pallet && !m.g.outputs().mouldDown);
    m.pallet = true;
    CHECK(m.reach(State::Ready, 5000));
  });
  test("random sensors, faults, STOP, E-stops and presses for 10 minutes: the invariants always hold", [] {
    Machine m; std::srand(3);
    for (int i = 0; i < 600000; ++i) {
      const int r = std::rand() % 3000;
      if (r == 0 || r == 1) m.in.start = true;
      if (r == 2) m.stopPressed = !m.stopPressed;
      if (r == 3) m.rail = !m.rail;
      if (r == 4) m.pallet = !m.pallet;
      if (r == 5) m.tamperSensorBroken = !m.tamperSensorBroken;
      if (r == 6) m.feederStuck = !m.feederStuck;
      if (r == 7) m.tamper = std::rand() % 1001;
      if (r == 8) m.mould = std::rand() % 1001;
      m.step();
    }
    CHECK(m.invariantFailures == 0);
  });

  std::printf("\n%d checks, %d failed\n", checks, failures);
  return failures ? 1 : 0;
}
