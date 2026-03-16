// ╔═══════════════════════════════╗
// ║   prose-ai — sidebar          ║
// ╚═══════════════════════════════╝

import { showForId } from './tooltip.js';

const el = {
	list: document.querySelector('#sidebar-list'),
	empty: document.querySelector('#sidebar-empty'),
	count: document.querySelector('#suggestion-count'),
};

const TYPE_LABELS = {
	grammar: 'Grammar',
	vocabulary: 'Vocabulary',
	clarity: 'Clarity',
	tone: 'Tone',
};

const renderCard = (s, editor) => {
	const card = document.createElement('div');
	card.className = 'sg-card';
	card.dataset.id = s.id;

	card.innerHTML = `
		<div class="sg-card-header">
			<span class="sg-badge sg-badge--${s.type}">${TYPE_LABELS[s.type] ?? s.type}</span>
			<div class="sg-card-actions">
				<button class="sg-btn accept" data-action="accept">accept</button>
				<button class="sg-btn reject" data-action="reject">reject</button>
			</div>
		</div>
		<p class="sg-card-explanation">${s.explanation}</p>
		<p class="sg-card-diff">
			<span class="sg-original">${s.original}</span>
			<span class="sg-arrow">→</span>
			<span class="sg-replacement">${s.replacement}</span>
		</p>
	`;

	// click card body → scroll + open tooltip
	card.addEventListener('click', (e) => {
		if (e.target.closest('[data-action]')) return;  // handled below
		showForId(s.id, editor);
	});

	// accept / reject buttons
	card.querySelector('[data-action="accept"]').addEventListener('click', (e) => {
		e.stopPropagation();
		editor.commands.acceptSuggestion(s.id);
	});

	card.querySelector('[data-action="reject"]').addEventListener('click', (e) => {
		e.stopPropagation();
		editor.commands.rejectSuggestion(s.id);
	});

	return card;
};

const render = (suggestions, editor) => {
	// update count badge
	el.count.textContent = suggestions.length;

	// clear existing cards (keep empty state node in DOM, just hide it)
	Array.from(el.list.children).forEach(c => {
		if (c !== el.empty) c.remove();
	});

	if (!suggestions.length) {
		el.empty.style.display = 'flex';
		return;
	}

	el.empty.style.display = 'none';

	// group by type for visual organisation: grammar → vocabulary → clarity → tone
	const ORDER = ['grammar', 'vocabulary', 'clarity', 'tone'];
	const sorted = [...suggestions].sort(
		(a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type)
	);

	for (const s of sorted) {
		el.list.appendChild(renderCard(s, editor));
	}
};

export const initSidebar = (editor) => {
	// initial render (empty state)
	render([], editor);

	// re-render whenever suggestions change
	document.addEventListener('suggestions:changed', ({ detail }) => {
		render(detail.suggestions, editor);
	});
};
