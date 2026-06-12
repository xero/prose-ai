//  ▓██▀█ ▓██▀█ ▓██▀█   ▓██▀█ ▓██▀█    ▓██▀█ ▀▀
//  ▒██▄█ ▒██▄▀ ▒██ █   ▒██   ▒██▄  █▒ ▒██▄█ ██░
//  ███   ███ █ ███▄█ █▄███   ███▄▄    ███ █ ██▒
//  bubble menu

import { ACTIONS, getSentence } from './actions.js';
import { showPicklist, hidePicklist } from './picklist.js';

export { hidePicklist };

export const initBubbleMenu = (editor) => {
	const bubbleMenuEl = document.querySelector('#bubble-menu');
	if (!bubbleMenuEl) return;

	const renderButtons = () => {
		const { from, to } = editor.state.selection;
		const selection = editor.state.doc.textBetween(from, to);

		bubbleMenuEl.replaceChildren();

		for (const action of ACTIONS) {
			const info = { selection, from, to };
			if (action.shouldShow && !action.shouldShow(info)) continue;

			const btn = document.createElement('button');
			btn.className = 'bubble-btn';
			btn.innerHTML = `<span class="bubble-icon">${action.icon}</span>${action.label}`;
			btn.addEventListener('mousedown', (e) => {
				// prevent focus loss — keeps selection alive
				e.preventDefault();
			});
			btn.addEventListener('click', () => {
				triggerAction(action, editor, bubbleMenuEl);
			});
			bubbleMenuEl.appendChild(btn);
		}
	};

	editor.on('selectionUpdate', renderButtons);
	renderButtons();

	// keyboard shortcut: Cmd+Shift+S / Ctrl+Shift+S
	document.addEventListener('keydown', (e) => {
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'S') {
			e.preventDefault();
			const { from, to } = editor.state.selection;
			if (from === to) return;
			const synonymsAction = ACTIONS.find(a => a.id === 'synonyms');
			if (!synonymsAction) return;
			const selection = editor.state.doc.textBetween(from, to);
			if (synonymsAction.shouldShow && !synonymsAction.shouldShow({ selection, from, to })) return;
			triggerAction(synonymsAction, editor, bubbleMenuEl);
		}
	});
};

const triggerAction = async (action, editor, bubbleMenuEl) => {
	const { from, to } = editor.state.selection;
	const selection = editor.state.doc.textBetween(from, to);
	const anchorRect = bubbleMenuEl.getBoundingClientRect();
	const sentence = getSentence(editor, from);

	const descriptor = action.handler({ selection, sentence, from, to, editor });

	if (descriptor.mode === 'picklist') {
		showPicklist({ descriptor, from, to, anchorRect, editor });
	} else if (descriptor.mode === 'replace') {
		try {
			const result = await descriptor.fetch();
			editor.chain().focus().insertContentAt({ from, to }, result).run();
		} catch (err) {
			if (err.name !== 'AbortError') console.error(err);
		}
	}
};
