#!/usr/bin/env bash
# Stages the WebView2 Fixed Version runtime as the component "webview2-runtime" (SS-02,
# section 21). Usage: fetch-webview2.sh <cab file> <expected sha256> <staging-dir> <terms file>
#
# The .cab is downloaded by you (or the Windows runner) from Microsoft's WebView2 page, as
# "Fixed Version", x64. Its version and SHA-256 are recorded in the release notes. UNVERIFIED:
# the download URL is not stable, so it is not scripted.
set -euo pipefail
cab=$1 sha=$2 staging=$3 terms=$4
echo "$sha  $cab" | sha256sum -c -
dst="$staging/webview2-runtime"
rm -rf "$dst" && mkdir -p "$dst"
# expand.exe ships with Windows; the cab holds one folder Microsoft.WebView2.FixedVersionRuntime.<ver>.x64
expand.exe "$(cygpath -w "$cab")" -F:* "$(cygpath -w "$dst")" >/dev/null
inner=$(find "$dst" -mindepth 1 -maxdepth 1 -type d | head -n 1)
if [ -n "$inner" ]; then
    shopt -s dotglob && mv "$inner"/* "$dst"/ && rmdir "$inner"
fi
cp "$terms" "$staging/files/licences/webview2-runtime.txt"
echo "staged $(find "$dst" -type f | wc -l) files into $dst"
