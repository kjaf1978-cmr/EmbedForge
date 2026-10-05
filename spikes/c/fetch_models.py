#!/usr/bin/env python3
"""Phase 0 (c) spike - not application code.
Download candidate GGUF models from Hugging Face (stdlib only, resumable).
Usage:  python fetch_models.py --set A            (or --models qwen3-4b,qwen3-8b)
        python fetch_models.py --set B --dest D:\\ef-models
A repository is used only if its model card licence is apache-2.0 or mit (D11 F0-04)."""
import argparse, hashlib, json, os, pathlib, re, sys, time, urllib.request, urllib.error

HERE = pathlib.Path(__file__).resolve().parent
ALLOWED = {"apache-2.0", "mit"}


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "embedforge-phase0-bench"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def licence_of(info):
    lic = (info.get("cardData") or {}).get("license")
    if not lic:
        for t in info.get("tags", []):
            if t.startswith("license:"):
                lic = t.split(":", 1)[1]
    return (lic or "").lower()


def pick_files(info, prefs):
    files = [s["rfilename"] for s in info.get("siblings", []) if s["rfilename"].lower().endswith(".gguf")]
    files = [f for f in files if "mmproj" not in f.lower()]
    for q in prefs:
        hit = sorted(f for f in files if q.lower() in f.lower())
        if hit:
            first = hit[0]
            m = re.search(r"-(\d{5})-of-(\d{5})\.gguf$", first)
            if m:  # split model: take every part of the same set
                stem = first[: m.start()]
                return [f for f in hit if f.startswith(stem)]
            return [first]
    return []


def download(url, dest: pathlib.Path):
    part = dest.with_suffix(dest.suffix + ".part")
    have = part.stat().st_size if part.exists() else 0
    if dest.exists():
        print(f"  already present: {dest.name}")
        return
    req = urllib.request.Request(url, headers={"User-Agent": "embedforge-phase0-bench"})
    if have:
        req.add_header("Range", f"bytes={have}-")
    with urllib.request.urlopen(req, timeout=120) as r, open(part, "ab" if have else "wb") as f:
        total = int(r.headers.get("Content-Length", 0)) + have
        t0, done = time.time(), have
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            done += len(chunk)
            if time.time() - t0 > 5:
                print(f"  {dest.name}: {done/1e9:.2f}/{total/1e9:.2f} GB", flush=True)
                t0 = time.time()
    part.rename(dest)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    cfg = json.loads((HERE / "models.json").read_text(encoding="utf-8"))
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", choices=sorted(cfg["sets"]))
    ap.add_argument("--models", help="comma-separated model ids")
    ap.add_argument("--dest", default=str(HERE / "models"))
    a = ap.parse_args()
    ids = a.models.split(",") if a.models else cfg["sets"].get(a.set or "", [])
    if not ids:
        sys.exit("give --set or --models")
    dest_root = pathlib.Path(a.dest)
    manifest_path = dest_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    by_id = {m["id"]: m for m in cfg["models"]}
    for mid in ids:
        m = by_id[mid]
        print(f"[{mid}]")
        for cand in m["repos"]:
            repo = cand["repo"]
            try:
                info = get_json(f"https://huggingface.co/api/models/{repo}")
            except urllib.error.HTTPError as e:
                print(f"  {repo}: HTTP {e.code}, trying next")
                continue
            lic = licence_of(info)
            if lic not in ALLOWED:
                print(f"  {repo}: licence '{lic}' not allowed (F0-04), trying next")
                continue
            files = pick_files(info, cfg["quant_preference"])
            if not files:
                print(f"  {repo}: no {cfg['quant_preference']} GGUF, trying next")
                continue
            d = dest_root / mid
            d.mkdir(parents=True, exist_ok=True)
            for fn in files:
                download(f"https://huggingface.co/{repo}/resolve/main/{fn}", d / pathlib.Path(fn).name)
            local = [str((d / pathlib.Path(fn).name).resolve()) for fn in files]
            manifest[mid] = {"repo": repo, "licence": lic, "files": local,
                             "sha256": {pathlib.Path(p).name: sha256(p) for p in local},
                             "revision": info.get("sha"), "fetched": time.strftime("%Y-%m-%d")}
            manifest_path.write_text(json.dumps(manifest, indent=1))
            print(f"  OK from {repo} ({lic}): {[pathlib.Path(p).name for p in local]}")
            break
        else:
            print(f"  FAILED: no usable repository for {mid} - record this in the results")
    print(f"manifest: {manifest_path}")


if __name__ == "__main__":
    main()
