// ╔═══════════════════════════════╗
// ║   prose-ai — editor           ║
// ╚═══════════════════════════════╝
// singleton tiptap instance — imported by everything that needs the editor

import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { BubbleMenu as BubbleMenuExtension } from '@tiptap/extension-bubble-menu';
import { SuggestionMark } from './extensions/suggestion.js';

const STORAGE_KEY = 'prose-ai:content';
const saved = localStorage.getItem(STORAGE_KEY);

export const editor = new Editor({
	element: document.querySelector('#editor'),
	extensions: [
		StarterKit,
		Placeholder.configure({
			placeholder: 'Start writing, or paste your text here…',
		}),
		SuggestionMark,
		BubbleMenuExtension.configure({
			element: document.querySelector('#bubble-menu'),
			shouldShow: ({ editor, state }) => {
				const { from, to } = state.selection;
				if (from === to) return false;
				if (editor.isActive('suggestion')) return false;
				return true;
			},
		}),
	],
	content: saved ?? '<p>The quick brown fox jumps over the lazy dog. Their was a problem with the system yesterday, it effected alot of users and we need to look into it and figure out what went wrong and how we can stop it from happening again in the future.</p>',
	autofocus: true,
	onUpdate({ editor }) {
		localStorage.setItem(STORAGE_KEY, editor.getHTML());
	},
});
