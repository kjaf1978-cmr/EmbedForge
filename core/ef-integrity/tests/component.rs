use ef_cm::{ChangelogEntry, CiKind, CiVersion, RecoveryStore};
use ef_integrity::*;
use semver::Version;
use std::fs;
use std::path::Path;

fn meta(ci: &str, v: &str) -> ComponentMeta {
    let version = Version::parse(v).unwrap();
    ComponentMeta {
        ci: ci.into(),
        kind: CiKind::Toolchain,
        version: version.clone(),
        title: ci.into(),
        optional: false,
        changelog: vec![ChangelogEntry {
            version,
            date: "2026-10-05".into(),
            text: "t".into(),
        }],
        depends: Default::default(),
    }
}

fn sign(kp: &minisign::KeyPair, file: &Path) {
    let sig = minisign::sign(
        Some(&kp.pk),
        &kp.sk,
        std::io::Cursor::new(fs::read(file).unwrap()),
        None,
        None,
    )
    .unwrap();
    fs::write(format!("{}.minisig", file.display()), sig.to_string()).unwrap();
}

/// Installs one component `tool` 1.0.0 into `root` through the recovery store.
fn installed(root: &Path, kp: &minisign::KeyPair) -> RecoveryStore {
    let staging = root.with_extension("staging").join("tool");
    fs::create_dir_all(staging.join("bin")).unwrap();
    fs::write(staging.join("bin/tool.exe"), "tool").unwrap();
    fs::write(staging.join("data.bin"), "data").unwrap();
    let m = build_component_manifest(&staging, &meta("tool", "1.0.0")).unwrap();
    write_component_manifest(&staging, &m).unwrap();
    sign(kp, &staging.join(COMPONENT_FILE));
    let store = RecoveryStore::open(root.join("recovery")).unwrap();
    let mm = meta("tool", "1.0.0");
    store
        .add_version(
            CiVersion {
                ci: "tool".into(),
                kind: mm.kind,
                version: mm.version.clone(),
                changelog: mm.changelog,
                depends: Default::default(),
                files: vec![],
            },
            &staging,
        )
        .unwrap();
    store.activate("tool", &mm.version, root).unwrap();
    store
}

#[test]
fn component_manifest_lists_files_but_not_itself() {
    let t = tempfile::tempdir().unwrap();
    let d = t.path().join("c");
    fs::create_dir_all(d.join("lib")).unwrap();
    fs::write(d.join("lib/libx.so.1"), "x").unwrap();
    fs::write(d.join("doc.pdf"), "pdf").unwrap();
    fs::write(d.join(COMPONENT_FILE), "old").unwrap();
    let m = build_component_manifest(&d, &meta("c", "1.0.0")).unwrap();
    let paths: Vec<_> = m.files.iter().map(|f| (f.path.as_str(), f.tier)).collect();
    assert_eq!(
        paths,
        vec![
            ("doc.pdf", Tier::Deferred),
            ("lib/libx.so.1", Tier::Startup)
        ]
    );
    let mut bad = meta("c", "1.0.0");
    bad.changelog.clear();
    assert!(
        build_component_manifest(&d, &bad).is_err(),
        "CM-02 changelog entry required"
    );
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink("/etc/passwd", d.join("link")).unwrap();
        assert!(
            build_component_manifest(&d, &meta("c", "1.0.0")).is_err(),
            "links are refused"
        );
    }
}

#[test]
fn installed_view_and_component_restore() {
    let t = tempfile::tempdir().unwrap();
    let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
    let pk = kp.pk.to_base64();
    let root = t.path().join("root");
    let store = installed(&root, &kp);
    let inst = load_installed(&root, &store, &[&pk], "0.1.0").unwrap();
    assert!(inst.problems.is_empty());
    assert_eq!(
        inst.manifest
            .files
            .iter()
            .map(|f| f.path.as_str())
            .collect::<Vec<_>>(),
        vec!["tool/bin/tool.exe", "tool/data.bin"]
    );
    assert!(load_installed(&root, &store, &[], "0.1.0")
        .unwrap_err()
        .to_string()
        .contains("development build"));

    // whole component deleted → restored from the recovery store at start-up
    fs::remove_dir_all(root.join("tool")).unwrap();
    let out = startup_pass(&root, &store, &[&pk], "0.1.0", "t").unwrap();
    assert_eq!(out.restored, vec!["tool/"]);
    assert_eq!(out.component_problems[0].problem, ComponentProblem::Missing);
    assert!(root.join("tool/bin/tool.exe").exists());

    // a valid manifest of another version in the directory is a problem too
    let other = t.path().join("other");
    fs::create_dir_all(&other).unwrap();
    let m = build_component_manifest(&other, &meta("tool", "2.0.0")).unwrap();
    write_component_manifest(&root.join("tool"), &m).unwrap();
    sign(&kp, &root.join("tool").join(COMPONENT_FILE));
    let inst = load_installed(&root, &store, &[&pk], "0.1.0").unwrap();
    assert!(matches!(
        inst.problems[0].problem,
        ComponentProblem::WrongVersion { .. }
    ));

    // background pass finds a same-size corrupted deferred file and restores it
    let out = startup_pass(&root, &store, &[&pk], "0.1.0", "t").unwrap();
    assert_eq!(out.restored, vec!["tool/"]);
    fs::write(root.join("tool/data.bin"), "DATA").unwrap();
    let s = startup_pass(&root, &store, &[&pk], "0.1.0", "t").unwrap();
    assert!(
        s.report.findings.is_empty(),
        "deferred files are only queued at start-up"
    );
    let b = background_pass(
        &root,
        &store,
        &[&pk],
        "0.1.0",
        &s.report.background_queue,
        "t",
    )
    .unwrap();
    assert_eq!(b.restored, vec!["tool/data.bin"]);
    assert_eq!(
        fs::read_to_string(root.join("tool/data.bin")).unwrap(),
        "data"
    );
    assert_eq!(
        fs::read_to_string(log_path(&root)).unwrap().lines().count(),
        3
    );
}

#[cfg(unix)]
#[test]
fn read_only_install_reports_that_repair_needs_the_installer() {
    if unsafe_is_root() {
        eprintln!("skipped: running as root, permissions are not enforced");
        return;
    }
    use std::os::unix::fs::PermissionsExt;
    let t = tempfile::tempdir().unwrap();
    let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
    let pk = kp.pk.to_base64();
    let root = t.path().join("root");
    let store = installed(&root, &kp);
    fs::write(root.join("tool/bin/tool.exe"), "TOOL").unwrap();
    fs::set_permissions(root.join("tool/bin"), fs::Permissions::from_mode(0o555)).unwrap();
    let out = startup_pass(&root, &store, &[&pk], "0.1.0", "t").unwrap();
    fs::set_permissions(root.join("tool/bin"), fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(out.unrecoverable, vec!["tool/bin/tool.exe"]);
    assert!(out.needs_elevated_repair);
}

#[cfg(unix)]
fn unsafe_is_root() -> bool {
    std::fs::read_to_string("/proc/self/status")
        .map(|s| {
            s.lines()
                .any(|l| l.starts_with("Uid:") && l.split_whitespace().nth(2) == Some("0"))
        })
        .unwrap_or(false)
}

#[test]
fn timestamps_are_rfc3339_utc() {
    let s = now_rfc3339();
    assert_eq!(s.len(), 20);
    assert!(s.starts_with("20") && s.ends_with('Z') && &s[10..11] == "T");
}
