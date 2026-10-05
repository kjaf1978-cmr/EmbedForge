# Handover for a new session

State on 5 October 2026: Phase 0 is approved; Increment 1 work packages 1.1, 1.2 and 1.3 are
done. Decision D16 (finding F1-01) chose option A: applied in prompt v3.8 and implemented
(helper function (d), `restore_files`).
Read in this order:

1. docs/requirements/EmbedForge_prompt_v3.8.md: the baseline (sections 25–33 are the decision
   change logs).
2. docs/phase0/STATUS.md: decisions D9–D15, open actions.
3. docs/inc1/SCOPE.md, WP1.1_report.md, WP1.2_report.md, WP1.3_report.md, findings_for_D16.md,
   procedures/: the current increment.
4. packaging/README.md: media, packs, signing pipeline.
5. docs/SESSION_LOG.md: history.

Next:
1. WP 1.4:
   - the Increment 1 test report (TEST-03) over WP 1.1–1.3;
   - the usability scenarios;
   - recording your procedure results;
   - the first signed release;
   - tag v0.1.0.

Pending on your side: the release key pair (docs/inc1/procedures/SEC-02_key_rotation.md
step 1) and the self-hosted runners.

Tags: the earlier backup tags (phase0-s1..s9, inc1-wp1.1, inc1-wp1.2) were refused by the
git proxy of session 3 (HTTP 403). Branches push normally. Try `git push origin --tags` again
from a session where tag pushes are allowed.

Working rules agreed with the owner (Jules):
- No PowerShell or manual git steps for him; push directly to github.com/kjaf1978-cmr/EmbedForge.
- He decides at every gate (D-numbers); conflicts are reported, never chosen silently.
- Non-commercial intent, licence GPL-3.0-or-later (D15).

Build and test:
- `cd core && cargo test && cargo clippy --all-targets -- -D warnings`
- `cd app/ui && npm ci && npm test && npm run build && npx playwright test`
- `cd app/src-tauri && cargo test`
- Windows target check: `cd core && cargo clippy --target x86_64-pc-windows-gnu --workspace --all-targets -- -D warnings`
  (needs `gcc-mingw-w64-x86-64`)
- Development medium + install + VAPP checks (Linux, as root):
  `packaging/build-medium.sh ubuntu-x86_64 out/medium --dev-key --allow-missing`, then
  `EMBEDFORGE_DEV_TRUSTED_KEY=$(tail -n1 out/medium.work/dev.pub) sh out/medium/install.sh --yes`
- UI browser tests in the builder container: `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test`
