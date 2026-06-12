// ╔═══════════════════════════════╗
// ║   prose-ai — diff rendering   ║
// ╚═══════════════════════════════╝

import { diff_match_patch } from 'diff-match-patch';

const dmp = new diff_match_patch();

const WORD = /[\p{L}\p{N}]/u;

// expand changes that cut into a word out to whole-word boundaries:
// "is s[av→tor]ed" reads badly; "is [saved→stored]" is what an editor
// shows. punctuation/whitespace-only changes (e.g. "-" → " ") stay
// surgical — expanding those would swallow the words around them.
const expandToWordBoundaries = (parts) => {
	const out = [];
	let i = 0;
	while (i < parts.length) {
		if (parts[i].op === 'eq') {
			out.push({ ...parts[i] }); i++; continue;
		}

		// collect a maximal run of del/ins parts
		let del = '', ins = '';
		while (i < parts.length && parts[i].op !== 'eq') {
			if (parts[i].op === 'del') del += parts[i].text;
			else                       ins += parts[i].text;
			i++;
		}

		const cluster = del + ins;
		const prev = out[out.length - 1];
		const next = parts[i];  // following eq, if any

		// pull the cut word-fragment out of the neighbouring eq parts
		if (WORD.test(cluster[0] ?? '') && prev?.op === 'eq') {
			const frag = prev.text.match(/[\p{L}\p{N}]+$/u)?.[0] ?? '';
			if (frag) {
				prev.text = prev.text.slice(0, -frag.length);
				del = frag + del;
				ins = frag + ins;
				if (!prev.text) out.pop();
			}
		}
		if (WORD.test(cluster[cluster.length - 1] ?? '') && next?.op === 'eq') {
			const frag = next.text.match(/^[\p{L}\p{N}]+/u)?.[0] ?? '';
			if (frag) {
				next.text = next.text.slice(frag.length);
				del = del + frag;
				ins = ins + frag;
			}
		}

		if (del) out.push({ op: 'del', text: del });
		if (ins) out.push({ op: 'ins', text: ins });
	}
	return out.filter(p => p.text !== '');
};

// diffParts(original, replacement) → [{op: 'eq'|'del'|'ins', text}]
// character diff cleaned to word-friendly boundaries. joining eq+del parts
// reconstructs the original; eq+ins parts reconstruct the replacement.
export const diffParts = (original, replacement) => {
	const diffs = dmp.diff_main(original, replacement);
	dmp.diff_cleanupSemantic(diffs);
	return expandToWordBoundaries(diffs.map(([op, text]) => ({
		op: op === 0 ? 'eq' : (op === -1 ? 'del' : 'ins'),
		text,
	})));
};

// renderDiff(original, replacement) → DocumentFragment
// one inline run of the suggestion in context: unchanged text plain,
// deletions struck out, insertions highlighted
export const renderDiff = (original, replacement) => {
	const frag = document.createDocumentFragment();
	for (const { op, text } of diffParts(original, replacement)) {
		if (op === 'eq') {
			frag.appendChild(document.createTextNode(text));
			continue;
		}
		const span = document.createElement('span');
		span.className = op === 'del' ? 'diff-del' : 'diff-ins';
		span.textContent = text;
		frag.appendChild(span);
	}
	return frag;
};
