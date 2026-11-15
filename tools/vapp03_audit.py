#!/usr/bin/env python3
"""VAPP-03 dependency audit (Linux): every file loaded at runtime must be inside the app
directory or in the OS standard libraries.

Record a session, then audit it:

    strace -f -qq -e trace=openat,open,execve -o trace.log /opt/embedforge/embedforge
    python3 tools/vapp03_audit.py trace.log --app /opt/embedforge [--json report.json]

Only successful calls count (a failed lookup loads nothing). Each path is classified:

  app            inside the app directory                                    ok
  os-library     shared libraries / helper executables of the OS (/lib, /usr/lib, …)   ok
  os-resource    OS data and configuration (fonts, icons, locale, /etc, /proc, …)      ok
  user-data      the app's own per-user directories                           ok
  violation      anything else (another tool's installation, /usr/local, other
                 programs' files, executables outside the app and the OS)    FAIL

Exit status 1 when any violation is found. The same rules are applied on Windows with a
Process Monitor CSV export (--procmon), see docs/inc1/VAPP_procedures.md."""
import argparse, csv, json, os, re, sys
from collections import defaultdict

OS_LIB = ("/lib/", "/lib64/", "/usr/lib/", "/usr/lib64/", "/usr/libexec/")
OS_EXE = ("/usr/bin/", "/bin/")  # only allowed for the short list below
OS_EXE_OK = {"xdg-open", "sh", "dbus-launch"}  # spawned by GTK/WebKit, not by EmbedForge
OS_RES = ("/usr/share/fonts/", "/usr/share/icons/", "/usr/share/themes/", "/usr/share/glib-2.0/",
          "/usr/share/mime/", "/usr/share/locale/", "/usr/share/X11/", "/usr/share/zoneinfo/",
          "/usr/share/gtk-3.0/", "/usr/share/pixmaps/", "/usr/share/fontconfig/", "/usr/share/egl/",
          "/usr/share/glvnd/", "/usr/share/drirc.d/", "/usr/share/vulkan/", "/usr/share/locale-langpack/",
          "/usr/share/applications/", "/usr/share/gvfs/", "/usr/share/alsa/", "/usr/share/dbus-1/",
          "/usr/share/webkitgtk-", "/usr/share/i18n/", "/usr/share/hunspell/", "/usr/share/enchant",
          "/usr/share/gstreamer-1.0/", "/usr/share/libdrm/", "/usr/share/terminfo/",
          "/etc/", "/proc/", "/sys/", "/dev/", "/run/", "/var/cache/fontconfig/", "/var/lib/dbus/",
          "/tmp/", "/var/tmp/")
APP_ID = "org.embedforge.app"

LINE = re.compile(r'^(?:\[pid\s+)?(\d+)\]?\s*(openat|open|execve)\((?:AT_FDCWD|\d+)?,?\s*"([^"]+)".*\)\s*=\s*(-?\d+)')


def classify(path, kind, app, home_dirs):
    p = os.path.normpath(path)
    if p == app or p.startswith(app + "/"):
        return "app"
    if any(p.startswith(h) for h in home_dirs):
        return "user-data"
    if kind == "execve":
        if p.startswith(OS_LIB):
            return "os-library"
        if p.startswith(OS_EXE) and os.path.basename(p) in OS_EXE_OK:
            return "os-library"
        return "violation"
    if p.startswith(OS_LIB):
        return "os-library"
    if p.startswith(OS_RES) or p in ("/etc", "/proc", "/sys", "/dev"):
        return "os-resource"
    home = os.path.expanduser("~")
    # GTK/fontconfig per-user caches and settings are OS behaviour, not app dependencies
    for d in (".cache/fontconfig", ".cache/mesa_shader_cache", ".config/gtk-3.0", ".local/share/mime",
              ".local/share/icons", ".icons", ".fonts", ".cache/gstreamer-1.0", ".local/share/recently-used.xbel",
              ".cache/webkitgtk", ".local/share/webkitgtk"):
        if p.startswith(os.path.join(home, d)):
            return "os-resource"
    return "violation"


def parse_strace(fn):
    for line in open(fn, encoding="utf-8", errors="replace"):
        m = LINE.match(line.strip())
        if m and int(m.group(4)) >= 0:
            yield m.group(2), m.group(3)


def parse_procmon(fn):
    for row in csv.DictReader(open(fn, encoding="utf-8-sig", errors="replace")):
        if row.get("Result") == "SUCCESS" and row.get("Operation") in ("CreateFile", "Load Image", "Process Create"):
            kind = "execve" if row["Operation"] == "Process Create" else "openat"
            yield kind, row["Path"].replace("\\", "/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("trace")
    ap.add_argument("--app", required=True)
    ap.add_argument("--procmon", action="store_true", help="trace is a Process Monitor CSV (Windows)")
    ap.add_argument("--json")
    a = ap.parse_args()
    app = os.path.normpath(os.path.realpath(a.app) if not a.procmon else a.app.replace("\\", "/"))
    home = os.path.expanduser("~")
    user_dirs = [os.path.join(home, d, APP_ID) for d in (".local/share", ".config", ".cache")]
    seen = defaultdict(set)
    events = parse_procmon(a.trace) if a.procmon else parse_strace(a.trace)
    for kind, path in events:
        if a.procmon:
            low = path.lower()
            win = app.lower()
            cls = ("app" if low.startswith(win) else
                   "os-library" if low.startswith(("c:/windows/system32/", "c:/windows/winsxs/", "c:/windows/syswow64/",
                                                   "c:/program files (x86)/microsoft/edgewebview/")) else
                   "user-data" if APP_ID in low else
                   "os-resource" if low.startswith(("c:/windows/", "hk", "c:/programdata/microsoft/")) else
                   "violation")
        else:
            cls = classify(path, kind, app, user_dirs)
        seen[cls].add((kind, os.path.normpath(path)))
    report = {k: sorted(f"{kind} {p}" for kind, p in v) for k, v in sorted(seen.items())}
    for k in ("app", "os-library", "os-resource", "user-data", "violation"):
        print(f"{k:12} {len(report.get(k, []))}")
    for v in report.get("violation", []):
        print("  VIOLATION", v)
    if a.json:
        json.dump(report, open(a.json, "w"), indent=1)
    print("PASS" if not report.get("violation") else "FAIL")
    sys.exit(1 if report.get("violation") else 0)


if __name__ == "__main__":
    main()
