// ╔═══════════════════════════════╗
// ║   prose-ai — sidebar resizer  ║
// ╚═══════════════════════════════╝

const STORAGE_KEY = 'prose-ai:sidebar-width';
const MIN = 220;

const root = document.documentElement;

const maxWidth = () => Math.min(640, Math.round(window.innerWidth * 0.5));

const clamp = (px) => Math.max(MIN, Math.min(maxWidth(), px));

const setWidth = (px) => root.style.setProperty('--sidebar', `${px}px`);

export const initResizer = () => {
	const handle = document.querySelector('#sidebar-resizer');

	// restore persisted width
	const saved = Number(localStorage.getItem(STORAGE_KEY));
	if (saved) setWidth(clamp(saved));

	let dragging = false;

	handle.addEventListener('pointerdown', (e) => {
		dragging = true;
		handle.setPointerCapture(e.pointerId);
		handle.classList.add('dragging');
		document.body.classList.add('resizing');
		e.preventDefault();
	});

	handle.addEventListener('pointermove', (e) => {
		if (!dragging) return;
		// width is derived from the pointer, not accumulated deltas, so a
		// pointer that leaves and re-enters mid-drag can never drift
		setWidth(clamp(Math.round(window.innerWidth - e.clientX)));
	});

	const stop = () => {
		if (!dragging) return;
		dragging = false;
		handle.classList.remove('dragging');
		document.body.classList.remove('resizing');
		const px = parseInt(root.style.getPropertyValue('--sidebar'), 10);
		if (px) localStorage.setItem(STORAGE_KEY, String(px));
	};
	handle.addEventListener('pointerup', stop);
	handle.addEventListener('pointercancel', stop);

	// double-click resets to the stylesheet default
	handle.addEventListener('dblclick', () => {
		root.style.removeProperty('--sidebar');
		localStorage.removeItem(STORAGE_KEY);
	});

	// keep the width in bounds if the window shrinks
	window.addEventListener('resize', () => {
		const px = parseInt(root.style.getPropertyValue('--sidebar'), 10);
		if (px && px !== clamp(px)) setWidth(clamp(px));
	});
};
