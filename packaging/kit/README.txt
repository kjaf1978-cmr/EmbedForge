EmbedForge release signing kit
==============================

This kit holds everything for the EmbedForge installation media except the signatures.
Only you can add those, with your release key. Nothing in this kit sends anything anywhere,
and your key never leaves your USB stick.

What you need
- This folder, unzipped, on your Windows PC (about 1 GB of free space).
- A USB stick with embedforge-primary.key, and the password of that key.

Steps
1. Double-click SIGN-RELEASE.cmd. (If Windows asks "Windows protected your PC", click
   "More info", then "Run anyway": the kit's own program is not Authenticode-signed.)
2. Plug in the USB stick with your keys.
3. Drag the file embedforge-primary.key from the stick onto the black window, then press
   Enter.
4. Type the password of the primary key and press Enter. The typing is not shown.
5. Wait. Each medium ends with a line that starts with PASS. The last lines say where the
   signed media are: the folder "signed" next to this file.
6. Remove the USB stick.
7. Send Claude the contents of signed\RESULT.txt (copy and paste it into the chat).

What you get
- signed\ubuntu-x86_64, signed\raspios-aarch64 and signed\windows-x86_64: one finished
  installation medium each. Copy one folder's contents onto an exFAT USB stick to install
  EmbedForge on that kind of computer (docs/inc1/procedures/VAPP-01.md).
- signed\RESULT.txt: one PASS line per medium, with the SHA-256 of its signed index.

If something fails
- "this key is not one of the EmbedForge release keys": you chose another file. Use
  embedforge-primary.key.
- A wrong password: the program says it cannot decrypt the key. Start again.
- Anything else: send Claude the text in the black window. Nothing is released from a
  medium that does not show PASS.

Known limits of the 0.2.x media
- The Windows medium does not yet bundle the WebView2 runtime. Windows 11 has it built in,
  and so do most Windows 10 PCs that have received updates. A fresh, never-updated Windows 10
  may lack it; that is checked in VAPP-01 and reported.
- The Windows programs carry your release-key signature but no Authenticode signature,
  unless an Authenticode certificate is configured (EF_CERT_SHA1 and EF_TIMESTAMP_URL; see
  docs/inc1/procedures/signing.md).
