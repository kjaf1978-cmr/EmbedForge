//! `ef-release`: release-time packaging command line (see the library documentation).

use ef_pack::{MAX_PART_BYTES, MEDIUM_INDEX};
use ef_release::*;
use std::path::PathBuf;

struct Args {
    cmd: String,
    spec: Option<PathBuf>,
    staging: Option<PathBuf>,
    out: Option<PathBuf>,
    medium: Option<PathBuf>,
    keys: Vec<String>,
    index: Option<String>,
    part_bytes: u64,
    level: i32,
}

fn parse() -> Result<Args, String> {
    let mut it = std::env::args().skip(1);
    let cmd = it
        .next()
        .ok_or("missing command: components | medium | verify")?;
    let mut a = Args {
        cmd,
        spec: None,
        staging: None,
        out: None,
        medium: None,
        keys: vec![],
        index: None,
        part_bytes: MAX_PART_BYTES,
        level: 9,
    };
    while let Some(x) = it.next() {
        let mut v = || it.next().ok_or(format!("{x} needs a value"));
        match x.as_str() {
            "--spec" => a.spec = Some(v()?.into()),
            "--staging" => a.staging = Some(v()?.into()),
            "--out" => a.out = Some(v()?.into()),
            "--medium" => a.medium = Some(v()?.into()),
            "--key" => a.keys.push(v()?),
            "--index" => a.index = Some(v()?),
            "--part-bytes" => {
                a.part_bytes = v()?.parse().map_err(|_| "--part-bytes needs a number")?
            }
            "--level" => a.level = v()?.parse().map_err(|_| "--level needs a number")?,
            o => return Err(format!("unknown argument {o}")),
        }
    }
    Ok(a)
}

fn main() {
    let r = parse().and_then(|a| match a.cmd.as_str() {
        "components" => {
            let spec = load_spec(a.spec.as_deref().ok_or("--spec")?)?;
            components(&spec, a.staging.as_deref().ok_or("--staging")?)
        }
        "medium" => {
            let spec = load_spec(a.spec.as_deref().ok_or("--spec")?)?;
            medium(
                &spec,
                a.staging.as_deref().ok_or("--staging")?,
                a.out.as_deref().ok_or("--out")?,
                a.part_bytes,
                a.level,
            )
        }
        "verify" => {
            if a.keys.is_empty() {
                return Err("verify needs --key".into());
            }
            verify(
                a.medium.as_deref().ok_or("--medium")?,
                &a.keys,
                a.index.as_deref().unwrap_or(MEDIUM_INDEX),
            )
        }
        c => Err(format!("unknown command {c}")),
    });
    if let Err(e) = r {
        eprintln!("ef-release: {e}");
        std::process::exit(1);
    }
}
