//! Release-time packaging (SS-01, SS-09, CM-10), behind two programs:
//! - `ef-release` (builder side) writes component manifests, packs and the medium or update
//!   index, and verifies a finished medium. It never signs.
//! - `embedforge-sign` (owner side, [`kit`]) runs on your PC with your offline key: it signs
//!   the component manifests and indexes of a signing kit and assembles the media (SEC-02,
//!   TEST-04).
//!
//! ```text
//! ef-release components --spec SPEC --staging DIR
//! ef-release medium     --spec SPEC --staging DIR --out DIR [--part-bytes N] [--level L]
//! ef-release verify     --medium DIR --key PUBKEY [--key PUBKEY]… [--index medium.json|update.json]
//! ```
//!
//! SPEC is a JSON release specification (see `packaging/README.md`).

pub mod kit;

use ef_cm::{ChangelogEntry, CiKind};
use ef_integrity::{
    build_component_manifest, write_component_manifest, ComponentMeta, COMPONENT_FILE,
    COMPONENT_SIG,
};
use ef_pack::*;
use semver::{Version, VersionReq};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Deserialize)]
pub struct Spec {
    pub kind: IndexKind,
    pub app_version: Version,
    pub os: String,
    pub arch: String,
    #[serde(default)]
    pub requires_app: Option<VersionReq>,
    pub components: Vec<SpecComponent>,
    #[serde(default)]
    pub files: Vec<SpecFile>,
    #[serde(default)]
    pub notices: Vec<Notice>,
    #[serde(default)]
    pub unbundled_drivers: Vec<UnbundledDriver>,
}

#[derive(Debug, Deserialize)]
pub struct SpecComponent {
    pub ci: String,
    pub kind: CiKind,
    pub version: Version,
    pub title: String,
    #[serde(default)]
    pub optional: bool,
    #[serde(default = "yes")]
    pub default_selected: bool,
    #[serde(default)]
    pub consequence: String,
    #[serde(default)]
    pub applies_to: Vec<String>,
    pub changelog: Vec<ChangelogEntry>,
    #[serde(default)]
    pub depends: BTreeMap<String, VersionReq>,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Deserialize)]
pub struct SpecFile {
    /// Path on the medium.
    pub path: String,
    /// Source path, relative to the staging directory.
    pub from: String,
    pub role: FileRole,
}

pub fn load_spec(p: &Path) -> Result<Spec, String> {
    let t = fs::read_to_string(p).map_err(|e| format!("{}: {e}", p.display()))?;
    serde_json::from_str(&t).map_err(|e| format!("{}: {e}", p.display()))
}

pub fn components(spec: &Spec, staging: &Path) -> Result<(), String> {
    for c in &spec.components {
        let dir = staging.join(&c.ci);
        if !dir.is_dir() {
            return Err(format!("{} is not staged at {}", c.ci, dir.display()));
        }
        let _ = fs::remove_file(dir.join(COMPONENT_SIG));
        let m = build_component_manifest(
            &dir,
            &ComponentMeta {
                ci: c.ci.clone(),
                kind: c.kind,
                version: c.version.clone(),
                title: c.title.clone(),
                optional: c.optional,
                changelog: c.changelog.clone(),
                depends: c.depends.clone(),
            },
        )
        .map_err(|e| e.to_string())?;
        write_component_manifest(&dir, &m).map_err(|e| e.to_string())?;
        println!(
            "{}/{COMPONENT_FILE}: {} {} files",
            c.ci,
            m.version,
            m.files.len()
        );
    }
    Ok(())
}

pub fn medium(
    spec: &Spec,
    staging: &Path,
    out: &Path,
    part_bytes: u64,
    level: i32,
) -> Result<(), String> {
    fs::create_dir_all(out).map_err(|e| e.to_string())?;
    let mut packed = vec![];
    for c in &spec.components {
        let dir = staging.join(&c.ci);
        if !dir.join(COMPONENT_SIG).exists() {
            return Err(format!(
                "{}: component manifest is not signed yet (run sign-release.sh components first)",
                c.ci
            ));
        }
        let p = pack_component(
            &dir,
            out,
            PackedComponentMeta {
                ci: c.ci.clone(),
                kind: c.kind,
                version: c.version.clone(),
                title: c.title.clone(),
                optional: c.optional,
                default_selected: c.default_selected,
                consequence: c.consequence.clone(),
                applies_to: c.applies_to.clone(),
            },
            PackOptions {
                max_part_bytes: part_bytes,
                zstd_level: level,
            },
        )
        .map_err(|e| e.to_string())?;
        println!(
            "{} {}: {} part(s), {} bytes packed, {} installed",
            p.ci,
            p.version,
            p.parts.len(),
            p.parts.iter().map(|x| x.size).sum::<u64>(),
            p.installed_size
        );
        packed.push(p);
    }
    let mut files = vec![];
    for f in &spec.files {
        let dst = out.join(&f.path);
        if let Some(d) = dst.parent() {
            fs::create_dir_all(d).map_err(|e| e.to_string())?;
        }
        fs::copy(staging.join(&f.from), &dst).map_err(|e| format!("{}: {e}", f.from))?;
        files.push(medium_file(out, &f.path, f.role.clone()).map_err(|e| e.to_string())?);
    }
    let idx = Index {
        format: INDEX_FORMAT.into(),
        kind: spec.kind,
        app_version: spec.app_version.clone(),
        os: spec.os.clone(),
        arch: spec.arch.clone(),
        created: ef_integrity::now_rfc3339(),
        requires_app: spec.requires_app.clone(),
        components: packed,
        files,
        notices: spec.notices.clone(),
        unbundled_drivers: spec.unbundled_drivers.clone(),
    };
    let p = write_index(out, &idx).map_err(|e| e.to_string())?;
    println!("{} written (not signed yet)", p.display());
    Ok(())
}

/// Release gate: index signature, every hash, every pack unpacked and checked against its
/// signed component manifest.
pub fn verify(medium: &Path, keys: &[String], index: &str) -> Result<(), String> {
    let k: Vec<&str> = keys.iter().map(String::as_str).collect();
    let idx = load_index(medium, index, &k).map_err(|e| e.to_string())?;
    let all: Vec<&str> = idx.components.iter().map(|c| c.ci.as_str()).collect();
    let probs = verify_contents(medium, &idx, &all, &mut |_| {});
    if !probs.is_empty() {
        return Err(format!("damaged: {probs:?}"));
    }
    let tmp = std::env::temp_dir().join(format!("ef-release-verify-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    for c in &idx.components {
        let d = tmp.join(&c.ci);
        extract_component(medium, c, &d).map_err(|e| e.to_string())?;
        let m = ef_integrity::load_component(&d, &k).map_err(|e| format!("{}: {e}", c.ci))?;
        if m.ci != c.ci || m.version != c.version {
            return Err(format!("{}: pack holds {} {}", c.ci, m.ci, m.version));
        }
        for f in &m.files {
            let (sha, _) =
                ef_cm::objects::sha256_file(&d.join(&f.path)).map_err(|e| e.to_string())?;
            if sha != f.sha256 {
                return Err(format!("{}: {} does not match its manifest", c.ci, f.path));
            }
        }
        if c.parts.iter().any(|p| p.size > MAX_PART_BYTES) {
            return Err(format!("{}: part above 1.9 GiB", c.ci));
        }
        println!(
            "{} {}: {} parts, {} files OK",
            c.ci,
            c.version,
            c.parts.len(),
            m.files.len()
        );
        let _ = fs::remove_dir_all(&d);
    }
    let _ = fs::remove_dir_all(&tmp);
    println!(
        "PASS: {} {} {} {} — {} components, {} other files",
        index,
        idx.app_version,
        idx.os,
        idx.arch,
        idx.components.len(),
        idx.files.len()
    );
    Ok(())
}
