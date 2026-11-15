//! Privileged helper — Increment 1 skeleton (SS-05).
//!
//! SS-05 allows exactly three privileged functions, and nothing else:
//!
//! - (a) write an OS image to a **removable** medium and write first-boot files to it, with a
//!   guard against the host's own boot medium, enforced on every host;
//! - (b) install / start / stop / remove the **single** EmbedForge project service (HOST-07(b));
//! - (c) install .deb packages taken **only** from the signed offline dependency set of the
//!   running EmbedForge version (allowlist by package hash);
//! - (d) restore files that fail the SS-08 check, **only** paths listed in the signed
//!   manifests of the running installation and **only** from the local recovery store, each
//!   verified against its manifest hash (decision D16, prompt v3.8).
//!
//! It accepts requests only from the app's own signed executable and logs every request,
//! accepted or refused.
//!
//! What this skeleton delivers: the request types, every policy check ([`Policy::check`]),
//! the request log, and a dispatcher. Actions (a)–(c) are **not executed** in Increment 1 —
//! they return [`Decision::Planned`] with the exact operation that Increment 2 will perform.
//! Action (d) is executed by [`execute_restore`], which reuses the tested SS-08 repair. The
//! transport (named pipe / Unix socket with peer credentials) and the real actions arrive with
//! board flashing and Pi imaging in Increment 2 (SCOPE.md, "Out of scope").

use ef_cm::objects::sha256_file;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// The one service name the helper may manage (SS-05(b)).
pub const SERVICE_NAME: &str = "embedforge-project";
pub const DEPSET_FORMAT: &str = "ef.depset@1.0";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Request {
    /// SS-05(a). `image` is a path inside the install root (an installed Pi OS image pack).
    WriteImage {
        device: String,
        image: String,
        #[serde(default)]
        first_boot_files: BTreeMap<String, String>,
    },
    /// SS-05(b).
    Service {
        action: ServiceAction,
        project_id: String,
    },
    /// SS-05(c). File names inside the install root's offline dependency directory.
    InstallDebs { debs: Vec<String> },
    /// SS-05(d). Paths relative to the install root, as listed in the signed manifests.
    RestoreFiles { paths: Vec<String> },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ServiceAction {
    Install,
    Start,
    Stop,
    Remove,
}

/// Facts about a block device, gathered by the OS layer (lsblk / IOCTL_STORAGE_*). The guard
/// works on these so it is the same code on every host.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct BlockDevice {
    pub path: String,
    pub removable: bool,
    /// The OS reports this disk as holding the running system or its boot loader.
    pub system_disk: bool,
    /// Mount points of every partition on the device.
    pub mountpoints: Vec<String>,
    pub size_bytes: u64,
}

/// The process that sent the request, as identified by the transport (peer credentials).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Caller {
    pub exe_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DepEntry {
    pub file: String,
    pub sha256: String,
}

/// The signed offline dependency set of one EmbedForge version (SS-01, BRD-03).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DepSet {
    pub format: String,
    pub app_version: String,
    pub debs: Vec<DepEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "decision", rename_all = "snake_case")]
pub enum Decision {
    Refused {
        reason: String,
    },
    /// Accepted; Increment 1 does not execute it. `operation` is what will be run.
    Planned {
        operation: Vec<String>,
    },
}

/// What the helper trusts, loaded once at helper start from the signed install.
pub struct Policy {
    pub install_root: PathBuf,
    /// Path and SHA-256 of the app executable, from the signed app manifest.
    pub app_exe: PathBuf,
    pub app_exe_sha256: String,
    pub app_version: String,
    /// Signed dependency set (already signature-checked by the caller of [`Policy::new`]).
    pub depset: Option<DepSet>,
    pub devices: Vec<BlockDevice>,
    /// The signed manifests of the running installation (app + installed packs), verified
    /// by the helper itself at start with its own compiled-in keys (SS-05(d)).
    pub install_manifest: Option<ef_integrity::Manifest>,
}

const SYSTEM_MOUNTS: [&str; 7] = [
    "/",
    "/boot",
    "/boot/efi",
    "/boot/firmware",
    "/usr",
    "/var",
    "/home",
];

fn is_system_mount(m: &str) -> bool {
    let m = m.trim_end_matches(['/', '\\']);
    let m = if m.is_empty() { "/" } else { m };
    SYSTEM_MOUNTS.contains(&m)
        // Windows: the system drive, whatever its letter
        || std::env::var("SystemDrive").is_ok_and(|s| m.eq_ignore_ascii_case(s.trim_end_matches('\\')))
        || m.eq_ignore_ascii_case("C:")
}

fn safe_name(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.+~".contains(c))
        && !s.starts_with('.')
}

fn inside(root: &Path, rel: &str) -> Option<PathBuf> {
    let p = Path::new(rel);
    if p.is_absolute()
        || !p
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
    {
        return None;
    }
    Some(root.join(p))
}

impl Policy {
    /// Caller check: the requesting executable must be the installed app executable with the
    /// hash from the signed manifest (a copied or modified binary is refused).
    pub fn check_caller(&self, c: &Caller) -> Result<(), String> {
        let same_path = fs::canonicalize(&c.exe_path).ok() == fs::canonicalize(&self.app_exe).ok();
        if !same_path {
            return Err(format!(
                "caller {} is not the installed EmbedForge executable",
                c.exe_path.display()
            ));
        }
        let (sha, _) = sha256_file(&c.exe_path).map_err(|e| e.to_string())?;
        if sha != self.app_exe_sha256 {
            return Err("caller executable does not match the signed manifest".into());
        }
        Ok(())
    }

    /// SS-05(a) guard: the target must be a known, removable device that holds neither the
    /// running system nor a system mount point.
    pub fn check_device(&self, device: &str) -> Result<&BlockDevice, String> {
        let d = self
            .devices
            .iter()
            .find(|d| d.path == device)
            .ok_or_else(|| format!("{device} is not a detected block device"))?;
        if d.system_disk {
            return Err(format!("{device} is the host's own system/boot disk"));
        }
        if let Some(m) = d.mountpoints.iter().find(|m| is_system_mount(m)) {
            return Err(format!("{device} holds the system mount point {m}"));
        }
        if !d.removable {
            return Err(format!("{device} is not a removable medium"));
        }
        Ok(d)
    }

    pub fn check(&self, caller: &Caller, req: &Request) -> Decision {
        match self.check_inner(caller, req) {
            Ok(operation) => Decision::Planned { operation },
            Err(reason) => Decision::Refused { reason },
        }
    }

    fn check_inner(&self, caller: &Caller, req: &Request) -> Result<Vec<String>, String> {
        self.check_caller(caller)?;
        match req {
            Request::WriteImage {
                device,
                image,
                first_boot_files,
            } => {
                let d = self.check_device(device)?;
                let img = inside(&self.install_root.join("components"), image)
                    .filter(|p| p.is_file())
                    .ok_or_else(|| format!("image {image} is not an installed component file"))?;
                let size = fs::metadata(&img).map_err(|e| e.to_string())?.len();
                if size > d.size_bytes {
                    return Err(format!("image ({size} B) is larger than {device}"));
                }
                const FIRST_BOOT: [&str; 4] = ["firstrun.sh", "userconf.txt", "ssh", "custom.toml"];
                for name in first_boot_files.keys() {
                    if !FIRST_BOOT.contains(&name.as_str()) {
                        return Err(format!("first-boot file {name} is not allowed"));
                    }
                }
                let mut op = vec![
                    "write-image".into(),
                    img.display().to_string(),
                    device.clone(),
                ];
                op.extend(first_boot_files.keys().map(|k| format!("boot:{k}")));
                Ok(op)
            }
            Request::Service { action, project_id } => {
                if !safe_name(project_id) {
                    return Err(format!("invalid project id {project_id:?}"));
                }
                Ok(vec![
                    "service".into(),
                    format!("{action:?}").to_lowercase(),
                    SERVICE_NAME.into(),
                    project_id.clone(),
                ])
            }
            Request::RestoreFiles { paths } => {
                let found = self.restore_findings(paths)?;
                let mut op = vec!["restore".to_string()];
                op.extend(found.into_iter().map(|f| f.path));
                Ok(op)
            }
            Request::InstallDebs { debs } => {
                let set = self
                    .depset
                    .as_ref()
                    .ok_or("no signed offline dependency set is installed")?;
                if set.app_version != self.app_version {
                    return Err(format!(
                        "dependency set is for {}, running version is {}",
                        set.app_version, self.app_version
                    ));
                }
                if debs.is_empty() {
                    return Err("no packages requested".into());
                }
                let dir = self.install_root.join("deps");
                let mut op = vec!["dpkg-install".into()];
                for f in debs {
                    if !safe_name(f) || !f.ends_with(".deb") {
                        return Err(format!("invalid package file name {f:?}"));
                    }
                    let want = set
                        .debs
                        .iter()
                        .find(|e| &e.file == f)
                        .ok_or_else(|| format!("{f} is not in the offline dependency set"))?;
                    let p = dir.join(f);
                    let (sha, _) = sha256_file(&p).map_err(|e| e.to_string())?;
                    if sha != want.sha256 {
                        return Err(format!("{f} does not match its allowlisted hash"));
                    }
                    op.push(p.display().to_string());
                }
                Ok(op)
            }
        }
    }
}

impl Policy {
    /// SS-05(d): the helper re-checks every requested path itself; the caller's claim that a
    /// file is damaged is not trusted. Paths outside the signed manifests are refused, and so
    /// is a request in which no file actually fails the check.
    pub fn restore_findings(&self, paths: &[String]) -> Result<Vec<ef_integrity::Finding>, String> {
        let m = self
            .install_manifest
            .as_ref()
            .ok_or("the signed installation manifests could not be verified")?;
        if paths.is_empty() || paths.len() > 10_000 {
            return Err("no files requested, or too many".into());
        }
        let listed: std::collections::BTreeSet<&str> =
            m.files.iter().map(|f| f.path.as_str()).collect();
        for p in paths {
            if !listed.contains(p.as_str()) {
                return Err(format!("{p} is not listed in the signed manifests"));
            }
        }
        let scratch = std::env::temp_dir().join(format!("ef-helper-check-{}", std::process::id()));
        let r = ef_integrity::check_full_in(&self.install_root, m, paths, &scratch);
        let _ = fs::remove_dir_all(&scratch);
        let found = r.map_err(|e| e.to_string())?;
        if found.is_empty() {
            return Err("none of the requested files fails the integrity check".into());
        }
        Ok(found)
    }
}

/// Executes an accepted SS-05(d) request: re-checks, restores from the local recovery store
/// (each object hash-verified before it is put in place) and logs every file.
pub fn execute_restore(
    policy: &Policy,
    caller: &Caller,
    paths: &[String],
    log: &Path,
    at: &str,
) -> std::io::Result<Result<ef_integrity::RepairOutcome, String>> {
    let req = Request::RestoreFiles {
        paths: paths.to_vec(),
    };
    if let Decision::Refused { reason } = handle(policy, caller, &req, log, at)? {
        return Ok(Err(reason));
    }
    let run = || -> Result<ef_integrity::RepairOutcome, String> {
        let found = policy.restore_findings(paths)?;
        let m = policy.install_manifest.as_ref().ok_or("no manifest")?;
        let store = ef_cm::ObjectStore::open(policy.install_root.join("recovery"))
            .map_err(|e| e.to_string())?;
        ef_integrity::repair(&policy.install_root, m, &found, &store, log, at)
            .map_err(|e| e.to_string())
    };
    Ok(run())
}

/// Checks a request and appends it, with the decision, to the JSON-lines log. Every request
/// is logged, accepted or refused (SS-05).
pub fn handle(
    policy: &Policy,
    caller: &Caller,
    req: &Request,
    log: &Path,
    at: &str,
) -> std::io::Result<Decision> {
    let d = policy.check(caller, req);
    if let Some(p) = log.parent() {
        fs::create_dir_all(p)?;
    }
    let mut f = fs::OpenOptions::new().create(true).append(true).open(log)?;
    let ev = serde_json::json!({"at": at, "caller": caller.exe_path, "request": req, "result": d});
    writeln!(f, "{ev}")?;
    Ok(d)
}

#[cfg(test)]
mod tests;
