# Phase 0 (c) spike — LLM benchmark (not application code)

This folder measures the candidate local models on the draft VAPP-06 corpus. For each model
it records:

- NL-02 question recall, using the VAPP-06 rule (type and signal tags must both match);
- precision;
- the share of answers that pass the JSON schema;
- determinism;
- model load time (PERF-02);
- time per requirement draft (PERF-03).

Everything uses the Python standard library. The models and llama.cpp are downloaded on your
machine (the builder's environment cannot reach Hugging Face).

## Profile A — Windows PC
Open PowerShell in this folder (`spikes\c` of your EmbedForge clone), then:
```powershell
powershell -ExecutionPolicy Bypass -File .\setup_windows.ps1          # add -Gpu vulkan if you have a GPU
powershell -ExecutionPolicy Bypass -File .\run_profileA.ps1           # add -Ngl 99 with a GPU build
```
- Disk: about 35 GB for the 7 models.
- Time: several hours on CPU. The run can be interrupted and restarted; finished prompts are
  skipped.
- **Send me** `results-profileA-<date>.zip`.

## Profile B — Raspberry Pi 5 (Raspberry Pi OS 64-bit)
```bash
cd ~/EmbedForge/spikes/c
./setup_pi.sh                                  # about 15 min build
nohup ./run_profileB.sh > runB.log 2>&1 &      # many hours; check with: tail runB.log
```
- Disk: about 20 GB for the 4 models.
- **Send me** `results-profileB-<date>.tgz`.

## Quick check before a long run
```bash
python bench.py --profile A --server-bin <path-to-llama-server> --models qwen3-4b --limit 3
```

## Files
| File | Purpose |
|---|---|
| models.json | Candidate models (Apache-2.0/MIT only, F0-04) and sets A/B |
| fetch_models.py | Resumable download. Refuses a repository whose licence is not apache-2.0/mit. Writes models/manifest.json with SHA-256 |
| bench.py | Benchmark runner |
| prompt_template.txt, nl02_schema.json, boards.json | Prompt, output schema (enforced by llama-server's JSON-schema grammar), board facts |
| mock_server.py, test_harness.sh | Builder's self-test of bench.py (7 checks, all pass) |

## Limits of this benchmark
- **Signal names are free text, so matching is fuzzy.** A raised signal matches when its
  normalised name equals the expected one, or one name's words contain the other's ("fan" ~
  "the fan"). It never matches a different expected signal that the model named exactly. Any
  borderline cases will be reviewed manually.
- **Only requirement extraction is measured.** That is the LLM's main job under LLM-05. End-to-end
  *Verified-auto* needs Increments 3–7.
