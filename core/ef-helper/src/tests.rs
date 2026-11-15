use super::*;

struct Fx {
    _d: tempfile::TempDir,
    policy: Policy,
    caller: Caller,
    log: PathBuf,
}

fn fx() -> Fx {
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("app");
    fs::create_dir_all(root.join("components/pios-image")).unwrap();
    fs::create_dir_all(root.join("deps")).unwrap();
    let exe = root.join("embedforge");
    fs::write(&exe, b"the signed app").unwrap();
    fs::write(root.join("components/pios-image/pios.img"), vec![0u8; 4096]).unwrap();
    fs::write(root.join("deps/libfoo_1.0_arm64.deb"), b"deb foo").unwrap();
    fs::write(
        root.join("deps/libbar_1.0_arm64.deb"),
        b"deb bar (not allowlisted)",
    )
    .unwrap();
    let h = |p: &Path| sha256_file(p).unwrap().0;
    let policy = Policy {
        app_exe: exe.clone(),
        app_exe_sha256: h(&exe),
        app_version: "0.1.0".into(),
        depset: Some(DepSet {
            format: DEPSET_FORMAT.into(),
            app_version: "0.1.0".into(),
            debs: vec![DepEntry {
                file: "libfoo_1.0_arm64.deb".into(),
                sha256: h(&root.join("deps/libfoo_1.0_arm64.deb")),
            }],
        }),
        devices: vec![
            BlockDevice {
                path: "/dev/nvme0n1".into(),
                removable: false,
                system_disk: true,
                mountpoints: vec!["/".into(), "/boot/efi".into()],
                size_bytes: 1 << 40,
            },
            BlockDevice {
                path: "/dev/sdb".into(),
                removable: true,
                system_disk: false,
                mountpoints: vec!["/media/u/SD".into()],
                size_bytes: 32 << 30,
            },
            // a removable USB disk the system booted from (Pi 5 booting from USB)
            BlockDevice {
                path: "/dev/sda".into(),
                removable: true,
                system_disk: false,
                mountpoints: vec!["/boot/firmware".into(), "/".into()],
                size_bytes: 64 << 30,
            },
            BlockDevice {
                path: "/dev/sdc".into(),
                removable: false,
                system_disk: false,
                mountpoints: vec![],
                size_bytes: 1 << 40,
            },
            BlockDevice {
                path: "/dev/sdd".into(),
                removable: true,
                system_disk: false,
                mountpoints: vec![],
                size_bytes: 1024,
            },
        ],
        install_root: root.clone(),
        install_manifest: None,
    };
    Fx {
        log: root.join("state/helper.jsonl"),
        caller: Caller { exe_path: exe },
        policy,
        _d: d,
    }
}

fn refused(d: &Decision, needle: &str) {
    match d {
        Decision::Refused { reason } => assert!(reason.contains(needle), "{reason}"),
        x => panic!("expected refusal containing {needle:?}, got {x:?}"),
    }
}

fn img(device: &str) -> Request {
    Request::WriteImage {
        device: device.into(),
        image: "pios-image/pios.img".into(),
        first_boot_files: BTreeMap::new(),
    }
}

#[test]
fn boot_medium_guard_ss05a() {
    let f = fx();
    let p = &f.policy;
    refused(
        &p.check(&f.caller, &img("/dev/nvme0n1")),
        "system/boot disk",
    );
    refused(&p.check(&f.caller, &img("/dev/sda")), "system mount point");
    refused(&p.check(&f.caller, &img("/dev/sdc")), "not a removable");
    refused(&p.check(&f.caller, &img("/dev/sdz")), "not a detected");
    refused(&p.check(&f.caller, &img("/dev/sdd")), "larger than");
    assert!(matches!(
        p.check(&f.caller, &img("/dev/sdb")),
        Decision::Planned { .. }
    ));
    // image must be an installed component file
    let r = Request::WriteImage {
        device: "/dev/sdb".into(),
        image: "../../etc/shadow".into(),
        first_boot_files: BTreeMap::new(),
    };
    refused(&p.check(&f.caller, &r), "not an installed component");
    // only the known first-boot files
    let mut fb = BTreeMap::new();
    fb.insert("authorized_keys".to_string(), "x".to_string());
    let r = Request::WriteImage {
        device: "/dev/sdb".into(),
        image: "pios-image/pios.img".into(),
        first_boot_files: fb,
    };
    refused(&p.check(&f.caller, &r), "not allowed");
}

#[test]
fn single_project_service_only_ss05b() {
    let f = fx();
    let ok = Request::Service {
        action: ServiceAction::Start,
        project_id: "acc-02".into(),
    };
    match f.policy.check(&f.caller, &ok) {
        Decision::Planned { operation } => {
            assert_eq!(operation, ["service", "start", SERVICE_NAME, "acc-02"])
        }
        x => panic!("{x:?}"),
    }
    let bad = Request::Service {
        action: ServiceAction::Install,
        project_id: "x; rm -rf /".into(),
    };
    refused(&f.policy.check(&f.caller, &bad), "invalid project id");
    // unknown operations do not even parse
    assert!(serde_json::from_str::<Request>(r#"{"op":"run_shell","cmd":"id"}"#).is_err());
}

#[test]
fn debs_only_from_signed_dependency_set_ss05c() {
    let mut f = fx();
    let r = |v: &[&str]| Request::InstallDebs {
        debs: v.iter().map(|s| s.to_string()).collect(),
    };
    assert!(matches!(
        f.policy.check(&f.caller, &r(&["libfoo_1.0_arm64.deb"])),
        Decision::Planned { .. }
    ));
    refused(
        &f.policy.check(&f.caller, &r(&["libbar_1.0_arm64.deb"])),
        "not in the offline dependency set",
    );
    refused(
        &f.policy.check(&f.caller, &r(&["../x.deb"])),
        "invalid package file name",
    );
    refused(&f.policy.check(&f.caller, &r(&[])), "no packages");
    // a modified file with an allowlisted name is refused
    fs::write(
        f.policy.install_root.join("deps/libfoo_1.0_arm64.deb"),
        b"deb evil",
    )
    .unwrap();
    refused(
        &f.policy.check(&f.caller, &r(&["libfoo_1.0_arm64.deb"])),
        "allowlisted hash",
    );
    // a dependency set of another version is refused
    f.policy.depset.as_mut().unwrap().app_version = "0.0.9".into();
    refused(
        &f.policy.check(&f.caller, &r(&["libfoo_1.0_arm64.deb"])),
        "running version",
    );
}

#[test]
fn only_the_signed_app_may_call_and_every_request_is_logged() {
    let f = fx();
    let ok = Request::Service {
        action: ServiceAction::Stop,
        project_id: "p1".into(),
    };
    // another executable
    let other = f.policy.install_root.join("other");
    fs::write(&other, b"the signed app").unwrap();
    let d = handle(&f.policy, &Caller { exe_path: other }, &ok, &f.log, "t1").unwrap();
    refused(&d, "not the installed EmbedForge executable");
    // the app binary, modified after installation
    fs::write(&f.policy.app_exe, b"patched").unwrap();
    let d = handle(&f.policy, &f.caller, &ok, &f.log, "t2").unwrap();
    refused(&d, "does not match the signed manifest");
    let log = fs::read_to_string(&f.log).unwrap();
    assert_eq!(log.lines().count(), 2);
    assert!(log.lines().all(|l| l.contains("\"refused\"")));
}

/// Installation with app files and a component, their copies in the recovery store, and the
/// manifest the helper verified at start.
fn with_installation(f: &mut Fx) -> PathBuf {
    let root = f.policy.install_root.clone();
    fs::create_dir_all(root.join("components/avr-gcc/bin")).unwrap();
    fs::write(root.join("components/avr-gcc/bin/avr-gcc.exe"), b"gcc 7.3").unwrap();
    fs::write(root.join("LICENSE.txt"), b"GPL").unwrap();
    let store = ef_cm::ObjectStore::open(root.join("recovery")).unwrap();
    let mut m = ef_integrity::build_manifest(&root, "0.1.0").unwrap();
    // the component is listed through its pack manifest in reality; here directly
    let rel = "components/avr-gcc/bin/avr-gcc.exe";
    let (sha256, size) = sha256_file(&root.join(rel)).unwrap();
    m.files.push(ef_integrity::ManifestEntry {
        path: rel.into(),
        size,
        sha256,
        tier: ef_integrity::Tier::Startup,
    });
    for e in &m.files {
        store.put(&root.join(&e.path)).unwrap();
    }
    f.policy.install_manifest = Some(m);
    root
}

#[test]
fn restore_only_signed_paths_that_really_fail_ss05d() {
    let mut f = fx();
    let root = with_installation(&mut f);
    let req = |v: &[&str]| Request::RestoreFiles {
        paths: v.iter().map(|s| s.to_string()).collect(),
    };
    // nothing is damaged: refused (the caller's claim is not trusted)
    refused(
        &f.policy.check(&f.caller, &req(&["LICENSE.txt"])),
        "fails the integrity check",
    );
    // outside the signed manifests: refused, whatever it is
    refused(
        &f.policy.check(&f.caller, &req(&["../../etc/shadow"])),
        "not listed",
    );
    refused(
        &f.policy.check(&f.caller, &req(&["state/helper.jsonl"])),
        "not listed",
    );
    refused(&f.policy.check(&f.caller, &req(&[])), "no files requested");
    // damaged: planned, only the failing file
    fs::write(root.join("components/avr-gcc/bin/avr-gcc.exe"), b"GCC 7.3").unwrap();
    match f.policy.check(
        &f.caller,
        &req(&["LICENSE.txt", "components/avr-gcc/bin/avr-gcc.exe"]),
    ) {
        Decision::Planned { operation } => {
            assert_eq!(operation, ["restore", "components/avr-gcc/bin/avr-gcc.exe"])
        }
        x => panic!("{x:?}"),
    }
    // without verified manifests nothing can be restored
    f.policy.install_manifest = None;
    refused(
        &f.policy.check(&f.caller, &req(&["LICENSE.txt"])),
        "could not be verified",
    );
}

#[test]
fn restore_executes_from_the_local_store_and_logs_ss05d() {
    let mut f = fx();
    let root = with_installation(&mut f);
    let paths = vec![
        "LICENSE.txt".to_string(),
        "components/avr-gcc/bin/avr-gcc.exe".to_string(),
    ];
    fs::write(root.join("LICENSE.txt"), b"XXX").unwrap();
    fs::remove_file(root.join("components/avr-gcc/bin/avr-gcc.exe")).unwrap();
    let out = execute_restore(&f.policy, &f.caller, &paths, &f.log, "t")
        .unwrap()
        .unwrap();
    assert_eq!(out.restored.len(), 2);
    assert_eq!(fs::read(root.join("LICENSE.txt")).unwrap(), b"GPL");
    assert_eq!(
        fs::read(root.join("components/avr-gcc/bin/avr-gcc.exe")).unwrap(),
        b"gcc 7.3"
    );
    let log = fs::read_to_string(&f.log).unwrap();
    assert!(
        log.contains("\"restore_files\"") && log.matches("\"restored\"").count() == 2,
        "{log}"
    );

    // a corrupted recovery object is never put in place
    let sha = sha256_file(&root.join("LICENSE.txt")).unwrap().0;
    let obj = ef_cm::ObjectStore::open(root.join("recovery"))
        .unwrap()
        .path_of(&sha);
    fs::write(&obj, b"BAD").unwrap();
    fs::write(root.join("LICENSE.txt"), b"YYY").unwrap();
    let out = execute_restore(&f.policy, &f.caller, &paths[..1], &f.log, "t2")
        .unwrap()
        .unwrap();
    assert_eq!(out.unrecoverable, ["LICENSE.txt"]);
    assert_eq!(fs::read(root.join("LICENSE.txt")).unwrap(), b"YYY");

    // another caller is refused before anything is touched
    let other = Caller {
        exe_path: root.join("deps/libfoo_1.0_arm64.deb"),
    };
    let r = execute_restore(&f.policy, &other, &paths[..1], &f.log, "t3").unwrap();
    assert!(r
        .unwrap_err()
        .contains("not the installed EmbedForge executable"));
}
