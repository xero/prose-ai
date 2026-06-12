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
	let analyzing = false;

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
		const doc   = editor.state.doc;

		if (!editor.getText().trim()) {
			setStatus('nothing to analyze', 'error');
			setTimeout(() => setStatus(''), 2500);
			return;
		}

		clearSuggestions(editor);
		setLoading(true);
		setStatus('waiting for model…', 'loading');
		analyzing = true;

		let completed = 0;
		let total     = 0;
		let failed    = 0;
		let applied   = 0;

		try {
			for await (const event of analyze(doc, mode, types)) {
				if (event.type === 'init') {
					total = event.total;
					setStatus(`analyzing 0/${total}…`, 'loading');
					continue;
				}
				if (event.type === 'notice') {
					setStatus(event.text ?? `analyzing ${completed}/${total}…`, 'loading');
					continue;
				}
				if (event.type === 'suggestion') {
					// each suggestion lands in the editor the moment it streams in
					const mapped = mapSuggestions(editor, [event.suggestion], event.chunkFrom);
					applyMappedSuggestions(editor, mapped);
					applied += mapped.length;
					continue;
				}
				if (event.type === 'chunk') {
					completed++;
					if (event.error) {
						failed++;
						console.warn('[prose-ai] chunk failed:', event.error);
					}
					setStatus(`analyzing ${completed}/${total}…`, 'loading');
				}
			}

			const n = applied;
			let msg = n
				? `${n} suggestion${n === 1 ? '' : 's'} found`
				: 'no suggestions found';
			if (failed > 0) msg += ` (${failed} section${failed === 1 ? '' : 's'} failed)`;
			setStatus(msg, failed > 0 ? 'warn' : '');
			setTimeout(() => setStatus(''), 5000);

		} catch (err) {
			if (err.name === 'AbortError') return;
			console.error('[prose-ai]', err);
			setStatus(err.message, 'error');
			setTimeout(() => setStatus(''), 5000);
		} finally {
			setLoading(false);
			analyzing = false;
		}
	});

	// ── abort on user typing during analysis ─────────────
	editor.on('update', ({ transaction }) => {
		if (!analyzing) return;
		if (!transaction.docChanged) return;
		if (transaction.getMeta('prose-ai:internal')) return;
		cancelAnalysis();
		setStatus('');
	});

	// update count badge whenever suggestions change
	document.addEventListener('suggestions:changed', ({ detail }) => {
		const n = detail.suggestions.length;
		if (n && !el.btnAnalyze.disabled) {
			// don't clobber an in-progress status message
		}
	});
};
