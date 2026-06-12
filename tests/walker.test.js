import { describe, test, expect } from 'bun:test';
import { Schema }                 from 'prosemirror-model';
import { walkDocument }           from '../src/llm/walker.js';

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: { group: 'block', content: 'inline*' },
		heading: {
			group: 'block', content: 'inline*',
			attrs: { level: { default: 1 } },
		},
		blockquote: { group: 'block', content: 'block+' },
		codeBlock: { group: 'block', content: 'text*', marks: '' },
		bulletList: { group: 'block', content: 'listItem+' },
		orderedList: { group: 'block', content: 'listItem+' },
		listItem: { content: 'paragraph+' },
		horizontalRule: { group: 'block' },
		text: { group: 'inline' },
	},
	marks: {},
});

const d  = (...nodes) => schema.node('doc', null, nodes);
const p  = (txt)      => schema.node('paragraph', null,
	txt ? [schema.text(txt)] : []);
const h  = (lvl, txt) => schema.node('heading', { level: lvl },
	[schema.text(txt)]);
const cb = (txt)      => schema.node('codeBlock', null,
	txt ? [schema.text(txt)] : []);
const li = (txt)      => schema.node('listItem', null, [p(txt)]);
const ul = (...items) => schema.node('bulletList', null, items);
const bq = (...ps)    => schema.node('blockquote', null, ps);

describe('walkDocument', () => {
	test('empty doc returns empty array', () => {
		// doc requires at least one block; use an empty paragraph
		const doc    = d(p(''));
		const blocks = walkDocument(doc, 'proofread');
		expect(blocks).toEqual([]);
	});

	test('single paragraph returns one block', () => {
		const doc    = d(p('Hello world'));
		const blocks = walkDocument(doc, 'proofread');
		expect(blocks.length).toBe(1);
		expect(blocks[0].text).toBe('Hello world');
		expect(blocks[0].type).toBe('paragraph');
	});

	test('multiple paragraphs return multiple blocks in order', () => {
		const doc    = d(p('First'), p('Second'), p('Third'));
		const blocks = walkDocument(doc, 'proofread');
		expect(blocks.length).toBe(3);
		expect(blocks.map(b => b.text)).toEqual(['First', 'Second', 'Third']);
	});

	test('heading included in proofread mode', () => {
		const doc    = d(h(1, 'My Title'), p('Body text'));
		const blocks = walkDocument(doc, 'proofread');
		const types  = blocks.map(b => b.type);
		expect(types).toContain('heading');
		expect(blocks.find(b => b.type === 'heading').text).toBe('My Title');
	});

	test('heading excluded in rewrite mode', () => {
		const doc    = d(h(1, 'My Title'), p('Body text'));
		const blocks = walkDocument(doc, 'rewrite');
		expect(blocks.every(b => b.type !== 'heading')).toBe(true);
	});

	test('code block always excluded', () => {
		const doc    = d(p('Before'), cb('const x = 1;'), p('After'));
		const blocks = walkDocument(doc, 'proofread');
		expect(blocks.length).toBe(2);
		expect(blocks.map(b => b.text)).toEqual(['Before', 'After']);
	});

	test('list with 3 items returns 3 listItem blocks', () => {
		const doc    = d(ul(li('Item 1'), li('Item 2'), li('Item 3')));
		const blocks = walkDocument(doc, 'proofread');
		expect(blocks.length).toBe(3);
		expect(blocks.every(b => b.type === 'listItem')).toBe(true);
		expect(blocks.map(b => b.text)).toEqual(['Item 1', 'Item 2', 'Item 3']);
	});

	test('empty paragraph is skipped', () => {
		const doc    = d(p('Real content'), p(''), p('More content'));
		const blocks = walkDocument(doc, 'proofread');
		expect(blocks.length).toBe(2);
	});

	test('positions monotonically increase', () => {
		const doc    = d(p('First'), p('Second'), p('Third'));
		const blocks = walkDocument(doc, 'proofread');
		for (let i = 1; i < blocks.length; i++) {
			expect(blocks[i].from).toBeGreaterThan(blocks[i - 1].from);
		}
	});

	test('single-paragraph blockquote emits one block of type blockquote', () => {
		const doc    = d(bq(p('Quote text.')));
		const blocks = walkDocument(doc, 'proofread');
		expect(blocks.length).toBe(1);
		expect(blocks[0].type).toBe('blockquote');
		expect(blocks[0].text).toBe('Quote text.');
	});

	test('multi-paragraph blockquote emits one block per paragraph', () => {
		const doc    = d(bq(p('First.'), p('Second.'), p('Third.')));
		const blocks = walkDocument(doc, 'proofread');
		expect(blocks.length).toBe(3);
		expect(blocks.every(b => b.type === 'blockquote')).toBe(true);
		expect(blocks.map(b => b.text)).toEqual(['First.', 'Second.', 'Third.']);
	});

	test('blockquote and regular paragraph in same doc are distinguishable', () => {
		const doc    = d(p('Regular.'), bq(p('Quoted.')), p('Also regular.'));
		const blocks = walkDocument(doc, 'proofread');
		expect(blocks.length).toBe(3);
		expect(blocks.map(b => b.type)).toEqual(['paragraph', 'blockquote', 'paragraph']);
	});

	test('empty paragraph inside blockquote is skipped', () => {
		const doc    = d(bq(p('Text.'), p(''), p('More.')));
		const blocks = walkDocument(doc, 'proofread');
		expect(blocks.length).toBe(2);
		expect(blocks.every(b => b.type === 'blockquote')).toBe(true);
	});

	test('positions inside blockquote are the paragraph positions, not the blockquote', () => {
		const doc    = d(bq(p('First.'), p('Second.')));
		const blocks = walkDocument(doc, 'proofread');
		expect(blocks.length).toBe(2);
		expect(blocks[1].from).toBeGreaterThan(blocks[0].from);
	});
});
