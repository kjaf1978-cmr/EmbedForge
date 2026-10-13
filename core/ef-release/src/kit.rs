//! Signing kit (SEC-02, TEST-04): the builder's CI stages every medium up to the first
//! signature; `embedforge-sign` runs on your PC, signs with your offline key and assembles the
//! media. The secret key never leaves your PC.
//!
//! Kit layout: one folder per medium, each with `spec.json` (the effective release
//! specification) and `staging/` (one folder per component, plus `files/` for the other
//! medium files). Executable bits travel in `.ef-exec` files (zip archives drop them).

use crate::{components, load_spec, medium, verify};
use ef_integrity::{verify_signed_file, COMPONENT_FILE, COMPONENT_SIG};
use ef_pack::{MAX_PART_BYTES, MEDIUM_INDEX};
use std::fs;
use std::path::{Path, PathBuf};

/// Creates `<file>.minisig`.
pub trait Signer {
    fn sign(&self, file: &Path, trusted_comment: &str) -> Result<(), String>;
}

/// Signs with a decrypted minisign secret key.
pub struct KeySigner {
    sk: minisign::SecretKey,
}

impl KeySigner {
    pub fn new(sk: minisign::SecretKey) -> Self {
        Self { sk }
    }

    /// Loads the key; minisign asks for its password on the console.
    pub fn from_file(path: &Path) -> Result<Self, String> {
        minisign::SecretKey::from_file(path, None)
            .map(Self::new)
            .map_err(|e| format!("cannot open the key {}: {e}", path.display()))
    }
}

impl Signer for KeySigner {
    fn sign(&self, file: &Path, trusted_comment: &str) -> Result<(), String> {
        let data = fs::File::open(file).map_err(|e| format!("{}: {e}", file.display()))?;
        let sig = minisign::sign(None, &self.sk, data, Some(trusted_comment), None)
            .map_err(|e| format!("signing {}: {e}", file.display()))?;
        fs::write(format!("{}.minisig", file.display()), sig.to_string())
            .map_err(|e| format!("{}: {e}", file.display()))
    }
}

#[derive(Debug, Clone)]
pub struct KitMedium {
    pub name: String,
    pub dir: PathBuf,
}

/// The media in a kit: every folder with a `spec.json` and a `staging/` folder.
pub fn find_media(kit: &Path) -> Vec<KitMedium> {
    let mut v: Vec<KitMedium> = fs::read_dir(kit)
        .map(|rd| rd.flatten().map(|e| e.path()).collect::<Vec<_>>())
        .unwrap_or_default()
        .into_iter()
        .filter(|p| p.join("spec.json").is_file() && p.join("staging").is_dir())
        .map(|p| KitMedium {
            name: p.file_name().unwrap().to_string_lossy().into_owned(),
            dir: p,
        })
        .collect();
    v.sort_by(|a, b| a.name.cmp(&b.name));
    v
}

#[derive(Debug, Clone)]
pub struct MediumResult {
    pub name: String,
    pub out: PathBuf,
    pub components: usize,
    pub index_sha256: String,
}

/// Optional Windows Authenticode step, applied to the staged `.exe` files before their hashes
/// are recorded in the component manifests.
pub type Authenticode<'a> = &'a dyn Fn(&Path) -> Result<(), String>;

fn exes(dir: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                exes(&p, out);
            } else if p.extension().is_some_and(|x| x.eq_ignore_ascii_case("exe")) {
                out.push(p);
            }
        }
    }
}

/// Signs and assembles one medium into `out/<name>`, then verifies it with the trusted
/// release keys. A key that is not trusted is detected at the first signature.
pub fn sign_medium(
    m: &KitMedium,
    out: &Path,
    signer: &dyn Signer,
    trusted: &[String],
    authenticode: Option<Authenticode>,
    log: &mut dyn FnMut(String),
) -> Result<MediumResult, String> {
    let spec = load_spec(&m.dir.join("spec.json"))?;
    let staging = m.dir.join("staging");
    let keys: Vec<&str> = trusted.iter().map(String::as_str).collect();
    if keys.is_empty() {
        return Err("this embedforge-sign has no release keys built in".into());
    }
    if spec.os == "windows" {
        if let Some(ac) = authenticode {
            let mut v = vec![];
            for c in &spec.components {
                exes(&staging.join(&c.ci), &mut v);
            }
            for f in &v {
                ac(f)?;
                log(format!("Authenticode: {}", f.display()));
            }
            // the bootstrap on the medium is a copy of the (now signed) installer
            let setup = staging.join("embedforge-app/bin/embedforge-setup.exe");
            for f in &spec.files {
                if f.from.to_ascii_lowercase().ends_with(".exe") && setup.is_file() {
                    fs::copy(&setup, staging.join(&f.from)).map_err(|e| e.to_string())?;
                }
            }
        }
    }
    components(&spec, &staging)?;
    for (i, c) in spec.components.iter().enumerate() {
        let f = staging.join(&c.ci).join(COMPONENT_FILE);
        signer.sign(
            &f,
            &format!(
                "NETApps Electric Simulation {} {} {}/{}",
                spec.app_version, m.name, c.ci, COMPONENT_FILE
            ),
        )?;
        if i == 0 {
            verify_signed_file(&f, &staging.join(&c.ci).join(COMPONENT_SIG), &keys).map_err(|_| {
                "this key is not one of the NETApps Electric Simulation release keys built into this program; use embedforge-primary.key".to_string()
            })?;
        }
    }
    let dst = out.join(&m.name);
    if dst.exists() {
        fs::remove_dir_all(&dst).map_err(|e| format!("{}: {e}", dst.display()))?;
    }
    medium(&spec, &staging, &dst, MAX_PART_BYTES, 9)?;
    let index = dst.join(MEDIUM_INDEX);
    signer.sign(
        &index,
        &format!(
            "NETApps Electric Simulation {} {} {MEDIUM_INDEX}",
            spec.app_version, m.name
        ),
    )?;
    verify(&dst, trusted, MEDIUM_INDEX)?;
    let (index_sha256, _) = ef_cm::objects::sha256_file(&index).map_err(|e| e.to_string())?;
    Ok(MediumResult {
        name: m.name.clone(),
        out: dst,
        components: spec.components.len(),
        index_sha256,
    })
}
