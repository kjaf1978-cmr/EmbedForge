#!/usr/bin/env python3
"""Writes the third-party notice list of the embedforge-app component (licences/THIRD-PARTY.txt):
every Rust crate linked into the app, installer and helper, and every npm package bundled into
the UI, with version and licence. Usage: third_party_notices.py <repo-root> > THIRD-PARTY.txt"""
import json, subprocess, sys, pathlib

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

def crates(ws):
    meta = json.loads(subprocess.check_output(["cargo", "metadata", "--format-version", "1", "--locked"], cwd=ws))
    nodes = {n["id"]: n for n in meta["resolve"]["nodes"]}
    seen, stack = set(), list(meta["workspace_members"])
    while stack:
        i = stack.pop()
        if i in seen: continue
        seen.add(i)
        for d in nodes[i]["deps"]:
            if any(k["kind"] in (None, "build") for k in d["dep_kinds"]):
                stack.append(d["pkg"])
    pk = {p["id"]: p for p in meta["packages"]}
    return {(pk[i]["name"], pk[i]["version"], pk[i].get("license") or "UNKNOWN") for i in seen - set(meta["workspace_members"])}

rs = crates(root / "core") | crates(root / "app" / "src-tauri")
lock = json.loads((root / "app" / "ui" / "package-lock.json").read_text())
npm = sorted({(k.split("node_modules/")[-1], v.get("version", ""), v.get("license", "UNKNOWN"))
              for k, v in lock.get("packages", {}).items() if k and not v.get("dev")})
print("EmbedForge — third-party components linked or bundled into this component")
print("EmbedForge itself is licensed GPL-3.0-or-later (licences/LICENSE).")
print("The Rust list covers every target platform of the lock files, so it may name crates used only on other host OSes.\n")
print(f"Rust crates ({len(rs)}):")
for n, v, l in sorted(rs): print(f"  {n} {v}: {l}")
print(f"\nJavaScript packages in the user interface ({len(npm)}):")
for n, v, l in npm: print(f"  {n} {v}: {l}")
print("\nlibgit2 (bundled by libgit2-sys) is licensed GPL-2.0-only with the linking exception.")
