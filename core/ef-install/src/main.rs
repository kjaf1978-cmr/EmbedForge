//! `embedforge-setup`: the bootstrap installer and maintenance tool (SS-01, SS-05, SS-08,
//! SS-09, CM-04, VAPP-01/03/04/05). Run without arguments from the installation medium, it
//! installs interactively; the subcommands are listed by `embedforge-setup help`.

use ef_install::{platform::Sys, Event, HostId, Mode, Options};
use std::io::{BufRead, IsTerminal, Write};
use std::path::{Path, PathBuf};

const HELP: &str = "embedforge-setup — install, update, repair or remove EmbedForge (offline)

USAGE
  embedforge-setup [install] [options]     install from the medium (interactive by default)
  embedforge-setup plan [options]          show what an installation would do, change nothing
  embedforge-setup verify-medium [--medium DIR]
  embedforge-setup update --package DIR [--target DIR]     apply a signed USB update package
  embedforge-setup versions [--target DIR]                 list stored versions (rollback targets)
  embedforge-setup rollback --item ID --to VERSION [--target DIR]
  embedforge-setup baselines [--target DIR]                list app baselines (CM-03)
  embedforge-setup restore-baseline --name NAME [--target DIR]
  embedforge-setup repair [--target DIR]                   full integrity check + offline repair
  embedforge-setup uninstall [--target DIR] [--yes]
  embedforge-setup audit --pid PID [--target DIR]          VAPP-03 dependency audit of a running app
  embedforge-setup vapp [--package DIR] [--no-app] [--target DIR]
                   scripted VAPP-04, VAPP-05 (with a USB update package) and VAPP-03 (starts the
                   app); prints PASS/FAIL per check. It deliberately damages and updates the
                   installation, and leaves it repaired and at its installed versions

OPTIONS
  --medium DIR     installation medium (default: the folder this program is in)
  --target DIR     installation folder (default: /opt/embedforge, C:\\Program Files\\EmbedForge;
                   per user: ~/.local/share/embedforge, %LOCALAPPDATA%\\Programs\\EmbedForge)
  --per-user       install without administrator rights: no drivers, no privileged helper
  --with ID        add an optional pack        --without ID   leave out an optional pack
  --accept ID      accept the terms ID (e.g. webview2-runtime) without being asked
  --yes            do not ask; take the defaults
  --dry-run        record system changes (files under --sysroot, commands listed), run nothing
  --sysroot DIR    with --dry-run: where system files are written
  --json           machine-readable output
  --allow-unsupported-host   install on a host outside HOST-01 (test runners only)
";

struct Args {
    cmd: String,
    medium: Option<PathBuf>,
    target: Option<PathBuf>,
    package: Option<PathBuf>,
    per_user: bool,
    with: Vec<String>,
    without: Vec<String>,
    accept: Vec<String>,
    yes: bool,
    dry_run: bool,
    sysroot: Option<PathBuf>,
    json: bool,
    item: Option<String>,
    to: Option<String>,
    pid: Option<u32>,
    name: Option<String>,
    no_app: bool,
    allow_unsupported: bool,
}

fn parse(mut a: impl Iterator<Item = String>) -> Result<Args, String> {
    let mut r = Args {
        cmd: "install".into(),
        medium: None,
        target: None,
        package: None,
        per_user: false,
        with: vec![],
        without: vec![],
        accept: vec![],
        yes: false,
        dry_run: false,
        sysroot: None,
        json: false,
        item: None,
        to: None,
        pid: None,
        name: None,
        no_app: false,
        allow_unsupported: false,
    };
    let mut first = true;
    while let Some(x) = a.next() {
        let mut val = |name: &str| a.next().ok_or(format!("{name} needs a value"));
        match x.as_str() {
            "--medium" => r.medium = Some(val("--medium")?.into()),
            "--target" => r.target = Some(val("--target")?.into()),
            "--package" => r.package = Some(val("--package")?.into()),
            "--sysroot" => r.sysroot = Some(val("--sysroot")?.into()),
            "--with" => r.with.push(val("--with")?),
            "--without" => r.without.push(val("--without")?),
            "--accept" => r.accept.push(val("--accept")?),
            "--item" => r.item = Some(val("--item")?),
            "--to" => r.to = Some(val("--to")?),
            "--name" => r.name = Some(val("--name")?),
            "--pid" => r.pid = Some(val("--pid")?.parse().map_err(|_| "--pid needs a number")?),
            "--per-user" => r.per_user = true,
            "--no-app" => r.no_app = true,
            "--allow-unsupported-host" => r.allow_unsupported = true,
            "--yes" | "-y" => r.yes = true,
            "--dry-run" => r.dry_run = true,
            "--json" => r.json = true,
            "-h" | "--help" | "help" => r.cmd = "help".into(),
            "-V" | "--version" => r.cmd = "version".into(),
            c if first && !c.starts_with('-') => r.cmd = c.into(),
            other => {
                return Err(format!(
                    "unknown argument {other:?} (see embedforge-setup help)"
                ))
            }
        }
        first = false;
    }
    Ok(r)
}

fn gb(b: u64) -> String {
    format!("{:.2} GB", b as f64 / 1e9)
}

fn self_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| ".".into())
}

fn default_target(mode: Mode) -> PathBuf {
    // a copy inside an installation maintains that installation
    let d = self_dir();
    if let (Some(bin), Some(app)) = (d.file_name(), d.parent()) {
        if bin == "bin" && app.file_name().is_some_and(|n| n == ef_install::APP_CI) {
            if let Some(root) = app.parent() {
                if root.join(ef_install::RECORD).exists() {
                    return root.into();
                }
            }
        }
    }
    let env = |k: &str| std::env::var_os(k).map(PathBuf::from);
    match (cfg!(windows), mode) {
        (true, Mode::System) => env("ProgramFiles")
            .unwrap_or_else(|| "C:\\Program Files".into())
            .join("EmbedForge"),
        (true, Mode::PerUser) => env("LOCALAPPDATA")
            .unwrap_or_default()
            .join("Programs")
            .join("EmbedForge"),
        (false, Mode::System) => "/opt/embedforge".into(),
        (false, Mode::PerUser) => env("XDG_DATA_HOME")
            .unwrap_or_else(|| env("HOME").unwrap_or_default().join(".local/share"))
            .join("embedforge"),
    }
}

fn ask(q: &str) -> String {
    print!("{q} ");
    let _ = std::io::stdout().flush();
    let mut s = String::new();
    let _ = std::io::stdin().lock().read_line(&mut s);
    s.trim().to_string()
}

fn yes_no(q: &str, default: bool) -> bool {
    let a = ask(&format!("{q} [{}]", if default { "Y/n" } else { "y/N" })).to_ascii_lowercase();
    if a.is_empty() {
        default
    } else {
        a.starts_with('y')
    }
}

#[cfg(unix)]
fn is_admin() -> bool {
    // SAFETY: geteuid has no preconditions.
    unsafe { libc::geteuid() == 0 }
}

#[cfg(windows)]
mod win {
    use std::ffi::c_void;
    #[link(name = "shell32")]
    extern "system" {
        fn IsUserAnAdmin() -> i32;
        fn ShellExecuteW(
            hwnd: *mut c_void,
            op: *const u16,
            file: *const u16,
            params: *const u16,
            dir: *const u16,
            show: i32,
        ) -> isize;
    }
    fn w(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }
    pub fn is_admin() -> bool {
        // SAFETY: no arguments.
        unsafe { IsUserAnAdmin() != 0 }
    }
    /// Restarts this program elevated (the UAC prompt); true if the restart was started.
    pub fn relaunch_elevated(args: &str) -> bool {
        let exe = std::env::current_exe().unwrap_or_default();
        let (op, file, params) = (w("runas"), w(&exe.to_string_lossy()), w(args));
        // SAFETY: valid NUL-terminated UTF-16 strings that outlive the call.
        unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                op.as_ptr(),
                file.as_ptr(),
                params.as_ptr(),
                std::ptr::null(),
                1,
            ) > 32
        }
    }
}
#[cfg(windows)]
fn is_admin() -> bool {
    win::is_admin()
}

fn print_plan(p: &ef_install::Plan) {
    println!(
        "EmbedForge {} for {} {} — {} installation into {}",
        p.index.app_version,
        p.index.os,
        p.index.arch,
        if p.mode == Mode::System {
            "system-wide"
        } else {
            "per-user"
        },
        p.target.display()
    );
    println!("\nHost check (HOST-04): profile {:?}", p.host_profile);
    if p.host_findings.is_empty() {
        println!("  no shortfalls");
    }
    for f in &p.host_findings {
        println!(
            "  {:?} {} ({}): found {}, required {} — {}",
            f.severity, f.check, f.requirement, f.found, f.required, f.consequence
        );
    }
    println!("\nPacks to install:");
    for ci in &p.selected {
        let c = p.index.component(ci).unwrap();
        println!(
            "  {:<28} {:<10} {:>10} installed  {}",
            c.ci,
            c.version.to_string(),
            gb(c.installed_size),
            c.title
        );
    }
    if !p.left_out.is_empty() {
        println!("\nLeft out (optional):");
        for l in &p.left_out {
            println!(
                "  {:<28} {:>10}  without it: {}",
                l.ci,
                gb(l.pack_bytes),
                l.consequence
            );
        }
    }
    println!(
        "\nSpace: {} needed (installed tree + recovery store), {} free",
        gb(p.needed_bytes),
        gb(p.free_bytes)
    );
    if !p.missing_functions.is_empty() {
        println!("\nNot available with this installation:");
        for m in &p.missing_functions {
            println!("  - {m}");
        }
    }
    if !p.unbundled_drivers.is_empty() {
        println!("\nUSB drivers not included (licence does not permit redistribution, INV-10):");
        for d in &p.unbundled_drivers {
            println!(
                "  - {}: {} — affected boards: {}",
                d.driver,
                d.reason,
                d.boards.join(", ")
            );
        }
    }
}

fn run() -> Result<i32, String> {
    let a = parse(std::env::args().skip(1))?;
    let keys_owned = ef_integrity::release_keys();
    let keys: Vec<&str> = keys_owned.iter().map(String::as_str).collect();
    let interactive = !a.yes && !a.json && std::io::stdin().is_terminal();
    let mode = if a.per_user {
        Mode::PerUser
    } else {
        Mode::System
    };
    let target_or_default = |m: Mode| a.target.clone().unwrap_or_else(|| default_target(m));
    let mut sys = if a.dry_run {
        let root = a.sysroot.clone().ok_or("--dry-run needs --sysroot DIR")?;
        Sys::scratch(&root)
    } else {
        Sys::real()
    };
    let emit = |v: &dyn erased::Json| v.print();
    match a.cmd.as_str() {
        "help" => print!("{HELP}"),
        "version" => println!("embedforge-setup {}", env!("CARGO_PKG_VERSION")),
        "install" | "plan" => {
            let mut mode = mode;
            if a.cmd == "install" && interactive && !a.per_user && !is_admin() {
                println!("EmbedForge can be installed for all users (needs administrator rights; includes the");
                println!("USB serial setup and the privileged helper) or just for you (no administrator rights).");
                if yes_no("Install for all users?", true) {
                    #[cfg(windows)]
                    {
                        let rest: Vec<String> = std::env::args().skip(1).collect();
                        if win::relaunch_elevated(&rest.join(" ")) {
                            return Ok(0);
                        }
                    }
                    return Err("administrator rights are needed: run with sudo (Linux) or as administrator (Windows), or choose a per-user installation".into());
                }
                mode = Mode::PerUser;
            } else if a.cmd == "install" && mode == Mode::System && !is_admin() && !a.dry_run {
                return Err("a system-wide installation needs administrator rights (sudo); use --per-user otherwise".into());
            }
            let mut opt = Options {
                medium: a.medium.clone().unwrap_or_else(self_dir),
                target: target_or_default(mode),
                mode,
                trusted_keys: keys_owned.clone(),
                with: a.with.clone(),
                without: a.without.clone(),
                accepted: a.accept.clone(),
                host: HostId::detect(),
                host_facts: None,
                allow_unsupported_host: a.allow_unsupported,
            };
            let mut plan = ef_install::plan(&opt).map_err(|e| e.to_string())?;
            if interactive {
                print_plan(&plan);
                let optional: Vec<_> = plan
                    .index
                    .components
                    .iter()
                    .filter(|c| c.optional && !plan.not_for_this_host.contains(&c.ci))
                    .cloned()
                    .collect();
                if !optional.is_empty() && a.cmd == "install" {
                    println!();
                    for c in optional {
                        let now = plan.selected.contains(&c.ci);
                        let size: u64 = c.parts.iter().map(|p| p.size).sum();
                        if yes_no(
                            &format!("Install optional pack \"{}\" ({})?", c.title, gb(size)),
                            now,
                        ) {
                            opt.without.retain(|x| x != &c.ci);
                            opt.with.push(c.ci.clone());
                        } else {
                            opt.with.retain(|x| x != &c.ci);
                            opt.without.push(c.ci.clone());
                        }
                    }
                }
                for n in plan.notices_to_accept.clone() {
                    let text =
                        std::fs::read_to_string(opt.medium.join(&n.text_file)).unwrap_or_default();
                    println!("\n==== {} ====\n{text}\n====", n.title);
                    if ask("Type ACCEPT to accept these terms:") == "ACCEPT" {
                        opt.accepted.push(n.id.clone());
                    }
                }
                plan = ef_install::plan(&opt).map_err(|e| e.to_string())?;
            }
            if a.json {
                emit(&plan);
            } else if !interactive {
                print_plan(&plan);
            }
            if !plan.blockers.is_empty() {
                eprintln!("\nThe installation cannot go ahead:");
                for b in &plan.blockers {
                    eprintln!("  - {b}");
                }
                return Ok(2);
            }
            if a.cmd == "plan" {
                return Ok(0);
            }
            if interactive && !yes_no("\nStart the installation?", true) {
                return Ok(1);
            }
            let json = a.json;
            let report = ef_install::install(&plan, &opt, &mut sys, &mut |e| {
                if json {
                    return;
                }
                match e {
                    Event::Verifying { done, total } => {
                        println!("  checking the medium: {:>3} %", done * 100 / total.max(1))
                    }
                    Event::Estimate { seconds } => println!(
                        "  expected remaining duration: about {} min",
                        seconds.div_ceil(60)
                    ),
                    Event::Unpacking { ci, n, of } => println!("  [{n}/{of}] {ci}"),
                    Event::Activating => println!("  activating the installed set"),
                    Event::Integrating(s) => println!("  {s}"),
                    Event::Warning(w) => println!("  note: {w}"),
                }
            })
            .map_err(|e| e.to_string())?;
            if json {
                emit(&report);
            } else {
                println!(
                    "\nEmbedForge {} is installed in {} ({:.0} s).",
                    plan.index.app_version,
                    plan.target.display(),
                    report.seconds
                );
                println!(
                    "Start it from the applications menu, or run {}",
                    ef_install::platform::app_binary(&plan.target).display()
                );
            }
            if a.dry_run && !json {
                println!("\nDry run — commands that would have run:");
                for c in &sys.commands {
                    println!("  {}", c.join(" "));
                }
            }
        }
        "verify-medium" => {
            let medium = a.medium.clone().unwrap_or_else(self_dir);
            let idx = ef_pack::load_index(&medium, ef_pack::MEDIUM_INDEX, &keys)
                .map_err(|e| e.to_string())?;
            let all: Vec<&str> = idx.components.iter().map(|c| c.ci.as_str()).collect();
            let probs = ef_pack::verify_contents(&medium, &idx, &all, &mut |_| {});
            if a.json {
                emit(&probs);
            }
            if probs.is_empty() {
                println!(
                    "medium OK: signature valid, {} packs and {} files intact",
                    all.len(),
                    idx.files.len()
                );
            } else {
                for p in &probs {
                    println!("DAMAGED {}: {}", p.file, p.problem);
                }
                return Ok(2);
            }
        }
        "update" => {
            let pkg = a.package.clone().ok_or("update needs --package DIR")?;
            let r = ef_install::update(&pkg, &target_or_default(mode), &keys)
                .map_err(|e| e.to_string())?;
            if a.json {
                emit(&r);
            } else {
                println!("{}", r.message);
                for c in &r.changes {
                    println!(
                        "  {}: {} → {}",
                        c.ci,
                        c.from.as_deref().unwrap_or("(new)"),
                        c.to
                    );
                }
            }
            if r.rolled_back {
                return Ok(2);
            }
        }
        "versions" => {
            let v = ef_install::versions(&target_or_default(mode)).map_err(|e| e.to_string())?;
            if a.json {
                emit(&v);
            } else {
                for (ci, vs, act) in v {
                    let list: Vec<String> = vs
                        .iter()
                        .map(|x| {
                            if Some(x) == act.as_ref() {
                                format!("[{x}]")
                            } else {
                                x.to_string()
                            }
                        })
                        .collect();
                    println!("{ci:<28} {}", list.join(" "));
                }
            }
        }
        "rollback" => {
            let item = a.item.clone().ok_or("rollback needs --item ID")?;
            let to = semver::Version::parse(a.to.as_deref().ok_or("rollback needs --to VERSION")?)
                .map_err(|e| e.to_string())?;
            let c = ef_install::rollback(&target_or_default(mode), &item, &to, &keys)
                .map_err(|e| e.to_string())?;
            if a.json {
                emit(&c);
            } else {
                println!(
                    "{}: {} → {} (restored offline from the recovery store)",
                    c.ci,
                    c.from.unwrap_or_default(),
                    c.to
                );
            }
        }
        "baselines" => {
            let b = ef_install::baselines(&target_or_default(mode)).map_err(|e| e.to_string())?;
            if a.json {
                emit(&b);
            } else {
                for x in b {
                    let set: Vec<String> =
                        x.versions.iter().map(|(c, v)| format!("{c} {v}")).collect();
                    println!("{:<24} {}  {}", x.name, x.created, set.join(", "));
                }
            }
        }
        "restore-baseline" => {
            let name = a.name.clone().ok_or("restore-baseline needs --name NAME")?;
            let c = ef_install::restore_baseline(&target_or_default(mode), &name, &keys)
                .map_err(|e| e.to_string())?;
            if a.json {
                emit(&c);
            } else {
                println!(
                    "baseline {name} restored offline; changed: {}",
                    if c.is_empty() {
                        "nothing".into()
                    } else {
                        c.join(", ")
                    }
                );
            }
        }
        "repair" => {
            let r =
                ef_install::repair(&target_or_default(mode), &keys).map_err(|e| e.to_string())?;
            if a.json {
                emit(&r);
            } else {
                println!(
                    "{} components, {} files fully hashed",
                    r.components, r.report.checked_full
                );
                for p in &r.report.findings {
                    println!("  found {}: {:?}", p.path, p.problem);
                }
                for x in &r.restored {
                    println!("  restored {x}");
                }
                for x in &r.unrecoverable {
                    println!("  NOT RESTORED {x}");
                }
                if r.report.findings.is_empty() && r.component_problems.is_empty() {
                    println!("installation intact");
                }
            }
            if !r.unrecoverable.is_empty() {
                return Ok(2);
            }
        }
        "uninstall" => {
            let target = target_or_default(mode);
            if interactive
                && !yes_no(
                    &format!(
                        "Remove EmbedForge from {}? Your projects are not touched.",
                        target.display()
                    ),
                    false,
                )
            {
                return Ok(1);
            }
            let w = ef_install::uninstall(&target, &mut sys).map_err(|e| e.to_string())?;
            for x in w {
                println!("note: {x}");
            }
            println!("EmbedForge was removed from {}", target.display());
        }
        "audit" => {
            let pid = a.pid.ok_or("audit needs --pid PID")?;
            let target = target_or_default(mode);
            let r = ef_install::audit::audit(pid, &target).map_err(|e| e.to_string())?;
            if a.json {
                emit(&r);
            } else {
                use ef_install::audit::Class;
                println!(
                    "VAPP-03 audit of {} process(es) {:?}",
                    r.processes.len(),
                    r.processes
                );
                println!(
                    "  inside the app directory: {}",
                    r.count(Class::AppDirectory)
                );
                println!(
                    "  OS standard libraries and data: {}",
                    r.count(Class::OsStandard)
                );
                println!("  app's own per-user data: {}", r.count(Class::AppData));
                let out = r.outside();
                println!("  outside both: {}", out.len());
                for f in &out {
                    println!("    {f}");
                }
                println!("{}", if out.is_empty() { "PASS" } else { "FAIL" });
            }
            if !r.outside().is_empty() {
                return Ok(2);
            }
        }
        "vapp" => {
            let target = target_or_default(mode);
            let mut steps = vec![ef_install::vapp::vapp04(&target, &keys)];
            match &a.package {
                Some(p) => steps.push(ef_install::vapp::vapp05(&target, &keys, p)),
                None => println!(
                    "VAPP-05 skipped: no --package (the USB update package of the procedure)"
                ),
            }
            if !a.no_app {
                steps.push(ef_install::vapp::vapp03(
                    &target,
                    std::time::Duration::from_secs(20),
                ));
            }
            if a.json {
                emit(&steps);
            } else {
                for s in &steps {
                    let verdict = if s.pass { "PASS" } else { "FAIL" };
                    println!("{verdict} {} — {}", s.id, s.title);
                    for d in &s.details {
                        println!("    {d}");
                    }
                }
            }
            if steps.iter().any(|s| !s.pass) {
                return Ok(2);
            }
        }
        other => {
            return Err(format!(
                "unknown command {other:?} (see embedforge-setup help)"
            ))
        }
    }
    Ok(0)
}

mod erased {
    pub trait Json {
        fn print(&self);
    }
    impl<T: serde::Serialize> Json for T {
        fn print(&self) {
            println!("{}", serde_json::to_string_pretty(self).unwrap_or_default());
        }
    }
}

fn main() {
    let code = match run() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("embedforge-setup: {e}");
            1
        }
    };
    if cfg!(windows) && std::io::stdin().is_terminal() && std::env::args().len() == 1 {
        // started by double-click: keep the console window open
        let _ = ask("\nPress Enter to close this window.");
    }
    std::process::exit(code);
}
