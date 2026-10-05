#!/usr/bin/env bash
# Writes a medium directory into an exFAT image file (SS-01), for dd/Imager onto a USB stick.
# Needs root (loop device) and exfatprogs; runs on the self-hosted runners (TEST-01).
#   make-image.sh <medium-dir> <image-file>
set -euo pipefail
src=$1 img=$2
kib=$(du -sk "$src" | cut -f1)
size=$(( (kib * 105 / 100 + 65536) * 1024 ))   # content + 5 % + 64 MiB
truncate -s "$size" "$img"
mkfs.exfat -L EMBEDFORGE "$img" >/dev/null
mnt=$(mktemp -d)
trap 'rmdir "$mnt"' EXIT
mount -o loop "$img" "$mnt"
trap 'umount "$mnt"; rmdir "$mnt"' EXIT
cp -r "$src"/. "$mnt"/
sync
echo "$img: $(du -h "$img" | cut -f1), exFAT"
