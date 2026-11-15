# Handover for a new session

State on 15 November 2026: Phase 0 is approved; Increment 1 work packages 1.1, 1.2 and 1.3 are
done (1.3 on branch claude/ecstatic-cori-4ys1wg). D16 decided (v3.8); D16-b open.
Read in this order:

1. docs/requirements/EmbedForge_prompt_v3.8.md: the baseline (sections 25–33 are the decision
   change logs; D16 = v3.8).
2. docs/phase0/STATUS.md: decisions D9–D15, open actions.
3. docs/inc1/SCOPE.md, WP1.1_report.md, WP1.2_report.md, WP1.3_report.md (D16 in section 6),
   VAPP_procedures.md; docs/release/SIGNING.md.
4. docs/SESSION_LOG.md: history.

Next: the owner's D16-b answer, a green `package` CI run, then WP 1.4 (Increment 1 test report,
usability scenarios, user-executed VAPP runs, tag v0.1.0).

Working rules agreed with the owner (Jules):
- No PowerShell or manual git steps for him; push directly to github.com/kjaf1978-cmr/EmbedForge.
- He decides at every gate (D-numbers); conflicts are reported, never chosen silently.
- Non-commercial intent, licence GPL-3.0-or-later (D15).

Build and test:
- `cd core && cargo test && cargo clippy --all-targets -- -D warnings`
- `cd app/ui && npm ci && npm test && npm run build && npx playwright test`
- `cd app/src-tauri && cargo test`
- Packaging end to end (Linux): see docs/inc1/WP1.3_report.md section 3 (`packaging/stage.sh`,
  `packaging/test-medium.sh`, `install-linux.sh`, `packaging/ci-smoke-linux.sh`)
