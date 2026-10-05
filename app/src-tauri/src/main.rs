// EmbedForge desktop shell (Increment 1). The UI talks to the Rust core only through the
// commands below; no plugin gives the web view file, shell or network access (INV-01).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    embedforge::run();
}
