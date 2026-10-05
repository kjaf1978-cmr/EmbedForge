#!/usr/bin/env bash
# Builds and stages the component "embedforge-app": the app, the installer and the privileged
# helper (SS-01, SS-05). Usage: stage-app.sh <staging-dir> [--debug] [--target <rust triple>]
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
staging=$1; shift
profile=release; flag=--release; triple=""
while [ $# -gt 0 ]; do
    case "$1" in
        --debug) profile=debug; flag="" ;;
        --target) triple=$2; shift ;;
        *) echo "unknown option $1" >&2; exit 2 ;;
    esac
    shift
done
tflag=${triple:+--target $triple}
outdir=${triple:+$triple/}$profile
exe=""; case "$triple$(uname -s)" in *windows*|*MINGW*|*MSYS*) exe=.exe ;; esac
(cd "$repo/app/ui" && npm ci --no-audit --no-fund && npm run build)
(cd "$repo/app/src-tauri" && cargo build --locked $flag $tflag --features custom-protocol)
(cd "$repo/core" && cargo build --locked $flag $tflag -p ef-install -p ef-helper)
dst="$staging/embedforge-app"
rm -rf "$dst" && mkdir -p "$dst/bin" "$dst/share" "$dst/licences"
cp "$repo/app/src-tauri/target/$outdir/embedforge$exe" "$repo/core/target/$outdir/embedforge-setup$exe" \
   "$repo/core/target/$outdir/embedforge-helper$exe" "$dst/bin/"
chmod 0755 "$dst"/bin/*
cp "$repo/app/src-tauri/icons/icon.png" "$dst/share/embedforge.png"
cp "$repo/LICENSE" "$dst/licences/LICENSE"
chmod 0644 "$dst/share/embedforge.png" "$dst"/licences/*
${PYTHON:-python3} "$repo/tools/third_party_notices.py" "$repo" 2>/dev/null > "$dst/licences/THIRD-PARTY.txt"
echo "staged $dst ($profile)"
