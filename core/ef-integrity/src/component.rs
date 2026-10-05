//! Signed per-component manifests and the installed-tree view built from them (SS-01, SS-08,
//! SS-09, SEC-02, CM-04).
//!
//! An installation is a set of components (configuration items, CM-01), one directory each:
//!
//! ```text
//! <install_root>/
//!   recovery/                    RecoveryStore: objects, versions, active.json, baselines
//!   state/                       integrity cache, event logs, install record (never checked)
//!   <ci>/                        one directory per installed component
//!     .ef-component.json         signed component manifest (this module)
//!     .ef-component.json.minisig
//!     …files…
//! ```
//!
//! Each component carries its own signed manifest, so a component can be updated or rolled
//! back on its own (SS-09, CM-04) and its manifest comes back with it from the recovery store.
//! The expected set of components is the recovery store's `active.json`; a component whose
//! directory or manifest is missing or broken is re-materialised from the recovery store.

use crate::{
    check_full, check_startup, classify, exec_bit, io, log_event, repair, verify_signed_file,
    Finding, IntegrityError, Manifest, ManifestEntry, Report, MANIFEST_FORMAT,
};
use ef_cm::objects::sha256_file;
use ef_cm::{ChangelogEntry, CiKind, RecoveryStore};
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const COMPONENT_FORMAT: &str = "ef.component@1.0";
pub const COMPONENT_FILE: &str = ".ef-component.json";
pub const COMPONENT_SIG: &str = ".ef-component.json.minisig";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ComponentManifest {
    pub format: String,
    pub ci: String,
    pub kind: CiKind,
    pub version: Version,
    pub title: String,
    /// Optional packs (SS-01) may be left out at installation.
    #[serde(default)]
    pub optional: bool,
    pub changelog: Vec<ChangelogEntry>,
    #[serde(default)]
    pub depends: BTreeMap<String, VersionReq>,
    pub files: Vec<ManifestEntry>,
}

/// Release-time metadata of a component; the files are read from its directory.
#[derive(Debug, Clone)]
pub struct ComponentMeta {
    pub ci: String,
    pub kind: CiKind,
    pub version: Version,
    pub title: String,
    pub optional: bool,
    pub changelog: Vec<ChangelogEntry>,
    pub depends: BTreeMap<String, VersionReq>,
}

fn is_manifest_file(rel: &str) -> bool {
    rel == COMPONENT_FILE || rel == COMPONENT_SIG
}

/// Release-time: builds the manifest of a staged component directory. The pipeline writes it
/// to `<dir>/.ef-component.json` and signs it on your infrastructure (TEST-04).
pub fn build_component_manifest(
    dir: &Path,
    meta: &ComponentMeta,
) -> Result<ComponentManifest, IntegrityError> {
    if !meta.changelog.iter().any(|e| e.version == meta.version) {
        return Err(IntegrityError::Manifest(format!(
            "{} {}: changelog has no entry for this version (CM-02)",
            meta.ci, meta.version
        )));
    }
    let mut files = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for e in io(&d, fs::read_dir(&d))? {
            let p = io(&d, e)?.path();
            let m = io(&p, fs::symlink_metadata(&p))?;
            let rel = p
                .strip_prefix(dir)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            if m.is_dir() {
                stack.push(p);
            } else if m.is_file() {
                if is_manifest_file(&rel) {
                    continue;
                }
                let (sha256, size) = sha256_file(&p)?;
                files.push(ManifestEntry {
                    tier: classify(&rel, exec_bit(&m)),
                    path: rel,
                    size,
                    sha256,
                });
            } else {
                return Err(IntegrityError::Manifest(format!(
                    "{}: {rel} is neither a file nor a directory (links are not allowed in packs)",
                    meta.ci
                )));
            }
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(ComponentManifest {
        format: COMPONENT_FORMAT.into(),
        ci: meta.ci.clone(),
        kind: meta.kind,
        version: meta.version.clone(),
        title: meta.title.clone(),
        optional: meta.optional,
        changelog: meta.changelog.clone(),
        depends: meta.depends.clone(),
        files,
    })
}

/// Writes `<dir>/.ef-component.json` (deterministic JSON). Signing is a separate step.
pub fn write_component_manifest(dir: &Path, m: &ComponentManifest) -> Result<(), IntegrityError> {
    let p = dir.join(COMPONENT_FILE);
    let mut text = serde_json::to_string_pretty(m).unwrap();
    text.push('\n');
    io(&p, fs::write(&p, text))
}

pub(crate) fn safe_rel(p: &str) -> bool {
    let path = Path::new(p);
    !p.is_empty()
        && !path.is_absolute()
        && path
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
}

/// Loads and verifies `<dir>/.ef-component.json` (SEC-02).
pub fn load_component(
    dir: &Path,
    trusted_keys: &[&str],
) -> Result<ComponentManifest, IntegrityError> {
    let mp = dir.join(COMPONENT_FILE);
    if !mp.exists() {
        return Err(IntegrityError::Manifest(format!(
            "{} has no component manifest",
            dir.display()
        )));
    }
    verify_signed_file(&mp, &dir.join(COMPONENT_SIG), trusted_keys)?;
    let m: ComponentManifest = serde_json::from_str(&io(&mp, fs::read_to_string(&mp))?)
        .map_err(|e| IntegrityError::Manifest(format!("{}: {e}", mp.display())))?;
    if m.format != COMPONENT_FORMAT {
        return Err(IntegrityError::Manifest(format!(
            "{}: unsupported format {}",
            m.ci, m.format
        )));
    }
    for f in &m.files {
        if !safe_rel(&f.path) || is_manifest_file(&f.path) {
            return Err(IntegrityError::Manifest(format!(
                "{}: unsafe path {}",
                m.ci, f.path
            )));
        }
    }
    Ok(m)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case", tag = "problem")]
pub enum ComponentProblem {
    /// The directory or its manifest is missing.
    Missing,
    /// The manifest signature or content is not valid (corruption or tampering).
    Untrusted { reason: String },
    /// The manifest is valid but for a different item or version than `active.json` says.
    WrongVersion { found: String },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ComponentFinding {
    pub ci: String,
    pub version: String,
    #[serde(flatten)]
    pub problem: ComponentProblem,
}

/// The installed tree as seen through the signed component manifests.
#[derive(Debug, Clone)]
pub struct Installed {
    pub components: Vec<ComponentManifest>,
    pub problems: Vec<ComponentFinding>,
    /// Union of every valid component's files, paths prefixed with `<ci>/`; the input of
    /// [`check_startup`], [`check_full`] and [`repair`].
    pub manifest: Manifest,
}

/// Reads the active set from the recovery store and verifies every component's manifest.
/// Fails only if nothing can be trusted at all (no trusted key in this build).
pub fn load_installed(
    root: &Path,
    store: &RecoveryStore,
    trusted_keys: &[&str],
    app_version: &str,
) -> Result<Installed, IntegrityError> {
    if trusted_keys.is_empty() {
        return Err(IntegrityError::Signature(
            root.display().to_string(),
            "no trusted release key in this build (development build): every manifest is treated as unsigned".into(),
        ));
    }
    let mut components = Vec::new();
    let mut problems = Vec::new();
    let mut files = Vec::new();
    for (ci, v) in store.active()? {
        let dir = root.join(&ci);
        let problem = match load_component(&dir, trusted_keys) {
            Ok(m) if m.ci == ci && m.version == v => {
                for f in &m.files {
                    files.push(ManifestEntry {
                        path: format!("{ci}/{}", f.path),
                        ..f.clone()
                    });
                }
                components.push(m);
                None
            }
            Ok(m) => Some(ComponentProblem::WrongVersion {
                found: format!("{} {}", m.ci, m.version),
            }),
            Err(_) if !dir.join(COMPONENT_FILE).exists() => Some(ComponentProblem::Missing),
            Err(e) => Some(ComponentProblem::Untrusted {
                reason: e.to_string(),
            }),
        };
        if let Some(problem) = problem {
            problems.push(ComponentFinding {
                ci,
                version: v.to_string(),
                problem,
            });
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(Installed {
        components,
        problems,
        manifest: Manifest {
            format: MANIFEST_FORMAT.into(),
            app_version: app_version.into(),
            files,
        },
    })
}

/// Outcome of the start-up integrity check with offline repair (SS-08).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct StartupOutcome {
    pub components: usize,
    pub report: Report,
    pub component_problems: Vec<ComponentFinding>,
    pub restored: Vec<String>,
    pub unrecoverable: Vec<String>,
    /// True if a repair failed because the install directory is not writable for this user
    /// (system-wide installation): the files are reported, and repair needs the installer.
    pub needs_elevated_repair: bool,
}

pub fn log_path(root: &Path) -> PathBuf {
    root.join("state").join("integrity.log")
}

fn permission_denied(e: &IntegrityError) -> bool {
    match e {
        IntegrityError::Io { source, .. } => source.kind() == std::io::ErrorKind::PermissionDenied,
        IntegrityError::Cm(ef_cm::CmError::Io { source, .. }) => {
            source.kind() == std::io::ErrorKind::PermissionDenied
        }
        _ => false,
    }
}

/// SS-08 foreground pass: restores broken components, hashes the start-up tier, restores
/// broken files from the recovery store and logs every event. The deferred tier is left in
/// `report.background_queue` for [`background_pass`].
pub fn startup_pass(
    root: &Path,
    store: &RecoveryStore,
    trusted_keys: &[&str],
    app_version: &str,
    at: &str,
) -> Result<StartupOutcome, IntegrityError> {
    let log = log_path(root);
    let mut out = StartupOutcome::default();
    let mut inst = load_installed(root, store, trusted_keys, app_version)?;
    if !inst.problems.is_empty() {
        for p in &inst.problems {
            let v =
                Version::parse(&p.version).map_err(|e| IntegrityError::Manifest(e.to_string()))?;
            let r = store
                .activate(&p.ci, &v, root)
                .map_err(IntegrityError::from);
            let ok = r.is_ok();
            if let Err(e) = &r {
                out.needs_elevated_repair |= permission_denied(e);
            }
            let _ = log_event(
                &log,
                &serde_json::json!({"at": at, "event": if ok {"component_restored"} else {"component_unrecoverable"},
                    "ci": p.ci, "version": p.version, "problem": p.problem, "error": r.err().map(|e| e.to_string())}),
            );
            if ok {
                out.restored.push(format!("{}/", p.ci));
            } else {
                out.unrecoverable.push(format!("{}/", p.ci));
            }
        }
        out.component_problems = inst.problems.clone();
        inst = load_installed(root, store, trusted_keys, app_version)?;
        // a component that is still broken after restoring stays reported
        for p in &inst.problems {
            let k = format!("{}/", p.ci);
            if !out.unrecoverable.contains(&k) {
                out.restored.retain(|r| r != &k);
                out.unrecoverable.push(k);
            }
        }
    }
    out.components = inst.components.len();
    let report = check_startup(root, &inst.manifest)?;
    if !report.findings.is_empty() {
        fix(root, store, &inst.manifest, &report.findings, at, &mut out)?;
    }
    out.report = report;
    Ok(out)
}

fn fix(
    root: &Path,
    store: &RecoveryStore,
    m: &Manifest,
    findings: &[Finding],
    at: &str,
    out: &mut StartupOutcome,
) -> Result<(), IntegrityError> {
    let r = repair(root, m, findings, store.objects(), &log_path(root), at)?;
    for path in &r.unrecoverable {
        // tell a permission problem apart from a missing recovery object
        let probe = root.join(path).with_extension("ef-restore");
        if let Err(e) = fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&probe)
        {
            out.needs_elevated_repair |= e.kind() == std::io::ErrorKind::PermissionDenied;
        } else {
            let _ = fs::remove_file(&probe);
        }
    }
    out.restored.extend(r.restored);
    out.unrecoverable.extend(r.unrecoverable);
    Ok(())
}

/// SS-08 background pass: full hashes of the deferred tier, then repair of what it finds.
pub fn background_pass(
    root: &Path,
    store: &RecoveryStore,
    trusted_keys: &[&str],
    app_version: &str,
    queue: &[String],
    at: &str,
) -> Result<StartupOutcome, IntegrityError> {
    let inst = load_installed(root, store, trusted_keys, app_version)?;
    let findings = check_full(root, &inst.manifest, queue)?;
    let mut out = StartupOutcome {
        components: inst.components.len(),
        ..Default::default()
    };
    if !findings.is_empty() {
        fix(root, store, &inst.manifest, &findings, at, &mut out)?;
    }
    out.report.checked_full = queue.len();
    out.report.findings = findings;
    Ok(out)
}

/// RFC 3339 UTC time stamp for event logs (no time-zone database needed).
pub fn now_rfc3339() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs()) as i64;
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // civil-from-days (H. Hinnant)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}
