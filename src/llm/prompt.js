// ╔═══════════════════════════════╗
// ║   prose-ai — prompt builder   ║
// ╚═══════════════════════════════╝

const VALID_TYPES = ['grammar', 'vocabulary', 'clarity', 'tone'];

/*
const MODE_PROMPTS = {
	proofread: (types) => [
		'You are a precise prose editor. Find and fix genuine errors and problems.',
		'Be conservative, only suggest changes where something is clearly incorrect',
		'or problematic. Prefer the smallest fix that resolves the issue.',
		`Look only for issues of these types: ${types.join(', ')}`,
	].join('\n'),

	rewrite: () => [
		'You are a skilled prose editor specializing in making technical and dense writing',
		'read naturally. Your goal is to make this text sound like a thoughtful human',
		'wrote it, not a machine, not a document, not a specification.',
		'Always find at least one improvement, these texts can always be made clearer.',
		'',
		'Look for:',
		'- Long, dense sentences that should be broken into shorter ones',
		'- Em-dashes in place of proper sentence structure',
		'- Passive voice where active voice is clearer',
		'- Nominalization (e.g. "make an assumption" → "assume")',
		'- Jargon or abstraction where plain language works equally well',
		'',
		'Suggest the minimum changes that achieve the maximum improvement in readability.',
		'Do not change what the text means, only how it reads.',
		'For every change, use type "clarity" and write one explanation sentence.',
	].join('\n'),

	formalize: () => [
		'You are a professional editor. Elevate this text to a formal, authoritative register.',
		'- Replace contractions with full forms (don\'t → do not, it\'s → it is)',
		'- Replace casual or colloquial expressions with professional equivalents',
		'- Use precise, specific vocabulary',
		'- Prefer formal constructions',
		'Preserve the original meaning exactly — only the register should change.',
		'For every change, use type "tone" and write one explanation sentence.',
	].join('\n'),

	concise: () => [
		'You are a copy editor obsessed with brevity. Find and eliminate redundancy,',
		'filler words, unnecessary qualifiers, and verbose constructions.',
		'Every suggestion must reduce word count without losing meaning.',
		'Always find at least one improvement — these texts can always be made clearer.',
		'Common patterns to find:',
		'- "in order to" → "to"',
		'- "at this point in time" → "now"',
		'- "due to the fact that" → "because"',
		'- "a large number of" → "many"',
		'- Redundant pairs: "each and every", "first and foremost"',
		'- Throat-clearing openers: "It is important to note that..."',
		'For every change, use type "clarity" and write one explanation sentence.',
	].join('\n'),
}

const SHARED_RULES = (text) => [
	'Return ONLY a raw JSON array. No markdown fences, no prose, no explanation.',
	'',
	'Every item MUST have ALL FOUR of these fields — omit any field and the item is invalid:',
	'  "original"     — the verbatim substring from the text you are changing',
	'  "replacement"  — your improved version of that substring',
	'  "type"         — exactly one of: grammar, vocabulary, clarity, tone',
	'  "explanation"  — one sentence explaining the improvement',
	'',
	'Example of a valid item:',
	'{"original":"in order to","replacement":"to","type":"clarity","explanation":"Removes unnecessary words without changing meaning."}',
	'',
	'Rules:',
	'- "original" must be copied character-for-character from the text',
	'- Never produce an item where original === replacement',
	'- Do not overlap — each span of text appears in at most one item',
	'- For proofread mode only: return [] if you find nothing wrong',
	'',
	'Style Rules: apply in every mode:',
	'- Fix capitalization errors (sentence-initial capitals, proper nouns)',
	'- Fix all spelling errors',
	'- Replace em-dashes (—) and en-dashes (–) with a comma, semicolon, or split',
	'  into two sentences. whichever reads most naturally',
	'- Break run-on sentences into two or more shorter sentences',
	'- Use the Oxford comma in all lists (a, b, and c — not a, b and c)',
	'',
	`Text:\n${text}`,
	'',
	'JSON array:',
].join('\n')
*/

const MODE_PROMPTS = {
	proofread: (types) =>
		`Fix genuine errors only. Be conservative — smallest fix that resolves the issue.\nTypes to check: ${types.join(', ')}`,

	rewrite: () =>
		'Rewrite for clarity and flow. Make it sound human, not like a document.\nBreak long sentences. Fix passive voice. Replace nominalizations. Cut jargon.\nAlways find at least one improvement.',

	formalize: () =>
		'Raise the register. Replace contractions, casual phrasing, and colloquialisms.\nUse precise formal vocabulary. Preserve meaning exactly.\nFor every change, use type "tone".',

	concise: () =>
		'Cut every unnecessary word. Eliminate filler, redundancy, and verbose constructions.\nEvery suggestion must reduce word count. Always find at least one improvement.\nFor every change, use type "clarity".',
};

const SHARED_RULES = (text) => [
	'Return ONLY a raw JSON array. No markdown fences, no prose, no explanation.',
	'',
	'Every item MUST have ALL FOUR of these fields — omit any field and the item is invalid:',
	'  "original"     — the verbatim substring from the text you are changing',
	'  "replacement"  — your improved version of that substring',
	'  "type"         — exactly one of: grammar, vocabulary, clarity, tone',
	'  "explanation"  — one sentence explaining the improvement',
	'',
	'Example of a valid item:',
	'{"original":"in order to","replacement":"to","type":"clarity","explanation":"Removes unnecessary words without changing meaning."}',
	'',
	'Hard rules — apply in every mode regardless of what mode says:',
	'- Fix all spelling and capitalization errors',
	'- Em-dashes (—) and en-dashes (–): restructure the sentence instead.',
	'  Use a comma, semicolon, or split into two sentences. Never use a hyphen.',
	'- Break run-on sentences into two or more sentences',
	'- Use Oxford commas in all lists',
	'',
	`Text:\n${text}`,
	'',
	'JSON array:',
].join('\n');

// buildPrompt(text, mode, types) → string
// mode: 'proofread' | 'rewrite' | 'formalize' | 'concise'
// types: subset of VALID_TYPES — only used in proofread mode
export const buildPrompt = (text, mode, types) => {
	const buildMode = MODE_PROMPTS[mode] ?? MODE_PROMPTS.proofread;
	const modeSection = mode === 'proofread'
		? buildMode(types.filter(t => VALID_TYPES.includes(t)))
		: buildMode();
	return modeSection + '\n' + SHARED_RULES(text);
};

// validateOutput(raw, sourceText) → [{original, replacement, type, explanation}]
// - strips ```json fences (model sometimes includes them)
// - drops items missing required fields
// - drops items where original is not a substring of sourceText
// - never throws — always returns a (possibly empty) array
export const validateOutput = (raw, sourceText) => {
	// strip markdown code fences
	const cleaned = raw
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```\s*$/, '')
		.trim();

	let parsed;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		console.warn('[prose-ai] LLM output was not valid JSON:', cleaned);
		return [];
	}

	if (!Array.isArray(parsed)) {
		console.warn('[prose-ai] LLM output was not a JSON array:', parsed);
		return [];
	}

	const valid = [];
	for (const item of parsed) {
		// must have original and replacement as strings
		if (
			typeof item?.original    !== 'string' ||
			typeof item?.replacement !== 'string'
		) {
			console.warn('[prose-ai] dropping malformed suggestion:', item);
			continue;
		}

		// drop suggestions where nothing actually changes
		if (item.original === item.replacement) {
			console.warn('[prose-ai] dropping no-op suggestion:', item.original);
			continue;
		}

		// original must be a verbatim substring of the source text
		if (!sourceText.includes(item.original)) {
			console.warn('[prose-ai] dropping unlocatable suggestion:', item.original);
			continue;
		}

		// fall back gracefully when model omits type/explanation (common in rewrite mode)
		const type        = VALID_TYPES.includes(item.type) ? item.type : 'clarity';
		const explanation = typeof item.explanation === 'string' ? item.explanation : '';

		if (item.type && !VALID_TYPES.includes(item.type)) {
			console.warn('[prose-ai] unknown type coerced to clarity:', item.type);
		}

		valid.push({
			original: item.original,
			replacement: item.replacement,
			type,
			explanation,
		});
	}

	return valid;
};
