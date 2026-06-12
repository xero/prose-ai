# Benchmarks

> [!NOTE]
> Standalone benchmark harness for prose-ai's Rapid-MLX pipeline across models,
> editorial modes, chunk budgets, and concurrency ceilings. Run it before and
> after pipeline changes to compare latency, time-to-first-chunk, and
> suggestion yield with real numbers.

> ### Table of Contents
> - [Usage](#usage)
> - [Options](#options)
> - [Fixtures](#fixtures)
> - [Result files](#result-files)
> - [Findings on record](#findings-on-record)

---

## Usage

`bench.sh` at the repo root handles the server lifecycle (start if needed,
warm the weights and prefix cache) and runs the matrix:

```sh
# chunked pipeline benchmark + delta table vs the Ollama baseline
./bench.sh

# chunk-budget x concurrency sweep, quick variant (medium doc, rewrite)
./bench.sh --sweep --quick
```

Or drive `run.js` directly when the server is already up:

```sh
# quick smoke test — one model, one doc, one mode
bun run benchmarks/run.js --chunked --models qwen3.5-4b-4bit \
  --docs short --modes proofread --runs 2

# full chunked matrix with defaults from config.js
bun run benchmarks/run.js --chunked

# single-shot baseline (no chunking) for raw model comparison
bun run benchmarks/run.js --models qwen3.5-4b-4bit,qwen3.5-9b-4bit
```

The chunked runner mirrors the app pipeline: context-carrying chunks,
the two-wave dispatch (first chunk solo, rest at full concurrency), and
identical request bodies. One known divergence: it uses `stream: false`
and whole-response validation, while the app streams per item. Total
decode is the same, which is what the latency numbers measure;
suggestion counts can differ slightly from what the app would apply.

---

## Options

| Flag               | Default                   | Description                                              |
| ------------------ | ------------------------- | -------------------------------------------------------- |
| `--models`         | config.js list            | Comma-separated model aliases served by Rapid-MLX        |
| `--docs`           | all four fixtures         | Comma-separated fixture names                            |
| `--modes`          | all four modes            | `proofread`, `rewrite`, `formalize`, `concise`           |
| `--runs`           | `3`                       | Iterations per combination; first discarded as cold-load |
| `--out`            | `benchmarks/results-*`    | Output path prefix (no extension)                        |
| `--chunked`        | -                         | Run the real chunked pipeline; reports ttf per combo     |
| `--sweep`          | -                         | Sweep `CHUNK_BUDGETS` x `CONCURRENCY_CEILINGS`           |
| `--quick`          | -                         | With `--sweep`: one doc (medium), one mode (rewrite)     |
| `--baseline`       | `benchmarks/r-phaseD.json` | Baseline JSON for the chunked delta table               |
| `--baseline-model` | `ministral-3:8b`          | Model name to read from the baseline file                |
| `--timeout`        | `600000`                  | Per-request timeout in ms                                |

Defaults live in `config.js`: the model under test, the four modes, and the
sweep grid (budgets 1200/2400/3600, concurrency 3/6).

---

## Fixtures

Real prose, not Lorem Ipsum; the goal is representative latency on content
the model actually has to reason about.

| File                        | Purpose                                          |
| --------------------------- | ------------------------------------------------ |
| `fixtures/short.txt`        | ~200 words                                       |
| `fixtures/medium.txt`       | ~800 words; the sweep and bake-off workhorse     |
| `fixtures/long.txt`         | ~2000 words                                      |
| `fixtures/pathological.txt` | ~5000 words                                      |
| `fixtures/pronoun.txt`      | cross-chunk pronoun test: paragraph 1 introduces a person, paragraph 2 opens with "She" — a correct run never flags the pronoun |

---

## Result files

| File                          | What it is                                                          |
| ----------------------------- | ------------------------------------------------------------------- |
| `r-phaseD.{json,md}`          | Historical Ollama baseline (ministral-3:8b et al.) — the before picture; keep it |
| `r-rapidmlx-sweep-quick.{json,md}` | Budget x concurrency sweep on qwen3.5-9b that picked 1200 x 6   |
| `r-bake-9b.{json,md}`         | qwen3.5-9b with the terse output format                             |
| `r-bake-4b.{json,md}`         | qwen3.5-4b — the bake-off winner and current default                |
| `r-bake-gemma12b.{json,md}`   | gemma-4-12b-qat with suffix decoding — the spec-decode bet that lost |

---

## Findings on record

The numbers that picked the current configuration, all on a base M4 with
32 GB (medium doc unless noted):

- **Model**: rewrite mode ran 72s on qwen3.5-4b, 119s on 9b, and 214s on
  gemma-4-12b-qat with suffix decoding, at equal suggestion yield. The 4b
  is the default; the 9b is one config line away if its judgment is missed.
- **Chunk budget**: 1200 chars. At 3600 the model disengages and suggestion
  yield collapses (37 down to 11.5 on the same document).
- **Concurrency**: 6, via Rapid-MLX continuous batching. Batched streams
  finish together, which is why the app dispatches the first chunk solo.
- **Baseline delta**: the Ollama-era pipeline ran the medium doc in ~155s
  and the long doc in ~377s; see `r-phaseD.md` for the full before picture.
