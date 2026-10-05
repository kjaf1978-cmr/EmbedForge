use ef_cm::ObjectStore;
use ef_integrity::*;
use std::fs;
use std::path::Path;

struct Keys {
    kp: minisign::KeyPair,
    pub_b64: String,
}

fn keys() -> Keys {
    let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
    let pub_b64 = kp.pk.to_base64();
    Keys { kp, pub_b64 }
}

fn sign(k: &Keys, file: &Path) {
    let data = fs::read(file).unwrap();
    let sig = minisign::sign(
        Some(&k.kp.pk),
        &k.kp.sk,
        std::io::Cursor::new(data),
        Some("embedforge test"),
        None,
    )
    .unwrap();
    fs::write(format!("{}.minisig", file.display()), sig.to_string()).unwrap();
}

/// Builds an install tree, a recovery store holding its files, and a signed manifest.
fn install(root: &Path, store: &Path, k: &Keys) -> (Manifest, ObjectStore) {
    let files = [
        ("bin/ef-core.exe", "binary"),
        ("lib/libgit2.so.1.9", "lib"),
        ("schemas/ef.netlist.schema.json", "{}"),
        ("models/qwen3-4b.gguf", "weights weights weights"),
        ("docs/manual.html", "<p>doc</p>"),
        ("grammar/nl02.gbnf", "root ::= x"),
    ];
    for (p, c) in files {
        fs::create_dir_all(root.join(p).parent().unwrap()).unwrap();
        fs::write(root.join(p), c).unwrap();
    }
    let objects = ObjectStore::open(store).unwrap();
    for (p, _) in files {
        objects.put(&root.join(p)).unwrap();
    }
    let m = build_manifest(root, "0.1.0").unwrap();
    fs::write(
        root.join("manifest.json"),
        serde_json::to_string_pretty(&m).unwrap(),
    )
    .unwrap();
    sign(k, &root.join("manifest.json"));
    (m, objects)
}

#[test]
fn tiers_follow_f3_01() {
    assert_eq!(classify("bin/ef-core.exe", false), Tier::Startup);
    assert_eq!(classify("lib/libgit2.so.1.9", false), Tier::Startup);
    assert_eq!(classify("tools/avr-gcc", true), Tier::Startup);
    assert_eq!(
        classify("schemas/ef.project.schema.json", false),
        Tier::Startup
    );
    assert_eq!(classify("grammar/nl02.gbnf", false), Tier::Startup);
    assert_eq!(classify("models/qwen3-4b.gguf", false), Tier::Deferred);
    assert_eq!(classify("kicad/3d/R_THT.step", false), Tier::Deferred);
    assert_eq!(classify("catalogue/parts.json", false), Tier::Deferred);
}

#[test]
fn signed_manifest_is_required_sec02() {
    let t = tempfile::tempdir().unwrap();
    let (k, other) = (keys(), keys());
    let root = t.path().join("app");
    install(&root, &t.path().join("store"), &k);
    assert!(load_manifest(&root, &[&k.pub_b64]).is_ok());
    // key rotation: any trusted key may sign
    assert!(load_manifest(&root, &[&other.pub_b64, &k.pub_b64]).is_ok());
    // wrong key
    assert!(load_manifest(&root, &[&other.pub_b64]).is_err());
    // tampered manifest
    let mp = root.join("manifest.json");
    let txt = fs::read_to_string(&mp).unwrap().replace("0.1.0", "9.9.9");
    fs::write(&mp, txt).unwrap();
    assert!(matches!(
        load_manifest(&root, &[&k.pub_b64]),
        Err(IntegrityError::Signature(..))
    ));
    // unsigned
    fs::remove_file(root.join("manifest.json.minisig")).unwrap();
    assert!(load_manifest(&root, &[&k.pub_b64])
        .unwrap_err()
        .to_string()
        .contains("unsigned"));
}

#[test]
fn startup_check_then_offline_repair_ss08() {
    let t = tempfile::tempdir().unwrap();
    let k = keys();
    let root = t.path().join("app");
    let (_, objects) = install(&root, &t.path().join("store"), &k);
    let m = load_manifest(&root, &[&k.pub_b64]).unwrap();

    let r = check_startup(&root, &m).unwrap();
    assert!(r.findings.is_empty());
    assert_eq!((r.checked_full, r.checked_quick), (4, 2));
    assert_eq!(
        r.background_queue.len(),
        2,
        "uncached deferred files are queued"
    );

    // background pass fills the cache
    assert!(check_full(&root, &m, &r.background_queue)
        .unwrap()
        .is_empty());

    // corrupt an executable (same size), delete a doc, corrupt the model (same size)
    fs::write(root.join("bin/ef-core.exe"), "BINARY").unwrap();
    fs::remove_file(root.join("docs/manual.html")).unwrap();
    fs::write(root.join("models/qwen3-4b.gguf"), "weights weights WEIGHTS").unwrap();

    let r = check_startup(&root, &m).unwrap();
    let mut probs: Vec<_> = r
        .findings
        .iter()
        .map(|f| (f.path.as_str(), f.problem.clone()))
        .collect();
    probs.sort_by(|a, b| a.0.cmp(b.0));
    assert_eq!(
        probs,
        vec![
            ("bin/ef-core.exe", Problem::HashMismatch),
            ("docs/manual.html", Problem::Missing)
        ]
    );
    assert_eq!(
        r.background_queue[0], "models/qwen3-4b.gguf",
        "changed mtime → hashed first in background"
    );
    let bg = check_full(&root, &m, &r.background_queue).unwrap();
    assert_eq!(
        bg,
        vec![Finding {
            path: "models/qwen3-4b.gguf".into(),
            problem: Problem::HashMismatch
        }]
    );

    let log = root.join("state/integrity.log");
    let all: Vec<Finding> = r.findings.into_iter().chain(bg).collect();
    let out = repair(&root, &m, &all, &objects, &log, "2026-10-05T12:00:00Z").unwrap();
    assert_eq!(out.restored.len(), 3);
    assert!(out.unrecoverable.is_empty());
    assert_eq!(
        fs::read_to_string(root.join("bin/ef-core.exe")).unwrap(),
        "binary"
    );
    assert_eq!(fs::read_to_string(log).unwrap().lines().count(), 3);
    let r = check_startup(&root, &m).unwrap();
    assert!(r.findings.is_empty());
}

#[test]
fn missing_recovery_object_is_reported_not_hidden() {
    let t = tempfile::tempdir().unwrap();
    let k = keys();
    let root = t.path().join("app");
    let (_, _) = install(&root, &t.path().join("store"), &k);
    let m = load_manifest(&root, &[&k.pub_b64]).unwrap();
    let empty = ObjectStore::open(t.path().join("empty-store")).unwrap();
    fs::remove_file(root.join("docs/manual.html")).unwrap();
    let r = check_startup(&root, &m).unwrap();
    let out = repair(&root, &m, &r.findings, &empty, &root.join("state/log"), "t").unwrap();
    assert_eq!(out.unrecoverable, vec!["docs/manual.html".to_string()]);
}

#[test]
fn signed_update_package_sec02_ss09() {
    let t = tempfile::tempdir().unwrap();
    let (k, other) = (keys(), keys());
    let pkg = t.path().join("catalogue-2026.10.efpkg");
    fs::write(&pkg, vec![7u8; 3 << 20]).unwrap();
    assert!(
        verify_signed_file(
            &pkg,
            &t.path().join("catalogue-2026.10.efpkg.minisig"),
            &[&k.pub_b64]
        )
        .is_err(),
        "unsigned"
    );
    sign(&other, &pkg);
    assert!(
        verify_signed_file(
            &pkg,
            &t.path().join("catalogue-2026.10.efpkg.minisig"),
            &[&k.pub_b64]
        )
        .is_err(),
        "wrong key"
    );
    sign(&k, &pkg);
    let tc = verify_signed_file(
        &pkg,
        &t.path().join("catalogue-2026.10.efpkg.minisig"),
        &[&k.pub_b64],
    )
    .unwrap();
    assert_eq!(tc, "embedforge test");
    let mut data = fs::read(&pkg).unwrap();
    data[12345] ^= 1;
    fs::write(&pkg, data).unwrap();
    assert!(
        verify_signed_file(
            &pkg,
            &t.path().join("catalogue-2026.10.efpkg.minisig"),
            &[&k.pub_b64]
        )
        .is_err(),
        "tampered"
    );
}
