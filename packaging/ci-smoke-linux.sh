#!/usr/bin/env bash
# After an offline install from a test medium: full SS-08 verification, a self-repair round
# (VAPP-04) and a dependency audit of a real app run (VAPP-03). Evidence goes to test/evidence.
#
#   packaging/ci-smoke-linux.sh /opt/embedforge
set -euo pipefail
root="${1:?install root}"; repo="$(cd "$(dirname "$0")/.." && pwd)"
ev="$repo/test/evidence"; mkdir -p "$ev"
sudo() { if [ "$(id -u)" -eq 0 ]; then "$@"; else command sudo "$@"; fi; }

echo "== SS-08 full verification of the fresh installation"
"$root/ef-bootstrap" --root "$root" --verify | tee "$ev/verify-fresh.txt"

echo "== VAPP-04: damage one start-up file, one deferred file, delete one component file"
victim_exe="$root/ef-bootstrap"; cp "$victim_exe" "$ev/.bootstrap-copy"   # keep a runner for the repair
sudo sh -c "printf X | dd of='$root/LICENSE.txt' bs=1 seek=10 conv=notrunc status=none"
sudo rm -f "$(find "$root/components/app-docs" -type f | sort | head -1)"
sudo sh -c "printf X | dd of='$root/embedforge' bs=1 seek=4096 conv=notrunc status=none"
if "$ev/.bootstrap-copy" --root "$root" --verify > "$ev/verify-damaged.txt"; then
  echo "damage was NOT detected" >&2; exit 1
fi
cat "$ev/verify-damaged.txt"
echo "-- repair as root, offline (the medium is not used)"
sudo unshare --net "$ev/.bootstrap-copy" --root "$root" --repair | tee "$ev/repair.txt"
"$root/ef-bootstrap" --root "$root" --verify | tee "$ev/verify-repaired.txt"
rm -f "$ev/.bootstrap-copy"

echo "== VAPP-03: dependency audit of a 20 s app run (Xvfb)"
timeout 20 xvfb-run -a strace -f -qq -e trace=openat,open,execve -o "$ev/trace.log" "$root/embedforge" || true
python3 "$repo/tools/vapp03_audit.py" "$ev/trace.log" --app "$root" --json "$ev/vapp03.json" | tee "$ev/vapp03.txt"
