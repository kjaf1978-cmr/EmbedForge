//! Bootstrap installer core (SS-01). The Windows EXE and the two .deb packages run this after
//! placing the application files: it installs every component pack from the medium, offline.
//!
//! Usage:
//!   ef-bootstrap --medium <dir> --root <install dir> [--with <ci>,<ci>…]   install (SS-01)
//!   ef-bootstrap --medium <dir> --list                                   list the packs
//!   ef-bootstrap --root <install dir> --verify                           full SS-08 check
//!   ef-bootstrap --root <install dir> --repair                           check + offline repair
//!   ef-bootstrap --root <install dir> --rollback <ci>=<version>          offline rollback (CM-04)
//!
//! `--repair` is the "Repair" of a per-machine installation: it needs the rights that wrote
//! the installation (administrator / root), restores from the local recovery store only, and
//! never needs the medium.
//!
//! Exit codes: 0 done, 1 refused or failed (reason on stderr and in the event log), 2 usage.

use std::path::PathBuf;
use std::process::ExitCode;

fn now() -> String {
    let s = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    format!("unix:{s}")
}

fn main() -> ExitCode {
    let mut medium = None;
    let mut root = None;
    let mut with: Vec<String> = vec![];
    let mut list = false;
    let mut verify = false;
    let mut repair = false;
    let mut rollback: Option<String> = None;
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        match a.as_str() {
            "--medium" => medium = args.next().map(PathBuf::from),
            "--root" => root = args.next().map(PathBuf::from),
            "--with" => {
                with = args
                    .next()
                    .unwrap_or_default()
                    .split(',')
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .collect()
            }
            "--list" => list = true,
            "--verify" => verify = true,
            "--repair" => repair = true,
            "--rollback" => rollback = args.next(),
            _ => {
                eprintln!("unknown argument {a}");
                return ExitCode::from(2);
            }
        }
    }
    let keys = ef_integrity::compiled_trusted_keys();
    if let Some(rb) = rollback {
        let (Some(root), Some((ci, v))) = (root, rb.split_once('=')) else {
            eprintln!("usage: ef-bootstrap --root <dir> --rollback <ci>=<version>");
            return ExitCode::from(2);
        };
        let Ok(v) = semver::Version::parse(v) else {
            eprintln!("{v} is not a version");
            return ExitCode::from(2);
        };
        let store = match ef_cm::RecoveryStore::open(root.join("recovery")) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("{e}");
                return ExitCode::from(1);
            }
        };
        let stored: Vec<String> = store
            .versions(ci)
            .unwrap_or_default()
            .iter()
            .map(|x| x.to_string())
            .collect();
        let log = root.join("state").join("install-events.jsonl");
        return match ef_pack::rollback(ci, &v, &root, &store, &log, &now()) {
            Ok(()) => {
                println!("{ci} rolled back to {v} (offline, from the recovery store)");
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!(
                    "rollback refused: {e}; stored versions of {ci}: {}",
                    stored.join(", ")
                );
                ExitCode::from(1)
            }
        };
    }
    if verify || repair {
        let Some(root) = root else {
            eprintln!("--root is required");
            return ExitCode::from(2);
        };
        return check(&root, &keys, repair);
    }
    let Some(medium) = medium else {
        eprintln!(
            "usage: ef-bootstrap --medium <dir> --root <install dir> [--with <ci>,…] [--list]"
        );
        return ExitCode::from(2);
    };
    if keys.is_empty() {
        eprintln!("this bootstrap was built without release keys (development build) and trusts no medium");
        return ExitCode::from(1);
    }
    if list {
        return match ef_pack::load_medium(&medium, &keys) {
            Ok(m) => {
                for p in &m.packs {
                    let gb = p.installed_size as f64 / 1e9;
                    match &p.consequence {
                        Some(c) if p.optional => println!(
                            "[optional] {} {} ({gb:.2} GB): without it: {c}",
                            p.ci, p.version
                        ),
                        _ => println!("[required] {} {} ({gb:.2} GB)", p.ci, p.version),
                    }
                }
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("medium refused: {e}");
                ExitCode::from(1)
            }
        };
    }
    let Some(root) = root else {
        eprintln!("--root is required");
        return ExitCode::from(2);
    };
    let sel: Vec<&str> = with.iter().map(String::as_str).collect();
    let log = root.join("state").join("install-events.jsonl");
    match ef_pack::install_medium(&medium, &keys, &sel, &root, &log, &now()) {
        Ok(o) => {
            for i in &o.installed {
                println!("installed {} {}", i.ci, i.version);
            }
            for (ci, why) in &o.skipped {
                println!("not installed (optional) {ci}: {why}");
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("installation stopped: {e}");
            ExitCode::from(1)
        }
    }
}

/// Full SS-08 verification of every file (DIAG-01 "on demand"), optionally with offline repair.
fn check(root: &std::path::Path, keys: &[&str], repair: bool) -> ExitCode {
    let fail = |m: String| {
        eprintln!("{m}");
        ExitCode::from(1)
    };
    let store = match ef_cm::RecoveryStore::open(root.join("recovery")) {
        Ok(s) => s,
        Err(e) => return fail(format!("recovery store: {e}")),
    };
    let m = match ef_pack::load_install_manifest(root, keys, &store) {
        Ok(m) => m,
        Err(e) => return fail(format!("installation manifest not trusted: {e}")),
    };
    let all: Vec<String> = m.files.iter().map(|f| f.path.clone()).collect();
    // a scratch cache: a root-run check must not write the users' caches
    let scratch = std::env::temp_dir().join(format!("ef-verify-{}", std::process::id()));
    let findings = ef_integrity::check_full_in(root, &m, &all, &scratch);
    let _ = std::fs::remove_dir_all(&scratch);
    let findings = match findings {
        Ok(f) => f,
        Err(e) => return fail(e.to_string()),
    };
    println!(
        "{} files verified, {} problem(s)",
        m.files.len(),
        findings.len()
    );
    for f in &findings {
        println!("  {:?} {}", f.problem, f.path);
    }
    if findings.is_empty() {
        return ExitCode::SUCCESS;
    }
    if !repair {
        return ExitCode::from(1);
    }
    let log = root.join("state").join("install-events.jsonl");
    match ef_integrity::repair(root, &m, &findings, store.objects(), &log, &now()) {
        Ok(o) => {
            for p in &o.restored {
                println!("restored {p}");
            }
            for p in &o.unrecoverable {
                println!("NOT restored {p} (reinstall from the medium)");
            }
            if o.unrecoverable.is_empty() {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(1)
            }
        }
        Err(e) => fail(e.to_string()),
    }
}
