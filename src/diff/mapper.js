// ╔═══════════════════════════════╗
// ║   prose-ai — position mapper  ║
// ╚═══════════════════════════════╝

import { diff_match_patch } from 'diff-match-patch';

const dmp = new diff_match_patch();

// build a flat char array + full plain text from the editor doc
// chars[i] = { nodePos, offsetInNode } so we can convert text offsets → PM positions
// block boundaries become '\n' sentinel entries (nodePos: -1) so a match can
// never silently span two paragraphs ("…end.Start…" would otherwise match)
const buildTextMap = (doc) => {
	const chars = [];
	let text = '';
	let lastBlock = null;

	doc.descendants((node, pos) => {
		if (node.isTextblock) {
			if (lastBlock !== null) {
				text += '\n';
				chars.push({ nodePos: -1, offsetInNode: 0 });
			}
			lastBlock = pos;
			return;
		}
		if (!node.isText) return;
		for (let i = 0; i < node.text.length; i++) {
			chars.push({ nodePos: pos, offsetInNode: i });
		}
		text += node.text;
	});

	return { text, chars };
};

// a usable match may not contain a block-boundary sentinel
const crossesBlocks = (chars, offset, length) => {
	for (let i = offset; i < offset + length; i++) {
		if (chars[i]?.nodePos === -1) return true;
	}
	return false;
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

// mapSuggestions(editor, suggestions, hintPos)
// suggestions: [{original, replacement, type, explanation}] from validation
// hintPos:     optional PM position of the source chunk — the search starts
//              there so short originals don't bind to an earlier duplicate
// returns:     [{id, from, to, type, original, replacement, explanation}]
// skips anything it cannot locate or that overlaps — never throws
export const mapSuggestions = (editor, suggestions, hintPos = null) => {
	const { text, chars } = buildTextMap(editor.state.doc);
	const mapped   = [];
	const occupied = [];  // [{from, to}] of already-placed suggestions

	// suggestions stream in one at a time, so the overlap guard must also
	// see marks applied by earlier calls
	editor.state.doc.descendants((node, pos) => {
		if (!node.isText) return;
		if (node.marks.some(m => m.type.name === 'suggestion')) {
			occupied.push({ from: pos, to: pos + node.nodeSize });
		}
	});

	// translate the chunk's PM position into a text offset for the search
	let hintOffset = 0;
	if (hintPos !== null) {
		const idx = chars.findIndex(c => c.nodePos + c.offsetInNode >= hintPos);
		if (idx > 0) hintOffset = idx;
	}

	for (const s of suggestions) {
		let from = null;
		let to   = null;

		// ── 1. exact substring match, from the chunk onward ──
		let exactIdx = text.indexOf(s.original, hintOffset);
		if (exactIdx === -1) exactIdx = text.indexOf(s.original);
		while (exactIdx !== -1 && crossesBlocks(chars, exactIdx, s.original.length)) {
			exactIdx = text.indexOf(s.original, exactIdx + 1);
		}
		if (exactIdx !== -1) {
			from = offsetToPos(chars, exactIdx);
			to   = exclusiveEnd(chars, exactIdx, s.original.length);
		}

		// ── 2. fuzzy fallback (model sometimes paraphrases) ──
		// match_main throws on patterns > 32 chars and can return loose hits,
		// so guard it and only trust a window that mostly equals the original
		if (from === null) {
			let fuzzyIdx = -1;
			try { fuzzyIdx = dmp.match_main(text, s.original.slice(0, 32), hintOffset); }
			catch { /* pattern unusable — treat as no match */ }
			if (fuzzyIdx !== -1 && !crossesBlocks(chars, fuzzyIdx, s.original.length)) {
				const window = text.slice(fuzzyIdx, fuzzyIdx + s.original.length);
				const common = dmp.diff_main(window, s.original)
					.filter(d => d[0] === 0)
					.reduce((n, d) => n + d[1].length, 0);
				if (common / s.original.length >= 0.8) {
					from = offsetToPos(chars, fuzzyIdx);
					to   = exclusiveEnd(chars, fuzzyIdx, s.original.length);
					console.info(`[prose-ai] fuzzy match "${s.original}" at offset ${fuzzyIdx}`);
				}
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
