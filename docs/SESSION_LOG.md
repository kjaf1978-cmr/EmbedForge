# Session log

## 2026-09-26 — session 1
- Reviewed v3 (section 24): 36 findings. Decision D9: accept all.
- Produced v3.1 with `tools/apply_d9.py`. Each of the 54 text replacements must match exactly
  once or the script aborts. All 36 findings are traced in section 26.
- Phase 0 (k): risk register draft, 33 risks (9 high), plus 2 new issues (C3-11, F3-06) for D10.
- Not done: nothing pushed. This session cannot reach github.com/kjaf1978-cmr, because the
  session is not bound to a repository. You push the git bundle.
- Next: after D10, start (o) catalogue data sources and (a) licence analysis.

## 2026-09-26 — session 1 (continued)
- You pushed phase0-s1 to github.com/kjaf1978-cmr/EmbedForge (public). Verified from here with
  git ls-remote: main = 33be9fb, tag present.
- D10 accepted → v3.2 via tools/apply_d10.py (8 replacements, section 27).
- Phase 0 (a) licence analysis, (o) catalogue sources and (n) first pass delivered, using four
  parallel research agents with primary sources. UNVERIFIED items are listed, not guessed.
- Risk register v0.2.0: R-06 and R-12 re-scored; R-34 to R-36 added.
- 11 findings (F0-01..F0-11) for D11.
- Next: (d) kit inventory, (m) emulators.

## 2026-09-26 — session 1 (continued, 2)
- D11 accepted → v3.3 via tools/apply_d11.py (16 replacements, section 28).
- You stated the app is for non-commercial use; recorded as open question Q-01 (licence).
- Phase 0 (d) kit inventory draft: 10 kits; 81 kit parts (59 full model, 18 stub, 4 not
  emulated); 36 outside EM-03. ELEGOO contents UNVERIFIED.
- Phase 0 (m) draft, measured in this 2-vCPU container:
  - simavr runs at 4–5.7× real time.
  - rp2040js runs at about 0.4×; the C build of c1570/rp2350js in RP2040 mode at about 1.0×.
  - No RP2350 emulator passes (GPIO does not work), so Pico 2 stays HIL-pending.
  - The Pi virtual clock works: 60 s emulated in ≤ 0.03 s, deterministic.
- Spike code in spikes/m/ (third-party clones git-ignored).

## 2026-10-05 — session 2
- GitHub still shows only phase0-s1 (33be9fb), so s2/s3 have not been pushed yet. The
  phase0-s4 bundle is full and contains everything.
- (n) kit-part substitutes, checked on nxp.com:
  - MFRC522 is EOL → PN5180 (Active, SPI).
  - PN532 is NRND, so not used.
  - PCF8591 is EOL → ADS1115 + MCP4725.
  - MPR121 is discontinued; its substitute is still open.
  - BMP180 → BME280.
- (l) block-template plan delivered.
- (j) draft VAPP-06 corpus, 45 prompts. tools/check_corpus.py checks coverage and passes; the
  ACC-02 prompt matches the prompt text verbatim (checked by script).
- Q-01 still open.
- D12: exclude discontinued kit parts with no successor → v3.4 via tools/apply_d12.py. MPR121
  excluded; HD44780, PCF8591, MPU-6050, MFRC522 and BMP180 stay because active equivalents exist.
- D12: you confirmed the reading (active equivalent counts as a successor) and declined the stricter rule.
- (c) LLM benchmark harness in spikes/c: stdlib-only, Windows and Pi scripts, licence-gated model
  fetcher. Self-tested against a mock server (7/7); two defects found and fixed. All 7 model
  repositories confirmed through the Hugging Face API (WebFetch). Direct downloads from this
  workspace are blocked by the egress proxy (huggingface.co, api.github.com).
- (e), (f), (g) drafts delivered by research agents. BMP280 resolved as active.
- D13 findings F0-12..F0-20 raised.
- D13 accepted → v3.5 via tools/apply_d13.py (14 replacements, section 30).
- (h) PERF assessment and DATA-04 hand BOM (43 parts > 40). (i) wireframes HTML (23/23).
- D14 findings F0-21..F0-24 raised. Phase 0 gate report drafted.
