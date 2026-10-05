#!/bin/sh
# VAPP-03/04/05 on an installed EmbedForge (Ubuntu, Raspberry Pi OS). Run from the test kit
# folder in a desktop session:  sh run-vapp.sh   — the result is also written to
# vapp-result.txt next to this script. It asks for your password (the checks repair files).
here=$(cd "$(dirname "$0")" && pwd)
sudo -E /opt/embedforge/embedforge-app/bin/embedforge-setup vapp --package "$here/usb-update" 2>&1 | tee "$here/vapp-result.txt"
