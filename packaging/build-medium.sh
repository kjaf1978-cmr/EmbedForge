#!/usr/bin/env bash
# Assembles one installation medium (SS-01): stage → component manifests → sign → packs and
# index → sign → verify. Usage:
#
#   build-medium.sh <spec name> <out-dir> --key <minisign secret key> [--pub <public key>]
#   build-medium.sh <spec name> <out-dir> --dev-key [--allow-missing]
#
#   spec name: ubuntu-x86_64 | raspios-aarch64 | windows-x86_64 (packaging/spec/<name>.json)
#   --key:     your offline release key; run only on your signing host (TEST-04)
#   --dev-key: a throwaway key generated here; the medium installs only with DEBUG builds
#              started with EMBEDFORGE_DEV_TRUSTED_KEY=<its public key>. Never for release.
#   --allow-missing: leave out components that are not staged (dependency sets, WebView2)
#   --staged DIR: reuse an already staged tree (skip building the app)
#   --kit-dir DIR: build the signing kit part for this medium instead (no key needed): the
#              effective spec and the staging tree are written to DIR, and the owner's
#              embedforge-sign signs and assembles it (packaging/kit/)
#
# Dependency sets (host-deps-*) are staged before by linux/collect-deps.sh into the same
# staging directory, the WebView2 runtime by windows/fetch-webview2.sh.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/.." && pwd)
spec_name=$1 out=$2; shift 2
key="" pub="" dev=0 allow=0 staged="" kitdir=""
while [ $# -gt 0 ]; do
    case "$1" in
        --key) key=$2; shift ;;
        --pub) pub=$2; shift ;;
        --dev-key) dev=1 ;;
        --allow-missing) allow=1 ;;
        --staged) staged=$2; shift ;;
        --kit-dir) kitdir=$2; shift ;;
        *) echo "unknown option $1" >&2; exit 2 ;;
    esac
    shift
done
spec="$here/spec/$spec_name.json"
version=$(${PYTHON:-python3} -c "import json,sys;print(json.load(open(sys.argv[1]))['app_version'])" "$spec" | tr -d '\r')
os=${spec_name%-*}; arch=${spec_name#*-}
work="$out.work"
mkdir -p "$work"
if [ "$dev" = 1 ]; then
    [ -z "$key" ] || { echo "--key and --dev-key exclude each other" >&2; exit 2; }
    rm -f "$work/dev.key" "$work/dev.pub"
    minisign -G -W -p "$work/dev.pub" -s "$work/dev.key" >/dev/null
    key="$work/dev.key"; pub="$work/dev.pub"
    echo "DEVELOPMENT MEDIUM: signed with a throwaway key ($(tail -n 1 "$pub"))"
fi
[ -n "$key" ] || [ -n "$kitdir" ] || { echo "--key, --dev-key or --kit-dir is required" >&2; exit 2; }
staging=${staged:-$work/staging}
if [ -z "$staged" ]; then
    triple=""
    case "$arch" in aarch64) [ "$(uname -m)" = aarch64 ] || triple=aarch64-unknown-linux-gnu ;; esac
    [ "$os" = windows ] && [ "$(uname -s)" = Linux ] && { echo "Windows media are built on the Windows runner" >&2; exit 2; }
    "$here/stage-app.sh" "$staging" $([ "$dev" = 1 ] && echo --debug) ${triple:+--target $triple}
fi
files="$staging/files"
mkdir -p "$files/licences" "$files/source"
cp "$repo/LICENSE" "$files/licences/LICENSE"
cat > "$files/README.txt" <<TXT
EmbedForge $version — offline installation medium for $os $arch (SS-01)

$( [ "$os" = windows ] && echo "Install: double-click EmbedForge-Setup-$version-x64.exe." || echo "Install: open a terminal here and run:  sh install.sh   (or: sh install.sh --per-user)" )
Everything needed is on this medium; no network connection is used.
Corresponding source of the copyleft components on this medium: folder "source".
TXT
git -C "$repo" archive --format=tar.gz --prefix="embedforge-$version/" -o "$files/source/embedforge-$version-source.tar.gz" HEAD
case "$os" in
    ubuntu|raspios)
        debarch=$([ "$arch" = x86_64 ] && echo amd64 || echo arm64)
        "$here/linux/build-deb.sh" "$staging/embedforge-app/bin/embedforge-setup" "$debarch" "$version" "$files" >/dev/null
        install -m 0644 "$here/linux/install.sh" "$files/install.sh" ;;
    windows)
        cp "$staging/embedforge-app/bin/embedforge-setup.exe" "$files/EmbedForge-Setup-$version-x64.exe"
        [ -f "$files/licences/webview2-runtime.txt" ] || cp "$here/windows/webview2-runtime-terms.txt" "$files/licences/webview2-runtime.txt"
        if [ "$dev" = 0 ] && grep -q "PLACEHOLDER" "$files/licences/webview2-runtime.txt"; then
            echo "release medium refused: WebView2 terms placeholder present (run windows/fetch-webview2.sh)" >&2; exit 1
        fi ;;
esac
# the effective spec: components that are staged (or all, for a release)
eff="$work/spec.json"
${PYTHON:-python3} - "$spec" "$staging" "$allow" "$eff" <<'PY'
import json, os, sys
spec, staging, allow, out = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3] == "1", sys.argv[4]
missing = [c["ci"] for c in spec["components"] if not os.path.isdir(os.path.join(staging, c["ci"]))]
if missing and not allow:
    sys.exit(f"not staged: {', '.join(missing)} (stage them, or --allow-missing for a development medium)")
for m in missing:
    print(f"left out (not staged): {m}")
spec["components"] = [c for c in spec["components"] if c["ci"] not in missing]
# corresponding source of the dependency packages (collect-deps.sh --with-source), SS-02
listed = {f["path"] for f in spec["files"]}
src = os.path.join(staging, "files", "source")
for name in sorted(os.listdir(src)) if os.path.isdir(src) else []:
    path = f"source/{name}"
    if path not in listed and os.path.isfile(os.path.join(src, name)):
        spec["files"].append({"path": path, "from": f"files/{path}", "role": "source"})
json.dump(spec, open(out, "w"), indent=2)
PY
if [ -n "$kitdir" ]; then
    # record executable bits: zip archives (CI artifacts, the kit) drop them
    for c in $(${PYTHON:-python3} -c "import json,sys;print(' '.join(c['ci'] for c in json.load(open(sys.argv[1]))['components']))" "$eff" | tr -d '\r'); do
        (cd "$staging/$c" && find . -type f -perm -u+x ! -name '*.exe' | sed 's|^\./||' | sort > .ef-exec)
        [ -s "$staging/$c/.ef-exec" ] || rm -f "$staging/$c/.ef-exec"
    done
    rm -rf "$kitdir" && mkdir -p "$kitdir"
    cp "$eff" "$kitdir/spec.json"
    cp -r "$staging" "$kitdir/staging"
    echo "kit part written: $kitdir ($(du -sh "$kitdir" | cut -f1))"
    exit 0
fi
exe=""; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) exe=.exe ;; esac
release="$repo/core/target/release/ef-release$exe"
[ -x "$release" ] || (cd "$repo/core" && cargo build --locked --release -p ef-release)
"$release" components --spec "$eff" --staging "$staging"
EF_SIGN_COMMENT="EmbedForge $version" "$here/sign/sign-release.sh" components "$staging" "$key"
rm -rf "$out"
"$release" medium --spec "$eff" --staging "$staging" --out "$out"
EF_SIGN_COMMENT="EmbedForge $version" "$here/sign/sign-release.sh" index "$out" "$key"
if [ -n "$pub" ]; then
    "$release" verify --medium "$out" --key "$(tail -n 1 "$pub")"
fi
du -sh "$out"
