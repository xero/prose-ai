// ╔═══════════════════════════════╗
// ║   prose-ai — tooltip          ║
// ╚═══════════════════════════════╝

import { renderDiff }         from '../diff/render.js';
import { setSuggestionFocus } from '../extensions/suggestion.js';
import { editor as theEditor } from '../editor.js';

const el = {
	wrap: document.querySelector('#tooltip'),
	badge: document.querySelector('#tooltip-badge'),
	explanation: document.querySelector('#tooltip-explanation'),
	diff: document.querySelector('#tooltip-diff'),
	accept: document.querySelector('#tooltip-accept'),
	reject: document.querySelector('#tooltip-reject'),
};

let activeId = null;

// position the tooltip near a target DOM rect, keeping it on screen
const reposition = (targetRect) => {
	const pad  = 8;
	const tw   = el.wrap.offsetWidth  || 260;
	const th   = el.wrap.offsetHeight || 120;
	const vw   = window.innerWidth;
	const vh   = window.innerHeight;

	let top  = targetRect.bottom + pad;
	let left = targetRect.left;

	if (left + tw > vw - pad) left = vw - tw - pad;
	if (top  + th > vh - pad) top  = targetRect.top - th - pad;

	el.wrap.style.top  = `${top}px`;
	el.wrap.style.left = `${left}px`;
};

const show = (id, type, explanation, original, replacement, targetRect) => {
	activeId = id;

	el.badge.textContent  = type;
	el.badge.className    = `sg-badge sg-badge--${type}`;
	el.explanation.textContent = explanation;
	el.diff.replaceChildren(renderDiff(original, replacement));

	el.wrap.classList.add('visible');

	// reposition after paint so offsetWidth is accurate
	requestAnimationFrame(() => reposition(targetRect));

	// highlight the corresponding mark via decoration (PM redraws wipe
	// hand-written classes inside the editor)
	setSuggestionFocus(theEditor, id);

	// highlight sidebar card
	document.querySelectorAll('.sg-card').forEach(c => c.classList.remove('active'));
	document.querySelector(`.sg-card[data-id="${id}"]`)?.classList.add('active');
};

export const hide = () => {
	activeId = null;
	el.wrap.classList.remove('visible');
	setSuggestionFocus(theEditor, null);
	document.querySelectorAll('.sg-card').forEach(c => c.classList.remove('active'));
};

// showForId — called from sidebar card click
export const showForId = (id, editor) => {
	const mark = findMarkById(editor, id);
	if (!mark) return;

	// find the DOM span and get its bounding rect
	const span = document.querySelector(`[data-suggestion-id="${id}"]`);
	const rect  = span
		? span.getBoundingClientRect()
		: { top: 200, bottom: 220, left: 200 };

	show(id, mark.type, mark.explanation, mark.original, mark.replacement, rect);

	// scroll editor to mark
	span?.scrollIntoView({ block: 'center', behavior: 'smooth' });

	// pulse the mark so it stands out among neighbours; drop back to the
	// steady highlight once the animation has run (3 × 450ms)
	setSuggestionFocus(editor, id, true);
	setTimeout(() => {
		if (activeId === id) setSuggestionFocus(editor, id, false);
	}, 1450);
};

// a mark spanning a formatting boundary lives in several text nodes —
// accumulate the original across all of them
const findMarkById = (editor, id) => {
	let attrs = null;
	let original = '';
	editor.state.doc.descendants((node) => {
		if (!node.isText) return;
		const m = node.marks.find(
			m => m.type.name === 'suggestion' && m.attrs.id === id
		);
		if (m) { attrs ??= m.attrs; original += node.text; }
	});
	if (!attrs) return null;
	return {
		type: attrs.type,
		replacement: attrs.replacement,
		explanation: attrs.explanation,
		original,
	};
};

export const initTooltip = (editor) => {
	// click on a suggestion mark in the editor
	document.querySelector('#editor').addEventListener('click', (e) => {
		const span = e.target.closest('.suggestion');
		if (!span) {
			hide(); return;
		}

		const id   = span.dataset.suggestionId;
		const mark = findMarkById(editor, id);
		if (!mark) return;

		show(id, mark.type, mark.explanation, mark.original, mark.replacement,
			span.getBoundingClientRect());
	});

	// accept
	el.accept.addEventListener('click', () => {
		if (!activeId) return;
		editor.commands.acceptSuggestion(activeId);
		hide();
	});

	// reject
	el.reject.addEventListener('click', () => {
		if (!activeId) return;
		editor.commands.rejectSuggestion(activeId);
		hide();
	});

	// dismiss on outside click
	document.addEventListener('click', (e) => {
		if (!el.wrap.classList.contains('visible')) return;
		if (el.wrap.contains(e.target)) return;
		if (e.target.closest('.suggestion')) return;
		if (e.target.closest('.sg-card')) return;
		hide();
	});

	// dismiss on Escape
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') hide();
	});

	// hide when suggestions are cleared (e.g. re-analyze)
	document.addEventListener('suggestions:changed', ({ detail }) => {
		if (!activeId) return;
		const still = detail.suggestions.some(s => s.id === activeId);
		if (!still) hide();
	});
};
