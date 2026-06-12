// ╔═══════════════════════════════╗
// ║   prose-ai — llm client       ║
// ╚═══════════════════════════════╝

import { buildPrompt, validateItem }             from './prompt.js';
import { BACKEND_URL, BACKEND_KEY, MODEL,
         CHUNK_CHAR_BUDGET, CONTEXT_CHAR_CAP,
         MAX_CONCURRENT, MAX_TOKENS,
         TEMPERATURE, EXTRA_BODY }               from './config.js';
import { walkDocument }                          from './walker.js';
import { packChunks, withContext }               from './packer.js';
import { RequestPool }                           from './pool.js';
import { createItemExtractor, parseSSE }         from './stream.js';

const pool = new RequestPool({ limit: MAX_CONCURRENT });

// token increments on every analyze() call and on cancelAnalysis(),
// so a stale run can detect it was superseded and throw AbortError.
let token = 0;

// how long analyze() will wait for a crashed backend to be resurrected
// by start.sh's supervisor before giving up
const BACKEND_WAIT_MS = 90_000;

const backendUp = async () => {
	try {
		const res = await fetch(`${BACKEND_URL}/models`, {
			signal: AbortSignal.timeout(2000),
		});
		return res.ok;
	} catch {
		return false;
	}
};

// resolves when the backend answers; throws if it stays down past the
// window or this run is superseded
const waitForBackend = async (myToken) => {
	const deadline = Date.now() + BACKEND_WAIT_MS;
	while (Date.now() < deadline) {
		if (token !== myToken) throw new DOMException('Aborted', 'AbortError');
		if (await backendUp()) return;
		await new Promise(r => setTimeout(r, 2000));
	}
	throw new Error(
		'LLM backend did not come back — check the rapid-mlx supervisor (/tmp/rapid-mlx.log)'
	);
};

// one streamed chunk: POST with stream:true, emit each validated
// suggestion the moment its closing brace arrives. returns the count.
const streamChunk = async (chunk, mode, types, signal, onSuggestion) => {
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
				stream:      true,
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

	let count = 0;
	const extract = createItemExtractor((item) => {
		const valid = validateItem(item, chunk.text);
		if (valid) { count++; onSuggestion(valid); }
	});
	await parseSSE(res, extract);
	return count;
};

// analyze(doc, mode, types) — async generator
// yields { type: 'init', total } first, then
//   { type: 'suggestion', suggestion } as each one streams in, and
//   { type: 'chunk', index, total, count, error } as each chunk settles.
// throws AbortError if cancelled; throws Error on network failure.
export async function* analyze(doc, mode, types) {
	pool.abort();
	const myToken = ++token;

	const blocks = walkDocument(doc, mode);
	const chunks = withContext(packChunks(blocks, CHUNK_CHAR_BUDGET), blocks, CONTEXT_CHAR_CAP);

	if (chunks.length === 0) return;

	const total = chunks.length;
	yield { type: 'init', total };

	// pre-flight: if the backend just crashed, the supervisor is already
	// relaunching it — wait instead of failing every chunk instantly
	if (!(await backendUp())) {
		yield { type: 'notice', text: 'backend starting…' };
		await waitForBackend(myToken);
		yield { type: 'notice', text: null };
	}

	// all events (per-suggestion and per-chunk) flow through one queue so
	// a single generator can interleave them in arrival order
	const queue = [];
	let notify  = null;
	const push  = (ev) => {
		queue.push(ev);
		if (notify) { notify(); notify = null; }
	};

	const jobs = chunks.map((chunk) => (signal) =>
		streamChunk(chunk, mode, types, signal, (suggestion) =>
			push({ type: 'suggestion', suggestion, chunkFrom: chunk.totalFrom })));

	// two waves: the first chunk goes alone so feedback appears as fast as
	// the model can produce it; the rest then run at full concurrency
	// (batched streams progress together, so a single all-at-once wave
	// would slow the first chunk's stream down by the whole batch).
	const waves = [
		{ jobs: jobs.slice(0, 1), offset: 0 },
		{ jobs: jobs.slice(1),    offset: 1 },
	];

	(async () => {
		for (const wave of waves) {
			if (wave.jobs.length === 0) continue;
			if (token !== myToken) break;
			for await (const result of pool.runProgressive(wave.jobs)) {
				if (result.status === 'aborted') {
					push({ type: 'aborted' });
					return;
				}
				push({
					type:  'chunk',
					index: result.index + wave.offset,
					total,
					count: result.status === 'fulfilled' ? result.value : 0,
					error: result.status === 'rejected'  ? result.reason : null,
				});
			}
		}
		push({ type: 'done' });
	})();

	while (true) {
		if (queue.length === 0) {
			await new Promise((r) => { notify = r; });
		}
		while (queue.length > 0) {
			if (token !== myToken) {
				throw new DOMException('Aborted', 'AbortError');
			}
			const ev = queue.shift();
			if (ev.type === 'done')    return;
			if (ev.type === 'aborted') throw new DOMException('Aborted', 'AbortError');
			yield ev;
		}
	}
}

// cancel the in-flight analysis (no-op if idle)
export const cancelAnalysis = () => {
	token++;
	pool.abort();
};
