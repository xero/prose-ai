import { describe, test, expect } from 'bun:test';
import { buildPrompt } from '../src/llm/synonyms.js';
import { synonymsShouldShow } from '../src/ui/bubble-menu/actions.js';

describe('synonymsShouldShow', () => {
	test('returns false for empty selection', () => {
		expect(synonymsShouldShow({ selection: '' })).toBe(false);
	});

	test('returns false for whitespace-only selection', () => {
		expect(synonymsShouldShow({ selection: '   ' })).toBe(false);
	});

	test('returns true for 1-word selection', () => {
		expect(synonymsShouldShow({ selection: 'fast' })).toBe(true);
	});

	test('returns true for 10-word selection (upper boundary)', () => {
		expect(synonymsShouldShow({ selection: 'one two three four five six seven eight nine ten' })).toBe(true);
	});

	test('returns false for 11-word selection (over boundary)', () => {
		expect(synonymsShouldShow({ selection: 'one two three four five six seven eight nine ten eleven' })).toBe(false);
	});

	test('handles multiple consecutive spaces correctly (counts words, not spaces)', () => {
		// "one  two  three" has 3 words despite extra spaces
		expect(synonymsShouldShow({ selection: 'one  two  three' })).toBe(true);
	});
});

describe('buildPrompt', () => {
	test('includes the sentence and selection', () => {
		const prompt = buildPrompt('fast', 'The car was fast.');
		expect(prompt).toContain('"The car was fast."');
		expect(prompt).toContain('"fast"');
	});

	test('includes single-word example', () => {
		const prompt = buildPrompt('x', 'y');
		expect(prompt).toContain('Single word selected');
	});

	test('includes phrase example', () => {
		const prompt = buildPrompt('x', 'y');
		expect(prompt).toContain('in order to');
	});

	test('includes noun phrase example', () => {
		const prompt = buildPrompt('x', 'y');
		expect(prompt).toContain('the red car');
	});

	test('instructs no markdown fences', () => {
		const prompt = buildPrompt('x', 'y');
		expect(prompt).toContain('No markdown fences');
	});
});
