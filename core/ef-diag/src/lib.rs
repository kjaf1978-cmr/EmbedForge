//! Self-diagnosis (DIAG-01). Increment 1 implements (a) bundled component integrity and
//! (f) storage headroom. Items (b)–(e) report "not yet available" with the increment that
//! delivers them, so the report never claims a check it did not perform.

use ef_cm::ObjectStore;
use ef_host::HostFacts;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Pass,
    Warn,
    Fail,
    NotYetAvailable,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Section {
    pub id: char,
    pub title: &'static str,
    pub status: Status,
    pub details: Vec<String>,
    pub remediation: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Report {
    pub app_version: String,
    pub sections: Vec<Section>,
}

impl Report {
    pub fn overall(&self) -> Status {
        let s: Vec<Status> = self.sections.iter().map(|x| x.status).collect();
        if s.contains(&Status::Fail) {
            Status::Fail
        } else if s.contains(&Status::Warn) {
            Status::Warn
        } else {
            Status::Pass
        }
    }

    pub fn to_text(&self) -> String {
        let mut out = format!(
            "EmbedForge {} — self-diagnosis (DIAG-01)\nOverall: {:?}\n",
            self.app_version,
            self.overall()
        );
        for s in &self.sections {
            out.push_str(&format!("\n({}) {} — {:?}\n", s.id, s.title, s.status));
            for d in &s.details {
                out.push_str(&format!("    {d}\n"));
            }
            for r in &s.remediation {
                out.push_str(&format!("    → {r}\n"));
            }
        }
        out
    }
}

pub struct Context<'a> {
    pub app_version: String,
    pub install_root: PathBuf,
    pub trusted_keys: Vec<&'a str>,
    pub recovery: Option<ObjectStore>,
    pub host: HostFacts,
    /// true = DIAG-01 "full verification on demand": every deferred file is hashed too
    pub full: bool,
    /// Headroom thresholds in GB (Increment 1 defaults; reviewed in Increment 8 with real sizes)
    pub warn_free_gb: f64,
    pub fail_free_gb: f64,
}

fn later(id: char, title: &'static str, inc: &str) -> Section {
    Section {
        id,
        title,
        status: Status::NotYetAvailable,
        details: vec![format!("delivered in {inc}")],
        remediation: vec![],
    }
}

pub fn run(ctx: &Context) -> Report {
    let mut sections = vec![integrity(ctx)];
    sections.push(later(
        'b',
        "Toolchain health (test compilation)",
        "Increment 2",
    ));
    sections.push(later('c', "USB/serial and driver status", "Increment 2"));
    sections.push(later('d', "LLM runtime health", "Increment 3"));
    sections.push(later('e', "Emulator health", "Increment 5"));
    sections.push(storage(ctx));
    Report {
        app_version: ctx.app_version.clone(),
        sections,
    }
}

fn integrity(ctx: &Context) -> Section {
    let title = "Bundled component integrity (SS-08)";
    let m = match ef_integrity::load_manifest(&ctx.install_root, &ctx.trusted_keys) {
        Ok(m) => m,
        Err(e) => return Section { id: 'a', title, status: Status::Fail, details: vec![e.to_string()],
            remediation: vec!["Reinstall from the signed installation medium; the manifest itself cannot be trusted.".into()] },
    };
    let r = match ef_integrity::check_startup(&ctx.install_root, &m) {
        Ok(r) => r,
        Err(e) => {
            return Section {
                id: 'a',
                title,
                status: Status::Fail,
                details: vec![e.to_string()],
                remediation: vec![],
            }
        }
    };
    let mut findings = r.findings.clone();
    let mut details = vec![format!(
        "{} files fully hashed, {} checked by size",
        r.checked_full, r.checked_quick
    )];
    if ctx.full {
        match ef_integrity::check_full(&ctx.install_root, &m, &r.background_queue) {
            Ok(bg) => {
                details.push(format!(
                    "{} deferred files fully hashed (full verification)",
                    r.background_queue.len()
                ));
                findings.extend(bg);
            }
            Err(e) => details.push(format!("full verification error: {e}")),
        }
    } else {
        details.push(format!(
            "{} deferred files queued for background hashing",
            r.background_queue.len()
        ));
    }
    for f in &findings {
        details.push(format!("{}: {:?}", f.path, f.problem));
    }
    let (status, remediation) = if findings.is_empty() {
        (Status::Pass, vec![])
    } else if ctx.recovery.is_some() {
        (Status::Fail, vec!["Run \"Repair\": affected files are restored from the local recovery store (no network needed).".into()])
    } else {
        (Status::Fail, vec!["No recovery store found: reinstall the affected pack from the installation medium.".into()])
    };
    Section {
        id: 'a',
        title,
        status,
        details,
        remediation,
    }
}

fn storage(ctx: &Context) -> Section {
    let free = ctx.host.free_disk_gb;
    let details = vec![format!("{free:.1} GB free on the installation volume")];
    let (status, remediation) = if free < ctx.fail_free_gb {
        (Status::Fail, vec![format!("Free at least {:.0} GB: updates, the recovery store (CM-09) and builds will fail.", ctx.warn_free_gb),
                            "Lower the recovery-store retention limit (Settings → Recovery) to remove old versions.".into()])
    } else if free < ctx.warn_free_gb {
        (
            Status::Warn,
            vec!["Free space is low; consider lowering the recovery-store retention limit.".into()],
        )
    } else {
        (Status::Pass, vec![])
    };
    Section {
        id: 'f',
        title: "Storage headroom",
        status,
        details,
        remediation,
    }
}
