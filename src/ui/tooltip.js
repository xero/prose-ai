// ╔═══════════════════════════════╗
// ║   prose-ai — tooltip          ║
// ╚═══════════════════════════════╝

import { renderDiff }          from '../diff/render.js';
import { setSuggestionFocus }  from '../extensions/suggestion.js';
import { editor as theEditor } from '../editor.js';
import { mobile }              from './breakpoint.js';

const el = {
	wrap: /** @type {HTMLElement} */ (document.querySelector('#tooltip')),
	badge: /** @type {HTMLElement} */ (document.querySelector('#tooltip-badge')),
	explanation: /** @type {HTMLElement} */ (document.querySelector('#tooltip-explanation')),
	diff: /** @type {HTMLElement} */ (document.querySelector('#tooltip-diff')),
	accept: /** @type {HTMLButtonElement} */ (document.querySelector('#tooltip-accept')),
	reject: /** @type {HTMLButtonElement} */ (document.querySelector('#tooltip-reject')),
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

	// the full popup is mobile-only: on desktop the inline diff and the
	// sidebar card already show everything it would repeat (double-click
	// opens the mini variant instead — see showMini)
	if (mobile.matches) {
		el.badge.textContent  = type;
		el.badge.className    = `sg-badge sg-badge--${type}`;
		el.explanation.textContent = explanation;
		el.diff.replaceChildren(renderDiff(original, replacement));

		el.wrap.classList.remove('mini');
		el.wrap.classList.add('visible');

		// reposition after paint so offsetWidth is accurate
		requestAnimationFrame(() => reposition(targetRect));
	} else {
		// a single click moves focus to another suggestion — close any
		// mini popup so its buttons can't act on the new activeId
		el.wrap.classList.remove('visible', 'mini');
	}

	// highlight the corresponding mark via decoration (PM redraws wipe
	// hand-written classes inside the editor)
	setSuggestionFocus(theEditor, id);

	// highlight the sidebar card; on desktop it is the control surface
	// (accept/reject live there), so pin it to the top of the list where
	// the eye can find it without scanning
	document.querySelectorAll('.sg-card').forEach(c => c.classList.remove('active'));
	const card = document.querySelector(`.sg-card[data-id="${id}"]`);
	card?.classList.add('active');
	if (!mobile.matches) card?.scrollIntoView({ block: 'start', behavior: 'smooth' });
};

export const hide = () => {
	activeId = null;
	el.wrap.classList.remove('visible', 'mini');
	setSuggestionFocus(theEditor, null);
	document.querySelectorAll('.sg-card').forEach(c => c.classList.remove('active'));
};

// mini popup (desktop double-click): one row — badge, accept, reject.
// the inline diff already shows the change, so only the actions travel
// to the pointer
const showMini = (id, type, targetRect) => {
	activeId = id;

	el.badge.textContent = type;
	el.badge.className   = `sg-badge sg-badge--${type}`;

	el.wrap.classList.add('visible', 'mini');
	requestAnimationFrame(() => reposition(targetRect));
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

	// scroll editor to mark — show() already set the pulsing focus
	span?.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

// a mark spanning a formatting boundary lives in several text nodes —
// accumulate the original across all of them
const findMarkById = (editor, id) => {
	/** @type {?{ type: string, replacement: string, explanation: string }} */
	let attrs = null;
	let original = '';
	editor.state.doc.descendants((node) => {
		if (!node.isText) return;
		const m = node.marks.find(
			m => m.type.name === 'suggestion' && m.attrs.id === id
		);
		if (m) {
			attrs ??= m.attrs; original += node.text;
		}
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
		const span = /** @type {?HTMLElement} */ (
			/** @type {HTMLElement} */ (e.target).closest('.suggestion'));
		if (!span) {
			hide(); return;
		}

		const id   = span.dataset.suggestionId;
		const mark = findMarkById(editor, id);
		if (!mark) return;

		show(id, mark.type, mark.explanation, mark.original, mark.replacement,
			span.getBoundingClientRect());
	});

	// double-click on a suggestion (desktop): accept/reject at the pointer
	document.querySelector('#editor').addEventListener('dblclick', (e) => {
		if (mobile.matches) return;
		const span = /** @type {?HTMLElement} */ (
			/** @type {HTMLElement} */ (e.target).closest('.suggestion'));
		if (!span) return;

		const id   = span.dataset.suggestionId;
		const mark = findMarkById(editor, id);
		if (!mark) return;

		// double-click word-selects, and a selection summons the synonyms
		// bubble. PM applies that selection after this handler runs, so the
		// collapse has to happen a tick later or it collapses nothing
		setTimeout(() => {
			editor.commands.setTextSelection(editor.state.selection.from);
		}, 0);

		showMini(id, mark.type, span.getBoundingClientRect());
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
		const target = /** @type {HTMLElement} */ (e.target);
		if (!el.wrap.classList.contains('visible')) return;
		if (el.wrap.contains(target)) return;
		if (target.closest('.suggestion')) return;
		if (target.closest('.sg-card')) return;
		hide();
	});

	// dismiss on Escape
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') hide();
	});

	// hide when suggestions are cleared (e.g. re-analyze)
	document.addEventListener('suggestions:changed', (e) => {
		const { detail } = /** @type {CustomEvent} */ (e);
		if (!activeId) return;
		const still = detail.suggestions.some(s => s.id === activeId);
		if (!still) hide();
	});

	// a tooltip open while the window grows past the breakpoint would
	// strand a popup desktop never shows — drop it, keep the highlight
	mobile.addEventListener('change', (e) => {
		if (!e.matches) el.wrap.classList.remove('visible');
	});
};
