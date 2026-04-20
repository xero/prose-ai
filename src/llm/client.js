// ╔═══════════════════════════════╗
// ║   prose-ai — llm client       ║
// ╚═══════════════════════════════╝

import { buildPrompt, validateOutput }               from './prompt.js';
import { BACKEND_URL, BACKEND_KEY, MODEL,
         CHUNK_CHAR_BUDGET, MAX_CONCURRENT, NUM_CTX } from './config.js';
import { walkDocument }                          from './walker.js';
import { packChunks }                            from './packer.js';
import { RequestPool }                           from './pool.js';

const pool = new RequestPool({ limit: MAX_CONCURRENT });

// token increments on every analyze() call and on cancelAnalysis(),
// so a stale run can detect it was superseded and throw AbortError.
let token = 0;

// analyze(doc, mode, types) — async generator
// yields { type: 'init', total } first, then
//   { type: 'chunk', index, total, suggestions, error } per chunk.
// throws AbortError if cancelled; throws Error on network failure.
export async function* analyze(doc, mode, types) {
	pool.abort();
	const myToken = ++token;

	const blocks = walkDocument(doc, mode);
	const chunks = packChunks(blocks, CHUNK_CHAR_BUDGET);

	if (chunks.length === 0) return;

	const total = chunks.length;
	yield { type: 'init', total };

	const jobs = chunks.map((chunk) => async (signal) => {
		let res;
		try {
			res = await fetch(`${BACKEND_URL}/chat/completions`, {
				method:  'POST',
				headers: {
					'Content-Type':  'application/json',
					'Authorization': `Bearer ${BACKEND_KEY}`,
				},
				body:    JSON.stringify({
					model:    MODEL,
					messages: [{ role: 'user', content: buildPrompt(chunk.text, mode, types) }],
					stream:   false,
					options:  { num_ctx: NUM_CTX },
				}),
				signal,
			});
		} catch (err) {
			if (err.name === 'AbortError') throw err;
			throw new Error(
				`LLM backend unreachable — is it running? (${err.message})`,
				{ cause: err }
			);
		}

		if (!res.ok) {
			const detail = await res.text().catch(() => '');
			throw new Error(
				`LLM backend returned ${res.status}` +
				(detail ? ': ' + detail : '')
			);
		}

		const data = await res.json();
		return validateOutput(data.choices?.[0]?.message?.content ?? '', chunk.text);
	});

	for await (const result of pool.runProgressive(jobs)) {
		if (token !== myToken) {
			throw new DOMException('Aborted', 'AbortError');
		}
		if (result.status === 'aborted') {
			throw new DOMException('Aborted', 'AbortError');
		}
		yield {
			type:        'chunk',
			index:       result.index,
			total,
			suggestions: result.status === 'fulfilled' ? result.value : [],
			error:       result.status === 'rejected'  ? result.reason : null,
		};
	}
}

// cancel the in-flight analysis (no-op if idle)
export const cancelAnalysis = () => {
	token++;
	pool.abort();
};
