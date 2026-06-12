// ╔═══════════════════════════════╗
// ║   prose-ai — suggestion mark  ║
// ╚═══════════════════════════════╝

import { Mark, mergeAttributes }     from '@tiptap/core';
import { Plugin, PluginKey }         from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { diffParts }                 from '../diff/render.js';

// transient focus highlighting must be a ProseMirror decoration —
// hand-written classes inside the contenteditable get wiped whenever PM
// redraws the node (its mutation observer treats them as foreign DOM).
export const suggestionFocusKey = new PluginKey('suggestion-focus');

// setSuggestionFocus(editor, id) — id null clears the highlight
export const setSuggestionFocus = (editor, id) => {
	const { state, view } = editor;
	view.dispatch(state.tr.setMeta(suggestionFocusKey, { id }));
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

// inline diff overlay: render each suggestion in the editor as the same
// changeset the sidebar shows. the DOCUMENT keeps only the original text —
// deletions are inline decorations over chars that already exist, and
// insertions are widget decorations (visual-only). so copy/paste yields
// clean original text, reject is just mark removal, and accept replaces
// text exactly as before.
const buildDiffDecorations = (doc, markType) => {
	// accumulate each mark's full original across formatting-split segments
	const byId = new Map();  // id → { start, text, attrs }
	doc.descendants((node, pos) => {
		if (!node.isText) return;
		const m = node.marks.find(m => m.type === markType);
		if (!m) return;
		const entry = byId.get(m.attrs.id);
		if (entry) entry.text += node.text;
		else byId.set(m.attrs.id, { start: pos, text: node.text, attrs: m.attrs });
	});

	const decos = [];
	for (const { start, text, attrs } of byId.values()) {
		let offset = 0;
		for (const part of diffParts(text, attrs.replacement)) {
			if (part.op === 'eq') {
				offset += part.text.length;
				continue;
			}
			if (part.op === 'del') {
				decos.push(Decoration.inline(
					start + offset, start + offset + part.text.length,
					{ class: 'diff-del' }
				));
				offset += part.text.length;
				continue;
			}
			// ins — the text exists only in this widget. it carries the
			// suggestion id and class so the tooltip click handler treats it
			// like any other part of the mark
			const at = start + offset;
			const insText = part.text;
			decos.push(Decoration.widget(at, () => {
				const span = document.createElement('span');
				span.className = 'suggestion diff-ins';
				span.dataset.suggestionId = attrs.id;
				span.textContent = insText;
				return span;
			}, { side: 1, key: `${attrs.id}:${at}:${insText}` }));
		}
	}
	return decos;
};

export const suggestionDiffKey = new PluginKey('suggestion-diff');

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
				key: suggestionDiffKey,
				state: {
					init: (_, state) =>
						DecorationSet.create(state.doc, buildDiffDecorations(state.doc, markType)),
					// marks only change via doc-changing transactions, so
					// metadata-only dispatches (focus, pulse) reuse the set
					apply: (tr, prev, _old, state) =>
						tr.docChanged
							? DecorationSet.create(state.doc, buildDiffDecorations(state.doc, markType))
							: prev,
				},
				props: {
					decorations(state) {
						return suggestionDiffKey.getState(state);
					},
				},
			}),
			new Plugin({
				key: suggestionFocusKey,
				state: {
					init: () => null,
					apply: (tr, prev) => {
						const meta = tr.getMeta(suggestionFocusKey);
						return meta === undefined ? prev : meta.id;
					},
				},
				props: {
					decorations(state) {
						const id = suggestionFocusKey.getState(state);
						if (!id) return null;
						const decos = [];
						state.doc.descendants((node, pos) => {
							if (!node.isText) return;
							if (node.marks.some(m => m.type === markType && m.attrs.id === id)) {
								decos.push(Decoration.inline(pos, pos + node.nodeSize, {
									class: 'sg-locate',
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
		// custom command names need tiptap's RawCommands module augmentation,
		// which only exists in typescript — cast for js consumers
		return /** @type {any} */ ({
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
		});
	},
});
