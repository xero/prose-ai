// ╔═══════════════════════════════╗
// ║   prose-ai — bubble actions   ║
// ╚═══════════════════════════════╝

import { getSynonyms } from '../../llm/synonyms.js';

export const getSentence = (editor, pos) =>
	editor.state.doc.resolve(pos).parent.textContent;

const synonymsHandler = ({ selection, sentence }) => ({
	mode: 'picklist',
	fetch: () => getSynonyms(selection, sentence),
});

export const synonymsShouldShow = ({ selection }) => {
	const trimmed = selection.trim();
	if (!trimmed) return false;
	const words = trimmed.split(/\s+/).filter(Boolean);
	return words.length >= 1 && words.length <= 10;
};

export const ACTIONS = [
	{
		id: 'synonyms',
		label: 'Synonyms',
		icon: '⇄',
		handler: synonymsHandler,
		shouldShow: synonymsShouldShow,
	},
];
