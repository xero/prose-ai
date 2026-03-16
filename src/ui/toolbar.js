// ╔═══════════════════════════════╗
// ║   prose-ai — toolbar          ║
// ╚═══════════════════════════════╝

import { analyze, cancelAnalysis } from '../llm/client.js';
import { mapSuggestions }          from '../diff/mapper.js';
import { applyMappedSuggestions, clearSuggestions } from '../state/suggestions.js';

const el = {
	btnAnalyze: document.querySelector('#btn-analyze'),
	btnCancel: document.querySelector('#btn-cancel'),
	btnReflow: document.querySelector('#btn-reflow'),
	status: document.querySelector('#toolbar-status'),
	toggles: document.querySelectorAll('.type-toggle'),
};

const getActiveMode = () =>
	document.querySelector('.mode-btn.active')?.dataset.mode ?? 'proofread';

// read checked types from the toolbar checkboxes
const getActiveTypes = () =>
	Array.from(el.toggles)
		.filter(t => t.querySelector('input').checked)
		.map(t => t.dataset.type);

const setLoading = (on) => {
	el.btnAnalyze.disabled = on;
	el.btnReflow.disabled  = on;
	el.btnAnalyze.innerHTML = on
		? '<span class="spinner"></span> analyzing…'
		: 'analyze';
	el.btnCancel.classList.toggle('visible', on);
};

const setStatus = (msg, kind = '') => {
	el.status.textContent = msg;
	el.status.className   = kind ? `loading ${kind}` : '';
};

export const initToolbar = (editor) => {

	// ── mode selector ────────────────────────────────────
	document.querySelectorAll('.mode-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			document.querySelector('#type-toggles')
				.classList.toggle('visible', btn.dataset.mode === 'proofread');
		});
	});
	// show type toggles on init (default mode is proofread)
	document.querySelector('#type-toggles').classList.add('visible');

	// ── type toggle checkboxes ───────────────────────────
	el.toggles.forEach(toggle => {
		const cb = toggle.querySelector('input');
		toggle.addEventListener('click', () => {
			cb.checked = !cb.checked;
			toggle.classList.toggle('active', cb.checked);
		});
	});

	// ── cancel button ────────────────────────────────────
	el.btnCancel.addEventListener('click', () => {
		cancelAnalysis();
		setLoading(false);
		setStatus('cancelled');
		setTimeout(() => setStatus(''), 2000);
	});

	// ── reflow button ────────────────────────────────
	el.btnReflow.addEventListener('click', () => {
		const { state, view } = editor;
		const { tr, doc, schema } = state;

		let changed = false;

		doc.descendants((node, pos) => {
			if (!node.isText) return;

			const reflowed = node.text.replace(/\n/g, ' ');
			if (reflowed !== node.text) {
				tr.replaceWith(pos, pos + node.nodeSize, schema.text(reflowed));
				changed = true;
			}
		});

		if (!changed) {
			setStatus('nothing to reflow', '');
			setTimeout(() => setStatus(''), 2000);
			return;
		}

		view.dispatch(tr);
		setStatus('reflowed', '');
		setTimeout(() => setStatus(''), 2000);
	});

	// ── analyze button ───────────────────────────────────
	el.btnAnalyze.addEventListener('click', async () => {
		const mode  = getActiveMode();
		const types = getActiveTypes();

		const text = editor.getText();
		if (!text.trim()) {
			setStatus('nothing to analyze', 'error');
			setTimeout(() => setStatus(''), 2500);
			return;
		}

		// clear previous suggestions before starting
		clearSuggestions(editor);

		setLoading(true);
		setStatus('waiting for ollama…', 'loading');

		try {
			const suggestions = await analyze(text, mode, types);

			setStatus('mapping positions…', 'loading');
			const mapped = mapSuggestions(editor, suggestions);

			applyMappedSuggestions(editor, mapped);

			const n = mapped.length;
			setStatus(n ? `${n} suggestion${n === 1 ? '' : 's'} found` : 'no suggestions found');
			setTimeout(() => setStatus(''), 3000);

		} catch (err) {
			if (err.name === 'AbortError') return;  // cancel button handled it

			console.error('[prose-ai]', err);
			setStatus(err.message, 'error');
			setTimeout(() => setStatus(''), 5000);
		} finally {
			setLoading(false);
		}
	});

	// update count badge whenever suggestions change
	document.addEventListener('suggestions:changed', ({ detail }) => {
		const n = detail.suggestions.length;
		if (n && !el.btnAnalyze.disabled) {
			// don't clobber an in-progress status message
		}
	});
};
