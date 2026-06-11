// ╔═══════════════════════════════╗
// ║   prose-ai — llm client       ║
// ╚═══════════════════════════════╝

import { buildPrompt, validateOutput }           from './prompt.js';
import { BACKEND_URL, BACKEND_KEY, MODEL,
         CHUNK_CHAR_BUDGET, CONTEXT_CHAR_CAP,
         MAX_CONCURRENT, MAX_TOKENS,
         TEMPERATURE, EXTRA_BODY }               from './config.js';
import { walkDocument }                          from './walker.js';
import { packChunks, withContext }               from './packer.js';
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
	const chunks = withContext(packChunks(blocks, CHUNK_CHAR_BUDGET), blocks, CONTEXT_CHAR_CAP);

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
					model:       MODEL,
					messages:    [{ role: 'user', content: buildPrompt(chunk.text, mode, types, chunk.context) }],
					stream:      false,
					max_tokens:  MAX_TOKENS,
					temperature: TEMPERATURE,
					...EXTRA_BODY,
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

	// two waves: the first chunk goes alone so feedback appears as fast as
	// the model can produce one response; the rest then run at full
	// concurrency (batched streams finish together, so a single all-at-once
	// wave would delay the first visible suggestion by the whole batch).
	const waves = [
		{ jobs: jobs.slice(0, 1), offset: 0 },
		{ jobs: jobs.slice(1),    offset: 1 },
	];

	for (const wave of waves) {
		if (wave.jobs.length === 0) continue;
		if (token !== myToken) {
			throw new DOMException('Aborted', 'AbortError');
		}
		for await (const result of pool.runProgressive(wave.jobs)) {
			if (token !== myToken) {
				throw new DOMException('Aborted', 'AbortError');
			}
			if (result.status === 'aborted') {
				throw new DOMException('Aborted', 'AbortError');
			}
			yield {
				type:        'chunk',
				index:       result.index + wave.offset,
				total,
				suggestions: result.status === 'fulfilled' ? result.value : [],
				error:       result.status === 'rejected'  ? result.reason : null,
			};
		}
	}
}

// cancel the in-flight analysis (no-op if idle)
export const cancelAnalysis = () => {
	token++;
	pool.abort();
};
