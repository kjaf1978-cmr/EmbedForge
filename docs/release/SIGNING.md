# Release signing and key rotation (SEC-02)

- Baseline: prompt v3.7
- Applies to: installers, the app manifest, component packs, the medium index, the offline
  dependency set and update packages (SS-01, SS-05(c), SS-08, SS-09).
- Tool: `ef-release` (`core/ef-release`). It writes standard **minisign** (Ed25519) keys and
  signatures, so the `minisign` command-line tool can be used instead, and each can verify
  what the other produced.

## 1. Rules

1. **The secret key never touches a networked machine.** Key generation and signing happen
   on the release machine with networking disabled. CI builds and tests, but never signs a
   release.
2. The secret key file is password-protected (scrypt). It is kept in two places:
   - on the offline release machine;
   - as a backup on removable media in a separate, locked place.
   The password is stored separately from both copies.
3. The **public** key is not secret. It is compiled into every build through the
   `EF_TRUSTED_KEYS` build variable. In GitHub it is a repository *variable*, not a secret.
4. Every signature's trusted comment names the signed file and the release
   (`file:<name> EmbedForge <version>`). This stops a valid signature being moved onto
   another file.
5. The app and the bootstrap only verify signatures; they cannot sign (`ef-integrity`,
   `ef-pack` have no signing code).

## 2. Creating the release key (once)

On the offline release machine:

```bash
export EF_SIGN_PASSWORD='<at least 12 characters; keep it separately>'
ef-release keygen --dir /media/keys --name embedforge-2026
```

- The command prints the public key. Put that value in the repository variable
  `EF_TRUSTED_KEYS`.
- The tool refuses to overwrite an existing key and refuses passwords shorter than 12
  characters.
- Record the key ID and the creation date in the table in section 5.

## 3. Signing a release

CI (`.github/workflows/package.yml`) produces **unsigned** artefacts per host:
- the staging tree with its `manifest.json`;
- the component packs with their `.pack.json` files;
- `deps/deps.json`.

The builds embed the public key from `EF_TRUSTED_KEYS`.

On the offline release machine, with the artefacts copied in from a USB stick:

1. **Check what you are about to sign.** Compare `SHA256SUMS` from the CI run with the
   copied files:

   ```bash
   sha256sum -c SHA256SUMS
   ```

2. **Sign the staging manifest**, then build the installers from the signed tree.
   `build-deb.sh` and `build-nsis.sh` refuse an unsigned tree.

   ```bash
   ef-release sign --key /media/keys/embedforge-2026.key --label "EmbedForge 0.1.0" stage/manifest.json
   ```

   ```bash
   packaging/linux/build-deb.sh stage amd64 out/
   ```

   ```bash
   packaging/windows/build-nsis.sh stage medium-spec.json webview2-terms.txt out/
   ```

3. **Sign the packs and the dependency set:**

   ```bash
   ef-release sign --key … --label "EmbedForge 0.1.0" packs/*.pack.json deps/deps.json
   ```

4. **Assemble the medium**, then sign its index:

   ```bash
   ef-release medium --spec medium-spec.json --out medium/
   ```

   ```bash
   ef-release sign --key … --label "EmbedForge 0.1.0" medium/medium.json
   ```

5. **Verify on a second machine** before publishing. VAPP-01 (docs/inc1/VAPP_procedures.md)
   starts from this medium.

## 4. Key rotation

The app accepts any key in its compiled-in list. `verify_signed_file` tries each trusted
key, which makes rotation possible without breaking installed systems.

### Planned rotation (for example every 2 years, or when the release machine is replaced)

1. Generate the new key (section 2) on the offline machine.
2. **Release N:** build with both keys:

   ```bash
   EF_TRUSTED_KEYS="<old>,<new>"
   ```

   Sign release N with the **old** key. Installed systems accept it, and once updated they
   trust the new key too.
3. **Release N+1:** sign with the **new** key, still building with both keys. Any system
   that has installed N accepts it.
4. **Release N+2:** drop the old key from `EF_TRUSTED_KEYS`. Destroy the old secret key and
   its backup, and record the date in section 5.
5. State in the release notes of N+1 that systems older than N must first install N, from
   its medium or update package.

### Emergency rotation (the secret key is lost or may be disclosed)

1. Stop publishing immediately. Mark the affected releases in the release notes.
2. Generate a new key. Build a release with **only** the new key in `EF_TRUSTED_KEYS`, and
   sign it with the new key.
3. Installed systems cannot verify this release, because they only trust the compromised
   key. This is intended: an attacker holding the old key must not be able to push a
   rotation. Users reinstall from the new medium; projects and settings are per-user and are
   kept (SS-10 export as a precaution).
4. Record the incident and the new key in section 5. Add it to the risk register.

## 5. Key register

| Key ID (minisign) | Created | Status | Retired / destroyed | Notes |
|---|---|---|---|---|
| — | — | no release key yet | — | Created by you on the offline machine at the first release (TEST-04) |

The key `ci-test` used in WP 1.3 tests was generated in a throwaway container. It is not a
release key and is not trusted by any release build.
