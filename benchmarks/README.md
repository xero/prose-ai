# Benchmarks

> [!NOTE]
> Standalone benchmark script for measuring prose-ai's Ollama pipeline across
> models, editorial modes, and document sizes. Run it before and after pipeline
> changes to compare latency and suggestion yield with real numbers.

---

## Usage

```sh
# Quick smoke test — one model, one doc, one mode, two runs
bun run benchmarks/run.js \
  --models gemma3:4b \
  --docs short \
  --modes proofread \
  --runs 2

# Full matrix with defaults from config.js
bun run benchmarks/run.js

# Custom model list and output path
bun run benchmarks/run.js \
  --models gemma3:4b,mistral-nemo:12b \
  --out benchmarks/results-2025-05-01
```

Results land in two files at the output prefix:

- `results-baseline.md` — human-readable table with per-mode detail
- `results-baseline.json` — raw timing data for programmatic diffing

---

## Fixtures

Add real prose to `fixtures/` before running. Each file has a placeholder
comment at the top describing the word-count target and content requirements.
Do not use Lorem Ipsum or generated text; the goal is representative latency
on content the model actually has to reason about.

| File                    | Target    |
| ----------------------- | --------- |
| `fixtures/short.txt`    | ~200 words |
| `fixtures/medium.txt`   | ~800 words |
| `fixtures/long.txt`     | ~2000 words |
| `fixtures/pathological.txt` | ~5000 words |

---

## Options

| Flag        | Default             | Description                                         |
| ----------- | ------------------- | --------------------------------------------------- |
| `--models`  | config.js list      | Comma-separated Ollama model tags                   |
| `--docs`    | all four fixtures   | Comma-separated fixture names                       |
| `--modes`   | all four modes      | `proofread`, `rewrite`, `formalize`, `concise`      |
| `--runs`    | `3`                 | Iterations per combination; first discarded as cold-load |
| `--out`     | `benchmarks/results-baseline` | Output path prefix (no extension)       |
| `--chunked` | —                   | (Phase D) Reserved; accepted and ignored for now    |

---

## Config

Edit `config.js` to change the default model list, modes, or Phase D
parameters. The benchmark script reads from `config.js`; it does not touch
`src/llm/client.js` or `src/llm/synonyms.js`.
