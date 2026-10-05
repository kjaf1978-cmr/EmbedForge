#!/usr/bin/env bash
# Phase 0 (c) spike - Profile B (Raspberry Pi 5, Raspberry Pi OS 64-bit) setup:
# builds llama-server from the latest llama.cpp release tag (native arm64 build).
set -euo pipefail
cd "$(dirname "$0")"
sudo apt-get update && sudo apt-get install -y git cmake build-essential python3
TAG=$(python3 -c "import json,urllib.request;print(json.load(urllib.request.urlopen('https://api.github.com/repos/ggml-org/llama.cpp/releases/latest'))['tag_name'])")
[ -d llama.cpp ] || git clone --depth 1 --branch "$TAG" https://github.com/ggml-org/llama.cpp
cmake -S llama.cpp -B llama.cpp/build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=ON -DLLAMA_CURL=OFF
cmake --build llama.cpp/build --config Release -j4 --target llama-server
echo "$TAG" > llama.cpp/VERSION.txt
echo "llama.cpp $TAG ready: $(pwd)/llama.cpp/build/bin/llama-server"
