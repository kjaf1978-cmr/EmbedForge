use ef_cm::{ChangelogEntry, CiKind, CiVersion, RecoveryStore};
use ef_helper::*;
use ef_integrity::{
    build_component_manifest, write_component_manifest, ComponentMeta, COMPONENT_FILE,
};
use semver::Version;
use std::fs;
use std::path::{Path, PathBuf};

struct Install {
    _t: tempfile::TempDir,
    root: PathBuf,
    pk: String,
    deb: PathBuf,
}

type Files<'a> = Vec<(&'a str, Vec<u8>)>;

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

/// An installation whose app binary is a copy of `app_binary`.
fn install(app_binary: &Path) -> Install {
    let t = tempfile::tempdir().unwrap();
    let root = t.path().join("opt");
    let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
    let store = RecoveryStore::open(root.join("recovery")).unwrap();
    let staging = t.path().join("staging");
    let comps: [(&str, Files); 2] = [
        (
            "embedforge-app",
            vec![("bin/embedforge", fs::read(app_binary).unwrap())],
        ),
        (
            "host-deps-ubuntu-24.04",
            vec![("debs/libfoo_1.0_amd64.deb", b"allowed deb".to_vec())],
        ),
    ];
    let mut set = std::collections::BTreeMap::new();
    for (ci, files) in comps {
        let dir = staging.join(ci);
        for (p, d) in files {
            fs::create_dir_all(dir.join(p).parent().unwrap()).unwrap();
            fs::write(dir.join(p), d).unwrap();
        }
        let v = Version::new(0, 1, 0);
        let cl = vec![ChangelogEntry {
            version: v.clone(),
            date: "2026-10-05".into(),
            text: "t".into(),
        }];
        let m = build_component_manifest(
            &dir,
            &ComponentMeta {
                ci: ci.into(),
                kind: CiKind::Runtime,
                version: v.clone(),
                title: ci.into(),
                optional: false,
                changelog: cl.clone(),
                depends: Default::default(),
            },
        )
        .unwrap();
        write_component_manifest(&dir, &m).unwrap();
        sign(&kp, &dir.join(COMPONENT_FILE));
        store
            .add_version(
                CiVersion {
                    ci: ci.into(),
                    kind: CiKind::Runtime,
                    version: v.clone(),
                    changelog: cl,
                    depends: Default::default(),
                    files: vec![],
                },
                &dir,
            )
            .unwrap();
        set.insert(ci.to_string(), v);
    }
    store.activate_set(&set, &root).unwrap();
    let deb = root.join("host-deps-ubuntu-24.04/debs/libfoo_1.0_amd64.deb");
    Install {
        _t: t,
        root,
        pk: kp.pk.to_base64(),
        deb,
    }
}

fn disks() -> (Vec<BlockDev>, Vec<Use>) {
    let d = |n: &str, rem: bool, usb: bool, parts: &[&str]| BlockDev {
        name: n.into(),
        removable: rem,
        usb,
        partitions: parts.iter().map(|s| s.to_string()).collect(),
    };
    let u = |dev: &str, mp: &str| Use {
        dev: dev.into(),
        mount_point: mp.into(),
    };
    (
        vec![
            d("nvme0n1", false, false, &["nvme0n1p1", "nvme0n1p2"]),
            d("sda", true, true, &["sda1", "sda2"]),
            d("sdb", false, true, &["sdb1"]),
            d("mmcblk0", true, false, &["mmcblk0p1", "mmcblk0p2"]),
            d("sdc", false, false, &[]),
        ],
        vec![
            u("nvme0n1p2", "/"),
            u("nvme0n1p1", "/boot/efi"),
            u("sda1", "/media/u/STICK"),
            u("mmcblk0p2", "[swap]"),
            u("sdb1", "/srv/data"),
        ],
    )
}

fn ctx(i: &Install, app_exe: PathBuf, log: &Path) -> Context {
    Context {
        install_root: i.root.clone(),
        trusted_keys: vec![i.pk.clone()],
        log: log.into(),
        app_exe,
        app_exe_rel: "bin/embedforge".into(),
        is_pi5: false,
        devices: Box::new(disks),
    }
}

#[test]
fn boot_medium_guard_ss05a() {
    let (devs, uses) = disks();
    let g = |d: &str| guard_device(d, &devs, &uses, &["/opt/embedforge".into()]);
    assert!(
        g("/dev/sda").is_ok(),
        "removable USB stick mounted under /media"
    );
    assert!(g("/dev/sdb").is_ok(), "USB disk with a data partition only");
    for (dev, why) in [
        ("/dev/nvme0n1", "not a removable"),
        ("/dev/sda1", "partition"),
        ("/dev/mmcblk0", "[swap]"),
        ("/dev/sdc", "not a removable"),
        ("/dev/sdz", "not a known"),
        ("sda", "not a /dev path"),
        ("/dev/disk/by-id/x", "whole-disk"),
    ] {
        let e = g(dev).unwrap_err();
        assert!(e.contains(why), "{dev}: {e}");
    }
    // a removable disk holding the root file system (Pi booted from SD) is protected
    let mut uses2 = uses.clone();
    uses2.push(Use {
        dev: "sda2".into(),
        mount_point: "/".into(),
    });
    assert!(guard_device("/dev/sda", &devs, &uses2, &[])
        .unwrap_err()
        .contains("own system"));
    // ... and so is the disk holding the install root
    let mut uses3 = uses.clone();
    uses3.push(Use {
        dev: "sda2".into(),
        mount_point: "/media/u/APP".into(),
    });
    assert!(guard_device(
        "/dev/sda",
        &devs,
        &uses3,
        &["/media/u/APP/embedforge".into()]
    )
    .is_err());
}

#[test]
fn requests_are_a_closed_set_ss05() {
    let ok = r#"{"id":1,"request":{"op":"install_debs","files":["/x.deb"]}}"#;
    assert!(serde_json::from_str::<Envelope>(ok).is_ok());
    for bad in [
        r#"{"id":1,"request":{"op":"run_command","cmd":"rm -rf /"}}"#,
        r#"{"id":1,"request":{"op":"install_debs","files":[],"also":"x"}}"#,
        r#"{"id":1,"request":{"op":"project_service","action":"exec"}}"#,
        r#"{"id":1,"extra":true,"request":{"op":"install_debs","files":[]}}"#,
    ] {
        assert!(serde_json::from_str::<Envelope>(bad).is_err(), "{bad}");
    }
}

#[test]
fn caller_check_allowlist_and_log() {
    let me = std::env::current_exe().unwrap();
    let i = install(&me);
    let log = i.root.join("helper.log");
    // the "installed app" for this test is this test binary
    let c = ctx(&i, me.clone(), &log);
    let peer = Peer {
        pid: std::process::id() as i32,
        uid: 1000,
        exe: fs::canonicalize(&me).unwrap(),
    };
    let line = |id: u64, req: &str| format!(r#"{{"id":{id},"request":{req}}}"#);

    let allowed = format!(r#"{{"op":"install_debs","files":["{}"]}}"#, i.deb.display());
    let r = handle_line(&c, &peer, &me, &line(1, &allowed));
    assert_eq!(r.decision, Decision::Validated, "{}", r.message);
    assert!(
        r.message.contains("Increment 2"),
        "the action itself is not performed yet"
    );

    let foreign = i.root.join("foreign.deb");
    fs::write(&foreign, "not from the signed set").unwrap();
    let r = handle_line(
        &c,
        &peer,
        &me,
        &line(
            2,
            &format!(
                r#"{{"op":"install_debs","files":["{}"]}}"#,
                foreign.display()
            ),
        ),
    );
    assert_eq!(r.decision, Decision::Rejected);
    assert!(r
        .message
        .contains("not in the signed offline dependency set"));

    let r = handle_line(
        &c,
        &peer,
        &me,
        &line(3, r#"{"op":"project_service","action":"start"}"#),
    );
    assert!(r.message.contains("Pi 5"), "{}", r.message);

    let img = i.root.join("pi.img");
    fs::write(&img, "image").unwrap();
    let sha = ef_cm::objects::sha256_file(&img).unwrap().0;
    let write = |dev: &str, sha: &str| {
        line(
            4,
            &format!(
                r#"{{"op":"write_image","device":"{dev}","image":"{}","image_sha256":"{sha}","first_boot":{{"user-data":"x"}}}}"#,
                img.display()
            ),
        )
    };
    assert_eq!(
        handle_line(&c, &peer, &me, &write("/dev/sda", &sha)).decision,
        Decision::Validated
    );
    assert!(handle_line(&c, &peer, &me, &write("/dev/nvme0n1", &sha))
        .message
        .contains("not a removable"));
    assert!(
        handle_line(&c, &peer, &me, &write("/dev/sda", &"0".repeat(64)))
            .message
            .contains("SHA-256")
    );

    // another program is refused, whatever it asks
    let other = Peer {
        exe: PathBuf::from("/usr/bin/python3"),
        ..peer.clone()
    };
    let r = handle_line(&c, &other, &me, &line(5, &allowed));
    assert!(
        r.message.contains("not the EmbedForge app"),
        "{}",
        r.message
    );
    // the right path but a different binary (replaced after signing) is refused
    let c2 = ctx(&i, me.clone(), &log);
    let fake = i.root.join("fake");
    fs::write(&fake, "other binary").unwrap();
    let r = handle_line(&c2, &peer, &fake, &line(6, &allowed));
    assert!(
        r.message.contains("does not match its signed manifest"),
        "{}",
        r.message
    );
    // malformed
    assert!(handle_line(&c, &peer, &me, "{not json")
        .message
        .contains("malformed"));

    let text = fs::read_to_string(&log).unwrap();
    assert_eq!(text.lines().count(), 9, "every request is logged:\n{text}");
    assert!(text.contains("\"decision\":\"rejected\"") && text.contains("/usr/bin/python3"));
}

#[cfg(target_os = "linux")]
#[test]
fn unix_socket_identifies_the_caller_by_so_peercred() {
    use std::io::{BufRead, BufReader, Write};
    use std::os::unix::net::UnixStream;
    let me = std::env::current_exe().unwrap();
    let i = install(&me);
    let sock = i.root.join("run/helper.sock");
    let log = i.root.join("helper.log");
    let l = server::listener(&sock).unwrap();
    let c = ctx(&i, me.clone(), &log);
    let deb = i.deb.clone();
    let srv = std::thread::spawn(move || {
        let n = std::sync::atomic::AtomicUsize::new(0);
        server::run(&c, &l, &|| {
            n.fetch_add(1, std::sync::atomic::Ordering::SeqCst) >= 1
        })
        .unwrap();
    });
    for _ in 0..2 {
        let mut s = UnixStream::connect(&sock).unwrap();
        writeln!(
            s,
            r#"{{"id":7,"request":{{"op":"install_debs","files":["{}"]}}}}"#,
            deb.display()
        )
        .unwrap();
        let mut resp = String::new();
        BufReader::new(&s).read_line(&mut resp).unwrap();
        let r: Response = serde_json::from_str(&resp).unwrap();
        assert_eq!(r.id, Some(7));
        assert_eq!(r.decision, Decision::Validated, "{}", r.message);
    }
    srv.join().unwrap();
    let text = fs::read_to_string(&log).unwrap();
    assert!(
        text.contains(&format!("\"pid\":{}", std::process::id())),
        "the kernel-reported caller is logged"
    );
}
