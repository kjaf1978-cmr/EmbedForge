//! Signed manifests, tiered integrity check and offline self-repair (SS-08, SEC-02, SS-09).
//!
//! - The release pipeline writes `manifest.json` listing every installed file with its size,
//!   SHA-256 and tier, and signs it with the offline Ed25519 key (minisign format, SEC-02).
//!   Signing happens on your infrastructure only (TEST-04); this crate only verifies.
//! - At start-up ([`check_startup`]), files in the **startup** tier (executables, shared
//!   libraries, scripts, grammars, schemas — F3-01) are fully hashed. **Deferred**-tier files
//!   are checked by size and against a local cache of size + mtime + verified hash; changed
//!   or uncached ones are queued for the background pass ([`check_full`]).
//! - [`repair`] restores corrupted or missing files from the local recovery store, without
//!   network access, and every event is appended to a JSON-lines log.
//! - [`component`]: installations made by the bootstrap installer consist of components that
//!   each carry a signed manifest; [`startup_pass`] and [`background_pass`] run the checks
//!   above over the union of them and also restore whole components.

pub mod component;
pub use component::*;

use ef_cm::objects::sha256_file;
use ef_cm::ObjectStore;
use minisign_verify::{PublicKey, Signature};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const MANIFEST_FORMAT: &str = "ef.manifest@1.0";

const TRUSTED_KEYS_FILE: &str = include_str!("../trusted-keys.txt");

/// Release public keys built into this binary (SEC-02), from `trusted-keys.txt`. Debug builds
/// also trust `EMBEDFORGE_DEV_TRUSTED_KEY`, so that tests and local trials can use a scratch
/// key; release builds ignore that variable.
pub fn release_keys() -> Vec<String> {
    let mut v: Vec<String> = TRUSTED_KEYS_FILE
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(String::from)
        .collect();
    if cfg!(debug_assertions) {
        if let Ok(k) = std::env::var("EMBEDFORGE_DEV_TRUSTED_KEY") {
            v.extend(
                k.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
            );
        }
    }
    v
}

#[derive(Debug, thiserror::Error)]
pub enum IntegrityError {
    #[error("I/O error on {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("manifest: {0}")]
    Manifest(String),
    #[error("signature rejected for {0}: {1}")]
    Signature(String, String),
    #[error("{0}")]
    Cm(#[from] ef_cm::CmError),
}

pub(crate) fn io<T>(path: &Path, r: std::io::Result<T>) -> Result<T, IntegrityError> {
    r.map_err(|source| IntegrityError::Io {
        path: path.into(),
        source,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    Startup,
    Deferred,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub path: String,
    pub size: u64,
    pub sha256: String,
    pub tier: Tier,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Manifest {
    pub format: String,
    pub app_version: String,
    pub files: Vec<ManifestEntry>,
}

const STARTUP_EXT: [&str; 14] = [
    "exe", "dll", "so", "dylib", "sys", "node", "sh", "ps1", "bat", "cmd", "py", "js", "mjs",
    "gbnf",
];

/// F3-01 tier rule: executables, shared libraries, scripts, grammars and schemas are hashed
/// at start-up; everything else (models, images, libraries of parts, 3D models, documents)
/// is deferred.
pub fn classify(rel_path: &str, executable_bit: bool) -> Tier {
    let lower = rel_path.to_ascii_lowercase();
    let name = lower.rsplit('/').next().unwrap_or(&lower);
    let ext = name.rsplit_once('.').map(|(_, e)| e).unwrap_or("");
    let is_shared_lib = name.contains(".so.");
    let is_schema = name.ends_with(".schema.json")
        || lower.starts_with("schemas/")
        || lower.contains("/schemas/");
    if executable_bit || STARTUP_EXT.contains(&ext) || is_shared_lib || is_schema {
        Tier::Startup
    } else {
        Tier::Deferred
    }
}

#[cfg(unix)]
pub(crate) fn exec_bit(m: &fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    m.permissions().mode() & 0o111 != 0
}
#[cfg(not(unix))]
pub(crate) fn exec_bit(_m: &fs::Metadata) -> bool {
    false
}

/// Release-time helper: builds the manifest of an install tree (the pipeline then signs it).
pub fn build_manifest(root: &Path, app_version: &str) -> Result<Manifest, IntegrityError> {
    let mut files = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(d) = stack.pop() {
        for e in io(&d, fs::read_dir(&d))? {
            let p = io(&d, e)?.path();
            let meta = io(&p, fs::symlink_metadata(&p))?;
            if meta.is_dir() {
                stack.push(p);
            } else if meta.is_file() {
                let rel = p
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                if rel == "manifest.json"
                    || rel == "manifest.json.minisig"
                    || rel.starts_with("state/")
                {
                    continue;
                }
                let (sha256, size) = sha256_file(&p)?;
                files.push(ManifestEntry {
                    tier: classify(&rel, exec_bit(&meta)),
                    path: rel,
                    size,
                    sha256,
                });
            }
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(Manifest {
        format: MANIFEST_FORMAT.into(),
        app_version: app_version.into(),
        files,
    })
}

/// SEC-02: verifies `data_path` against its minisign signature with any of the trusted keys
/// (several keys allow key rotation). Unsigned or wrongly signed files are rejected.
pub fn verify_signed_file(
    data_path: &Path,
    sig_path: &Path,
    trusted_keys: &[&str],
) -> Result<String, IntegrityError> {
    let name = data_path.display().to_string();
    if !sig_path.exists() {
        return Err(IntegrityError::Signature(
            name,
            "no signature file (unsigned)".into(),
        ));
    }
    let sig_text = io(sig_path, fs::read_to_string(sig_path))?;
    let sig = Signature::decode(&sig_text).map_err(|e| {
        IntegrityError::Signature(name.clone(), format!("malformed signature: {e}"))
    })?;
    let mut last = String::from("no trusted key");
    for k in trusted_keys {
        let pk = PublicKey::from_base64(k).map_err(|e| {
            IntegrityError::Signature(name.clone(), format!("bad trusted key: {e}"))
        })?;
        let mut v = match pk.verify_stream(&sig) {
            Ok(v) => v,
            Err(e) => {
                last = e.to_string();
                continue;
            }
        };
        let mut f = io(data_path, fs::File::open(data_path))?;
        let mut buf = vec![0u8; 1 << 20];
        loop {
            let n = io(data_path, f.read(&mut buf))?;
            if n == 0 {
                break;
            }
            v.update(&buf[..n]);
        }
        match v.finalize() {
            Ok(()) => return Ok(sig.trusted_comment().to_string()),
            Err(e) => last = e.to_string(),
        }
    }
    Err(IntegrityError::Signature(name, last))
}

/// Loads `root/manifest.json` after verifying its signature.
pub fn load_manifest(root: &Path, trusted_keys: &[&str]) -> Result<Manifest, IntegrityError> {
    let mp = root.join("manifest.json");
    verify_signed_file(&mp, &root.join("manifest.json.minisig"), trusted_keys)?;
    let m: Manifest = serde_json::from_str(&io(&mp, fs::read_to_string(&mp))?)
        .map_err(|e| IntegrityError::Manifest(e.to_string()))?;
    if m.format != MANIFEST_FORMAT {
        return Err(IntegrityError::Manifest(format!(
            "unsupported format {}",
            m.format
        )));
    }
    for f in &m.files {
        let p = Path::new(&f.path);
        if p.is_absolute()
            || p.components()
                .any(|c| !matches!(c, std::path::Component::Normal(_)))
        {
            return Err(IntegrityError::Manifest(format!("unsafe path {}", f.path)));
        }
    }
    Ok(m)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Problem {
    Missing,
    SizeMismatch,
    HashMismatch,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Finding {
    pub path: String,
    pub problem: Problem,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Report {
    pub checked_full: usize,
    pub checked_quick: usize,
    pub findings: Vec<Finding>,
    /// Deferred files to hash in the background, changed/uncached ones first.
    pub background_queue: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct CacheEntry {
    size: u64,
    mtime_ns: u128,
    sha256: String,
}

fn cache_path(root: &Path) -> PathBuf {
    root.join("state").join("integrity-cache.json")
}

fn load_cache(root: &Path) -> BTreeMap<String, CacheEntry> {
    fs::read_to_string(cache_path(root))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save_cache(root: &Path, c: &BTreeMap<String, CacheEntry>) -> Result<(), IntegrityError> {
    let p = cache_path(root);
    io(p.parent().unwrap(), fs::create_dir_all(p.parent().unwrap()))?;
    io(&p, fs::write(&p, serde_json::to_string(c).unwrap()))
}

fn mtime_ns(m: &fs::Metadata) -> u128 {
    m.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_nanos())
}

/// Hashes files on every core (PERF-08): returns the SHA-256 of each path, in order.
fn hash_parallel(paths: &[PathBuf]) -> Vec<Option<String>> {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let next = AtomicUsize::new(0);
    let out: Vec<std::sync::Mutex<Option<String>>> =
        paths.iter().map(|_| Default::default()).collect();
    let threads = std::thread::available_parallelism()
        .map_or(1, |n| n.get())
        .min(paths.len().max(1));
    std::thread::scope(|sc| {
        for _ in 0..threads {
            sc.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                if i >= paths.len() {
                    break;
                }
                let h = sha256_file(&paths[i]).ok().map(|(h, _)| h);
                *out[i].lock().unwrap() = h;
            });
        }
    });
    out.into_iter().map(|m| m.into_inner().unwrap()).collect()
}

/// SS-08 foreground check.
pub fn check_startup(root: &Path, m: &Manifest) -> Result<Report, IntegrityError> {
    let cache = load_cache(root);
    let mut r = Report::default();
    let mut priority = Vec::new();
    let mut rest = Vec::new();
    let mut to_hash: Vec<&ManifestEntry> = Vec::new();
    for f in &m.files {
        let p = root.join(&f.path);
        let meta = match fs::metadata(&p) {
            Ok(x) => x,
            Err(_) => {
                r.findings.push(Finding {
                    path: f.path.clone(),
                    problem: Problem::Missing,
                });
                continue;
            }
        };
        if meta.len() != f.size {
            r.findings.push(Finding {
                path: f.path.clone(),
                problem: Problem::SizeMismatch,
            });
            continue;
        }
        match f.tier {
            Tier::Startup => to_hash.push(f),
            Tier::Deferred => {
                r.checked_quick += 1;
                let fresh = cache.get(&f.path).is_some_and(|c| {
                    c.size == f.size && c.mtime_ns == mtime_ns(&meta) && c.sha256 == f.sha256
                });
                if fresh {
                    rest.push(f.path.clone())
                } else {
                    priority.push(f.path.clone())
                }
            }
        }
    }
    let paths: Vec<PathBuf> = to_hash.iter().map(|f| root.join(&f.path)).collect();
    for (f, h) in to_hash.iter().zip(hash_parallel(&paths)) {
        r.checked_full += 1;
        match h {
            Some(h) if h == f.sha256 => {}
            Some(_) => r.findings.push(Finding {
                path: f.path.clone(),
                problem: Problem::HashMismatch,
            }),
            None => r.findings.push(Finding {
                path: f.path.clone(),
                problem: Problem::Missing,
            }),
        }
    }
    r.findings.sort_by(|a, b| a.path.cmp(&b.path));
    priority.extend(rest);
    r.background_queue = priority;
    Ok(r)
}

/// SS-08 background pass (and DIAG-01 "full verification on demand" with `paths` = all).
pub fn check_full(
    root: &Path,
    m: &Manifest,
    paths: &[String],
) -> Result<Vec<Finding>, IntegrityError> {
    let by_path: BTreeMap<&str, &ManifestEntry> =
        m.files.iter().map(|f| (f.path.as_str(), f)).collect();
    let mut cache = load_cache(root);
    let mut out = Vec::new();
    for path in paths {
        let Some(f) = by_path.get(path.as_str()) else {
            continue;
        };
        let p = root.join(path);
        let Ok(meta) = fs::metadata(&p) else {
            out.push(Finding {
                path: path.clone(),
                problem: Problem::Missing,
            });
            continue;
        };
        let (sha, size) = sha256_file(&p)?;
        if size != f.size {
            out.push(Finding {
                path: path.clone(),
                problem: Problem::SizeMismatch,
            });
        } else if sha != f.sha256 {
            out.push(Finding {
                path: path.clone(),
                problem: Problem::HashMismatch,
            });
            cache.remove(path);
        } else {
            cache.insert(
                path.clone(),
                CacheEntry {
                    size,
                    mtime_ns: mtime_ns(&meta),
                    sha256: sha,
                },
            );
        }
    }
    // the cache only saves work; a read-only installation (system-wide, running as a user)
    // simply re-hashes in the background next time
    let _ = save_cache(root, &cache);
    Ok(out)
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RepairOutcome {
    pub restored: Vec<String>,
    pub unrecoverable: Vec<String>,
}

/// Restores each finding from the recovery store (no network) and logs every event.
pub fn repair(
    root: &Path,
    m: &Manifest,
    findings: &[Finding],
    objects: &ObjectStore,
    log: &Path,
    at: &str,
) -> Result<RepairOutcome, IntegrityError> {
    let by_path: BTreeMap<&str, &ManifestEntry> =
        m.files.iter().map(|f| (f.path.as_str(), f)).collect();
    let mut out = RepairOutcome {
        restored: vec![],
        unrecoverable: vec![],
    };
    for fd in findings {
        let Some(e) = by_path.get(fd.path.as_str()) else {
            continue;
        };
        let result = objects.restore_to(&e.sha256, &root.join(&e.path));
        let ok = result.is_ok();
        // the event log is best effort: a read-only state folder must not stop the repair
        let _ = log_event(
            log,
            &serde_json::json!({
                "at": at, "event": if ok { "restored" } else { "unrecoverable" }, "path": e.path,
                "problem": fd.problem, "error": result.err().map(|x| x.to_string())
            }),
        );
        if ok {
            out.restored.push(e.path.clone())
        } else {
            out.unrecoverable.push(e.path.clone())
        }
    }
    Ok(out)
}

pub fn log_event(log: &Path, event: &serde_json::Value) -> Result<(), IntegrityError> {
    if let Some(p) = log.parent() {
        io(p, fs::create_dir_all(p))?;
    }
    let mut f = io(
        log,
        fs::OpenOptions::new().create(true).append(true).open(log),
    )?;
    io(log, writeln!(f, "{event}"))
}
