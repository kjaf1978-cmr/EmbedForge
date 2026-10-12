#!/usr/bin/env bash
# Downloads the package list of the newest clean desktop image of a release (SS-01), the
# input of collect-deps.sh. Usage: clean-manifest.sh <release> <out-file>
#   ubuntu-NN.NN      ubuntu-NN.NN[.x]-desktop-amd64.manifest from releases.ubuntu.com
#   raspios-trixie    the .info package list of the newest Raspberry Pi OS (64-bit) image
#   raspios-bookworm  the same for the "legacy" (oldstable) image
set -euo pipefail
release=$1 out=$2
case "$release" in
    ubuntu-*)
        v=${release#ubuntu-}
        base="https://releases.ubuntu.com/$v"
        name=$(curl -fsSL "$base/" | grep -o "ubuntu-$v[.0-9]*-desktop-amd64\.manifest" | sort -uV | tail -n 1)
        [ -n "$name" ] || { echo "no desktop manifest found under $base" >&2; exit 1; }
        curl -fsSL "$base/$name" -o "$out" ;;
    raspios-*)
        case "$release" in
            raspios-trixie) base=https://downloads.raspberrypi.com/raspios_arm64/images ;;
            raspios-bookworm) base=https://downloads.raspberrypi.com/raspios_oldstable_arm64/images ;;
            *) echo "unknown release $release" >&2; exit 2 ;;
        esac
        dir=$(curl -fsSL "$base/" | grep -o 'raspios_[a-z_]*arm64-[0-9-]*/' | sort -u | tail -n 1)
        info=$(curl -fsSL "$base/$dir" | grep -o '[A-Za-z0-9._-]*\.info' | sort -u | tail -n 1)
        [ -n "$dir" ] && [ -n "$info" ] || { echo "no image package list found under $base" >&2; exit 1; }
        curl -fsSL "$base/$dir$info" -o "$out"
        grep -q "${release#raspios-}" "$out" 2>/dev/null || echo "note: $info does not name ${release#raspios-}; check the image line-up" >&2 ;;
    *) echo "unknown release $release" >&2; exit 2 ;;
esac
echo "$release: $(wc -l < "$out") packages in the clean image ($out)"
