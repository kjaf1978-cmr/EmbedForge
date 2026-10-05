//! Privileged helper skeleton (SS-05).
//!
//! The helper is the only part of EmbedForge that runs with administrator/root rights after
//! installation. Its whole interface is the closed set of [`Request`]s below:
//!
//! - (a) writing an image to a removable medium, and first-boot files to it, with a guard
//!   against the host's own boot medium ([`guard_device`]), enforced on every host;
//! - (b) installing, starting, stopping and removing the single EmbedForge project service
//!   (HOST-07(b), Pi 5 hosts only);
//! - (c) installing .deb packages taken only from the signed offline dependency set of the
//!   running EmbedForge version, allowlisted by package hash ([`deb_allowlist`]).
//!
//! It accepts requests only from the app's own signed executable ([`authorize`]): the peer
//! process's executable must be the installed app binary, and its SHA-256 must equal the
//! entry in the signed manifest of the `embedforge-app` component. Every request — accepted
//! or not — is logged as one JSON line.
//!
//! Increment 1 delivers the protocol, the caller check, the guards, the allowlist and the
//! log. The actions themselves are performed from Increment 2 on (they are the Increment 2
//! functions BRD-02, BRD-03 and HOST-07(b)); until then a request that passes every check is
//! answered `validated` and nothing is changed on the host.

use ef_cm::objects::sha256_file;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

pub const APP_CI: &str = "embedforge-app";
pub const MAX_REQUEST_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ServiceAction {
    Install,
    Start,
    Stop,
    Remove,
}

/// The complete helper interface (SS-05). Unknown operations or fields are rejected.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum Request {
    /// (a) Write `image` (in the app's local library) to the whole removable `device`, then
    /// the first-boot configuration files (name → content) to its boot partition.
    WriteImage {
        device: String,
        image: String,
        image_sha256: String,
        #[serde(default)]
        first_boot: BTreeMap<String, String>,
    },
    /// (b) The single EmbedForge project service on a Pi 5 host (HOST-07(b)).
    ProjectService {
        action: ServiceAction,
        #[serde(default)]
        project_dir: Option<String>,
    },
    /// (c) Install .deb files from the signed offline dependency set.
    InstallDebs { files: Vec<String> },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Envelope {
    pub id: u64,
    pub request: Request,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Decision {
    Rejected,
    /// Every check passed; the action is performed from Increment 2 on.
    Validated,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Response {
    pub id: Option<u64>,
    pub decision: Decision,
    pub message: String,
}

// ---------------------------------------------------------------------------------------------
// (a) boot-medium guard

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct BlockDev {
    /// Kernel name of the whole disk, e.g. `sdb`, `mmcblk0`, `nvme0n1`.
    pub name: String,
    pub removable: bool,
    pub usb: bool,
    /// Kernel names of its partitions.
    pub partitions: Vec<String>,
}

/// A mounted or swap-enabled block device (by kernel name, after resolving device-mapper
/// layers to the partitions underneath).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Use {
    pub dev: String,
    pub mount_point: String,
}

/// Mount points that make a disk the host's own system medium.
pub const PROTECTED_MOUNTS: &[&str] = &[
    "/",
    "/boot",
    "/boot/firmware",
    "/boot/efi",
    "/usr",
    "/var",
    "/home",
    "/opt",
    "[swap]",
];

/// SS-05(a): `device` may be written only if it is a whole, removable (or USB-attached) disk
/// that holds none of the host's system file systems or swap, nor the install root.
pub fn guard_device(
    device: &str,
    devs: &[BlockDev],
    uses: &[Use],
    extra_protected: &[String],
) -> Result<(), String> {
    let name = device
        .strip_prefix("/dev/")
        .ok_or_else(|| format!("{device} is not a /dev path"))?;
    if name.contains('/') || name.is_empty() {
        return Err(format!("{device} is not a whole-disk device name"));
    }
    let Some(d) = devs.iter().find(|d| d.name == name) else {
        if devs.iter().any(|d| d.partitions.iter().any(|p| p == name)) {
            return Err(format!(
                "{device} is a partition; the whole removable disk is written"
            ));
        }
        return Err(format!("{device} is not a known block device"));
    };
    if !d.removable && !d.usb {
        return Err(format!("{device} is not a removable or USB-attached disk"));
    }
    for u in uses {
        if u.dev == d.name || d.partitions.contains(&u.dev) {
            let protected = PROTECTED_MOUNTS.contains(&u.mount_point.as_str())
                || extra_protected.iter().any(|p| {
                    u.mount_point == *p
                        || p.starts_with(&format!("{}/", u.mount_point.trim_end_matches('/')))
                });
            if protected {
                return Err(format!(
                    "{device} holds {} (mounted at {}): it is part of this host's own system and is never written",
                    u.dev, u.mount_point
                ));
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "linux")]
pub mod linux {
    //! Block-device facts from sysfs and procfs.
    use super::{BlockDev, Use};
    use std::fs;
    use std::path::Path;

    pub fn block_devices() -> Vec<BlockDev> {
        let mut out = vec![];
        let Ok(rd) = fs::read_dir("/sys/block") else {
            return out;
        };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let base = e.path();
            let removable = fs::read_to_string(base.join("removable"))
                .map(|s| s.trim() == "1")
                .unwrap_or(false);
            let usb = fs::canonicalize(base.join("device"))
                .map(|p| p.to_string_lossy().contains("/usb"))
                .unwrap_or(false);
            let partitions = fs::read_dir(&base)
                .map(|r| {
                    r.flatten()
                        .map(|x| x.file_name().to_string_lossy().into_owned())
                        .filter(|p| {
                            p.starts_with(&name)
                                && Path::new(&format!("/sys/block/{name}/{p}/partition")).exists()
                        })
                        .collect()
                })
                .unwrap_or_default();
            out.push(BlockDev {
                name,
                removable,
                usb,
                partitions,
            });
        }
        out
    }

    /// Kernel names underneath a device-mapper / md device (LVM, LUKS, RAID).
    fn lower(name: &str, out: &mut Vec<String>) {
        out.push(name.to_string());
        if let Ok(rd) = fs::read_dir(format!("/sys/class/block/{name}/slaves")) {
            for s in rd.flatten() {
                lower(&s.file_name().to_string_lossy(), out);
            }
        }
    }

    pub fn uses() -> Vec<Use> {
        let mut out = vec![];
        let mut add = |src: &str, mp: &str| {
            let real = fs::canonicalize(src).unwrap_or_else(|_| src.into());
            if let Some(n) = real.to_string_lossy().strip_prefix("/dev/") {
                let mut names = vec![];
                lower(n, &mut names);
                for n in names {
                    out.push(Use {
                        dev: n,
                        mount_point: mp.to_string(),
                    });
                }
            }
        };
        for l in fs::read_to_string("/proc/self/mounts")
            .unwrap_or_default()
            .lines()
        {
            let f: Vec<&str> = l.split_whitespace().collect();
            if f.len() > 1 {
                add(f[0], &f[1].replace("\\040", " "));
            }
        }
        for l in fs::read_to_string("/proc/swaps")
            .unwrap_or_default()
            .lines()
            .skip(1)
        {
            if let Some(src) = l.split_whitespace().next() {
                add(src, "[swap]");
            }
        }
        out
    }
}

// ---------------------------------------------------------------------------------------------
// Context, caller check, allowlist

pub struct Context {
    pub install_root: PathBuf,
    pub trusted_keys: Vec<String>,
    pub log: PathBuf,
    /// The installed app binary (`<root>/embedforge-app/bin/embedforge`).
    pub app_exe: PathBuf,
    /// Its path inside the component, as listed in the signed manifest.
    pub app_exe_rel: String,
    pub is_pi5: bool,
    pub devices: Box<dyn Fn() -> (Vec<BlockDev>, Vec<Use>) + Send + Sync>,
}

impl Context {
    pub fn for_install(root: &Path, log: &Path) -> Self {
        let exe = if cfg!(windows) {
            "embedforge.exe"
        } else {
            "embedforge"
        };
        Self {
            install_root: root.into(),
            trusted_keys: ef_integrity::release_keys(),
            log: log.into(),
            app_exe: root.join(APP_CI).join("bin").join(exe),
            app_exe_rel: format!("bin/{exe}"),
            is_pi5: ef_host::detect(root)
                .pi_model
                .is_some_and(|m| m.contains("Raspberry Pi 5")),
            devices: Box::new(|| {
                #[cfg(target_os = "linux")]
                {
                    (linux::block_devices(), linux::uses())
                }
                #[cfg(not(target_os = "linux"))]
                {
                    (vec![], vec![])
                }
            }),
        }
    }

    fn keys(&self) -> Vec<&str> {
        self.trusted_keys.iter().map(String::as_str).collect()
    }

    /// The verified manifests of the active components.
    fn components(&self) -> Result<Vec<ef_integrity::ComponentManifest>, String> {
        let store = ef_cm::RecoveryStore::open(self.install_root.join("recovery"))
            .map_err(|e| e.to_string())?;
        let inst = ef_integrity::load_installed(&self.install_root, &store, &self.keys(), "")
            .map_err(|e| e.to_string())?;
        Ok(inst.components)
    }
}

/// The caller as the operating system reports it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Peer {
    pub pid: i32,
    pub uid: u32,
    /// Path of the caller's executable (`/proc/<pid>/exe`).
    pub exe: PathBuf,
}

/// Accepts the caller only if it runs the installed app binary and that binary's SHA-256 is
/// the one in the signed `embedforge-app` manifest. `exe_reader` is the open path of the
/// caller's executable (`/proc/<pid>/exe`, which stays bound to the running image even if the
/// file is replaced afterwards).
pub fn authorize(ctx: &Context, peer: &Peer, exe_reader: &Path) -> Result<(), String> {
    let want = std::fs::canonicalize(&ctx.app_exe)
        .map_err(|e| format!("the app binary {} is missing: {e}", ctx.app_exe.display()))?;
    if peer.exe != want {
        return Err(format!(
            "caller {} is not the EmbedForge app",
            peer.exe.display()
        ));
    }
    let comps = ctx.components()?;
    let app = comps
        .iter()
        .find(|c| c.ci == APP_CI)
        .ok_or("the embedforge-app component is not intact")?;
    let entry = app
        .files
        .iter()
        .find(|f| f.path == ctx.app_exe_rel)
        .ok_or("the app binary is not in the signed manifest")?;
    let (sha, _) = sha256_file(exe_reader).map_err(|e| e.to_string())?;
    if sha != entry.sha256 {
        return Err("the running app binary does not match its signed manifest".into());
    }
    Ok(())
}

/// SS-05(c): hashes of every .deb in the signed dependency sets of the active version.
pub fn deb_allowlist(ctx: &Context) -> Result<BTreeSet<String>, String> {
    Ok(ctx
        .components()?
        .iter()
        .filter(|c| c.ci.starts_with("host-deps-"))
        .flat_map(|c| c.files.iter())
        .filter(|f| f.path.ends_with(".deb"))
        .map(|f| f.sha256.clone())
        .collect())
}

fn validate(ctx: &Context, r: &Request) -> Result<String, String> {
    match r {
        Request::WriteImage {
            device,
            image,
            image_sha256,
            first_boot,
        } => {
            let (devs, uses) = (ctx.devices)();
            let root = ctx.install_root.display().to_string();
            guard_device(device, &devs, &uses, &[root])?;
            for name in first_boot.keys() {
                if name.is_empty() || name.contains(['/', '\\']) || name.starts_with('.') {
                    return Err(format!("first-boot file name {name:?} is not allowed"));
                }
            }
            let (sha, _) = sha256_file(Path::new(image)).map_err(|e| format!("image: {e}"))?;
            if &sha != image_sha256 {
                return Err("the image does not match the expected SHA-256".into());
            }
            Ok(format!("{device} passed the boot-medium guard; image writing is performed from Increment 2 on"))
        }
        Request::ProjectService { action, .. } => {
            if !ctx.is_pi5 {
                return Err(
                    "the project service exists only on Raspberry Pi 5 hosts (HOST-07(b))".into(),
                );
            }
            Ok(format!(
                "project service {action:?}: performed from Increment 2 on"
            ))
        }
        Request::InstallDebs { files } => {
            if files.is_empty() {
                return Err("no packages given".into());
            }
            let allow = deb_allowlist(ctx)?;
            for f in files {
                let (sha, _) = sha256_file(Path::new(f)).map_err(|e| format!("{f}: {e}"))?;
                if !allow.contains(&sha) {
                    return Err(format!("{f} is not in the signed offline dependency set of this EmbedForge version"));
                }
            }
            Ok(format!("{} package(s) are in the signed dependency set; installation through the helper is performed from Increment 2 on", files.len()))
        }
    }
}

/// Handles one request line from an already identified peer, and logs it.
pub fn handle_line(ctx: &Context, peer: &Peer, exe_reader: &Path, line: &str) -> Response {
    let env: Result<Envelope, _> = serde_json::from_str(line);
    let (id, op) = match &env {
        Ok(e) => (
            Some(e.id),
            serde_json::to_value(&e.request)
                .ok()
                .and_then(|v| v["op"].as_str().map(String::from)),
        ),
        Err(_) => (None, None),
    };
    let result = match (&env, authorize(ctx, peer, exe_reader)) {
        (_, Err(e)) => Err(format!("caller rejected: {e}")),
        (Err(e), _) => Err(format!("malformed request: {e}")),
        (Ok(e), Ok(())) => validate(ctx, &e.request),
    };
    let resp = match result {
        Ok(m) => Response {
            id,
            decision: Decision::Validated,
            message: m,
        },
        Err(m) => Response {
            id,
            decision: Decision::Rejected,
            message: m,
        },
    };
    let _ = ef_integrity::log_event(
        &ctx.log,
        &serde_json::json!({
            "at": ef_integrity::now_rfc3339(), "peer": peer, "id": id, "op": op,
            "request": env.as_ref().ok().map(|e| &e.request), "decision": resp.decision, "message": resp.message,
        }),
    );
    resp
}

/// Serves one connection: one JSON request per line, one JSON response per line.
pub fn serve_stream<S: std::io::Read + Write>(
    ctx: &Context,
    peer: &Peer,
    exe_reader: &Path,
    stream: S,
) -> std::io::Result<()> {
    let mut r = BufReader::new(stream);
    loop {
        let mut line = String::new();
        let n = (&mut r)
            .take(MAX_REQUEST_BYTES as u64 + 1)
            .read_line(&mut line)?;
        if n == 0 {
            return Ok(());
        }
        let resp = if n > MAX_REQUEST_BYTES {
            Response {
                id: None,
                decision: Decision::Rejected,
                message: "request too long".into(),
            }
        } else {
            handle_line(ctx, peer, exe_reader, line.trim_end())
        };
        let w = r.get_mut();
        writeln!(w, "{}", serde_json::to_string(&resp).unwrap())?;
        w.flush()?;
        if n > MAX_REQUEST_BYTES {
            return Ok(());
        }
    }
}

use std::io::Read as _;

#[cfg(target_os = "linux")]
pub mod server {
    //! Unix-socket transport with SO_PEERCRED caller identification.
    use super::*;
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::net::{UnixListener, UnixStream};

    pub fn peer_of(s: &UnixStream) -> std::io::Result<Peer> {
        let mut cred = libc::ucred {
            pid: 0,
            uid: 0,
            gid: 0,
        };
        let mut len = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
        // SAFETY: SO_PEERCRED fills a ucred of exactly `len` bytes on a connected Unix socket.
        let rc = unsafe {
            libc::getsockopt(
                s.as_raw_fd(),
                libc::SOL_SOCKET,
                libc::SO_PEERCRED,
                (&mut cred as *mut libc::ucred).cast(),
                &mut len,
            )
        };
        if rc != 0 {
            return Err(std::io::Error::last_os_error());
        }
        let exe = std::fs::read_link(format!("/proc/{}/exe", cred.pid))?;
        Ok(Peer {
            pid: cred.pid,
            uid: cred.uid,
            exe,
        })
    }

    /// The listener from systemd socket activation (`LISTEN_FDS`), or a socket bound at `path`.
    pub fn listener(path: &Path) -> std::io::Result<UnixListener> {
        let ours = std::env::var("LISTEN_PID")
            .ok()
            .and_then(|p| p.parse::<u32>().ok())
            == Some(std::process::id());
        if ours
            && std::env::var("LISTEN_FDS")
                .ok()
                .and_then(|n| n.parse::<u32>().ok())
                .unwrap_or(0)
                >= 1
        {
            // SAFETY: systemd passes the listening socket as fd 3 (SD_LISTEN_FDS_START).
            return Ok(unsafe { UnixListener::from_raw_fd(3) });
        }
        if let Some(d) = path.parent() {
            std::fs::create_dir_all(d)?;
        }
        let _ = std::fs::remove_file(path);
        UnixListener::bind(path)
    }

    /// Serves connections one at a time until `stop` returns true after a connection.
    pub fn run(ctx: &Context, l: &UnixListener, stop: &dyn Fn() -> bool) -> std::io::Result<()> {
        for s in l.incoming() {
            let s = match s {
                Ok(s) => s,
                Err(_) => continue,
            };
            let _ = s.set_read_timeout(Some(std::time::Duration::from_secs(30)));
            match peer_of(&s) {
                Ok(peer) => {
                    let reader = PathBuf::from(format!("/proc/{}/exe", peer.pid));
                    let _ = serve_stream(ctx, &peer, &reader, &s);
                }
                Err(e) => {
                    let _ = ef_integrity::log_event(
                        &ctx.log,
                        &serde_json::json!({"at": ef_integrity::now_rfc3339(), "event": "peer_unidentified", "error": e.to_string()}),
                    );
                }
            }
            if stop() {
                break;
            }
        }
        Ok(())
    }
}
