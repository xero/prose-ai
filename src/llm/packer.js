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
