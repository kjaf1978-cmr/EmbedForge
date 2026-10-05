#!/usr/bin/env bash
# Phase 0 (c) spike - Profile B benchmark on a Pi 5 (about 20 GB disk; many hours: run with
#   nohup ./run_profileB.sh > runB.log 2>&1 &   and check runB.log later).
set -euo pipefail
cd "$(dirname "$0")"
SERVER=llama.cpp/build/bin/llama-server
[ -x "$SERVER" ] || { echo "Run ./setup_pi.sh first"; exit 1; }
python3 fetch_models.py --set B
python3 bench.py --profile B --server-bin "$SERVER" --set B --threads 4
python3 bench.py --profile B --server-bin "$SERVER" --models qwen3-4b --no-grammar --threads 4
tar czf "results-profileB-$(date +%Y%m%d).tgz" results
echo "Done. Send me results-profileB-*.tgz"
