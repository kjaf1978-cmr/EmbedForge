//! Test fixture: builds signed media and update packages the way the release pipeline does
//! (stage → component manifests → sign → pack → index → sign), with a throwaway key.

#![allow(dead_code)]

use ef_cm::{ChangelogEntry, CiKind};
use ef_integrity::{
    build_component_manifest, write_component_manifest, ComponentMeta, COMPONENT_FILE,
};
use ef_pack::*;
use semver::{Version, VersionReq};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

pub struct Key {
    pub kp: minisign::KeyPair,
    pub pk: String,
}

pub fn key() -> Key {
    let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
    let pk = kp.pk.to_base64();
    Key { kp, pk }
}

pub fn sign(k: &Key, file: &Path) {
    let sig = minisign::sign(
        Some(&k.kp.pk),
        &k.kp.sk,
        std::io::Cursor::new(fs::read(file).unwrap()),
        Some("embedforge test"),
        None,
    )
    .unwrap();
    fs::write(format!("{}.minisig", file.display()), sig.to_string()).unwrap();
}

pub struct Comp {
    pub ci: &'static str,
    pub kind: CiKind,
    pub version: &'static str,
    pub optional: bool,
    pub default_selected: bool,
    pub applies_to: Vec<String>,
    pub depends: Vec<(&'static str, &'static str)>,
    pub files: Vec<(&'static str, Vec<u8>)>,
}

impl Comp {
    pub fn new(
        ci: &'static str,
        version: &'static str,
        files: Vec<(&'static str, Vec<u8>)>,
    ) -> Self {
        Self {
            ci,
            kind: CiKind::Runtime,
            version,
            optional: false,
            default_selected: true,
            applies_to: vec![],
            depends: vec![],
            files,
        }
    }
}

pub fn noise(n: usize, seed: u32) -> Vec<u8> {
    let mut x = seed | 1;
    (0..n)
        .map(|_| {
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            x as u8
        })
        .collect()
}

pub fn app(version: &'static str, marker: &str) -> Comp {
    let mut c = Comp::new(
        "embedforge-app",
        version,
        vec![
            (
                "bin/embedforge",
                format!("app binary {marker}").into_bytes(),
            ),
            ("bin/embedforge-helper", b"helper binary".to_vec()),
            ("bin/embedforge-setup", b"setup binary".to_vec()),
            ("share/embedforge.png", b"png".to_vec()),
            ("licences/LICENSE", b"GPL-3.0-or-later".to_vec()),
        ],
    );
    c.kind = CiKind::AppBackEndModule;
    c
}

/// Stages, signs and packs `comps` into `out` as an index of `kind`.
pub fn build(
    t: &Path,
    out: &Path,
    k: &Key,
    kind: IndexKind,
    comps: &[Comp],
    extra: impl FnOnce(&mut Index, &Path),
) -> Index {
    let staging = t.join(format!(
        "staging-{}",
        out.file_name().unwrap().to_string_lossy()
    ));
    let mut packed = vec![];
    for c in comps {
        let dir = staging.join(c.ci);
        for (p, data) in &c.files {
            fs::create_dir_all(dir.join(p).parent().unwrap()).unwrap();
            fs::write(dir.join(p), data).unwrap();
            #[cfg(unix)]
            if p.starts_with("bin/") {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(dir.join(p), fs::Permissions::from_mode(0o755)).unwrap();
            }
        }
        let version = Version::parse(c.version).unwrap();
        let depends: BTreeMap<String, VersionReq> = c
            .depends
            .iter()
            .map(|(d, r)| (d.to_string(), VersionReq::parse(r).unwrap()))
            .collect();
        let m = build_component_manifest(
            &dir,
            &ComponentMeta {
                ci: c.ci.into(),
                kind: c.kind,
                version: version.clone(),
                title: format!("{} pack", c.ci),
                optional: c.optional,
                changelog: vec![ChangelogEntry {
                    version: version.clone(),
                    date: "2026-10-05".into(),
                    text: "test".into(),
                }],
                depends,
            },
        )
        .unwrap();
        write_component_manifest(&dir, &m).unwrap();
        sign(k, &dir.join(COMPONENT_FILE));
        packed.push(
            pack_component(
                &dir,
                out,
                PackedComponentMeta {
                    ci: c.ci.into(),
                    kind: c.kind,
                    version,
                    title: format!("{} pack", c.ci),
                    optional: c.optional,
                    default_selected: c.default_selected,
                    consequence: format!("without {}: its functions are missing", c.ci),
                    applies_to: c.applies_to.clone(),
                },
                PackOptions {
                    max_part_bytes: 50_000,
                    zstd_level: 1,
                },
            )
            .unwrap(),
        );
    }
    let mut idx = Index {
        format: INDEX_FORMAT.into(),
        kind,
        app_version: Version::parse(comps[0].version).unwrap(),
        os: "ubuntu".into(),
        arch: std::env::consts::ARCH.into(),
        created: "2026-10-05T12:00:00Z".into(),
        requires_app: None,
        components: packed,
        files: vec![],
        notices: vec![],
        unbundled_drivers: vec![],
    };
    extra(&mut idx, out);
    let p = write_index(out, &idx).unwrap();
    sign(k, &p);
    idx
}

pub fn good_host() -> ef_host::HostFacts {
    ef_host::HostFacts {
        os_family: "linux".into(),
        os_name: "Ubuntu".into(),
        os_version: "24.04".into(),
        arch: "x86_64".into(),
        physical_cores: 8,
        threads: 16,
        avx2: Some(true),
        ram_gb: 32.0,
        free_disk_gb: 200.0,
        disk_total_gb: 512.0,
        pi_model: None,
        storage_kind: Some("nvme".into()),
        display: None,
    }
}
