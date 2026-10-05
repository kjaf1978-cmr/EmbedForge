//! `ef-release`: release-time packaging (SS-01, SS-09, CM-10). It writes component manifests,
//! packs and the medium or update index, and verifies a finished medium. It never signs:
//! signing is `packaging/sign/sign-release.sh`, run on your infrastructure with the offline
//! key (SEC-02, TEST-04).
//!
//! ```text
//! ef-release components --spec SPEC --staging DIR
//! ef-release medium     --spec SPEC --staging DIR --out DIR [--part-bytes N] [--level L]
//! ef-release verify     --medium DIR --key PUBKEY [--key PUBKEY]… [--index medium.json|update.json]
//! ```
//!
//! SPEC is a JSON release specification (see `packaging/README.md`).

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
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
struct Spec {
    kind: IndexKind,
    app_version: Version,
    os: String,
    arch: String,
    #[serde(default)]
    requires_app: Option<VersionReq>,
    components: Vec<SpecComponent>,
    #[serde(default)]
    files: Vec<SpecFile>,
    #[serde(default)]
    notices: Vec<Notice>,
    #[serde(default)]
    unbundled_drivers: Vec<UnbundledDriver>,
}

#[derive(Debug, Deserialize)]
struct SpecComponent {
    ci: String,
    kind: CiKind,
    version: Version,
    title: String,
    #[serde(default)]
    optional: bool,
    #[serde(default = "yes")]
    default_selected: bool,
    #[serde(default)]
    consequence: String,
    #[serde(default)]
    applies_to: Vec<String>,
    changelog: Vec<ChangelogEntry>,
    #[serde(default)]
    depends: BTreeMap<String, VersionReq>,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Deserialize)]
struct SpecFile {
    /// Path on the medium.
    path: String,
    /// Source path, relative to the staging directory.
    from: String,
    role: FileRole,
}

struct Args {
    cmd: String,
    spec: Option<PathBuf>,
    staging: Option<PathBuf>,
    out: Option<PathBuf>,
    medium: Option<PathBuf>,
    keys: Vec<String>,
    index: Option<String>,
    part_bytes: u64,
    level: i32,
}

fn parse() -> Result<Args, String> {
    let mut it = std::env::args().skip(1);
    let cmd = it
        .next()
        .ok_or("missing command: components | medium | verify")?;
    let mut a = Args {
        cmd,
        spec: None,
        staging: None,
        out: None,
        medium: None,
        keys: vec![],
        index: None,
        part_bytes: MAX_PART_BYTES,
        level: 9,
    };
    while let Some(x) = it.next() {
        let mut v = || it.next().ok_or(format!("{x} needs a value"));
        match x.as_str() {
            "--spec" => a.spec = Some(v()?.into()),
            "--staging" => a.staging = Some(v()?.into()),
            "--out" => a.out = Some(v()?.into()),
            "--medium" => a.medium = Some(v()?.into()),
            "--key" => a.keys.push(v()?),
            "--index" => a.index = Some(v()?),
            "--part-bytes" => {
                a.part_bytes = v()?.parse().map_err(|_| "--part-bytes needs a number")?
            }
            "--level" => a.level = v()?.parse().map_err(|_| "--level needs a number")?,
            o => return Err(format!("unknown argument {o}")),
        }
    }
    Ok(a)
}

fn load_spec(p: &Path) -> Result<Spec, String> {
    let t = fs::read_to_string(p).map_err(|e| format!("{}: {e}", p.display()))?;
    serde_json::from_str(&t).map_err(|e| format!("{}: {e}", p.display()))
}

fn components(spec: &Spec, staging: &Path) -> Result<(), String> {
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

fn medium(
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
    println!(
        "{} written (unsigned; sign it with sign-release.sh index)",
        p.display()
    );
    Ok(())
}

/// Release gate: index signature, every hash, every pack unpacked and checked against its
/// signed component manifest.
fn verify(medium: &Path, keys: &[String], index: &str) -> Result<(), String> {
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

fn main() {
    let r = parse().and_then(|a| match a.cmd.as_str() {
        "components" => {
            let spec = load_spec(a.spec.as_deref().ok_or("--spec")?)?;
            components(&spec, a.staging.as_deref().ok_or("--staging")?)
        }
        "medium" => {
            let spec = load_spec(a.spec.as_deref().ok_or("--spec")?)?;
            medium(
                &spec,
                a.staging.as_deref().ok_or("--staging")?,
                a.out.as_deref().ok_or("--out")?,
                a.part_bytes,
                a.level,
            )
        }
        "verify" => {
            if a.keys.is_empty() {
                return Err("verify needs --key".into());
            }
            verify(
                a.medium.as_deref().ok_or("--medium")?,
                &a.keys,
                a.index.as_deref().unwrap_or(MEDIUM_INDEX),
            )
        }
        c => Err(format!("unknown command {c}")),
    });
    if let Err(e) = r {
        eprintln!("ef-release: {e}");
        std::process::exit(1);
    }
}
