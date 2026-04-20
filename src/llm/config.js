// ╔═══════════════════════════════╗
// ║   prose-ai — config           ║
// ╚═══════════════════════════════╝

// the base URL of an OpenAI-compatible inference server.
// Ollama:    http://localhost:11434/v1
// LM Studio: http://localhost:1234/v1
// PyOMlx:    http://localhost:11435/v1
// vLLM:      http://localhost:8000/v1
// OpenAI:    https://api.openai.com/v1  (also needs a real BACKEND_KEY)
export const BACKEND_URL = 'http://localhost:11434/v1';

// most local backends ignore this; some require a non-empty string.
export const BACKEND_KEY = 'prose-ai';

export const MODEL    = 'ministral-3:8b';  // keep in sync with .model

// chunk packing
export const CHUNK_CHAR_BUDGET = 1200;

// concurrency ceiling (Phase D will tune this)
export const MAX_CONCURRENT = 3;

// prevent wasted VRAM on default 32k+ context window
export const NUM_CTX = 4096;
