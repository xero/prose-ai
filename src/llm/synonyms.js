// ╔═══════════════════════════════╗
// ║   prose-ai — synonyms LLM    ║
// ╚═══════════════════════════════╝

import { BACKEND_URL, BACKEND_KEY, MODEL,
	MAX_TOKENS, TEMPERATURE, EXTRA_BODY } from './config.js';

let controller = null;

export const buildPrompt = (selection, sentence) => [
	`Given the sentence: "${sentence}"`,
	`The user has selected: "${selection}"`,
	'',
	'Provide 6-8 alternative ways to express the selection in this context.',
	'- For a single word, provide synonyms.',
	'- For a multi-word idiom or phrase, provide equivalent rephrasings.',
	'- For a noun or verb phrase, provide reworded variants.',
	'',
	'Preserve the grammatical role the selection plays in the sentence.',
	'Each alternative must read naturally if substituted into the sentence.',
	'',
	'Return ONLY a raw JSON array of objects with "synonym" and "note" keys.',
	'"synonym" is the replacement text. "note" is a short label like "formal", "informal", "concise", or "literary".',
	'',
	'Examples:',
	'Single word selected "fast" in "the car was fast":',
	'  [{"synonym":"quick","note":"neutral"},{"synonym":"rapid","note":"formal"}]',
	'',
	'Phrase selected "in order to" in "We did this in order to win":',
	'  [{"synonym":"to","note":"concise"},{"synonym":"so as to","note":"formal"}]',
	'',
	'Noun phrase selected "the red car" in "She drove the red car":',
	'  [{"synonym":"the crimson vehicle","note":"literary"},{"synonym":"the red automobile","note":"formal"}]',
	'',
	'No markdown fences, no explanation, just the JSON array.',
].join('\n');

export const getSynonyms = async (selection, sentence) => {
	if (selection.split(/\s+/).length > 10) {
		throw new Error('Selection too long — select 10 words or fewer');
	}

	if (controller) controller.abort();
	controller = new AbortController();

	const prompt = buildPrompt(selection, sentence);

	let res;
	try {
		res = await fetch(`${BACKEND_URL}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${BACKEND_KEY}`,
			},
			body: JSON.stringify({
				model: MODEL,
				messages: [{ role: 'user', content: prompt }],
				stream: false,
				max_tokens: MAX_TOKENS,
				temperature: TEMPERATURE,
				...EXTRA_BODY,
			}),
			signal: controller.signal,
		});
	} catch (err) {
		if (err.name === 'AbortError') throw err;
		throw new Error(`LLM backend unreachable — is it running? (${err.message})`, { cause: err });
	}

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`LLM backend returned ${res.status}${detail ? ': ' + detail : ''}`);
	}

	const data = await res.json();
	controller = null;

	return parseResponse(data.choices?.[0]?.message?.content ?? '', selection);
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
