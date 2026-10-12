# Increment 1 — usability check (section 22, step 4)

- Baseline: prompt v3.8
- Scenarios: `app/ui/e2e/usability.spec.ts`
- Builder dry runs: 12 October 2026, browser preview build, Chromium, builder container
- Human run: **U — awaiting user execution** (section 3)

Increment 1 has no design functions yet: requirements, circuits and code arrive from
Increment 3. The scenarios therefore cover what a first-time and an experienced user do in
this build: settings, finding things, following links between artefacts, documentation and
self-diagnosis. Guided mode (UI-18) can be switched on, but its step-by-step guidance
arrives in Increment 8; the setting says so.

## 1. Scenarios

**Beginner** — guided mode, mouse only, laptop screen 1366×768 (compact layout).

| Step | Task |
|---|---|
| B1 | Switch to guided mode in Settings |
| B2 | Make the text larger (Settings → Font size) |
| B3 | Find out how to repair the installation (Documentation search) |
| B4 | Open requirement R3 of the sample project and see what it is linked to |
| B5 | Look up the DHT22 sensor of ACC-01 in the libraries |
| B6 | Check that the computer and the installation are fine (Self-diagnosis, Host check) |

**Expert** — keyboard only, 1920×1080.

| Step | Task |
|---|---|
| E1 | Command palette → libraries → component models with an I²C interface |
| E2 | Navigator (Ctrl+1) → R3 → cross-highlight of the related artefacts |
| E3 | Transitive highlighting from the palette, then undo it (Ctrl+Z) |
| E4 | Dark theme (Ctrl+Shift+L), self-diagnosis (Ctrl+Shift+D), context help (F1) |

## 2. Builder dry runs (scripted)

The scripts perform each task the shortest way. Their times measure the app's response,
not a person: a person needs seconds per step to read and decide. They show that every task
can be completed and that no step waits on the app.

| Scenario | Completed | Total app time | Slowest step |
|---|---|---|---|
| Beginner | 6/6 | 0.75 s | B5, 0.19 s |
| Expert | 4/4 | 0.57 s | E2, 0.28 s (four arrow keys, each repainting the highlights) |

Three consecutive runs gave the same result. The times are written to
`app/ui/test-results/usability.json` on every run.

## 3. Human run (user-executed, TEST-02)

Please do this once with a person who has not used EmbedForge, and once yourself as the
expert. It takes about 15 minutes. Use the installed app; the browser preview is enough if
the installation is not ready yet (`npm run dev` in `app/ui`, then open the shown address).

1. Give the beginner only the task list B1–B6 above, nothing else. Do not help unless they
   have been stuck for 2 minutes; note where you helped.
2. Time each task with a stopwatch, from reading the task to its result being on screen.
3. Note every hesitation, wrong click and remark.
4. Do the expert list E1–E4 yourself, keyboard only.

Send me the table (task, time, notes). **Target for Increment 1:** every task completed
without help. A beginner task over 2 minutes, or any help needed, is recorded as an issue.

## 4. Issues found in the dry runs

| ID | Found in | Issue | Severity | Status |
|---|---|---|---|---|
| U-1 | B5 | The DHT22 of ACC-01 is not in the component-model library: the Increment 1 seed is built from the kit inventory, which has the DHT11. A beginner searching it saw "0 shown" and nothing else, and could conclude that the part is not supported. The DHT22 exists as a datasheet. | Medium | **Fixed:** a search that finds nothing in one library now names the libraries that match, with buttons ("Found in: Datasheets (1)"); unit test and scenario B5. The DHT22 component model itself arrives with the catalogue and component models (Increments 4 and 5). |
| U-2 | B1 | Guided mode changes only the label in the status bar; its guidance arrives in Increment 8. | Low | Stated in Settings ("steps arrive in Increment 8"); no change. |
| U-3 | E2 | Keyboard focus in the navigator moves one frame after each arrow key. A person does not notice it, but the first expert script did and stopped one item too late. | None for users | Script waits for the focus; no app change. |
