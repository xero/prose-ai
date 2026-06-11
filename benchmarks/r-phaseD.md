# Prose-AI Chunked Pipeline Benchmark

Generated 2026-04-21 03:28.
Host: Darwin Mac 25.4.0 Darwin Kernel Version 25.4.0: Thu Mar 19 19:31:09 PDT 2026; root:xnu-12377.101.15~1/RELEASE_ARM64_T8132 arm64 arm Darwin
Ollama: ollama version is 0.21.0
Chunk budget: 1200 chars  |  Concurrency ceiling: 3

> [!NOTE]
> Latency is the mean after discarding the first (cold-load) run.
> Blocks packed into chunks of up to 1200 chars,
> dispatched 3 at a time.

## Summary

(Latency averaged across all modes.)

| Model            | short | medium | long |
| ---------------- | ----- | ------ | ---- |
| ministral-3:8b   | 40s   | 155s   | 377s |
| mistral-nemo:12b | 57s   | 158s   | 379s |
| mistral:7b       | 55s   | 178s   | 421s |

## Per-mode detail

### proofread

| Model            | short | medium | long | chunks | suggestions (long) |
| ---------------- | ----- | ------ | ---- | ------ | ------------------ |
| ministral-3:8b   | 39s   | 138s   | 320s | 13     | 80.5               |
| mistral-nemo:12b | 19s   | 91s    | 176s | 13     | 35.5               |
| mistral:7b       | 57s   | 169s   | 340s | 13     | 113.5              |

### rewrite

| Model            | short | medium | long | chunks | suggestions (long) |
| ---------------- | ----- | ------ | ---- | ------ | ------------------ |
| ministral-3:8b   | 43s   | 162s   | 400s | 13     | 106.5              |
| mistral-nemo:12b | 76s   | 198s   | 468s | 13     | 96                 |
| mistral:7b       | 45s   | 174s   | 424s | 13     | 138                |

### formalize

| Model            | short | medium | long | chunks | suggestions (long) |
| ---------------- | ----- | ------ | ---- | ------ | ------------------ |
| ministral-3:8b   | 39s   | 190s   | 461s | 13     | 126                |
| mistral-nemo:12b | 79s   | 191s   | 513s | 13     | 118                |
| mistral:7b       | 64s   | 198s   | 512s | 13     | 169                |

### concise

| Model            | short | medium | long | chunks | suggestions (long) |
| ---------------- | ----- | ------ | ---- | ------ | ------------------ |
| ministral-3:8b   | 38s   | 129s   | 325s | 13     | 75                 |
| mistral-nemo:12b | 52s   | 151s   | 357s | 13     | 73                 |
| mistral:7b       | 55s   | 172s   | 407s | 13     | 140                |

## Comparison to baseline

Δ = chunked avg − baseline avg.
Negative means chunked is faster.

| Model            | short Δ | medium Δ | long Δ |
| ---------------- | ------- | -------- | ------ |
| ministral-3:8b   | —       | —        | —      |
| mistral-nemo:12b | +5.2s   | +107s    | +278s  |
| mistral:7b       | —       | —        | —      |
