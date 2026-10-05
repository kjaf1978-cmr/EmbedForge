mod common;

use common::*;
use ef_install::platform::Sys;
use ef_install::*;
use ef_pack::{FileRole, IndexKind, Notice};
use semver::Version;
use std::fs;
use std::path::Path;

fn host() -> HostId {
    HostId {
        os: "ubuntu".into(),
        arch: std::env::consts::ARCH.into(),
        release: "ubuntu-24.04".into(),
    }
}

fn medium_comps() -> Vec<Comp> {
    let mut llm = Comp::new(
        "llm-default",
        "1.0.0",
        vec![
            ("model-00001-of-00002.gguf", noise(60_000, 3)),
            ("model-00002-of-00002.gguf", noise(30_000, 5)),
        ],
    );
    llm.kind = ef_cm::CiKind::LlmModel;
    let mut docs = Comp::new(
        "kicad-3d-full",
        "10.0.6",
        vec![("3d/R.step", b"step".to_vec())],
    );
    docs.kind = ef_cm::CiKind::CadLibrary;
    docs.optional = true;
    docs.default_selected = false;
    let mut llm2 = Comp::new(
        "llm-second",
        "1.0.0",
        vec![("small.gguf", noise(5_000, 11))],
    );
    llm2.optional = true;
    let mut deps24 = Comp::new(
        "host-deps-ubuntu-24.04",
        "2026.10.0",
        vec![
            ("debs/libfoo1_1.2-3_amd64.deb", b"deb a".to_vec()),
            ("debs/libbar%3a2_2.0_amd64.deb", b"deb b".to_vec()),
        ],
    );
    deps24.applies_to = vec!["ubuntu-24.04".into()];
    let mut deps22 = Comp::new(
        "host-deps-ubuntu-22.04",
        "2026.10.0",
        vec![("debs/libfoo1_1.1_amd64.deb", b"deb c".to_vec())],
    );
    deps22.applies_to = vec!["ubuntu-22.04".into()];
    let mut tools = Comp::new(
        "toolchain-avr",
        "7.3.0",
        vec![("bin/avr-gcc", b"gcc".to_vec())],
    );
    tools.kind = ef_cm::CiKind::Toolchain;
    tools.depends = vec![("embedforge-app", ">=0.1.0")];
    vec![app("0.1.0", "v1"), llm, docs, llm2, deps24, deps22, tools]
}

struct Fixture {
    t: tempfile::TempDir,
    key: Key,
}

impl Fixture {
    fn new() -> Self {
        let t = tempfile::tempdir().unwrap();
        let key = key();
        build(
            t.path(),
            &t.path().join("medium"),
            &key,
            IndexKind::Install,
            &medium_comps(),
            |idx, out| {
                fs::create_dir_all(out.join("licences")).unwrap();
                fs::write(out.join("licences/terms.txt"), "Terms text").unwrap();
                fs::write(out.join("install.sh"), "#!/bin/sh\n").unwrap();
                idx.files
                    .push(ef_pack::medium_file(out, "install.sh", FileRole::Script).unwrap());
                idx.files.push(
                    ef_pack::medium_file(out, "licences/terms.txt", FileRole::Licence).unwrap(),
                );
                idx.notices.push(Notice {
                    id: "test-terms".into(),
                    title: "Test terms".into(),
                    text_file: "licences/terms.txt".into(),
                    must_accept: true,
                });
            },
        );
        Self { t, key }
    }
    fn medium(&self) -> std::path::PathBuf {
        self.t.path().join("medium")
    }
    fn target(&self) -> std::path::PathBuf {
        self.t.path().join("opt/embedforge")
    }
    fn options(&self, mode: Mode) -> Options {
        Options {
            medium: self.medium(),
            target: self.target(),
            mode,
            trusted_keys: vec![self.key.pk.clone()],
            with: vec![],
            without: vec![],
            accepted: vec!["test-terms".into()],
            host: host(),
            host_facts: Some(good_host()),
            allow_unsupported_host: false,
        }
    }
    fn install(&self, mode: Mode) -> (InstallReport, Sys) {
        let opt = self.options(mode);
        let plan = plan(&opt).unwrap();
        assert!(plan.blockers.is_empty(), "{:?}", plan.blockers);
        let mut sys = Sys::scratch(&self.t.path().join("sysroot"));
        let mut events = vec![];
        let r = install(&plan, &opt, &mut sys, &mut |e| {
            events.push(format!("{e:?}"))
        })
        .unwrap();
        assert!(events.iter().any(|e| e.starts_with("Verifying")));
        (r, sys)
    }
}

fn read(p: &Path) -> String {
    String::from_utf8_lossy(&fs::read(p).unwrap()).into_owned()
}

#[test]
fn plan_selects_packs_and_states_consequences_ss01() {
    let f = Fixture::new();
    let p = plan(&f.options(Mode::System)).unwrap();
    assert_eq!(
        p.selected,
        vec![
            "embedforge-app",
            "llm-default",
            "llm-second",
            "host-deps-ubuntu-24.04",
            "toolchain-avr"
        ]
    );
    assert_eq!(p.left_out.len(), 1);
    assert_eq!(p.left_out[0].ci, "kicad-3d-full");
    assert!(p.left_out[0].consequence.contains("missing"));
    assert_eq!(p.not_for_this_host, vec!["host-deps-ubuntu-22.04"]);
    assert!(
        p.missing_functions.is_empty(),
        "system install on Linux has every function"
    );
    assert!(p.blockers.is_empty());

    let mut o = f.options(Mode::System);
    o.with = vec!["kicad-3d-full".into()];
    o.without = vec!["llm-second".into()];
    let p = plan(&o).unwrap();
    assert!(p.selected.contains(&"kicad-3d-full".to_string()));
    assert!(!p.selected.contains(&"llm-second".to_string()));
}

#[test]
fn plan_blocks_with_reasons() {
    let f = Fixture::new();
    let mut o = f.options(Mode::System);
    o.accepted.clear();
    o.without = vec!["embedforge-app".into(), "nope".into()];
    o.host = HostId {
        os: "raspios".into(),
        arch: "aarch64".into(),
        release: "raspios-bookworm".into(),
    };
    let mut facts = good_host();
    facts.free_disk_gb = 0.0001;
    o.host_facts = Some(facts);
    let p = plan(&o).unwrap();
    let b = p.blockers.join("\n");
    for expect in [
        "this medium is for ubuntu",
        "unknown pack \"nope\"",
        "is required",
        "not enough free space",
        "Test terms",
    ] {
        assert!(b.contains(expect), "missing {expect:?} in\n{b}");
    }
    let opt = f.options(Mode::System);
    let mut sys = Sys::scratch(f.t.path());
    assert!(matches!(
        install(&p, &opt, &mut sys, &mut |_| {}),
        Err(InstallError::Blocked(_))
    ));
    assert!(!f.target().exists(), "nothing changed");
}

#[test]
fn per_user_installation_lists_missing_functions_ss05() {
    let f = Fixture::new();
    let p = plan(&f.options(Mode::PerUser)).unwrap();
    let m = p.missing_functions.join("\n");
    assert!(
        m.contains("SS-05(a)") && m.contains("SS-05(c)") && m.contains("dialout"),
        "{m}"
    );
    let pi = missing_functions(
        Mode::PerUser,
        &HostId {
            os: "raspios".into(),
            arch: "aarch64".into(),
            release: "raspios-bookworm".into(),
        },
    );
    assert!(pi.iter().any(|x| x.contains("HOST-07(b)")));
    let (r, sys) = f.install(Mode::PerUser);
    assert_eq!(r.record.mode, Mode::PerUser);
    assert!(
        sys.commands.is_empty(),
        "no root commands: {:?}",
        sys.commands
    );
    assert!(f
        .t
        .path()
        .join("sysroot/home/tester/.local/share/applications/org.embedforge.app.desktop")
        .exists());
    assert!(!f.t.path().join("sysroot/etc/udev").exists());
}

#[test]
fn system_install_verifies_stores_activates_and_integrates_ss01_ss04_ss05() {
    let f = Fixture::new();
    let (r, sys) = f.install(Mode::System);
    let target = f.target();
    assert_eq!(
        read(&target.join("embedforge-app/bin/embedforge")),
        "app binary v1"
    );
    assert!(target
        .join("llm-default/model-00002-of-00002.gguf")
        .exists());
    assert!(
        !target.join("host-deps-ubuntu-22.04").exists(),
        "other release's dependency set is not installed"
    );
    assert!(!target.join("kicad-3d-full").exists());
    assert!(!target.join(".staging").exists());
    // CM-09 recovery store and CM-03 baseline
    let store = ef_cm::RecoveryStore::open(target.join("recovery")).unwrap();
    assert_eq!(store.active().unwrap().len(), 5);
    assert_eq!(store.baselines().unwrap()[0].name, "install-0.1.0");
    // the start-up integrity check ran clean
    assert_eq!(r.startup.components, 5);
    assert!(r.startup.report.findings.is_empty());
    // host integration
    let sysroot = f.t.path().join("sysroot");
    assert!(read(&sysroot.join("etc/udev/rules.d/60-embedforge.rules")).contains("1a86"));
    let svc = read(&sysroot.join("etc/systemd/system/embedforge-helper.service"));
    assert!(svc.contains("embedforge-app/bin/embedforge-helper") && svc.contains("--install-root"));
    assert!(
        read(&sysroot.join("etc/systemd/system/embedforge-helper.socket"))
            .contains("/run/embedforge/helper.sock")
    );
    assert!(sysroot
        .join("usr/share/applications/org.embedforge.app.desktop")
        .exists());
    let cmds: Vec<String> = sys.commands.iter().map(|c| c.join(" ")).collect();
    let dpkg = cmds
        .iter()
        .find(|c| c.starts_with("dpkg -i"))
        .expect("dependency debs installed");
    assert!(dpkg.contains("libfoo1_1.2-3_amd64.deb") && dpkg.contains("libbar%3a2_2.0_amd64.deb"));
    assert!(cmds.contains(&"usermod -aG dialout tester".to_string()));
    assert!(cmds.contains(&"systemctl enable --now embedforge-helper.socket".to_string()));
    assert_eq!(r.record.system_files.len(), 4);
    assert_eq!(read_record(&target).unwrap().components.len(), 5);
    // re-running the installer over an existing installation is a repair-install, not an error
    f.install(Mode::System);
}

#[test]
fn damaged_medium_is_refused_before_anything_changes() {
    let f = Fixture::new();
    let idx = ef_pack::load_index(&f.medium(), ef_pack::MEDIUM_INDEX, &[&f.key.pk]).unwrap();
    let part = f
        .medium()
        .join(&idx.component("llm-default").unwrap().parts[1].file);
    let mut b = fs::read(&part).unwrap();
    b[10] ^= 0x40;
    fs::write(&part, b).unwrap();
    let opt = f.options(Mode::System);
    let p = plan(&opt).unwrap();
    let err = install(&p, &opt, &mut Sys::scratch(f.t.path()), &mut |_| {}).unwrap_err();
    assert!(matches!(err, InstallError::Damaged(_)), "{err}");
    assert!(!f.target().exists());
    // and an unsigned or foreign medium is refused at the plan step (SEC-02)
    let mut o = f.options(Mode::System);
    o.trusted_keys = vec![key().pk];
    assert!(plan(&o).is_err());
}

#[test]
fn self_repair_offline_vapp04_ss08() {
    let f = Fixture::new();
    f.install(Mode::System);
    let t = f.target();
    // corrupt an executable (same size), delete a model part, delete a whole component
    fs::write(t.join("embedforge-app/bin/embedforge"), "app binary XX").unwrap();
    fs::remove_file(t.join("llm-default/model-00001-of-00002.gguf")).unwrap();
    fs::remove_dir_all(t.join("toolchain-avr")).unwrap();
    // a tampered component manifest is treated as a broken component
    let m = t.join("llm-second/.ef-component.json");
    fs::write(&m, read(&m).replace("llm-second pack", "evil pack")).unwrap();

    let r = repair(&t, &[&f.key.pk]).unwrap();
    assert!(r.unrecoverable.is_empty(), "{:?}", r.unrecoverable);
    let mut restored = r.restored.clone();
    restored.sort();
    assert_eq!(
        restored,
        vec![
            "embedforge-app/bin/embedforge",
            "llm-default/model-00001-of-00002.gguf",
            "llm-second/",
            "toolchain-avr/"
        ]
    );
    assert_eq!(
        read(&t.join("embedforge-app/bin/embedforge")),
        "app binary v1"
    );
    assert!(t.join("toolchain-avr/bin/avr-gcc").exists());
    let log = read(&t.join("state/integrity.log"));
    assert_eq!(log.lines().count(), 4, "{log}");
    assert!(log.contains("component_restored") && log.contains("\"restored\""));
    // clean afterwards
    let r = repair(&t, &[&f.key.pk]).unwrap();
    assert!(
        r.restored.is_empty() && r.report.findings.is_empty() && r.component_problems.is_empty()
    );

    // a corrupted recovery object is never restored: reported instead
    let store = ef_cm::RecoveryStore::open(t.join("recovery")).unwrap();
    let rec = store.get("embedforge-app", &Version::new(0, 1, 0)).unwrap();
    let licence = rec
        .files
        .iter()
        .find(|x| x.path == "licences/LICENSE")
        .unwrap();
    fs::write(store.objects().path_of(&licence.sha256), "tampered").unwrap();
    fs::remove_file(t.join("embedforge-app/licences/LICENSE")).unwrap();
    let r = repair(&t, &[&f.key.pk]).unwrap();
    assert_eq!(r.unrecoverable, vec!["embedforge-app/licences/LICENSE"]);
}

#[test]
fn offline_update_and_rollback_from_usb_vapp05_ss09_cm04() {
    let f = Fixture::new();
    f.install(Mode::System);
    let t = f.target();
    let keys = [f.key.pk.as_str()];
    let pkg = f.t.path().join("usb/update-0.2.0");
    let mut llm = Comp::new(
        "llm-default",
        "1.1.0",
        vec![("model.gguf", noise(20_000, 17))],
    );
    llm.kind = ef_cm::CiKind::LlmModel;
    build(
        f.t.path(),
        &pkg,
        &f.key,
        IndexKind::Update,
        &[app("0.2.0", "v2"), llm],
        |idx, _| {
            idx.requires_app = Some(semver::VersionReq::parse(">=0.1.0, <0.2.0").unwrap());
        },
    );
    let r = update(&pkg, &t, &keys).unwrap();
    assert!(!r.rolled_back, "{}", r.message);
    assert_eq!(r.changes.len(), 2);
    assert_eq!(
        read(&t.join("embedforge-app/bin/embedforge")),
        "app binary v2"
    );
    assert!(
        t.join("llm-default/model.gguf").exists()
            && !t.join("llm-default/model-00001-of-00002.gguf").exists()
    );
    let log = read(&t.join("state/cm.log"));
    assert!(log.contains("update_applied"));
    // same package again: nothing to do; it no longer matches requires_app anyway
    assert!(update(&pkg, &t, &keys).is_err());

    // both versions are kept for an offline rollback (CM-09)
    let v = versions(&t).unwrap();
    let app_v = v.iter().find(|x| x.0 == "embedforge-app").unwrap();
    assert_eq!(app_v.1, vec![Version::new(0, 1, 0), Version::new(0, 2, 0)]);
    assert_eq!(app_v.2, Some(Version::new(0, 2, 0)));

    // CM-04 rollback with dependency check: toolchain-avr needs embedforge-app >= 0.1.0 → OK
    let c = rollback(&t, "embedforge-app", &Version::new(0, 1, 0), &keys).unwrap();
    assert_eq!((c.from.as_deref(), c.to.as_str()), (Some("0.2.0"), "0.1.0"));
    assert_eq!(
        read(&t.join("embedforge-app/bin/embedforge")),
        "app binary v1"
    );
    assert!(repair(&t, &keys).unwrap().report.findings.is_empty());
    assert!(
        rollback(&t, "embedforge-app", &Version::new(0, 2, 0), &keys).is_err(),
        "not earlier"
    );
    assert!(read(&t.join("state/cm.log")).contains("rollback"));
}

#[test]
fn update_refusals_change_nothing_sec02_cm04() {
    let f = Fixture::new();
    f.install(Mode::System);
    let t = f.target();
    let keys = [f.key.pk.as_str()];
    let before = fs::read(t.join("recovery/active.json")).unwrap();

    // unsigned
    let pkg = f.t.path().join("usb/unsigned");
    build(
        f.t.path(),
        &pkg,
        &f.key,
        IndexKind::Update,
        &[app("0.3.0", "x")],
        |_, _| {},
    );
    fs::remove_file(pkg.join("update.json.minisig")).unwrap();
    assert!(update(&pkg, &t, &keys)
        .unwrap_err()
        .to_string()
        .contains("unsigned"));
    // signed with another key
    let other = key();
    let pkg = f.t.path().join("usb/foreign");
    build(
        f.t.path(),
        &pkg,
        &other,
        IndexKind::Update,
        &[app("0.3.0", "x")],
        |_, _| {},
    );
    assert!(update(&pkg, &t, &keys).is_err());
    // dependency violation: toolchain needs an app the installation does not have
    let pkg = f.t.path().join("usb/deps");
    let mut tool = Comp::new(
        "toolchain-avr",
        "8.0.0",
        vec![("bin/avr-gcc", b"gcc 8".to_vec())],
    );
    tool.depends = vec![("embedforge-app", ">=0.5.0")];
    build(
        f.t.path(),
        &pkg,
        &f.key,
        IndexKind::Update,
        &[tool],
        |_, _| {},
    );
    assert!(matches!(
        update(&pkg, &t, &keys),
        Err(InstallError::Cm(ef_cm::CmError::Dependencies(_)))
    ));
    // an install medium is not an update package
    assert!(update(&f.medium(), &t, &keys).is_err());
    assert_eq!(fs::read(t.join("recovery/active.json")).unwrap(), before);
    assert_eq!(read(&t.join("toolchain-avr/bin/avr-gcc")), "gcc");
}

#[test]
fn uninstall_removes_exactly_what_was_installed() {
    let f = Fixture::new();
    f.install(Mode::System);
    let mut sys = Sys::scratch(&f.t.path().join("sysroot"));
    let w = uninstall(&f.target(), &mut sys).unwrap();
    assert!(w.iter().any(|x| x.contains("kept")));
    assert!(!f.target().exists());
    let s = f.t.path().join("sysroot");
    assert!(!s.join("etc/udev/rules.d/60-embedforge.rules").exists());
    assert!(!s
        .join("etc/systemd/system/embedforge-helper.service")
        .exists());
    assert!(sys
        .commands
        .iter()
        .any(|c| c.join(" ") == "systemctl disable --now embedforge-helper.socket"));
    // never deletes a folder that is not an installation
    let other = f.t.path().join("projects");
    fs::create_dir_all(&other).unwrap();
    fs::write(other.join("keep.txt"), "x").unwrap();
    assert!(uninstall(&other, &mut sys).is_err());
    assert!(other.join("keep.txt").exists());
}

#[test]
fn host_identity_from_os_release() {
    let u = HostId::from_os_release(
        "NAME=\"Ubuntu\"\nID=ubuntu\nVERSION_ID=\"24.04\"\nVERSION_CODENAME=noble\n",
        false,
        "x86_64",
    );
    assert_eq!(
        (u.os.as_str(), u.release.as_str()),
        ("ubuntu", "ubuntu-24.04")
    );
    let p = HostId::from_os_release(
        "ID=debian\nVERSION_ID=\"12\"\nVERSION_CODENAME=bookworm\n",
        true,
        "aarch64",
    );
    assert_eq!(
        (p.os.as_str(), p.release.as_str()),
        ("raspios", "raspios-bookworm")
    );
    let d = HostId::from_os_release("ID=debian\nVERSION_ID=\"12\"\n", false, "x86_64");
    assert_eq!(d.os, "other");
    assert_eq!(
        platform::deb_name_version("libbar%3a2_1%3a2.0-1_amd64.deb"),
        Some(("libbar%3a2".into(), "1:2.0-1".into()))
    );
}

#[cfg(unix)]
#[test]
fn audit_classifies_files_vapp03() {
    use ef_install::audit::{classify, Class};
    let app = Path::new("/opt/embedforge");
    let data = vec![std::path::PathBuf::from(
        "/home/u/.config/org.embedforge.app",
    )];
    assert_eq!(
        classify("/opt/embedforge/embedforge-app/bin/embedforge", app, &data),
        Class::AppDirectory
    );
    assert_eq!(
        classify("/opt/embedforge-other/x", app, &data),
        Class::Outside
    );
    assert_eq!(
        classify(
            "/usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.1.so.0",
            app,
            &data
        ),
        Class::OsStandard
    );
    assert_eq!(
        classify(
            "/home/u/.config/org.embedforge.app/ui-settings.json",
            app,
            &data
        ),
        Class::AppData
    );
    assert_eq!(classify("socket:[1234]", app, &data), Class::OsStandard);
    assert_eq!(
        classify("/usr/lib/python3.12/os.py", app, &data),
        Class::Outside,
        "system Python (SS-03)"
    );
    assert_eq!(classify("/usr/bin/python3", app, &data), Class::Outside);
    #[cfg(target_os = "linux")]
    {
        // the audit runs on a live process (this test binary): it is not in the app dir
        let a = ef_install::audit::audit(std::process::id(), app).unwrap();
        assert!(!a.files.is_empty());
        assert!(
            a.outside().iter().any(|f| f.contains("install-")),
            "the test binary itself is outside"
        );
    }
}

#[test]
fn diagnostics_section_a_reads_the_installed_components_diag01() {
    let f = Fixture::new();
    f.install(Mode::System);
    let t = f.target();
    let run = |full: bool| {
        ef_diag::run(&ef_diag::Context {
            app_version: "0.1.0".into(),
            install_root: t.clone(),
            trusted_keys: vec![f.key.pk.as_str()],
            recovery: ef_cm::ObjectStore::open(t.join("recovery")).ok(),
            host: good_host(),
            full,
            warn_free_gb: 20.0,
            fail_free_gb: 5.0,
        })
    };
    let r = run(true);
    assert_eq!(
        r.sections[0].status,
        ef_diag::Status::Pass,
        "{:?}",
        r.sections[0]
    );
    assert!(r.sections[0].details[0].contains("5 components"));
    fs::write(
        t.join("llm-default/model-00002-of-00002.gguf"),
        noise(30_000, 99),
    )
    .unwrap();
    assert_eq!(
        run(false).sections[0].status,
        ef_diag::Status::Pass,
        "same size: only the background pass sees it"
    );
    let r = run(true);
    assert_eq!(
        r.sections[0].status,
        ef_diag::Status::Fail,
        "full verification on demand finds it"
    );
    assert!(r.sections[0].remediation[0].contains("Repair"));
}

#[test]
fn baseline_restore_undoes_an_update_completely_cm03() {
    let f = Fixture::new();
    f.install(Mode::System);
    let t = f.target();
    let keys = [f.key.pk.as_str()];
    let pkg = f.t.path().join("usb/u");
    let mut fab = Comp::new("fab-profiles", "1.0.0", vec![("p.json", b"{}".to_vec())]);
    fab.depends = vec![("embedforge-app", ">=0.2.0")];
    build(
        f.t.path(),
        &pkg,
        &f.key,
        IndexKind::Update,
        &[app("0.2.0", "v2"), fab],
        |_, _| {},
    );
    update(&pkg, &t, &keys).unwrap();
    // a plain rollback of the app is refused: the new item depends on it (CM-04)
    let e = rollback(&t, "embedforge-app", &Version::new(0, 1, 0), &keys).unwrap_err();
    assert!(e.to_string().contains("fab-profiles"), "{e}");
    let names: Vec<String> = baselines(&t).unwrap().into_iter().map(|b| b.name).collect();
    assert_eq!(names, vec!["install-0.1.0"]);
    let changed = restore_baseline(&t, "install-0.1.0", &keys).unwrap();
    assert_eq!(changed.len(), 2);
    assert_eq!(
        read(&t.join("embedforge-app/bin/embedforge")),
        "app binary v1"
    );
    assert!(!t.join("fab-profiles").exists());
    assert!(repair(&t, &keys).unwrap().report.findings.is_empty());
}
