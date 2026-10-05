#!/usr/bin/env bash
# Builds the VAPP-05 test update package for a medium (SS-09): the same app with a bumped
# patch version plus a small new item that depends on it. Signed like any update package.
#
#   make-test-update.sh <build-medium work dir> <out dir> <minisign secret key> [<public key>]
#
# The VAPP test kit is the folder holding <out dir>: run-vapp.sh / run-vapp.cmd are copied
# next to it. <build-medium work dir> is the "<medium>.work" folder build-medium.sh leaves next to the
# medium (its staging/embedforge-app is reused).
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
work=$1 out=$2 key=$3 pub=${4:-}
spec_in="$work/spec.json"
read -r os arch version < <(${PYTHON:-python3} -c "import json,sys;s=json.load(open(sys.argv[1]));print(s['os'],s['arch'],s['app_version'])" "$spec_in")
next=$(${PYTHON:-python3} -c "import sys;a,b,c=sys.argv[1].split('-')[0].split('.');print(f'{a}.{b}.{int(c)+1}')" "$version")
st="$out.staging"
rm -rf "$st" && mkdir -p "$st"
cp -r "$work/staging/embedforge-app" "$st/"
rm -f "$st/embedforge-app/.ef-component.json" "$st/embedforge-app/.ef-component.json.minisig"
echo "EmbedForge $next: VAPP-05 test update (same binaries as $version)" > "$st/embedforge-app/licences/CHANGES.txt"
mkdir -p "$st/vapp05-test-item" && echo '{"purpose": "VAPP-05 test item"}' > "$st/vapp05-test-item/item.json"
cat > "$st/spec.json" <<SPEC
{"kind": "update", "app_version": "$next", "os": "$os", "arch": "$arch", "requires_app": "=$version",
 "components": [
  {"ci": "embedforge-app", "kind": "app_back_end_module", "version": "$next", "title": "EmbedForge application, installer and privileged helper",
   "changelog": [{"version": "$next", "date": "$(date -u +%F)", "text": "VAPP-05 test update"}]},
  {"ci": "vapp05-test-item", "kind": "fabrication_profile", "version": "1.0.0", "title": "VAPP-05 test item",
   "depends": {"embedforge-app": ">=$next"}, "changelog": [{"version": "1.0.0", "date": "$(date -u +%F)", "text": "test"}]}]}
SPEC
exe=""; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) exe=.exe ;; esac
release="$here/../core/target/release/ef-release$exe"
[ -x "$release" ] || (cd "$here/../core" && cargo build --locked --release -p ef-release)
"$release" components --spec "$st/spec.json" --staging "$st"
"$here/sign/sign-release.sh" components "$st" "$key"
rm -rf "$out"
"$release" medium --spec "$st/spec.json" --staging "$st" --out "$out"
"$here/sign/sign-release.sh" index "$out" "$key"
[ -z "$pub" ] || "$release" verify --medium "$out" --index update.json --key "$(tail -n 1 "$pub")"
rm -rf "$st"
# the test kit: the package plus the scripts that run the checks
cp "$here/test/run-vapp.sh" "$here/test/run-vapp.cmd" "$(dirname "$out")/"
