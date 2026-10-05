#!/usr/bin/env python3
"""Phase 0 (c) spike - not application code.
Benchmark local LLMs on the draft VAPP-06 corpus: NL-02 question recall (type + signal tag
matching), schema-valid output under grammar, load time (PERF-02) and draft time (PERF-03).
Stdlib only; runs on Windows, Ubuntu and Raspberry Pi OS.

Typical use:
  python bench.py --profile A --server-bin C:\\ef\\llama\\llama-server.exe --set A
  python3 bench.py --profile B --server-bin ~/ef/llama.cpp/build/bin/llama-server --set B
  python bench.py --profile X --external http://127.0.0.1:8080 --models mock   (harness test)
Results: results/<host>_<profile>/<model>[_nogrammar].jsonl and results/summary.csv
"""
import argparse, json, os, pathlib, platform, re, socket, statistics, subprocess, sys, time
import urllib.request, urllib.error

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
CORPUS = REPO / "docs" / "phase0" / "j_vapp06_corpus.json"
SCHEMA = json.loads((HERE / "nl02_schema.json").read_text(encoding="utf-8"))
BOARDS = json.loads((HERE / "boards.json").read_text(encoding="utf-8"))
TEMPLATE = (HERE / "prompt_template.txt").read_text(encoding="utf-8")


# ---------------------------------------------------------------- schema check (subset of JSON Schema used by nl02_schema.json)
def validate(obj, sch, path="$"):
    errs = []
    t = sch.get("type")
    tmap = {"object": dict, "array": list, "string": str}
    if t and not isinstance(obj, tmap[t]):
        return [f"{path}: expected {t}"]
    if t == "object":
        for k in sch.get("required", []):
            if k not in obj:
                errs.append(f"{path}: missing {k}")
        props = sch.get("properties", {})
        if sch.get("additionalProperties") is False:
            errs += [f"{path}: extra key {k}" for k in obj if k not in props]
        for k, v in obj.items():
            if k in props:
                errs += validate(v, props[k], f"{path}.{k}")
    elif t == "array":
        if "maxItems" in sch and len(obj) > sch["maxItems"]:
            errs.append(f"{path}: too many items")
        for i, v in enumerate(obj):
            errs += validate(v, sch["items"], f"{path}[{i}]")
    elif t == "string":
        if "enum" in sch and obj not in sch["enum"]:
            errs.append(f"{path}: {obj!r} not in enum")
        if "maxLength" in sch and len(obj) > sch["maxLength"]:
            errs.append(f"{path}: too long")
    return errs


# ---------------------------------------------------------------- scoring
def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower()).strip()


def signal_match(expected, raised):
    e, r = norm(expected), norm(raised)
    if not e or not r:
        return False
    if e == r:
        return True
    et, rt = set(e.split()), set(r.split())
    return et <= rt or rt <= et  # "fan" ~ "fan motor"; "W" ~ "output W"


def score(expected, raised):
    """Greedy one-to-one matching. strict = type and signal match (VAPP-06 rule);
    lenient = signal only (diagnostic). A raised signal that exactly names one expected
    signal is never fuzzily matched to a different expected signal ("fan_pwm" is not "fan")."""
    names = {norm(q["signal"]) for q in expected}

    def sig_ok(exp_sig, raised_sig):
        r = norm(raised_sig)
        if r in names and r != norm(exp_sig):
            return False
        return signal_match(exp_sig, raised_sig)

    out = {}
    for mode in ("strict", "lenient"):
        used, hits = set(), 0
        for q in expected:
            for j, r in enumerate(raised):
                if j in used:
                    continue
                if sig_ok(q["signal"], r.get("signal", "")) and (mode == "lenient" or r.get("type") == q["type"]):
                    used.add(j)
                    hits += 1
                    break
        out[mode] = hits
        if mode == "strict":
            out["raised_matched"] = len(used)
    return out


# ---------------------------------------------------------------- server handling
def http_json(url, payload=None, timeout=1800):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def wait_health(base, timeout_s):
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        try:
            if http_json(base + "/health", timeout=5).get("status") in ("ok", "no slot available"):
                return time.time() - t0
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError("server did not become healthy")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def board_facts(board):
    b = BOARDS[board]
    return "\n".join(f"- {k}: {v}" for k, v in b.items())


def ask(base, prompt, grammar, max_tokens, seed):
    body = {"messages": [{"role": "user", "content": prompt}], "temperature": 0, "seed": seed,
            "max_tokens": max_tokens, "chat_template_kwargs": {"enable_thinking": False}}
    if grammar:
        body["response_format"] = {"type": "json_schema", "json_schema": {"name": "nl02", "schema": SCHEMA}}
    try:
        return http_json(base + "/v1/chat/completions", body)
    except urllib.error.HTTPError as e:
        if grammar and e.code == 400:  # older llama-server form
            body["response_format"] = {"type": "json_object", "schema": SCHEMA}
            return http_json(base + "/v1/chat/completions", body)
        raise


def parse_answer(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    i, j = text.find("{"), text.rfind("}")
    return json.loads(text[i: j + 1]) if i >= 0 and j > i else json.loads(text)


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", required=True, help="A, B, or a label for a test run")
    ap.add_argument("--server-bin", help="path to llama-server")
    ap.add_argument("--external", help="use an already running server at this base URL")
    ap.add_argument("--models-dir", default=str(HERE / "models"))
    ap.add_argument("--set", help="model set from models.json (A or B)")
    ap.add_argument("--models", help="comma-separated model ids (overrides --set)")
    ap.add_argument("--entries", help="comma-separated corpus ids (default: all)")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--no-grammar", action="store_true", help="R-18: measure without constrained decoding")
    ap.add_argument("--ctx", type=int, default=6144)
    ap.add_argument("--max-tokens", type=int, default=1500)
    ap.add_argument("--threads", type=int, default=0)
    ap.add_argument("--ngl", type=int, default=0, help="GPU layers (0 = CPU only)")
    ap.add_argument("--repeat-check", type=int, default=3, help="re-run first N entries to check determinism")
    ap.add_argument("--out", default=str(HERE / "results"))
    a = ap.parse_args()

    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))["entries"]
    if a.entries:
        keep = set(a.entries.split(","))
        corpus = [e for e in corpus if e["id"] in keep]
    if a.limit:
        corpus = corpus[: a.limit]
    cfg = json.loads((HERE / "models.json").read_text(encoding="utf-8"))
    ids = a.models.split(",") if a.models else cfg["sets"].get(a.set or "", [])
    if not ids:
        sys.exit("give --set or --models")
    manifest_p = pathlib.Path(a.models_dir) / "manifest.json"
    manifest = json.loads(manifest_p.read_text()) if manifest_p.exists() else {}

    host = f"{platform.node()}_{a.profile}"
    outdir = pathlib.Path(a.out) / re.sub(r"[^A-Za-z0-9_.-]", "_", host)
    outdir.mkdir(parents=True, exist_ok=True)
    sysinfo = {"host": platform.node(), "os": platform.platform(), "machine": platform.machine(),
               "cpus": os.cpu_count(), "python": platform.python_version(), "profile": a.profile}
    (outdir / "sysinfo.json").write_text(json.dumps(sysinfo, indent=1))

    summary_rows = []
    for mid in ids:
        tag = mid + ("_nogrammar" if a.no_grammar else "")
        res_p = outdir / f"{tag}.jsonl"
        done = {}
        if res_p.exists():
            for line in res_p.read_text(encoding="utf-8").splitlines():
                r = json.loads(line)
                done[r["id"]] = r
        proc, load_s = None, None
        if a.external:
            base = a.external.rstrip("/")
        else:
            if mid not in manifest:
                print(f"[{mid}] not downloaded (run fetch_models.py) - skipped")
                continue
            port = free_port()
            base = f"http://127.0.0.1:{port}"
            cmd = [a.server_bin, "-m", manifest[mid]["files"][0], "--port", str(port), "--host", "127.0.0.1",
                   "-c", str(a.ctx), "-ngl", str(a.ngl), "--jinja"]
            if a.threads:
                cmd += ["-t", str(a.threads)]
            log = open(outdir / f"{tag}.server.log", "w")
            t0 = time.time()
            proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT)
            load_s = wait_health(base, 900)
            print(f"[{mid}] loaded in {load_s:.1f} s")
        try:
            todo = [e for e in corpus if e["id"] not in done]
            with open(res_p, "a", encoding="utf-8") as f:
                for e in todo:
                    prompt = TEMPLATE.replace("{BOARD_FACTS}", board_facts(e["board"])).replace("{PROMPT}", e["prompt"])
                    t0 = time.time()
                    rec = {"id": e["id"], "board": e["board"], "difficulty": e.get("difficulty"),
                           "expected": len(e["expected_questions"])}
                    try:
                        resp = ask(base, prompt, not a.no_grammar, a.max_tokens, 42)
                        text = resp["choices"][0]["message"].get("content") or ""
                        rec["seconds"] = round(time.time() - t0, 2)
                        rec["usage"] = resp.get("usage", {})
                        rec["tok_per_s"] = (resp.get("timings") or {}).get("predicted_per_second")
                        try:
                            obj = parse_answer(text)
                            errs = validate(obj, SCHEMA)
                        except Exception as ex:
                            obj, errs = {"questions": []}, [f"json: {ex}"]
                        rec["schema_valid"] = not errs
                        rec["schema_errors"] = errs[:5]
                        raised = obj.get("questions", []) if isinstance(obj, dict) else []
                        raised = [q for q in raised if isinstance(q, dict)]
                        rec["raised"] = len(raised)
                        rec.update(score(e["expected_questions"], raised))
                        rec["questions"] = raised
                        rec["text_sha"] = __import__("hashlib").sha256(text.encode()).hexdigest()[:16]
                    except Exception as ex:
                        rec.update({"error": str(ex), "seconds": round(time.time() - t0, 2), "schema_valid": False,
                                    "strict": 0, "lenient": 0, "raised": 0, "raised_matched": 0})
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    f.flush()
                    done[e["id"]] = rec
                    print(f"  {e['id']} {e['board']:9s} strict {rec['strict']}/{rec['expected']}  "
                          f"raised {rec['raised']}  {rec['seconds']} s  valid={rec['schema_valid']}", flush=True)
            # determinism: same prompt twice -> same text
            det = None
            if a.repeat_check:
                same = 0
                chk = corpus[: a.repeat_check]
                for e in chk:
                    prompt = TEMPLATE.replace("{BOARD_FACTS}", board_facts(e["board"])).replace("{PROMPT}", e["prompt"])
                    try:
                        text = ask(base, prompt, not a.no_grammar, a.max_tokens, 42)["choices"][0]["message"].get("content") or ""
                        same += __import__("hashlib").sha256(text.encode()).hexdigest()[:16] == done[e["id"]].get("text_sha")
                    except Exception:
                        pass
                det = f"{same}/{len(chk)}"
        finally:
            if proc:
                proc.terminate()
                try:
                    proc.wait(30)
                except Exception:
                    proc.kill()
        recs = [done[e["id"]] for e in corpus if e["id"] in done]
        exp = sum(r["expected"] for r in recs)
        secs = [r["seconds"] for r in recs if "seconds" in r]
        row = {"host": sysinfo["host"], "profile": a.profile, "model": tag,
               "repo": manifest.get(mid, {}).get("repo", "external"),
               "entries": len(recs), "expected_q": exp,
               "recall_strict": round(sum(r["strict"] for r in recs) / exp, 3) if exp else 0,
               "recall_lenient": round(sum(r["lenient"] for r in recs) / exp, 3) if exp else 0,
               "precision": round(sum(r.get("raised_matched", 0) for r in recs) / max(1, sum(r["raised"] for r in recs)), 3),
               "schema_valid": round(sum(bool(r["schema_valid"]) for r in recs) / max(1, len(recs)), 3),
               "load_s_PERF02": round(load_s, 1) if load_s else "",
               "draft_s_mean_PERF03": round(statistics.mean(secs), 1) if secs else "",
               "draft_s_max_PERF03": round(max(secs), 1) if secs else "",
               "determinism": det, "date": time.strftime("%Y-%m-%d")}
        summary_rows.append(row)
        print(json.dumps(row))
        sp = pathlib.Path(a.out) / "summary.csv"
        new = not sp.exists()
        with open(sp, "a", encoding="utf-8") as f:
            if new:
                f.write(",".join(row) + "\n")
            f.write(",".join(str(v) for v in row.values()) + "\n")
    print("Done. Send me the whole results folder (zip it).")


if __name__ == "__main__":
    main()
