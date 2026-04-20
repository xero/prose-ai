// ╔═══════════════════════════════╗
// ║   prose-ai — walker           ║
// ╚═══════════════════════════════╝

const HEADING_MODES = new Set(['proofread']);
const SKIP_ALWAYS   = new Set(['codeBlock', 'image', 'horizontalRule']);

// walkDocument(doc, mode) → [{ text, from, to, type }]
//   text:  plain-text content of the block
//   from:  ProseMirror absolute position of start
//   to:    ProseMirror absolute position of end
//   type:  'paragraph' | 'heading' | 'blockquote' | 'listItem'
//
// Headings are included in proofread mode only.
// List items are emitted individually; the parent list is not emitted.
// Blockquote paragraphs are emitted individually with type 'blockquote';
// the outer blockquote wrapper is not emitted.
// Code blocks, horizontal rules, and images are always skipped.
// Empty or whitespace-only blocks are skipped.
export const walkDocument = (doc, mode) => {
	const blocks = [];
	const inclHeadings = HEADING_MODES.has(mode);

	doc.descendants((node, pos, parent) => {
		const name = node.type.name;

		if (SKIP_ALWAYS.has(name)) return false;

		if (name === 'listItem') {
			const text = node.textContent;
			if (text.trim()) {
				blocks.push({
					text,
					from: pos,
					to:   pos + node.nodeSize,
					type: 'listItem',
				});
			}
			return false;
		}

		if (name === 'paragraph') {
			const text = node.textContent;
			if (text.trim()) {
				const inQuote = parent?.type.name === 'blockquote';
				blocks.push({
					text,
					from: pos,
					to:   pos + node.nodeSize,
					type: inQuote ? 'blockquote' : 'paragraph',
				});
			}
			return false;
		}

		if (name === 'heading') {
			if (inclHeadings) {
				const text = node.textContent;
				if (text.trim()) {
					blocks.push({
						text,
						from: pos,
						to:   pos + node.nodeSize,
						type: 'heading',
					});
				}
			}
			return false;
		}

		if (name === 'blockquote') {
			return true;   // recurse; inner paragraphs handle themselves
		}

		return true;
	});

	return blocks;
};
