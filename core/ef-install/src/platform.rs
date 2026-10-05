//! Host integration of an installation (SS-04, SS-05, SS-01 dependency sets).
//!
//! Everything outside the install root is written through [`Sys`]: files are placed under
//! `Sys::root` (`/` in production, a scratch directory in tests) and commands are either run
//! or only recorded. Every file written is recorded in the install record, so that
//! uninstallation removes exactly those files.

use crate::{io, Event, InstallError, InstallRecord, Mode, Plan, APP_CI};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub struct Sys {
    /// Prefix for every absolute host path (`/` or `C:\` in production).
    pub root: PathBuf,
    /// false = commands are recorded only (tests and `--dry-run`).
    pub execute: bool,
    pub commands: Vec<Vec<String>>,
    /// The person installing (for serial-port group membership).
    pub user: Option<String>,
    /// Home directory for per-user menu entries.
    pub home: Option<PathBuf>,
}

impl Sys {
    pub fn real() -> Self {
        let user = std::env::var("SUDO_USER")
            .ok()
            .filter(|u| !u.is_empty() && u != "root");
        let home =
            std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
        Self {
            root: PathBuf::from(if cfg!(windows) { "C:\\" } else { "/" }),
            execute: true,
            commands: vec![],
            user,
            home,
        }
    }

    pub fn scratch(root: &Path) -> Self {
        Self {
            root: root.into(),
            execute: false,
            commands: vec![],
            user: Some("tester".into()),
            home: Some(root.join("home/tester")),
        }
    }

    /// Maps an absolute host path into `root`.
    pub fn path(&self, abs: &str) -> PathBuf {
        if self.execute {
            return PathBuf::from(abs);
        }
        let rel = abs.trim_start_matches(['/', '\\']);
        let rel = rel.strip_prefix("C:\\").unwrap_or(rel);
        self.root.join(rel)
    }

    fn write(
        &mut self,
        abs: &str,
        text: &str,
        rec: &mut InstallRecord,
    ) -> Result<(), InstallError> {
        let p = self.path(abs);
        if let Some(d) = p.parent() {
            io(d, fs::create_dir_all(d))?;
        }
        io(&p, fs::write(&p, text))?;
        if !rec.system_files.iter().any(|f| f == abs) {
            rec.system_files.push(abs.into());
        }
        Ok(())
    }

    /// Runs (or records) a command; returns its standard output.
    pub fn run(&mut self, argv: &[&str]) -> Result<String, String> {
        self.commands
            .push(argv.iter().map(|s| s.to_string()).collect());
        if !self.execute {
            return Ok(String::new());
        }
        let out = Command::new(argv[0])
            .args(&argv[1..])
            .output()
            .map_err(|e| format!("{}: {e}", argv.join(" ")))?;
        if out.status.success() {
            Ok(String::from_utf8_lossy(&out.stdout).into_owned())
        } else {
            Err(format!(
                "{} failed: {}",
                argv.join(" "),
                String::from_utf8_lossy(&out.stderr).trim()
            ))
        }
    }

    /// Runs a read-only query; `None` when commands are only recorded.
    fn query(&mut self, argv: &[&str]) -> Option<String> {
        if !self.execute {
            return None;
        }
        Command::new(argv[0])
            .args(&argv[1..])
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
    }
}

pub const HELPER_SOCKET: &str = "/run/embedforge/helper.sock";
pub const UDEV_RULES: &str = "/etc/udev/rules.d/60-embedforge.rules";
pub const SOCKET_UNIT: &str = "/etc/systemd/system/embedforge-helper.socket";
pub const SERVICE_UNIT: &str = "/etc/systemd/system/embedforge-helper.service";

/// SS-04: serial access for the USB-serial chips and boards of TB-02. `uaccess` gives the
/// logged-in user access at once; the `dialout` group covers other sessions.
pub const UDEV_TEXT: &str = r#"# EmbedForge: USB access for supported target boards (SS-04). Written by embedforge-setup;
# removed by its uninstaller.
# CH340 / CH341 / CH9102
SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", MODE="0660", GROUP="dialout", TAG+="uaccess"
# Silicon Labs CP210x
SUBSYSTEM=="tty", ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="ea60", MODE="0660", GROUP="dialout", TAG+="uaccess"
# FTDI FT232R / FT231X
SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", MODE="0660", GROUP="dialout", TAG+="uaccess"
# Arduino (ATmega16U2 and native USB boards)
SUBSYSTEM=="tty", ATTRS{idVendor}=="2341", MODE="0660", GROUP="dialout", TAG+="uaccess"
SUBSYSTEM=="tty", ATTRS{idVendor}=="2a03", MODE="0660", GROUP="dialout", TAG+="uaccess"
# Raspberry Pi Pico / Pico 2: CDC serial, and the BOOTSEL interface used by picotool
SUBSYSTEM=="tty", ATTRS{idVendor}=="2e8a", MODE="0660", GROUP="dialout", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="2e8a", ATTRS{idProduct}=="0003", MODE="0660", GROUP="plugdev", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="2e8a", ATTRS{idProduct}=="000f", MODE="0660", GROUP="plugdev", TAG+="uaccess"
"#;

fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.into()
    }
}

pub fn app_binary(target: &Path) -> PathBuf {
    target.join(APP_CI).join("bin").join(exe("embedforge"))
}

pub fn helper_binary(target: &Path) -> PathBuf {
    target
        .join(APP_CI)
        .join("bin")
        .join(exe("embedforge-helper"))
}

pub fn setup_binary(target: &Path) -> PathBuf {
    target
        .join(APP_CI)
        .join("bin")
        .join(exe("embedforge-setup"))
}

fn socket_unit() -> String {
    format!(
        "[Unit]\nDescription=EmbedForge privileged helper socket (SS-05)\n\n[Socket]\nListenStream={HELPER_SOCKET}\n\
         SocketMode=0666\nRemoveOnStop=yes\n\n[Install]\nWantedBy=sockets.target\n"
    )
}

fn service_unit(target: &Path) -> String {
    format!(
        "[Unit]\nDescription=EmbedForge privileged helper (SS-05)\nRequires=embedforge-helper.socket\n\n[Service]\n\
         ExecStart=\"{}\" --install-root \"{}\" --log /var/log/embedforge/helper.log\n\
         LogsDirectory=embedforge\nNoNewPrivileges=yes\nPrivateTmp=yes\nProtectHome=read-only\n",
        helper_binary(target).display(),
        target.display()
    )
}

fn desktop_entry(target: &Path) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=EmbedForge\nComment=Design, build and verify embedded projects offline\n\
         Exec=\"{}\"\nIcon={}\nCategories=Development;Electronics;\nTerminal=false\n",
        app_binary(target).display(),
        target.join(APP_CI).join("share").join("embedforge.png").display()
    )
}

/// `name_version_arch.deb` → (name, version); `%3a` is the epoch colon.
pub fn deb_name_version(file: &str) -> Option<(String, String)> {
    let stem = file.strip_suffix(".deb")?;
    let mut it = stem.splitn(3, '_');
    let (n, v) = (it.next()?, it.next()?);
    Some((n.into(), v.replace("%3a", ":")))
}

/// SS-01: installs the dependency .debs of the running release that are missing or older on
/// this host, through the local package path (`dpkg -i`), never from the network.
fn install_dependency_debs(
    plan: &Plan,
    sys: &mut Sys,
    progress: &mut dyn FnMut(Event),
) -> Result<(), InstallError> {
    for ci in plan.selected.iter().filter(|c| c.starts_with("host-deps-")) {
        let dir = plan.target.join(ci).join("debs");
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        let mut debs: Vec<PathBuf> = rd
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().is_some_and(|x| x == "deb"))
            .collect();
        debs.sort();
        let mut todo = vec![];
        for d in debs {
            let fname = d.file_name().unwrap().to_string_lossy().into_owned();
            let Some((name, ver)) = deb_name_version(&fname) else {
                continue;
            };
            let have = sys.query(&["dpkg-query", "-W", "-f=${Status} ${Version}", &name]);
            let needed = match have
                .as_deref()
                .and_then(|s| s.strip_prefix("install ok installed "))
            {
                None => true,
                Some(inst) => sys
                    .query(&["dpkg", "--compare-versions", inst.trim(), "lt", &ver])
                    .is_some(),
            };
            if needed {
                todo.push(d.display().to_string());
            }
        }
        progress(Event::Integrating(format!(
            "{ci}: {} package(s) to install",
            todo.len()
        )));
        if !todo.is_empty() {
            let mut argv = vec!["dpkg", "-i"];
            argv.extend(todo.iter().map(String::as_str));
            sys.run(&argv).map_err(InstallError::Rule)?;
        }
    }
    Ok(())
}

pub fn integrate(
    plan: &Plan,
    rec: &mut InstallRecord,
    sys: &mut Sys,
    progress: &mut dyn FnMut(Event),
) -> Result<(), InstallError> {
    let target = &plan.target;
    let warn = |sys_r: Result<String, String>, progress: &mut dyn FnMut(Event)| {
        if let Err(e) = sys_r {
            progress(Event::Warning(e));
        }
    };
    if plan.host.os == "windows" {
        return integrate_windows(plan, rec, sys, progress);
    }
    match plan.mode {
        Mode::System => {
            install_dependency_debs(plan, sys, progress)?;
            progress(Event::Integrating(
                "udev rules for USB serial access (SS-04)".into(),
            ));
            sys.write(UDEV_RULES, UDEV_TEXT, rec)?;
            warn(sys.run(&["udevadm", "control", "--reload-rules"]), progress);
            warn(
                sys.run(&["udevadm", "trigger", "--subsystem-match=tty"]),
                progress,
            );
            if let Some(u) = sys.user.clone() {
                warn(sys.run(&["usermod", "-aG", "dialout", &u]), progress);
                warn(sys.run(&["usermod", "-aG", "plugdev", &u]), progress);
                progress(Event::Warning(format!("{u} was added to the dialout and plugdev groups; this takes effect at the next login")));
            }
            progress(Event::Integrating("privileged helper (SS-05)".into()));
            sys.write(SOCKET_UNIT, &socket_unit(), rec)?;
            sys.write(SERVICE_UNIT, &service_unit(target), rec)?;
            warn(sys.run(&["systemctl", "daemon-reload"]), progress);
            warn(
                sys.run(&["systemctl", "enable", "--now", "embedforge-helper.socket"]),
                progress,
            );
            sys.write(
                "/usr/share/applications/org.embedforge.app.desktop",
                &desktop_entry(target),
                rec,
            )?;
        }
        Mode::PerUser => {
            if let Some(h) = sys.home.clone() {
                let abs = h.join(".local/share/applications/org.embedforge.app.desktop");
                let abs = abs.to_string_lossy().into_owned();
                // the home directory is already a host path; write it unmapped
                let p = PathBuf::from(&abs);
                if let Some(d) = p.parent() {
                    io(d, fs::create_dir_all(d))?;
                }
                io(&p, fs::write(&p, desktop_entry(target)))?;
                rec.system_files.push(format!("home:{abs}"));
            }
        }
    }
    Ok(())
}

fn integrate_windows(
    plan: &Plan,
    rec: &mut InstallRecord,
    sys: &mut Sys,
    progress: &mut dyn FnMut(Event),
) -> Result<(), InstallError> {
    let target = &plan.target;
    let (menu, hive) = match plan.mode {
        Mode::System => (
            std::env::var("ProgramData")
                .map(|p| format!("{p}\\Microsoft\\Windows\\Start Menu\\Programs"))
                .unwrap_or_else(|_| {
                    "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs".into()
                }),
            "HKLM",
        ),
        Mode::PerUser => (
            std::env::var("APPDATA")
                .map(|p| format!("{p}\\Microsoft\\Windows\\Start Menu\\Programs"))
                .unwrap_or_default(),
            "HKCU",
        ),
    };
    if !menu.is_empty() {
        let link = format!("{menu}\\EmbedForge.url");
        let app = app_binary(target).display().to_string();
        let text = format!(
            "[InternetShortcut]\r\nURL=file:///{}\r\nIconFile={app}\r\nIconIndex=0\r\n",
            app.replace('\\', "/")
        );
        sys.write(&link, &text, rec)?;
    }
    let key =
        format!("{hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\EmbedForge");
    let uninst = format!(
        "\"{}\" uninstall --target \"{}\"",
        setup_binary(target).display(),
        target.display()
    );
    let ver = plan.index.app_version.to_string();
    let loc = target.display().to_string();
    for (name, val) in [
        ("DisplayName", "EmbedForge"),
        ("DisplayVersion", ver.as_str()),
        ("Publisher", "EmbedForge project"),
        ("InstallLocation", loc.as_str()),
        ("UninstallString", uninst.as_str()),
    ] {
        if let Err(e) = sys.run(&[
            "reg", "add", &key, "/v", name, "/t", "REG_SZ", "/d", val, "/f",
        ]) {
            progress(Event::Warning(e));
        }
    }
    rec.system_files.push(format!("reg:{key}"));
    Ok(())
}

/// Undoes [`integrate`]. Dependency packages and group memberships stay: other software may
/// use them (stated in the uninstaller's output).
pub fn remove(
    rec: &InstallRecord,
    _target: &Path,
    sys: &mut Sys,
) -> Result<Vec<String>, InstallError> {
    let mut warnings = vec![];
    if rec.os != "windows" && rec.mode == Mode::System {
        for r in [
            sys.run(&["systemctl", "disable", "--now", "embedforge-helper.socket"]),
            sys.run(&["systemctl", "stop", "embedforge-helper.service"]),
        ] {
            if let Err(e) = r {
                warnings.push(e);
            }
        }
    }
    for f in &rec.system_files {
        if let Some(key) = f.strip_prefix("reg:") {
            if let Err(e) = sys.run(&["reg", "delete", key, "/f"]) {
                warnings.push(e);
            }
            continue;
        }
        let p = match f.strip_prefix("home:") {
            Some(h) => PathBuf::from(h),
            None => sys.path(f),
        };
        if p.exists() {
            io(&p, fs::remove_file(&p))?;
        }
    }
    if rec.os != "windows" && rec.mode == Mode::System {
        for r in [
            sys.run(&["systemctl", "daemon-reload"]),
            sys.run(&["udevadm", "control", "--reload-rules"]),
        ] {
            if let Err(e) = r {
                warnings.push(e);
            }
        }
        warnings.push("Dependency packages installed for EmbedForge and the dialout/plugdev group memberships are kept, because other software may use them.".into());
        // the bootstrap package goes too, unless dpkg itself is removing it right now
        if std::env::var_os("EMBEDFORGE_FROM_DPKG").is_none()
            && sys
                .query(&["dpkg-query", "-W", "-f=${Status}", "embedforge-setup"])
                .is_some_and(|s| s.contains("installed"))
        {
            if let Err(e) = sys.run(&["dpkg", "-r", "embedforge-setup"]) {
                warnings.push(e);
            }
        }
    }
    Ok(warnings)
}
