#!/usr/bin/env bash
# Wraps a signed staging tree into the bootstrap .deb (SS-01): Ubuntu x86-64 (amd64) or
# Raspberry Pi OS arm64. Everything goes under /opt/embedforge (SS-03); outside it only the
# menu entry and the /usr/bin link, which are integration points, not components.
#
#   packaging/linux/build-deb.sh <stage-dir> <amd64|arm64> <out-dir>
set -euo pipefail
stage="${1:?stage dir}"; arch="${2:?amd64|arm64}"; out="${3:?out dir}"
here="$(cd "$(dirname "$0")" && pwd)"
[ -f "$stage/manifest.json.minisig" ] || { echo "build-deb.sh: $stage/manifest.json is not signed (SEC-02)" >&2; exit 1; }
version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["app_version"])' "$stage/manifest.json")"
case "$arch" in
  amd64) depends="libwebkit2gtk-4.1-0, libgtk-3-0" ;;
  arm64) depends="libwebkit2gtk-4.1-0, libgtk-3-0" ;;
  *) echo "unknown arch $arch" >&2; exit 2 ;;
esac
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
root="$work/pkg"
mkdir -p "$root/opt/embedforge" "$root/usr/bin" "$root/usr/share/applications" "$root/usr/share/icons/hicolor/256x256/apps" "$root/DEBIAN"
cp -a "$stage/." "$root/opt/embedforge/"
ln -s /opt/embedforge/embedforge "$root/usr/bin/embedforge"
cp "$here/embedforge.desktop" "$root/usr/share/applications/"
cp "$here/../../app/src-tauri/icons/icon.png" "$root/usr/share/icons/hicolor/256x256/apps/embedforge.png"
installed_kb=$(du -sk "$root" | cut -f1)
cat > "$root/DEBIAN/control" <<CTL
Package: embedforge
Version: $version
Architecture: $arch
Maintainer: EmbedForge project <noreply@embedforge.invalid>
Installed-Size: $installed_kb
Depends: $depends
Section: devel
Priority: optional
Homepage: https://github.com/kjaf1978-cmr/EmbedForge
Description: EmbedForge embedded-systems design environment (bootstrap)
 Installs the EmbedForge application. Component packs (toolchains, emulators,
 models) are installed from the same offline medium by install-linux.sh.
CTL
cp "$here/postrm" "$root/DEBIAN/postrm"; chmod 755 "$root/DEBIAN/postrm"
mkdir -p "$out"
deb="$out/embedforge_${version}_${arch}.deb"
dpkg-deb --root-owner-group -Zxz --build "$root" "$deb" >/dev/null
echo "$deb"
