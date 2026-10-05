#!/usr/bin/env bash
# Phase 0 (c) spike: verify bench.py scoring and schema handling against mock_server.py.
set -euo pipefail
cd "$(dirname "$0")"
OUT=$(mktemp -d)
expect() {  # mode port field expected
  python3 mock_server.py "$1" "$2" & PID=$!; sleep 1
  python3 bench.py --profile test-$1 --external "http://127.0.0.1:$2" --models mock --out "$OUT" --repeat-check 2 > "$OUT/$1.log"
  kill $PID
  python3 - "$OUT" "$1" "$3" "$4" <<'PY'
import csv, sys
rows = [r for r in csv.DictReader(open(sys.argv[1] + "/summary.csv")) if r["profile"] == "test-" + sys.argv[2]]
v = rows[-1][sys.argv[3]]
ok = v == sys.argv[4]
print(f"{sys.argv[2]:9s} {sys.argv[3]:15s} = {v:6s} expected {sys.argv[4]:6s} {'PASS' if ok else 'FAIL'}")
sys.exit(0 if ok else 1)
PY
}
expect oracle    18081 recall_strict  1.0
expect oracle    18082 schema_valid   1.0
expect oracle    18083 determinism    2/2
expect wrongtype 18084 recall_strict  0.0
expect wrongtype 18085 recall_lenient 1.0
expect empty     18086 recall_strict  0.0
expect garbage   18087 schema_valid   0.0
echo "ALL HARNESS TESTS PASSED"
