#!/usr/bin/env python3
"""Builds the Increment 1 seed library index (UI-17) from the Phase 0 deliverables, so the
library browsers show real, sourced data. Every item is marked "seed (Phase 0, not yet
qualified)": boards are qualified in Increment 2, models in 5, the catalogue in 4."""
import csv, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
P0 = ROOT / "docs" / "phase0"
OUT = ROOT / "app" / "ui" / "src" / "library" / "seed.json"


def md_tables(text):
    tables, cur = [], []
    for line in text.splitlines():
        if line.startswith("|"):
            cur.append([c.strip() for c in line.strip().strip("|").split("|")])
        elif cur:
            tables.append(cur); cur = []
    if cur:
        tables.append(cur)
    return [(t[0], [r for r in t[2:] if len(r) == len(t[0])]) for t in tables if len(t) > 2]


def clean(s):
    return re.sub(r"\*\*|`", "", s).strip()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


SEED = "seed (Phase 0, not yet qualified)"
lib = {"generated_from": ["spikes/c/boards.json", "docs/phase0/d_kit_inventory.csv", "docs/phase0/e_curated_sets.md"],
       "boards": [], "models": [], "code_libraries": [], "datasheets": []}

boards = json.loads((ROOT / "spikes" / "c" / "boards.json").read_text())
for bid, b in boards.items():
    if bid.startswith("_"):
        continue
    lib["boards"].append({"id": bid, "name": b["name"], "facets": {"logic": f'{b["logic_v"]} V', "MCU": b["mcu"].split(" (")[0],
        "status": SEED}, "text": f'ADC: {b["adc"]}; DAC: {b["dac"]}; PWM: {b["pwm"]}; {b["buses"]}; pin current: {b["pin_current"]}'})

with open(P0 / "d_kit_inventory.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        if r["Interface"] == "Board":
            continue
        lib["models"].append({"id": slug(r["Part"]), "name": r["Part"], "facets": {"interface": r["Interface"],
            "emulation": r["Emulation class"], "in EM-03": r["In EM-03?"], "lifecycle": r["Lifecycle flag"], "status": SEED},
            "text": f'main IC: {r["Main IC"]}; kits: {r["Kits"]}; {r["Notes"]}'})

e = (P0 / "e_curated_sets.md").read_text(encoding="utf-8")
for head, rows in md_tables(e):
    if head[:2] == ["#", "Library (platform)"]:
        for r in rows:
            name = clean(r[1])
            plat = re.search(r"\(([^)]*)\)\s*(?:—.*)?$", name)
            platform = "C++" if "(C++" in name else "MicroPython" if "MicroPython" in name else "Pi Python" if "Pi Python" in name else "other"
            lib["code_libraries"].append({"id": clean(r[0]), "name": name, "facets": {"platform": platform,
                "licence": clean(r[4]).split(" (")[0], "status": SEED}, "text": f'{clean(r[2])}; {clean(r[3])}; {clean(r[5])}'})
    if head == ["Part", "Manufacturer", "URL", "Bundle?"]:
        for r in rows:
            bundled = "bundled" if clean(r[3]).lower().startswith("yes") else "parameter sheet + URL"
            lib["datasheets"].append({"id": slug(r[0])[:60], "name": clean(r[0]), "facets": {"manufacturer": clean(r[1]),
                "handling": bundled, "status": SEED}, "text": clean(r[2])})

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(lib, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print({k: len(v) for k, v in lib.items() if isinstance(v, list)})
