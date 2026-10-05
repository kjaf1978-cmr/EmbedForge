use ef_cm::CiKind;
use ef_pack::*;
use semver::Version;
use std::fs;
use std::path::Path;

fn keypair() -> (minisign::KeyPair, String) {
    let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
    let pk = kp.pk.to_base64();
    (kp, pk)
}

fn sign(kp: &minisign::KeyPair, file: &Path) {
    let sig = minisign::sign(
        Some(&kp.pk),
        &kp.sk,
        std::io::Cursor::new(fs::read(file).unwrap()),
        Some("embedforge test"),
        None,
    )
    .unwrap();
    fs::write(format!("{}.minisig", file.display()), sig.to_string()).unwrap();
}

fn meta(ci: &str) -> PackedComponentMeta {
    PackedComponentMeta {
        ci: ci.into(),
        kind: CiKind::LlmModel,
        version: Version::new(1, 2, 0),
        title: "Test model".into(),
        optional: true,
        default_selected: false,
        consequence: "No second LLM profile".into(),
        applies_to: vec![],
    }
}

/// Pseudo-random, incompressible content so that the pack really spans several parts.
fn noise(n: usize, seed: u32) -> Vec<u8> {
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

fn component(dir: &Path) {
    fs::create_dir_all(dir.join("models/split")).unwrap();
    fs::create_dir_all(dir.join("empty")).unwrap();
    fs::write(
        dir.join("models/split/m-00001-of-00002.gguf"),
        noise(40_000, 7),
    )
    .unwrap();
    fs::write(
        dir.join("models/split/m-00002-of-00002.gguf"),
        noise(30_000, 9),
    )
    .unwrap();
    fs::write(dir.join("README.txt"), "weights licence: Apache-2.0").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::write(dir.join("run.sh"), "#!/bin/sh\n").unwrap();
        fs::set_permissions(dir.join("run.sh"), fs::Permissions::from_mode(0o755)).unwrap();
    }
}

fn index(components: Vec<PackedComponent>) -> Index {
    Index {
        format: INDEX_FORMAT.into(),
        kind: IndexKind::Install,
        app_version: Version::new(0, 1, 0),
        os: "ubuntu".into(),
        arch: "x86_64".into(),
        created: "2026-10-05T12:00:00Z".into(),
        requires_app: None,
        components,
        files: vec![],
        notices: vec![],
        unbundled_drivers: vec![],
    }
}

fn read_tree(dir: &Path) -> Vec<(String, Vec<u8>)> {
    let mut out = vec![];
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for e in fs::read_dir(&d).unwrap() {
            let p = e.unwrap().path();
            if p.is_dir() {
                stack.push(p);
            } else {
                let rel = p
                    .strip_prefix(dir)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                out.push((rel, fs::read(&p).unwrap()));
            }
        }
    }
    out.sort();
    out
}

#[test]
fn part_limit_is_1_9_gib() {
    assert_eq!(MAX_PART_BYTES, 2_040_109_465);
    const { assert!(MAX_PART_BYTES < 2 * (1 << 30)) }; // GitHub Releases asset limit (CM-10)
    const { assert!(MAX_PART_BYTES < 4 * (1u64 << 30) - 1) }; // FAT32 file limit
}

#[test]
fn component_spans_several_parts_and_round_trips_ss01() {
    let t = tempfile::tempdir().unwrap();
    let src = t.path().join("src");
    component(&src);
    let medium = t.path().join("medium");
    let opt = PackOptions {
        max_part_bytes: 16_000,
        zstd_level: 3,
    };
    let c = pack_component(&src, &medium, meta("llm-qwen3-8b"), opt).unwrap();
    assert!(
        c.parts.len() >= 4,
        "70 kB of noise in 16 kB parts: {} parts",
        c.parts.len()
    );
    assert!(c.parts.iter().all(|p| p.size <= 16_000));
    assert_eq!(c.parts[0].file, "packs/llm-qwen3-8b-1.2.0.efpack.001");
    assert!(c.parts.iter().all(|p| portable_path(&p.file)));
    let files = if cfg!(unix) { 4 } else { 3 };
    assert_eq!(c.file_count, files);

    let (kp, pk) = keypair();
    let idx = index(vec![c.clone()]);
    let ip = write_index(&medium, &idx).unwrap();
    sign(&kp, &ip);
    let loaded = load_index(&medium, MEDIUM_INDEX, &[&pk]).unwrap();
    assert_eq!(loaded, idx);
    let mut read = 0u64;
    assert!(verify_contents(&medium, &loaded, &["llm-qwen3-8b"], &mut |n| read += n).is_empty());
    assert_eq!(read, loaded.pack_bytes());

    let dest = t.path().join("out");
    extract_component(&medium, &c, &dest).unwrap();
    assert_eq!(read_tree(&src), read_tree(&dest));
    assert!(dest.join("empty").is_dir());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_ne!(
            fs::metadata(dest.join("run.sh"))
                .unwrap()
                .permissions()
                .mode()
                & 0o111,
            0
        );
        assert_eq!(
            fs::metadata(dest.join("README.txt"))
                .unwrap()
                .permissions()
                .mode()
                & 0o111,
            0
        );
    }
    // packs are deterministic: the same input gives the same parts
    let medium2 = t.path().join("medium2");
    let c2 = pack_component(&src, &medium2, meta("llm-qwen3-8b"), opt).unwrap();
    assert_eq!(c.parts, c2.parts);
}

#[test]
fn index_signature_and_part_hashes_are_enforced_sec02() {
    let t = tempfile::tempdir().unwrap();
    let src = t.path().join("src");
    component(&src);
    let medium = t.path().join("medium");
    let c = pack_component(
        &src,
        &medium,
        meta("pack-a"),
        PackOptions {
            max_part_bytes: 20_000,
            zstd_level: 1,
        },
    )
    .unwrap();
    let (kp, pk) = keypair();
    let (other, other_pk) = keypair();
    let ip = write_index(&medium, &index(vec![c.clone()])).unwrap();

    let err = load_index(&medium, MEDIUM_INDEX, &[&pk])
        .unwrap_err()
        .to_string();
    assert!(err.contains("unsigned"), "{err}");
    sign(&other, &ip);
    assert!(
        load_index(&medium, MEDIUM_INDEX, &[&pk]).is_err(),
        "wrong key"
    );
    sign(&kp, &ip);
    assert!(
        load_index(&medium, MEDIUM_INDEX, &[&other_pk, &pk]).is_ok(),
        "rotation: any trusted key"
    );
    assert!(
        load_index(&medium, UPDATE_INDEX, &[&pk]).is_err(),
        "kind must match the file name"
    );

    // tampered index
    let text = fs::read_to_string(&ip).unwrap();
    fs::write(&ip, text.replace("Test model", "Evil model")).unwrap();
    assert!(load_index(&medium, MEDIUM_INDEX, &[&pk]).is_err());
    fs::write(&ip, text).unwrap();

    // corrupted part: one flipped bit is found, and so is a missing part
    let idx = load_index(&medium, MEDIUM_INDEX, &[&pk]).unwrap();
    let p2 = medium.join(&c.parts[1].file);
    let mut b = fs::read(&p2).unwrap();
    b[100] ^= 1;
    fs::write(&p2, &b).unwrap();
    fs::remove_file(medium.join(&c.parts[2].file)).unwrap();
    let probs = verify_contents(&medium, &idx, &["pack-a"], &mut |_| {});
    assert_eq!(probs.len(), 2);
    assert!(probs[0].problem.contains("SHA-256"));
    assert!(probs[1].problem.contains("unreadable"));
}

#[test]
fn unsafe_or_oversized_streams_are_refused() {
    let t = tempfile::tempdir().unwrap();
    let medium = t.path().join("m");
    fs::create_dir_all(medium.join("packs")).unwrap();
    let write_pack = |name: &str, entries: &[(&str, tar::EntryType, &[u8])]| {
        let f = fs::File::create(medium.join("packs").join(name)).unwrap();
        let enc = zstd::Encoder::new(f, 1).unwrap();
        let mut b = tar::Builder::new(enc);
        for (path, ty, data) in entries {
            let mut h = tar::Header::new_gnu();
            h.set_entry_type(*ty);
            h.set_size(data.len() as u64);
            h.set_mode(0o644);
            if *ty == tar::EntryType::Symlink {
                h.set_link_name("/etc/passwd").unwrap();
            }
            // write the name bytes directly so that "../" survives
            h.as_old_mut().name[..path.len()].copy_from_slice(path.as_bytes());
            h.set_cksum();
            b.append(&h, *data).unwrap();
        }
        b.into_inner().unwrap().finish().unwrap();
        let (sha256, size) = ef_cm::objects::sha256_file(&medium.join("packs").join(name)).unwrap();
        PackedComponent {
            ci: "x".into(),
            kind: CiKind::CodeLibrary,
            version: Version::new(1, 0, 0),
            title: "x".into(),
            optional: false,
            default_selected: true,
            consequence: String::new(),
            applies_to: vec![],
            installed_size: 4,
            file_count: 1,
            parts: vec![Part {
                file: format!("packs/{name}"),
                size,
                sha256,
            }],
        }
    };
    let cases = [
        (
            "traversal.efpack.001",
            vec![("../evil", tar::EntryType::Regular, &b"evil"[..])],
            "unsafe path",
        ),
        (
            "abs.efpack.001",
            vec![("/tmp/evil", tar::EntryType::Regular, &b"evil"[..])],
            "unsafe path",
        ),
        (
            "link.efpack.001",
            vec![("ok-link", tar::EntryType::Symlink, &b""[..])],
            "not allowed",
        ),
        (
            "bomb.efpack.001",
            vec![("big", tar::EntryType::Regular, &[0u8; 64][..])],
            "beyond its declared size",
        ),
    ];
    for (i, (name, entries, expect)) in cases.into_iter().enumerate() {
        let c = write_pack(name, &entries);
        let err = extract_component(&medium, &c, &t.path().join(format!("out{i}")))
            .unwrap_err()
            .to_string();
        assert!(err.contains(expect), "{name}: {err}");
    }
    assert!(!t.path().join("evil").exists());
}

#[test]
fn names_must_be_portable_to_exfat_and_fat32() {
    assert!(portable_name("llm-qwen3-8b-1.2.0.efpack.001"));
    for bad in ["", ".hidden", "a b", "a:b", "ä", "con?", "x*"] {
        assert!(!portable_name(bad), "{bad:?}");
    }
    assert!(portable_path("packs/a.efpack.001"));
    assert!(!portable_path("packs/../a"));
    assert!(!portable_path("/abs"));
    let t = tempfile::tempdir().unwrap();
    fs::create_dir_all(t.path().join("s")).unwrap();
    let mut m = meta("Bad Name");
    assert!(pack_component(
        &t.path().join("s"),
        t.path(),
        m.clone(),
        PackOptions::default()
    )
    .is_err());
    m.ci = "ok".into();
    assert!(pack_component(
        &t.path().join("s"),
        t.path(),
        m,
        PackOptions {
            max_part_bytes: MAX_PART_BYTES + 1,
            zstd_level: 1
        }
    )
    .is_err());
}
