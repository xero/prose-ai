//  ▓██▀█ ▓██▀█ ▓██▀█   ▓██▀█ ▓██▀█    ▓██▀█ ▀▀
//  ▒██▄█ ▒██▄▀ ▒██ █   ▒██   ▒██▄  █▒ ▒██▄█ ██░
//  ███   ███ █ ███▄█ █▄███   ███▄▄    ███ █ ██▒
//  benchmark config

export const MODELS = [
	// 'qwen3.5-4b-4bit',  — faster still; try if 9b feels sluggish
	'qwen3.5-9b-4bit',
];

export const MODES = ['proofread', 'rewrite', 'formalize', 'concise'];

export const RUNS_PER_COMBO = 3;

// rapid-mlx sweep: continuous batching makes higher concurrency
// plausible; prefix caching makes bigger chunks plausible
export const CHUNK_BUDGETS = [1200, 2400, 3600];
export const CONCURRENCY_CEILINGS = [3, 6];
