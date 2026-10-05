#!/usr/bin/env python3
"""Linked-component licence gate (Phase 0 (a), C3-05): every crate compiled into EmbedForge
binaries must be compatible with GPL-3.0-or-later. Exits non-zero on any unknown or
incompatible licence. Usage: python3 tools/check_licences.py [core-dir]"""
import json, re, subprocess, sys, pathlib

ALLOWED = {"MIT", "MIT-0", "Apache-2.0", "Apache-2.0 WITH LLVM-exception", "BSD-2-Clause", "BSD-3-Clause", "ISC",
           "Zlib", "Unicode-3.0", "Unicode-DFS-2016", "MPL-2.0", "CC0-1.0", "Unlicense", "BSL-1.0", "0BSD",
           "GPL-3.0-or-later", "GPL-3.0-only", "LGPL-2.1-or-later", "LGPL-3.0-or-later", "CDLA-Permissive-2.0"}
# Bundled C library notes (not visible as a crate licence)
NOTES = {"libgit2-sys": "bundles libgit2: GPL-2.0-only WITH linking exception (compatible, see a_licence_analysis.md)"}

def ok(expr):
    expr = expr.replace("/", " OR ")
    for alt in re.split(r"\s+OR\s+", expr.strip("() ")):
        parts = [p.strip("() ") for p in re.split(r"\s+AND\s+", alt)]
        if all(p in ALLOWED for p in parts):
            return True
    return False

core = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent.parent / "core")
meta = json.loads(subprocess.check_output(["cargo", "metadata", "--format-version", "1", "--locked"], cwd=core))
ws = set(meta["workspace_members"])
# only crates that are actually linked: resolve normal (non-dev) dependency closure of workspace members
nodes = {n["id"]: n for n in meta["resolve"]["nodes"]}
seen, stack = set(), list(ws)
while stack:
    i = stack.pop()
    if i in seen: continue
    seen.add(i)
    for d in nodes[i]["deps"]:
        if any(k["kind"] in (None, "build") for k in d["dep_kinds"]):
            stack.append(d["pkg"])
pk = {p["id"]: p for p in meta["packages"]}
bad, rows = [], []
for i in sorted(seen - ws, key=lambda x: pk[x]["name"]):
    p = pk[i]; lic = p.get("license") or "UNKNOWN"
    rows.append((p["name"], p["version"], lic))
    if not ok(lic): bad.append((p["name"], p["version"], lic))
print(f"{len(rows)} linked third-party crates checked")
for n, v, l in rows:
    if n in NOTES: print(f"  note: {n} {v}: {NOTES[n]}")
if bad:
    print("NOT ALLOWED / UNKNOWN:"); [print(f"  {n} {v}: {l}") for n, v, l in bad]; sys.exit(1)
print("PASS: all linked crates are GPL-3.0-or-later compatible")
