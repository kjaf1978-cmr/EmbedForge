#!/bin/sh
# EmbedForge offline installation (SS-01). Run from the installation medium:
#
#   sudo sh install-linux.sh [--with <optional-pack>,…]
#
# Needs no network. Root is used only here (SS-05).
set -eu
medium="$(cd "$(dirname "$0")" && pwd)"
with=""
[ "${1:-}" = "--with" ] && with="${2:-}"
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo: installation needs administrator rights (SS-05)." >&2; exit 1; }
deb="$(ls "$medium"/embedforge_*_"$(dpkg --print-architecture)".deb 2>/dev/null | head -1)"
[ -n "$deb" ] || { echo "This medium has no EmbedForge package for $(dpkg --print-architecture)." >&2; exit 1; }

echo "Installing EmbedForge and its dependencies from the medium (offline)…"
# Only local files: the dependency .debs missing from a clean image of this release (SS-01)
# and the application package, in one dpkg run (dpkg unpacks all, then configures them in
# dependency order). No repository is contacted.
# shellcheck disable=SC2046
if ! dpkg -i $(ls "$medium"/deps/*.deb 2>/dev/null) "$deb"; then
  echo "Installation stopped: a dependency is missing from this medium for this OS release." >&2
  echo "Nothing was downloaded. Report the dpkg message above with your OS version." >&2
  dpkg --remove embedforge >/dev/null 2>&1 || true
  exit 1
fi

# The signed dependency set stays available for the helper allowlist (SS-05(c)).
if [ -d "$medium/deps" ]; then
  mkdir -p /opt/embedforge/deps
  cp "$medium"/deps/*.deb "$medium"/deps/deps.json "$medium"/deps/deps.json.minisig /opt/embedforge/deps/ 2>/dev/null || true
fi

echo "Optional packs on this medium:"
/opt/embedforge/ef-bootstrap --medium "$medium" --list
/opt/embedforge/ef-bootstrap --medium "$medium" --root /opt/embedforge ${with:+--with "$with"}

# SS-04: serial access for the user who ran sudo (udev rules arrive with boards, Increment 2).
if [ -n "${SUDO_USER:-}" ] && getent group dialout >/dev/null; then
  usermod -aG dialout "$SUDO_USER" && echo "Added $SUDO_USER to 'dialout' (log out and in once)."
fi
echo "EmbedForge is installed. Start it from the menu or with: embedforge"
