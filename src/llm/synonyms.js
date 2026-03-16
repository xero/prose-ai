// ╔═══════════════════════════════╗
// ║   prose-ai — synonyms LLM    ║
// ╚═══════════════════════════════╝

const ENDPOINT = 'http://localhost:11434/api/generate';
const MODEL    = 'mistral-small3.1';

let controller = null;

export const getSynonyms = async (selection, sentence) => {
	if (selection.split(/\s+/).length > 10) {
		throw new Error('Selection too long — select 10 words or fewer');
	}

	if (controller) controller.abort();
	controller = new AbortController();

	const prompt = [
		`Given the sentence: "${sentence}"`,
		`Provide 6-8 contextual synonyms or alternative phrasings for: "${selection}"`,
		'Return ONLY a raw JSON array of objects with "synonym" and "note" keys.',
		'Example: [{"synonym":"fast","note":"informal"},{"synonym":"rapid","note":"neutral"}]',
		'No markdown, no explanation, just the JSON array.',
	].join('\n');

	let res;
	try {
		res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: MODEL, prompt, stream: false }),
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

	return parseResponse(data.response ?? '', selection);
};

export const cancelSynonyms = () => {
	if (!controller) return;
	controller.abort();
	controller = null;
};

const parseResponse = (raw, selection) => {
	// strip markdown fences
	const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();

	let parsed;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		console.warn('synonyms: failed to parse LLM response', raw);
		return [];
	}

	if (!Array.isArray(parsed)) return [];

	const lower = selection.toLowerCase();
	return parsed
		.filter(item => item && typeof item.synonym === 'string' && item.synonym.trim())
		.filter(item => item.synonym.toLowerCase() !== lower);
};
