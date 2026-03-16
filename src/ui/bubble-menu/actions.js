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

export const ACTIONS = [
	{ id: 'synonyms', label: 'Synonyms', icon: '⇄', handler: synonymsHandler },
];
