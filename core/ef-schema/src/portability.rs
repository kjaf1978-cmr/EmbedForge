//! DATA-03: project files contain no absolute paths and no host-specific data.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HostSpecificFinding {
    pub file: String,
    pub json_path: String,
    pub value: String,
    pub reason: &'static str,
}

const PATH_KEYS: [&str; 6] = ["path", "file", "dir", "source", "library", "image"];

fn key_is_pathlike(k: &str) -> bool {
    let k = k.to_ascii_lowercase();
    PATH_KEYS
        .iter()
        .any(|p| k == *p || k.ends_with(&format!("_{p}")) || k.ends_with(&format!("{p}s")))
}

fn looks_absolute(s: &str) -> bool {
    let b = s.as_bytes();
    s.starts_with('/')
        || s.starts_with('~')
        || s.starts_with("\\\\")
        || (b.len() >= 3
            && b[0].is_ascii_alphabetic()
            && b[1] == b':'
            && (b[2] == b'\\' || b[2] == b'/'))
        || s.starts_with("file:")
}

fn host_marker(s: &str) -> Option<&'static str> {
    let l = s.to_ascii_lowercase();
    if l.contains("/home/") || l.contains("\\users\\") || l.contains("/users/") {
        Some("contains a user home directory")
    } else if l.contains("/dev/tty")
        || (l.starts_with("com") && l[3..].chars().all(|c| c.is_ascii_digit()) && l.len() > 3)
    {
        Some("contains a host serial-port name (board/port choice is stored per host, not in the project)")
    } else {
        None
    }
}

/// Returns every string that is an absolute path in a path-like field, or that carries a
/// host marker anywhere. KiCad-style net names such as "/RESET" are not path-like fields
/// and are therefore not flagged.
pub fn find_host_specific(file: &str, doc: &Value) -> Vec<HostSpecificFinding> {
    let mut out = Vec::new();
    walk(file, doc, "$", false, &mut out);
    out
}

fn walk(file: &str, v: &Value, at: &str, pathlike: bool, out: &mut Vec<HostSpecificFinding>) {
    match v {
        Value::Object(m) => {
            for (k, x) in m {
                walk(file, x, &format!("{at}.{k}"), key_is_pathlike(k), out);
            }
        }
        Value::Array(a) => {
            for (i, x) in a.iter().enumerate() {
                walk(file, x, &format!("{at}[{i}]"), pathlike, out);
            }
        }
        Value::String(s) => {
            let reason = if pathlike && looks_absolute(s) {
                Some("absolute path")
            } else {
                host_marker(s)
            };
            if let Some(reason) = reason {
                out.push(HostSpecificFinding {
                    file: file.into(),
                    json_path: at.into(),
                    value: s.clone(),
                    reason,
                });
            }
        }
        _ => {}
    }
}
