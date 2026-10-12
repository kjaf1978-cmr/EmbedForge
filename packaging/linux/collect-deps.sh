#!/usr/bin/env bash
# Collects the dependency .deb set of one host release (SS-01): every package the app needs
# that a clean desktop image of the release lacks, as the component host-deps-<release>.
# Needs docker and network access; runs on the hosted runners (amd64 and arm64).
#
#   collect-deps.sh <release> <clean-image package list> <staging-dir> [--with-source]
#
#   release:  ubuntu-22.04 | ubuntu-24.04 | ubuntu-26.04 | raspios-bookworm | raspios-trixie
#   package list: the image's manifest — for Ubuntu the "<iso>.manifest" published next to
#     the desktop ISO (releases.ubuntu.com), for Pi OS the "<image>.info" published next to
#     the image (downloads.raspberrypi.com); first column = package name.
#   --with-source: also downloads the source packages for the source pack (SS-02).
#
# Raspberry Pi OS: the Raspberry Pi archive key still carries a SHA-1 binding signature, which
# the Sequoia verifier (sqv) of Debian trixie rejects since 2026-02-01; apt is told to use the
# classic gpgv verifier inside the throwaway container.
# UNVERIFIED in this session: docker is not available in the builder container, so the
# script is exercised by the "deps" CI job only.
set -euo pipefail
release=$1 manifest=$2 staging=$3 src=${4:-}
mkdir -p "$staging" && staging=$(cd "$staging" && pwd)   # docker -v needs absolute paths
here=$(cd "$(dirname "$0")" && pwd)
case "$release" in
    ubuntu-*) image="ubuntu:${release#ubuntu-}"; extra="" ;;
    raspios-*) code=${release#raspios-}; image="debian:$code"
        extra="printf 'deb http://archive.raspberrypi.com/debian/ $code main\\ndeb-src http://archive.raspberrypi.com/debian/ $code main\\n' > /etc/apt/sources.list.d/raspi.list && apt-get install -y -qq ca-certificates curl gnupg gpgv >/dev/null && curl -fsSL https://archive.raspberrypi.com/debian/raspberrypi.gpg.key | gpg --dearmor > /etc/apt/trusted.gpg.d/raspi.gpg && echo 'APT::Key::GPGVCommand \"gpgv\";' > /etc/apt/apt.conf.d/99embedforge-gpgv && apt-get update -qq" ;;
    *) echo "unknown release $release" >&2; exit 2 ;;
esac
out="$staging/host-deps-$release"
rm -rf "$out" && mkdir -p "$out/debs"
pkgs=$(grep -v '^#' "$here/app-runtime-packages.txt" | tr '\n' ' ')
docker run --rm -v "$out/debs:/out" "$image" sh -ec "
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    $extra
    cd /out && apt-get install -y -qq --download-only $pkgs >/dev/null
    cp /var/cache/apt/archives/*.deb /out/ 2>/dev/null || true
    chmod a+rw /out/*.deb"
# keep only what the clean desktop image lacks
awk '{print $1}' "$manifest" | sed 's/:.*//' | sort -u > "$out/.clean"
kept=0
for d in "$out"/debs/*.deb; do
    name=$(basename "$d" | cut -d_ -f1)
    if grep -qx "$name" "$out/.clean"; then rm "$d"; else kept=$((kept+1)); fi
done
rm "$out/.clean"
(cd "$out/debs" && ls *.deb > ../packages.txt 2>/dev/null || true)
echo "$release: $kept package(s) missing from the clean image"
if [ "$src" = "--with-source" ] && [ "$kept" -gt 0 ]; then
    mkdir -p "$staging/files/source/host-deps-$release"
    names=$(sed 's/_.*//' "$out/packages.txt" | tr '\n' ' ')
    docker run --rm -v "$staging/files/source/host-deps-$release:/out" "$image" sh -ec "
        export DEBIAN_FRONTEND=noninteractive
        sed -i 's/^Types: deb\$/Types: deb deb-src/' /etc/apt/sources.list.d/*.sources 2>/dev/null || sed -i 's/^deb \(.*\)/deb \1\ndeb-src \1/' /etc/apt/sources.list
        apt-get update -qq && apt-get install -y -qq dpkg-dev >/dev/null
        cd /out
        # one package at a time: a missing source package is listed, not fatal
        for n in $names; do apt-get source --download-only \$n >/dev/null 2>&1 || echo \$n >> MISSING-SOURCES.txt; done"
    if [ -s "$staging/files/source/host-deps-$release/MISSING-SOURCES.txt" ]; then
        echo "WARNING: no source package found for $(wc -l < "$staging/files/source/host-deps-$release/MISSING-SOURCES.txt") binary package(s) of $release; listed in MISSING-SOURCES.txt (GPL source duty, R-16)" >&2
    fi
    tar -C "$staging/files/source" -cf "$staging/files/source/host-deps-$release-source.tar" "host-deps-$release"
    rm -rf "$staging/files/source/host-deps-$release"
fi
