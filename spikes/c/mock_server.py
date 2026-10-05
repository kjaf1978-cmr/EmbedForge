#!/usr/bin/env python3
"""Phase 0 (c) spike - test double for llama-server, used only to verify bench.py.
Modes: oracle (returns the corpus's expected questions, signal re-cased/padded),
wrongtype (right signals, wrong NL-02 type), empty (no questions), garbage (invalid JSON)."""
import json, pathlib, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
MODE, PORT = sys.argv[1], int(sys.argv[2])
CORPUS = json.loads((pathlib.Path(__file__).resolve().parents[2] / "docs/phase0/j_vapp06_corpus.json").read_text())["entries"]
BOARDS = json.loads((pathlib.Path(__file__).resolve().parent / "boards.json").read_text())
NEXT = {c: chr(ord(c) + 1) if c != "i" else "a" for c in "abcdefghi"}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, obj):
        b = json.dumps(obj).encode(); self.send_response(200)
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b)))
        self.end_headers(); self.wfile.write(b)
    def do_GET(self): self._send({"status": "ok"})
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        msg = body["messages"][0]["content"]
        e = next(x for x in CORPUS if x["prompt"] in msg and f'- name: {BOARDS[x["board"]]["name"]}\n' in msg)
        def other(q):  # a type that no expected question on the same signal uses
            used = {x["type"] for x in e["expected_questions"] if x["signal"] == q["signal"]}
            return next(c for c in "abcdefghi" if c not in used)
        qs = [{"type": q["type"] if MODE == "oracle" else other(q),
               "signal": ("the " + q["signal"].upper()) if MODE == "oracle" else q["signal"],
               "text": q["text"], "default": str(q["default"])} for q in e["expected_questions"]]
        if MODE == "empty": qs = []
        content = "{not json" if MODE == "garbage" else json.dumps({"signals": [], "requirements": [{"id": "R1", "text": "x"}], "questions": qs})
        self._send({"choices": [{"message": {"content": content}}], "usage": {"completion_tokens": 10}, "timings": {"predicted_per_second": 99.0}})

HTTPServer(("127.0.0.1", PORT), H).serve_forever()
