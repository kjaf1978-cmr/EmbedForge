//! Tauri commands of the Increment 1 shell.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Release public keys trusted for manifests and packages (SEC-02), from
/// `core/ef-integrity/trusted-keys.txt`. An empty list means: development build, nothing is
/// trusted, and DIAG-01 (a) reports the manifest as untrusted.
pub fn trusted_keys() -> Vec<String> {
    ef_integrity::release_keys()
}

#[derive(Serialize)]
pub struct HostResult {
    profile: &'static str,
    findings: Vec<ef_host::Finding>,
}

#[derive(Serialize)]
pub struct DiagResult {
    overall: String,
    sections: Vec<serde_json::Value>,
}

/// The installation root: `<root>/embedforge-app/bin/embedforge` in an installed tree (SS-03),
/// otherwise (development build) the folder of the executable.
pub fn install_root_of(exe: &Path) -> PathBuf {
    let dir = exe.parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from("."));
    if let (Some(bin), Some(app)) = (dir.file_name(), dir.parent()) {
        if bin == "bin" && app.file_name().is_some_and(|n| n == "embedforge-app") {
            if let Some(root) = app.parent() {
                if root.join("recovery").join("active.json").exists() {
                    return root.to_path_buf();
                }
            }
        }
    }
    dir
}

fn install_root() -> PathBuf {
    install_root_of(&std::env::current_exe().unwrap_or_default())
}

/// State of the SS-08 start-up check, shown in the status bar and the start-up banner.
#[derive(Debug, Clone, Default, Serialize)]
pub struct StartupStatus {
    /// `running`, `background`, `done`, `untrusted` (development build) or `error`.
    pub phase: String,
    pub components: usize,
    pub checked_full: usize,
    pub checked_quick: usize,
    pub found: Vec<String>,
    pub restored: Vec<String>,
    pub unrecoverable: Vec<String>,
    pub needs_elevated_repair: bool,
    pub message: String,
    pub foreground_ms: u128,
}

type Shared = Arc<Mutex<StartupStatus>>;

fn absorb(st: &mut StartupStatus, o: &ef_integrity::StartupOutcome) {
    st.components = st.components.max(o.components);
    st.found.extend(o.report.findings.iter().map(|f| format!("{}: {:?}", f.path, f.problem)));
    st.found.extend(o.component_problems.iter().map(|p| format!("{}/: {:?}", p.ci, p.problem)));
    st.restored.extend(o.restored.iter().cloned());
    st.unrecoverable.extend(o.unrecoverable.iter().cloned());
    st.needs_elevated_repair |= o.needs_elevated_repair;
}

/// SS-05(d) / D16: files the app could not restore because the installation folder is
/// read-only for this user are restored by the privileged helper. The helper writes only
/// signed content of the installed version and checks that this caller is the signed app.
pub fn escalate(root: &Path, o: &mut ef_integrity::StartupOutcome, socket: &Path) -> Option<String> {
    if !o.needs_elevated_repair || o.unrecoverable.is_empty() {
        return None;
    }
    #[cfg(target_os = "linux")]
    {
        let files = o.unrecoverable.clone();
        let r = ef_helper::server::request(socket, 1, ef_helper::Request::RestoreFiles { files: files.clone() });
        let _ = root;
        match r {
            Ok(resp) if resp.decision == ef_helper::Decision::Done => {
                o.restored.extend(files);
                o.unrecoverable.clear();
                o.needs_elevated_repair = false;
                Some(format!("restored through the privileged helper: {}", resp.message))
            }
            Ok(resp) => Some(format!("the privileged helper refused: {}", resp.message)),
            Err(e) => Some(format!("the privileged helper is not reachable ({e})")),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (root, socket);
        Some("the privileged helper's Windows transport arrives in Increment 2; run embedforge-setup repair as administrator".into())
    }
}

pub const HELPER_SOCKET: &str = "/run/embedforge/helper.sock";

/// SS-08 at start-up: foreground pass (start-up tier, offline repair), then the deferred
/// tier in the background. Runs on its own thread; the window opens meanwhile.
pub fn startup_check(root: &Path, keys: &[String], shared: &Shared) {
    startup_check_with(root, keys, shared, Path::new(HELPER_SOCKET))
}

pub fn startup_check_with(root: &Path, keys: &[String], shared: &Shared, socket: &Path) {
    let set = |f: &dyn Fn(&mut StartupStatus)| {
        if let Ok(mut s) = shared.lock() {
            f(&mut s)
        }
    };
    set(&|s| s.phase = "running".into());
    let keys: Vec<&str> = keys.iter().map(String::as_str).collect();
    let version = env!("CARGO_PKG_VERSION");
    if !root.join("recovery").join("active.json").exists() || keys.is_empty() {
        set(&|s| {
            s.phase = "untrusted".into();
            s.message = "development build: not an installed, signed tree, so the start-up integrity check (SS-08) does not run".into();
        });
        return;
    }
    let store = match ef_cm::RecoveryStore::open(root.join("recovery")) {
        Ok(s) => s,
        Err(e) => return set(&|s| { s.phase = "error".into(); s.message = e.to_string(); }),
    };
    let t0 = std::time::Instant::now();
    let at = ef_integrity::now_rfc3339();
    let mut fg = match ef_integrity::startup_pass(root, &store, &keys, version, &at) {
        Ok(o) => o,
        Err(e) => return set(&|s| { s.phase = "error".into(); s.message = e.to_string(); }),
    };
    if let Some(m) = escalate(root, &mut fg, socket) {
        set(&|s| s.message = m.clone());
    }
    let ms = t0.elapsed().as_millis();
    set(&|s| {
        absorb(s, &fg);
        s.checked_full = fg.report.checked_full;
        s.checked_quick = fg.report.checked_quick;
        s.foreground_ms = ms;
        s.phase = "background".into();
    });
    let _ = ef_integrity::log_event(&ef_integrity::log_path(root), &serde_json::json!({"at": at, "event": "startup_check", "foreground_ms": ms,
        "components": fg.components, "hashed": fg.report.checked_full, "queued": fg.report.background_queue.len()}));
    match ef_integrity::background_pass(root, &store, &keys, version, &fg.report.background_queue, &at) {
        Ok(mut bg) => {
            if let Some(m) = escalate(root, &mut bg, socket) {
                set(&|s| s.message = m.clone());
            }
            set(&|s| { absorb(s, &bg); s.phase = "done".into(); })
        }
        Err(e) => set(&|s| { s.phase = "error".into(); s.message = e.to_string(); }),
    }
}

pub fn host_check_impl(facts: ef_host::HostFacts) -> HostResult {
    let (p, findings) = ef_host::evaluate(&facts);
    HostResult { profile: if p == ef_host::Profile::B { "B" } else { "A" }, findings }
}

pub fn diagnose_impl(root: &Path, keys: &[&str], full: bool) -> DiagResult {
    let store = root.join("recovery").is_dir().then(|| ef_cm::ObjectStore::open(root.join("recovery")).ok()).flatten();
    let ctx = ef_diag::Context {
        app_version: env!("CARGO_PKG_VERSION").into(),
        install_root: root.to_path_buf(),
        trusted_keys: keys.to_vec(),
        recovery: store,
        host: ef_host::detect(root),
        full,
        warn_free_gb: 20.0,
        fail_free_gb: 5.0,
    };
    let r = ef_diag::run(&ctx);
    let v = serde_json::to_value(&r).unwrap_or_default();
    DiagResult {
        overall: serde_json::to_value(r.overall()).ok().and_then(|x| x.as_str().map(String::from)).unwrap_or_default(),
        sections: v["sections"].as_array().cloned().unwrap_or_default(),
    }
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("ui-settings.json"))
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn host_check(width: u32, height: u32) -> HostResult {
    let mut facts = ef_host::detect(&install_root());
    facts.display = Some((width, height));
    host_check_impl(facts)
}

#[tauri::command]
fn diagnose(full: bool) -> DiagResult {
    let keys = trusted_keys();
    let k: Vec<&str> = keys.iter().map(String::as_str).collect();
    diagnose_impl(&install_root(), &k, full)
}

/// DIAG-01 "Repair": full verification of every file with offline restoration (SS-08).
pub fn repair_impl(root: &Path, keys: &[String]) -> StartupStatus {
    let shared: Shared = Arc::new(Mutex::new(StartupStatus::default()));
    startup_check(root, keys, &shared);
    let s = shared.lock().map(|s| s.clone()).unwrap_or_default();
    s
}

#[tauri::command]
async fn repair() -> StartupStatus {
    repair_impl(&install_root(), &trusted_keys())
}

#[tauri::command]
fn startup_status(state: tauri::State<'_, Shared>) -> StartupStatus {
    state.lock().map(|s| s.clone()).unwrap_or_default()
}

#[tauri::command]
fn settings_load(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let p = settings_path(&app)?;
    match std::fs::read_to_string(&p) {
        Ok(t) => serde_json::from_str(&t).map_err(|e| e.to_string()),
        Err(_) => Ok(serde_json::Value::Null),
    }
}

#[tauri::command]
fn settings_save(app: tauri::AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let p = settings_path(&app)?;
    std::fs::write(&p, serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

/// Windows: use the bundled fixed-version WebView2 runtime when it is installed (section 21),
/// so that a clean offline Windows 10 image without the Evergreen runtime works.
fn use_bundled_webview(root: &Path) {
    let fixed = root.join("webview2-runtime");
    if cfg!(windows) && fixed.is_dir() && std::env::var_os("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER").is_none() {
        std::env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", &fixed);
    }
}

pub fn run() {
    let root = install_root();
    use_bundled_webview(&root);
    let shared: Shared = Arc::new(Mutex::new(StartupStatus { phase: "running".into(), ..Default::default() }));
    let worker = shared.clone();
    let keys = trusted_keys();
    std::thread::spawn(move || startup_check(&root, &keys, &worker));
    tauri::Builder::default()
        .manage(shared)
        .invoke_handler(tauri::generate_handler![app_version, host_check, diagnose, startup_status, repair, settings_load, settings_save])
        .run(tauri::generate_context!())
        .expect("error while running EmbedForge");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_build_trusts_nothing_and_says_so() {
        let d = tempfile::tempdir().unwrap();
        let keys = trusted_keys();
        let k: Vec<&str> = keys.iter().map(String::as_str).collect();
        let r = diagnose_impl(d.path(), &k, false);
        assert_eq!(r.overall, "fail");
        assert_eq!(r.sections[0]["status"], "fail");
        assert!(r.sections[0]["details"][0].as_str().unwrap().contains("unsigned"));
        assert_eq!(r.sections.len(), 6);
    }

    #[test]
    fn dev_build_skips_the_startup_check_and_says_so() {
        let d = tempfile::tempdir().unwrap();
        let s: Shared = Default::default();
        startup_check(d.path(), &[], &s);
        let st = s.lock().unwrap().clone();
        assert_eq!(st.phase, "untrusted");
        assert!(st.message.contains("development build"));
        assert!(!d.path().join("recovery").exists(), "a dev build creates nothing");
    }

    #[test]
    fn install_root_is_found_from_the_app_binary() {
        let d = tempfile::tempdir().unwrap();
        let bin = d.path().join("embedforge-app/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::create_dir_all(d.path().join("recovery")).unwrap();
        assert_eq!(install_root_of(&bin.join("embedforge")), bin, "no active.json: not an installation");
        std::fs::write(d.path().join("recovery/active.json"), "{}").unwrap();
        assert_eq!(install_root_of(&bin.join("embedforge")), d.path());
    }

    #[test]
    fn escalation_only_for_permission_problems_and_reports_an_absent_helper() {
        let d = tempfile::tempdir().unwrap();
        let mut o = ef_integrity::StartupOutcome { unrecoverable: vec!["x/y".into()], ..Default::default() };
        assert_eq!(escalate(d.path(), &mut o, &d.path().join("none.sock")), None, "a missing recovery object is not escalated");
        o.needs_elevated_repair = true;
        let m = escalate(d.path(), &mut o, &d.path().join("none.sock")).unwrap();
        assert!(m.contains("helper"), "{m}");
        assert_eq!(o.unrecoverable, vec!["x/y".to_string()], "still reported");
    }

    #[test]
    fn host_check_reports_profile() {
        let r = host_check_impl(ef_host::HostFacts { display: Some((1366, 768)), ..Default::default() });
        assert_eq!(r.profile, "A");
        assert!(r.findings.iter().any(|f| f.check == "display"));
    }
}
