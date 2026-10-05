use ef_cm::*;
use semver::{Version, VersionReq};
use std::collections::BTreeMap;
use std::path::Path;

fn v(s: &str) -> Version {
    Version::parse(s).unwrap()
}

fn meta(ci: &str, ver: &str, deps: &[(&str, &str)]) -> CiVersion {
    CiVersion {
        ci: ci.into(),
        kind: CiKind::Toolchain,
        version: v(ver),
        changelog: vec![ChangelogEntry {
            version: v(ver),
            date: "2026-10-05".into(),
            text: format!("{ci} {ver}"),
        }],
        depends: deps
            .iter()
            .map(|(d, r)| (d.to_string(), VersionReq::parse(r).unwrap()))
            .collect(),
        files: vec![],
    }
}

fn src(dir: &Path, files: &[(&str, &str)]) -> std::path::PathBuf {
    let d = tempfile::Builder::new().tempdir_in(dir).unwrap().keep();
    for (p, c) in files {
        let fp = d.join(p);
        std::fs::create_dir_all(fp.parent().unwrap()).unwrap();
        std::fs::write(fp, c).unwrap();
    }
    d
}

fn read(p: &Path) -> String {
    std::fs::read_to_string(p).unwrap()
}

#[test]
fn versions_need_changelog_and_are_immutable() {
    let t = tempfile::tempdir().unwrap();
    let s = RecoveryStore::open(t.path().join("store")).unwrap();
    let mut m = meta("avr-gcc", "7.3.0", &[]);
    m.changelog.clear();
    assert!(s
        .add_version(m, &src(t.path(), &[("bin/gcc", "x")]))
        .unwrap_err()
        .to_string()
        .contains("CM-02"));
    s.add_version(
        meta("avr-gcc", "7.3.0", &[]),
        &src(t.path(), &[("bin/gcc", "x")]),
    )
    .unwrap();
    assert!(s
        .add_version(
            meta("avr-gcc", "7.3.0", &[]),
            &src(t.path(), &[("bin/gcc", "y")])
        )
        .is_err());
    assert!(s
        .add_version(meta("../evil", "1.0.0", &[]), &src(t.path(), &[("a", "b")]))
        .is_err());
}

#[test]
fn identical_files_are_stored_once() {
    let t = tempfile::tempdir().unwrap();
    let s = RecoveryStore::open(t.path().join("store")).unwrap();
    let a = s
        .add_version(
            meta("lib", "1.0.0", &[]),
            &src(t.path(), &[("big.bin", "same"), ("v", "1")]),
        )
        .unwrap();
    let b = s
        .add_version(
            meta("lib", "1.1.0", &[]),
            &src(t.path(), &[("big.bin", "same"), ("v", "2")]),
        )
        .unwrap();
    let sha = |m: &CiVersion| {
        m.files
            .iter()
            .find(|f| f.path == "big.bin")
            .unwrap()
            .sha256
            .clone()
    };
    assert_eq!(sha(&a), sha(&b));
    let n = walk_count(&t.path().join("store/objects"));
    assert_eq!(n, 3, "big.bin once + two version files");
}

fn walk_count(d: &Path) -> usize {
    std::fs::read_dir(d)
        .unwrap()
        .map(|e| {
            let p = e.unwrap().path();
            if p.is_dir() {
                walk_count(&p)
            } else {
                1
            }
        })
        .sum()
}

#[test]
fn downgrade_with_dependency_check_cm04() {
    let t = tempfile::tempdir().unwrap();
    let inst = t.path().join("app");
    let s = RecoveryStore::open(t.path().join("store")).unwrap();
    s.add_version(
        meta("core-avr", "1.8.6", &[]),
        &src(t.path(), &[("v", "1.8.6")]),
    )
    .unwrap();
    s.add_version(
        meta("core-avr", "1.8.8", &[]),
        &src(t.path(), &[("v", "1.8.8")]),
    )
    .unwrap();
    s.add_version(
        meta("board-uno", "2.0.0", &[("core-avr", ">=1.8.7")]),
        &src(t.path(), &[("def.json", "{}")]),
    )
    .unwrap();
    s.activate("core-avr", &v("1.8.8"), &inst).unwrap();
    s.activate("board-uno", &v("2.0.0"), &inst).unwrap();
    assert_eq!(read(&inst.join("core-avr/v")), "1.8.8");
    // the board definition needs core >= 1.8.7, so the downgrade is refused and nothing changes
    match s.downgrade("core-avr", &v("1.8.6"), &inst) {
        Err(CmError::Dependencies(d)) => assert_eq!(d[0].requires, "core-avr"),
        other => panic!("{other:?}"),
    }
    assert_eq!(read(&inst.join("core-avr/v")), "1.8.8");
    // an item without dependants downgrades
    s.add_version(meta("ruff", "0.16.8", &[]), &src(t.path(), &[("v", "a")]))
        .unwrap();
    s.add_version(meta("ruff", "0.16.9", &[]), &src(t.path(), &[("v", "b")]))
        .unwrap();
    s.activate("ruff", &v("0.16.9"), &inst).unwrap();
    s.downgrade("ruff", &v("0.16.8"), &inst).unwrap();
    assert_eq!(read(&inst.join("ruff/v")), "a");
    assert!(
        s.downgrade("ruff", &v("0.16.9"), &inst).is_err(),
        "not a downgrade"
    );
}

#[test]
fn baseline_restore_in_one_action_cm03() {
    let t = tempfile::tempdir().unwrap();
    let inst = t.path().join("app");
    let s = RecoveryStore::open(t.path().join("store")).unwrap();
    for ver in ["1.0.0", "2.0.0"] {
        s.add_version(meta("kicad", ver, &[]), &src(t.path(), &[("v", ver)]))
            .unwrap();
        s.add_version(meta("catalogue", ver, &[]), &src(t.path(), &[("v", ver)]))
            .unwrap();
    }
    s.activate("kicad", &v("1.0.0"), &inst).unwrap();
    s.activate("catalogue", &v("1.0.0"), &inst).unwrap();
    s.tag_baseline("B1", "2026-10-05").unwrap();
    s.activate("kicad", &v("2.0.0"), &inst).unwrap();
    s.activate("catalogue", &v("2.0.0"), &inst).unwrap();
    let changed = s.restore_baseline("B1", &inst).unwrap();
    assert_eq!(changed.len(), 2);
    assert_eq!(read(&inst.join("kicad/v")), "1.0.0");
    assert_eq!(read(&inst.join("catalogue/v")), "1.0.0");
    assert_eq!(s.active().unwrap()["kicad"], v("1.0.0"));
    assert!(
        s.tag_baseline("B1", "x").is_err(),
        "baseline names are unique"
    );
}

#[test]
fn retention_protects_pinned_and_asks_before_deleting_baselines_cm09() {
    let t = tempfile::tempdir().unwrap();
    let inst = t.path().join("app");
    let s = RecoveryStore::open(t.path().join("store")).unwrap();
    for ver in ["1.0.0", "1.1.0", "1.2.0", "1.3.0"] {
        s.add_version(meta("lib-dht", ver, &[]), &src(t.path(), &[("v", ver)]))
            .unwrap();
    }
    s.activate("lib-dht", &v("1.0.0"), &inst).unwrap();
    s.tag_baseline("OLD", "t").unwrap();
    s.activate("lib-dht", &v("1.3.0"), &inst).unwrap();
    let mut pins = BTreeMap::new();
    pins.insert("lib-dht".to_string(), v("1.1.0"));
    s.set_project_pins("acc02", pins).unwrap();

    let plan = s.plan_prune(1).unwrap();
    assert_eq!(
        plan.remove,
        vec![
            ("lib-dht".to_string(), v("1.0.0")),
            ("lib-dht".to_string(), v("1.2.0"))
        ]
    );
    assert!(plan
        .protected
        .iter()
        .any(|(_, ver, why)| *ver == v("1.1.0") && why.contains("acc02")));
    assert_eq!(plan.baselines_deleted, vec!["OLD".to_string()]);
    assert!(s.apply_prune(&plan, false).is_err(), "needs confirmation");
    let freed = s.apply_prune(&plan, true).unwrap();
    assert_eq!(freed, 2);
    assert_eq!(s.versions("lib-dht").unwrap(), vec![v("1.1.0"), v("1.3.0")]);
    assert!(s.baselines().unwrap().is_empty());

    s.remove_project_pins("acc02").unwrap();
    let plan2 = s.plan_prune(1).unwrap();
    assert_eq!(plan2.remove, vec![("lib-dht".to_string(), v("1.1.0"))]);
}

#[test]
fn stale_prune_plan_is_refused() {
    let t = tempfile::tempdir().unwrap();
    let s = RecoveryStore::open(t.path().join("store")).unwrap();
    for ver in ["1.0.0", "1.1.0"] {
        s.add_version(meta("x", ver, &[]), &src(t.path(), &[("v", ver)]))
            .unwrap();
    }
    let plan = s.plan_prune(1).unwrap();
    let mut pins = BTreeMap::new();
    pins.insert("x".to_string(), v("1.0.0"));
    s.set_project_pins("p", pins).unwrap();
    assert!(s
        .apply_prune(&plan, true)
        .unwrap_err()
        .to_string()
        .contains("plan again"));
}

#[test]
fn corrupted_object_is_never_restored() {
    let t = tempfile::tempdir().unwrap();
    let s = RecoveryStore::open(t.path().join("store")).unwrap();
    let m = s
        .add_version(meta("x", "1.0.0", &[]), &src(t.path(), &[("v", "good")]))
        .unwrap();
    std::fs::write(s.objects().path_of(&m.files[0].sha256), "bad").unwrap();
    assert!(s
        .activate("x", &v("1.0.0"), &t.path().join("app"))
        .unwrap_err()
        .to_string()
        .contains("corrupted"));
}

#[test]
fn project_repo_baselines_cm03_data01() {
    let t = tempfile::tempdir().unwrap();
    let dir = t.path().join("acc02");
    let r = ProjectRepo::create(&dir, "acc02", "uno").unwrap();
    assert_eq!(r.history_len().unwrap(), 1);
    r.tag_baseline("B1", "first baseline").unwrap();
    let req = dir.join("requirements.json");
    let mut doc: serde_json::Value = serde_json::from_str(&read(&req)).unwrap();
    doc["items"] =
        serde_json::json!([{"id": "R1", "text": "U shall be ON when A = B within 0.05 V."}]);
    ef_schema::write_json(&req, &doc).unwrap();
    assert!(r.is_dirty().unwrap());
    assert!(r.tag_baseline("B2", "x").is_err(), "dirty tree");
    r.commit_all("Add R1").unwrap();
    assert!(r.commit_all("nothing").unwrap().is_none());
    r.tag_baseline("B2", "with R1").unwrap();
    assert_eq!(r.baselines().unwrap(), vec!["B1", "B2"]);
    r.restore_baseline("B1").unwrap();
    assert!(!read(&req).contains("R1"));
    assert_eq!(
        r.history_len().unwrap(),
        3,
        "restore is a new commit; history kept"
    );
    r.restore_baseline("B2").unwrap();
    assert!(read(&req).contains("R1"));
    // invalid content is never committed
    std::fs::write(
        &req,
        "{\"schema\": \"ef.requirements@1.0\", \"items\": [{\"id\": \"R1\"}, {\"id\": \"R1\"}]}",
    )
    .unwrap();
    assert!(r.commit_all("bad").is_err());
}
