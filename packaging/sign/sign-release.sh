#!/usr/bin/env bash
# Release signing (SEC-02). Runs ONLY on your infrastructure (TEST-04): the Profile A
# self-hosted runner with the offline Ed25519 key attached. The builder never holds the key.
#
#   sign-release.sh components <staging-dir> <minisign secret key>
#       signs every <staging-dir>/<component>/.ef-component.json
#   sign-release.sh index <medium-or-package-dir> <minisign secret key>
#       signs medium.json or update.json (it fixes the SHA-256 of every pack part and file)
#
# minisign asks for the key's password unless the key was created without one (-W; only for
# throwaway development keys). Set EF_SIGN_COMMENT to add a trusted comment.
set -euo pipefail
what=$1 dir=$2 key=$3
command -v minisign >/dev/null || { echo "minisign is not installed (apt install minisign / scoop install minisign)" >&2; exit 1; }
sign() {
    minisign -S -s "$key" -m "$1" -t "${EF_SIGN_COMMENT:-EmbedForge release} $(basename "$(dirname "$1")")/$(basename "$1")" >/dev/null
    echo "signed $1"
}
case "$what" in
    components)
        n=0
        for f in "$dir"/*/.ef-component.json; do sign "$f"; n=$((n+1)); done
        [ "$n" -gt 0 ] || { echo "no component manifests in $dir" >&2; exit 1; } ;;
    index)
        found=0
        for f in "$dir/medium.json" "$dir/update.json"; do
            if [ -f "$f" ]; then sign "$f"; found=1; fi
        done
        [ "$found" = 1 ] || { echo "no medium.json or update.json in $dir" >&2; exit 1; } ;;
    *) echo "usage: sign-release.sh components|index <dir> <secret key>" >&2; exit 2 ;;
esac
