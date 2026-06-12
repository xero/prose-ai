//  ▓██▀█ ▓██▀█ ▓██▀█   ▓██▀█ ▓██▀█    ▓██▀█ ▀▀
//  ▒██▄█ ▒██▄▀ ▒██ █   ▒██   ▒██▄  █▒ ▒██▄█ ██░
//  ███   ███ █ ███▄█ █▄███   ███▄▄    ███ █ ██▒
//  picklist

let picklistEl = null;
let cleanupFns = [];

export const hidePicklist = () => {
	if (!picklistEl) return;
	cleanupFns.forEach(fn => fn());
	cleanupFns = [];
	picklistEl.remove();
	picklistEl = null;
};

export const showPicklist = ({ descriptor, from, to, anchorRect, editor }) => {
	hidePicklist();

	picklistEl = document.createElement('div');
	picklistEl.id = 'picklist';
	picklistEl.innerHTML = '<div class="picklist-loading"><span class="spinner"></span> …</div>';
	document.body.appendChild(picklistEl);

	positionPicklist(anchorRect);

	// escape to close
	const onKeydown = (e) => {
		if (e.key === 'Escape') hidePicklist();
	};
	document.addEventListener('keydown', onKeydown);
	cleanupFns.push(() => document.removeEventListener('keydown', onKeydown));

	// click outside to close
	const onMousedown = (e) => {
		if (picklistEl && !picklistEl.contains(e.target)) hidePicklist();
	};
	// defer so the triggering click doesn't immediately close
	setTimeout(() => {
		document.addEventListener('mousedown', onMousedown);
		cleanupFns.push(() => document.removeEventListener('mousedown', onMousedown));
	}, 0);

	// fetch synonyms
	descriptor.fetch().then((items) => {
		if (!picklistEl) return; // was closed while fetching
		if (items.length === 0) {
			picklistEl.innerHTML = '<div class="picklist-error">No synonyms found<button class="picklist-dismiss">ok</button></div>';
			picklistEl.querySelector('.picklist-dismiss').addEventListener('click', hidePicklist);
			return;
		}
		picklistEl.innerHTML = '';
		for (const item of items) {
			const row = document.createElement('div');
			row.className = 'picklist-item';
			row.innerHTML = `<span class="picklist-synonym">${escapeHtml(item.synonym)}</span>${item.note ? `<span class="picklist-note">${escapeHtml(item.note)}</span>` : ''}`;
			row.addEventListener('click', () => {
				editor.chain().focus().insertContentAt({ from, to }, item.synonym).run();
				hidePicklist();
			});
			picklistEl.appendChild(row);
		}
		requestAnimationFrame(() => positionPicklist(anchorRect));
	}).catch((err) => {
		if (err.name === 'AbortError') return;
		if (!picklistEl) return;
		picklistEl.innerHTML = `<div class="picklist-error">${escapeHtml(err.message)}<button class="picklist-dismiss">dismiss</button></div>`;
		picklistEl.querySelector('.picklist-dismiss').addEventListener('click', hidePicklist);
	});
};

const positionPicklist = (anchorRect) => {
	if (!picklistEl) return;
	requestAnimationFrame(() => {
		if (!picklistEl) return;
		const pad = 8;
		const pw  = picklistEl.offsetWidth  || 200;
		const ph  = picklistEl.offsetHeight || 100;
		const vw  = window.innerWidth;
		const vh  = window.innerHeight;

		let top  = anchorRect.bottom + pad;
		let left = anchorRect.left;

		if (left + pw > vw - pad) left = vw - pw - pad;
		if (left < pad) left = pad;
		if (top + ph > vh - pad) top = anchorRect.top - ph - pad;

		picklistEl.style.top  = `${top}px`;
		picklistEl.style.left = `${left}px`;
	});
};

const escapeHtml = (str) =>
	str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
