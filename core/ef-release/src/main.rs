//! ef-release — run on the offline release machine only (SEC-02, docs/release/SIGNING.md).
//!
//!   ef-release keygen   --dir <dir> --name <name>
//!   ef-release manifest --root <app tree> --app-version <v>
//!   ef-release pack     --src <dir> --out <dir> --ci <id> --kind <kind> --version <v>
//!                       --license <spdx> --changelog <text> [--date <yyyy-mm-dd>]
//!                       [--depends <ci>=<req>]… [--max-part <bytes>] [--level <1-19>]
//!   ef-release depset   --dir <deps dir> --app-version <v>
//!   ef-release medium   --spec <medium-spec.json> --out <dir>
//!   ef-release sign     --key <secret key> --label <text> <file>…
//!
//! The key password is read from EF_SIGN_PASSWORD. Nothing here touches the network.

use ef_cm::{ChangelogEntry, CiKind};
use semver::{Version, VersionReq};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::process::ExitCode;

struct Args(Vec<String>);

impl Args {
    fn opt(&mut self, name: &str) -> Option<String> {
        let i = self.0.iter().position(|a| a == name)?;
        self.0.remove(i);
        (i < self.0.len()).then(|| self.0.remove(i))
    }
    fn req(&mut self, name: &str) -> Result<String, String> {
        self.opt(name).ok_or(format!("{name} is required"))
    }
    fn all(&mut self, name: &str) -> Vec<String> {
        std::iter::from_fn(|| self.opt(name)).collect()
    }
}

fn password() -> Result<String, String> {
    std::env::var("EF_SIGN_PASSWORD")
        .map_err(|_| "set EF_SIGN_PASSWORD to the key password".to_string())
}

fn run() -> Result<(), String> {
    let mut a = Args(std::env::args().skip(1).collect());
    if a.0.is_empty() {
        return Err("no command; see the header of ef-release/src/main.rs".into());
    }
    let cmd = a.0.remove(0);
    match cmd.as_str() {
        "keygen" => {
            let dir = PathBuf::from(a.req("--dir")?);
            let pk = ef_release::keygen(&dir, &a.req("--name")?, &password()?)?;
            println!("public key (EF_TRUSTED_KEYS): {pk}");
        }
        "manifest" => {
            let p = ef_release::app_manifest(
                &PathBuf::from(a.req("--root")?),
                &a.req("--app-version")?,
            )?;
            println!("{}", p.display());
        }
        "pack" => {
            let version = Version::parse(&a.req("--version")?).map_err(|e| e.to_string())?;
            let kind: CiKind = serde_json::from_value(serde_json::Value::String(a.req("--kind")?))
                .map_err(|e| format!("--kind: {e}"))?;
            let mut depends = BTreeMap::new();
            for d in a.all("--depends") {
                let (ci, req) = d
                    .split_once('=')
                    .ok_or("--depends takes <ci>=<requirement>")?;
                depends.insert(
                    ci.to_string(),
                    VersionReq::parse(req).map_err(|e| e.to_string())?,
                );
            }
            let spec = ef_pack::PackSpec {
                ci: a.req("--ci")?,
                kind,
                changelog: vec![ChangelogEntry {
                    version: version.clone(),
                    date: a.opt("--date").unwrap_or_default(),
                    text: a.req("--changelog")?,
                }],
                version,
                depends,
                license: a.req("--license")?,
            };
            let max = a
                .opt("--max-part")
                .map(|s| s.parse::<u64>().map_err(|e| e.to_string()))
                .transpose()?
                .unwrap_or(ef_pack::MAX_PART_BYTES);
            let level = a
                .opt("--level")
                .map(|s| s.parse::<i32>().map_err(|e| e.to_string()))
                .transpose()?
                .unwrap_or(19);
            let (m, p) = ef_pack::build_pack(
                &spec,
                &PathBuf::from(a.req("--src")?),
                &PathBuf::from(a.req("--out")?),
                max,
                level,
            )
            .map_err(|e| e.to_string())?;
            println!(
                "{} ({} parts, {} files)",
                p.display(),
                m.parts.len(),
                m.files.len()
            );
        }
        "depset" => {
            let p = ef_release::depset(&PathBuf::from(a.req("--dir")?), &a.req("--app-version")?)?;
            println!("{}", p.display());
        }
        "medium" => {
            let spec_path = PathBuf::from(a.req("--spec")?);
            let spec: ef_release::MediumSpec = serde_json::from_str(
                &std::fs::read_to_string(&spec_path).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            let p = ef_release::assemble_medium(&spec, &PathBuf::from(a.req("--out")?))?;
            println!("{}", p.display());
        }
        "sign" => {
            let sk = ef_release::load_secret_key(&PathBuf::from(a.req("--key")?), &password()?)?;
            let label = a.req("--label")?;
            if a.0.is_empty() {
                return Err("no files to sign".into());
            }
            for f in &a.0 {
                println!(
                    "{}",
                    ef_release::sign_file(&sk, &PathBuf::from(f), &label)?.display()
                );
            }
        }
        other => return Err(format!("unknown command {other}")),
    }
    if let Some(x) = a.0.first().filter(|_| cmd != "sign") {
        return Err(format!("unexpected argument {x}"));
    }
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("ef-release: {e}");
            ExitCode::FAILURE
        }
    }
}
