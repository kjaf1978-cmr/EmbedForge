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
