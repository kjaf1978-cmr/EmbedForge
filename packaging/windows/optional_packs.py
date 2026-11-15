#!/usr/bin/env python3
"""Writes the NSIS sections for the optional packs of a medium spec (SS-01). Each section
adds its configuration-item id to $With; its description states the consequence of leaving
the pack out. Usage: optional_packs.py <medium-spec.json>"""
import json, pathlib, re, sys

spec = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
out, descs = [], []
for i, p in enumerate(x for x in spec["packs"] if x.get("optional")):
    m = json.loads(pathlib.Path(p["manifest"]).read_text(encoding="utf-8"))
    ci, cons = m["ci"], (p.get("consequence") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9._-]+", ci) or not cons:
        sys.exit(f"optional pack {ci!r}: bad id or no consequence text")
    size_mb = sum(f["size"] for f in m["files"]) // (1024 * 1024)
    q = lambda s: s.replace("$", "$$").replace('"', "$\\\"")
    out += [f'Section /o "{q(ci)} {m["version"]} ({size_mb} MB)" SecOpt{i}',
            f'  StrCmp $With "" 0 +3',
            f'  StrCpy $With "{ci}"',
            f'  Goto +2',
            f'  StrCpy $With "$With,{ci}"',
            "SectionEnd"]
    descs.append(f'  !insertmacro MUI_DESCRIPTION_TEXT ${{SecOpt{i}}} "Without it: {q(cons)}"')
print("\n".join(out))
if descs:
    print("!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN")
    print("\n".join(descs))
    print("!insertmacro MUI_FUNCTION_DESCRIPTION_END")
