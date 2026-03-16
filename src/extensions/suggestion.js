// ╔═══════════════════════════════╗
// ║   prose-ai — suggestion mark  ║
// ╚═══════════════════════════════╝

import { Mark, mergeAttributes } from '@tiptap/core';

// walk the doc and return {from, to} for the first mark with matching id
// returns null if not found
const findMarkRange = (doc, markType, id) => {
	let found = null;
	doc.descendants((node, pos) => {
		if (found) return false;  // stop once located
		if (!node.isText) return;
		const m = node.marks.find(
			m => m.type === markType && m.attrs.id === id
		);
		if (m) found = { from: pos, to: pos + node.nodeSize, mark: m };
	});
	return found;
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
						.removeMark(from, to, markType)
						.replaceWith(from, to, replacement);
					dispatch(tr);
				}
				return true;
			},

			// remove the mark without changing the text
			rejectSuggestion: (id) => ({ state, tr, dispatch }) => {
				const range = findMarkRange(state.doc, markType, id);
				if (!range) return false;
				if (dispatch) {
					tr.removeMark(range.from, range.to, markType);
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
