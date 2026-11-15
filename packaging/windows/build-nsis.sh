#!/usr/bin/env bash
# Builds the Windows bootstrap EXE from a signed staging tree (makensis runs on Windows or
# Linux). The optional-pack page is generated from the medium spec.
#
#   packaging/windows/build-nsis.sh <stage-dir> <medium-spec.json> <webview2-terms.txt> <out-dir>
set -euo pipefail
stage="$(cd "${1:?stage}" && pwd)"; spec="${2:?medium spec}"; terms="${3:?webview2 terms}"; out="${4:?out}"
here="$(cd "$(dirname "$0")" && pwd)"
[ -f "$stage/manifest.json.minisig" ] || { echo "build-nsis.sh: staging manifest is not signed (SEC-02)" >&2; exit 1; }
grep -q "PLACEHOLDER" "$terms" && { echo "build-nsis.sh: $terms is still the placeholder; supply the Microsoft WebView2 runtime licence text (SS-02)" >&2; exit 1; }
version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["app_version"])' "$stage/manifest.json")"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cp "$here/embedforge.nsi" "$work/"; cp "$terms" "$work/webview2-terms.txt"
python3 "$here/optional_packs.py" "$spec" > "$work/optional-packs.nsh"
mkdir -p "$out"; out="$(cd "$out" && pwd)"
(cd "$work" && makensis -V2 -DVERSION="$version" -DSTAGE="$stage" -DOUTFILE="$out/EmbedForge-Setup-$version.exe" embedforge.nsi)
echo "$out/EmbedForge-Setup-$version.exe"
