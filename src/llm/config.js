//  ▓██▀█ ▓██▀█ ▓██▀█   ▓██▀█ ▓██▀█    ▓██▀█ ▀▀
//  ▒██▄█ ▒██▄▀ ▒██ █   ▒██   ▒██▄  █▒ ▒██▄█ ██░
//  ███   ███ █ ███▄█ █▄███   ███▄▄    ███ █ ██▒
//  config

// the base URL of an OpenAI-compatible inference server.
// Rapid-MLX:  http://localhost:8000/v1   (rapid-mlx serve $(cat .model) --port 8000)
// Ollama:     http://localhost:11434/v1
// LM Studio:  http://localhost:1234/v1
// OpenAI:     https://api.openai.com/v1  (also needs a real BACKEND_KEY)
export const BACKEND_URL = 'http://localhost:8000/v1';

// most local backends ignore this; some require a non-empty string.
export const BACKEND_KEY = 'prose-ai';

// model ladder for this 32 GB base-M4 machine (decode is bandwidth-bound).
// bake-off (benchmarks/r-bake-*, medium doc): rewrite 72s / 119s / 214s
// for 4b / 9b / gemma-4-12b-qat+suffix-decoding at equal suggestion yield.
//   qwen3.5-4b-4bit   — 2.4 GB, the speed/yield winner
//   qwen3.5-9b-4bit   — 5.1 GB, sharper judgment if 4b feels off
//   qwen3.5-27b-4bit  — 15 GB, best quality but ~4 tok/s — too slow here
export const MODEL = 'qwen3.5-4b-4bit';  // keep in sync with .model

// chunk packing — bigger chunks are NOT faster overall: at 3600 chars the
// model disengages and suggestion yield collapses (see the sweep note on
// MAX_CONCURRENT below), and time-to-first-suggestion grows with chunk size
export const CHUNK_CHAR_BUDGET = 1200;

// read-only context prepended to each chunk so the model can resolve
// pronouns whose antecedent is in a previous paragraph
export const CONTEXT_CHAR_CAP = 600;

// concurrency ceiling — rapid-mlx does continuous batching, so requests
// genuinely run in parallel. sweep (benchmarks/r-rapidmlx-sweep-quick):
// 1200×6 beat 1200×3 on total latency with equal suggestion yield;
// 3600-char chunks collapsed the yield (model disengages on long texts).
export const MAX_CONCURRENT = 6;

// output ceiling per chunk — rewrite mode emits whole-sentence originals
// and replacements, which can run long; this only stops true runaways
export const MAX_TOKENS = 4096;

// near-deterministic editing
export const TEMPERATURE = 0.1;

// extra OpenAI-incompatible body fields. qwen3.5 is a hybrid-thinking
// model; without this it burns time reasoning before the JSON.
export const EXTRA_BODY = {
	chat_template_kwargs: { enable_thinking: false },
};
