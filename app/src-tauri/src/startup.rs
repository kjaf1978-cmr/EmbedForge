//! SS-08 at application start-up: signed manifests → start-up tier hashed → offline repair →
//! background full verification of the deferred tier → offline repair. Runs on its own thread
//! so the window appears at once; the UI polls [`IntegrityStatus`] and shows it in the status
//! bar. Nothing bundled is executed in Increment 1, so no component can run before its check.

use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum State {
    /// Development build: no release key compiled in, nothing is trusted (DIAG-01 says so).
    Untrusted,
    Checking,
    /// Start-up tier clean or repaired; deferred files still being hashed.
    Background,
    Ok,
    /// Problems were found and every one was restored from the recovery store.
    Repaired,
    /// A manifest could not be trusted, or a file could not be restored.
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct IntegrityStatus {
    pub state: State,
    pub detail: String,
    pub checked_full: usize,
    pub checked_quick: usize,
    pub pending: usize,
    pub restored: Vec<String>,
    pub unrecoverable: Vec<String>,
}

impl Default for IntegrityStatus {
    fn default() -> Self {
        Self {
            state: State::Checking,
            detail: String::new(),
            checked_full: 0,
            checked_quick: 0,
            pending: 0,
            restored: vec![],
            unrecoverable: vec![],
        }
    }
}

fn set(st: &Mutex<IntegrityStatus>, f: impl FnOnce(&mut IntegrityStatus)) {
    if let Ok(mut g) = st.lock() {
        f(&mut g);
    }
}

fn now() -> String {
    let s = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    format!("unix:{s}")
}

/// True when this process may write into the installation (per-user install, or developer
/// tree). A per-machine install is read-only for the user (SS-05: no admin rights in normal
/// operation), so restoring a file there needs the installer's Repair (see WP 1.3 report, D16).
pub fn root_writable(root: &Path) -> bool {
    let probe = root.join(format!(".ef-write-probe-{}", std::process::id()));
    let ok = std::fs::write(&probe, b"").is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}

/// The whole SS-08 sequence. `state_dir` is per-user (checksum cache and event log); `st` is
/// updated after each phase.
pub fn run(root: &Path, state_dir: &Path, keys: &[&str], st: &Mutex<IntegrityStatus>) {
    if keys.is_empty() {
        set(st, |s| {
            s.state = State::Untrusted;
            s.detail = "development build: no release key, integrity not verified (see Self-diagnosis)".into();
        });
        return;
    }
    let log = state_dir.join("integrity-events.jsonl");
    let fail = |d: String| {
        let _ = ef_integrity::log_event(&log, &serde_json::json!({"at": now(), "event": "startup_check_failed", "error": d}));
        set(st, |s| {
            s.state = State::Failed;
            s.detail = d;
        });
    };
    let store = match ef_cm::RecoveryStore::open(root.join("recovery")) {
        Ok(s) => s,
        Err(e) => return fail(format!("recovery store: {e}")),
    };
    let m = match ef_pack::load_install_manifest(root, keys, &store) {
        Ok(m) => m,
        Err(e) => return fail(format!("installation manifest not trusted: {e}")),
    };
    let r = match ef_integrity::check_startup_in(root, &m, state_dir) {
        Ok(r) => r,
        Err(e) => return fail(e.to_string()),
    };
    let mut restored = vec![];
    let mut unrecoverable = vec![];
    let mut fix = |findings: &[ef_integrity::Finding]| {
        if findings.is_empty() {
            return true;
        }
        match ef_integrity::repair(root, &m, findings, store.objects(), &log, &now()) {
            Ok(o) => {
                restored.extend(o.restored);
                unrecoverable.extend(o.unrecoverable.iter().cloned());
                o.unrecoverable.is_empty()
            }
            Err(e) => {
                unrecoverable.push(e.to_string());
                false
            }
        }
    };
    fix(&r.findings);
    set(st, |s| {
        s.state = State::Background;
        s.checked_full = r.checked_full;
        s.checked_quick = r.checked_quick;
        s.pending = r.background_queue.len();
        s.detail = format!("{} files hashed, {} queued for background verification", r.checked_full, r.background_queue.len());
    });
    let bg = ef_integrity::check_full_in(root, &m, &r.background_queue, state_dir);
    match bg {
        Ok(f) => {
            fix(&f);
        }
        Err(e) => unrecoverable.push(e.to_string()),
    }
    set(st, |s| {
        s.pending = 0;
        s.restored = restored.clone();
        s.unrecoverable = unrecoverable.clone();
        (s.state, s.detail) = if !unrecoverable.is_empty() && !root_writable(root) {
            (State::Failed, format!("{} damaged file(s): restoring them needs administrator rights; run Repair from the installer (offline)", unrecoverable.len()))
        } else if !unrecoverable.is_empty() {
            (State::Failed, format!("{} file(s) could not be restored; run Self-diagnosis", unrecoverable.len()))
        } else if !restored.is_empty() {
            (State::Repaired, format!("{} file(s) restored from the recovery store", restored.len()))
        } else {
            (State::Ok, format!("{} files verified", m.files.len()))
        };
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn sign(kp: &minisign::KeyPair, f: &Path) {
        let sig = minisign::sign(Some(&kp.pk), &kp.sk, std::io::Cursor::new(fs::read(f).unwrap()), Some("t"), None).unwrap();
        fs::write(ef_pack::sig_path(f), sig.to_string()).unwrap();
    }

    /// Install root with app files + one installed component, as the bootstrap leaves it.
    fn installed(kp: &minisign::KeyPair, d: &Path) -> std::path::PathBuf {
        let root = d.join("app");
        fs::create_dir_all(root.join("lib")).unwrap();
        fs::write(root.join("lib/core.dll"), b"core").unwrap();
        fs::write(root.join("lib/strings.txt"), b"hello").unwrap();
        let m = ef_integrity::build_manifest(&root, "0.1.0").unwrap();
        fs::write(root.join("manifest.json"), serde_json::to_string(&m).unwrap()).unwrap();
        sign(kp, &root.join("manifest.json"));
        let src = d.join("src");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("doc.pdf"), b"pdf").unwrap();
        let v = semver::Version::new(1, 0, 0);
        let spec = ef_pack::PackSpec {
            ci: "docs".into(),
            kind: ef_cm::CiKind::CodeLibrary,
            changelog: vec![ef_cm::ChangelogEntry { version: v.clone(), date: "2026-11-15".into(), text: "x".into() }],
            version: v,
            depends: Default::default(),
            license: "CC-BY-SA-4.0".into(),
        };
        let (_, mp) = ef_pack::build_pack(&spec, &src, &d.join("usb"), 1 << 20, 1).unwrap();
        sign(kp, &mp);
        let store = ef_cm::RecoveryStore::open(root.join("recovery")).unwrap();
        let keys = [kp.pk.to_base64()];
        let keys: Vec<&str> = keys.iter().map(String::as_str).collect();
        ef_pack::record_app_files(&root, &keys, &store).unwrap();
        ef_pack::install_pack(&mp, &keys, &root, &store, &root.join("state/e.jsonl"), "t").unwrap();
        root
    }

    fn run_with(root: &Path, kp: &minisign::KeyPair) -> IntegrityStatus {
        let st = Mutex::new(IntegrityStatus::default());
        let k = kp.pk.to_base64();
        run(root, &root.parent().unwrap().join("user-state"), &[k.as_str()], &st);
        st.into_inner().unwrap()
    }

    #[test]
    fn dev_build_is_reported_untrusted() {
        let d = tempfile::tempdir().unwrap();
        let st = Mutex::new(IntegrityStatus::default());
        run(d.path(), &d.path().join("u"), &[], &st);
        assert_eq!(st.lock().unwrap().state, State::Untrusted);
        assert!(!d.path().join("recovery").exists(), "a dev build must not create a store");
    }

    #[test]
    fn clean_install_verifies_ok() {
        let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        let d = tempfile::tempdir().unwrap();
        let root = installed(&kp, d.path());
        let s = run_with(&root, &kp);
        assert_eq!(s.state, State::Ok, "{}", s.detail);
        assert_eq!(s.checked_full, 1);
        assert_eq!(s.checked_quick, 2);
    }

    #[test]
    fn startup_and_background_damage_is_repaired_offline() {
        let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        let d = tempfile::tempdir().unwrap();
        let root = installed(&kp, d.path());
        fs::remove_dir_all(d.path().join("usb")).unwrap();
        fs::write(root.join("lib/core.dll"), b"CORE").unwrap(); // start-up tier
        fs::write(root.join("lib/strings.txt"), b"HELLO").unwrap(); // deferred, same size
        fs::remove_file(root.join("components/docs/doc.pdf")).unwrap();
        let s = run_with(&root, &kp);
        assert_eq!(s.state, State::Repaired, "{}", s.detail);
        assert_eq!(s.restored.len(), 3, "{:?}", s.restored);
        assert_eq!(fs::read(root.join("lib/strings.txt")).unwrap(), b"hello");
        assert_eq!(run_with(&root, &kp).state, State::Ok);
    }

    #[test]
    fn untrusted_manifest_or_lost_recovery_object_fails_visibly() {
        let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        let d = tempfile::tempdir().unwrap();
        let root = installed(&kp, d.path());
        // a recovery object is gone and the file is damaged: reported, not hidden
        let store = ef_cm::RecoveryStore::open(root.join("recovery")).unwrap();
        let sha = ef_cm::objects::sha256_file(&root.join("lib/core.dll")).unwrap().0;
        fs::remove_file(store.objects().path_of(&sha)).unwrap();
        fs::write(root.join("lib/core.dll"), b"CORE").unwrap();
        let s = run_with(&root, &kp);
        assert_eq!(s.state, State::Failed);
        assert_eq!(s.unrecoverable, ["lib/core.dll"]);
        // the signed manifest is edited
        fs::write(root.join("manifest.json"), b"{}").unwrap();
        let s = run_with(&root, &kp);
        assert_eq!(s.state, State::Failed);
        assert!(s.detail.contains("not trusted"), "{}", s.detail);
    }

    /// A per-machine install is read-only for the user: damage is reported with the way out,
    /// and the per-user cache still works.
    #[cfg(unix)]
    #[test]
    fn read_only_install_reports_that_repair_needs_the_installer() {
        use std::os::unix::fs::PermissionsExt;
        if unsafe { libc_geteuid() } == 0 {
            eprintln!("skipped: running as root, permissions are not enforced");
            return;
        }
        let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        let d = tempfile::tempdir().unwrap();
        let root = installed(&kp, d.path());
        assert_eq!(run_with(&root, &kp).state, State::Ok);
        fs::write(root.join("lib/core.dll"), b"CORE").unwrap();
        let ro = |p: &Path, m| fs::set_permissions(p, fs::Permissions::from_mode(m)).unwrap();
        ro(&root.join("lib"), 0o555);
        ro(&root, 0o555);
        let s = run_with(&root, &kp);
        ro(&root, 0o755);
        ro(&root.join("lib"), 0o755);
        assert_eq!(s.state, State::Failed);
        assert!(s.detail.contains("administrator rights"), "{}", s.detail);
    }

    #[cfg(unix)]
    extern "C" {
        #[link_name = "geteuid"]
        fn libc_geteuid() -> u32;
    }
}
