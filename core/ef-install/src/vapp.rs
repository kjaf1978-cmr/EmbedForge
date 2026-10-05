//! Scripted app verification on a real installation (VAPP-03, VAPP-04, VAPP-05, TEST-02):
//! `embedforge-setup vapp` runs the checks one after the other and prints PASS/FAIL for each,
//! so that a user-executed procedure needs no manual inspection.

use crate::{audit, platform, read_record, repair, restore_baseline, update, InstallError};
use ef_cm::RecoveryStore;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
pub struct Step {
    pub id: &'static str,
    pub title: &'static str,
    pub pass: bool,
    pub details: Vec<String>,
}

fn step(id: &'static str, title: &'static str, r: Result<Vec<String>, String>) -> Step {
    match r {
        Ok(details) => Step {
            id,
            title,
            pass: true,
            details,
        },
        Err(e) => Step {
            id,
            title,
            pass: false,
            details: vec![e],
        },
    }
}

fn e(x: InstallError) -> String {
    x.to_string()
}

/// VAPP-04: damages two files of the app component (one deleted, one corrupted in place with
/// the same size) and checks that the offline repair restores both and that the tree is
/// clean afterwards.
pub fn vapp04(target: &Path, keys: &[&str]) -> Step {
    step(
        "VAPP-04",
        "Self-repair from the local recovery store, offline (SS-08)",
        (|| {
            let app = target.join(crate::APP_CI);
            let deleted = app.join("share").join("embedforge.png");
            // the app binary: not running during this check (the helper may be, and a running
            // executable cannot be written in place)
            let corrupted = platform::app_binary(target);
            fs::remove_file(&deleted).map_err(|x| format!("{}: {x}", deleted.display()))?;
            let mut b = fs::read(&corrupted).map_err(|x| x.to_string())?;
            let i = b.len() / 2;
            b[i] ^= 0x55;
            fs::write(&corrupted, &b).map_err(|x| x.to_string())?;
            let r = repair(target, keys).map_err(e)?;
            let mut d = vec![
                format!(
                    "deleted {}, corrupted {}",
                    deleted.display(),
                    corrupted.display()
                ),
                format!(
                    "found: {:?}",
                    r.report
                        .findings
                        .iter()
                        .map(|f| format!("{} {:?}", f.path, f.problem))
                        .collect::<Vec<_>>()
                ),
                format!("restored: {:?}", r.restored),
            ];
            if r.restored.len() != 2 || !r.unrecoverable.is_empty() {
                return Err(format!(
                    "expected 2 restored files, got {:?} (not restored: {:?})",
                    r.restored, r.unrecoverable
                ));
            }
            let again = repair(target, keys).map_err(e)?;
            if !again.report.findings.is_empty() || !again.restored.is_empty() {
                return Err(format!(
                    "not clean after repair: {:?}",
                    again.report.findings
                ));
            }
            d.push("second full check: clean".into());
            let log = fs::read_to_string(ef_integrity::log_path(target)).unwrap_or_default();
            d.push(format!("integrity log: {} event(s)", log.lines().count()));
            Ok(d)
        })(),
    )
}

/// VAPP-05: applies a signed update package from USB storage, then restores the installation
/// baseline (an offline rollback through the recovery store) and checks that the active set
/// is the original one again.
pub fn vapp05(target: &Path, keys: &[&str], package: &Path) -> Step {
    step(
        "VAPP-05",
        "Offline update and rollback with a USB package (SS-09, CM-09)",
        (|| {
            let rec = read_record(target).map_err(e)?;
            let store = RecoveryStore::open(target.join("recovery")).map_err(|x| x.to_string())?;
            let before = store.active().map_err(|x| x.to_string())?;
            let u = update(package, target, keys).map_err(e)?;
            if u.rolled_back || u.changes.is_empty() {
                return Err(format!("update not applied: {}", u.message));
            }
            let mut d: Vec<String> = u
                .changes
                .iter()
                .map(|c| {
                    format!(
                        "updated {}: {} → {}",
                        c.ci,
                        c.from.as_deref().unwrap_or("(new)"),
                        c.to
                    )
                })
                .collect();
            let base = format!("install-{}", rec.app_version);
            let changed = restore_baseline(target, &base, keys).map_err(e)?;
            d.push(format!(
                "baseline {base} restored offline, changed {changed:?}"
            ));
            let after = store.active().map_err(|x| x.to_string())?;
            if after != before {
                return Err(format!(
                    "active set after rollback {after:?} differs from before {before:?}"
                ));
            }
            d.push("active versions equal the installed ones again; the update stays in the recovery store".into());
            Ok(d)
        })(),
    )
}

/// VAPP-03: starts the installed app, waits, and audits every file it and its children have
/// loaded or opened.
pub fn vapp03(target: &Path, wait: Duration) -> Step {
    step(
        "VAPP-03",
        "Dependency audit of the running app",
        (|| {
            let exe = platform::app_binary(target);
            let mut child = std::process::Command::new(&exe)
                .spawn()
                .map_err(|x| format!("{}: {x}", exe.display()))?;
            std::thread::sleep(wait);
            if let Ok(Some(st)) = child.try_wait() {
                return Err(format!(
                    "the app ended before the audit ({st}); a desktop session is needed"
                ));
            }
            let a = audit::audit(child.id(), target);
            let _ = child.kill();
            let _ = child.wait();
            let a = a.map_err(|x| x.to_string())?;
            use audit::Class;
            let out = a.outside();
            let mut d = vec![format!(
            "{} process(es): {} files in the app directory, {} OS standard, {} app data, {} outside",
            a.processes.len(), a.count(Class::AppDirectory), a.count(Class::OsStandard), a.count(Class::AppData), out.len()
        )];
            d.extend(out.iter().map(|f| format!("outside: {f}")));
            if out.is_empty() {
                Ok(d)
            } else {
                Err(d.join("\n    "))
            }
        })(),
    )
}
