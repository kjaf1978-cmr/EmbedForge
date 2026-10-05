use ef_cm::ObjectStore;
use ef_diag::*;
use std::fs;

fn setup(t: &std::path::Path) -> (String, ObjectStore) {
    let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
    let root = t.join("app");
    fs::create_dir_all(root.join("bin")).unwrap();
    fs::write(root.join("bin/ef.exe"), "bin").unwrap();
    fs::write(root.join("model.gguf"), "w").unwrap();
    let store = ObjectStore::open(t.join("store")).unwrap();
    store.put(&root.join("bin/ef.exe")).unwrap();
    let m = ef_integrity::build_manifest(&root, "0.1.0").unwrap();
    let text = serde_json::to_string(&m).unwrap();
    fs::write(root.join("manifest.json"), &text).unwrap();
    let sig = minisign::sign(
        Some(&kp.pk),
        &kp.sk,
        std::io::Cursor::new(text.into_bytes()),
        None,
        None,
    )
    .unwrap();
    fs::write(root.join("manifest.json.minisig"), sig.to_string()).unwrap();
    (kp.pk.to_base64(), store)
}

fn ctx<'a>(
    t: &std::path::Path,
    key: &'a str,
    store: Option<ObjectStore>,
    free: f64,
    full: bool,
) -> Context<'a> {
    let host = ef_host::HostFacts {
        free_disk_gb: free,
        ..Default::default()
    };
    Context {
        app_version: "0.1.0".into(),
        install_root: t.join("app"),
        trusted_keys: vec![key],
        recovery: store,
        host,
        full,
        warn_free_gb: 20.0,
        fail_free_gb: 5.0,
    }
}

#[test]
fn healthy_install_reports_pass_and_honest_gaps() {
    let t = tempfile::tempdir().unwrap();
    let (key, store) = setup(t.path());
    let r = run(&ctx(t.path(), &key, Some(store), 100.0, true));
    assert_eq!(r.overall(), Status::Pass);
    let ids: Vec<char> = r.sections.iter().map(|s| s.id).collect();
    assert_eq!(ids, vec!['a', 'b', 'c', 'd', 'e', 'f']);
    assert_eq!(
        r.sections
            .iter()
            .filter(|s| s.status == Status::NotYetAvailable)
            .count(),
        4
    );
    let text = r.to_text();
    assert!(text.contains("delivered in Increment 3"));
}

#[test]
fn corruption_and_low_storage_give_remediation() {
    let t = tempfile::tempdir().unwrap();
    let (key, store) = setup(t.path());
    fs::write(t.path().join("app/bin/ef.exe"), "BIN").unwrap();
    let r = run(&ctx(t.path(), &key, Some(store), 3.0, false));
    assert_eq!(r.overall(), Status::Fail);
    let a = &r.sections[0];
    assert!(a.details.iter().any(|d| d.contains("bin/ef.exe")));
    assert!(a.remediation[0].contains("recovery store"));
    assert_eq!(r.sections[5].status, Status::Fail);
}

#[test]
fn untrusted_manifest_fails_section_a() {
    let t = tempfile::tempdir().unwrap();
    let (_, store) = setup(t.path());
    let other = minisign::KeyPair::generate_unencrypted_keypair()
        .unwrap()
        .pk
        .to_base64();
    let r = run(&ctx(t.path(), &other, Some(store), 100.0, false));
    assert_eq!(r.sections[0].status, Status::Fail);
    assert!(r.sections[0].remediation[0].contains("Reinstall"));
}
