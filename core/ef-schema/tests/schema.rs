use ef_schema::*;
use serde_json::{json, Value};
use std::path::Path;

fn rd(p: &Path) -> Value {
    serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap()
}

#[test]
fn new_project_is_valid_and_portable() {
    let d = tempfile::tempdir().unwrap();
    create_project(d.path(), "acc02", "uno").unwrap();
    assert!(validate_project(d.path()).unwrap().is_empty());
    for f in PROJECT_FILES
        .iter()
        .filter(|f| d.path().join(f.path).exists())
    {
        assert!(
            find_host_specific(f.path, &rd(&d.path().join(f.path))).is_empty(),
            "{}",
            f.path
        );
    }
    // deterministic output: keys sorted, trailing newline (DATA-01 small diffs)
    let text = std::fs::read_to_string(d.path().join("project.json")).unwrap();
    assert!(text.ends_with('\n'));
    assert!(text.find("\"board_outline\"").unwrap() < text.find("\"name\"").unwrap());
}

#[test]
fn netlist_rules() {
    let d = tempfile::tempdir().unwrap();
    create_project(d.path(), "p", "uno").unwrap();
    let nl = d.path().join("netlist.json");
    write_json(
        &nl,
        &json!({"schema": "ef.netlist@1.0", "parts": [{"ref": "R1"}],
        "nets": [{"name": "N1", "pins": ["R1.1", "U9.3"]}]}),
    )
    .unwrap();
    assert!(validate_project(d.path())
        .unwrap_err()
        .to_string()
        .contains("unknown part \"U9\""));
    write_json(
        &nl,
        &json!({"schema": "ef.netlist@1.0", "parts": [{"ref": "R1"}],
        "nets": [{"name": "N1", "pins": ["R1.1"]}, {"name": "N2", "pins": ["R1.1"]}]}),
    )
    .unwrap();
    assert!(validate_project(d.path())
        .unwrap_err()
        .to_string()
        .contains("more than one net"));
}

#[test]
fn parameter_ranges_and_units() {
    let d = tempfile::tempdir().unwrap();
    create_project(d.path(), "p", "uno").unwrap();
    let pp = d.path().join("parameters.json");
    write_json(&pp, &json!({"schema": "ef.parameters@1.0", "params": [{"name": "pwm_hz", "value": 50000, "min": 100, "max": 20000, "unit": "Hz"}]})).unwrap();
    assert!(validate_project(d.path())
        .unwrap_err()
        .to_string()
        .contains("outside"));
    write_json(
        &pp,
        &json!({"schema": "ef.parameters@1.0", "params": [{"name": "t", "value": 1}]}),
    )
    .unwrap();
    assert!(validate_project(d.path())
        .unwrap_err()
        .to_string()
        .contains("unit required"));
}

#[test]
fn newer_schema_is_refused() {
    let d = tempfile::tempdir().unwrap();
    create_project(d.path(), "p", "uno").unwrap();
    let p = d.path().join("requirements.json");
    write_json(&p, &json!({"schema": "ef.requirements@2.0", "items": []})).unwrap();
    assert!(matches!(
        validate_project(d.path()),
        Err(SchemaError::TooNew { .. })
    ));
}

#[test]
fn migration_is_applied_and_recorded() {
    let d = tempfile::tempdir().unwrap();
    create_project(d.path(), "p", "uno").unwrap();
    // simulate a project written by an older app: schema 0.9 used "board" instead of "target_board"
    let pj = d.path().join("project.json");
    let mut old = rd(&pj);
    old["schema"] = json!("ef.project@0.9");
    let tb = old.as_object_mut().unwrap().remove("target_board").unwrap();
    old["board"] = tb;
    write_json(&pj, &old).unwrap();

    // without a registered step the app refuses rather than guessing
    assert!(matches!(
        migrate_project(d.path(), &Migrator::builtin(), "0.1.0", "t0"),
        Err(SchemaError::NoMigration { .. })
    ));

    let mut m = Migrator::builtin();
    m.register(
        "ef.project",
        SchemaVersion::new(0, 9),
        SchemaVersion::new(1, 0),
        |mut v| {
            let b = v
                .as_object_mut()
                .unwrap()
                .remove("board")
                .ok_or("no board")?;
            v["target_board"] = b;
            Ok(v)
        },
    );
    let rec = migrate_project(d.path(), &m, "0.1.0", "2026-10-05T12:00:00Z").unwrap();
    assert_eq!(rec.len(), 1);
    assert_eq!((rec[0].from.as_str(), rec[0].to.as_str()), ("0.9", "1.0"));
    assert_eq!(rd(&pj)["target_board"], "uno");
    assert_eq!(
        rd(&d.path().join("migrations.json"))["records"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(validate_project(d.path()).unwrap().is_empty());
    // idempotent
    assert!(migrate_project(d.path(), &m, "0.1.0", "t2")
        .unwrap()
        .is_empty());
}

#[test]
fn host_specific_data_is_found() {
    let doc = json!({"library_path": "C:\\Users\\jules\\kicad\\lib", "nets": [{"name": "/RESET"}],
        "model": {"file": "models/dht22.json"}, "port": "/dev/ttyUSB0", "note": "COM3", "image": "~/pi.img"});
    let f = find_host_specific("x.json", &doc);
    let paths: Vec<_> = f.iter().map(|x| x.json_path.as_str()).collect();
    assert!(paths.contains(&"$.library_path"));
    assert!(paths.contains(&"$.port"));
    assert!(paths.contains(&"$.note"));
    assert!(paths.contains(&"$.image"));
    assert!(
        !paths.iter().any(|p| p.contains("nets")),
        "KiCad net names are not paths"
    );
    assert!(!paths.contains(&"$.model.file"), "relative paths are fine");
}

#[test]
fn size_limits_d14() {
    let l = Limits::default();
    let parts = |n: usize| json!({"parts": (0..n).map(|i| json!({"ref": format!("R{i}")})).collect::<Vec<_>>(), "nets": []});
    let proj = |w: f64, h: f64| json!({"board_outline": {"width_mm": w, "height_mm": h}});
    assert!(check_limits(&proj(68.6, 53.3), &parts(100), &l).is_empty());
    assert_eq!(
        check_limits(&proj(68.6, 53.3), &parts(101), &l)[0].limit,
        "parts"
    );
    assert!(
        check_limits(&proj(101.6, 53.3), &parts(10), &l).is_empty(),
        "Mega shield fits (C3-06)"
    );
    assert_eq!(
        check_limits(&proj(120.0, 50.0), &parts(10), &l)[0].limit,
        "longest side (mm)"
    );
    assert_eq!(
        check_limits(&proj(105.0, 100.0), &parts(10), &l)[0].limit,
        "area (mm²)"
    );
}

#[test]
fn schema_tag_parsing() {
    assert_eq!(
        SchemaTag::parse("ef.netlist@1.0").unwrap().version,
        SchemaVersion::new(1, 0)
    );
    for bad in [
        "ef.netlist",
        "ef.netlist@1",
        "@1.0",
        "ef netlist@1.0",
        "ef.netlist@x.0",
    ] {
        assert!(SchemaTag::parse(bad).is_none(), "{bad}");
    }
}
