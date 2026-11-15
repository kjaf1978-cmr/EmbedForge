#!/usr/bin/env bash
# Builds the application staging tree for one host (SS-01, SS-03) and writes its unsigned
# manifest. Signing is a separate step on the release machine (docs/release/SIGNING.md).
#
#   packaging/stage.sh <out-dir>
#
# Environment:
#   EF_TRUSTED_KEYS  release public key(s), base64, comma-separated (compiled in; public).
#                    Empty = development build that trusts nothing.
#   CARGO_BUILD_TARGET optional cross target.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; repo="$(dirname "$here")"
out="${1:?usage: stage.sh <out-dir>}"
version="$(sed -n 's/^version = "\(.*\)"/\1/p' "$repo/app/src-tauri/Cargo.toml" | head -1)"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) exe=.exe ;; *) exe= ;; esac

[ -e "$out" ] && { echo "stage.sh: $out exists; refusing to mix builds" >&2; exit 1; }
[ -z "${EF_TRUSTED_KEYS:-}" ] && echo "stage.sh: WARNING: EF_TRUSTED_KEYS is empty; this build will trust no manifest (development build)" >&2

(cd "$repo/app/ui" && npm ci --no-audit --no-fund && npm run build)
(cd "$repo/app/src-tauri" && cargo build --release --locked --features custom-protocol)
(cd "$repo/core" && cargo build --release --locked -p ef-pack --bin ef-bootstrap -p ef-release --bin ef-release)

tdir() { echo "${CARGO_BUILD_TARGET:+$CARGO_BUILD_TARGET/}release"; }
mkdir -p "$out"
cp "$repo/app/src-tauri/target/$(tdir)/embedforge$exe" "$out/"
cp "$repo/core/target/$(tdir)/ef-bootstrap$exe" "$out/"
cp "$repo/LICENSE" "$out/LICENSE.txt"
cat > "$out/SOURCE.txt" <<TXT
EmbedForge $version is free software under the GNU General Public License v3.0 or later
(LICENSE.txt). The complete corresponding source of this build, and of every copyleft
component on the installation medium, is in the source pack on the same medium (SS-02).
TXT
"$repo/core/target/$(tdir)/ef-release$exe" manifest --root "$out" --app-version "$version"
echo "staged $version in $out (manifest unsigned)"
