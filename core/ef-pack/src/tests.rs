use super::*;
use ef_integrity::{check_startup, repair, Problem};
use std::io::Cursor;

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
        Cursor::new(data),
        Some("embedforge test"),
        None,
    )
    .unwrap();
    fs::write(sig_path(file), sig.to_string()).unwrap();
}

fn spec(ci: &str, v: &str) -> PackSpec {
    PackSpec {
        ci: ci.into(),
        kind: CiKind::Toolchain,
        version: Version::parse(v).unwrap(),
        changelog: vec![ChangelogEntry {
            version: Version::parse(v).unwrap(),
            date: "2026-11-15".into(),
            text: format!("{ci} {v}"),
        }],
        depends: BTreeMap::new(),
        license: "MIT".into(),
    }
}

/// A component tree with a binary, a script, a schema and a large-ish deferred file.
fn component(dir: &Path, tag: &str) {
    fs::create_dir_all(dir.join("bin")).unwrap();
    fs::create_dir_all(dir.join("share/schemas")).unwrap();
    fs::write(dir.join("bin/tool.exe"), format!("binary {tag}")).unwrap();
    fs::write(dir.join("bin/run.sh"), format!("#!/bin/sh\necho {tag}\n")).unwrap();
    fs::write(dir.join("share/schemas/x.schema.json"), "{}\n").unwrap();
    // pseudo-random, poorly compressible, so small part limits really split the stream
    let mut x: u64 = 0x9e37_79b9_7f4a_7c15 ^ tag.len() as u64;
    let data: Vec<u8> = (0..200_000)
        .map(|_| {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            x as u8
        })
        .collect();
    fs::write(dir.join("share/model.bin"), data).unwrap();
}

/// Builds and signs a pack; returns the manifest path.
fn signed_pack(k: &Keys, work: &Path, ci: &str, v: &str, max: u64) -> PathBuf {
    let src = work.join(format!("src-{ci}-{v}"));
    component(&src, v);
    let (_, mp) = build_pack(&spec(ci, v), &src, &work.join("packs"), max, 3).unwrap();
    sign(k, &mp);
    mp
}

/// An install root with a signed (empty) app manifest, as the bootstrap leaves it.
fn install_root(k: &Keys, root: &Path) {
    fs::create_dir_all(root).unwrap();
    let m = ef_integrity::build_manifest(root, "0.1.0").unwrap();
    let mp = root.join("manifest.json");
    fs::write(&mp, serde_json::to_string_pretty(&m).unwrap()).unwrap();
    sign(k, &mp);
}

#[test]
fn pack_splits_into_parts_within_limit_ss01() {
    let k = keys();
    let d = tempfile::tempdir().unwrap();
    let mp = signed_pack(&k, d.path(), "avr-gcc", "7.3.0", 64 * 1024);
    let m = load_pack_manifest(&mp, &[&k.pub_b64]).unwrap();
    assert!(
        m.parts.len() >= 3,
        "200 kB of noise must span ≥ 3 × 64 KiB parts"
    );
    assert!(m.parts.iter().all(|p| p.size <= 64 * 1024));
    assert_eq!(m.files.len(), 4);
    let tier = |p: &str| m.files.iter().find(|f| f.path == p).unwrap().tier;
    assert_eq!(tier("bin/tool.exe"), Tier::Startup);
    assert_eq!(tier("share/schemas/x.schema.json"), Tier::Startup);
    assert_eq!(tier("share/model.bin"), Tier::Deferred);
    // the limit itself is SS-01's 1.9 GiB and cannot be raised
    assert_eq!(MAX_PART_BYTES, 2_040_109_465);
    assert!(build_pack(
        &spec("x", "1.0.0"),
        d.path(),
        &d.path().join("o"),
        MAX_PART_BYTES + 1,
        3
    )
    .is_err());
}

#[test]
fn pack_build_is_deterministic() {
    let d = tempfile::tempdir().unwrap();
    let src = d.path().join("src");
    component(&src, "1");
    let (a, _) = build_pack(&spec("c", "1.0.0"), &src, &d.path().join("a"), 50_000, 3).unwrap();
    let (b, _) = build_pack(&spec("c", "1.0.0"), &src, &d.path().join("b"), 50_000, 3).unwrap();
    assert_eq!(a.parts, b.parts);
}

#[test]
fn install_verifies_and_activates_offline() {
    let k = keys();
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("app");
    install_root(&k, &root);
    let store = RecoveryStore::open(root.join("recovery")).unwrap();
    let log = root.join("state/events.jsonl");
    let mp = signed_pack(&k, d.path(), "avr-gcc", "7.3.0", 64 * 1024);
    let o = install_pack(&mp, &[&k.pub_b64], &root, &store, &log, "t1").unwrap();
    assert_eq!(o.previous, None);
    let comp = root.join("components/avr-gcc");
    assert_eq!(
        fs::read_to_string(comp.join("bin/tool.exe")).unwrap(),
        "binary 7.3.0"
    );
    assert!(!root.join(".pack-staging-avr-gcc-7.3.0").exists());
    // the whole installation is covered by SS-08 and is clean
    let m = load_install_manifest(&root, &[&k.pub_b64], &store).unwrap();
    assert!(m
        .files
        .iter()
        .any(|f| f.path == "components/avr-gcc/share/model.bin"));
    let r = check_startup(&root, &m).unwrap();
    assert!(r.findings.is_empty(), "{:?}", r.findings);
    assert!(fs::read_to_string(&log).unwrap().contains("pack_installed"));
}

#[test]
fn unsigned_wrong_key_and_tampered_packs_are_rejected_sec02() {
    let k = keys();
    let other = keys();
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("app");
    install_root(&k, &root);
    let store = RecoveryStore::open(root.join("recovery")).unwrap();
    let log = root.join("state/events.jsonl");
    let mp = signed_pack(&k, d.path(), "py", "3.12.7", 64 * 1024);

    // wrong key
    let e = install_pack(&mp, &[&other.pub_b64], &root, &store, &log, "t").unwrap_err();
    assert!(e.to_string().contains("signature rejected"), "{e}");
    // tampered part
    let m = load_pack_manifest(&mp, &[&k.pub_b64]).unwrap();
    let part = d.path().join("packs").join(&m.parts[1].file);
    let mut b = fs::read(&part).unwrap();
    b[10] ^= 0xff;
    fs::write(&part, b).unwrap();
    let e = install_pack(&mp, &[&k.pub_b64], &root, &store, &log, "t").unwrap_err();
    assert!(e.to_string().contains("corrupted"), "{e}");
    // edited manifest (signature no longer matches)
    let mut t = fs::read_to_string(&mp).unwrap();
    t = t.replace("\"MIT\"", "\"MIT \"");
    fs::write(&mp, t).unwrap();
    assert!(install_pack(&mp, &[&k.pub_b64], &root, &store, &log, "t").is_err());
    // unsigned
    fs::remove_file(sig_path(&mp)).unwrap();
    let e = install_pack(&mp, &[&k.pub_b64], &root, &store, &log, "t").unwrap_err();
    assert!(e.to_string().contains("unsigned"), "{e}");

    assert!(
        store.active().unwrap().is_empty(),
        "nothing may be activated"
    );
    assert!(!root.join("components/py").exists());
    let events = fs::read_to_string(&log).unwrap();
    assert_eq!(events.matches("pack_rejected").count(), 4);
}

/// Hand-builds a signed pack whose payload differs from what a correct builder writes.
fn crafted(
    k: &Keys,
    dir: &Path,
    listed: &[(&str, &[u8])],
    payload: impl FnOnce(&mut tar::Builder<Vec<u8>>),
) -> PackManifest {
    fs::create_dir_all(dir).unwrap();
    let mut tb = tar::Builder::new(Vec::new());
    payload(&mut tb);
    let raw = tb.into_inner().unwrap();
    let z = zstd::encode_all(Cursor::new(raw), 3).unwrap();
    let part = dir.join("evil-1.0.0.part000.tar.zst");
    fs::write(&part, &z).unwrap();
    let (sha, size) = sha256_file(&part).unwrap();
    let files = listed
        .iter()
        .map(|(p, c)| {
            let f = dir.join("tmp-hash");
            fs::write(&f, c).unwrap();
            let (sha256, size) = sha256_file(&f).unwrap();
            ManifestEntry {
                path: (*p).into(),
                size,
                sha256,
                tier: Tier::Deferred,
            }
        })
        .collect();
    let s = spec("evil", "1.0.0");
    let m = PackManifest {
        format: PACK_FORMAT.into(),
        ci: s.ci,
        kind: s.kind,
        version: s.version,
        changelog: s.changelog,
        depends: s.depends,
        license: s.license,
        parts: vec![PartEntry {
            file: "evil-1.0.0.part000.tar.zst".into(),
            size,
            sha256: sha,
        }],
        files,
    };
    let mp = dir.join("evil-1.0.0.pack.json");
    write_pretty(&mp, &m).unwrap();
    sign(k, &mp);
    load_pack_manifest(&mp, &[&k.pub_b64]).unwrap()
}

fn add(tb: &mut tar::Builder<Vec<u8>>, path: &str, data: &[u8]) {
    let mut h = tar::Header::new_gnu();
    h.set_size(data.len() as u64);
    h.set_mode(0o644);
    h.set_entry_type(tar::EntryType::Regular);
    // set_path refuses "..", so write the name bytes directly to test the extractor's guard
    let name = &mut h.as_old_mut().name;
    name[..path.len()].copy_from_slice(path.as_bytes());
    h.set_cksum();
    tb.append(&h, data).unwrap();
}

#[test]
fn payload_must_match_signed_file_list_exactly() {
    let k = keys();
    let d = tempfile::tempdir().unwrap();
    // unlisted extra file
    let m = crafted(&k, &d.path().join("a"), &[("ok.txt", b"ok")], |tb| {
        add(tb, "ok.txt", b"ok");
        add(tb, "extra.dll", b"MZ");
    });
    let e = verify_and_extract(&m, &d.path().join("a"), &d.path().join("sa")).unwrap_err();
    assert!(e.to_string().contains("not listed"), "{e}");
    // path traversal
    let m = crafted(&k, &d.path().join("b"), &[("ok.txt", b"ok")], |tb| {
        add(tb, "../escape.txt", b"x");
    });
    let e = verify_and_extract(&m, &d.path().join("b"), &d.path().join("sb")).unwrap_err();
    assert!(e.to_string().contains("unsafe path"), "{e}");
    assert!(!d.path().join("escape.txt").exists());
    // symbolic link
    let m = crafted(&k, &d.path().join("c"), &[("ok.txt", b"ok")], |tb| {
        let mut h = tar::Header::new_gnu();
        h.set_entry_type(tar::EntryType::Symlink);
        h.set_size(0);
        tb.append_link(&mut h, "ok.txt", "/etc/passwd").unwrap();
    });
    let e = verify_and_extract(&m, &d.path().join("c"), &d.path().join("sc")).unwrap_err();
    assert!(e.to_string().contains("only regular files"), "{e}");
    // listed content differs from payload
    let m = crafted(&k, &d.path().join("e"), &[("ok.txt", b"ok")], |tb| {
        add(tb, "ok.txt", b"KO");
    });
    let e = verify_and_extract(&m, &d.path().join("e"), &d.path().join("se")).unwrap_err();
    assert!(e.to_string().contains("does not match"), "{e}");
    // listed file missing from payload
    let m = crafted(
        &k,
        &d.path().join("f"),
        &[("ok.txt", b"ok"), ("b.txt", b"b")],
        |tb| {
            add(tb, "ok.txt", b"ok");
        },
    );
    let e = verify_and_extract(&m, &d.path().join("f"), &d.path().join("sf")).unwrap_err();
    assert!(e.to_string().contains("missing from payload"), "{e}");
}

/// VAPP-05: offline update with a USB package, then rollback, with SS-08 clean after each.
#[test]
fn offline_update_and_rollback_vapp05() {
    let k = keys();
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("app");
    install_root(&k, &root);
    let store = RecoveryStore::open(root.join("recovery")).unwrap();
    let log = root.join("state/events.jsonl");
    let keys = [k.pub_b64.as_str()];
    let tool = root.join("components/arduino-cli/bin/tool.exe");
    let clean = || {
        let m = load_install_manifest(&root, &keys, &store).unwrap();
        check_startup(&root, &m).unwrap().findings.is_empty()
    };

    let v1 = signed_pack(
        &k,
        &d.path().join("usb1"),
        "arduino-cli",
        "1.0.4",
        MAX_PART_BYTES,
    );
    install_pack(&v1, &keys, &root, &store, &log, "t1").unwrap();
    assert_eq!(fs::read_to_string(&tool).unwrap(), "binary 1.0.4");
    assert!(clean());

    let v2 = signed_pack(
        &k,
        &d.path().join("usb2"),
        "arduino-cli",
        "1.1.0",
        MAX_PART_BYTES,
    );
    let o = install_pack(&v2, &keys, &root, &store, &log, "t2").unwrap();
    assert_eq!(o.previous, Some(Version::new(1, 0, 4)));
    assert_eq!(fs::read_to_string(&tool).unwrap(), "binary 1.1.0");
    assert!(clean());

    // the USB stick is gone; rollback uses only the recovery store
    fs::remove_dir_all(d.path().join("usb1")).unwrap();
    fs::remove_dir_all(d.path().join("usb2")).unwrap();
    rollback(
        "arduino-cli",
        &Version::new(1, 0, 4),
        &root,
        &store,
        &log,
        "t3",
    )
    .unwrap();
    assert_eq!(fs::read_to_string(&tool).unwrap(), "binary 1.0.4");
    assert!(clean());
    // rolling "back" to a later version is refused
    assert!(rollback(
        "arduino-cli",
        &Version::new(1, 1, 0),
        &root,
        &store,
        &log,
        "t4"
    )
    .is_err());
    let ev = fs::read_to_string(&log).unwrap();
    assert!(ev.contains("rolled_back") && ev.contains("rollback_refused"));
}

/// VAPP-04 at pack level: a deleted and a corrupted component file are found at start-up and
/// restored from the recovery store with no medium present.
#[test]
fn component_self_repair_vapp04() {
    let k = keys();
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("app");
    install_root(&k, &root);
    let store = RecoveryStore::open(root.join("recovery")).unwrap();
    let log = root.join("state/events.jsonl");
    let keys = [k.pub_b64.as_str()];
    let mp = signed_pack(&k, &d.path().join("usb"), "simavr", "1.7.0", MAX_PART_BYTES);
    install_pack(&mp, &keys, &root, &store, &log, "t1").unwrap();
    fs::remove_dir_all(d.path().join("usb")).unwrap();

    let comp = root.join("components/simavr");
    fs::remove_file(comp.join("bin/run.sh")).unwrap();
    fs::write(comp.join("bin/tool.exe"), "binary 1.7.X").unwrap(); // same size, other bytes
    let m = load_install_manifest(&root, &keys, &store).unwrap();
    let r = check_startup(&root, &m).unwrap();
    let probs: BTreeMap<_, _> = r
        .findings
        .iter()
        .map(|f| (f.path.as_str(), f.problem.clone()))
        .collect();
    assert_eq!(
        probs.get("components/simavr/bin/run.sh"),
        Some(&Problem::Missing)
    );
    assert_eq!(
        probs.get("components/simavr/bin/tool.exe"),
        Some(&Problem::HashMismatch)
    );
    let out = repair(&root, &m, &r.findings, store.objects(), &log, "t2").unwrap();
    assert_eq!(out.restored.len(), 2);
    assert!(check_startup(&root, &m).unwrap().findings.is_empty());
}

#[test]
fn installed_component_with_missing_manifest_is_not_trusted() {
    let k = keys();
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("app");
    install_root(&k, &root);
    let store = RecoveryStore::open(root.join("recovery")).unwrap();
    let log = root.join("state/events.jsonl");
    let mp = signed_pack(&k, d.path(), "gerbv", "2.10.0", MAX_PART_BYTES);
    install_pack(&mp, &[&k.pub_b64], &root, &store, &log, "t").unwrap();
    fs::remove_file(sig_path(
        &root.join("packs-installed/gerbv/2.10.0.pack.json"),
    ))
    .unwrap();
    assert!(load_install_manifest(&root, &[&k.pub_b64], &store).is_err());
}

#[test]
fn medium_index_is_signed_and_optional_packs_state_consequence_ss01() {
    let k = keys();
    let d = tempfile::tempdir().unwrap();
    let med = d.path().join("medium");
    let core = signed_pack(&k, &med, "python", "3.12.7", MAX_PART_BYTES);
    let opt = signed_pack(&k, &med, "pios-image", "2026.10.0", MAX_PART_BYTES);
    let entry = |p: &Path, ci: &str, v: &str, optional: bool, c: Option<&str>| MediumPack {
        manifest: p.file_name().unwrap().to_string_lossy().into_owned(),
        ci: ci.into(),
        version: Version::parse(v).unwrap(),
        installed_size: 1,
        optional,
        consequence: c.map(String::from),
    };
    let mut medium = Medium {
        format: MEDIUM_FORMAT.into(),
        app_version: "0.1.0".into(),
        host: HostOs::UbuntuX64,
        bootstrap: "embedforge-bootstrap_0.1.0_amd64.deb".into(),
        packs: vec![
            entry(&core, "python", "3.12.7", false, None),
            entry(&opt, "pios-image", "2026.10.0", true, None),
        ],
    };
    let mj = med.join("medium.json");
    let write = |m: &Medium| {
        write_pretty(&mj, m).unwrap();
        sign(&k, &mj);
    };
    write(&medium);
    let e = load_medium(&med, &[&k.pub_b64]).unwrap_err();
    assert!(e.to_string().contains("consequence"), "{e}");

    medium.packs[1].consequence =
        Some("Imaging a Raspberry Pi is unavailable; deployment to an already imaged Pi remains available.".into());
    write(&medium);
    let m = load_medium(&med, &[&k.pub_b64]).unwrap();
    assert_eq!(install_plan(&m, &[]).len(), 1);
    assert_eq!(install_plan(&m, &["pios-image"]).len(), 2);

    fs::remove_file(sig_path(&mj)).unwrap();
    assert!(load_medium(&med, &[&k.pub_b64]).is_err());
}
