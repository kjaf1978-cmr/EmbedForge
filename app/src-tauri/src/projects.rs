//! Schematic projects in the desktop app (Increment 2): each project is a folder under
//! `Documents/EmbedForge Projects` holding a Git repository (DATA-01, CM-02). Saving writes the
//! project files with sorted keys and commits them; the files are validated first
//! (ef_schema::validate_project via ProjectRepo::commit_all). Exports go to `exports/`, which
//! is not committed.

use base64::Engine as _;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Files the UI may write; anything else is refused.
pub const WRITABLE: [&str; 3] = ["project.json", "netlist.json", "geometry.json"];

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct ProjectInfo {
    pub id: String,
    pub name: String,
    pub modified: String,
}

#[derive(Serialize, Debug)]
pub struct ProjectList {
    pub root: String,
    pub projects: Vec<ProjectInfo>,
}

#[derive(Serialize, Debug)]
pub struct Loaded {
    pub info: ProjectInfo,
    pub files: serde_json::Map<String, Value>,
}

/// A project id is a folder name directly under the root: no separators, no "..".
fn dir_of(root: &Path, id: &str) -> Result<PathBuf, String> {
    let ok = !id.is_empty()
        && id != "."
        && id != ".."
        && !id.contains(['/', '\\', ':'])
        && !id.starts_with('.')
        && id.len() <= 100;
    if !ok {
        return Err(format!("invalid project id {id:?}"));
    }
    Ok(root.join(id))
}

/// Folder name for a project name: letters, digits, space, - and _; unique under the root.
fn folder_for(root: &Path, name: &str) -> String {
    let mut base: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .chars()
        .take(60)
        .collect();
    if base.is_empty() {
        base = "Project".into();
    }
    let mut id = base.clone();
    let mut n = 2;
    while root.join(&id).exists() {
        id = format!("{base} {n}");
        n += 1;
    }
    id
}

fn modified(dir: &Path) -> String {
    let t = std::fs::metadata(dir.join(".git").join("index"))
        .or_else(|_| std::fs::metadata(dir.join("project.json")))
        .and_then(|m| m.modified())
        .ok();
    match t.and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()) {
        Some(d) => format_utc(d.as_secs()),
        None => String::new(),
    }
}

/// `YYYY-MM-DD HH:MM UTC` without a time-zone database.
pub fn format_utc(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    // civil-from-days (Howard Hinnant)
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}-{m:02}-{d:02} {:02}:{:02} UTC",
        rem / 3600,
        (rem % 3600) / 60
    )
}

fn read_name(dir: &Path) -> Option<String> {
    let t = std::fs::read_to_string(dir.join("project.json")).ok()?;
    let v: Value = serde_json::from_str(&t).ok()?;
    v.get("name").and_then(Value::as_str).map(String::from)
}

pub fn list(root: &Path) -> Result<ProjectList, String> {
    std::fs::create_dir_all(root).map_err(|e| format!("{}: {e}", root.display()))?;
    let mut projects = Vec::new();
    for e in std::fs::read_dir(root)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let p = e.path();
        if !p.is_dir() || !p.join(".git").exists() {
            continue;
        }
        let Some(id) = p.file_name().and_then(|s| s.to_str()).map(String::from) else {
            continue;
        };
        if let Some(name) = read_name(&p) {
            projects.push(ProjectInfo {
                modified: modified(&p),
                name,
                id,
            });
        }
    }
    projects.sort_by(|a, b| b.modified.cmp(&a.modified).then(a.name.cmp(&b.name)));
    Ok(ProjectList {
        root: root.display().to_string(),
        projects,
    })
}

pub fn create(root: &Path, name: &str) -> Result<ProjectInfo, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err("the project name must have 1 to 80 characters".into());
    }
    std::fs::create_dir_all(root).map_err(|e| format!("{}: {e}", root.display()))?;
    let id = folder_for(root, name);
    let dir = root.join(&id);
    // exports are derived files: keep them out of the history
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(".gitignore"), "exports/\n").map_err(|e| e.to_string())?;
    ef_cm::ProjectRepo::create(&dir, name, "").map_err(|e| e.to_string())?;
    Ok(ProjectInfo {
        id,
        name: name.into(),
        modified: modified(&dir),
    })
}

pub fn load(root: &Path, id: &str) -> Result<Loaded, String> {
    let dir = dir_of(root, id)?;
    let mut files = serde_json::Map::new();
    for f in WRITABLE {
        let p = dir.join(f);
        if let Ok(t) = std::fs::read_to_string(&p) {
            let v: Value = serde_json::from_str(&t).map_err(|e| format!("{f}: {e}"))?;
            files.insert(f.into(), v);
        }
    }
    let name =
        read_name(&dir).ok_or_else(|| format!("{id}: project.json missing or without a name"))?;
    Ok(Loaded {
        info: ProjectInfo {
            id: id.into(),
            name,
            modified: modified(&dir),
        },
        files,
    })
}

/// Writes the given files and commits; returns false when nothing changed.
pub fn save(
    root: &Path,
    id: &str,
    files: &serde_json::Map<String, Value>,
    message: &str,
) -> Result<bool, String> {
    let dir = dir_of(root, id)?;
    if !dir.join(".git").exists() {
        return Err(format!("project {id} not found"));
    }
    for (name, doc) in files {
        if !WRITABLE.contains(&name.as_str()) {
            return Err(format!("{name}: not a project file the editor may write"));
        }
        let text = serde_json::to_string(doc).map_err(|e| e.to_string())?;
        if text.contains(":\\\\") || text.contains("\"/home/") || text.contains("\"/Users/") {
            return Err(format!("{name}: contains an absolute path (DATA-03)"));
        }
        ef_schema::write_json(&dir.join(name), doc).map_err(|e| e.to_string())?;
    }
    let repo = ef_cm::ProjectRepo::open(&dir).map_err(|e| e.to_string())?;
    let msg = if message.trim().is_empty() {
        "Save"
    } else {
        message.trim()
    };
    Ok(repo.commit_all(msg).map_err(|e| e.to_string())?.is_some())
}

/// Saves an export under `<project>/exports/` (or `<root>/exports/` for an unsaved document).
pub fn export(
    root: &Path,
    project: Option<&str>,
    name: &str,
    data_b64: &str,
) -> Result<String, String> {
    let base = match project {
        Some(id) => dir_of(root, id)?,
        None => root.to_path_buf(),
    };
    let ok_name = !name.is_empty()
        && !name.contains(['/', '\\', ':'])
        && !name.starts_with('.')
        && name.len() <= 120;
    if !ok_name {
        return Err(format!("invalid file name {name:?}"));
    }
    let data = base64::engine::general_purpose::STANDARD
        .decode(data_b64)
        .map_err(|e| e.to_string())?;
    let dir = base.join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(name);
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn files(name: &str) -> serde_json::Map<String, Value> {
        let mut m = serde_json::Map::new();
        m.insert("project.json".into(), json!({"schema": "ef.project@1.0", "name": name, "target_board": "", "build_style": "pcb", "part_style": "discrete", "status": "Draft", "pinned": {}, "board_outline": null}));
        m.insert("netlist.json".into(), json!({"schema": "ef.netlist@1.0", "parts": [{"ref": "R1", "symbol": "resistor", "value": "1k", "props": {"value": "1k"}, "standard": false}, {"ref": "V1", "symbol": "vdc", "value": "5", "props": {"value": "5"}, "standard": false}], "nets": [{"name": "GND", "pins": ["R1.2", "V1.2"]}, {"name": "N(R1.1)", "pins": ["R1.1", "V1.1"]}]}));
        m.insert("geometry.json".into(), json!({"schema": "ef.geometry@1.0", "views": {"schematic": {"parts": [], "wires": [], "labels": [], "probes": [], "sim": {"type": "op"}}}}));
        m
    }

    #[test]
    fn create_save_load_list_and_history() {
        let t = tempfile::tempdir().unwrap();
        let root = t.path().join("EmbedForge Projects");
        let p = create(&root, "LED test").unwrap();
        assert_eq!(p.id, "LED test");
        assert_eq!(create(&root, "LED test").unwrap().id, "LED test 2");
        assert!(save(&root, &p.id, &files("LED test"), "Save: Add R1").unwrap());
        assert!(
            !save(&root, &p.id, &files("LED test"), "Save").unwrap(),
            "unchanged files make no commit"
        );
        let l = load(&root, &p.id).unwrap();
        assert_eq!(l.info.name, "LED test");
        assert_eq!(l.files["netlist.json"]["parts"][0]["ref"], "R1");
        let names: Vec<_> = list(&root)
            .unwrap()
            .projects
            .into_iter()
            .map(|p| p.name)
            .collect();
        assert!(names.contains(&"LED test".to_string()));
        // CM-02: every save is a commit
        let repo = git2::Repository::open(root.join(&p.id)).unwrap();
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(head.message().ok(), Some("Save: Add R1"));
        assert_eq!(head.parent_count(), 1);
    }

    #[test]
    fn invalid_netlists_and_foreign_files_are_refused() {
        let t = tempfile::tempdir().unwrap();
        let p = create(t.path(), "X").unwrap();
        let mut f = files("X");
        f["netlist.json"]["nets"][1]["pins"] = json!(["R1.1", "R1.2"]); // R1.2 on two nets
        assert!(save(t.path(), &p.id, &f, "bad").is_err());
        let mut g = serde_json::Map::new();
        g.insert("../evil.json".into(), json!({}));
        assert!(save(t.path(), &p.id, &g, "bad")
            .unwrap_err()
            .contains("not a project file"));
        assert!(load(t.path(), "../etc").is_err());
        assert!(export(t.path(), Some(&p.id), "../x.svg", "").is_err());
    }

    #[test]
    fn exports_are_written_and_not_committed() {
        let t = tempfile::tempdir().unwrap();
        let p = create(t.path(), "Y").unwrap();
        let b64 = base64::engine::general_purpose::STANDARD.encode("<svg/>");
        let path = export(t.path(), Some(&p.id), "y.svg", &b64).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "<svg/>");
        assert!(save(t.path(), &p.id, &files("Y"), "Save").unwrap());
        let repo = git2::Repository::open(t.path().join(&p.id)).unwrap();
        let tree = repo.head().unwrap().peel_to_tree().unwrap();
        assert!(tree.get_name("exports").is_none());
        assert!(tree.get_name(".gitignore").is_some());
    }

    #[test]
    fn utc_formatting() {
        assert_eq!(format_utc(0), "1970-01-01 00:00 UTC");
        assert_eq!(format_utc(1_760_356_800), "2025-10-13 12:00 UTC");
    }
}
