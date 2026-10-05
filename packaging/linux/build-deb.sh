#!/usr/bin/env bash
# Builds the signed-to-be bootstrap package embedforge-setup_<version>_<arch>.deb (SS-01).
# It holds only the installer; it declares no dependencies, so it installs on a clean
# offline image. Usage: build-deb.sh <embedforge-setup binary> <amd64|arm64> <version> <out-dir>
set -euo pipefail
bin=$1 arch=$2 version=$3 out=$4
here=$(cd "$(dirname "$0")" && pwd)
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
install -D -m 0755 "$bin" "$root/opt/embedforge-setup/embedforge-setup"
install -D -m 0644 "$here/../../LICENSE" "$root/usr/share/doc/embedforge-setup/copyright"
mkdir -p "$root/DEBIAN"
install -m 0755 "$here/deb/postinst" "$here/deb/prerm" "$root/DEBIAN/"
size=$(du -sk "$root/opt" | cut -f1)
cat > "$root/DEBIAN/control" <<CTRL
Package: embedforge-setup
Version: $version
Architecture: $arch
Maintainer: EmbedForge project <embedforge@localhost>
Section: devel
Priority: optional
Installed-Size: $size
Homepage: https://github.com/kjaf1978-cmr/EmbedForge
Description: EmbedForge offline installer (bootstrap)
 Installs EmbedForge and its component packs from the offline installation
 medium. Run install.sh on the medium rather than installing this package alone.
CTRL
mkdir -p "$out"
dpkg-deb --root-owner-group -Zxz --build "$root" "$out/embedforge-setup_${version}_${arch}.deb" >/dev/null
echo "$out/embedforge-setup_${version}_${arch}.deb"
