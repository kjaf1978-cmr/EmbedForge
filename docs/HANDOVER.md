# Handover for a new session

State on 13 October 2026:
- Increment 1 is delivered: 0.1.0, signed by the owner.
- Decision D17 (prompt v3.9) reordered the plan: design tools first.
- Increment 2 (schematic entry and circuit simulation) is implemented as version 0.2.0. It
  waits for the owner to sign it and look at it (the gate).

Read in this order:
1. docs/requirements/EmbedForge_prompt_v3.9.md: the baseline. Section 22 has the new order of
   increments; sections 25–34 are the decision change logs.
2. docs/phase0/STATUS.md: the decision list (D9–D17).
3. docs/inc2/SCOPE.md, TEST_REPORT.md, usability.md: the current increment.
4. docs/inc1/: Increment 1 (shell, packaging, signing); packaging/README.md for media and the
   signing kit.
5. docs/SESSION_LOG.md: history.

Code map for Increment 2 (all in app/ui/src unless noted):
- eda/: units, symbols (generic library with pins and graphics), models (SPICE parameters),
  schematic (document), editor (pure edit operations), connectivity, netlist, erc, simnet
  (schematic → circuit), project (files), examples, tutorial.
- sim/: engine (MNA solver), circuit, spice (export), run (schematic simulation), measure,
  reference (SIM-04 suite), client/worker (Web Worker).
- components/schematic/: SchematicView (editor, panels), SheetSvg (rendering), Plot (waveform
  viewer); components/StartScreen.
- app/src-tauri/src/projects.rs: projects as Git repositories under Documents/EmbedForge
  Projects.

Next:
1. Owner:
   - sign 0.2.0 with the signing kit;
   - install it;
   - give feedback, then approve the Increment 2 gate.
2. Then Increment 3: PCB layout and routing. Footprints for the symbol library, placement,
   interactive and automatic routing (Freerouting), DRC, Gerber. Scope it first (section 22
   step 1).
3. Still open from Increment 1:
   - VAPP-01;
   - the VAPP test kit;
   - the human usability run;
   - the self-hosted runners;
   - tags v0.1.0 (commit 45ff930) and v0.2.0.

Tags: v0.1.0 (commit 45ff930) and the earlier backup tags (phase0-s1..s9, inc1-wp1.1,
inc1-wp1.2) were refused by the git proxy (HTTP 403); branches push normally. Push the tags
from a session where tag pushes are allowed.

Working rules agreed with the owner (Jules):
- No PowerShell or manual git steps for him; push directly to github.com/kjaf1978-cmr/EmbedForge.
- He decides at every gate (D-numbers); conflicts are reported, never chosen silently.
- Non-commercial intent, licence GPL-3.0-or-later (D15).

Build and test:
- `cd core && cargo test && cargo clippy --all-targets -- -D warnings`
- `cd app/ui && npm ci && npm test && npm run build && npx playwright test` (install ngspice so
  that the SIM-04 suite runs instead of being skipped)
- `cd app/src-tauri && cargo test`
- Windows target check: `cd core && cargo clippy --target x86_64-pc-windows-gnu --workspace --all-targets -- -D warnings`
  (needs `gcc-mingw-w64-x86-64`)
- Development medium + install + VAPP checks (Linux, as root):
  `packaging/build-medium.sh ubuntu-x86_64 out/medium --dev-key --allow-missing`, then
  `EMBEDFORGE_DEV_TRUSTED_KEY=$(tail -n1 out/medium.work/dev.pub) sh out/medium/install.sh --yes`
- UI browser tests in the builder container: `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test`
