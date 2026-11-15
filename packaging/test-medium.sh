#!/usr/bin/env bash
# Builds a complete, signed TEST medium for one host from a staging tree, with a throwaway
# key: the real application + two small sample packs (one optional). Used by CI and by the
# WP 1.3 report to exercise the whole chain (VAPP-01 automated part). Never a release.
#
#   packaging/test-medium.sh <stage-dir> <key-file> <linux-amd64|linux-arm64|windows> <out-dir>
# Environment: EF_SIGN_PASSWORD (the throwaway key's password).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; repo="$(dirname "$here")"
stage="$(cd "${1:?stage}" && pwd)"; key="${2:?key}"; host="${3:?host}"; out="${4:?out}"
rel="$repo/core/target/release/ef-release"; [ -x "$rel.exe" ] && rel="$rel.exe"
version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["app_version"])' "$stage/manifest.json")"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
label="EmbedForge $version TEST"

"$rel" sign --key "$key" --label "$label" "$stage/manifest.json" >/dev/null

# sample packs: the offline documentation sources, and an optional pack standing in for the
# Pi OS images (SS-01 consequence text)
mkdir -p "$work/src-docs" "$work/src-opt" "$work/packs"
cp -r "$repo/app/ui/src/docs/." "$work/src-docs/"
head -c 3000000 /dev/urandom > "$work/src-opt/sample-image.bin"
"$rel" pack --src "$work/src-docs" --out "$work/packs" --ci app-docs --kind code_library --version "$version" \
  --license GPL-3.0-or-later --changelog "Offline documentation for $version" --date 2026-11-15 --level 3 >/dev/null
"$rel" pack --src "$work/src-opt" --out "$work/packs" --ci sample-optional --kind code_library --version 1.0.0 \
  --license CC0-1.0 --changelog "Test optional pack" --date 2026-11-15 --max-part 1000000 --level 1 >/dev/null
"$rel" sign --key "$key" --label "$label" "$work"/packs/*.pack.json >/dev/null

case "$host" in
  linux-*)
    arch="${host#linux-}"
    "$here/linux/build-deb.sh" "$stage" "$arch" "$work/boot" >/dev/null
    boot="$(ls "$work"/boot/*.deb)"; os=ubuntu_x64; [ "$arch" = arm64 ] && os=pi_os_arm64 ;;
  windows)
    printf 'TEST BUILD — the WebView2 licence text is inserted at release.\n' > "$work/terms.txt"
    boot=WINDOWS_PENDING; os=windows_x64 ;;
  *) echo "unknown host $host" >&2; exit 2 ;;
esac

spec="$work/medium-spec.json"
python3 - "$spec" "$version" "$os" "$work" <<'PY'
import json, sys, glob, os
spec, version, host, work = sys.argv[1:]
packs = sorted(glob.glob(os.path.join(work, "packs", "*.pack.json")))
docs = [p for p in packs if "/app-docs-" in p][0]
opt = [p for p in packs if "/sample-optional-" in p][0]
json.dump({"app_version": version, "host": host, "bootstrap": "BOOT",
           "packs": [{"manifest": docs},
                     {"manifest": opt, "optional": True,
                      "consequence": "Test only: nothing is unavailable without it."}]}, open(spec, "w"), indent=1)
PY
if [ "$host" = windows ]; then
  "$here/windows/build-nsis.sh" "$stage" "$spec" "$work/terms.txt" "$work/boot" >/dev/null
  boot="$(ls "$work"/boot/*.exe)"
fi
python3 - "$spec" "$boot" <<'PY'
import json, sys
s = json.load(open(sys.argv[1])); s["bootstrap"] = sys.argv[2]; json.dump(s, open(sys.argv[1], "w"), indent=1)
PY
"$rel" medium --spec "$spec" --out "$out" >/dev/null
"$rel" sign --key "$key" --label "$label" "$out/medium.json" >/dev/null
[ "${host%%-*}" = linux ] && cp "$here/linux/install-linux.sh" "$out/"
(cd "$out" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
echo "$out"
