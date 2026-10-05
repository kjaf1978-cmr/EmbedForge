# Phase 0 (c) — LLM model profiles: benchmark plan and harness

- Baseline: prompt v3.4
- Version: 0.1.0 (5 October 2026)
- Status: harness delivered and self-tested. **Measurements pending: you run it on Profile A
  and Profile B (TEST-02).** Human review record (DOC-12): pending.

## 1. Scope (D9 A3-18)
Per candidate model and host profile, the benchmark measures:

| Metric | Requirement |
|---|---|
| NL-02 question recall, VAPP-06 tag matching | VAPP-06 target ≥ 95 % |
| Precision | Diagnostic |
| Schema-valid output under the grammar | LLM-05 |
| Model load time | PERF-02 |
| Time per requirement draft | PERF-03 |
| Determinism at temperature 0 | LLM-05 |
| Recall and validity without the grammar | R-18 |

## 2. Candidates (F0-04: Apache-2.0 / MIT only)

| Set | Models |
|---|---|
| Small (Profile B default; sets A and B) | Qwen3-4B, Phi-4-mini, Granite-4.0-micro |
| Large (set A; Qwen3-8B also in set B) | Qwen3-8B, Ministral-3-8B, Phi-4, Qwen3-14B |

Quantisation is Q4_K_M, falling back to Q4_0. Qwen2.5-Coder is dropped: under LLM-05 the LLM
writes no code.

## 3. Method
- **Runtime:** the latest llama.cpp release build. Windows uses the official CPU/Vulkan/CUDA
  zip; the Pi 5 uses a native arm64 build from the release tag. The tag is recorded in the
  results.
- **Request:**
  - one chat request per corpus entry;
  - temperature 0 and seed 42;
  - "thinking" disabled;
  - JSON-schema response format (constrained decoding), with an automatic fallback to the
    older `json_object` + schema form.
- **Scoring:** greedy one-to-one matching of raised questions to expected questions.
  - **strict**: NL-02 type and signal both match. This is the VAPP-06 rule.
  - **lenient**: signal only; diagnostic.
  - Signal matching is normalised and fuzzy (README "Limits").
- **Determinism:** the first 3 entries are repeated; their output text hashes must be
  identical.

## 4. Builder verification (container, mock server)
`spikes/c/test_harness.sh` drives bench.py against a test double of llama-server. All 7
checks pass:

| Mock mode | Expected result | Status |
|---|---|---|
| Oracle | strict recall 1.0, schema-valid 1.0, determinism 2/2 | PASS |
| Wrong NL-02 type | strict 0.0, lenient 1.0 | PASS |
| No questions | recall 0.0 | PASS |
| Invalid JSON | schema-valid 0.0 | PASS |

The first run found two defects, both fixed before delivery:
- The mock picked the wrong entry when the same prompt was used on several boards (ACC-02).
- Fuzzy matching let "fan_pwm" match "fan".

## 5. What is not verified
- No real model has been run. Hugging Face is blocked from the builder's environment.
- All 7 first-choice repositories were confirmed through the Hugging Face API on 5 October
  2026: id, licence (Apache-2.0 or MIT) and a Q4 GGUF file. That check used WebFetch; direct
  downloads from the builder's shell stay blocked by the egress proxy.
- microsoft/phi-4-gguf publishes Q4_K rather than Q4_K_M, so the quantisation preference was
  extended.
- Phi-4-mini has no official GGUF, so the MIT-licensed unsloth conversion is used.
- llama.cpp release asset names on Windows are matched by pattern. If none matches, the script
  prints the asset list for you to send me.

## 6. Decision this will feed (at the Phase 0 gate)
- The model chosen for each profile.
- The VAPP-06 thresholds per profile (h).
- Whether PERF-02 and PERF-03 are reachable on each profile.
