"""Phase 0 spike — not application code. Assertions on emulated timestamps (run: python test_vclock.py)."""
import subprocess, sys, json, os
HERE = os.path.dirname(os.path.abspath(__file__)); PY = sys.executable

def run(script, secs, stim=""):
    out = subprocess.run([PY, "-c", f"""
import sys, json, os; sys.path.insert(0, {HERE!r}); import run_emulated as r
res = r.run({os.path.join(HERE, 'scripts', script)!r}, {secs}, {stim!r})
res['transitions'] = [t for t in res['transitions'] if t[0] < {secs}]   # drop teardown at end
print('JSON' + json.dumps(res)); os._exit(0)"""], capture_output=True, text=True, timeout=60).stdout
    return json.loads(out.split("JSON", 1)[1])

def edges(res, pin): return [(t, v) for t, p, v in res["transitions"] if p == pin]

r = run("blink_sleep.py", 60)
e = edges(r, "GPIO17")
assert len(e) == 120 and all(abs(t - i * 0.5) < 1e-9 for i, (t, v) in enumerate(e)), e[:4]
assert r["wall_s"] < 6, r["wall_s"]; print("blink_sleep OK", r["wall_s"], "s wall for 60 s")

r = run("button_callback.py", 60, [("press", "GPIO2", 10.0), ("release", "GPIO2", 10.2), ("press", "GPIO2", 30.5)])
assert edges(r, "GPIO27") == [(10.0, 1.0), (30.5, 0.0)], edges(r, "GPIO27"); print("button_callback OK", r["wall_s"])

r = run("background_blink_pwm.py", 60)
b = edges(r, "GPIO22")
assert b[:4] == [(0.0, 1.0), (0.25, 0.0), (1.0, 1.0), (1.25, 0.0)] and len(b) == 120, b[:4]
pw = edges(r, "GPIO18"); peak = max(pw, key=lambda x: x[1])
assert abs(peak[0] - 1.0) < 1e-6 and abs(peak[1] - 1.0) < 1e-6, peak; print("blink+pulse OK", r["wall_s"])

r = run("busy_poll.py", 10)
assert abs(edges(r, "GPIO5")[0][0] - 3.0) < 1e-3; print("busy_poll OK", r["wall_s"])

r = run("asyncio_blink.py", 10)
assert [t for t, _ in edges(r, "GPIO6")] == [float(i) for i in range(10)]; print("asyncio OK", r["wall_s"])
print("ALL PASSED")
