import { describe, test, expect }        from 'bun:test';
import { buildPrompt, validateOutput }   from '../src/llm/prompt.js';

describe('buildPrompt', () => {
	test('context section sits between rules and Text', () => {
		const p = buildPrompt('The text.', 'proofread', ['grammar'], 'The context.');
		const ctxAt  = p.indexOf('The context.');
		const textAt = p.indexOf('Text:\nThe text.');
		expect(ctxAt).toBeGreaterThan(-1);
		expect(textAt).toBeGreaterThan(ctxAt);
	});

	test('empty context renders the start-of-document placeholder', () => {
		const p = buildPrompt('The text.', 'proofread', ['grammar']);
		expect(p).toContain('(start of document)');
	});

	// the server's prefix cache only hits on a byte-identical prefix, so
	// everything before the per-chunk context must not vary across chunks
	test('static prefix is byte-identical across chunks of one run', () => {
		const a = buildPrompt('First chunk text.',  'rewrite', [], '');
		const b = buildPrompt('Second chunk text.', 'rewrite', [], 'First chunk text.');
		const marker = 'Context (';
		const prefixA = a.slice(0, a.indexOf(marker));
		const prefixB = b.slice(0, b.indexOf(marker));
		expect(prefixA.length).toBeGreaterThan(100);
		expect(prefixA).toBe(prefixB);
	});
});

describe('validateOutput', () => {
	const src = 'We use it in order to win.';
	const item = '[{"original":"in order to","replacement":"to","type":"clarity","explanation":"Shorter."}]';

	test('parses a clean JSON array', () => {
		expect(validateOutput(item, src).length).toBe(1);
	});

	test('strips <think>…</think> blocks', () => {
		const raw = '<think>hmm, let me reason about this</think>\n' + item;
		expect(validateOutput(raw, src).length).toBe(1);
	});

	test('handles dangling </think> with no opening tag', () => {
		const raw = 'reasoning that leaked without an open tag</think>' + item;
		expect(validateOutput(raw, src).length).toBe(1);
	});

	test('strips markdown fences after think blocks', () => {
		const raw = '<think>x</think>```json\n' + item + '\n```';
		expect(validateOutput(raw, src).length).toBe(1);
	});

	test('slices to outermost brackets when prose surrounds the array', () => {
		const raw = 'Here are the suggestions:\n' + item + '\nHope this helps!';
		expect(validateOutput(raw, src).length).toBe(1);
	});

	test('drops suggestions anchored only in context (not in chunk text)', () => {
		const ctxOnly = '[{"original":"previous paragraph phrase","replacement":"x","type":"clarity","explanation":"y"}]';
		expect(validateOutput(ctxOnly, src).length).toBe(0);
	});

	test('returns [] on garbage', () => {
		expect(validateOutput('not json at all', src)).toEqual([]);
	});

	test('repairs a truncated array (missing closing bracket)', () => {
		const truncated = item.slice(0, -1);  // drop the final ]
		expect(validateOutput(truncated, src).length).toBe(1);
	});

	test('repairs an array cut off mid-item', () => {
		const twoItems = item.slice(0, -1) + ',{"original":"We use","replacem';
		const out = validateOutput(twoItems, src);
		expect(out.length).toBe(1);
		expect(out[0].original).toBe('in order to');
	});
});
