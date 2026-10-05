//! PERF-08 measurement aid (not a pass/fail gate): start-up pass over a synthetic install with
//! 1 GiB of start-up-tier files and 200 large deferred files. Run in release mode:
//! `cargo test --release -p ef-integrity --test perf -- --ignored --nocapture`.

use ef_cm::{ChangelogEntry, CiKind, CiVersion, RecoveryStore};
use ef_integrity::*;
use semver::Version;
use std::fs;
use std::io::Write;
use std::time::Instant;

#[test]
#[ignore]
fn perf08_startup_pass_throughput() {
    let t =
        tempfile::tempdir_in(std::env::var("EF_PERF_DIR").unwrap_or_else(|_| ".".into())).unwrap();
    let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
    let pk = kp.pk.to_base64();
    let staging = t.path().join("staging/big");
    fs::create_dir_all(staging.join("bin")).unwrap();
    fs::create_dir_all(staging.join("models")).unwrap();
    let mut x = 0x9e3779b9u32;
    let mut buf = vec![0u8; 1 << 20];
    for i in 0..64 {
        let mut f = fs::File::create(staging.join(format!("bin/tool{i}.so.1"))).unwrap();
        for _ in 0..16 {
            for b in buf.iter_mut() {
                x ^= x << 13;
                x ^= x >> 17;
                x ^= x << 5;
                *b = x as u8;
            }
            f.write_all(&buf).unwrap();
        }
    }
    for i in 0..200 {
        let f = fs::File::create(staging.join(format!("models/part{i}.gguf"))).unwrap();
        f.set_len(64 << 20).unwrap(); // sparse: the foreground pass reads metadata only
    }
    let v = Version::new(1, 0, 0);
    let cl = vec![ChangelogEntry {
        version: v.clone(),
        date: "2026-10-05".into(),
        text: "perf".into(),
    }];
    let m = build_component_manifest(
        &staging,
        &ComponentMeta {
            ci: "big".into(),
            kind: CiKind::Toolchain,
            version: v.clone(),
            title: "big".into(),
            optional: false,
            changelog: cl.clone(),
            depends: Default::default(),
        },
    )
    .unwrap();
    write_component_manifest(&staging, &m).unwrap();
    let sig = minisign::sign(
        Some(&kp.pk),
        &kp.sk,
        std::io::Cursor::new(fs::read(staging.join(COMPONENT_FILE)).unwrap()),
        None,
        None,
    )
    .unwrap();
    fs::write(staging.join(COMPONENT_SIG), sig.to_string()).unwrap();
    let root = t.path().join("root");
    let store = RecoveryStore::open(root.join("recovery")).unwrap();
    store
        .add_version(
            CiVersion {
                ci: "big".into(),
                kind: CiKind::Toolchain,
                version: v.clone(),
                changelog: cl,
                depends: Default::default(),
                files: vec![],
            },
            &staging,
        )
        .unwrap();
    store.activate("big", &v, &root).unwrap();
    for run in 1..=3 {
        let t0 = Instant::now();
        let o = startup_pass(&root, &store, &[&pk], "0.1.0", "t").unwrap();
        let s = t0.elapsed().as_secs_f64();
        assert!(o.report.findings.is_empty());
        println!("run {run}: {} start-up-tier files (1024 MiB) hashed, {} deferred checked by metadata: {s:.2} s → {:.0} MiB/s",
            o.report.checked_full, o.report.checked_quick, 1024.0 / s);
    }
}
