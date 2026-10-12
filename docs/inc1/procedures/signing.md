# Signing a release (your PC only, TEST-04)

Your release key never leaves your USB stick. The builder never sees it.

## The normal way: the signing kit (about 10 minutes)

1. **Get the kit.** Claude starts the GitHub job "package" with the option *kit* and sends you
   the link to the run. On that page, under **Artifacts**, click **EmbedForge-signing-kit**.
   GitHub downloads a zip. You must be logged in to GitHub.
2. **Unzip it**: right-click → **Extract All…** → **Extract**.
3. In the unzipped folder, **double-click `SIGN-RELEASE.cmd`**. If Windows shows "Windows
   protected your PC", click **More info**, then **Run anyway**.
4. Plug in the USB stick with your keys. **Drag `embedforge-primary.key`** from the stick onto
   the black window and press **Enter**.
5. **Type the password** of the primary key and press **Enter**. The typing is not shown.
6. Wait until every medium shows a line starting with **PASS**. The signed media are then in
   the folder **`signed`** next to `SIGN-RELEASE.cmd`.
7. **Remove the USB stick.**
8. **Send Claude the contents of `signed\RESULT.txt`**: copy it and paste it into the chat.
   Claude records the hashes in the test report and tags the release.

`embedforge-sign` refuses at once a key that is not one of the two EmbedForge release keys.
Every medium is verified after signing; a medium without PASS is never released.

**Optional Authenticode.** If you have a code-signing certificate on a hardware token, set
`EF_CERT_SHA1` (the certificate thumbprint) and `EF_TIMESTAMP_URL` (your CA's time-stamp
service) before step 3. The kit then signs the Windows programs with signtool first.

## The manual way (self-hosted runner)

For later releases built on your own runner: see `packaging/build-medium.sh --key` and
`packaging/sign/sign-release.sh`. These steps are the same, run one at a time.
