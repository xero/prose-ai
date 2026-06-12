//  ▓██▀█ ▓██▀█ ▓██▀█   ▓██▀█ ▓██▀█    ▓██▀█ ▀▀
//  ▒██▄█ ▒██▄▀ ▒██ █   ▒██   ▒██▄  █▒ ▒██▄█ ██░
//  ███   ███ █ ███▄█ █▄███   ███▄▄    ███ █ ██▒
//  benchmark utilities

// buildDocFromText(text) — converts plain text to a minimal
// ProseMirror-compatible doc that walkDocument() can consume.
// Splits on blank lines; each block becomes a paragraph node.
// positions are consistent but not meaningful outside the walker.
export function buildDocFromText(text) {
	const blocks = text.split(/\n\n+/).map(b => b.trim()).filter(Boolean);
	let pos = 1;
	const nodes = blocks.map(blockText => {
		const nodePos  = pos;
		const nodeSize = blockText.length + 2;
		pos += nodeSize;
		return {
			type: { name: 'paragraph' },
			textContent: blockText,
			nodeSize,
			_pos: nodePos,
		};
	});
	return {
		descendants(cb) {
			for (const node of nodes) cb(node, node._pos, null);
		},
	};
}
