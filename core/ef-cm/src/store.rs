//! Recovery store of configuration-item versions (CM-01..CM-04, CM-09).
//!
//! Layout under `root`:
//! ```text
//! objects/…                 content-addressed files (ObjectStore)
//! items/<ci>/<version>.json one record per stored version (CiVersion)
//! active.json               {ci: version} currently installed
//! baselines/<name>.json     named sets of versions (CM-03)
//! pins.json                 {project_id: {ci: version}} of known projects (CM-06, CM-09)
//! ```

use crate::objects::ObjectStore;
use crate::{io, read_json, write_json, CmError};
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/// Configuration-item kinds (CM-01, plus the DOC-10 weak-word list and block templates).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CiKind {
    AppFrontEnd,
    AppBackEndModule,
    Runtime,
    Toolchain,
    LlmModel,
    PromptTemplate,
    CodeLibrary,
    BoardDefinition,
    ComponentModel,
    PartsCatalogue,
    CadLibrary,
    FabricationProfile,
    BlockTemplate,
    WeakWordList,
    Project,
}

impl CiKind {
    /// App-level items are checked at install time with DIAG-01 and the smoke-project set
    /// (CM-05(b)); the others are checked per project.
    pub fn is_app_level(self) -> bool {
        matches!(
            self,
            Self::AppFrontEnd
                | Self::AppBackEndModule
                | Self::Runtime
                | Self::Toolchain
                | Self::LlmModel
                | Self::PromptTemplate
        )
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChangelogEntry {
    pub version: Version,
    pub date: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub sha256: String,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CiVersion {
    pub ci: String,
    pub kind: CiKind,
    pub version: Version,
    pub changelog: Vec<ChangelogEntry>,
    #[serde(default)]
    pub depends: BTreeMap<String, VersionReq>,
    #[serde(default)]
    pub files: Vec<FileEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Baseline {
    pub name: String,
    pub created: String,
    pub versions: BTreeMap<String, Version>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DepViolation {
    pub ci: String,
    pub requires: String,
    pub req: String,
    pub found: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize)]
pub struct PrunePlan {
    /// The retention limit (versions kept per item) this plan was computed for.
    pub keep: usize,
    /// Versions that would be removed.
    pub remove: Vec<(String, Version)>,
    /// Kept although outside the limit, with the reason (active, pinned by a known project).
    pub protected: Vec<(String, Version, String)>,
    /// Baselines that reference a removed version and would therefore be deleted.
    pub baselines_deleted: Vec<String>,
}

pub struct RecoveryStore {
    root: PathBuf,
    objects: ObjectStore,
}

fn valid_ci_id(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
        && !s.starts_with('.')
}

impl RecoveryStore {
    pub fn open(root: impl Into<PathBuf>) -> Result<Self, CmError> {
        let root = root.into();
        let objects = ObjectStore::open(&root)?;
        for d in ["items", "baselines"] {
            io(&root, fs::create_dir_all(root.join(d)))?;
        }
        Ok(Self { root, objects })
    }

    pub fn objects(&self) -> &ObjectStore {
        &self.objects
    }

    fn item_path(&self, ci: &str, v: &Version) -> PathBuf {
        self.root.join("items").join(ci).join(format!("{v}.json"))
    }

    /// Stores version `meta` of a configuration item with every file under `src_dir`.
    /// CM-02: the changelog must contain an entry for this version.
    pub fn add_version(&self, mut meta: CiVersion, src_dir: &Path) -> Result<CiVersion, CmError> {
        if !valid_ci_id(&meta.ci) {
            return Err(CmError::Rule(format!(
                "invalid configuration-item id \"{}\"",
                meta.ci
            )));
        }
        if !meta.changelog.iter().any(|e| e.version == meta.version) {
            return Err(CmError::Rule(format!(
                "{} {}: changelog has no entry for this version (CM-02)",
                meta.ci, meta.version
            )));
        }
        let p = self.item_path(&meta.ci, &meta.version);
        if p.exists() {
            return Err(CmError::Rule(format!(
                "{} {} is already stored; versions are immutable",
                meta.ci, meta.version
            )));
        }
        meta.files.clear();
        let mut stack = vec![src_dir.to_path_buf()];
        while let Some(d) = stack.pop() {
            for e in io(&d, fs::read_dir(&d))? {
                let path = io(&d, e)?.path();
                if path.is_dir() {
                    stack.push(path);
                } else {
                    let (sha, size) = self.objects.put(&path)?;
                    let rel = path
                        .strip_prefix(src_dir)
                        .unwrap()
                        .to_string_lossy()
                        .replace('\\', "/");
                    meta.files.push(FileEntry {
                        path: rel,
                        sha256: sha,
                        size,
                    });
                }
            }
        }
        meta.files.sort_by(|a, b| a.path.cmp(&b.path));
        write_json(&p, &meta)?;
        Ok(meta)
    }

    pub fn get(&self, ci: &str, v: &Version) -> Result<CiVersion, CmError> {
        let p = self.item_path(ci, v);
        if !p.exists() {
            return Err(CmError::Rule(format!(
                "{ci} {v} is not in the recovery store"
            )));
        }
        read_json(&p)
    }

    pub fn items(&self) -> Result<Vec<String>, CmError> {
        let d = self.root.join("items");
        let mut v: Vec<String> = io(&d, fs::read_dir(&d))?
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        Ok(v)
    }

    /// Stored versions of `ci`, oldest first.
    pub fn versions(&self, ci: &str) -> Result<Vec<Version>, CmError> {
        let d = self.root.join("items").join(ci);
        if !d.exists() {
            return Ok(vec![]);
        }
        let mut v: Vec<Version> = io(&d, fs::read_dir(&d))?
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                e.file_name()
                    .to_string_lossy()
                    .strip_suffix(".json")
                    .and_then(|s| Version::parse(s).ok())
            })
            .collect();
        v.sort();
        Ok(v)
    }

    pub fn active(&self) -> Result<BTreeMap<String, Version>, CmError> {
        let p = self.root.join("active.json");
        if p.exists() {
            read_json(&p)
        } else {
            Ok(BTreeMap::new())
        }
    }

    fn set_active(&self, a: &BTreeMap<String, Version>) -> Result<(), CmError> {
        write_json(&self.root.join("active.json"), a)
    }

    /// Checks that every item's declared dependencies are met by the set.
    pub fn check_set(&self, set: &BTreeMap<String, Version>) -> Result<Vec<DepViolation>, CmError> {
        let mut out = Vec::new();
        for (ci, v) in set {
            let meta = self.get(ci, v)?;
            for (dep, req) in &meta.depends {
                let found = set.get(dep);
                if !found.is_some_and(|f| req.matches(f)) {
                    out.push(DepViolation {
                        ci: format!("{ci} {v}"),
                        requires: dep.clone(),
                        req: req.to_string(),
                        found: found.map(|f| f.to_string()),
                    });
                }
            }
        }
        Ok(out)
    }

    /// Writes the files of `ci` `v` into `install_root/<ci>/`, replacing what is there.
    fn materialize(&self, ci: &str, v: &Version, install_root: &Path) -> Result<(), CmError> {
        let meta = self.get(ci, v)?;
        for f in &meta.files {
            let rel = Path::new(&f.path);
            if rel.is_absolute()
                || rel
                    .components()
                    .any(|c| !matches!(c, std::path::Component::Normal(_)))
            {
                return Err(CmError::Rule(format!(
                    "{ci} {v}: unsafe file path \"{}\" in record",
                    f.path
                )));
            }
            if !self.objects.has(&f.sha256) {
                return Err(CmError::MissingObject(f.sha256.clone()));
            }
        }
        let dest = install_root.join(ci);
        let staging = install_root.join(format!(".{ci}.staging"));
        if staging.exists() {
            io(&staging, fs::remove_dir_all(&staging))?;
        }
        io(&staging, fs::create_dir_all(&staging))?;
        for f in &meta.files {
            self.objects.restore_to(&f.sha256, &staging.join(&f.path))?;
        }
        if dest.exists() {
            io(&dest, fs::remove_dir_all(&dest))?;
        }
        io(&dest, fs::rename(&staging, &dest))
    }

    /// Installs `ci` `v` and marks it active, after the dependency check (CM-04).
    pub fn activate(&self, ci: &str, v: &Version, install_root: &Path) -> Result<(), CmError> {
        let mut set = self.active()?;
        set.insert(ci.to_string(), v.clone());
        let viol = self.check_set(&set)?;
        if !viol.is_empty() {
            return Err(CmError::Dependencies(viol));
        }
        self.materialize(ci, v, install_root)?;
        self.set_active(&set)
    }

    /// CM-04: downgrade to any earlier stored version, after a dependency check.
    pub fn downgrade(&self, ci: &str, to: &Version, install_root: &Path) -> Result<(), CmError> {
        let cur = self
            .active()?
            .get(ci)
            .cloned()
            .ok_or_else(|| CmError::Rule(format!("{ci} is not installed")))?;
        if to >= &cur {
            return Err(CmError::Rule(format!(
                "{ci}: {to} is not earlier than the active {cur}"
            )));
        }
        self.activate(ci, to, install_root)
    }

    /// CM-03: tag the active set as a baseline.
    pub fn tag_baseline(&self, name: &str, created: &str) -> Result<Baseline, CmError> {
        if !valid_ci_id(name) {
            return Err(CmError::Rule(format!("invalid baseline name \"{name}\"")));
        }
        let p = self.root.join("baselines").join(format!("{name}.json"));
        if p.exists() {
            return Err(CmError::Rule(format!("baseline {name} exists")));
        }
        let b = Baseline {
            name: name.into(),
            created: created.into(),
            versions: self.active()?,
        };
        write_json(&p, &b)?;
        Ok(b)
    }

    pub fn baselines(&self) -> Result<Vec<Baseline>, CmError> {
        let d = self.root.join("baselines");
        let mut out = Vec::new();
        for e in io(&d, fs::read_dir(&d))? {
            let p = io(&d, e)?.path();
            if p.extension().is_some_and(|x| x == "json") {
                out.push(read_json(&p)?);
            }
        }
        out.sort_by(|a: &Baseline, b| a.name.cmp(&b.name));
        Ok(out)
    }

    /// CM-03: restore a baseline in one action: afterwards exactly the baseline's versions
    /// are active, and items added since are deactivated (they stay in the store). Everything
    /// is checked before anything is changed; on a failure part-way, the previously active
    /// versions are reinstalled.
    pub fn restore_baseline(
        &self,
        name: &str,
        install_root: &Path,
    ) -> Result<Vec<String>, CmError> {
        let b: Baseline = read_json(&self.root.join("baselines").join(format!("{name}.json")))?;
        self.apply_set(&b.versions, install_root, true)
    }

    /// Makes every version in `set` active in one action (installation, update, baseline
    /// restore). The objects and the dependencies of the resulting active set are checked
    /// before anything is changed; on a failure part-way, the previously active versions are
    /// reinstalled. Returns the items whose version changed.
    pub fn activate_set(
        &self,
        set: &BTreeMap<String, Version>,
        install_root: &Path,
    ) -> Result<Vec<String>, CmError> {
        self.apply_set(set, install_root, false)
    }

    fn apply_set(
        &self,
        set: &BTreeMap<String, Version>,
        install_root: &Path,
        exact: bool,
    ) -> Result<Vec<String>, CmError> {
        for (ci, v) in set {
            for f in self.get(ci, v)?.files {
                if !self.objects.has(&f.sha256) {
                    return Err(CmError::MissingObject(f.sha256));
                }
            }
        }
        let before = self.active()?;
        let mut after = if exact {
            BTreeMap::new()
        } else {
            before.clone()
        };
        after.extend(set.clone());
        let viol = self.check_set(&after)?;
        if !viol.is_empty() {
            return Err(CmError::Dependencies(viol));
        }
        let mut changed: Vec<String> = Vec::new();
        for (ci, v) in set {
            if before.get(ci) != Some(v) || !install_root.join(ci).exists() {
                if let Err(e) = self.materialize(ci, v, install_root) {
                    for c in &changed {
                        if let Some(old) = before.get(c) {
                            let _ = self.materialize(c, old, install_root);
                        }
                    }
                    return Err(e);
                }
                changed.push(ci.clone());
            }
        }
        for ci in before.keys().filter(|c| !after.contains_key(*c)) {
            let d = install_root.join(ci);
            if d.exists() {
                io(&d, fs::remove_dir_all(&d))?;
            }
            changed.push(ci.clone());
        }
        self.set_active(&after)?;
        Ok(changed)
    }

    /// Removes `ci` from the active set (it stays in the store for rollback).
    pub fn deactivate(&self, ci: &str) -> Result<(), CmError> {
        let mut a = self.active()?;
        a.remove(ci);
        self.set_active(&a)
    }

    /// Records the versions a known project pins (CM-06); they are protected from pruning.
    pub fn set_project_pins(
        &self,
        project_id: &str,
        pins: BTreeMap<String, Version>,
    ) -> Result<(), CmError> {
        let p = self.root.join("pins.json");
        let mut all: BTreeMap<String, BTreeMap<String, Version>> = if p.exists() {
            read_json(&p)?
        } else {
            BTreeMap::new()
        };
        all.insert(project_id.into(), pins);
        write_json(&p, &all)
    }

    pub fn remove_project_pins(&self, project_id: &str) -> Result<(), CmError> {
        let p = self.root.join("pins.json");
        if p.exists() {
            let mut all: BTreeMap<String, BTreeMap<String, Version>> = read_json(&p)?;
            all.remove(project_id);
            write_json(&p, &all)?;
        }
        Ok(())
    }

    fn pinned(&self) -> Result<BTreeMap<(String, Version), Vec<String>>, CmError> {
        let p = self.root.join("pins.json");
        let all: BTreeMap<String, BTreeMap<String, Version>> = if p.exists() {
            read_json(&p)?
        } else {
            BTreeMap::new()
        };
        let mut out: BTreeMap<(String, Version), Vec<String>> = BTreeMap::new();
        for (proj, pins) in all {
            for (ci, v) in pins {
                out.entry((ci, v)).or_default().push(proj.clone());
            }
        }
        Ok(out)
    }

    /// CM-09: what a retention limit of `keep` versions per item would remove. The active
    /// version and versions pinned by a known project are always kept.
    pub fn plan_prune(&self, keep: usize) -> Result<PrunePlan, CmError> {
        let active = self.active()?;
        let pinned = self.pinned()?;
        let mut plan = PrunePlan {
            keep,
            ..PrunePlan::default()
        };
        for ci in self.items()? {
            let vs = self.versions(&ci)?;
            let cut = vs.len().saturating_sub(keep);
            for v in &vs[..cut] {
                if active.get(&ci) == Some(v) {
                    plan.protected
                        .push((ci.clone(), v.clone(), "active".into()));
                } else if let Some(projects) = pinned.get(&(ci.clone(), v.clone())) {
                    plan.protected.push((
                        ci.clone(),
                        v.clone(),
                        format!("pinned by {}", projects.join(", ")),
                    ));
                } else {
                    plan.remove.push((ci.clone(), v.clone()));
                }
            }
        }
        let removed: BTreeSet<(String, Version)> = plan.remove.iter().cloned().collect();
        for b in self.baselines()? {
            if b.versions
                .iter()
                .any(|(c, v)| removed.contains(&(c.clone(), v.clone())))
            {
                plan.baselines_deleted.push(b.name);
            }
        }
        Ok(plan)
    }

    /// Applies a prune plan. Deleting baselines needs the user's confirmation (CM-09).
    /// Returns the number of objects freed.
    pub fn apply_prune(&self, plan: &PrunePlan, confirmed: bool) -> Result<usize, CmError> {
        if !plan.baselines_deleted.is_empty() && !confirmed {
            return Err(CmError::Rule(format!(
                "pruning deletes baselines {:?}; user confirmation required",
                plan.baselines_deleted
            )));
        }
        let fresh = self.plan_prune(plan.keep)?;
        if fresh != *plan {
            return Err(CmError::Rule(
                "the store changed since the plan was made; plan again".into(),
            ));
        }
        for (ci, v) in &plan.remove {
            let p = self.item_path(ci, v);
            io(&p, fs::remove_file(&p))?;
        }
        for b in &plan.baselines_deleted {
            let p = self.root.join("baselines").join(format!("{b}.json"));
            io(&p, fs::remove_file(&p))?;
        }
        let mut keep = HashSet::new();
        for ci in self.items()? {
            for v in self.versions(&ci)? {
                for f in self.get(&ci, &v)?.files {
                    keep.insert(f.sha256);
                }
            }
        }
        self.objects.gc(&keep)
    }
}
