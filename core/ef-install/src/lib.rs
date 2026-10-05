//! Bootstrap installer, offline updates, rollback, repair and uninstallation
//! (SS-01..SS-05, SS-08, SS-09, CM-03, CM-04, CM-05(b), HOST-04, PERF-09).
//!
//! The same library runs on every host. Host specifics (dependency packages, udev rules,
//! group membership, the privileged helper's system units, menu entries) are in
//! [`platform`]; they are expressed as file writes and commands, so that tests can run them
//! against a scratch system root and record the commands.
//!
//! Installation, in order:
//! 1. load the signed medium index (SEC-02) and check it is for this host;
//! 2. run the host check (HOST-04) and show each shortfall with its consequence;
//! 3. select packs: required ones always, optional ones as chosen (SS-01), dependency sets for
//!    the running release only; show what deselected packs cost;
//! 4. hash every selected part (SS-01, SS-08) and estimate the duration (PERF-09);
//! 5. unpack each component, verify it against its signed component manifest, store it in
//!    the content-addressed recovery store (CM-09) and activate the whole set in one action;
//! 6. tag the baseline `install-<version>` (CM-03), write the install record, integrate with
//!    the host, and run the start-up integrity check once (DIAG-01 (a)).

pub mod audit;
pub mod platform;
pub mod vapp;

use ef_cm::{CiVersion, RecoveryStore};
use ef_host::{Finding as HostFinding, Profile};
use ef_integrity::{
    load_component, ComponentManifest, IntegrityError, COMPONENT_FILE, COMPONENT_SIG,
};
use ef_pack::{
    extract_component, load_index, verify_contents, Index, IndexKind, Notice, PackError,
    UnbundledDriver, MEDIUM_INDEX, UPDATE_INDEX,
};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

/// The component that holds the app, its helper and this installer.
pub const APP_CI: &str = "embedforge-app";
pub const RECORD: &str = "state/install.json";

#[derive(Debug, thiserror::Error)]
pub enum InstallError {
    #[error("{0}")]
    Pack(#[from] PackError),
    #[error("{0}")]
    Integrity(#[from] IntegrityError),
    #[error("{0}")]
    Cm(#[from] ef_cm::CmError),
    #[error("I/O error on {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("installation blocked:\n  - {}", .0.join("\n  - "))]
    Blocked(Vec<String>),
    #[error("the medium is damaged:\n  - {}", .0.join("\n  - "))]
    Damaged(Vec<String>),
    #[error("{0}")]
    Rule(String),
}

pub(crate) fn io<T>(path: &Path, r: std::io::Result<T>) -> Result<T, InstallError> {
    r.map_err(|source| InstallError::Io {
        path: path.into(),
        source,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    /// Administrator/root installation with drivers and the privileged helper (SS-04, SS-05).
    System,
    /// Installation without administrator rights, drivers or helper (SS-05).
    PerUser,
}

/// The host as the installer sees it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HostId {
    /// `windows`, `ubuntu` or `raspios` (`other` if unsupported).
    pub os: String,
    pub arch: String,
    /// e.g. `ubuntu-24.04`, `raspios-bookworm`, `windows`.
    pub release: String,
}

impl HostId {
    pub fn detect() -> Self {
        let arch = std::env::consts::ARCH.to_string();
        if cfg!(windows) {
            return Self {
                os: "windows".into(),
                arch,
                release: "windows".into(),
            };
        }
        let text = fs::read_to_string("/etc/os-release").unwrap_or_default();
        let pi = Path::new("/etc/rpi-issue").exists();
        Self::from_os_release(&text, pi, &arch)
    }

    pub fn from_os_release(text: &str, rpi_issue: bool, arch: &str) -> Self {
        let get = |k: &str| {
            text.lines()
                .find_map(|l| l.strip_prefix(&format!("{k}=")))
                .map(|v| v.trim_matches('"').to_string())
                .unwrap_or_default()
        };
        let (id, ver, code) = (get("ID"), get("VERSION_ID"), get("VERSION_CODENAME"));
        let (os, release) = if id == "ubuntu" {
            ("ubuntu".to_string(), format!("ubuntu-{ver}"))
        } else if id == "raspbian" || (id == "debian" && rpi_issue) {
            ("raspios".to_string(), format!("raspios-{code}"))
        } else {
            ("other".to_string(), format!("{id}-{ver}"))
        };
        Self {
            os,
            arch: arch.into(),
            release,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Options {
    pub medium: PathBuf,
    pub target: PathBuf,
    pub mode: Mode,
    pub trusted_keys: Vec<String>,
    /// Optional packs to add / to leave out (ids).
    pub with: Vec<String>,
    pub without: Vec<String>,
    /// Ids of notices the user accepted (SS-02 WebView2 terms).
    pub accepted: Vec<String>,
    pub host: HostId,
    /// HOST-04 facts; `None` = detect.
    pub host_facts: Option<ef_host::HostFacts>,
    /// Install on a host outside HOST-01 anyway (CI runners such as Windows Server); the
    /// findings are still shown.
    pub allow_unsupported_host: bool,
}

impl Options {
    fn keys(&self) -> Vec<&str> {
        self.trusted_keys.iter().map(String::as_str).collect()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct LeftOut {
    pub ci: String,
    pub title: String,
    pub consequence: String,
    pub pack_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Plan {
    pub index: Index,
    pub mode: Mode,
    pub target: PathBuf,
    pub host: HostId,
    pub selected: Vec<String>,
    pub left_out: Vec<LeftOut>,
    pub not_for_this_host: Vec<String>,
    pub pack_bytes: u64,
    pub installed_bytes: u64,
    /// Installed tree plus the recovery-store copy plus staging of the largest component.
    pub needed_bytes: u64,
    pub free_bytes: u64,
    pub host_profile: Profile,
    pub host_findings: Vec<HostFinding>,
    /// Functions not available with this installation (SS-05 per-user list).
    pub missing_functions: Vec<String>,
    pub notices_to_accept: Vec<Notice>,
    pub unbundled_drivers: Vec<UnbundledDriver>,
    /// Reasons the installation cannot go ahead.
    pub blockers: Vec<String>,
}

pub fn missing_functions(mode: Mode, host: &HostId) -> Vec<String> {
    if mode == Mode::System {
        return if host.os == "windows" {
            vec!["Privileged helper on Windows: its service and named-pipe transport arrive in Increment 2. Until then the app cannot restore damaged files in the program folder itself; it says so, and \"embedforge-setup repair\" (as administrator) restores them (SS-05(d)).".into()]
        } else {
            vec![]
        };
    }
    let mut v = vec![
        "Writing Raspberry Pi OS images and first-boot files to SD cards (SS-05(a), needs the privileged helper).".to_string(),
    ];
    if host.os == "raspios" {
        v.push("Deploying a generated Raspberry Pi project to this Pi 5 itself (HOST-07(b), needs the privileged helper).".into());
    }
    if host.os != "windows" {
        v.push("Installing the offline dependency packages (SS-05(c)): the packages the app needs must already be installed on this host.".into());
        v.push("udev rules and serial-port group membership (SS-04): ask an administrator to add you to the \"dialout\" group, or board connection fails with \"permission denied\".".into());
    } else {
        v.push("USB-serial drivers (SS-04): none is bundled in the first release anyway; ATmega16U2 boards use the Windows built-in driver.".into());
    }
    v
}

/// Free bytes on the volume that will hold `target` (its nearest existing ancestor).
fn free_bytes(target: &Path, facts: &Option<ef_host::HostFacts>) -> (u64, ef_host::HostFacts) {
    let mut p = target.to_path_buf();
    while !p.exists() {
        if !p.pop() {
            break;
        }
    }
    let f = facts.clone().unwrap_or_else(|| ef_host::detect(&p));
    ((f.free_disk_gb * 1e9) as u64, f)
}

/// Steps 1–3: everything the installer shows before it changes anything.
pub fn plan(opt: &Options) -> Result<Plan, InstallError> {
    let index = load_index(&opt.medium, MEDIUM_INDEX, &opt.keys())?;
    let mut blockers = Vec::new();
    if index.os != opt.host.os || index.arch != opt.host.arch {
        blockers.push(format!(
            "this medium is for {} {}, this host is {} {} ({})",
            index.os, index.arch, opt.host.os, opt.host.arch, opt.host.release
        ));
    }
    let (mut selected, mut left_out, mut not_for_this_host) = (vec![], vec![], vec![]);
    for c in &index.components {
        if !c.applies_to.is_empty() && !c.applies_to.contains(&opt.host.release) {
            not_for_this_host.push(c.ci.clone());
            continue;
        }
        let take = !c.optional
            || opt.with.contains(&c.ci)
            || (c.default_selected && !opt.without.contains(&c.ci));
        if take {
            selected.push(c.ci.clone());
        } else {
            left_out.push(LeftOut {
                ci: c.ci.clone(),
                title: c.title.clone(),
                consequence: c.consequence.clone(),
                pack_bytes: c.parts.iter().map(|p| p.size).sum(),
            });
        }
    }
    for w in opt.with.iter().chain(&opt.without) {
        if index.component(w).is_none() {
            blockers.push(format!("unknown pack \"{w}\""));
        }
    }
    for c in &index.components {
        if !c.optional && opt.without.contains(&c.ci) {
            blockers.push(format!("\"{}\" is required and cannot be left out", c.ci));
        }
    }
    if !selected.iter().any(|c| c == APP_CI) {
        blockers.push(format!("the medium has no \"{APP_CI}\" component"));
    }
    let sel = |ci: &str| selected.iter().any(|s| s == ci);
    let pack_bytes: u64 = index
        .components
        .iter()
        .filter(|c| sel(&c.ci))
        .flat_map(|c| &c.parts)
        .map(|p| p.size)
        .sum();
    let installed_bytes: u64 = index
        .components
        .iter()
        .filter(|c| sel(&c.ci))
        .map(|c| c.installed_size)
        .sum();
    let largest = index
        .components
        .iter()
        .filter(|c| sel(&c.ci))
        .map(|c| c.installed_size)
        .max()
        .unwrap_or(0);
    let needed_bytes = installed_bytes * 2 + largest;
    let (free, facts) = free_bytes(&opt.target, &opt.host_facts);
    if free < needed_bytes {
        blockers.push(format!(
            "not enough free space on the target volume: {:.1} GB needed, {:.1} GB free",
            needed_bytes as f64 / 1e9,
            free as f64 / 1e9
        ));
    }
    let notices_to_accept: Vec<Notice> = index
        .notices
        .iter()
        .filter(|n| n.must_accept && !opt.accepted.contains(&n.id))
        .cloned()
        .collect();
    for n in &notices_to_accept {
        blockers.push(format!("the terms \"{}\" have not been accepted", n.title));
    }
    let (host_profile, host_findings) = ef_host::evaluate(&facts);
    for f in &host_findings {
        if f.severity == ef_host::Severity::Unsupported && !opt.allow_unsupported_host {
            blockers.push(format!(
                "{}: {} (required {}) — {}",
                f.check, f.found, f.required, f.consequence
            ));
        }
    }
    Ok(Plan {
        mode: opt.mode,
        target: opt.target.clone(),
        host: opt.host.clone(),
        missing_functions: missing_functions(opt.mode, &opt.host),
        unbundled_drivers: index.unbundled_drivers.clone(),
        index,
        selected,
        left_out,
        not_for_this_host,
        pack_bytes,
        installed_bytes,
        needed_bytes,
        free_bytes: free,
        host_profile,
        host_findings,
        notices_to_accept,
        blockers,
    })
}

/// Progress events for the user interface of the installer.
#[derive(Debug, Clone)]
pub enum Event {
    Verifying {
        done: u64,
        total: u64,
    },
    /// Expected remaining duration once the read speed of the medium is known (PERF-09).
    Estimate {
        seconds: u64,
    },
    Unpacking {
        ci: String,
        n: usize,
        of: usize,
    },
    Activating,
    Integrating(String),
    Warning(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallRecord {
    pub format: String,
    pub mode: Mode,
    pub app_version: Version,
    pub os: String,
    pub arch: String,
    pub host_release: String,
    pub installed_at: String,
    pub components: Vec<String>,
    pub left_out: Vec<String>,
    pub missing_functions: Vec<String>,
    /// Files written outside the install root, removed again at uninstallation.
    #[serde(default)]
    pub system_files: Vec<String>,
}

pub fn read_record(target: &Path) -> Result<InstallRecord, InstallError> {
    let p = target.join(RECORD);
    let t = io(&p, fs::read_to_string(&p))?;
    serde_json::from_str(&t).map_err(|e| InstallError::Rule(format!("{}: {e}", p.display())))
}

fn write_record(target: &Path, r: &InstallRecord) -> Result<(), InstallError> {
    let p = target.join(RECORD);
    io(&p, fs::create_dir_all(p.parent().unwrap()))?;
    io(
        &p,
        fs::write(&p, serde_json::to_string_pretty(r).unwrap() + "\n"),
    )
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallReport {
    pub installed: Vec<String>,
    pub seconds: f64,
    pub verify_seconds: f64,
    pub record: InstallRecord,
    pub startup: ef_integrity::StartupOutcome,
    pub warnings: Vec<String>,
}

/// Checks a staged component against its signed manifest: every listed file with the right
/// hash, and nothing else.
fn verify_staged(
    dir: &Path,
    keys: &[&str],
    ci: &str,
    v: &Version,
) -> Result<ComponentManifest, InstallError> {
    let m = load_component(dir, keys)?;
    if m.ci != ci || &m.version != v {
        return Err(InstallError::Rule(format!(
            "pack {ci} {v} contains the manifest of {} {}",
            m.ci, m.version
        )));
    }
    let mut listed: std::collections::BTreeSet<String> =
        m.files.iter().map(|f| f.path.clone()).collect();
    for f in &m.files {
        let (sha, size) = ef_cm::objects::sha256_file(&dir.join(&f.path))?;
        if sha != f.sha256 || size != f.size {
            return Err(InstallError::Rule(format!(
                "{ci}: {} does not match its signed manifest",
                f.path
            )));
        }
    }
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for e in io(&d, fs::read_dir(&d))? {
            let p = io(&d, e)?.path();
            if p.is_dir() {
                stack.push(p);
                continue;
            }
            let rel = p
                .strip_prefix(dir)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            if rel != COMPONENT_FILE && rel != COMPONENT_SIG && !listed.remove(&rel) {
                return Err(InstallError::Rule(format!(
                    "{ci}: {rel} is not in its signed manifest"
                )));
            }
        }
    }
    Ok(m)
}

/// Unpacks, verifies and stores the given components; returns the set to activate.
fn stage_and_store(
    medium: &Path,
    index: &Index,
    cis: &[String],
    target: &Path,
    store: &RecoveryStore,
    keys: &[&str],
    progress: &mut dyn FnMut(Event),
) -> Result<BTreeMap<String, Version>, InstallError> {
    let staging_root = target.join(".staging");
    let mut set = BTreeMap::new();
    for (n, ci) in cis.iter().enumerate() {
        let c = index.component(ci).unwrap();
        progress(Event::Unpacking {
            ci: ci.clone(),
            n: n + 1,
            of: cis.len(),
        });
        if store.get(ci, &c.version).is_err() {
            let dir = staging_root.join(ci);
            if dir.exists() {
                io(&dir, fs::remove_dir_all(&dir))?;
            }
            extract_component(medium, c, &dir)?;
            let m = verify_staged(&dir, keys, ci, &c.version)?;
            store.add_version(
                CiVersion {
                    ci: m.ci.clone(),
                    kind: m.kind,
                    version: m.version.clone(),
                    changelog: m.changelog.clone(),
                    depends: m.depends.clone(),
                    files: vec![],
                },
                &dir,
            )?;
            io(&dir, fs::remove_dir_all(&dir))?;
        }
        set.insert(ci.clone(), c.version.clone());
    }
    if staging_root.exists() {
        let _ = fs::remove_dir_all(&staging_root);
    }
    Ok(set)
}

fn verify_medium(
    medium: &Path,
    index: &Index,
    cis: &[String],
    total_install: u64,
    progress: &mut dyn FnMut(Event),
) -> Result<f64, InstallError> {
    let names: Vec<&str> = cis.iter().map(String::as_str).collect();
    let total: u64 = index
        .components
        .iter()
        .filter(|c| names.contains(&c.ci.as_str()))
        .flat_map(|c| &c.parts)
        .map(|p| p.size)
        .sum::<u64>()
        + index.files.iter().map(|f| f.size).sum::<u64>();
    let t0 = Instant::now();
    let mut done = 0u64;
    let mut last = 0u64;
    let mut estimated = false;
    let problems = verify_contents(medium, index, &names, &mut |n| {
        done += n;
        if done - last >= 64 << 20 || done == total {
            last = done;
            progress(Event::Verifying { done, total });
            let secs = t0.elapsed().as_secs_f64();
            if !estimated && done >= 256 << 20 && secs > 0.0 {
                // remaining reads, then unpacking reads the packs again and writes the tree
                // twice (installed copy + recovery store), at the measured rate
                let rate = done as f64 / secs;
                let rest = (total - done) as f64 + total as f64 + 2.0 * total_install as f64;
                progress(Event::Estimate {
                    seconds: (rest / rate) as u64,
                });
                estimated = true;
            }
        }
    });
    if !problems.is_empty() {
        return Err(InstallError::Damaged(
            problems
                .into_iter()
                .map(|p| format!("{}: {}", p.file, p.problem))
                .collect(),
        ));
    }
    Ok(t0.elapsed().as_secs_f64())
}

/// Steps 4–6. `sys` performs the host integration (see [`platform`]).
pub fn install(
    plan: &Plan,
    opt: &Options,
    sys: &mut platform::Sys,
    progress: &mut dyn FnMut(Event),
) -> Result<InstallReport, InstallError> {
    if !plan.blockers.is_empty() {
        return Err(InstallError::Blocked(plan.blockers.clone()));
    }
    let t0 = Instant::now();
    let keys = opt.keys();
    let verify_seconds = verify_medium(
        &opt.medium,
        &plan.index,
        &plan.selected,
        plan.installed_bytes,
        progress,
    )?;
    let target = &plan.target;
    io(target, fs::create_dir_all(target))?;
    let store = RecoveryStore::open(target.join("recovery"))?;
    let set = stage_and_store(
        &opt.medium,
        &plan.index,
        &plan.selected,
        target,
        &store,
        &keys,
        progress,
    )?;
    progress(Event::Activating);
    // components of an earlier installation that this one does not select are deactivated
    for old in store.active()?.keys() {
        if !set.contains_key(old) {
            store.deactivate(old)?;
            let d = target.join(old);
            if d.exists() {
                io(&d, fs::remove_dir_all(&d))?;
            }
        }
    }
    store.activate_set(&set, target)?;
    let tag = format!("install-{}", plan.index.app_version);
    if !store.baselines()?.iter().any(|b| b.name == tag) {
        store.tag_baseline(&tag, &ef_integrity::now_rfc3339())?;
    }
    let mut record = InstallRecord {
        format: "ef.install@1.0".into(),
        mode: plan.mode,
        app_version: plan.index.app_version.clone(),
        os: plan.index.os.clone(),
        arch: plan.index.arch.clone(),
        host_release: plan.host.release.clone(),
        installed_at: ef_integrity::now_rfc3339(),
        components: plan.selected.clone(),
        left_out: plan.left_out.iter().map(|l| l.ci.clone()).collect(),
        missing_functions: plan.missing_functions.clone(),
        system_files: vec![],
    };
    write_record(target, &record)?;
    let mut warnings = Vec::new();
    platform::integrate(plan, &mut record, sys, &mut |e| {
        if let Event::Warning(w) = &e {
            warnings.push(w.clone());
        }
        progress(e)
    })?;
    write_record(target, &record)?;
    let startup = check_all(target, &store, &keys, &plan.index.app_version.to_string())?;
    if !startup.unrecoverable.is_empty() || !startup.report.findings.is_empty() {
        return Err(InstallError::Rule(format!(
            "the installed files fail the integrity check: {:?}",
            startup.report.findings
        )));
    }
    Ok(InstallReport {
        installed: plan.selected.clone(),
        seconds: t0.elapsed().as_secs_f64(),
        verify_seconds,
        record,
        startup,
        warnings,
    })
}

/// Start-up pass and the full background pass, one after the other (DIAG-01 (a), repair).
pub fn check_all(
    target: &Path,
    store: &RecoveryStore,
    keys: &[&str],
    app_version: &str,
) -> Result<ef_integrity::StartupOutcome, InstallError> {
    let at = ef_integrity::now_rfc3339();
    let mut s = ef_integrity::startup_pass(target, store, keys, app_version, &at)?;
    let queue = s.report.background_queue.clone();
    let b = ef_integrity::background_pass(target, store, keys, app_version, &queue, &at)?;
    s.report.findings.extend(b.report.findings);
    s.restored.extend(b.restored);
    s.unrecoverable.extend(b.unrecoverable);
    s.needs_elevated_repair |= b.needs_elevated_repair;
    Ok(s)
}

/// `embedforge-setup repair`: full check with offline restoration from the recovery store.
pub fn repair(target: &Path, keys: &[&str]) -> Result<ef_integrity::StartupOutcome, InstallError> {
    let rec = read_record(target)?;
    let store = RecoveryStore::open(target.join("recovery"))?;
    check_all(target, &store, keys, &rec.app_version.to_string())
}

// ---------------------------------------------------------------------------------------------
// Offline update and rollback (SS-09, CM-04, CM-05(b), VAPP-05)

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Change {
    pub ci: String,
    pub from: Option<String>,
    pub to: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateReport {
    pub changes: Vec<Change>,
    /// True if the install-time check failed and the previous versions were reinstalled.
    pub rolled_back: bool,
    pub check: Option<ef_integrity::StartupOutcome>,
    pub message: String,
}

fn log_cm(target: &Path, ev: serde_json::Value) {
    let _ = ef_integrity::log_event(&target.join("state").join("cm.log"), &ev);
}

/// Applies a signed update package from USB storage (SS-09). The package gets the same
/// signature check as an online update; after activation the install-time check of CM-05(b)
/// runs (DIAG-01 (a) in Increment 1; the smoke-project set joins when there are projects to
/// build) and a failure rolls every changed item back.
pub fn update(package: &Path, target: &Path, keys: &[&str]) -> Result<UpdateReport, InstallError> {
    let rec = read_record(target)?;
    let index = load_index(package, UPDATE_INDEX, keys)?;
    if index.kind != IndexKind::Update {
        return Err(InstallError::Rule("not an update package".into()));
    }
    if index.os != rec.os || index.arch != rec.arch {
        return Err(InstallError::Rule(format!(
            "this package is for {} {}, the installation is {} {}",
            index.os, index.arch, rec.os, rec.arch
        )));
    }
    let store = RecoveryStore::open(target.join("recovery"))?;
    let before = store.active()?;
    let app_now = before
        .get(APP_CI)
        .cloned()
        .unwrap_or_else(|| rec.app_version.clone());
    if let Some(req) = &index.requires_app {
        if !req.matches(&app_now) {
            return Err(InstallError::Rule(format!(
                "this package needs EmbedForge {req}; this installation is {app_now}"
            )));
        }
    }
    let cis: Vec<String> = index
        .components
        .iter()
        .filter(|c| c.applies_to.is_empty() || c.applies_to.contains(&rec.host_release))
        .filter(|c| before.get(&c.ci) != Some(&c.version))
        .map(|c| c.ci.clone())
        .collect();
    if cis.is_empty() {
        return Ok(UpdateReport {
            changes: vec![],
            rolled_back: false,
            check: None,
            message: "nothing to update: every item is already at the package's version".into(),
        });
    }
    verify_medium(package, &index, &cis, 0, &mut |_| {})?;
    let set = stage_and_store(package, &index, &cis, target, &store, keys, &mut |_| {})?;
    let changes: Vec<Change> = set
        .iter()
        .map(|(ci, v)| Change {
            ci: ci.clone(),
            from: before.get(ci).map(|x| x.to_string()),
            to: v.to_string(),
        })
        .collect();
    store.activate_set(&set, target)?;
    let app_version = store
        .active()?
        .get(APP_CI)
        .cloned()
        .unwrap_or(app_now)
        .to_string();
    let check = check_all(target, &store, keys, &app_version)?;
    let ok = check.unrecoverable.is_empty() && check.component_problems.is_empty();
    if !ok {
        let prev: BTreeMap<String, Version> = changes
            .iter()
            .filter_map(|c| before.get(&c.ci).map(|v| (c.ci.clone(), v.clone())))
            .collect();
        store.activate_set(&prev, target)?;
        for c in changes.iter().filter(|c| c.from.is_none()) {
            store.deactivate(&c.ci)?;
            let _ = fs::remove_dir_all(target.join(&c.ci));
        }
        log_cm(
            target,
            serde_json::json!({"at": ef_integrity::now_rfc3339(), "event": "update_rolled_back", "changes": changes}),
        );
        return Ok(UpdateReport {
            changes,
            rolled_back: true,
            check: Some(check),
            message: "the install-time check failed; the previous versions were reinstalled".into(),
        });
    }
    log_cm(
        target,
        serde_json::json!({"at": ef_integrity::now_rfc3339(), "event": "update_applied", "changes": changes}),
    );
    Ok(UpdateReport {
        message: format!("{} item(s) updated", changes.len()),
        changes,
        rolled_back: false,
        check: Some(check),
    })
}

/// CM-04: roll `ci` back to an earlier version kept in the recovery store, without network.
pub fn rollback(
    target: &Path,
    ci: &str,
    to: &Version,
    keys: &[&str],
) -> Result<Change, InstallError> {
    let store = RecoveryStore::open(target.join("recovery"))?;
    let from = store.active()?.get(ci).cloned();
    store.downgrade(ci, to, target)?;
    let rec = read_record(target)?;
    let app_version = store
        .active()?
        .get(APP_CI)
        .cloned()
        .unwrap_or(rec.app_version)
        .to_string();
    let check = check_all(target, &store, keys, &app_version)?;
    if !check.unrecoverable.is_empty() || !check.component_problems.is_empty() {
        return Err(InstallError::Rule(format!(
            "after the rollback the integrity check fails: {:?}",
            check.unrecoverable
        )));
    }
    let c = Change {
        ci: ci.into(),
        from: from.map(|v| v.to_string()),
        to: to.to_string(),
    };
    log_cm(
        target,
        serde_json::json!({"at": ef_integrity::now_rfc3339(), "event": "rollback", "change": c}),
    );
    Ok(c)
}

/// CM-03: restore an app-level baseline (e.g. `install-0.1.0`) in one action, offline.
pub fn restore_baseline(
    target: &Path,
    name: &str,
    keys: &[&str],
) -> Result<Vec<String>, InstallError> {
    let store = RecoveryStore::open(target.join("recovery"))?;
    let changed = store.restore_baseline(name, target)?;
    let rec = read_record(target)?;
    let app_version = store
        .active()?
        .get(APP_CI)
        .cloned()
        .unwrap_or(rec.app_version)
        .to_string();
    let check = check_all(target, &store, keys, &app_version)?;
    if !check.unrecoverable.is_empty() || !check.component_problems.is_empty() {
        return Err(InstallError::Rule(format!(
            "after restoring {name} the integrity check fails: {:?}",
            check.unrecoverable
        )));
    }
    log_cm(
        target,
        serde_json::json!({"at": ef_integrity::now_rfc3339(), "event": "baseline_restored", "baseline": name, "changed": changed}),
    );
    Ok(changed)
}

/// The baselines kept in the recovery store (CM-03).
pub fn baselines(target: &Path) -> Result<Vec<ef_cm::Baseline>, InstallError> {
    Ok(RecoveryStore::open(target.join("recovery"))?.baselines()?)
}

/// (item, stored versions oldest first, active version).
pub type ItemVersions = (String, Vec<Version>, Option<Version>);

/// Every stored version per item, with the active one, for the rollback menu (CM-04).
pub fn versions(target: &Path) -> Result<Vec<ItemVersions>, InstallError> {
    let store = RecoveryStore::open(target.join("recovery"))?;
    let active = store.active()?;
    let mut out = vec![];
    for ci in store.items()? {
        out.push((ci.clone(), store.versions(&ci)?, active.get(&ci).cloned()));
    }
    Ok(out)
}

/// Removes the installation. The target must hold an install record, so that a wrong path
/// can never delete unrelated files. User projects live outside the install root and stay.
pub fn uninstall(target: &Path, sys: &mut platform::Sys) -> Result<Vec<String>, InstallError> {
    let rec = read_record(target).map_err(|_| {
        InstallError::Rule(format!(
            "{} is not an EmbedForge installation (no {RECORD})",
            target.display()
        ))
    })?;
    let warnings = platform::remove(&rec, target, sys)?;
    io(target, fs::remove_dir_all(target))?;
    Ok(warnings)
}
