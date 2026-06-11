// ╔═══════════════════════════════╗
// ║   prose-ai — suggestion mark  ║
// ╚═══════════════════════════════╝

import { Mark, mergeAttributes } from '@tiptap/core';

// walk the doc and return the full {from, to} of the mark with matching id.
// a single suggestion span is stored as SEVERAL text nodes whenever it
// crosses a formatting boundary (bold, italic, link), so the range must
// cover every node carrying the id — stopping at the first one corrupts
// accept (partial replace) and reject (partial unhighlight).
const findMarkRange = (doc, markType, id) => {
	let from = null, to = null, mark = null;
	doc.descendants((node, pos) => {
		if (!node.isText) return;
		const m = node.marks.find(
			m => m.type === markType && m.attrs.id === id
		);
		if (!m) return;
		if (from === null) { from = pos; mark = m; }
		to = pos + node.nodeSize;
	});
	return from === null ? null : { from, to, mark };
};

export const SuggestionMark = Mark.create({
	name: 'suggestion',
	priority: 1000,  // render above most other marks

	addAttributes() {
		return {
			id: { default: null },
			type: { default: 'grammar' },   // grammar | vocabulary | clarity | tone
			replacement: { default: '' },
			explanation: { default: '' },
		};
	},

	parseHTML() {
		return [{ tag: 'span[data-suggestion-id]' }];
	},

	renderHTML({ HTMLAttributes, mark }) {
		return [
			'span',
			mergeAttributes(HTMLAttributes, {
				'class': `suggestion suggestion--${mark.attrs.type}`,
				'data-suggestion-id': mark.attrs.id,
				'data-type': mark.attrs.type,
			}),
			0,  // hole — render children inside
		];
	},

	addCommands() {
		const markType = this.type;  // capture outside command closures
		return {
			// replace marked text with the suggestion replacement, remove mark
			acceptSuggestion: (id) => ({ state, dispatch }) => {
				const found = findMarkRange(state.doc, markType, id);
				if (!found) return false;
				const { from, to, mark } = found;
				if (dispatch) {
					const replacement = state.schema.text(mark.attrs.replacement);
					const tr = state.tr
						.setMeta('prose-ai:internal', true)
						.removeMark(from, to, markType)
						.replaceWith(from, to, replacement);
					dispatch(tr);
				}
				return true;
			},

			// remove the mark without changing the text
			rejectSuggestion: (id) => ({ state, dispatch }) => {
				const range = findMarkRange(state.doc, markType, id);
				if (!range) return false;
				if (dispatch) {
					const tr = state.tr
						.setMeta('prose-ai:internal', true)
						.removeMark(range.from, range.to, markType);
					dispatch(tr);
				}
				return true;
			},

			// clear every suggestion mark from the entire document
			clearAllSuggestions: () => ({ state, tr, dispatch }) => {
				if (dispatch) {
					tr.removeMark(0, state.doc.content.size, markType);
					dispatch(tr);
				}
				return true;
			},
		};
	},
});
