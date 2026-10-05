# SEC-02 — Release signing keys: creation, use, rotation, compromise

**Requirement.** SEC-02:
- Installers and update packages shall be signed.
- The app shall reject unsigned or wrongly signed packages.
- The signing key shall be held offline, with a documented key-rotation procedure.

TEST-04: signing steps run only on your infrastructure, and the builder never holds the
private keys.

## What is signed with what

| Object | Signature | Checked by |
|---|---|---|
| `medium.json` / `update.json` (SHA-256 of every pack part and file) | minisign, Ed25519 (`.minisig`) | installer, `update`, `ef-release verify` |
| `.ef-component.json` of every component (SHA-256 of every file) | minisign, Ed25519 | installer, app start-up check (SS-08), privileged helper |
| Windows `.exe` files | Authenticode (your certificate on its hardware token) | Windows (SmartScreen, UAC) |

The app, the installer and the helper trust only the public keys compiled in from
`core/ef-integrity/trusted-keys.txt`. **Several lines mean several trusted keys**, and this
is how rotation works.

## 1. Creating the keys (once)

Use an offline computer, for example the Profile A test PC with its network disconnected.

1. Install minisign (Ubuntu: `sudo apt install minisign`).
2. Create **two** key pairs, a primary and a standby. Give each a strong password:
   `minisign -G -p embedforge-primary.pub -s embedforge-primary.key`
   `minisign -G -p embedforge-standby.pub -s embedforge-standby.key`
3. Copy both `.key` files to two USB sticks, kept in different places, and delete them
   from the computer.
4. Send me the two **public** key lines: the second line of each `.pub` file. I add both to
   `trusted-keys.txt`. Every release from then on trusts both.

## 2. Signing a release

See [signing.md](signing.md). You sign with the **primary** key. The standby key is never
used until step 4.

## 3. Planned rotation (for example every 2 years, or when you change the hardware)

1. Create a new standby key, as in step 1. The old standby becomes the next primary.
2. **Release N:**
   - trusts the old primary, the old standby and the new standby;
   - is still signed with the old primary, so every installation accepts it.
3. **Release N+1:**
   - is signed with the old standby, which is now the primary;
   - removes the old primary from `trusted-keys.txt`.
4. Destroy both copies of the old primary key.

Installations that skip release N cannot accept N+1 directly. They install N first, from USB
or the release page. The release notes of N+1 say so.

## 4. Compromise or loss of the primary key

1. Stop using it at once.
2. Sign the next release with the **standby** key. Installed apps already trust it, so they
   accept the release.
3. In that release:
   - remove the compromised key from `trusted-keys.txt`;
   - add a new standby key (step 1).
4. Publish a notice on the release page:
   - name the compromised key;
   - state the date from which packages signed with it must not be installed.

If **both** keys are lost or compromised, installed apps cannot be updated safely. They must
be reinstalled from a new medium that you check out of band, by comparing its published
SHA-256.

## 5. Authenticode certificate

- Renew it with your CA before it expires.
- Signatures made with a time stamp (`/tr`) stay valid after expiry.
- If it is compromised, have the CA revoke it.
- The minisign keys are independent of it.
