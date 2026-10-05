//! EmbedForge configuration management (CM-01..CM-04, CM-09).
//!
//! - [`objects`]: content-addressed object store (SHA-256). Shared with the integrity check
//!   (SS-08), which restores corrupted files from it without network access.
//! - [`store`]: recovery store of configuration-item versions with changelogs (CM-02),
//!   dependency-checked downgrade (CM-04), app-level baselines restorable in one action
//!   (CM-03), and a retention limit that protects pinned versions (CM-09).
//! - [`project`]: project repositories in Git (DATA-01) with baselines as tags (CM-03).

pub mod objects;
pub mod project;
pub mod store;

pub use objects::ObjectStore;
pub use project::ProjectRepo;
pub use store::{
    Baseline, ChangelogEntry, CiKind, CiVersion, DepViolation, FileEntry, PrunePlan, RecoveryStore,
};

#[derive(Debug, thiserror::Error)]
pub enum CmError {
    #[error("I/O error on {path}: {source}")]
    Io {
        path: std::path::PathBuf,
        source: std::io::Error,
    },
    #[error("JSON error on {path}: {source}")]
    Json {
        path: std::path::PathBuf,
        source: serde_json::Error,
    },
    #[error("git: {0}")]
    Git(#[from] git2::Error),
    #[error("schema: {0}")]
    Schema(#[from] ef_schema::SchemaError),
    #[error("{0}")]
    Rule(String),
    #[error("dependency check failed: {0:?}")]
    Dependencies(Vec<DepViolation>),
    #[error("object {0} missing from the recovery store")]
    MissingObject(String),
}

pub(crate) fn io<T>(path: &std::path::Path, r: std::io::Result<T>) -> Result<T, CmError> {
    r.map_err(|source| CmError::Io {
        path: path.into(),
        source,
    })
}

pub(crate) fn read_json<T: serde::de::DeserializeOwned>(
    path: &std::path::Path,
) -> Result<T, CmError> {
    let text = io(path, std::fs::read_to_string(path))?;
    serde_json::from_str(&text).map_err(|source| CmError::Json {
        path: path.into(),
        source,
    })
}

pub(crate) fn write_json<T: serde::Serialize>(
    path: &std::path::Path,
    v: &T,
) -> Result<(), CmError> {
    if let Some(p) = path.parent() {
        io(p, std::fs::create_dir_all(p))?;
    }
    let mut text = serde_json::to_string_pretty(v).map_err(|source| CmError::Json {
        path: path.into(),
        source,
    })?;
    text.push('\n');
    // write-then-rename so an interrupted write never leaves a truncated record
    let tmp = path.with_extension("tmp");
    io(&tmp, std::fs::write(&tmp, text))?;
    io(path, std::fs::rename(&tmp, path))
}
