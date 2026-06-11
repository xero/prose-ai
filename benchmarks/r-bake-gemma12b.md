# Prose-AI Chunked Pipeline Benchmark

Generated 2026-06-11 21:23.
Host: Darwin Mac 25.5.0 Darwin Kernel Version 25.5.0: Mon Apr 27 20:41:26 PDT 2026; root:xnu-12377.121.6~2/RELEASE_ARM64_T8132 arm64 arm Darwin
Backend: rapid-mlx 0.7.1
Chunk budget: 1200 chars  |  Concurrency ceiling: 6

> [!NOTE]
> Latency is the mean after discarding the first (cold-load) run.
> Blocks packed into chunks of up to 1200 chars,
> dispatched 6 at a time.

## Summary

(Latency averaged across all modes.)

| Model                | medium |
| -------------------- | ------ |
| gemma-4-12b-qat-4bit | 135s   |

## Per-mode detail

### proofread

| Model                | medium | chunks | suggestions (long) |
| -------------------- | ------ | ------ | ------------------ |
| gemma-4-12b-qat-4bit | 57s    | —      | —                  |

### rewrite

| Model                | medium | chunks | suggestions (long) |
| -------------------- | ------ | ------ | ------------------ |
| gemma-4-12b-qat-4bit | 214s   | —      | —                  |

## Comparison to baseline

Δ = chunked avg − baseline avg.
Negative means chunked is faster.
Baseline model: ministral-3:8b.

| Model                | medium Δ |
| -------------------- | -------- |
| gemma-4-12b-qat-4bit | -15s     |
