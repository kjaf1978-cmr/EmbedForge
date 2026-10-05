//! VAPP-03 dependency audit: every file a running EmbedForge process (and its children) has
//! loaded or opened must be inside the app directory or among the OS standard libraries.
//! Per-user data the app itself writes (settings, web-view caches) is listed separately.

use serde::Serialize;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Class {
    AppDirectory,
    OsStandard,
    AppData,
    Outside,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct Audit {
    pub processes: Vec<u32>,
    pub files: Vec<(String, Class)>,
}

impl Audit {
    pub fn outside(&self) -> Vec<&str> {
        self.files
            .iter()
            .filter(|f| f.1 == Class::Outside)
            .map(|f| f.0.as_str())
            .collect()
    }
    pub fn count(&self, c: Class) -> usize {
        self.files.iter().filter(|f| f.1 == c).count()
    }
}

/// OS standard locations (libraries, fonts, locale and theme data the OS provides).
#[cfg(not(windows))]
const OS_PREFIXES: &[&str] = &[
    "/usr/lib/",
    "/lib/",
    "/usr/lib64/",
    "/lib64/",
    "/usr/libexec/",
    "/usr/share/fonts/",
    "/usr/share/icons/",
    "/usr/share/themes/",
    "/usr/share/glib-2.0/",
    "/usr/share/mime/",
    "/usr/share/X11/",
    "/usr/share/locale/",
    "/usr/share/zoneinfo/",
    "/usr/share/fontconfig/",
    "/usr/share/glvnd/",
    "/usr/share/drirc.d/",
    "/usr/share/vulkan/",
    "/usr/share/egl/",
    "/usr/share/icu/",
    "/usr/share/gtk-3.0/",
    "/usr/share/webkitgtk-",
    "/usr/share/locale-langpack/",
    "/etc/",
    "/var/cache/fontconfig/",
    "/dev/",
    "/proc/",
    "/sys/",
    "/run/",
    "/var/lib/flatpak/",
    "/usr/share/applications/",
    "/usr/share/pixmaps/",
    "/var/lib/dbus/",
    "/var/lib/snapd/desktop/",
];
#[cfg(windows)]
const OS_PREFIXES: &[&str] = &["c:\\windows\\"];

/// System-wide copies of tools the app bundles privately (SS-03): loading them is a finding
/// even though they sit under an OS directory.
#[cfg(not(windows))]
const TOOL_PREFIXES: &[&str] = &[
    "/usr/lib/python3",
    "/usr/local/lib/python3",
    "/usr/lib/jvm/",
    "/usr/lib/kicad",
    "/usr/share/kicad/",
    "/usr/lib/avr/",
    "/usr/lib/gcc/avr/",
    "/usr/share/arduino/",
    "/usr/lib/x86_64-linux-gnu/kicad",
    "/usr/lib/aarch64-linux-gnu/kicad",
    "/usr/lib/ngspice/",
    "/usr/lib/x86_64-linux-gnu/ngspice/",
    "/usr/lib/aarch64-linux-gnu/ngspice/",
    "/usr/lib/libgit2",
    "/usr/lib/x86_64-linux-gnu/libgit2",
    "/usr/lib/aarch64-linux-gnu/libgit2",
    "/usr/lib/x86_64-linux-gnu/libllama",
    "/usr/lib/aarch64-linux-gnu/libllama",
];
#[cfg(windows)]
const TOOL_PREFIXES: &[&str] = &[];

pub fn classify(path: &str, app_dir: &Path, app_data: &[PathBuf]) -> Class {
    let norm = |p: &Path| {
        let s = p.to_string_lossy().into_owned();
        if cfg!(windows) {
            s.to_ascii_lowercase()
        } else {
            s
        }
    };
    let p = if cfg!(windows) {
        path.to_ascii_lowercase()
    } else {
        path.to_string()
    };
    let app = norm(app_dir);
    if p == app || p.starts_with(&format!("{app}{}", std::path::MAIN_SEPARATOR)) {
        return Class::AppDirectory;
    }
    if app_data.iter().any(|d| {
        let d = norm(d);
        p.starts_with(&format!("{d}{}", std::path::MAIN_SEPARATOR))
    }) {
        return Class::AppData;
    }
    // pseudo files: sockets, pipes, anonymous and shared-memory mappings
    if (!p.starts_with('/')
        || p.starts_with("/memfd:")
        || p.starts_with("/SYSV")
        || p.starts_with("/dev/shm/"))
        && !cfg!(windows)
    {
        return Class::OsStandard;
    }
    // per-user caches the OS graphics and font libraries keep for every program
    if [
        "/.cache/mesa_shader_cache",
        "/.cache/fontconfig",
        "/.cache/nvidia",
        "/.nv/",
    ]
    .iter()
    .any(|c| p.contains(c))
    {
        return Class::OsStandard;
    }
    if TOOL_PREFIXES.iter().any(|o| p.starts_with(o)) {
        return Class::Outside;
    }
    if OS_PREFIXES.iter().any(|o| p.starts_with(o)) {
        return Class::OsStandard;
    }
    Class::Outside
}

/// The per-user directories EmbedForge writes itself (Tauri identifier `org.embedforge.app`).
pub fn app_data_dirs() -> Vec<PathBuf> {
    let mut v = vec![];
    if cfg!(windows) {
        for var in ["APPDATA", "LOCALAPPDATA"] {
            if let Some(d) = std::env::var_os(var) {
                v.push(PathBuf::from(d).join("org.embedforge.app"));
            }
        }
    } else if let Some(h) = std::env::var_os("HOME") {
        let h = PathBuf::from(h);
        for sub in [
            ".config/org.embedforge.app",
            ".local/share/org.embedforge.app",
            ".cache/org.embedforge.app",
            ".cache/embedforge",
            ".local/share/embedforge",
        ] {
            v.push(h.join(sub));
        }
    }
    v.push(std::env::temp_dir().join("embedforge"));
    v
}

#[cfg(target_os = "linux")]
fn children(pid: u32) -> Vec<u32> {
    let mut out = vec![];
    if let Ok(rd) = std::fs::read_dir(format!("/proc/{pid}/task")) {
        for t in rd.flatten() {
            if let Ok(s) = std::fs::read_to_string(t.path().join("children")) {
                out.extend(s.split_whitespace().filter_map(|x| x.parse::<u32>().ok()));
            }
        }
    }
    out
}

/// Files mapped (libraries) and open (descriptors) in `pid` and all its descendants.
#[cfg(target_os = "linux")]
pub fn collect(pid: u32) -> std::io::Result<(Vec<u32>, BTreeSet<String>)> {
    let mut pids = vec![pid];
    let mut i = 0;
    while i < pids.len() {
        let c = children(pids[i]);
        pids.extend(c);
        i += 1;
    }
    let mut files = BTreeSet::new();
    for p in &pids {
        let maps = std::fs::read_to_string(format!("/proc/{p}/maps"))?;
        for line in maps.lines() {
            if let Some(path) = line.split_whitespace().nth(5) {
                files.insert(
                    line[line.find(path).unwrap()..]
                        .trim_end_matches(" (deleted)")
                        .to_string(),
                );
            }
        }
        if let Ok(rd) = std::fs::read_dir(format!("/proc/{p}/fd")) {
            // 0–2 are the standard streams inherited from whoever started the app
            for fd in rd.flatten().filter(|f| {
                f.file_name()
                    .to_str()
                    .and_then(|n| n.parse::<u32>().ok())
                    .is_some_and(|n| n > 2)
            }) {
                if let Ok(t) = std::fs::read_link(fd.path()) {
                    files.insert(
                        t.to_string_lossy()
                            .trim_end_matches(" (deleted)")
                            .to_string(),
                    );
                }
            }
        }
        if let Ok(e) = std::fs::read_link(format!("/proc/{p}/exe")) {
            files.insert(e.to_string_lossy().into_owned());
        }
    }
    Ok((pids, files))
}

#[cfg(windows)]
pub fn collect(pid: u32) -> std::io::Result<(Vec<u32>, BTreeSet<String>)> {
    win::modules(pid).map(|m| (vec![pid], m))
}

#[cfg(not(any(target_os = "linux", windows)))]
pub fn collect(_pid: u32) -> std::io::Result<(Vec<u32>, BTreeSet<String>)> {
    Err(std::io::Error::other(
        "VAPP-03 audit is implemented for Linux and Windows hosts",
    ))
}

/// `pid`, or — when `pid` is a launcher such as xvfb-run — its first descendant that runs a
/// program from the app directory.
#[cfg(target_os = "linux")]
fn app_process(pid: u32, app_dir: &Path) -> u32 {
    let mut queue = vec![pid];
    while !queue.is_empty() {
        let p = queue.remove(0);
        if std::fs::read_link(format!("/proc/{p}/exe")).is_ok_and(|e| e.starts_with(app_dir)) {
            return p;
        }
        queue.extend(children(p));
    }
    pid
}
#[cfg(not(target_os = "linux"))]
fn app_process(pid: u32, _app_dir: &Path) -> u32 {
    pid
}

pub fn audit(pid: u32, app_dir: &Path) -> std::io::Result<Audit> {
    let (processes, files) = collect(app_process(pid, app_dir))?;
    let data = app_data_dirs();
    let mut files: Vec<(String, Class)> = files
        .into_iter()
        .map(|f| {
            let c = classify(&f, app_dir, &data);
            (f, c)
        })
        .collect();
    files.sort_by(|a, b| a.1.cmp(&b.1).then(a.0.cmp(&b.0)));
    Ok(Audit { processes, files })
}

#[cfg(windows)]
mod win {
    //! Loaded modules through the Tool Help API (kernel32), no extra crate.
    use std::collections::BTreeSet;
    use std::ffi::c_void;

    #[repr(C)]
    struct ModuleEntry32W {
        dw_size: u32,
        th32_module_id: u32,
        th32_process_id: u32,
        glblcnt_usage: u32,
        proccnt_usage: u32,
        mod_base_addr: *mut u8,
        mod_base_size: u32,
        h_module: *mut c_void,
        sz_module: [u16; 256],
        sz_exe_path: [u16; 260],
    }

    const TH32CS_SNAPMODULE: u32 = 0x8;
    const TH32CS_SNAPMODULE32: u32 = 0x10;

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> *mut c_void;
        fn Module32FirstW(snap: *mut c_void, me: *mut ModuleEntry32W) -> i32;
        fn Module32NextW(snap: *mut c_void, me: *mut ModuleEntry32W) -> i32;
        fn CloseHandle(h: *mut c_void) -> i32;
    }

    pub fn modules(pid: u32) -> std::io::Result<BTreeSet<String>> {
        let mut out = BTreeSet::new();
        // SAFETY: plain Win32 calls with a correctly sized, zeroed MODULEENTRY32W.
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid);
            if snap as isize == -1 {
                return Err(std::io::Error::last_os_error());
            }
            let mut me: ModuleEntry32W = std::mem::zeroed();
            me.dw_size = std::mem::size_of::<ModuleEntry32W>() as u32;
            let mut ok = Module32FirstW(snap, &mut me);
            while ok != 0 {
                let n = me.sz_exe_path.iter().position(|&c| c == 0).unwrap_or(260);
                out.insert(String::from_utf16_lossy(&me.sz_exe_path[..n]));
                ok = Module32NextW(snap, &mut me);
            }
            CloseHandle(snap);
        }
        Ok(out)
    }
}
