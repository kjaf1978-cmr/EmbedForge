//! Component packs and their signed index (SS-01, SS-09, CM-10, SEC-02).
//!
//! - A **pack** is one component directory written as a tar stream (regular files and
//!   directories only), compressed with zstd and split into part files of at most
//!   [`MAX_PART_BYTES`] (1.9 GiB, the GitHub Releases asset limit of CM-10 and FAT32-safe).
//!   One component may span several parts; each part is hashed separately (SS-01, SS-08).
//! - An **index** (`medium.json` for an installation medium, `update.json` for an update
//!   package) lists every component with its parts and every other file on the medium with
//!   its SHA-256. The index is signed with the offline Ed25519 key (minisign format). Because
//!   the signed index fixes the hash of every part, every pack is covered by the signature.
//!   The same pack files serve USB media and online releases (CM-10).
//! - This crate never signs; the release pipeline signs on your infrastructure (TEST-04).

use ef_cm::CiKind;
use ef_integrity::{verify_signed_file, IntegrityError};
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{self, BufReader, Read, Write};
use std::path::{Component, Path, PathBuf};

pub const INDEX_FORMAT: &str = "ef.medium@1.0";
pub const MEDIUM_INDEX: &str = "medium.json";
pub const UPDATE_INDEX: &str = "update.json";
/// 1.9 GiB (SS-01, CM-10).
pub const MAX_PART_BYTES: u64 = 19 * (1 << 30) / 10;
pub const PACK_DIR: &str = "packs";

#[derive(Debug, thiserror::Error)]
pub enum PackError {
    #[error("I/O error on {path}: {source}")]
    Io { path: PathBuf, source: io::Error },
    #[error("{0}")]
    Integrity(#[from] IntegrityError),
    #[error("index: {0}")]
    Index(String),
    #[error("pack {pack}: {msg}")]
    Pack { pack: String, msg: String },
}

fn io_err<T>(path: &Path, r: io::Result<T>) -> Result<T, PackError> {
    r.map_err(|source| PackError::Io {
        path: path.into(),
        source,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IndexKind {
    /// An installation medium for one host OS (SS-01).
    Install,
    /// An update package, importable from USB storage (SS-09).
    Update,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Part {
    /// Path relative to the medium root, `/`-separated.
    pub file: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PackedComponent {
    pub ci: String,
    pub kind: CiKind,
    pub version: Version,
    pub title: String,
    /// Optional packs may be deselected at installation (SS-01).
    #[serde(default)]
    pub optional: bool,
    #[serde(default = "yes")]
    pub default_selected: bool,
    /// What the user loses without this pack; shown by the installer (SS-01).
    #[serde(default)]
    pub consequence: String,
    /// Host releases this component applies to, e.g. `ubuntu-24.04`, `raspios-bookworm`
    /// (dependency .deb sets). Empty = every host this medium is for.
    #[serde(default)]
    pub applies_to: Vec<String>,
    pub installed_size: u64,
    pub file_count: u64,
    pub parts: Vec<Part>,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileRole {
    Bootstrap,
    Script,
    Licence,
    Notice,
    Source,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MediumFile {
    pub path: String,
    pub size: u64,
    pub sha256: String,
    pub role: FileRole,
}

/// Terms the installer must present for acceptance (SS-02: WebView2 runtime licence).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Notice {
    pub id: String,
    pub title: String,
    /// A [`MediumFile`] path holding the text.
    pub text_file: String,
    pub must_accept: bool,
}

/// A USB driver that is not bundled because its licence does not permit redistribution
/// (SS-04, INV-10): the installer lists the affected boards.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UnbundledDriver {
    pub driver: String,
    pub boards: Vec<String>,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Index {
    pub format: String,
    pub kind: IndexKind,
    pub app_version: Version,
    /// `windows`, `ubuntu` or `raspios`.
    pub os: String,
    /// `x86_64` or `aarch64`.
    pub arch: String,
    pub created: String,
    /// Update packages only: the installed app versions they apply to.
    #[serde(default)]
    pub requires_app: Option<VersionReq>,
    pub components: Vec<PackedComponent>,
    #[serde(default)]
    pub files: Vec<MediumFile>,
    #[serde(default)]
    pub notices: Vec<Notice>,
    #[serde(default)]
    pub unbundled_drivers: Vec<UnbundledDriver>,
}

impl Index {
    pub fn index_name(&self) -> &'static str {
        match self.kind {
            IndexKind::Install => MEDIUM_INDEX,
            IndexKind::Update => UPDATE_INDEX,
        }
    }

    pub fn component(&self, ci: &str) -> Option<&PackedComponent> {
        self.components.iter().find(|c| c.ci == ci)
    }

    pub fn pack_bytes(&self) -> u64 {
        self.components
            .iter()
            .flat_map(|c| &c.parts)
            .map(|p| p.size)
            .sum()
    }
}

/// File names that are valid on exFAT and FAT32 and unambiguous everywhere.
pub fn portable_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 200
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.+".contains(c))
}

/// A relative, `/`-separated path of portable names.
pub fn portable_path(p: &str) -> bool {
    !p.is_empty() && p.len() <= 1024 && p.split('/').all(portable_name)
}

// ---------------------------------------------------------------------------------------------
// Writing

/// Writes a byte stream into numbered part files `<stem>.efpack.001`, `.002`, … of at most
/// `max` bytes each, hashing each part as it goes.
struct SplitWriter {
    dir: PathBuf,
    rel_dir: String,
    stem: String,
    max: u64,
    cur: Option<(fs::File, Sha256, u64, String)>,
    parts: Vec<Part>,
}

impl SplitWriter {
    fn rotate(&mut self) -> io::Result<()> {
        if let Some((mut f, h, n, name)) = self.cur.take() {
            f.flush()?;
            f.sync_all()?;
            self.parts.push(Part {
                file: format!("{}/{name}", self.rel_dir),
                size: n,
                sha256: hex::encode(h.finalize()),
            });
        }
        Ok(())
    }

    fn open_next(&mut self) -> io::Result<()> {
        let name = format!("{}.efpack.{:03}", self.stem, self.parts.len() + 1);
        let f = fs::File::create(self.dir.join(&name))?;
        self.cur = Some((f, Sha256::new(), 0, name));
        Ok(())
    }

    fn finish(mut self) -> io::Result<Vec<Part>> {
        if self.cur.is_none() && self.parts.is_empty() {
            self.open_next()?;
        }
        self.rotate()?;
        Ok(self.parts)
    }
}

impl Write for SplitWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if buf.is_empty() {
            return Ok(0);
        }
        if self.cur.as_ref().is_some_and(|c| c.2 >= self.max) {
            self.rotate()?;
        }
        if self.cur.is_none() {
            self.open_next()?;
        }
        let (f, h, n, _) = self.cur.as_mut().unwrap();
        let room = (self.max - *n) as usize;
        let k = buf.len().min(room);
        f.write_all(&buf[..k])?;
        h.update(&buf[..k]);
        *n += k as u64;
        Ok(k)
    }

    fn flush(&mut self) -> io::Result<()> {
        match &mut self.cur {
            Some((f, ..)) => f.flush(),
            None => Ok(()),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PackOptions {
    pub max_part_bytes: u64,
    pub zstd_level: i32,
}

impl Default for PackOptions {
    fn default() -> Self {
        Self {
            max_part_bytes: MAX_PART_BYTES,
            zstd_level: 9,
        }
    }
}

/// Collects the files of `dir`, sorted, as (relative path, absolute path, metadata).
fn walk(dir: &Path) -> Result<Vec<(String, PathBuf, fs::Metadata)>, PackError> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for e in io_err(&d, fs::read_dir(&d))? {
            let p = io_err(&d, e)?.path();
            let m = io_err(&p, fs::symlink_metadata(&p))?;
            let rel = p
                .strip_prefix(dir)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            if m.is_dir() {
                stack.push(p.clone());
                out.push((rel, p, m));
            } else if m.is_file() {
                out.push((rel, p, m));
            } else {
                return Err(PackError::Pack {
                    pack: dir.display().to_string(),
                    msg: format!("{rel}: links and special files are not allowed in packs"),
                });
            }
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

#[cfg(unix)]
fn mode_of(m: &fs::Metadata) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    if m.permissions().mode() & 0o111 != 0 {
        0o755
    } else {
        0o644
    }
}
#[cfg(not(unix))]
fn mode_of(_m: &fs::Metadata) -> u32 {
    0o644
}

/// Packs the component directory `dir` into `<medium_root>/packs/<ci>-<version>.efpack.NNN`.
/// The component's signed manifest (`.ef-component.json`) must already be in `dir`.
pub fn pack_component(
    dir: &Path,
    medium_root: &Path,
    meta: PackedComponentMeta,
    opt: PackOptions,
) -> Result<PackedComponent, PackError> {
    if !portable_name(&meta.ci) {
        return Err(PackError::Index(format!(
            "component id {:?} is not portable",
            meta.ci
        )));
    }
    if opt.max_part_bytes == 0 || opt.max_part_bytes > MAX_PART_BYTES {
        return Err(PackError::Index(format!(
            "part size must be between 1 and {MAX_PART_BYTES} bytes"
        )));
    }
    let stem = format!("{}-{}", meta.ci, meta.version);
    if !portable_name(&format!("{stem}.efpack.001")) {
        return Err(PackError::Index(format!(
            "pack name {stem} is not portable"
        )));
    }
    let out_dir = medium_root.join(PACK_DIR);
    io_err(&out_dir, fs::create_dir_all(&out_dir))?;
    let files = walk(dir)?;
    let split = SplitWriter {
        dir: out_dir.clone(),
        rel_dir: PACK_DIR.into(),
        stem,
        max: opt.max_part_bytes,
        cur: None,
        parts: vec![],
    };
    let enc = io_err(&out_dir, zstd::Encoder::new(split, opt.zstd_level))?;
    let mut tar = tar::Builder::new(enc);
    tar.mode(tar::HeaderMode::Deterministic);
    let (mut installed, mut count) = (0u64, 0u64);
    for (rel, abs, m) in &files {
        let mut h = tar::Header::new_gnu();
        h.set_mtime(0);
        h.set_uid(0);
        h.set_gid(0);
        if m.is_dir() {
            h.set_entry_type(tar::EntryType::Directory);
            h.set_mode(0o755);
            h.set_size(0);
            io_err(abs, tar.append_data(&mut h, format!("{rel}/"), io::empty()))?;
        } else {
            h.set_entry_type(tar::EntryType::Regular);
            h.set_mode(mode_of(m));
            h.set_size(m.len());
            let f = io_err(abs, fs::File::open(abs))?;
            io_err(abs, tar.append_data(&mut h, rel, f))?;
            installed += m.len();
            count += 1;
        }
    }
    let enc = io_err(&out_dir, tar.into_inner())?;
    let split = io_err(&out_dir, enc.finish())?;
    let parts = io_err(&out_dir, split.finish())?;
    Ok(PackedComponent {
        ci: meta.ci,
        kind: meta.kind,
        version: meta.version,
        title: meta.title,
        optional: meta.optional,
        default_selected: meta.default_selected,
        consequence: meta.consequence,
        applies_to: meta.applies_to,
        installed_size: installed,
        file_count: count,
        parts,
    })
}

#[derive(Debug, Clone)]
pub struct PackedComponentMeta {
    pub ci: String,
    pub kind: CiKind,
    pub version: Version,
    pub title: String,
    pub optional: bool,
    pub default_selected: bool,
    pub consequence: String,
    pub applies_to: Vec<String>,
}

/// Hashes a file on the medium for the index.
pub fn medium_file(root: &Path, rel: &str, role: FileRole) -> Result<MediumFile, PackError> {
    if !portable_path(rel) {
        return Err(PackError::Index(format!("{rel} is not a portable path")));
    }
    let (sha256, size) = ef_cm::objects::sha256_file(&root.join(rel))
        .map_err(|e| PackError::Index(e.to_string()))?;
    Ok(MediumFile {
        path: rel.into(),
        size,
        sha256,
        role,
    })
}

/// Writes the (unsigned) index; the pipeline signs it next (`<index>.minisig`).
pub fn write_index(root: &Path, idx: &Index) -> Result<PathBuf, PackError> {
    validate(idx)?;
    let p = root.join(idx.index_name());
    let mut text = serde_json::to_string_pretty(idx).unwrap();
    text.push('\n');
    io_err(&p, fs::write(&p, text))?;
    Ok(p)
}

// ---------------------------------------------------------------------------------------------
// Reading and verification

fn validate(idx: &Index) -> Result<(), PackError> {
    if idx.format != INDEX_FORMAT {
        return Err(PackError::Index(format!(
            "unsupported format {}",
            idx.format
        )));
    }
    if !["windows", "ubuntu", "raspios"].contains(&idx.os.as_str())
        || !["x86_64", "aarch64"].contains(&idx.arch.as_str())
    {
        return Err(PackError::Index(format!(
            "unknown host {} {}",
            idx.os, idx.arch
        )));
    }
    let mut seen = std::collections::BTreeSet::new();
    for c in &idx.components {
        if !portable_name(&c.ci) || !seen.insert(c.ci.clone()) {
            return Err(PackError::Index(format!(
                "bad or duplicate component id {:?}",
                c.ci
            )));
        }
        if c.parts.is_empty() {
            return Err(PackError::Index(format!("{}: no pack parts", c.ci)));
        }
        for p in &c.parts {
            if !portable_path(&p.file) || p.size > MAX_PART_BYTES {
                return Err(PackError::Index(format!(
                    "{}: part {} is not portable or larger than 1.9 GiB",
                    c.ci, p.file
                )));
            }
        }
    }
    for f in &idx.files {
        if !portable_path(&f.path) {
            return Err(PackError::Index(format!(
                "{} is not a portable path",
                f.path
            )));
        }
    }
    for n in &idx.notices {
        if !idx.files.iter().any(|f| f.path == n.text_file) {
            return Err(PackError::Index(format!(
                "notice {} refers to {}, which is not listed",
                n.id, n.text_file
            )));
        }
    }
    Ok(())
}

/// Loads `<root>/<index_name>` after verifying its signature with any trusted key (SEC-02).
pub fn load_index(
    root: &Path,
    index_name: &str,
    trusted_keys: &[&str],
) -> Result<Index, PackError> {
    let p = root.join(index_name);
    if !p.exists() {
        return Err(PackError::Index(format!("{} not found", p.display())));
    }
    verify_signed_file(
        &p,
        &root.join(format!("{index_name}.minisig")),
        trusted_keys,
    )?;
    let idx: Index = serde_json::from_str(&io_err(&p, fs::read_to_string(&p))?)
        .map_err(|e| PackError::Index(format!("{}: {e}", p.display())))?;
    validate(&idx)?;
    if idx.index_name() != index_name {
        return Err(PackError::Index(format!(
            "{index_name} declares kind {:?}",
            idx.kind
        )));
    }
    Ok(idx)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MediumProblem {
    pub file: String,
    pub problem: String,
}

fn hash_file(p: &Path, progress: &mut dyn FnMut(u64)) -> io::Result<(String, u64)> {
    let mut f = fs::File::open(p)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    let mut n = 0u64;
    loop {
        let k = f.read(&mut buf)?;
        if k == 0 {
            break;
        }
        h.update(&buf[..k]);
        n += k as u64;
        progress(k as u64);
    }
    Ok((hex::encode(h.finalize()), n))
}

/// Hashes every part of the selected components and every listed file. `progress` receives
/// the bytes read, for the installer's duration estimate (PERF-09).
pub fn verify_contents(
    root: &Path,
    idx: &Index,
    components: &[&str],
    progress: &mut dyn FnMut(u64),
) -> Vec<MediumProblem> {
    let mut out = Vec::new();
    let mut check = |file: &str, size: u64, sha: &str, out: &mut Vec<MediumProblem>| match hash_file(
        &root.join(file),
        progress,
    ) {
        Err(e) => out.push(MediumProblem {
            file: file.into(),
            problem: format!("unreadable: {e}"),
        }),
        Ok((_, n)) if n != size => out.push(MediumProblem {
            file: file.into(),
            problem: format!("size {n}, expected {size}"),
        }),
        Ok((h, _)) if h != sha => out.push(MediumProblem {
            file: file.into(),
            problem: "SHA-256 mismatch (corrupted or tampered)".into(),
        }),
        Ok(_) => {}
    };
    for c in idx
        .components
        .iter()
        .filter(|c| components.contains(&c.ci.as_str()))
    {
        for p in &c.parts {
            check(&p.file, p.size, &p.sha256, &mut out);
        }
    }
    for f in &idx.files {
        check(&f.path, f.size, &f.sha256, &mut out);
    }
    out
}

/// Reads the parts of one component in order, as one stream.
struct PartsReader {
    files: Vec<PathBuf>,
    cur: Option<BufReader<fs::File>>,
}

impl Read for PartsReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        loop {
            if self.cur.is_none() {
                if self.files.is_empty() {
                    return Ok(0);
                }
                let f = self.files.remove(0);
                self.cur = Some(BufReader::with_capacity(1 << 20, fs::File::open(f)?));
            }
            let n = self.cur.as_mut().unwrap().read(buf)?;
            if n > 0 {
                return Ok(n);
            }
            self.cur = None;
        }
    }
}

fn safe_entry_path(p: &Path) -> bool {
    !p.as_os_str().is_empty()
        && p.to_str().is_some()
        && p.components()
            .all(|c| matches!(c, Component::Normal(n) if n.len() <= 255))
}

/// Unpacks one component into `dest` (created; must not exist). Only regular files and
/// directories with safe relative paths are accepted, and the stream may not expand beyond
/// the declared installed size (guards against tampered or corrupted packs). The caller
/// verifies the result against the component's signed manifest.
pub fn extract_component(root: &Path, c: &PackedComponent, dest: &Path) -> Result<(), PackError> {
    let pack = format!("{} {}", c.ci, c.version);
    let bad = |msg: String| PackError::Pack {
        pack: pack.clone(),
        msg,
    };
    if dest.exists() {
        return Err(bad(format!("{} already exists", dest.display())));
    }
    io_err(dest, fs::create_dir_all(dest))?;
    let reader = PartsReader {
        files: c.parts.iter().map(|p| root.join(&p.file)).collect(),
        cur: None,
    };
    let dec = io_err(root, zstd::Decoder::new(reader))?;
    let mut ar = tar::Archive::new(dec);
    let mut total = 0u64;
    let mut count = 0u64;
    for e in ar.entries().map_err(|e| bad(e.to_string()))? {
        let mut e = e.map_err(|e| bad(e.to_string()))?;
        let path = e.path().map_err(|e| bad(e.to_string()))?.into_owned();
        if !safe_entry_path(&path) {
            return Err(bad(format!("unsafe path {}", path.display())));
        }
        let target = dest.join(&path);
        match e.header().entry_type() {
            tar::EntryType::Directory => io_err(&target, fs::create_dir_all(&target))?,
            tar::EntryType::Regular => {
                let size = e.header().size().map_err(|e| bad(e.to_string()))?;
                total += size;
                count += 1;
                if total > c.installed_size || count > c.file_count {
                    return Err(bad("pack expands beyond its declared size".into()));
                }
                if let Some(p) = target.parent() {
                    io_err(p, fs::create_dir_all(p))?;
                }
                let mut out = io_err(&target, fs::File::create(&target))?;
                let n = io_err(&target, io::copy(&mut (&mut e).take(size), &mut out))?;
                if n != size {
                    return Err(bad(format!("{} is truncated", path.display())));
                }
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let mode = e.header().mode().unwrap_or(0o644);
                    let perm = if mode & 0o111 != 0 { 0o755 } else { 0o644 };
                    io_err(
                        &target,
                        fs::set_permissions(&target, fs::Permissions::from_mode(perm)),
                    )?;
                }
            }
            t => {
                return Err(bad(format!(
                    "{}: entry type {t:?} is not allowed",
                    path.display()
                )))
            }
        }
    }
    if total != c.installed_size || count != c.file_count {
        return Err(bad(format!(
            "unpacked {count} files / {total} bytes, index declares {} / {}",
            c.file_count, c.installed_size
        )));
    }
    Ok(())
}
