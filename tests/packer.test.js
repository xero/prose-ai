import { describe, test, expect }      from 'bun:test';
import { packChunks, withContext }     from '../src/llm/packer.js';

const blk = (text, from, to) => ({ text, from, to, type: 'paragraph' });

describe('packChunks', () => {
	test('empty blocks returns empty chunks', () => {
		expect(packChunks([], 1200)).toEqual([]);
	});

	test('single block under budget returns one chunk', () => {
		const blocks = [blk('Hello', 0, 7)];
		const chunks = packChunks(blocks, 1200);
		expect(chunks.length).toBe(1);
		expect(chunks[0].blocks).toEqual(blocks);
		expect(chunks[0].text).toBe('Hello');
	});

	test('two blocks that fit together return one chunk', () => {
		const blocks = [blk('Hello', 0, 7), blk('World', 7, 14)];
		const chunks = packChunks(blocks, 1200);
		expect(chunks.length).toBe(1);
		expect(chunks[0].blocks.length).toBe(2);
	});

	test('two blocks that do not fit return two chunks', () => {
		const a      = blk('A'.repeat(700), 0,   700);
		const b      = blk('B'.repeat(700), 700, 1400);
		const chunks = packChunks([a, b], 1000);
		expect(chunks.length).toBe(2);
		expect(chunks[0].blocks).toEqual([a]);
		expect(chunks[1].blocks).toEqual([b]);
	});

	test('oversize single block becomes its own chunk', () => {
		const big    = blk('X'.repeat(2000), 0, 2000);
		const chunks = packChunks([big], 1200);
		expect(chunks.length).toBe(1);
		expect(chunks[0].blocks).toEqual([big]);
	});

	test('blocks 1+2 fit but block 3 does not — two chunks', () => {
		const a      = blk('A'.repeat(500), 0,    500);
		const b      = blk('B'.repeat(500), 500,  1000);
		const c      = blk('C'.repeat(500), 1000, 1500);
		// a+b: 500 + 2 + 500 = 1002 <= 1200 ✓
		// a+b+c: 1002 + 2 + 500 = 1504 > 1200 ✗
		const chunks = packChunks([a, b, c], 1200);
		expect(chunks.length).toBe(2);
		expect(chunks[0].blocks).toEqual([a, b]);
		expect(chunks[1].blocks).toEqual([c]);
	});

	test('chunk text is \\n\\n-joined block text', () => {
		const blocks = [blk('Foo', 0, 5), blk('Bar', 5, 10)];
		const chunks = packChunks(blocks, 1200);
		expect(chunks[0].text).toBe('Foo\n\nBar');
	});

	test('totalFrom/totalTo span first-to-last block', () => {
		const blocks = [blk('A', 10, 20), blk('B', 20, 35), blk('C', 35, 50)];
		const chunks = packChunks(blocks, 1200);
		expect(chunks[0].totalFrom).toBe(10);
		expect(chunks[0].totalTo).toBe(50);
	});
});

describe('withContext', () => {
	test('first chunk gets empty context', () => {
		const blocks = [blk('Hello', 0, 7)];
		const chunks = withContext(packChunks(blocks, 1200), blocks, 600);
		expect(chunks[0].context).toBe('');
	});

	test('later chunk gets preceding blocks as context', () => {
		const a = blk('A'.repeat(700), 0,    700);
		const b = blk('B'.repeat(700), 700,  1400);
		const blocks = [a, b];
		const chunks = withContext(packChunks(blocks, 1000), blocks, 800);
		expect(chunks.length).toBe(2);
		expect(chunks[1].context).toBe(a.text);
	});

	test('context accumulates multiple preceding blocks newest-first within cap', () => {
		const a = blk('aaa', 0, 5), b = blk('bbb', 5, 10), c = blk('C'.repeat(900), 10, 910);
		const blocks = [a, b, c];
		const chunks = withContext(packChunks(blocks, 100), blocks, 600);
		// a+b pack together (6+2 chars), c is its own chunk
		expect(chunks.length).toBe(2);
		expect(chunks[1].context).toBe('aaa\n\nbbb');
	});

	test('cap is respected — oldest blocks dropped first', () => {
		const a = blk('A'.repeat(500), 0, 500);
		const b = blk('B'.repeat(500), 500, 1000);
		const c = blk('ccc', 1000, 1005);
		const blocks = [a, b, c];
		// budget 501: each block lands in its own chunk (b+c would be 505)
		const chunks = withContext(packChunks(blocks, 501), blocks, 550);
		// context for c's chunk can fit b (500) but not a+b (1002)
		const last = chunks[chunks.length - 1];
		expect(last.blocks).toEqual([c]);
		expect(last.context).toBe(b.text);
	});

	test('single oversize predecessor contributes word-aligned tail', () => {
		const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
		const a = blk(words, 0, words.length);
		const b = blk('next paragraph', words.length, words.length + 16);
		const blocks = [a, b];
		const chunks = withContext(packChunks(blocks, words.length), blocks, 100);
		const ctx = chunks[1].context;
		expect(ctx.length).toBeLessThanOrEqual(100);
		expect(ctx.startsWith('word')).toBe(true);          // starts at a word boundary
		expect(words.endsWith(ctx)).toBe(true);             // is a tail of the predecessor
	});

	test('cap of 0 yields empty contexts everywhere', () => {
		const a = blk('A'.repeat(700), 0, 700);
		const b = blk('B'.repeat(700), 700, 1400);
		const blocks = [a, b];
		const chunks = withContext(packChunks(blocks, 1000), blocks, 0);
		expect(chunks.every(c => c.context === '')).toBe(true);
	});
});
