//! Component packs, installation media and offline update packages (SS-01, SS-08, SS-09).
//!
//! A **pack** carries one version of one configuration item (CM-01). On the medium it is:
//!
//! ```text
//! packs/<ci>-<version>.pack.json           pack manifest (format ef.pack@1.0)
//! packs/<ci>-<version>.pack.json.minisig   its signature (SEC-02)
//! packs/<ci>-<version>.part000.tar.zst     the payload: one tar stream, zstd-compressed,
//! packs/<ci>-<version>.part001.tar.zst     split into parts of at most 1.9 GiB (SS-01)
//! ```
//!
//! The pack manifest lists every part (size, SHA-256) and every payload file (size, SHA-256,
//! F3-01 tier). Installing a pack ([`install_pack`]) verifies the signature, then every part,
//! then every extracted file against the list; anything not listed, or any link, device or
//! unsafe path in the tar stream, rejects the whole pack. A verified pack goes into the
//! content-addressed recovery store as a new version (CM-09) and is then activated with the
//! CM-04 dependency check, so an update package (SS-09) is a pack with a higher version and
//! rollback is [`ef_cm::RecoveryStore::downgrade`] — no network in either direction.
//!
//! The **medium index** (`medium.json` + signature) names the host OS, the app version and
//! every pack, with the optional ones marked (SS-01: second LLM profile, Pi OS images, full
//! 3D library) and the consequence of leaving each out.
//!
//! This crate verifies and installs only. Building and signing happen in `ef-release`, on the
//! release machine with the offline key (SEC-02, TEST-04).

use ef_cm::objects::sha256_file;
use ef_cm::{ChangelogEntry, CiKind, CiVersion, RecoveryStore};
use ef_integrity::{classify, verify_signed_file, Manifest, ManifestEntry, Tier, MANIFEST_FORMAT};
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

pub const PACK_FORMAT: &str = "ef.pack@1.0";
pub const MEDIUM_FORMAT: &str = "ef.medium@1.0";
/// SS-01: each pack file ≤ 1.9 GiB (GitHub Releases asset limit of CM-10; FAT32-safe).
pub const MAX_PART_BYTES: u64 = 1_900 * 1024 * 1024 * 1024 / 1000;
/// Directory under the install root that holds the active component trees.
pub const COMPONENTS_DIR: &str = "components";
/// Directory under the install root that keeps the signed manifests of installed packs.
pub const INSTALLED_DIR: &str = "packs-installed";

#[derive(Debug, thiserror::Error)]
pub enum PackError {
    #[error("I/O error on {path}: {source}")]
    Io { path: PathBuf, source: io::Error },
    #[error("pack {0}: {1}")]
    Invalid(String, String),
    #[error("{0}")]
    Integrity(#[from] ef_integrity::IntegrityError),
    #[error("{0}")]
    Cm(#[from] ef_cm::CmError),
}

fn io_err<T>(path: &Path, r: io::Result<T>) -> Result<T, PackError> {
    r.map_err(|source| PackError::Io {
        path: path.into(),
        source,
    })
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PartEntry {
    pub file: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PackManifest {
    pub format: String,
    /// Configuration-item id; also the directory name under `components/`.
    pub ci: String,
    pub kind: CiKind,
    pub version: Version,
    pub changelog: Vec<ChangelogEntry>,
    #[serde(default)]
    pub depends: BTreeMap<String, VersionReq>,
    /// SPDX licence expression of the payload (SS-02 source pack, INV-10 bundling rules).
    pub license: String,
    pub parts: Vec<PartEntry>,
    pub files: Vec<ManifestEntry>,
}

impl PackManifest {
    pub fn stem(&self) -> String {
        format!("{}-{}", self.ci, self.version)
    }
    pub fn installed_size(&self) -> u64 {
        self.files.iter().map(|f| f.size).sum()
    }
}

/// What the pack is, before it is built (input to [`build_pack`]).
#[derive(Debug, Clone)]
pub struct PackSpec {
    pub ci: String,
    pub kind: CiKind,
    pub version: Version,
    pub changelog: Vec<ChangelogEntry>,
    pub depends: BTreeMap<String, VersionReq>,
    pub license: String,
}

fn safe_rel(p: &str) -> bool {
    let path = Path::new(p);
    !p.is_empty()
        && !path.is_absolute()
        && path.components().all(|c| matches!(c, Component::Normal(_)))
        && !p.contains('\\')
}

fn walk(root: &Path) -> Result<Vec<(String, PathBuf, bool)>, PackError> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(d) = stack.pop() {
        for e in io_err(&d, fs::read_dir(&d))? {
            let p = io_err(&d, e)?.path();
            let meta = io_err(&p, fs::symlink_metadata(&p))?;
            if meta.is_dir() {
                stack.push(p);
            } else if meta.is_file() {
                let rel = p
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                out.push((rel, p, exec_bit(&meta)));
            } else {
                return Err(PackError::Invalid(
                    root.display().to_string(),
                    format!(
                        "{} is a link or special file; packs carry regular files only",
                        p.display()
                    ),
                ));
            }
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

#[cfg(unix)]
fn exec_bit(m: &fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    m.permissions().mode() & 0o111 != 0
}
#[cfg(not(unix))]
fn exec_bit(_m: &fs::Metadata) -> bool {
    false
}

/// Writes a byte stream into numbered part files of at most `max` bytes each.
struct SplitWriter {
    dir: PathBuf,
    stem: String,
    max: u64,
    cur: Option<(fs::File, PathBuf, u64)>,
    done: Vec<PathBuf>,
}

impl SplitWriter {
    fn part_name(&self, i: usize) -> String {
        format!("{}.part{:03}.tar.zst", self.stem, i)
    }
    fn roll(&mut self) -> io::Result<()> {
        if let Some((mut f, p, _)) = self.cur.take() {
            f.flush()?;
            self.done.push(p);
        }
        let p = self.dir.join(self.part_name(self.done.len()));
        self.cur = Some((fs::File::create(&p)?, p, 0));
        Ok(())
    }
    fn finish(mut self) -> io::Result<Vec<PathBuf>> {
        if let Some((mut f, p, _)) = self.cur.take() {
            f.flush()?;
            self.done.push(p);
        }
        Ok(self.done)
    }
}

impl Write for SplitWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if buf.is_empty() {
            return Ok(0);
        }
        if !self.cur.as_ref().is_some_and(|c| c.2 < self.max) {
            self.roll()?;
        }
        let (f, _, n) = self.cur.as_mut().unwrap();
        let k = buf.len().min((self.max - *n) as usize);
        f.write_all(&buf[..k])?;
        *n += k as u64;
        Ok(k)
    }
    fn flush(&mut self) -> io::Result<()> {
        match self.cur.as_mut() {
            Some((f, _, _)) => f.flush(),
            None => Ok(()),
        }
    }
}

/// Release-time: packs every regular file under `src` into `out_dir` and writes the
/// (unsigned) pack manifest `out_dir/<ci>-<version>.pack.json`. `ef-release` signs it.
/// Deterministic: files in sorted order, fixed mtime/owner, so the same input gives the
/// same parts.
pub fn build_pack(
    spec: &PackSpec,
    src: &Path,
    out_dir: &Path,
    max_part: u64,
    level: i32,
) -> Result<(PackManifest, PathBuf), PackError> {
    let name = format!("{}-{}", spec.ci, spec.version);
    if !spec.changelog.iter().any(|c| c.version == spec.version) {
        return Err(PackError::Invalid(
            name,
            "changelog has no entry for this version (CM-02)".into(),
        ));
    }
    if max_part == 0 || max_part > MAX_PART_BYTES {
        return Err(PackError::Invalid(
            name,
            format!("part size must be 1..={MAX_PART_BYTES} bytes (SS-01)"),
        ));
    }
    io_err(out_dir, fs::create_dir_all(out_dir))?;
    let files = walk(src)?;
    let mut entries = Vec::new();
    let w = SplitWriter {
        dir: out_dir.into(),
        stem: name.clone(),
        max: max_part,
        cur: None,
        done: vec![],
    };
    let enc = io_err(out_dir, zstd::Encoder::new(w, level))?;
    let mut tb = tar::Builder::new(enc);
    for (rel, p, x) in &files {
        let (sha256, size) = sha256_file(p)?;
        entries.push(ManifestEntry {
            path: rel.clone(),
            size,
            sha256,
            tier: classify(rel, *x),
        });
        let mut h = tar::Header::new_gnu();
        h.set_size(size);
        h.set_mode(if *x { 0o755 } else { 0o644 });
        h.set_mtime(0);
        h.set_uid(0);
        h.set_gid(0);
        h.set_entry_type(tar::EntryType::Regular);
        let f = io_err(p, fs::File::open(p))?;
        io_err(p, tb.append_data(&mut h, rel, f))?;
    }
    let enc = io_err(out_dir, tb.into_inner())?;
    let w = io_err(out_dir, enc.finish())?;
    let part_paths = io_err(out_dir, w.finish())?;
    let mut parts = Vec::new();
    for p in part_paths {
        let (sha256, size) = sha256_file(&p)?;
        parts.push(PartEntry {
            file: p.file_name().unwrap().to_string_lossy().into_owned(),
            size,
            sha256,
        });
    }
    let m = PackManifest {
        format: PACK_FORMAT.into(),
        ci: spec.ci.clone(),
        kind: spec.kind,
        version: spec.version.clone(),
        changelog: spec.changelog.clone(),
        depends: spec.depends.clone(),
        license: spec.license.clone(),
        parts,
        files: entries,
    };
    let mp = out_dir.join(format!("{name}.pack.json"));
    write_pretty(&mp, &m)?;
    Ok((m, mp))
}

fn write_pretty<T: Serialize>(p: &Path, v: &T) -> Result<(), PackError> {
    let mut t = serde_json::to_string_pretty(v).expect("serialisable");
    t.push('\n');
    io_err(p, fs::write(p, t))
}

/// Loads a pack manifest after verifying its signature (SEC-02) and its structure.
pub fn load_pack_manifest(path: &Path, trusted_keys: &[&str]) -> Result<PackManifest, PackError> {
    let sig = sig_path(path);
    verify_signed_file(path, &sig, trusted_keys)?;
    let name = path.display().to_string();
    let m: PackManifest = serde_json::from_str(&io_err(path, fs::read_to_string(path))?)
        .map_err(|e| PackError::Invalid(name.clone(), e.to_string()))?;
    if m.format != PACK_FORMAT {
        return Err(PackError::Invalid(
            name,
            format!("unsupported format {}", m.format),
        ));
    }
    if !safe_rel(&m.ci) || m.ci.contains('/') {
        return Err(PackError::Invalid(name, format!("unsafe ci id {}", m.ci)));
    }
    for f in &m.files {
        if !safe_rel(&f.path) {
            return Err(PackError::Invalid(name, format!("unsafe path {}", f.path)));
        }
    }
    for p in &m.parts {
        if !safe_rel(&p.file) || p.file.contains('/') || p.size > MAX_PART_BYTES {
            return Err(PackError::Invalid(name, format!("bad part {}", p.file)));
        }
    }
    Ok(m)
}

pub fn sig_path(p: &Path) -> PathBuf {
    let mut s = p.as_os_str().to_owned();
    s.push(".minisig");
    PathBuf::from(s)
}

/// Reads the parts one after another, as one stream.
struct ChainReader {
    files: Vec<PathBuf>,
    cur: Option<fs::File>,
}

impl Read for ChainReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        loop {
            if self.cur.is_none() {
                if self.files.is_empty() {
                    return Ok(0);
                }
                self.cur = Some(fs::File::open(self.files.remove(0))?);
            }
            let n = self.cur.as_mut().unwrap().read(buf)?;
            if n > 0 {
                return Ok(n);
            }
            self.cur = None;
        }
    }
}

/// Verifies every part (size + SHA-256), then extracts the payload into `staging` and checks
/// every extracted file against the manifest. Rejects links, devices, unsafe paths and
/// unlisted files. `staging` must not exist.
pub fn verify_and_extract(
    m: &PackManifest,
    pack_dir: &Path,
    staging: &Path,
) -> Result<(), PackError> {
    let name = m.stem();
    let bad = |s: String| PackError::Invalid(name.clone(), s);
    if m.parts.is_empty() {
        return Err(bad("no parts".into()));
    }
    let mut paths = Vec::new();
    for p in &m.parts {
        let path = pack_dir.join(&p.file);
        if !path.is_file() {
            return Err(bad(format!("part {} is missing from the medium", p.file)));
        }
        let (sha, size) = sha256_file(&path)?;
        if size != p.size || sha != p.sha256 {
            return Err(bad(format!(
                "part {} is corrupted (checksum mismatch)",
                p.file
            )));
        }
        paths.push(path);
    }
    if staging.exists() {
        return Err(bad(format!("staging {} already exists", staging.display())));
    }
    io_err(staging, fs::create_dir_all(staging))?;
    let expected: BTreeMap<&str, &ManifestEntry> =
        m.files.iter().map(|f| (f.path.as_str(), f)).collect();
    let dec = io_err(
        pack_dir,
        zstd::Decoder::new(ChainReader {
            files: paths,
            cur: None,
        }),
    )?;
    let mut ar = tar::Archive::new(dec);
    let mut seen = std::collections::BTreeSet::new();
    for e in io_err(pack_dir, ar.entries())? {
        let mut e = io_err(pack_dir, e)?;
        let rel = io_err(pack_dir, e.path())?
            .to_string_lossy()
            .replace('\\', "/");
        if e.header().entry_type() != tar::EntryType::Regular {
            return Err(bad(format!("{rel}: only regular files are allowed")));
        }
        if !safe_rel(&rel) {
            return Err(bad(format!("{rel}: unsafe path")));
        }
        let Some(want) = expected.get(rel.as_str()) else {
            return Err(bad(format!("{rel}: not listed in the signed manifest")));
        };
        if !seen.insert(rel.clone()) {
            return Err(bad(format!("{rel}: appears twice")));
        }
        let dst = staging.join(&rel);
        io_err(&dst, fs::create_dir_all(dst.parent().unwrap()))?;
        let mut out = io_err(&dst, fs::File::create(&dst))?;
        io_err(&dst, io::copy(&mut e, &mut out))?;
        drop(out);
        #[cfg(unix)]
        if want.tier == Tier::Startup && e.header().mode().unwrap_or(0) & 0o111 != 0 {
            use std::os::unix::fs::PermissionsExt;
            io_err(
                &dst,
                fs::set_permissions(&dst, fs::Permissions::from_mode(0o755)),
            )?;
        }
        let (sha, size) = sha256_file(&dst)?;
        if size != want.size || sha != want.sha256 {
            return Err(bad(format!(
                "{rel}: content does not match the signed manifest"
            )));
        }
    }
    if seen.len() != expected.len() {
        let missing: Vec<_> = expected.keys().filter(|k| !seen.contains(**k)).collect();
        return Err(bad(format!("files missing from payload: {missing:?}")));
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct InstallOutcome {
    pub ci: String,
    pub version: Version,
    /// The version that was active before (now kept in the recovery store for rollback).
    pub previous: Option<Version>,
    /// The version was already in the recovery store; only re-activated.
    pub already_stored: bool,
}

/// Installs (or updates to) the pack described by `manifest_path`, entirely offline:
/// signature → parts → files → recovery store → CM-04 dependency check → activation under
/// `install_root/components/<ci>/`. The signed pack manifest is kept under
/// `install_root/packs-installed/` so the start-up check (SS-08) covers the component.
/// Every step is logged to `log` (JSON lines).
pub fn install_pack(
    manifest_path: &Path,
    trusted_keys: &[&str],
    install_root: &Path,
    store: &RecoveryStore,
    log: &Path,
    at: &str,
) -> Result<InstallOutcome, PackError> {
    let result = install_inner(manifest_path, trusted_keys, install_root, store);
    let ev = match &result {
        Ok(o) => serde_json::json!({"at": at, "event": "pack_installed", "ci": o.ci,
            "version": o.version.to_string(), "previous": o.previous.as_ref().map(|v| v.to_string())}),
        Err(e) => serde_json::json!({"at": at, "event": "pack_rejected",
            "pack": manifest_path.file_name().map(|n| n.to_string_lossy().into_owned()),
            "error": e.to_string()}),
    };
    ef_integrity::log_event(log, &ev)?;
    result
}

fn install_inner(
    manifest_path: &Path,
    trusted_keys: &[&str],
    install_root: &Path,
    store: &RecoveryStore,
) -> Result<InstallOutcome, PackError> {
    let m = load_pack_manifest(manifest_path, trusted_keys)?;
    let previous = store.active()?.get(&m.ci).cloned();
    let already_stored = store.versions(&m.ci)?.contains(&m.version);
    if already_stored {
        let rec = store.get(&m.ci, &m.version)?;
        let same = rec.files.len() == m.files.len()
            && rec
                .files
                .iter()
                .zip(&m.files)
                .all(|(a, b)| a.path == b.path && a.sha256 == b.sha256);
        if !same {
            return Err(PackError::Invalid(
                m.stem(),
                "a different build of this version is already stored; versions are immutable"
                    .into(),
            ));
        }
    } else {
        let pack_dir = manifest_path.parent().unwrap_or(Path::new("."));
        let staging = install_root.join(format!(".pack-staging-{}", m.stem()));
        if staging.exists() {
            io_err(&staging, fs::remove_dir_all(&staging))?;
        }
        let r = verify_and_extract(&m, pack_dir, &staging).and_then(|_| {
            store
                .add_version(
                    CiVersion {
                        ci: m.ci.clone(),
                        kind: m.kind,
                        version: m.version.clone(),
                        changelog: m.changelog.clone(),
                        depends: m.depends.clone(),
                        files: vec![],
                    },
                    &staging,
                )
                .map_err(PackError::from)
        });
        let _ = fs::remove_dir_all(&staging);
        r?;
    }
    keep_installed_manifest(manifest_path, install_root, &m)?;
    store.activate(&m.ci, &m.version, &install_root.join(COMPONENTS_DIR))?;
    Ok(InstallOutcome {
        ci: m.ci,
        version: m.version,
        previous,
        already_stored,
    })
}

/// Signed manifests of every stored version are kept under
/// `packs-installed/<ci>/<version>.pack.json(.minisig)` so a rollback stays covered by SS-08.
fn keep_installed_manifest(src: &Path, root: &Path, m: &PackManifest) -> Result<(), PackError> {
    let d = root.join(INSTALLED_DIR).join(&m.ci);
    io_err(&d, fs::create_dir_all(&d))?;
    let dst = d.join(format!("{}.pack.json", m.version));
    io_err(&dst, fs::copy(src, &dst))?;
    io_err(&dst, fs::copy(sig_path(src), sig_path(&dst)))?;
    Ok(())
}

/// CM-04/SS-09 rollback: re-activates an earlier stored version of `ci` from the recovery
/// store (no network). The signed manifest of that version must have been kept.
pub fn rollback(
    ci: &str,
    to: &Version,
    install_root: &Path,
    store: &RecoveryStore,
    log: &Path,
    at: &str,
) -> Result<(), PackError> {
    let mp = install_root
        .join(INSTALLED_DIR)
        .join(ci)
        .join(format!("{to}.pack.json"));
    if !mp.is_file() {
        return Err(PackError::Invalid(
            format!("{ci}-{to}"),
            "no signed manifest kept for this version".into(),
        ));
    }
    let r = store
        .downgrade(ci, to, &install_root.join(COMPONENTS_DIR))
        .map_err(PackError::from);
    ef_integrity::log_event(
        log,
        &serde_json::json!({"at": at, "event": if r.is_ok() {"rolled_back"} else {"rollback_refused"},
            "ci": ci, "to": to.to_string(), "error": r.as_ref().err().map(|e| e.to_string())}),
    )?;
    r
}

/// SS-08 over the whole installation: the signed app manifest plus, for every active
/// component, the files of its signed pack manifest under `components/<ci>/`. A component
/// whose manifest is missing or wrongly signed makes the whole check fail (never silently
/// trusted).
pub fn load_install_manifest(
    root: &Path,
    trusted_keys: &[&str],
    store: &RecoveryStore,
) -> Result<Manifest, PackError> {
    let mut m = ef_integrity::load_manifest(root, trusted_keys)?;
    for (ci, v) in store.active()? {
        let mp = root
            .join(INSTALLED_DIR)
            .join(&ci)
            .join(format!("{v}.pack.json"));
        let pm = load_pack_manifest(&mp, trusted_keys)?;
        if pm.ci != ci || pm.version != v {
            return Err(PackError::Invalid(
                format!("{ci}-{v}"),
                "kept manifest names a different component".into(),
            ));
        }
        for f in pm.files {
            m.files.push(ManifestEntry {
                path: format!("{COMPONENTS_DIR}/{ci}/{}", f.path),
                ..f
            });
        }
    }
    m.files.sort_by(|a, b| a.path.cmp(&b.path));
    if m.format != MANIFEST_FORMAT {
        return Err(PackError::Invalid("install".into(), "bad manifest".into()));
    }
    Ok(m)
}

// ---------------------------------------------------------------------------------------------
// Installation medium (SS-01)

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostOs {
    /// Windows 10 22H2 / 11, x86-64 (bootstrap: EXE).
    WindowsX64,
    /// Ubuntu 22.04 / 24.04 x86-64 (bootstrap: .deb).
    UbuntuX64,
    /// Raspberry Pi OS (Bookworm) arm64 (bootstrap: .deb).
    PiOsArm64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediumPack {
    /// File name of the pack manifest under `packs/`.
    pub manifest: String,
    pub ci: String,
    pub version: Version,
    pub installed_size: u64,
    pub optional: bool,
    /// For optional packs: what is unavailable without it (the installer shows this, SS-01).
    #[serde(default)]
    pub consequence: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Medium {
    pub format: String,
    pub app_version: String,
    pub host: HostOs,
    /// File name of the bootstrap installer at the medium root.
    pub bootstrap: String,
    pub packs: Vec<MediumPack>,
}

/// Loads `medium.json` after verifying its signature and that every pack it names is present
/// with its signature. Nothing on the medium is trusted before this passes.
pub fn load_medium(medium_root: &Path, trusted_keys: &[&str]) -> Result<Medium, PackError> {
    let p = medium_root.join("medium.json");
    verify_signed_file(&p, &sig_path(&p), trusted_keys)?;
    let m: Medium = serde_json::from_str(&io_err(&p, fs::read_to_string(&p))?)
        .map_err(|e| PackError::Invalid("medium.json".into(), e.to_string()))?;
    if m.format != MEDIUM_FORMAT {
        return Err(PackError::Invalid(
            "medium.json".into(),
            format!("unsupported format {}", m.format),
        ));
    }
    for mp in &m.packs {
        if !safe_rel(&mp.manifest) || mp.manifest.contains('/') {
            return Err(PackError::Invalid(
                mp.manifest.clone(),
                "unsafe name".into(),
            ));
        }
        if mp.optional && mp.consequence.as_deref().unwrap_or("").is_empty() {
            return Err(PackError::Invalid(
                mp.manifest.clone(),
                "optional pack without a stated consequence (SS-01)".into(),
            ));
        }
        let f = medium_root.join("packs").join(&mp.manifest);
        if !f.is_file() || !sig_path(&f).is_file() {
            return Err(PackError::Invalid(
                mp.manifest.clone(),
                "listed in medium.json but missing or unsigned on the medium".into(),
            ));
        }
    }
    Ok(m)
}

/// Required packs plus the optional ones the user selected.
pub fn install_plan<'a>(m: &'a Medium, selected_optional: &[&str]) -> Vec<&'a MediumPack> {
    // The medium lists packs in dependency order (written that way by ef-release), so the
    // plan keeps that order; the CM-04 check at activation still refuses a broken order.
    m.packs
        .iter()
        .filter(|p| !p.optional || selected_optional.contains(&p.ci.as_str()))
        .collect()
}

/// Puts a copy of every application file listed in the signed app manifest into the recovery
/// store, so SS-08 can restore application files as well as components. A file whose content
/// does not match the manifest is refused: the installation is already damaged.
pub fn record_app_files(
    install_root: &Path,
    trusted_keys: &[&str],
    store: &RecoveryStore,
) -> Result<usize, PackError> {
    let m = ef_integrity::load_manifest(install_root, trusted_keys)?;
    for f in &m.files {
        let p = install_root.join(&f.path);
        let (sha, _) = store.objects().put(&p)?;
        if sha != f.sha256 {
            return Err(PackError::Invalid(
                "application".into(),
                format!("{} does not match the signed app manifest", f.path),
            ));
        }
    }
    Ok(m.files.len())
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MediumOutcome {
    pub installed: Vec<InstallOutcome>,
    /// Optional packs left out, each with its stated consequence (shown by the installer).
    pub skipped: Vec<(String, String)>,
}

/// Bootstrap step (SS-01): verifies the medium index and installs every required pack plus
/// the selected optional ones, in one run, from local storage only. Stops at the first pack
/// that fails; packs installed before it stay installed and recorded in the recovery store,
/// so re-running the bootstrap resumes.
pub fn install_medium(
    medium_root: &Path,
    trusted_keys: &[&str],
    selected_optional: &[&str],
    install_root: &Path,
    log: &Path,
    at: &str,
) -> Result<MediumOutcome, PackError> {
    let m = load_medium(medium_root, trusted_keys)?;
    let store = RecoveryStore::open(install_root.join("recovery"))?;
    let app_files = record_app_files(install_root, trusted_keys, &store)?;
    ef_integrity::log_event(
        log,
        &serde_json::json!({"at": at, "event": "app_files_recorded", "count": app_files}),
    )?;
    let mut out = MediumOutcome {
        installed: vec![],
        skipped: m
            .packs
            .iter()
            .filter(|p| p.optional && !selected_optional.contains(&p.ci.as_str()))
            .map(|p| (p.ci.clone(), p.consequence.clone().unwrap_or_default()))
            .collect(),
    };
    for p in install_plan(&m, selected_optional) {
        let mp = medium_root.join("packs").join(&p.manifest);
        let o = install_pack(&mp, trusted_keys, install_root, &store, log, at)?;
        if o.ci != p.ci || o.version != p.version {
            return Err(PackError::Invalid(
                p.manifest.clone(),
                "pack does not match its medium.json entry".into(),
            ));
        }
        out.installed.push(o);
    }
    for (ci, why) in &out.skipped {
        ef_integrity::log_event(
            log,
            &serde_json::json!({"at": at, "event": "optional_pack_skipped", "ci": ci, "consequence": why}),
        )?;
    }
    Ok(out)
}

#[cfg(test)]
mod tests;
