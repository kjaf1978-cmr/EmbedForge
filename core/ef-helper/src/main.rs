//! `embedforge-helper`: the privileged helper service (SS-05). Started by systemd through
//! `embedforge-helper.socket`; see the library documentation for what it accepts.

use std::path::PathBuf;

fn main() {
    let mut root: Option<PathBuf> = None;
    let mut log = PathBuf::from("/var/log/embedforge/helper.log");
    let mut socket = PathBuf::from("/run/embedforge/helper.sock");
    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "--install-root" => root = it.next().map(PathBuf::from),
            "--log" => log = it.next().map(PathBuf::from).unwrap_or(log),
            "--socket" => socket = it.next().map(PathBuf::from).unwrap_or(socket),
            "--version" => {
                println!("embedforge-helper {}", env!("CARGO_PKG_VERSION"));
                return;
            }
            _ => {
                eprintln!(
                    "usage: embedforge-helper --install-root DIR [--log FILE] [--socket PATH]"
                );
                std::process::exit(2);
            }
        }
    }
    let Some(root) = root else {
        eprintln!("embedforge-helper: --install-root is required");
        std::process::exit(2);
    };
    let ctx = ef_helper::Context::for_install(&root, &log);
    #[cfg(target_os = "linux")]
    {
        let l = match ef_helper::server::listener(&socket) {
            Ok(l) => l,
            Err(e) => {
                eprintln!(
                    "embedforge-helper: cannot listen on {}: {e}",
                    socket.display()
                );
                std::process::exit(1);
            }
        };
        let _ = ef_integrity::log_event(
            &log,
            &serde_json::json!({"at": ef_integrity::now_rfc3339(), "event": "helper_started", "install_root": root, "version": env!("CARGO_PKG_VERSION")}),
        );
        if let Err(e) = ef_helper::server::run(&ctx, &l, &|| false) {
            eprintln!("embedforge-helper: {e}");
            std::process::exit(1);
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (ctx, socket);
        eprintln!("embedforge-helper: the Windows service and named-pipe transport arrive in Increment 2, with the first function that needs them");
        std::process::exit(1);
    }
}
