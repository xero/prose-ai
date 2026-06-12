// ╔═══════════════════════════════╗
// ║   prose-ai — suggestion mark  ║
// ╚═══════════════════════════════╝

import { Mark, mergeAttributes }     from '@tiptap/core';
import { Plugin, PluginKey }         from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// transient focus/pulse highlighting must be a ProseMirror decoration —
// hand-written classes inside the contenteditable get wiped whenever PM
// redraws the node (its mutation observer treats them as foreign DOM).
export const suggestionFocusKey = new PluginKey('suggestion-focus');

// setSuggestionFocus(editor, id, pulse) — id null clears the highlight
export const setSuggestionFocus = (editor, id, pulse = false) => {
	const { state, view } = editor;
	view.dispatch(state.tr.setMeta(suggestionFocusKey, { id, pulse }));
};

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
		if (from === null) {
			from = pos; mark = m;
		}
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

	addProseMirrorPlugins() {
		const markType = this.type;
		return [
			new Plugin({
				key: suggestionFocusKey,
				state: {
					init: () => ({ id: null, pulse: false }),
					apply: (tr, prev) => tr.getMeta(suggestionFocusKey) ?? prev,
				},
				props: {
					decorations(state) {
						const { id, pulse } = suggestionFocusKey.getState(state);
						if (!id) return null;
						const decos = [];
						state.doc.descendants((node, pos) => {
							if (!node.isText) return;
							if (node.marks.some(m => m.type === markType && m.attrs.id === id)) {
								decos.push(Decoration.inline(pos, pos + node.nodeSize, {
									class: 'sg-locate' + (pulse ? ' sg-locate-pulse' : ''),
								}));
							}
						});
						return DecorationSet.create(state.doc, decos);
					},
				},
			}),
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
