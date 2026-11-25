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

// ---- the machine on the bench: the outputs reach their loads only through the enable switch
// (with the rail on); a load acts once it has been fed for 20 ms (a contactor's or a valve's pull-in);
// the cylinders move while their valve is fed and the pump has run 1 s (positions 0 … 1000, a full
// stroke in 2 s); the feeder runs out and back in 4 s while its motor runs; the pressure switch
// closes while the tamper presses at its end; the operator changes pallets. Faults: an output
// stuck on (its switch shorted) or shorted to the frame, the enable switch stuck on, a sensor
// broken, the feeder stuck. The invariants are checked at every millisecond.
using bm::Out;
struct Machine {
  bm::Logic g;
  bm::Inputs in{};
  int tamper = 0, mould = 0, feeder = 0;  // tamper 0 up … 1000 down; mould 0 down … 1000 up; feeder 0 … 4000 (home near 0)
  bool rail = true, stopPressed = false, pallet = true;
  bool tamperSensorBroken = false, feederStuck = false, pressureBroken = false;
  bool stuckOn[bm::NOut] = {}, shorted[bm::NOut] = {}, enableStuck = false;
  uint32_t t = 0, fedSince[bm::NOut] = {}, maxFedWhileOff[bm::NOut] = {};
  bool fedWas[bm::NOut] = {};
  int invariantFailures = 0;
  explicit Machine(const bm::Config& c = bm::Config()) : g(c) { step(600); }
  bool fed(int k) const { const auto& o = g.outputs(); return rail && (o.enable || enableStuck) && (o.out[k] || stuckOn[k]) && !shorted[k]; }
  bool acting(int k) const { return fed(k) && t - fedSince[k] >= 20; }
  void sense() {
    in.railOn = rail;
    in.stop = stopPressed;
    in.tamperUp = tamper <= 20;
    in.tamperDown = !tamperSensorBroken && tamper >= 980;
    in.mouldDown = mould <= 20;
    in.mouldUp = mould >= 980;
    in.feederHome = feeder <= 50 || feeder >= 3950;
    in.palletIn = pallet;
    in.pressureOk = !pressureBroken && tamper >= 980 && acting(Out::TamperDown) && acting(Out::Pump);
    for (int k = 0; k < bm::NOut; ++k) in.fed[k] = fed(k);
    in.enableFed = rail && (g.outputs().enable || enableStuck);
  }
  void move() {
    for (int k = 0; k < bm::NOut; ++k) {
      const bool f = fed(k);
      if (f && !fedWas[k]) fedSince[k] = t;
      fedWas[k] = f;
      if (f && !g.outputs().out[k]) maxFedWhileOff[k] = t - fedSince[k] + 1 > maxFedWhileOff[k] ? t - fedSince[k] + 1 : maxFedWhileOff[k];
    }
    const bool pressure = acting(Out::Pump) && t - fedSince[Out::Pump] >= 1000;
    if (pressure && acting(Out::TamperDown) && tamper < 1000) tamper += 1;
    if (pressure && acting(Out::TamperUp) && tamper > 0) tamper -= 1;
    if (pressure && acting(Out::MouldUp) && mould < 1000) mould += 1;
    if (pressure && acting(Out::MouldDown) && mould > 0) mould -= 1;
    if (acting(Out::Feeder) && !feederStuck) feeder = (feeder + 1) % 4000;
  }
  void step(int ms = 1) {
    for (int i = 0; i < ms; ++i, ++t) {
      sense();
      g.step(t, in);
      in.start = false;
      const auto& o = g.outputs();
      const bool* q = o.out;
      const int valves = q[Out::TamperDown] + q[Out::TamperUp] + q[Out::MouldUp] + q[Out::MouldDown];
      if (q[Out::TamperDown] && q[Out::TamperUp]) ++invariantFailures;
      if (q[Out::MouldUp] && q[Out::MouldDown]) ++invariantFailures;
      if (valves > 2) ++invariantFailures;
      if (q[Out::Feeder] && !in.tamperUp) ++invariantFailures;
      if (q[Out::TamperDown] && !in.feederHome) ++invariantFailures;
      if ((!rail || stopPressed) && o.any()) ++invariantFailures;
      if (o.any() && !o.enable) ++invariantFailures;
      if ((q[Out::Vib1] || q[Out::Vib2]) && !(g.state() == State::Fill || g.state() == State::Press || g.state() == State::Vibrate)) ++invariantFailures;
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
    bm::Logic g; bm::Inputs in{}; in.railOn = true;
    for (uint32_t t = 0; t < 400; ++t) { g.step(t, in); CHECK(!g.outputs().any() && g.state() == State::Off); }
    Machine m; m.rail = false; m.step(100); m.start(); m.step(3000);
    CHECK(m.g.state() == State::Off && !m.g.outputs().out[Out::Pump] && !m.g.outputs().lamp);
    m.rail = true; m.step(100);
    CHECK(m.g.state() == State::Idle);  // the rail back: nothing until START
    m.step(3000);
    CHECK(!m.g.outputs().out[Out::Pump] && !m.g.outputs().out[Out::Feeder]);
    CHECK(m.invariantFailures == 0);
  });
  test("START at home: READY (the lamp on) without moving anything", [] {
    Machine m; m.start(); m.step(10);
    CHECK(m.g.state() == State::Ready && m.g.outputs().lamp && !m.g.outputs().out[Out::Pump]);
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
    CHECK(m.g.outputs().out[Out::Vib1] && m.g.outputs().out[Out::Feeder]);
    CHECK(m.reach(State::Press, 6000));
    CHECK(m.feeder <= 50 || m.feeder >= 3950);
    CHECK(m.reach(State::Vibrate, 3000));
    const uint32_t t0 = m.t;
    CHECK(m.reach(State::Demould, 5000));
    CHECK(m.t - t0 >= 3990 && m.t - t0 <= 4010);
    m.step();
    CHECK(m.g.outputs().out[Out::TamperDown] && m.g.outputs().out[Out::MouldUp] && !m.g.outputs().out[Out::Vib1]);
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
    CHECK(m.g.state() == State::Ready && m.g.outputs().out[Out::Pump]);
    m.step(51000);
    CHECK(!m.g.outputs().out[Out::Pump]);
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
    CHECK(!o.out[Out::Pump] && !o.out[Out::TamperDown] && !o.out[Out::Vib1] && !o.out[Out::Feeder]);
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
    CHECK(!o.out[Out::Pump] && !o.out[Out::TamperDown] && !o.out[Out::Vib1] && m.g.state() == State::Idle);
    m.start(); m.step(2000);
    CHECK(!m.g.outputs().out[Out::Pump]);
    m.stopPressed = false; m.step(10); m.start();
    CHECK(m.reach(State::HomeTamper, 100));
    CHECK(m.reach(State::Ready, 20000));
    CHECK(m.invariantFailures == 0);
  });
  test("the safety rail lost during the fill (E-stop): every output off; it returns: nothing until START", [] {
    Machine m; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Fill, 3000)); m.step(500);
    m.rail = false; m.step();
    CHECK(m.g.state() == State::Off && !m.g.outputs().out[Out::Feeder] && !m.g.outputs().out[Out::Vib1] && !m.g.outputs().out[Out::Pump]);
    m.step(1000); m.rail = true; m.step(5000);
    CHECK(m.g.state() == State::Idle && !m.g.outputs().out[Out::Feeder] && !m.g.outputs().out[Out::Pump]);
    m.start();
    CHECK(m.reach(State::Ready, 20000));  // homes: the feeder back first (the tamper is up)
    CHECK(m.invariantFailures == 0);
  });
  test("an interlock broken by a sensor: the tamper leaves its top while the feeder runs: FAULT, everything off", [] {
    Machine m; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Fill, 3000)); m.step(300);
    m.tamper = 500; m.step();  // (a sagging tamper)
    CHECK(m.g.state() == State::Fault && m.g.faultAt() == State::Fill && !m.g.outputs().out[Out::Feeder]);
  });
  test("a pallet taken away while the mould comes down: the mould stops and waits", [] {
    Machine m; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Pallet, 30000)); m.changePallet();
    CHECK(m.reach(State::MouldDown, 100)); m.step(300);
    m.pallet = false; m.step();
    CHECK(m.g.state() == State::Pallet && !m.g.outputs().out[Out::MouldDown]);
    m.pallet = true;
    CHECK(m.reach(State::Ready, 5000));
  });
  test("an output stuck on (its switch shorted) when the rail comes on: the enable is never given (or dropped within 3 ms): its contactor never pulls in; FAULT (output stuck)", [] {
    Machine m; m.rail = false; m.step(100);
    m.stuckOn[Out::Feeder] = true;
    m.rail = true; m.step(200);
    CHECK(m.g.state() == State::Fault && m.g.cause() == bm::Cause::OutputStuck);
    CHECK(m.maxFedWhileOff[Out::Feeder] < 20);  // fed for less than a contactor's pull-in
    CHECK(!m.g.outputs().enable);
    CHECK(m.feeder == 0);
    m.start(); m.step(2000);
    CHECK(m.g.state() == State::Fault);   // no start
    CHECK(m.invariantFailures == 0);
  });
  test("an output shorts during the fill (its wire to the frame): FAULT (output short) within about 30 ms, every output off", [] {
    Machine m; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Fill, 3000)); m.step(200);
    m.shorted[Out::Feeder] = true;
    const uint32_t t0 = m.t;
    CHECK(m.reach(State::Fault, 100));
    CHECK(m.t - t0 <= 35 && m.g.cause() == bm::Cause::OutputShort);
    m.step();
    CHECK(!m.g.outputs().any() && !m.g.outputs().enable);
  });
  test("the enable switch stuck on: found before it is commanded, FAULT; no output given", [] {
    Machine m; m.rail = false; m.step(100);
    m.enableStuck = true; m.rail = true; m.step(50);
    CHECK(m.g.state() == State::Fault && m.g.cause() == bm::Cause::EnableFault);
    m.start(); m.step(1000);
    CHECK(!m.g.outputs().any());
  });
  test("a motor breaker trips, or the oil is hot: FAULT with its cause, every output off", [] {
    Machine m; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Fill, 3000)); m.step(100);
    m.in.breakersOk = false; m.step(2);
    CHECK(m.g.state() == State::Fault && m.g.cause() == bm::Cause::Breaker && !m.g.outputs().any());
    Machine n; n.in.oilOk = false; n.step(5);
    CHECK(n.g.state() == State::Fault && n.g.cause() == bm::Cause::OilHot);
  });
  test("the tamper reaches its end without the working pressure (the pump weak, the switch broken): FAULT (no pressure) 10 s into PRESS", [] {
    Machine m; m.pressureBroken = true; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Press, 10000));
    CHECK(m.reach(State::Fault, 11000));
    CHECK(m.g.faultAt() == State::Press && m.g.cause() == bm::Cause::NoPressure);
  });
  test("a fault is kept (and shown) while the safety rail is off; STOP clears it", [] {
    Machine m; m.tamperSensorBroken = true; m.start(); m.step(10); m.start();
    CHECK(m.reach(State::Fault, 25000));
    m.rail = false; m.step(500);
    CHECK(m.g.state() == State::Fault);
    m.stopPressed = true; m.step(10); m.stopPressed = false; m.rail = true; m.step(100);
    CHECK(m.g.state() == State::Idle);
  });
  test("sensor plausibility: a cylinder's two end sensors both on, or the end a move starts from still seen after 1 s (a stuck sensor): FAULT (sensor)", [] {
    Machine m; m.start(); m.step(10);
    m.tamper = 990;  // "tamper down" and, below, a stuck "tamper up" at once
    bool both = false;
    m.in.start = false;
    for (int i = 0; i < 5 && !both; ++i) { m.sense(); m.in.tamperUp = true; m.g.step(m.t++, m.in); both = m.g.state() == State::Fault; }
    CHECK(both && m.g.cause() == bm::Cause::Sensor);
    Machine n; n.start(); n.step(10); n.start();
    CHECK(n.reach(State::Press, 10000));
    bool stuck = false;
    for (int i = 0; i < 1500 && !stuck; ++i) { n.sense(); n.in.tamperUp = true; n.in.tamperDown = false; n.g.step(n.t++, n.in); stuck = n.g.state() == State::Fault; }
    CHECK(stuck && n.g.cause() == bm::Cause::Sensor && n.g.faultAt() == State::Press);
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
      if (r == 9) m.in.breakersOk = !m.in.breakersOk;
      if (r == 10) m.pressureBroken = !m.pressureBroken;
      if (r == 11) m.shorted[std::rand() % bm::NOut] ^= true;
      m.step();
    }
    CHECK(m.invariantFailures == 0);
  });

  std::printf("\n%d checks, %d failed\n", checks, failures);
  return failures ? 1 : 0;
}
