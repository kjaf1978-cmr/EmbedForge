//! Tauri commands of the Increment 1 shell.

pub mod startup;

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Release public keys trusted for manifests and packages (SEC-02), compiled in from
/// `EF_TRUSTED_KEYS` by the release pipeline (docs/release/SIGNING.md). An empty list means:
/// development build, nothing is trusted, and DIAG-01 (a) reports the manifest as untrusted.
pub fn trusted_keys() -> Vec<&'static str> {
    ef_integrity::compiled_trusted_keys()
}

struct Integrity(Arc<Mutex<startup::IntegrityStatus>>);

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

/// The installation root: the directory of the executable. Both installers put the
/// executable at the top of the app's own directory (`/opt/embedforge`,
/// `%ProgramFiles%\EmbedForge` or the per-user equivalent), next to `manifest.json`.
fn install_root() -> PathBuf {
    let exe = std::env::current_exe().ok().and_then(|p| std::fs::canonicalize(p).ok());
    exe.and_then(|p| p.parent().map(Path::to_path_buf)).unwrap_or_else(|| PathBuf::from("."))
}

pub fn host_check_impl(facts: ef_host::HostFacts) -> HostResult {
    let (p, findings) = ef_host::evaluate(&facts);
    HostResult { profile: if p == ef_host::Profile::B { "B" } else { "A" }, findings }
}

pub fn diagnose_impl(root: &Path, keys: &[&str], full: bool) -> DiagResult {
    let store = ef_cm::ObjectStore::open(root.join("recovery")).ok();
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
    diagnose_impl(&install_root(), &trusted_keys(), full)
}

#[tauri::command]
fn integrity_status(st: tauri::State<'_, Integrity>) -> startup::IntegrityStatus {
    st.0.lock().map(|g| g.clone()).unwrap_or_default()
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

pub fn run() {
    let status = Arc::new(Mutex::new(startup::IntegrityStatus::default()));
    let bg = status.clone();
    tauri::Builder::default()
        .setup(move |app| {
            use tauri::Manager;
            // per-user: a per-machine installation is read-only in normal operation (SS-05)
            let state_dir = app.path().app_local_data_dir()?.join("integrity");
            std::thread::spawn(move || startup::run(&install_root(), &state_dir, &trusted_keys(), &bg));
            Ok(())
        })
        .manage(Integrity(status))
        .invoke_handler(tauri::generate_handler![app_version, host_check, diagnose, integrity_status, settings_load, settings_save])
        .run(tauri::generate_context!())
        .expect("error while running EmbedForge");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_build_trusts_nothing_and_says_so() {
        let d = tempfile::tempdir().unwrap();
        let r = diagnose_impl(d.path(), &trusted_keys(), false);
        assert_eq!(r.overall, "fail");
        assert_eq!(r.sections[0]["status"], "fail");
        assert!(r.sections[0]["details"][0].as_str().unwrap().contains("unsigned"));
        assert_eq!(r.sections.len(), 6);
    }

    #[test]
    fn host_check_reports_profile() {
        let r = host_check_impl(ef_host::HostFacts { display: Some((1366, 768)), ..Default::default() });
        assert_eq!(r.profile, "A");
        assert!(r.findings.iter().any(|f| f.check == "display"));
    }
}
