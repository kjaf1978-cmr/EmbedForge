//! Host checks (HOST-04): compares the host with profile A (laptop/PC, HOST-02) or profile B
//! (Raspberry Pi 5, HOST-03) and reports every shortfall with its consequence. Detection
//! ([`detect`]) and evaluation ([`evaluate`]) are separate so that evaluation is testable
//! for every host without that host.

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct HostFacts {
    /// "windows", "linux"
    pub os_family: String,
    /// e.g. "Windows", "Ubuntu", "Debian GNU/Linux"
    pub os_name: String,
    /// e.g. "11 (26100)", "24.04", "13"
    pub os_version: String,
    /// "x86_64", "aarch64"
    pub arch: String,
    pub physical_cores: usize,
    pub threads: usize,
    /// None when not an x86 host
    pub avx2: Option<bool>,
    pub ram_gb: f64,
    pub free_disk_gb: f64,
    pub disk_total_gb: f64,
    /// From /proc/device-tree/model on Raspberry Pi
    pub pi_model: Option<String>,
    /// "nvme", "sd", "usb", "other"
    pub storage_kind: Option<String>,
    /// Supplied by the UI layer (not detectable from the back-end)
    pub display: Option<(u32, u32)>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Profile {
    A,
    B,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    /// Below a "shall" minimum: the named functions may fail or miss PERF targets.
    Shortfall,
    /// Below a recommended value, or a check the app cannot perform itself.
    Advice,
    /// The host is outside HOST-01: not supported.
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Finding {
    pub check: String,
    pub requirement: String,
    pub required: String,
    pub found: String,
    pub severity: Severity,
    pub consequence: String,
}

pub fn profile_for(f: &HostFacts) -> Profile {
    if f.pi_model
        .as_deref()
        .is_some_and(|m| m.contains("Raspberry Pi 5"))
    {
        Profile::B
    } else {
        Profile::A
    }
}

fn push(
    v: &mut Vec<Finding>,
    check: &str,
    req: &str,
    required: String,
    found: String,
    sev: Severity,
    consequence: &str,
) {
    v.push(Finding {
        check: check.into(),
        requirement: req.into(),
        required,
        found,
        severity: sev,
        consequence: consequence.into(),
    });
}

fn num_prefix(s: &str) -> Option<(u32, u32)> {
    let mut it = s
        .split(|c: char| !c.is_ascii_digit())
        .filter(|x| !x.is_empty());
    let a = it.next()?.parse().ok()?;
    let b = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    Some((a, b))
}

/// HOST-01: supported operating systems.
fn check_os(f: &HostFacts, v: &mut Vec<Finding>) {
    let os = format!("{} {} ({})", f.os_name, f.os_version, f.arch);
    let ok = match (f.os_family.as_str(), f.arch.as_str()) {
        ("windows", "x86_64") => {
            // "10 (19045)" → Windows 10 22H2 is build 19045; Windows 11 builds are ≥ 22000.
            let build = f
                .os_version
                .split('(')
                .nth(1)
                .and_then(|b| b.trim_end_matches(')').trim().parse::<u32>().ok());
            build.is_some_and(|b| b >= 19045)
        }
        ("linux", "x86_64") => {
            f.os_name.contains("Ubuntu")
                && num_prefix(&f.os_version).is_some_and(|(y, m)| y >= 22 && y % 2 == 0 && m == 4)
        }
        ("linux", "aarch64") => {
            f.pi_model
                .as_deref()
                .is_some_and(|m| m.contains("Raspberry Pi 5"))
                && f.os_name.contains("Debian")
                && num_prefix(&f.os_version).is_some_and(|(maj, _)| maj >= 12)
        }
        _ => false,
    };
    if !ok {
        push(v, "operating system", "HOST-01", "Windows 10 22H2 / 11 x86-64; Ubuntu Desktop LTS ≥ 22.04 x86-64; Raspberry Pi OS 64-bit Bookworm or later on Pi 5".into(),
             os, Severity::Unsupported, "This host is not supported: functions and PERF targets are not guaranteed.");
    }
    let win_build = f
        .os_version
        .split('(')
        .nth(1)
        .and_then(|b| b.trim_end_matches(')').trim().parse::<u32>().ok());
    if f.os_family == "windows" && win_build.is_some_and(|b| b < 22000) {
        push(v, "Windows 10", "HOST-01 note", "—".into(), os_short(f), Severity::Advice,
             "Windows 10 is past Microsoft's end of support (14 October 2025); EmbedForge support does not extend to OS security updates.");
    }
}

fn os_short(f: &HostFacts) -> String {
    format!("{} {}", f.os_name, f.os_version)
}

fn check_display(f: &HostFacts, v: &mut Vec<Finding>, req: &str) {
    if let Some((w, h)) = f.display {
        if w < 1366 || h < 768 {
            push(
                v,
                "display",
                req,
                "≥ 1920×1080 (all functions reachable at 1366×768)".into(),
                format!("{w}×{h}"),
                Severity::Shortfall,
                "Below 1366×768 some views cannot be laid out; functions may be unreachable.",
            );
        } else if w < 1920 || h < 1080 {
            push(
                v,
                "display",
                req,
                "≥ 1920×1080".into(),
                format!("{w}×{h}"),
                Severity::Advice,
                "Compact layout: split views off, side panes as overlays (HOST-02(e)).",
            );
        }
    }
}

pub fn evaluate(f: &HostFacts) -> (Profile, Vec<Finding>) {
    let p = profile_for(f);
    let mut v = Vec::new();
    check_os(f, &mut v);
    match p {
        Profile::A => {
            if f.physical_cores < 4 || f.threads < 8 {
                push(&mut v, "CPU", "HOST-02(a)", "≥ 4 cores / 8 threads".into(), format!("{} cores / {} threads", f.physical_cores, f.threads),
                     Severity::Shortfall, "LLM requirement drafting (PERF-03), autorouting (PERF-06) and emulation (PERF-05) may miss their targets.");
            }
            if f.avx2 == Some(false) {
                push(&mut v, "AVX2", "HOST-02(a)", "x86-64 with AVX2".into(), "absent".into(), Severity::Shortfall,
                     "The bundled LLM runtime needs AVX2: requirement drafting will be very slow or fail.");
            }
            if f.ram_gb < 15.0 {
                push(&mut v, "RAM", "HOST-02(b)", "≥ 16 GB".into(), format!("{:.1} GB", f.ram_gb), Severity::Shortfall,
                     "The larger LLM profile cannot be loaded; running the LLM, KiCad and the emulator together may swap.");
            } else if f.ram_gb < 31.0 {
                push(
                    &mut v,
                    "RAM",
                    "HOST-02(b)",
                    "32 GB recommended".into(),
                    format!("{:.1} GB", f.ram_gb),
                    Severity::Advice,
                    "Fine for the default selection; the 14B model and parallel work are slower.",
                );
            }
            if f.free_disk_gb < 60.0 {
                push(&mut v, "free SSD space", "HOST-02(c)", "≥ 60 GB (≈ 75 GB with every optional pack)".into(), format!("{:.0} GB", f.free_disk_gb),
                     Severity::Shortfall, "Installation of the typical selection or later updates (recovery store, CM-09) may fail.");
            }
            check_display(f, &mut v, "HOST-02(e)");
        }
        Profile::B => {
            if f.ram_gb < 7.5 {
                push(&mut v, "RAM", "HOST-03(a)", "≥ 8 GB".into(), format!("{:.1} GB", f.ram_gb), Severity::Shortfall,
                     "Even the smaller LLM profile may not load; requirement drafting is unavailable or very slow.");
            } else if f.ram_gb < 15.0 {
                push(&mut v, "RAM", "HOST-03(a)", "16 GB recommended".into(), format!("{:.1} GB", f.ram_gb), Severity::Advice,
                     "The larger LLM profile is slow; keep the default smaller profile (HOST-03(e)).");
            }
            match f.storage_kind.as_deref() {
                Some("nvme") if f.disk_total_gb < 230.0 => push(
                    &mut v,
                    "storage",
                    "HOST-03(b)",
                    "NVMe ≥ 256 GB recommended".into(),
                    format!("NVMe {:.0} GB", f.disk_total_gb),
                    Severity::Advice,
                    "Room for projects and recovery versions is limited.",
                ),
                Some("nvme") => {}
                Some("sd") => {
                    let sev = if f.disk_total_gb < 115.0 {
                        Severity::Shortfall
                    } else {
                        Severity::Advice
                    };
                    push(&mut v, "storage", "HOST-03(b)", "NVMe ≥ 256 GB recommended; A2 microSD ≥ 128 GB minimum".into(),
                         format!("microSD {:.0} GB", f.disk_total_gb), sev,
                         "microSD is slower: installation may take up to 60 min (PERF-09) and start-up checks are near their limit (PERF-08).");
                }
                other => push(
                    &mut v,
                    "storage",
                    "HOST-03(b)",
                    "NVMe or A2 microSD".into(),
                    other.unwrap_or("unknown").into(),
                    Severity::Advice,
                    "Storage type not recognised; PERF-08/09 are not guaranteed.",
                ),
            }
            push(
                &mut v,
                "cooling and power supply",
                "HOST-03(c)(d)",
                "active cooling; official 27 W USB-C supply".into(),
                "not detectable by the app".into(),
                Severity::Advice,
                "Without them the Pi throttles or resets during long LLM or emulation runs.",
            );
            check_display(f, &mut v, "HOST-03(f)");
        }
    }
    (p, v)
}

/// Detects the facts of the running host. `install_dir` selects the disk to measure.
pub fn detect(install_dir: &Path) -> HostFacts {
    use sysinfo::{Disks, System};
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();
    let disks = Disks::new_with_refreshed_list();
    let target = std::fs::canonicalize(install_dir).unwrap_or_else(|_| install_dir.to_path_buf());
    let disk = disks
        .list()
        .iter()
        .filter(|d| target.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().as_os_str().len());
    let pi_model = std::fs::read_to_string("/proc/device-tree/model")
        .ok()
        .map(|s| s.trim_end_matches('\0').trim().to_string());
    let storage_kind = disk.map(|d| {
        let n = d.name().to_string_lossy().to_ascii_lowercase();
        if n.contains("nvme") {
            "nvme"
        } else if n.contains("mmcblk") {
            "sd"
        } else if n.starts_with("/dev/sd") {
            "usb"
        } else {
            "other"
        }
        .to_string()
    });
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    let avx2 = Some(std::is_x86_feature_detected!("avx2"));
    #[cfg(not(any(target_arch = "x86", target_arch = "x86_64")))]
    let avx2 = None;
    HostFacts {
        os_family: std::env::consts::OS.into(),
        os_name: System::name().unwrap_or_default(),
        os_version: System::os_version().unwrap_or_default(),
        arch: std::env::consts::ARCH.into(),
        physical_cores: System::physical_core_count().unwrap_or(0),
        threads: sys.cpus().len(),
        avx2,
        ram_gb: sys.total_memory() as f64 / 1e9,
        free_disk_gb: disk.map_or(0.0, |d| d.available_space() as f64 / 1e9),
        disk_total_gb: disk.map_or(0.0, |d| d.total_space() as f64 / 1e9),
        pi_model,
        storage_kind,
        display: None,
    }
}
