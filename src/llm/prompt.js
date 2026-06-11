// ╔═══════════════════════════════╗
// ║   prose-ai — prompt builder   ║
// ╚═══════════════════════════════╝

const VALID_TYPES = ['grammar', 'vocabulary', 'clarity', 'tone'];

const MODE_PROMPTS = {
	proofread: (types) =>
		`Fix genuine errors only. Be conservative — smallest fix that resolves the issue.\nTypes to check: ${types.join(', ')}`,

	rewrite: () => [
		'Rewrite this text so it sounds like a direct, thoughtful human wrote it. Not a machine, not a marketing brochure, not a specification.',
		'',
		'Apply these rules to every change:',
		'',
		'1. Active voice. "The script deployed it" beats "It was deployed by the script".',
		'2. Direct statements, not hedged ones. "This improves results" beats "This might improve results".',
		'3. Plain language over jargon. "We need to fix this" beats "We must remediate this situation".',
		'4. Short and medium sentences. Break any sentence longer than about 25 words unless it genuinely needs the length.',
		'5. Cut AI filler phrases. Remove "it\'s important to note", "as we can see", "delve into", "leveraging", "streamline", "gamechanger", "in today\'s world", "navigating the landscape of", and "it\'s not just X, it\'s also Y".',
		'6. Cut marketing adjectives. Remove "cutting-edge", "unparalleled", "seamless", "robust", "powerful", "innovative". Replace with the concrete thing being described.',
		'7. Cut nominalizations. "Make an assumption" becomes "assume". "Perform an analysis" becomes "analyze". "Reach a conclusion" becomes "conclude".',
		'8. No em dashes in prose. If the source has one, rewrite the sentence. An aside that drops in with commas takes commas. Two related clauses take a semicolon or split into two sentences. An addition or contrast starts a new sentence. An appositive folds into the sentence structure.',
		'9. No colons as prose shortcuts. "The result: failure" becomes "The result was a failure". Colons stay fine for lists, times, and ratios.',
		'',
		'Examples of the transform (note the originals are the smallest span that fixes the problem):',
		'',
		'Original: delivers unparalleled results by leveraging',
		'Improved: produces better results using',
		'',
		'Original: implementation of the new protocol resulted in a 40% reduction in latency',
		'Improved: the new protocol cut latency by 40%',
		'',
		'Original: It is not just about speed, it is also about reliability.',
		'Improved: Speed matters, but reliability matters more.',
		'',
		'Change only what needs changing. Do not rewrite clean prose just to rewrite it. But always find at least one improvement. Dense technical writing can always read more naturally.',
		'',
		'For every change, use type "clarity".',
	].join('\n'),

	formalize: () =>
		'Raise the register. Replace contractions, casual phrasing, and colloquialisms.\nUse precise formal vocabulary. Preserve meaning exactly.\nFor every change, use type "tone".',

	concise: () =>
		'Cut every unnecessary word. Eliminate filler, redundancy, and verbose constructions.\nEvery suggestion must reduce word count. Always find at least one improvement.\nFor every change, use type "clarity".',
};

const SHARED_RULES = (text, context) => [
	'Return ONLY a raw JSON array. No markdown fences, no prose, no explanation.',
	'',
	'Every item MUST have ALL FOUR of these fields — omit any field and the item is invalid:',
	'  "original"     — the verbatim substring from the text you are changing',
	'  "replacement"  — your improved version of that substring',
	'  "type"         — exactly one of: grammar, vocabulary, clarity, tone',
	'  "explanation"  — why, in 8 words or fewer',
	'',
	'Example of a valid item:',
	'{"original":"in order to","replacement":"to","type":"clarity","explanation":"cuts filler"}',
	'',
	'Keep items SMALL. "original" must be the shortest span that needs to',
	'change — a word or phrase, not the whole sentence. Quote a full sentence',
	'only when you are restructuring it (splitting, reordering, merging).',
	'Never quote more than one sentence in a single item.',
	'',
	'Hard rules — apply in every mode regardless of what mode says:',
	'- Fix all spelling and capitalization errors',
	'- Em-dashes (—) and en-dashes (–): restructure the sentence instead.',
	'  Use a comma, semicolon, or split into two sentences. Never use a hyphen.',
	'- Break run-on sentences into two or more sentences',
	'- Use Oxford commas in all lists',
	'- Suggest changes ONLY within the Text section below. The Context section',
	'  is read-only background; never produce an item whose "original" comes from it.',
	'',
	'Context (the writing immediately before the Text — read-only, do not edit;',
	'use it only to judge whether pronouns and references in the Text are clear):',
	context || '(start of document)',
	'',
	`Text:\n${text}`,
	'',
	'JSON array:',
].join('\n');

// buildPrompt(text, mode, types, context) → string
// mode: 'proofread' | 'rewrite' | 'formalize' | 'concise'
// types: subset of VALID_TYPES — only used in proofread mode
// context: read-only preceding prose; everything before it must stay
//          byte-identical across chunks so the server's prefix cache hits
export const buildPrompt = (text, mode, types, context = '') => {
	const buildMode = MODE_PROMPTS[mode] ?? MODE_PROMPTS.proofread;
	const modeSection = mode === 'proofread'
		? buildMode(types.filter(t => VALID_TYPES.includes(t)))
		: buildMode();
	return modeSection + '\n' + SHARED_RULES(text, context);
};

// validateOutput(raw, sourceText) → [{original, replacement, type, explanation}]
// - strips ```json fences (model sometimes includes them)
// - drops items missing required fields
// - drops items where original is not a substring of sourceText
// - never throws — always returns a (possibly empty) array
// remove <think>…</think> reasoning blocks. some templates emit the
// reasoning with only a closing tag, so also drop everything before a
// dangling </think>.
export const stripThink = (raw) => {
	let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
	const close = s.toLowerCase().lastIndexOf('</think>');
	if (close !== -1) s = s.slice(close + '</think>'.length);
	return s.trim();
};

export const validateOutput = (raw, sourceText) => {
	// strip reasoning blocks, then markdown code fences
	let cleaned = stripThink(raw)
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```\s*$/, '')
		.trim();

	// last resort: slice to the outermost [ … ] if there's leading/trailing prose
	if (!cleaned.startsWith('[')) {
		const open  = cleaned.indexOf('[');
		const close = cleaned.lastIndexOf(']');
		if (open !== -1 && close > open) cleaned = cleaned.slice(open, close + 1);
	}

	let parsed;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		// models sometimes stop mid-array (or never close it). salvage the
		// complete items: trim to the last complete object and close the array.
		const lastBrace = cleaned.lastIndexOf('}');
		if (cleaned.startsWith('[') && lastBrace > 0) {
			try {
				parsed = JSON.parse(cleaned.slice(0, lastBrace + 1) + ']');
				console.warn('[prose-ai] repaired truncated JSON array');
			} catch { /* fall through */ }
		}
		if (!parsed) {
			console.warn('[prose-ai] LLM output was not valid JSON:', cleaned);
			return [];
		}
	}

	if (!Array.isArray(parsed)) {
		console.warn('[prose-ai] LLM output was not a JSON array:', parsed);
		return [];
	}

	const valid = [];
	for (const item of parsed) {
		const v = validateItem(item, sourceText);
		if (v) valid.push(v);
	}

	return valid;
};

// validateItem(item, sourceText) → {original, replacement, type, explanation} | null
// the per-suggestion checks, shared by validateOutput and the stream path
export const validateItem = (item, sourceText) => {
	// must have original and replacement as strings
	if (
		typeof item?.original    !== 'string' ||
		typeof item?.replacement !== 'string'
	) {
		console.warn('[prose-ai] dropping malformed suggestion:', item);
		return null;
	}

	// drop suggestions where nothing actually changes
	if (item.original === item.replacement) {
		console.warn('[prose-ai] dropping no-op suggestion:', item.original);
		return null;
	}

	// original must be a verbatim substring of the source text
	if (!sourceText.includes(item.original)) {
		console.warn('[prose-ai] dropping unlocatable suggestion:', item.original);
		return null;
	}

	// fall back gracefully when model omits type/explanation (common in rewrite mode)
	const type        = VALID_TYPES.includes(item.type) ? item.type : 'clarity';
	const explanation = typeof item.explanation === 'string' ? item.explanation : '';

	if (item.type && !VALID_TYPES.includes(item.type)) {
		console.warn('[prose-ai] unknown type coerced to clarity:', item.type);
	}

	return {
		original: item.original,
		replacement: item.replacement,
		type,
		explanation,
	};
};
