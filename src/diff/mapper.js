// ╔═══════════════════════════════╗
// ║   prose-ai — position mapper  ║
// ╚═══════════════════════════════╝

import { diff_match_patch } from 'diff-match-patch';

const dmp = new diff_match_patch();

// build a flat char array + full plain text from the editor doc
// chars[i] = { nodePos, offsetInNode } so we can convert text offsets → PM positions
const buildTextMap = (doc) => {
	const chars = [];
	let text = '';

	doc.descendants((node, pos) => {
		if (!node.isText) return;
		for (let i = 0; i < node.text.length; i++) {
			chars.push({ nodePos: pos, offsetInNode: i });
		}
		text += node.text;
	});

	return { text, chars };
};

// convert a text-offset into a ProseMirror absolute position
const offsetToPos = (chars, offset) => {
	const entry = chars[offset];
	if (!entry) return null;
	return entry.nodePos + entry.offsetInNode;
};

// toPos: position AFTER the last char of a match (ProseMirror exclusive end)
// correct form: position OF last char + 1
const exclusiveEnd = (chars, startOffset, length) =>
	offsetToPos(chars, startOffset + length - 1) + 1;

// mapSuggestions(editor, suggestions)
// suggestions: [{original, replacement, type, explanation}] from validateOutput
// returns:     [{id, from, to, type, original, replacement, explanation}]
// skips anything it cannot locate or that overlaps — never throws
export const mapSuggestions = (editor, suggestions) => {
	const { text, chars } = buildTextMap(editor.state.doc);
	const mapped   = [];
	const occupied = [];  // [{from, to}] of already-placed suggestions

	for (const s of suggestions) {
		let from = null;
		let to   = null;

		// ── 1. exact substring match ─────────────────────────
		const exactIdx = text.indexOf(s.original);
		if (exactIdx !== -1) {
			from = offsetToPos(chars, exactIdx);
			to   = exclusiveEnd(chars, exactIdx, s.original.length);
		}

		// ── 2. fuzzy fallback (model sometimes paraphrases) ──
		if (from === null) {
			const fuzzyIdx = dmp.match_main(text, s.original, 0);
			if (fuzzyIdx !== -1) {
				from = offsetToPos(chars, fuzzyIdx);
				to   = exclusiveEnd(chars, fuzzyIdx, s.original.length);
				console.info(`[prose-ai] fuzzy match "${s.original}" at offset ${fuzzyIdx}`);
			}
		}

		if (from === null || to === null) {
			console.warn(`[prose-ai] cannot locate "${s.original}" — skipping`);
			continue;
		}

		// ── 3. overlap guard ──────────────────────────────────
		if (occupied.some(r => from < r.to && to > r.from)) {
			console.warn(`[prose-ai] overlapping suggestion skipped: "${s.original}"`);
			continue;
		}

		occupied.push({ from, to });
		mapped.push({
			id: crypto.randomUUID(),
			from,
			to,
			type: s.type,
			original: s.original,
			replacement: s.replacement,
			explanation: s.explanation,
		});
	}

	return mapped;
};
