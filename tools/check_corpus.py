"""Coverage check for the draft VAPP-06 corpus (docs/phase0/j_vapp06_corpus.yaml).
Exits non-zero if any VAPP-06 / prompt coverage rule is violated."""
import sys, pathlib, yaml

BOARDS = {"uno", "nano", "mega2560", "pi5", "pi4b", "pi3bplus", "pizero2w",
          "pico", "picow", "pico2", "pico2w"}
NL02 = set("abcdefghi")
EM03 = {"resistor", "capacitor", "potentiometer", "led", "rgb_led", "push_button", "switch",
        "diode", "bjt", "mosfet", "relay", "optocoupler", "voltage_regulator", "level_shifter",
        "dc_motor", "servo", "stepper_uln2003", "stepper_a4988", "stepper_drv8825",
        "l298n", "tb6612fng", "l293d", "buzzer", "lcd1602_i2c", "ssd1306", "seven_segment",
        "keypad4x4", "dht11", "dht22", "ds18b20", "hcsr04", "hcsr501", "ldr", "ir_receiver",
        "joystick", "rotary_encoder", "icm42688p", "bmp280", "bme280", "ds1307", "ds3231",
        "mcp4725", "ads1115", "pcf8574", "mcp23017"}

path = pathlib.Path(__file__).resolve().parent.parent / "docs/phase0/j_vapp06_corpus.yaml"
doc = yaml.safe_load(path.read_text(encoding="utf-8"))
entries = doc["entries"]
err = []
ids = [e["id"] for e in entries]
if len(entries) < 40: err.append(f"only {len(entries)} entries (< 40)")
if len(ids) != len(set(ids)): err.append("duplicate ids")
seen_b, seen_t, seen_p, uncovered = set(), set(), set(), 0
for e in entries:
    for k in ("id", "board", "prompt", "parts", "expected_questions", "scripted_answers", "assertions"):
        if k not in e: err.append(f"{e.get('id')}: missing {k}")
    if e["board"] not in BOARDS: err.append(f"{e['id']}: unknown board {e['board']}")
    seen_b.add(e["board"])
    for p in e["parts"]:
        if p not in EM03 and not str(p).startswith("x_"): err.append(f"{e['id']}: unknown part {p}")
        seen_p.add(p)
    qids = set()
    for q in e["expected_questions"]:
        if q.get("type") not in NL02: err.append(f"{e['id']}: bad NL-02 type {q.get('type')}")
        if not q.get("signal"): err.append(f"{e['id']}: question without signal tag")
        if not q.get("id"): err.append(f"{e['id']}: question without id")
        qids.add(q.get("id")); seen_t.add(q.get("type"))
        if q.get("type") == "i": uncovered += 1
    for a in e["scripted_answers"]:
        if a.get("q") not in qids: err.append(f"{e['id']}: answer to unknown question {a.get('q')}")
    if set(qids) - {a.get("q") for a in e["scripted_answers"]}:
        err.append(f"{e['id']}: unanswered expected questions")
    for a in e["assertions"]:
        if not all(k in a for k in ("at_ms", "expect")):
            err.append(f"{e['id']}: assertion needs at_ms and expect")
for name, need, got in (("boards", BOARDS, seen_b), ("NL-02 types", NL02, seen_t), ("EM-03 parts", EM03, seen_p)):
    miss = need - got
    if miss: err.append(f"missing {name}: {sorted(miss)}")
n_uncov = sum(1 for e in entries if any(q["type"] == "i" for q in e["expected_questions"]))
if n_uncov < 2: err.append(f"only {n_uncov} prompts with NL-02(i) (need >= 2)")
print(f"{len(entries)} entries; boards {len(seen_b)}/{len(BOARDS)}; NL-02 types "
      f"{len(seen_t & NL02)}/9; EM-03 parts {len(seen_p & EM03)}/{len(EM03)}; "
      f"questions {sum(len(e['expected_questions']) for e in entries)}; NL-02(i) prompts {n_uncov}")
if err:
    print("FAIL"); [print(" -", x) for x in err]; sys.exit(1)
print("PASS")
