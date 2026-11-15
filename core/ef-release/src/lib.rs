//! Release-machine operations (SEC-02, SS-01, TEST-04). The only EmbedForge code that holds a
//! secret key. Keys and signatures use the standard minisign format, so the minisign CLI can
//! be used instead on your infrastructure and either can verify the other's output.

use ef_cm::objects::sha256_file;
use ef_helper::{DepEntry, DepSet, DEPSET_FORMAT};
use ef_pack::{HostOs, Medium, MediumPack, PackManifest, MEDIUM_FORMAT};
use serde::Deserialize;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

pub type Result<T> = std::result::Result<T, String>;

fn e<E: std::fmt::Display>(ctx: impl std::fmt::Display) -> impl FnOnce(E) -> String {
    move |x| format!("{ctx}: {x}")
}

/// Generates a password-protected key pair: `<dir>/<name>.key` (secret, keep offline) and
/// `<dir>/<name>.pub`. Returns the public key in base64 (the value compiled into the app).
pub fn keygen(dir: &Path, name: &str, password: &str) -> Result<String> {
    if password.len() < 12 {
        return Err("the key password must have at least 12 characters".into());
    }
    let sk = dir.join(format!("{name}.key"));
    let pk = dir.join(format!("{name}.pub"));
    if sk.exists() || pk.exists() {
        return Err(format!(
            "{} or {} exists; refusing to overwrite a key",
            sk.display(),
            pk.display()
        ));
    }
    fs::create_dir_all(dir).map_err(e(dir.display()))?;
    let kp = minisign::KeyPair::generate_encrypted_keypair(Some(password.to_string()))
        .map_err(e("keygen"))?;
    let sk_box = kp
        .sk
        .to_box(Some("EmbedForge release key"))
        .map_err(e("secret key"))?;
    let pk_box = kp.pk.to_box().map_err(e("public key"))?;
    fs::write(&sk, sk_box.into_string()).map_err(e(sk.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&sk, fs::Permissions::from_mode(0o600)).map_err(e(sk.display()))?;
    }
    fs::write(&pk, pk_box.into_string()).map_err(e(pk.display()))?;
    Ok(kp.pk.to_base64())
}

pub fn load_secret_key(path: &Path, password: &str) -> Result<minisign::SecretKey> {
    minisign::SecretKey::from_file(path, Some(password.to_string()))
        .map_err(e(format!("secret key {}", path.display())))
}

/// Writes `<file>.minisig`. The trusted comment records the file name and version label so a
/// signature cannot be moved to another file without detection.
pub fn sign_file(sk: &minisign::SecretKey, file: &Path, label: &str) -> Result<PathBuf> {
    let data = fs::read(file).map_err(e(file.display()))?;
    let pk = minisign::PublicKey::from_secret_key(sk).map_err(e("public key"))?;
    let name = file
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let trusted = format!("file:{name} {label}");
    let sig = minisign::sign(Some(&pk), sk, Cursor::new(data), Some(&trusted), None)
        .map_err(e("sign"))?;
    let out = ef_pack::sig_path(file);
    fs::write(&out, sig.to_string()).map_err(e(out.display()))?;
    Ok(out)
}

fn write_json<T: serde::Serialize>(p: &Path, v: &T) -> Result<()> {
    let mut t = serde_json::to_string_pretty(v).map_err(e("json"))?;
    t.push('\n');
    fs::write(p, t).map_err(e(p.display()))
}

/// Writes `root/manifest.json` for an app install tree (unsigned; sign it next).
pub fn app_manifest(root: &Path, app_version: &str) -> Result<PathBuf> {
    let m = ef_integrity::build_manifest(root, app_version).map_err(e("manifest"))?;
    let p = root.join("manifest.json");
    write_json(&p, &m)?;
    Ok(p)
}

/// Writes `dir/deps.json`: the offline dependency set of this version (SS-05(c) allowlist).
pub fn depset(dir: &Path, app_version: &str) -> Result<PathBuf> {
    let mut debs = Vec::new();
    for ent in fs::read_dir(dir).map_err(e(dir.display()))? {
        let p = ent.map_err(e(dir.display()))?.path();
        if p.extension().is_some_and(|x| x == "deb") {
            let (sha256, _) = sha256_file(&p).map_err(e(p.display()))?;
            debs.push(DepEntry {
                file: p.file_name().unwrap().to_string_lossy().into_owned(),
                sha256,
            });
        }
    }
    debs.sort_by(|a, b| a.file.cmp(&b.file));
    let p = dir.join("deps.json");
    write_json(
        &p,
        &DepSet {
            format: DEPSET_FORMAT.into(),
            app_version: app_version.into(),
            debs,
        },
    )?;
    Ok(p)
}

/// Input for [`assemble_medium`] (`medium-spec.json`, kept in the release repository).
#[derive(Debug, Deserialize)]
pub struct MediumSpec {
    pub app_version: String,
    pub host: HostOs,
    /// Path of the built bootstrap installer.
    pub bootstrap: PathBuf,
    /// Pack manifests (already signed), in dependency order.
    pub packs: Vec<SpecPack>,
}

#[derive(Debug, Deserialize)]
pub struct SpecPack {
    pub manifest: PathBuf,
    #[serde(default)]
    pub optional: bool,
    #[serde(default)]
    pub consequence: Option<String>,
}

/// Lays out an installation medium in `out` and writes the (unsigned) `medium.json`:
///
/// ```text
/// <bootstrap installer>
/// medium.json(.minisig)
/// packs/<pack manifests, signatures, parts>
/// ```
///
/// Checks that every pack is signed, that every pack it depends on is earlier on the medium,
/// and that no file exceeds the SS-01 part limit.
pub fn assemble_medium(spec: &MediumSpec, out: &Path) -> Result<PathBuf> {
    let packs_dir = out.join("packs");
    fs::create_dir_all(&packs_dir).map_err(e(packs_dir.display()))?;
    let bname = spec
        .bootstrap
        .file_name()
        .ok_or("bootstrap has no file name")?;
    let bsize = fs::metadata(&spec.bootstrap)
        .map_err(e(spec.bootstrap.display()))?
        .len();
    if bsize > ef_pack::MAX_PART_BYTES {
        return Err("bootstrap installer exceeds the 1.9 GiB file limit".into());
    }
    fs::copy(&spec.bootstrap, out.join(bname)).map_err(e(spec.bootstrap.display()))?;
    let mut listed = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for sp in &spec.packs {
        let txt = fs::read_to_string(&sp.manifest).map_err(e(sp.manifest.display()))?;
        let m: PackManifest = serde_json::from_str(&txt).map_err(e(sp.manifest.display()))?;
        let sig = ef_pack::sig_path(&sp.manifest);
        if !sig.is_file() {
            return Err(format!("{} is not signed", sp.manifest.display()));
        }
        for dep in m.depends.keys() {
            let on_medium = spec.packs.iter().any(|p| {
                p.manifest
                    .file_name()
                    .is_some_and(|n| n.to_string_lossy().starts_with(&format!("{dep}-")))
            });
            if on_medium && !seen.contains(dep) {
                return Err(format!(
                    "{} depends on {dep}, which must come earlier on the medium",
                    m.ci
                ));
            }
        }
        if sp.optional && sp.consequence.as_deref().unwrap_or("").is_empty() {
            return Err(format!(
                "optional pack {} needs a consequence text (SS-01)",
                m.ci
            ));
        }
        let src_dir = sp.manifest.parent().unwrap_or(Path::new("."));
        let mname = sp.manifest.file_name().unwrap();
        fs::copy(&sp.manifest, packs_dir.join(mname)).map_err(e(sp.manifest.display()))?;
        fs::copy(&sig, ef_pack::sig_path(&packs_dir.join(mname))).map_err(e(sig.display()))?;
        for part in &m.parts {
            fs::copy(src_dir.join(&part.file), packs_dir.join(&part.file))
                .map_err(e(&part.file))?;
        }
        listed.push(MediumPack {
            manifest: mname.to_string_lossy().into_owned(),
            ci: m.ci.clone(),
            version: m.version.clone(),
            installed_size: m.installed_size(),
            optional: sp.optional,
            consequence: sp.consequence.clone(),
        });
        seen.push(m.ci);
    }
    let p = out.join("medium.json");
    write_json(
        &p,
        &Medium {
            format: MEDIUM_FORMAT.into(),
            app_version: spec.app_version.clone(),
            host: spec.host,
            bootstrap: bname.to_string_lossy().into_owned(),
            packs: listed,
        },
    )?;
    Ok(p)
}

#[cfg(test)]
mod tests;
