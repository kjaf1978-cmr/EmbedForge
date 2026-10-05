# Packaging pipeline (Increment 1, WP 1.3)

This folder builds the offline installation media of SS-01 and the USB update packages of
SS-09. The Rust parts are in `core/`:

| Crate | Role |
|---|---|
| `ef-pack` | Pack format and the signed medium/update index |
| `ef-release` | Release-time tool: writes component manifests, packs and indexes, and verifies them. It never signs |
| `ef-install` | `embedforge-setup`: bootstrap installer, update, rollback, repair, uninstall, VAPP checks |
| `ef-helper` | `embedforge-helper`: the privileged helper skeleton (SS-05) |
| `ef-integrity` | Signed component manifests and the start-up check used by the app (SS-08) |

## Medium layout (one medium per host OS)

```text
medium.json  medium.json.minisig     signed index: every pack part and file with its SHA-256
packs/<item>-<version>.efpack.NNN    zstd tar stream of one component, split into ≤ 1.9 GiB parts
install.sh                           Linux: sh install.sh  (or --per-user)
embedforge-setup_<v>_<arch>.deb      Linux bootstrap (the installer only, no dependencies)
EmbedForge-Setup-<v>-x64.exe         Windows bootstrap (Authenticode-signed on your host)
licences/  README.txt                licence texts; WebView2 terms on Windows (SS-02)
source/                              corresponding source of the copyleft parts (SS-02)
```

An update package (SS-09) has the same layout with `update.json` instead of `medium.json`.
The same pack files serve USB media and GitHub Releases (CM-10).

## Installed layout

```text
<root>/                       /opt/embedforge, C:\Program Files\EmbedForge, or per user
  <item>/                     one folder per component, with its signed .ef-component.json
  recovery/                   content-addressed recovery store, versions, active set, baselines
  state/                      install record, integrity cache, event logs
```

## Building a medium

```text
packaging/build-medium.sh <ubuntu-x86_64|raspios-aarch64|windows-x86_64> <out> --key <secret key>
packaging/build-medium.sh ubuntu-x86_64 out/medium --dev-key --allow-missing
```

The steps are:
1. stage the app (`stage-app.sh`);
2. add the dependency .deb sets (`linux/collect-deps.sh`, run beforehand) or the WebView2
   runtime (`windows/fetch-webview2.sh`);
3. `ef-release components`;
4. `sign/sign-release.sh components`;
5. `ef-release medium`;
6. `sign/sign-release.sh index`;
7. `ef-release verify`.

On Windows, sign the binaries with `sign/sign-authenticode.sh` before step 3, because the
manifests record the hashes of the signed files. `medium/make-image.sh` writes the medium into
an exFAT image.

`--dev-key` signs with a throwaway key. Only *debug* builds accept such a medium, and only
when they are started with `EMBEDFORGE_DEV_TRUSTED_KEY=<public key>`. Release builds trust
only the keys in `core/ef-integrity/trusted-keys.txt`.

`test/make-test-update.sh` builds the VAPP-05 test update package and the test kit
(`run-vapp.sh`, `run-vapp.cmd`).

## Release specification (`spec/*.json`)

```json
{ "kind": "install", "app_version": "0.1.0", "os": "ubuntu", "arch": "x86_64",
  "components": [ { "ci": "embedforge-app", "kind": "app_back_end_module", "version": "0.1.0",
      "title": "…", "optional": false, "default_selected": true, "consequence": "…",
      "applies_to": ["ubuntu-24.04"], "depends": {"other-item": ">=1.0"},
      "changelog": [{"version": "0.1.0", "date": "2026-10-05", "text": "…"}] } ],
  "files": [ {"path": "install.sh", "from": "files/install.sh", "role": "script"} ],
  "notices": [ {"id": "webview2-runtime", "title": "…", "text_file": "licences/…", "must_accept": true} ],
  "unbundled_drivers": [ {"driver": "…", "boards": ["…"], "reason": "…"} ] }
```

Each `ci` names a folder in the staging directory; `from` paths are relative to it.
