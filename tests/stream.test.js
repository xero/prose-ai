import { describe, test, expect } from 'bun:test';
import { createItemExtractor }    from '../src/llm/stream.js';

// feed text to an extractor in pieces of `step` chars
const feed = (text, step = 1) => {
	const items = [];
	const extract = createItemExtractor(i => items.push(i));
	for (let i = 0; i < text.length; i += step) {
		extract(text.slice(i, i + step));
	}
	return items;
};

const A = '{"original":"a","replacement":"b","type":"clarity","explanation":"x"}';
const B = '{"original":"c","replacement":"d","type":"grammar","explanation":"y"}';

describe('createItemExtractor', () => {
	test('emits items from a complete array', () => {
		expect(feed(`[${A},${B}]`, 7)).toEqual([JSON.parse(A), JSON.parse(B)]);
	});

	test('emits each item as soon as it closes (1-char feed)', () => {
		expect(feed(`[${A},${B}]`).length).toBe(2);
	});

	test('handles braces and brackets inside strings', () => {
		const tricky = '{"original":"if (x) { y[0] }","replacement":"z","type":"clarity","explanation":"e"}';
		expect(feed(`[${tricky}]`, 3)).toEqual([JSON.parse(tricky)]);
	});

	test('handles escaped quotes inside strings', () => {
		const esc = '{"original":"he said \\"hi\\"","replacement":"r","type":"tone","explanation":"e"}';
		expect(feed(`[${esc}]`, 2)).toEqual([JSON.parse(esc)]);
	});

	test('ignores leading think noise and fences', () => {
		expect(feed(`<think>{not the array}</think>\n\`\`\`json\n[${A}]\n\`\`\``, 5).length).toBe(1);
	});

	test('truncated final item is dropped, earlier items survive', () => {
		expect(feed(`[${A},{"original":"trunc`, 4)).toEqual([JSON.parse(A)]);
	});

	test('nested objects inside an item stay intact', () => {
		const nested = '{"original":"a","replacement":"b","type":"clarity","explanation":"x","meta":{"n":1}}';
		expect(feed(`[${nested}]`, 6)).toEqual([JSON.parse(nested)]);
	});

	test('empty array emits nothing', () => {
		expect(feed('[]')).toEqual([]);
	});
});
