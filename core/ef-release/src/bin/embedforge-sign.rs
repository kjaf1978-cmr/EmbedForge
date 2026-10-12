//! `embedforge-sign`: signs an EmbedForge signing kit on the owner's PC (SEC-02, TEST-04).
//!
//! Started by `SIGN-RELEASE.cmd` in the kit. It asks for the primary key file (drag it onto the
//! window) and its password once, then signs, assembles and verifies every medium in the kit
//! into `signed/`. Nothing is sent anywhere; the secret key is read only from the path given.

use ef_release::kit::{find_media, sign_medium, Authenticode, KeySigner};
use std::io::{BufRead, IsTerminal, Write};
use std::path::{Path, PathBuf};

fn ask(q: &str) -> String {
    print!("{q}");
    let _ = std::io::stdout().flush();
    let mut s = String::new();
    let _ = std::io::stdin().lock().read_line(&mut s);
    s.trim().trim_matches('"').trim_matches('\'').to_string()
}

fn signtool(f: &Path) -> Result<(), String> {
    let cert = std::env::var("EF_CERT_SHA1").unwrap_or_default();
    let ts = std::env::var("EF_TIMESTAMP_URL").unwrap_or_default();
    let tool = std::env::var("EF_SIGNTOOL").unwrap_or_else(|_| "signtool.exe".into());
    let st = std::process::Command::new(&tool)
        .args([
            "sign",
            "/sha1",
            &cert,
            "/fd",
            "SHA256",
            "/tr",
            &ts,
            "/td",
            "SHA256",
            "/d",
            "EmbedForge",
        ])
        .arg(f)
        .status()
        .map_err(|e| format!("{tool}: {e}"))?;
    if st.success() {
        Ok(())
    } else {
        Err(format!("Authenticode signing of {} failed", f.display()))
    }
}

fn run() -> Result<(), String> {
    let mut kit: Option<PathBuf> = None;
    let mut key: Option<PathBuf> = None;
    let mut out: Option<PathBuf> = None;
    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "--kit" => kit = it.next().map(PathBuf::from),
            "--key" => key = it.next().map(PathBuf::from),
            "--out" => out = it.next().map(PathBuf::from),
            "--version" => {
                println!("embedforge-sign {}", env!("CARGO_PKG_VERSION"));
                return Ok(());
            }
            _ => return Err("usage: embedforge-sign [--kit DIR] [--key FILE] [--out DIR]".into()),
        }
    }
    let kit = kit.unwrap_or_else(|| {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf))
            .unwrap_or_else(|| ".".into())
    });
    let out = out.unwrap_or_else(|| kit.join("signed"));
    let media = find_media(&kit);
    if media.is_empty() {
        return Err(format!("no media found in {}", kit.display()));
    }
    println!("EmbedForge release signing\n");
    println!("Media in this kit:");
    for m in &media {
        println!("  - {}", m.name);
    }
    let trusted = ef_integrity::release_keys();
    let key = match key {
        Some(k) => k,
        None => {
            println!("\nPlug in a USB stick with your keys.");
            PathBuf::from(ask(
                "Drag the file embedforge-primary.key onto this window, then press Enter:\n> ",
            ))
        }
    };
    println!("\nEnter the password of this key (the typing is not shown), then press Enter.");
    let signer = KeySigner::from_file(&key)?;
    let ac_configured =
        std::env::var("EF_CERT_SHA1").is_ok() && std::env::var("EF_TIMESTAMP_URL").is_ok();
    if !ac_configured {
        println!(
            "\nNote: no Authenticode certificate is configured, so the Windows programs are signed"
        );
        println!(
            "with your release key only. Windows SmartScreen may warn when they are first started."
        );
    }
    let ac: Option<Authenticode> = if ac_configured { Some(&signtool) } else { None };
    std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
    let mut report = String::new();
    let mut failed = false;
    for m in &media {
        println!("\n=== {} ===", m.name);
        match sign_medium(m, &out, &signer, &trusted, ac, &mut |l| println!("  {l}")) {
            Ok(r) => {
                let line = format!(
                    "PASS {}  {} component(s)  medium.json SHA-256 {}",
                    r.name, r.components, r.index_sha256
                );
                println!("{line}");
                report.push_str(&line);
                report.push('\n');
            }
            Err(e) => {
                failed = true;
                let line = format!("FAIL {}: {e}", m.name);
                println!("{line}");
                report.push_str(&line);
                report.push('\n');
                if e.contains("not one of the EmbedForge release keys") {
                    break;
                }
            }
        }
    }
    std::fs::write(out.join("RESULT.txt"), &report).map_err(|e| e.to_string())?;
    println!("\nThe signed media are in {}", out.display());
    println!("Result: {}", out.join("RESULT.txt").display());
    if failed {
        return Err("at least one medium failed; nothing from it may be released".into());
    }
    println!("\nRemove the USB stick with your keys now.");
    Ok(())
}

fn main() {
    let code = match run() {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("\nembedforge-sign: {e}");
            1
        }
    };
    if std::io::stdin().is_terminal() {
        let _ = ask("\nPress Enter to close this window.");
    }
    std::process::exit(code);
}
