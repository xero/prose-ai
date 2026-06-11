# Prose-AI Parameter Sweep

Generated 2026-06-11 19:07.
Host: Darwin Mac 25.5.0 Darwin Kernel Version 25.5.0: Mon Apr 27 20:41:26 PDT 2026; root:xnu-12377.121.6~2/RELEASE_ARM64_T8132 arm64 arm Darwin
Backend: rapid-mlx 0.7.1

> [!NOTE]
> Each cell is mean latency (non-cold runs) for one
> (model, doc, mode, budget, concurrency) combination.
> Budgets swept: 1200, 2400, 3600 chars.
> Concurrency ceilings swept: 3, 6.

## qwen3.5-9b-4bit, medium doc, rewrite mode

|               | budget=1200 | budget=2400 | budget=3600 |
| ------------- | ----------- | ----------- | ----------- |
| concurrency=3 | 122s        | 147s        | 150s        |
| concurrency=6 | 114s        | 147s        | 177s        |

## Recommendation

### Chunk budget

Proposed: TODO: xero.

Rationale: TODO: xero.

### Concurrency ceiling

Proposed: TODO: xero.

Rationale: TODO: xero.

### Model

Proposed: TODO: xero.

Rationale: TODO: xero.
