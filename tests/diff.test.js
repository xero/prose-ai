import { describe, test, expect } from 'bun:test';
import { diffParts }              from '../src/diff/render.js';

const joined = (parts, ops) =>
	parts.filter(x => ops.includes(x.op)).map(x => x.text).join('');

describe('diffParts', () => {
	test('reconstruction invariants hold', () => {
		const o = 'The old chain key is wiped before the new one is saved.';
		const r = 'The old chain key is wiped before the new one is stored.';
		const parts = diffParts(o, r);
		expect(joined(parts, ['eq', 'del'])).toBe(o);
		expect(joined(parts, ['eq', 'ins'])).toBe(r);
	});

	test('pure insertion at the end', () => {
		const parts = diffParts(
			'The file key never travels.',
			'The file key never travels over the network.'
		);
		expect(joined(parts, ['del'])).toBe('');
		expect(joined(parts, ['ins'])).toBe(' over the network');
		expect(parts[0].op).toBe('eq');
	});

	test('hyphen to space is a tiny del + ins, not a rewrite', () => {
		const parts = diffParts(
			'the relay\'s message-size limit',
			'the relay\'s message size limit'
		);
		expect(joined(parts, ['del'])).toBe('-');
		expect(joined(parts, ['ins'])).toBe(' ');
	});

	test('sub-word change expands to the whole word', () => {
		const parts = diffParts('is saved.', 'is stored.');
		expect(joined(parts, ['del'])).toBe('saved');
		expect(joined(parts, ['ins'])).toBe('stored');
		expect(joined(parts, ['eq', 'del'])).toBe('is saved.');
		expect(joined(parts, ['eq', 'ins'])).toBe('is stored.');
	});

	test('punctuation-only change stays surgical (no word swallowing)', () => {
		const parts = diffParts('message-size', 'message size');
		expect(joined(parts, ['del'])).toBe('-');
		expect(joined(parts, ['ins'])).toBe(' ');
	});
});
