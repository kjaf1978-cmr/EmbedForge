//! EmbedForge project data formats (DATA-01..DATA-04).
//!
//! A project is a Git repository of text files (DATA-01). Every JSON file carries a
//! `"schema": "<name>@<major>.<minor>"` tag (DATA-02). Files written by an older app version
//! are migrated automatically, and each migration is recorded in `migrations.json`.
//! Project files must not contain absolute paths or host-specific data (DATA-03). Size limits
//! are checked and reported as warnings (DATA-04).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fmt;
use std::path::{Path, PathBuf};

pub mod layout;
pub mod limits;
pub mod migrate;
pub mod portability;

pub use layout::{ProjectFile, PROJECT_FILES};
pub use limits::{check_limits, Limits, SizeWarning};
pub use migrate::{migrate_project, MigrationRecord, Migrator};
pub use portability::{find_host_specific, HostSpecificFinding};

#[derive(Debug, thiserror::Error)]
pub enum SchemaError {
    #[error("{file}: missing or malformed \"schema\" tag")]
    MissingTag { file: String },
    #[error("{file}: schema {found} expected {expected}")]
    WrongSchema {
        file: String,
        found: String,
        expected: String,
    },
    #[error("{file}: schema version {found} is newer than this app supports ({supported})")]
    TooNew {
        file: String,
        found: SchemaVersion,
        supported: SchemaVersion,
    },
    #[error("{file}: no migration from {from}")]
    NoMigration { file: String, from: SchemaVersion },
    #[error("{file}: {msg}")]
    Invalid { file: String, msg: String },
    #[error("I/O error on {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("JSON error in {path}: {source}")]
    Json {
        path: PathBuf,
        source: serde_json::Error,
    },
}

/// `<major>.<minor>` schema version. A major change is breaking and needs a migration;
/// a minor change only adds optional fields.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct SchemaVersion {
    pub major: u32,
    pub minor: u32,
}

impl SchemaVersion {
    pub const fn new(major: u32, minor: u32) -> Self {
        Self { major, minor }
    }
}

impl fmt::Display for SchemaVersion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}", self.major, self.minor)
    }
}

/// Parsed `"schema"` tag, e.g. `ef.netlist@1.0`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchemaTag {
    pub name: String,
    pub version: SchemaVersion,
}

impl SchemaTag {
    pub fn parse(s: &str) -> Option<Self> {
        let (name, ver) = s.split_once('@')?;
        let (ma, mi) = ver.split_once('.')?;
        if name.is_empty()
            || !name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
        {
            return None;
        }
        Some(Self {
            name: name.to_string(),
            version: SchemaVersion::new(ma.parse().ok()?, mi.parse().ok()?),
        })
    }

    pub fn of(doc: &Value) -> Option<Self> {
        doc.get("schema")?.as_str().and_then(Self::parse)
    }
}

impl fmt::Display for SchemaTag {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}@{}", self.name, self.version)
    }
}

pub(crate) fn read_json(path: &Path) -> Result<Value, SchemaError> {
    let text = std::fs::read_to_string(path).map_err(|source| SchemaError::Io {
        path: path.into(),
        source,
    })?;
    serde_json::from_str(&text).map_err(|source| SchemaError::Json {
        path: path.into(),
        source,
    })
}

/// Writes JSON deterministically (sorted keys via `serde_json::Value` maps are insertion
/// ordered; we sort explicitly) with a trailing newline, so Git diffs stay small (DATA-01).
pub fn write_json(path: &Path, doc: &Value) -> Result<(), SchemaError> {
    let sorted = sort_keys(doc);
    let mut text = serde_json::to_string_pretty(&sorted).map_err(|source| SchemaError::Json {
        path: path.into(),
        source,
    })?;
    text.push('\n');
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|source| SchemaError::Io {
            path: parent.into(),
            source,
        })?;
    }
    std::fs::write(path, text).map_err(|source| SchemaError::Io {
        path: path.into(),
        source,
    })
}

fn sort_keys(v: &Value) -> Value {
    match v {
        Value::Object(m) => {
            let mut keys: Vec<_> = m.keys().cloned().collect();
            keys.sort();
            let mut out = serde_json::Map::new();
            for k in keys {
                out.insert(k.clone(), sort_keys(&m[&k]));
            }
            Value::Object(out)
        }
        Value::Array(a) => Value::Array(a.iter().map(sort_keys).collect()),
        other => other.clone(),
    }
}

/// Creates an empty project with every file at its current schema version.
pub fn create_project(dir: &Path, name: &str, target_board: &str) -> Result<(), SchemaError> {
    for f in PROJECT_FILES {
        let mut doc = (f.empty)();
        doc["schema"] = json!(format!("{}@{}", f.schema, f.current));
        if f.path == "project.json" {
            doc["name"] = json!(name);
            doc["target_board"] = json!(target_board);
        }
        write_json(&dir.join(f.path), &doc)?;
    }
    Ok(())
}

/// Loads every project file, checks its tag and validates it (no migration).
pub fn validate_project(dir: &Path) -> Result<Vec<String>, SchemaError> {
    let mut notes = Vec::new();
    for f in PROJECT_FILES {
        let path = dir.join(f.path);
        if !path.exists() {
            if f.required {
                return Err(SchemaError::Invalid {
                    file: f.path.into(),
                    msg: "required file missing".into(),
                });
            }
            continue;
        }
        let doc = read_json(&path)?;
        let tag = SchemaTag::of(&doc).ok_or_else(|| SchemaError::MissingTag {
            file: f.path.into(),
        })?;
        if tag.name != f.schema {
            return Err(SchemaError::WrongSchema {
                file: f.path.into(),
                found: tag.name,
                expected: f.schema.into(),
            });
        }
        if tag.version > f.current {
            return Err(SchemaError::TooNew {
                file: f.path.into(),
                found: tag.version,
                supported: f.current,
            });
        }
        if tag.version.major < f.current.major {
            notes.push(format!(
                "{}: schema {} needs migration to {}",
                f.path, tag.version, f.current
            ));
        }
        (f.validate)(&doc).map_err(|msg| SchemaError::Invalid {
            file: f.path.into(),
            msg,
        })?;
    }
    Ok(notes)
}
