#!/bin/sh
# EmbedForge offline installer for Ubuntu and Raspberry Pi OS (SS-01).
#
#   sh install.sh              system-wide installation (asks for your password)
#   sh install.sh --per-user   installation for you only, no administrator rights (SS-05)
#
# Further options are passed to embedforge-setup (see: sh install.sh --help).
# Run it with "sh" so that it also works from media mounted without execute permission.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
arch=$(dpkg --print-architecture)
deb=$(ls "$here"/embedforge-setup_*_"$arch".deb 2>/dev/null | head -n 1 || true)
if [ -z "$deb" ]; then
    echo "This medium has no EmbedForge installer for $arch." >&2
    exit 1
fi
case " $* " in
    *" --help "*|*" -h "*)
        tmp=$(mktemp -d "${HOME:-/tmp}/.embedforge-setup.XXXXXX")
        dpkg-deb -x "$deb" "$tmp"
        "$tmp/opt/embedforge-setup/embedforge-setup" help
        rm -rf "$tmp"
        exit 0 ;;
    *" --per-user "*)
        # no root: unpack the bootstrap privately and run it from there
        tmp=$(mktemp -d "${HOME:-/tmp}/.embedforge-setup.XXXXXX")
        trap 'rm -rf "$tmp"' EXIT
        dpkg-deb -x "$deb" "$tmp"
        "$tmp/opt/embedforge-setup/embedforge-setup" install --medium "$here" "$@"
        exit $? ;;
esac
if [ "$(id -u)" -ne 0 ]; then
    echo "A system-wide installation needs administrator rights; sudo asks for your password."
    echo "(For an installation without them: sh install.sh --per-user)"
    exec sudo sh "$0" "$@"
fi
EMBEDFORGE_SETUP_RUNNING=1 dpkg -i "$deb"
exec /opt/embedforge-setup/embedforge-setup install --medium "$here" "$@"
