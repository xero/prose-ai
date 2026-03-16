// ╔═══════════════════════════════╗
// ║   prose-ai — ollama client    ║
// ╚═══════════════════════════════╝

import { buildPrompt, validateOutput } from './prompt.js';

const ENDPOINT = 'http://localhost:11434/api/generate';
const MODEL    = 'gemma3:4b';

let controller = null;  // active AbortController, null when idle

// analyze(text, mode, types) → [{original, replacement, type, explanation}]
// throws on network error or if aborted (caller checks err.name === 'AbortError')
export const analyze = async (text, mode, types) => {
	// cancel any in-flight request before starting a new one
	if (controller) controller.abort();
	controller = new AbortController();

	const body = JSON.stringify({
		model: MODEL,
		prompt: buildPrompt(text, mode, types),
		stream: false,
	});

	let res;
	try {
		res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
			signal: controller.signal,
		});
	} catch (err) {
		if (err.name === 'AbortError') throw err;
		throw new Error(`Ollama unreachable — is it running? (${err.message})`, { cause: err });
	}

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`Ollama returned ${res.status}${detail ? ': ' + detail : ''}`);
	}

	const data = await res.json();
	controller = null;

	return validateOutput(data.response ?? '', text);
};

// cancel the in-flight request (no-op if idle)
export const cancelAnalysis = () => {
	if (!controller) return;
	controller.abort();
	controller = null;
};
