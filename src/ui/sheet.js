// ╔═══════════════════════════════╗
// ║   prose-ai — bottom sheet     ║
// ╚═══════════════════════════════╝

// on small screens the sidebar becomes a bottom sheet: hidden while
// empty, peeking its header once suggestions exist, tap or drag to
// open. desktop layout is untouched — every handler gates on the
// same breakpoint the stylesheet uses.

import { mobile as mq } from './breakpoint.js';

// below this much finger travel a press is a tap (toggle), above it a
// drag — too low and natural finger wobble defeats tapping, too high and
// short flicks read as taps and bounce the sheet back
const PEEK_TAP_SLOP = 6;

// drag must travel this far to commit an open/close; shorter drags snap
// back so a hesitant half-pull doesn't change state
const SNAP_DISTANCE = 40;

export const initSheet = () => {
	const sheet  = /** @type {HTMLElement} */ (document.querySelector('#sidebar'));
	const header = /** @type {HTMLElement} */ (document.querySelector('#sidebar-header'));
	const list   = /** @type {HTMLElement} */ (document.querySelector('#sidebar-list'));

	// peek only when there is something to triage
	document.addEventListener('suggestions:changed', (e) => {
		const { detail } = /** @type {CustomEvent} */ (e);
		const hasItems = detail.suggestions.length > 0;
		sheet.classList.toggle('has-items', hasItems);
		if (!hasItems) sheet.classList.remove('open');
	});

	// ── tap or drag on the header ────────────────────────
	let startY = null;
	let moved  = false;

	const peekPx = () =>
		parseInt(getComputedStyle(sheet).getPropertyValue('--sheet-peek'), 10) || 44;

	header.addEventListener('pointerdown', (e) => {
		if (!mq.matches) return;
		startY = e.clientY;
		moved  = false;
		sheet.classList.add('dragging');
		header.setPointerCapture(e.pointerId);
		e.preventDefault();
	});

	header.addEventListener('pointermove', (e) => {
		if (startY === null) return;
		const dy = e.clientY - startY;
		if (Math.abs(dy) > PEEK_TAP_SLOP) moved = true;

		const height = sheet.getBoundingClientRect().height;
		const base   = sheet.classList.contains('open') ? 0 : height - peekPx();
		const y      = Math.max(0, Math.min(height - peekPx(), base + dy));
		sheet.style.transform = `translateY(${y}px)`;
	});

	const settle = (e) => {
		if (startY === null) return;
		const dy = e.clientY - startY;
		startY = null;
		sheet.classList.remove('dragging');
		sheet.style.transform = '';

		if (!moved)                  sheet.classList.toggle('open');   // tap
		else if (dy < -SNAP_DISTANCE) sheet.classList.add('open');
		else if (dy >  SNAP_DISTANCE) sheet.classList.remove('open');
	};
	header.addEventListener('pointerup', settle);
	header.addEventListener('pointercancel', () => {
		startY = null;
		sheet.classList.remove('dragging');
		sheet.style.transform = '';
	});

	// picking a card closes the sheet so the editor + tooltip show;
	// the card's accept/reject buttons keep it open for rapid triage
	list.addEventListener('click', (e) => {
		const target = /** @type {HTMLElement} */ (e.target);
		if (!mq.matches) return;
		if (target.closest('[data-action]')) return;
		if (target.closest('.sg-card')) sheet.classList.remove('open');
	});
};
