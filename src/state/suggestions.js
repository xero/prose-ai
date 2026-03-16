// ╔═══════════════════════════════╗
// ║   prose-ai — suggestion state ║
// ╚═══════════════════════════════╝

// applyMappedSuggestions(editor, mapped)
// mapped: [{from, to, id, type, replacement, explanation}]
// applies each as a SuggestionMark via raw transaction for precise positioning
export const applyMappedSuggestions = (editor, mapped) => {
	if (!mapped.length) {
		dispatchChanged(editor); return;
	}

	const { state, view } = editor;
	const markType = state.schema.marks.suggestion;
	let tr = state.tr;
	for (const s of mapped) {
		tr = tr.addMark(s.from, s.to, markType.create({
			id: s.id,
			type: s.type,
			replacement: s.replacement,
			explanation: s.explanation,
		}));
	}
	view.dispatch(tr);
	dispatchChanged(editor);
};

// clearSuggestions(editor)
// strips all suggestion marks and notifies listeners
export const clearSuggestions = (editor) => {
	editor.commands.clearAllSuggestions();
	dispatchChanged(editor);
};

// collectSuggestions(editor)
// walks the doc and returns every live suggestion mark, deduped by id
export const collectSuggestions = (editor) => {
	const found = [];
	const seen  = new Set();
	const textById = new Map();  // accumulate text across nodes sharing a mark id
	const rangeById = new Map(); // track from/to per id

	editor.state.doc.descendants((node, pos) => {
		if (!node.isText) return;
		for (const mark of node.marks) {
			if (mark.type.name !== 'suggestion') continue;
			const { id } = mark.attrs;
			textById.set(id, (textById.get(id) ?? '') + node.text);
			if (!rangeById.has(id)) {
				rangeById.set(id, { from: pos, to: pos + node.nodeSize, mark });
			} else {
				// extend the range to cover this node too
				rangeById.get(id).to = pos + node.nodeSize;
			}
		}
	});

	for (const [id, { from, to, mark }] of rangeById) {
		if (seen.has(id)) continue;
		seen.add(id);
		const { type, replacement, explanation } = mark.attrs;
		found.push({
			id, type, replacement, explanation,
			original: textById.get(id),
			from, to,
		});
	}

	return found;
};

// watchSuggestions(editor)
// hooks into Tiptap's transaction pipeline so the sidebar stays in sync
// when marks are removed by accept/reject or user edits
export const watchSuggestions = (editor) => {
	editor.on('transaction', ({ transaction }) => {
		if (transaction.docChanged) dispatchChanged(editor);
	});
};

// fire a DOM event with the current suggestion list as detail
// sidebar, toolbar, and tooltip all listen to this
const dispatchChanged = (editor) => {
	const suggestions = collectSuggestions(editor);
	document.dispatchEvent(
		new CustomEvent('suggestions:changed', { detail: { suggestions } })
	);
};
