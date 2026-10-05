//! The files of a project repository and their current schema versions (DATA-01).

use crate::SchemaVersion;
use serde_json::{json, Value};
use std::collections::HashSet;

pub struct ProjectFile {
    pub path: &'static str,
    pub schema: &'static str,
    pub current: SchemaVersion,
    pub required: bool,
    pub empty: fn() -> Value,
    pub validate: fn(&Value) -> Result<(), String>,
}

pub const STATUSES: [&str; 6] = [
    "Draft",
    "Clarified",
    "Designed",
    "Verified",
    "Released for fabrication",
    "Hardware-validated",
];
pub const BUILD_STYLES: [&str; 3] = ["pcb", "perfboard", "breadboard"];
pub const PART_STYLES: [&str; 2] = ["module", "discrete"];

pub static PROJECT_FILES: &[ProjectFile] = &[
    ProjectFile {
        path: "project.json",
        schema: "ef.project",
        current: SchemaVersion::new(1, 0),
        required: true,
        empty: || {
            json!({"name": "", "target_board": "", "build_style": "pcb", "part_style": "module",
                          "status": "Draft", "pinned": {}, "board_outline": null})
        },
        validate: validate_project,
    },
    ProjectFile {
        path: "requirements.json",
        schema: "ef.requirements",
        current: SchemaVersion::new(1, 0),
        required: true,
        empty: || json!({"items": []}),
        validate: |d| unique_ids(d, "items", "id"),
    },
    ProjectFile {
        path: "interfaces.json",
        schema: "ef.interfaces",
        current: SchemaVersion::new(1, 0),
        required: true,
        empty: || json!({"blocks": []}),
        validate: |d| unique_ids(d, "blocks", "id"),
    },
    ProjectFile {
        path: "parameters.json",
        schema: "ef.parameters",
        current: SchemaVersion::new(1, 0),
        required: true,
        empty: || json!({"params": []}),
        validate: validate_parameters,
    },
    ProjectFile {
        path: "netlist.json",
        schema: "ef.netlist",
        current: SchemaVersion::new(1, 0),
        required: true,
        empty: || json!({"parts": [], "nets": []}),
        validate: validate_netlist,
    },
    ProjectFile {
        path: "geometry.json",
        schema: "ef.geometry",
        current: SchemaVersion::new(1, 0),
        required: true,
        empty: || json!({"views": {}}),
        validate: |d| object_field(d, "views"),
    },
    ProjectFile {
        path: "pinmap.json",
        schema: "ef.pinmap",
        current: SchemaVersion::new(1, 0),
        required: false,
        empty: || json!({"derived_from": "netlist.json", "pins": []}),
        validate: |d| array_field(d, "pins"),
    },
    ProjectFile {
        path: "migrations.json",
        schema: "ef.migrations",
        current: SchemaVersion::new(1, 0),
        required: true,
        empty: || json!({"records": []}),
        validate: |d| array_field(d, "records"),
    },
];

fn array_field(d: &Value, k: &str) -> Result<(), String> {
    d.get(k)
        .and_then(Value::as_array)
        .map(|_| ())
        .ok_or_else(|| format!("\"{k}\" must be an array"))
}

fn object_field(d: &Value, k: &str) -> Result<(), String> {
    d.get(k)
        .and_then(Value::as_object)
        .map(|_| ())
        .ok_or_else(|| format!("\"{k}\" must be an object"))
}

fn unique_ids(d: &Value, arr: &str, key: &str) -> Result<(), String> {
    array_field(d, arr)?;
    let mut seen = HashSet::new();
    for (i, it) in d[arr].as_array().unwrap().iter().enumerate() {
        let id = it
            .get(key)
            .and_then(Value::as_str)
            .ok_or_else(|| format!("{arr}[{i}] has no string \"{key}\""))?;
        if !seen.insert(id.to_string()) {
            return Err(format!("duplicate {key} \"{id}\" in {arr}"));
        }
    }
    Ok(())
}

fn one_of(d: &Value, k: &str, allowed: &[&str]) -> Result<(), String> {
    match d.get(k).and_then(Value::as_str) {
        Some(v) if allowed.contains(&v) => Ok(()),
        Some(v) => Err(format!("\"{k}\" = \"{v}\" is not one of {allowed:?}")),
        None => Err(format!("\"{k}\" missing")),
    }
}

fn validate_project(d: &Value) -> Result<(), String> {
    for k in ["name", "target_board"] {
        d.get(k)
            .and_then(Value::as_str)
            .ok_or_else(|| format!("\"{k}\" must be a string"))?;
    }
    one_of(d, "status", &STATUSES)?;
    one_of(d, "build_style", &BUILD_STYLES)?;
    one_of(d, "part_style", &PART_STYLES)?;
    object_field(d, "pinned")?;
    match d.get("board_outline") {
        None | Some(Value::Null) => Ok(()),
        Some(o) => {
            for k in ["width_mm", "height_mm"] {
                let v = o
                    .get(k)
                    .and_then(Value::as_f64)
                    .ok_or_else(|| format!("board_outline.{k} must be a number"))?;
                if v <= 0.0 {
                    return Err(format!("board_outline.{k} must be > 0"));
                }
            }
            Ok(())
        }
    }
}

fn validate_parameters(d: &Value) -> Result<(), String> {
    unique_ids(d, "params", "name")?;
    for p in d["params"].as_array().unwrap() {
        let n = p["name"].as_str().unwrap();
        p.get("unit")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("parameter {n}: unit required (ED-06)"))?;
        if let (Some(lo), Some(hi)) = (
            p.get("min").and_then(Value::as_f64),
            p.get("max").and_then(Value::as_f64),
        ) {
            if lo > hi {
                return Err(format!("parameter {n}: min > max"));
            }
            if let Some(v) = p.get("value").and_then(Value::as_f64) {
                if v < lo || v > hi {
                    return Err(format!("parameter {n}: value {v} outside [{lo}, {hi}]"));
                }
            }
        }
    }
    Ok(())
}

/// Netlist (INV-08 single source of truth): parts by reference, nets as lists of `REF.PIN`.
fn validate_netlist(d: &Value) -> Result<(), String> {
    unique_ids(d, "parts", "ref")?;
    unique_ids(d, "nets", "name")?;
    let refs: HashSet<&str> = d["parts"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|p| p["ref"].as_str())
        .collect();
    let mut used_pins = HashSet::new();
    for n in d["nets"].as_array().unwrap() {
        let name = n["name"].as_str().unwrap();
        let pins = n
            .get("pins")
            .and_then(Value::as_array)
            .ok_or_else(|| format!("net {name}: pins must be an array"))?;
        for p in pins {
            let p = p
                .as_str()
                .ok_or_else(|| format!("net {name}: pin must be \"REF.PIN\""))?;
            let (r, _) = p
                .split_once('.')
                .ok_or_else(|| format!("net {name}: pin \"{p}\" must be \"REF.PIN\""))?;
            if !refs.contains(r) {
                return Err(format!("net {name}: unknown part \"{r}\""));
            }
            if !used_pins.insert(p.to_string()) {
                return Err(format!("pin {p} is on more than one net"));
            }
        }
    }
    Ok(())
}
