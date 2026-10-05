# Handover for a new session

State on 5 October 2026: Phase 0 is approved; Increment 1 work packages 1.1 and 1.2 are done.
Read in this order:

1. docs/requirements/EmbedForge_prompt_v3.7.md: the baseline (sections 25–32 are the decision
   change logs).
2. docs/phase0/STATUS.md: decisions D9–D15, open actions.
3. docs/inc1/SCOPE.md, WP1.1_report.md, WP1.2_report.md: the current increment.
4. docs/SESSION_LOG.md: history.

Next: WP 1.3 (packaging: signed manifest generation, installers, privileged-helper skeleton,
start-up integrity and recovery wiring, VAPP-01/03/04/05 procedures), then WP 1.4 (Increment 1
test report, usability scenarios, tag v0.1.0).

Working rules agreed with the owner (Jules):
- No PowerShell or manual git steps for him; push directly to github.com/kjaf1978-cmr/EmbedForge.
- He decides at every gate (D-numbers); conflicts are reported, never chosen silently.
- Non-commercial intent, licence GPL-3.0-or-later (D15).

Build and test:
- `cd core && cargo test && cargo clippy --all-targets -- -D warnings`
- `cd app/ui && npm ci && npm test && npm run build && npx playwright test`
- `cd app/src-tauri && cargo test`
