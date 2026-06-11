// ╔═══════════════════════════════╗
// ║   prose-ai — packer           ║
// ╚═══════════════════════════════╝

// packChunks(blocks, budget) → [{ text, blocks, totalFrom, totalTo }]
//   text:       '\n\n'-joined block text
//   blocks:     the block records packed into this chunk
//   totalFrom:  first block's from position
//   totalTo:    last block's to position
//
// Greedy: add blocks until the next one would exceed budget, then
// start a new chunk. A single oversize block becomes its own chunk.
export const packChunks = (blocks, budget) => {
	if (blocks.length === 0) return [];

	const chunks  = [];
	let   current = [];
	let   curLen  = 0;

	for (const block of blocks) {
		const len = block.text.length;

		if (current.length === 0) {
			current.push(block);
			curLen = len;
		} else if (curLen + 2 + len <= budget) {
			// '\n\n' separator costs 2 chars
			current.push(block);
			curLen += 2 + len;
		} else {
			chunks.push(makeChunk(current));
			current = [block];
			curLen  = len;
		}
	}

	if (current.length > 0) chunks.push(makeChunk(current));

	return chunks;
};

const makeChunk = (blocks) => ({
	text:      blocks.map(b => b.text).join('\n\n'),
	blocks,
	totalFrom: blocks[0].from,
	totalTo:   blocks[blocks.length - 1].to,
});

// withContext(chunks, blocks, cap) → chunks, each with a .context string
// holding the preceding blocks' text (newest kept, capped at `cap` chars).
// The first chunk gets ''. A single oversize predecessor contributes its
// word-aligned tail. `blocks` must be the same array packChunks consumed.
export const withContext = (chunks, blocks, cap) => {
	if (cap <= 0) return chunks.map(c => ({ ...c, context: '' }));

	return chunks.map((chunk) => {
		const firstIdx = blocks.indexOf(chunk.blocks[0]);
		const ctx  = [];
		let   used = 0;

		for (let i = firstIdx - 1; i >= 0; i--) {
			const len = blocks[i].text.length + (ctx.length ? 2 : 0);
			if (used + len > cap) {
				if (ctx.length === 0) {
					// single oversize predecessor: take its tail, word-aligned
					let tail = blocks[i].text.slice(-cap);
					const sp = tail.indexOf(' ');
					if (sp > 0) tail = tail.slice(sp + 1);
					ctx.unshift(tail);
				}
				break;
			}
			ctx.unshift(blocks[i].text);
			used += len;
		}

		return { ...chunk, context: ctx.join('\n\n') };
	});
};
