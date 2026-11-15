//! End-to-end on one machine: release side (keygen, packs, depset, medium, signing) then the
//! user side (bootstrap install from the medium, start-up check). This is the automated part
//! of VAPP-01; the clean-machine run on real hosts is user-executed (docs/inc1/VAPP_procedures.md).

use super::*;
use ef_cm::{ChangelogEntry, CiKind, RecoveryStore};
use semver::Version;
use std::collections::BTreeMap;

const PW: &str = "correct horse battery";

fn pack(src_root: &Path, out: &Path, ci: &str, v: &str, deps: &[(&str, &str)]) -> PathBuf {
    let src = src_root.join(ci);
    fs::create_dir_all(src.join("bin")).unwrap();
    fs::write(
        src.join("bin").join(format!("{ci}.exe")),
        format!("{ci} {v}"),
    )
    .unwrap();
    fs::write(src.join("README.txt"), "docs").unwrap();
    let version = Version::parse(v).unwrap();
    let spec = ef_pack::PackSpec {
        ci: ci.into(),
        kind: CiKind::Toolchain,
        changelog: vec![ChangelogEntry {
            version: version.clone(),
            date: "2026-11-15".into(),
            text: "first".into(),
        }],
        version,
        depends: deps
            .iter()
            .map(|(c, r)| (c.to_string(), semver::VersionReq::parse(r).unwrap()))
            .collect::<BTreeMap<_, _>>(),
        license: "GPL-3.0-or-later".into(),
    };
    ef_pack::build_pack(&spec, &src, out, 1 << 20, 3).unwrap().1
}

#[test]
fn keygen_refuses_weak_password_and_overwrite() {
    let d = tempfile::tempdir().unwrap();
    assert!(keygen(d.path(), "k", "short").is_err());
    keygen(d.path(), "k", PW).unwrap();
    assert!(keygen(d.path(), "k", PW)
        .unwrap_err()
        .contains("refusing to overwrite"));
    assert!(load_secret_key(&d.path().join("k.key"), "wrong password!!").is_err());
}

#[test]
fn release_to_offline_install_end_to_end() {
    let d = tempfile::tempdir().unwrap();
    let w = d.path();
    let pk = keygen(&w.join("keys"), "release-2026", PW).unwrap();
    let sk = load_secret_key(&w.join("keys/release-2026.key"), PW).unwrap();

    // release side
    let out = w.join("build");
    let py = pack(&w.join("src"), &out, "python", "3.12.7", &[]);
    let cli = pack(
        &w.join("src"),
        &out,
        "arduino-cli",
        "1.1.0",
        &[("python", "^3.12")],
    );
    let img = pack(&w.join("src"), &out, "pios-image", "2026.10.0", &[]);
    for p in [&py, &cli, &img] {
        sign_file(&sk, p, "EmbedForge 0.1.0").unwrap();
    }
    fs::write(w.join("bootstrap.deb"), b"bootstrap").unwrap();
    let mut spec = MediumSpec {
        app_version: "0.1.0".into(),
        host: HostOs::UbuntuX64,
        bootstrap: w.join("bootstrap.deb"),
        packs: vec![
            SpecPack {
                manifest: cli.clone(),
                optional: false,
                consequence: None,
            },
            SpecPack {
                manifest: py.clone(),
                optional: false,
                consequence: None,
            },
        ],
    };
    // dependency order is enforced
    let e = assemble_medium(&spec, &w.join("bad")).unwrap_err();
    assert!(e.contains("must come earlier"), "{e}");
    spec.packs.swap(0, 1);
    spec.packs.push(SpecPack {
        manifest: img.clone(),
        optional: true,
        consequence: Some(
            "Imaging is unavailable; deployment to an already imaged Pi remains available.".into(),
        ),
    });
    let usb = w.join("usb");
    let mj = assemble_medium(&spec, &usb).unwrap();
    sign_file(&sk, &mj, "EmbedForge 0.1.0").unwrap();

    // user side: the application tree placed by the OS installer, with its signed manifest
    let root = w.join("opt/embedforge");
    fs::create_dir_all(root.join("bin")).unwrap();
    fs::write(root.join("bin/embedforge"), b"app").unwrap();
    fs::write(root.join("bin/embedforge.png"), b"icon").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(
            root.join("bin/embedforge"),
            fs::Permissions::from_mode(0o755),
        )
        .unwrap();
    }
    let am = app_manifest(&root, "0.1.0").unwrap();
    sign_file(&sk, &am, "EmbedForge 0.1.0").unwrap();

    let keys = [pk.as_str()];
    let log = root.join("state/install-events.jsonl");
    let o = ef_pack::install_medium(&usb, &keys, &[], &root, &log, "t").unwrap();
    assert_eq!(o.installed.len(), 2);
    assert_eq!(o.skipped.len(), 1);
    assert!(root
        .join("components/arduino-cli/bin/arduino-cli.exe")
        .is_file());
    assert!(!root.join("components/pios-image").exists());

    let store = RecoveryStore::open(root.join("recovery")).unwrap();
    let m = ef_pack::load_install_manifest(&root, &keys, &store).unwrap();
    assert!(m.files.iter().any(|f| f.path == "bin/embedforge"));
    assert!(m
        .files
        .iter()
        .any(|f| f.path == "components/python/README.txt"));
    assert!(ef_integrity::check_startup(&root, &m)
        .unwrap()
        .findings
        .is_empty());

    // VAPP-04: a corrupted application file is restored offline (USB stick removed)
    fs::rename(&usb, w.join("usb-away")).unwrap();
    fs::write(root.join("bin/embedforge"), b"APP").unwrap();
    fs::write(root.join("bin/embedforge.png"), b"ICON").unwrap();
    let r = ef_integrity::check_startup(&root, &m).unwrap();
    // the executable is in the start-up tier (on Windows by its .exe name, here by its exec bit)
    #[cfg(unix)]
    assert_eq!(r.findings.len(), 1);
    // the same-size icon is a deferred file: found by the background pass
    let bg = ef_integrity::check_full(&root, &m, &r.background_queue).unwrap();
    assert!(bg.iter().any(|f| f.path == "bin/embedforge.png"));
    let mut all = r.findings.clone();
    all.extend(bg);
    let rep = ef_integrity::repair(&root, &m, &all, store.objects(), &log, "t1").unwrap();
    assert!(rep.unrecoverable.is_empty());
    assert_eq!(fs::read(root.join("bin/embedforge")).unwrap(), b"app");
    assert_eq!(fs::read(root.join("bin/embedforge.png")).unwrap(), b"icon");
    fs::rename(w.join("usb-away"), &usb).unwrap();

    // re-running the bootstrap (e.g. to add the optional pack) is idempotent for the rest
    let o = ef_pack::install_medium(&usb, &keys, &["pios-image"], &root, &log, "t2").unwrap();
    assert_eq!(o.installed.len(), 3);
    assert!(o
        .installed
        .iter()
        .filter(|i| i.ci != "pios-image")
        .all(|i| i.already_stored));

    // the minisign trusted comment binds the signature to the file name
    let sig = fs::read_to_string(ef_pack::sig_path(&mj)).unwrap();
    assert!(sig.contains("file:medium.json EmbedForge 0.1.0"));
}

#[test]
fn depset_lists_debs_by_hash() {
    let d = tempfile::tempdir().unwrap();
    fs::write(d.path().join("a_1_arm64.deb"), b"a").unwrap();
    fs::write(d.path().join("notes.txt"), b"x").unwrap();
    let p = depset(d.path(), "0.1.0").unwrap();
    let s: DepSet = serde_json::from_str(&fs::read_to_string(p).unwrap()).unwrap();
    assert_eq!(s.debs.len(), 1);
    assert_eq!(s.debs[0].sha256.len(), 64);
}
