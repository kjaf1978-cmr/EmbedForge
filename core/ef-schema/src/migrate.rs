//! DATA-02: automatic migration of project files from every earlier schema version, with a
//! record of each migration in `migrations.json`. Migration is not a "conversion" in the sense
//! of INV-07.

use crate::{read_json, write_json, SchemaError, SchemaTag, SchemaVersion, PROJECT_FILES};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::Path;

pub type MigrationFn = fn(Value) -> Result<Value, String>;

/// Registry of migrations: (schema name, from version) -> (to version, function).
#[derive(Default)]
pub struct Migrator {
    steps: BTreeMap<(String, SchemaVersion), (SchemaVersion, MigrationFn)>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MigrationRecord {
    pub file: String,
    pub from: String,
    pub to: String,
    pub app_version: String,
    pub at: String,
}

impl Migrator {
    /// The registry shipped with this app version. Every schema is still at 1.0, so it is
    /// empty; each future breaking schema change adds its step here, with a test.
    pub fn builtin() -> Self {
        Self::default()
    }

    pub fn register(
        &mut self,
        schema: &str,
        from: SchemaVersion,
        to: SchemaVersion,
        f: MigrationFn,
    ) {
        assert!(to > from, "a migration must move forward");
        self.steps.insert((schema.to_string(), from), (to, f));
    }

    fn step(&self, schema: &str, from: SchemaVersion) -> Option<&(SchemaVersion, MigrationFn)> {
        self.steps.get(&(schema.to_string(), from))
    }
}

/// Brings every file of the project in `dir` to the current schema. Returns the records added.
/// `at` is supplied by the caller (timestamp) so that tests are deterministic.
pub fn migrate_project(
    dir: &Path,
    m: &Migrator,
    app_version: &str,
    at: &str,
) -> Result<Vec<MigrationRecord>, SchemaError> {
    let mut records = Vec::new();
    for f in PROJECT_FILES.iter().filter(|f| f.path != "migrations.json") {
        let path = dir.join(f.path);
        if !path.exists() {
            continue;
        }
        let mut doc = read_json(&path)?;
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
        let start = tag.version;
        let mut v = tag.version;
        while v.major < f.current.major {
            let (to, func) = m
                .step(f.schema, v)
                .ok_or_else(|| SchemaError::NoMigration {
                    file: f.path.into(),
                    from: v,
                })?;
            doc = func(doc).map_err(|msg| SchemaError::Invalid {
                file: f.path.into(),
                msg,
            })?;
            v = *to;
        }
        if v < f.current {
            v = f.current; // same major: minor versions only add optional fields
        }
        if v != start {
            doc["schema"] = json!(format!("{}@{}", f.schema, v));
            (f.validate)(&doc).map_err(|msg| SchemaError::Invalid {
                file: f.path.into(),
                msg,
            })?;
            write_json(&path, &doc)?;
            records.push(MigrationRecord {
                file: f.path.into(),
                from: start.to_string(),
                to: v.to_string(),
                app_version: app_version.into(),
                at: at.into(),
            });
        }
    }
    if !records.is_empty() {
        let mp = dir.join("migrations.json");
        let mut log = if mp.exists() {
            read_json(&mp)?
        } else {
            json!({"schema": "ef.migrations@1.0", "records": []})
        };
        for r in &records {
            log["records"]
                .as_array_mut()
                .unwrap()
                .push(serde_json::to_value(r).unwrap());
        }
        write_json(&mp, &log)?;
    }
    Ok(records)
}
