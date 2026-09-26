"""Phase 0 spike — not application code.

Run an unmodified gpiozero script under MockFactory + VirtualClock for N emulated seconds and
record every pin transition with its emulated timestamp.
usage: python run_emulated.py SCRIPT EMU_SECONDS [press:PIN@T[,release:PIN@T...]]
"""
import json, os, runpy, sys, threading, time as _t
_wall = _t.perf_counter            # keep a real clock before patching
sys.path.insert(0, os.path.dirname(__file__))
import vclock


def run(script, seconds, stimuli=()):
    clock = vclock.VirtualClock(end=seconds)
    vclock.install(clock)
    vclock.install_asyncio(clock)
    os.environ["GPIOZERO_PIN_FACTORY"] = "mock"
    from gpiozero import Device
    from gpiozero.pins.mock import MockFactory, MockPWMPin, MockPin
    Device.pin_factory = MockFactory(pin_class=MockPWMPin)
    log = []
    orig = MockPin._change_state

    def rec(self, value):
        changed = orig(self, value)
        if changed:
            log.append((round(clock.now, 6), self.info.name, value))
        return changed
    MockPin._change_state = rec
    for kind, pin, at in stimuli:
        p = Device.pin_factory.pin(pin)
        clock.schedule(at, p.drive_low if kind == "press" else p.drive_high)
    threading.excepthook = lambda a: None if issubclass(a.exc_type, vclock.EmulationEnd) else sys.__excepthook__(a.exc_type, a.exc_value, a.exc_traceback)
    w0 = _wall()
    try:
        runpy.run_path(script, run_name="__main__")
    except vclock.EmulationEnd:
        pass
    wall = _wall() - w0
    return {"script": os.path.basename(script), "emu_s": clock.now, "wall_s": round(wall, 4),
            "ratio_emu_to_real": round(clock.now / wall, 1) if wall else None,
            "clock_advances": clock.advances, "transitions": log}


if __name__ == "__main__":
    stim = []
    if len(sys.argv) > 3:
        for item in sys.argv[3].split(","):
            kind, rest = item.split(":")
            pin, at = rest.split("@")
            stim.append((kind, pin, float(at)))
    r = run(sys.argv[1], float(sys.argv[2]), stim)
    tr = r.pop("transitions")
    r["n_transitions"] = len(tr)
    r["first_transitions"] = tr[:10]
    r["last_transitions"] = tr[-3:]
    print(json.dumps(r))
    os._exit(0)
