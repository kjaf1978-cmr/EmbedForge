# Signing a release (your infrastructure only, TEST-04)

This runs on the Profile A test PC, registered as the self-hosted runner `profile-a`. The
offline key is on a USB stick, and on Windows the Authenticode token is attached. Through the
CI job `package → release` (workflow_dispatch with *release* ticked), the same steps run
automatically.

1. Plug in the key stick. On the runner, set the variable `EF_RELEASE_KEY_PATH` to the path of
   `embedforge-primary.key` (GitHub → Settings → Variables). The key itself never goes into
   the repository or into GitHub.
2. **Ubuntu medium:**
   `packaging/build-medium.sh ubuntu-x86_64 out/medium-ubuntu --key "$EF_RELEASE_KEY_PATH" --pub embedforge-primary.pub`
   minisign asks for the key password twice: once for the component manifests, once for the
   index.
3. **Pi OS medium:** the same, on the Pi 5 runner, with `raspios-aarch64`.
4. **Windows medium**, on the Windows signing host in Git Bash:
   1. `packaging/stage-app.sh out/staging`
   2. `packaging/sign/sign-authenticode.sh out/staging/embedforge-app/bin/*.exe`
   3. `packaging/windows/fetch-webview2.sh <cab> <sha256> out/staging <terms>`
   4. `packaging/build-medium.sh windows-x86_64 out/medium-windows --staged out/staging --key …`

   Sign the binaries **before** the component manifests are written: the manifests record
   the hashes of the signed files.
5. Each run ends with `PASS: medium.json …` from `ef-release verify`. A medium without PASS is
   not released.
6. Optional image for USB writing: `sudo packaging/medium/make-image.sh out/medium-ubuntu EmbedForge-0.1.0-ubuntu-x86_64.img`.
