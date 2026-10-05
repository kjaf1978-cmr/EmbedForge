use ef_host::*;

fn pc() -> HostFacts {
    HostFacts {
        os_family: "windows".into(),
        os_name: "Windows".into(),
        os_version: "11 (26100)".into(),
        arch: "x86_64".into(),
        physical_cores: 8,
        threads: 16,
        avx2: Some(true),
        ram_gb: 32.0,
        free_disk_gb: 200.0,
        disk_total_gb: 512.0,
        pi_model: None,
        storage_kind: Some("nvme".into()),
        display: Some((1920, 1080)),
    }
}

fn pi5() -> HostFacts {
    HostFacts {
        os_family: "linux".into(),
        os_name: "Debian GNU/Linux".into(),
        os_version: "13".into(),
        arch: "aarch64".into(),
        physical_cores: 4,
        threads: 4,
        avx2: None,
        ram_gb: 16.0,
        free_disk_gb: 200.0,
        disk_total_gb: 256.0,
        pi_model: Some("Raspberry Pi 5 Model B Rev 1.1".into()),
        storage_kind: Some("nvme".into()),
        display: Some((1920, 1080)),
    }
}

fn checks(f: &HostFacts) -> Vec<(String, Severity)> {
    evaluate(f)
        .1
        .into_iter()
        .map(|x| (x.check, x.severity))
        .collect()
}

#[test]
fn good_profile_a_has_no_findings() {
    assert_eq!(evaluate(&pc()), (Profile::A, vec![]));
}

#[test]
fn weak_laptop_reports_each_shortfall_with_consequence() {
    let mut f = pc();
    f.physical_cores = 2;
    f.threads = 4;
    f.ram_gb = 8.0;
    f.free_disk_gb = 40.0;
    f.avx2 = Some(false);
    f.display = Some((1366, 768));
    let (_, v) = evaluate(&f);
    let c: Vec<_> = v.iter().map(|x| x.check.as_str()).collect();
    assert_eq!(c, vec!["CPU", "AVX2", "RAM", "free SSD space", "display"]);
    assert!(v
        .iter()
        .all(|x| !x.consequence.is_empty() && !x.requirement.is_empty()));
    assert_eq!(
        v.last().unwrap().severity,
        Severity::Advice,
        "1366×768 is the compact layout, not a failure"
    );
}

#[test]
fn windows_versions() {
    let mut f = pc();
    f.os_version = "10 (19045)".into();
    assert_eq!(checks(&f), vec![("Windows 10".into(), Severity::Advice)]);
    f.os_version = "10 (19044)".into();
    assert!(
        checks(&f).contains(&("operating system".into(), Severity::Unsupported)),
        "21H2 is not supported"
    );
    f.os_version = "10 (22631)".into(); // some APIs report Windows 11 as 10
    assert_eq!(checks(&f), vec![]);
}

#[test]
fn ubuntu_lts_only() {
    let mut f = pc();
    f.os_family = "linux".into();
    f.os_name = "Ubuntu".into();
    for (ver, ok) in [
        ("22.04", true),
        ("24.04", true),
        ("26.04", true),
        ("23.10", false),
        ("20.04", false),
        ("25.04", false),
    ] {
        f.os_version = ver.into();
        assert_eq!(checks(&f).is_empty(), ok, "{ver}");
    }
}

#[test]
fn pi5_profile_b() {
    assert_eq!(evaluate(&pi5()).0, Profile::B);
    assert_eq!(
        checks(&pi5()),
        vec![("cooling and power supply".into(), Severity::Advice)]
    );
    let mut f = pi5();
    f.ram_gb = 4.0;
    f.storage_kind = Some("sd".into());
    f.disk_total_gb = 64.0;
    f.os_version = "11".into();
    let c = checks(&f);
    assert!(
        c.contains(&("operating system".into(), Severity::Unsupported)),
        "Bullseye is not supported"
    );
    assert!(c.contains(&("RAM".into(), Severity::Shortfall)));
    assert!(c.contains(&("storage".into(), Severity::Shortfall)));
    f.disk_total_gb = 128.0;
    assert!(
        checks(&f).contains(&("storage".into(), Severity::Advice)),
        "A2 128 GB microSD is the minimum: allowed, with advice"
    );
}

#[test]
fn pi4_is_not_a_supported_host() {
    let mut f = pi5();
    f.pi_model = Some("Raspberry Pi 4 Model B Rev 1.5".into());
    let (p, v) = evaluate(&f);
    assert_eq!(p, Profile::A);
    assert!(v.iter().any(|x| x.severity == Severity::Unsupported));
}

#[test]
fn detect_runs_on_this_host() {
    let f = detect(std::path::Path::new("."));
    assert!(f.threads > 0 && f.ram_gb > 0.0, "{f:?}");
    let _ = evaluate(&f);
}
