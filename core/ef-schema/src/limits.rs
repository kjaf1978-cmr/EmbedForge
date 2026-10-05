//! First-release project size limits (DATA-04, as set by D14): warnings, not errors.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub max_parts: usize,
    pub max_nets: usize,
    pub max_longest_side_mm: f64,
    pub max_area_mm2: f64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_parts: 100,
            max_nets: 120,
            max_longest_side_mm: 110.0,
            max_area_mm2: 10_000.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SizeWarning {
    pub limit: &'static str,
    pub value: f64,
    pub max: f64,
    pub consequence: &'static str,
}

const CONSEQUENCE: &str =
    "outside the supported project size: PERF targets and VAPP-06 do not apply (DATA-04)";

pub fn check_limits(project: &Value, netlist: &Value, l: &Limits) -> Vec<SizeWarning> {
    let mut w = Vec::new();
    let parts = netlist
        .get("parts")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let nets = netlist
        .get("nets")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    if parts > l.max_parts {
        w.push(SizeWarning {
            limit: "parts",
            value: parts as f64,
            max: l.max_parts as f64,
            consequence: CONSEQUENCE,
        });
    }
    if nets > l.max_nets {
        w.push(SizeWarning {
            limit: "nets",
            value: nets as f64,
            max: l.max_nets as f64,
            consequence: CONSEQUENCE,
        });
    }
    if let Some(o) = project.get("board_outline").filter(|o| !o.is_null()) {
        let (wd, ht) = (
            o["width_mm"].as_f64().unwrap_or(0.0),
            o["height_mm"].as_f64().unwrap_or(0.0),
        );
        let longest = wd.max(ht);
        if longest > l.max_longest_side_mm {
            w.push(SizeWarning {
                limit: "longest side (mm)",
                value: longest,
                max: l.max_longest_side_mm,
                consequence: CONSEQUENCE,
            });
        }
        if wd * ht > l.max_area_mm2 {
            w.push(SizeWarning {
                limit: "area (mm²)",
                value: wd * ht,
                max: l.max_area_mm2,
                consequence: CONSEQUENCE,
            });
        }
    }
    w
}
