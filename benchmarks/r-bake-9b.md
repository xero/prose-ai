# Prose-AI Chunked Pipeline Benchmark

Generated 2026-06-11 20:18.
Host: Darwin Mac 25.5.0 Darwin Kernel Version 25.5.0: Mon Apr 27 20:41:26 PDT 2026; root:xnu-12377.121.6~2/RELEASE_ARM64_T8132 arm64 arm Darwin
Backend: rapid-mlx 0.7.1
Chunk budget: 1200 chars  |  Concurrency ceiling: 6

> [!NOTE]
> Latency is the mean after discarding the first (cold-load) run.
> Blocks packed into chunks of up to 1200 chars,
> dispatched 6 at a time.

## Summary

(Latency averaged across all modes.)

| Model           | medium |
| --------------- | ------ |
| qwen3.5-9b-4bit | 86s    |

## Per-mode detail

### proofread

| Model           | medium | chunks | suggestions (long) |
| --------------- | ------ | ------ | ------------------ |
| qwen3.5-9b-4bit | 54s    | —      | —                  |

### rewrite

| Model           | medium | chunks | suggestions (long) |
| --------------- | ------ | ------ | ------------------ |
| qwen3.5-9b-4bit | 119s   | —      | —                  |

## Comparison to baseline

Δ = chunked avg − baseline avg.
Negative means chunked is faster.
Baseline model: ministral-3:8b.

| Model           | medium Δ |
| --------------- | -------- |
| qwen3.5-9b-4bit | -64s     |
