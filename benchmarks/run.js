// ╔═══════════════════════════════════════╗
// ║   prose-ai — benchmark runner         ║
// ╚═══════════════════════════════════════╝

import { readFile, writeFile, mkdir } from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
	MODELS, MODES, RUNS_PER_COMBO,
	CHUNK_BUDGETS, CONCURRENCY_CEILINGS,
} from './config.js';
import { buildDocFromText }                        from './utils.js';
import { buildPrompt, validateOutput, stripThink } from '../src/llm/prompt.js';
import { walkDocument }                            from '../src/llm/walker.js';
import { packChunks, withContext }                 from '../src/llm/packer.js';
import { RequestPool }                             from '../src/llm/pool.js';
import {
	BACKEND_URL, BACKEND_KEY,
	CHUNK_CHAR_BUDGET, CONTEXT_CHAR_CAP, MAX_CONCURRENT,
	MAX_TOKENS, TEMPERATURE, EXTRA_BODY,
} from '../src/llm/config.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const PROOFREAD_TYPES    = ['grammar', 'vocabulary', 'clarity', 'tone'];

// ── arg parsing ────────────────────────────────────────────────────

function parseArgs() {
	const argv = process.argv.slice(2);
	const a = {
		models: null,
		docs: null,
		modes: null,
		runs: null,
		out: null,
		timeout: null,
		baseline: null,
		baselineModel: null,
		chunked: false,
		sweep: false,
		quick: false,
		help: false,
	};
	for (let i = 0; i < argv.length; i++) {
		switch (argv[i]) {
		case '--models':  a.models  = argv[++i].split(','); break;
		case '--docs':    a.docs    = argv[++i].split(','); break;
		case '--modes':   a.modes   = argv[++i].split(','); break;
		case '--runs':    a.runs    = Number(argv[++i]);    break;
		case '--out':     a.out     = argv[++i];            break;
		case '--timeout': a.timeout = Number(argv[++i]);    break;
		case '--baseline':       a.baseline      = argv[++i]; break;
		case '--baseline-model': a.baselineModel = argv[++i]; break;
		case '--chunked': a.chunked = true;                 break;
		case '--sweep':   a.sweep   = true;                 break;
		case '--quick':   a.quick   = true;                 break;
		case '--help':
		case '-h':        a.help    = true;                 break;
		}
	}
	return a;
}

function usage(defaultRuns) {
	console.log(`
Usage: bun run benchmarks/run.js [options]

Options:
  --models  <list>  Comma-separated model names (default: config.js)
  --docs    <list>  Comma-separated doc sizes:
                    short,medium,long,pathological (default: all)
  --modes   <list>  Comma-separated modes:
                    proofread,rewrite,formalize,concise (default: all)
  --runs    <n>     Iterations per combination; first is discarded
                    as cold-load (default: ${defaultRuns})
  --timeout <ms>    Per-request timeout in ms
                    (default: ${DEFAULT_TIMEOUT_MS})
  --out     <pfx>   Output file path prefix
  --chunked         Run against the chunked pipeline using config
                    defaults; outputs results-chunked.md/.json
  --baseline <path> Baseline JSON for the delta table
                    (default: benchmarks/r-phaseD.json)
  --baseline-model <name>
                    Model name to read from the baseline when it
                    differs from the model under test
                    (default: ministral-3:8b)
  --sweep           Sweep CHUNK_BUDGETS x CONCURRENCY_CEILINGS;
                    outputs results-sweep.md/.json
  --quick           With --sweep: use 1 doc (medium) and 1 mode
                    (rewrite), all models — for fast iteration
  --help            Show this message
`.trim());
}

// ── helpers ────────────────────────────────────────────────────────

function fmtMs(ms) {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	const s = ms / 1000;
	return s >= 10 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`;
}

function pad(s, n) {
	s = String(s);
	return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function mean(arr) {
	if (arr.length === 0) return 0;
	return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
	if (arr.length === 0) return 0;
	const s = [...arr].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── parse classification ───────────────────────────────────────────
// validateOutput returns [] for both "nothing to fix" and "bad json".
// classify manually so we can report them separately.
//
// returns: 'ok' | 'empty' | 'parse_fail' | 'not_array'
function classifyResponse(raw) {
	let cleaned = stripThink(raw)
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```\s*$/, '')
		.trim();

	if (!cleaned.startsWith('[')) {
		const open  = cleaned.indexOf('[');
		const close = cleaned.lastIndexOf(']');
		if (open !== -1 && close > open) cleaned = cleaned.slice(open, close + 1);
	}

	if (cleaned === '') return 'empty';

	let parsed;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		return 'parse_fail';
	}

	if (!Array.isArray(parsed)) return 'not_array';
	return 'ok';
}

// ── single-shot chat completion with timeout ───────────────────────
// body matches src/llm/client.js exactly so we measure what the app sends

const chatBody = (model, prompt) => JSON.stringify({
	model,
	messages: [{ role: 'user', content: prompt }],
	stream: false,
	max_tokens: MAX_TOKENS,
	temperature: TEMPERATURE,
	...EXTRA_BODY,
});

const chatHeaders = {
	'Content-Type': 'application/json',
	'Authorization': `Bearer ${BACKEND_KEY}`,
};

async function chatCall(model, prompt, timeoutMs) {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(`${BACKEND_URL}/chat/completions`, {
			method: 'POST',
			headers: chatHeaders,
			body: chatBody(model, prompt),
			signal: ctrl.signal,
		});
		if (!res.ok) {
			throw new Error(`backend HTTP ${res.status}: ${await res.text()}`);
		}
		const data = await res.json();
		return data.choices?.[0]?.message?.content ?? '';
	} catch (err) {
		if (err.name === 'AbortError') {
			throw new Error(`timed out after ${timeoutMs}ms`, { cause: err });
		}
		throw err;
	} finally {
		clearTimeout(timer);
	}
}

// ── baseline combo ─────────────────────────────────────────────────

async function benchCombo(model, doc, text, mode, runs, timeoutMs) {
	const types   = mode === 'proofread' ? PROOFREAD_TYPES : [];
	const prompt  = buildPrompt(text, mode, types);
	const timings = [], counts = [], statuses = [];

	for (let i = 0; i < runs; i++) {
		const t0 = performance.now();
		let raw = '', status;
		try {
			raw    = await chatCall(model, prompt, timeoutMs);
			status = classifyResponse(raw);
		} catch (err) {
			status = 'error';
			console.warn(`\n    run ${i + 1} failed: ${err.message}`);
		}
		const sugg = status === 'ok' ? validateOutput(raw, text) : [];
		timings.push(Math.round(performance.now() - t0));
		counts.push(sugg.length);
		statuses.push(status);
	}

	const slicer       = arr => arr.length > 1 ? arr.slice(1) : arr;
	const keptTimings  = slicer(timings);
	const keptCounts   = slicer(counts);
	const keptStatuses = slicer(statuses);

	const tally = { ok: 0, empty: 0, parse_fail: 0, not_array: 0, error: 0 };
	for (const s of keptStatuses) tally[s]++;

	return {
		doc, model, mode,
		runs: timings,
		avg: Math.round(mean(keptTimings)),
		median: Math.round(median(keptTimings)),
		min: Math.min(...keptTimings),
		max: Math.max(...keptTimings),
		suggestion_counts: counts,
		avg_suggestions: Math.round(mean(keptCounts) * 100) / 100,
		statuses,
		parse_success_rate: tally.ok / keptStatuses.length,
		status_tally: tally,
	};
}

// ── chunked combo ──────────────────────────────────────────────────
// known divergence from the app: the bench uses stream:false and
// whole-response validateOutput (which includes truncation repair), while
// the app streams per-item through validateItem. total decode is the same
// either way, which is what the latency numbers measure; suggestion counts
// can differ slightly from what the app would apply.

async function benchComboChunked(
	model, doc, text, mode, runs, timeoutMs, budget, concurrency
) {
	const types   = mode === 'proofread' ? PROOFREAD_TYPES : [];
	const fakeDoc = buildDocFromText(text);
	const blocks  = walkDocument(fakeDoc, mode);
	const chunks  = withContext(packChunks(blocks, budget), blocks, CONTEXT_CHAR_CAP);

	if (chunks.length === 0) {
		return {
			doc, model, mode, budget, concurrency,
			runs: [], avg: 0, median: 0, min: 0, max: 0,
			suggestion_counts: [], avg_suggestions: 0, chunk_count: 0,
			ttf_avg: 0,
		};
	}

	const timings = [], counts = [], ttfs = [];
	// generous per-run ceiling: full serial budget × number of rounds
	const timeLimit =
		timeoutMs * Math.max(1, Math.ceil(chunks.length / concurrency));

	for (let i = 0; i < runs; i++) {
		const t0   = performance.now();
		const sugg = [];
		let   ttf  = 0;   // time to first settled chunk — the user's
		                  // "first feedback appears" latency

		try {
			const pool = new RequestPool({ limit: concurrency });
			const jobs = chunks.map(chunk => async (signal) => {
				const res = await fetch(`${BACKEND_URL}/chat/completions`, {
					method: 'POST',
					headers: chatHeaders,
					body: chatBody(model, buildPrompt(chunk.text, mode, types, chunk.context)),
					signal,
				});
				if (!res.ok) throw new Error(`backend HTTP ${res.status}`);
				const data = await res.json();
				return validateOutput(data.choices?.[0]?.message?.content ?? '', chunk.text);
			});

			const timeoutId = setTimeout(() => pool.abort(), timeLimit);
			let timedOut = false;

			// mirror client.js: first chunk solo for fast first feedback,
			// then the rest at full concurrency
			const waves = [jobs.slice(0, 1), jobs.slice(1)];
			for (const wave of waves) {
				if (wave.length === 0 || timedOut) continue;
				for await (const r of pool.runProgressive(wave)) {
					if (r.status === 'aborted') {
						timedOut = true; break;
					}
					if (!ttf) ttf = Math.round(performance.now() - t0);
					if (r.status === 'fulfilled') sugg.push(...r.value);
				}
			}
			clearTimeout(timeoutId);
			if (timedOut) throw new Error(`timed out after ${timeLimit}ms`);
		} catch (err) {
			console.warn(`\n    run ${i + 1} failed: ${err.message}`);
		}

		timings.push(Math.round(performance.now() - t0));
		counts.push(sugg.length);
		ttfs.push(ttf);
	}

	const slicer      = arr => arr.length > 1 ? arr.slice(1) : arr;
	const keptTimings = slicer(timings);
	const keptCounts  = slicer(counts);
	const keptTtfs    = slicer(ttfs).filter(t => t > 0);

	return {
		doc, model, mode, budget, concurrency,
		runs: timings,
		avg: Math.round(mean(keptTimings)),
		median: Math.round(median(keptTimings)),
		min: keptTimings.length ? Math.min(...keptTimings) : 0,
		max: keptTimings.length ? Math.max(...keptTimings) : 0,
		suggestion_counts: counts,
		avg_suggestions: Math.round(mean(keptCounts) * 100) / 100,
		chunk_count: chunks.length,
		ttf_runs: ttfs,
		ttf_avg: Math.round(mean(keptTtfs)),
	};
}

// ── baseline markdown ──────────────────────────────────────────────

function buildMarkdown(results, models, docs, modes, host, backendVer) {
	const ts  = new Date().toISOString().slice(0, 16).replace('T', ' ');
	const out = [];

	const get = (model, doc, mode) =>
		results.find(
			r => r.model === model && r.doc === doc && r.mode === mode
		);

	// only include successful-parse runs in averages for the summary
	const modeAvgs = (model, doc) =>
		modes
			.map(mo => get(model, doc, mo))
			.filter(r => r && r.parse_success_rate > 0)
			.map(r => r.avg);

	out.push('# Prose-AI Baseline Benchmark', '');
	out.push(`Generated ${ts}.`);
	out.push(`Host: ${host}`);
	out.push(`Backend: ${backendVer}`, '');
	out.push(
		'> [!NOTE]',
		'> Latency is the mean after discarding the first (cold-load) run.',
		'> Suggestion counts and parse rates use the same non-cold runs.',
		'> "parse rate" = fraction of runs where the model returned',
		'> parseable JSON. Low parse rate means the model is unusable',
		'> regardless of latency.',
		''
	);

	// ── Summary ──────────────────────────────────────────────────

	out.push('## Summary', '');
	out.push('(Latency averaged across all modes with any successful parse.)', '');

	const mw = Math.max('Model'.length, ...models.map(m => m.length));
	const dw = docs.map(d => {
		const vals = models.flatMap(m => {
			const avgs = modeAvgs(m, d);
			return avgs.length ? [fmtMs(mean(avgs))] : ['—'];
		});
		return Math.max(d.length, ...vals.map(v => v.length));
	});

	const mkRow = (first, cells) =>
		'| ' + first + ' | ' + cells.join(' | ') + ' |';

	out.push(mkRow(pad('Model', mw), docs.map((d, i) => pad(d, dw[i]))));
	out.push(mkRow('-'.repeat(mw), dw.map(w => '-'.repeat(w))));

	for (const model of models) {
		const cells = docs.map((d, i) => {
			const avgs = modeAvgs(model, d);
			return pad(avgs.length ? fmtMs(mean(avgs)) : '—', dw[i]);
		});
		out.push(mkRow(pad(model, mw), cells));
	}

	out.push('');

	// ── Parse reliability ─────────────────────────────────────────

	out.push('## Parse reliability', '');
	out.push(
		'Fraction of non-cold runs where the model returned parseable JSON.',
		'A model below 0.8 is effectively broken for editorial use.',
		''
	);

	const pw = Math.max(4, ...docs.map(d => d.length));

	out.push(mkRow(pad('Model', mw), docs.map(d => pad(d, pw))));
	out.push(mkRow('-'.repeat(mw), docs.map(() => '-'.repeat(pw))));

	for (const model of models) {
		const cells = docs.map(d => {
			const rs = modes
				.map(mo => get(model, d, mo))
				.filter(Boolean);
			if (!rs.length) return pad('—', pw);
			const rate = mean(rs.map(r => r.parse_success_rate));
			return pad(rate.toFixed(2), pw);
		});
		out.push(mkRow(pad(model, mw), cells));
	}

	out.push('');

	// ── Per-mode detail ───────────────────────────────────────────

	out.push('## Per-mode detail', '');

	const SUGG_HDR  = 'suggestions (long)';
	const PARSE_HDR = 'parse (long)';

	for (const mode of modes) {
		out.push(`### ${mode}`, '');

		const sw = Math.max(SUGG_HDR.length, ...models.map(m => {
			const r = get(m, 'long', mode);
			return r ? String(r.avg_suggestions).length : 1;
		}));
		const pcw = Math.max(PARSE_HDR.length, 4);
		const mdw = docs.map(d => {
			const vals = models.map(m => {
				const r = get(m, d, mode);
				return r ? fmtMs(r.avg) : '—';
			});
			return Math.max(d.length, ...vals.map(v => v.length));
		});

		const mkRow2 = (first, cells, sugg, parse) =>
			'| ' + first + ' | ' + cells.join(' | ') +
			' | ' + sugg + ' | ' + parse + ' |';

		out.push(mkRow2(
			pad('Model', mw),
			docs.map((d, i) => pad(d, mdw[i])),
			pad(SUGG_HDR, sw),
			pad(PARSE_HDR, pcw)
		));
		out.push(mkRow2(
			'-'.repeat(mw),
			mdw.map(w => '-'.repeat(w)),
			'-'.repeat(sw),
			'-'.repeat(pcw)
		));

		for (const model of models) {
			const cells = docs.map((d, i) => {
				const r = get(model, d, mode);
				return pad(r ? fmtMs(r.avg) : '—', mdw[i]);
			});
			const longR = get(model, 'long', mode);
			const sugg  = pad(
				longR ? String(longR.avg_suggestions) : '—',
				sw
			);
			const parse = pad(
				longR ? longR.parse_success_rate.toFixed(2) : '—',
				pcw
			);
			out.push(mkRow2(pad(model, mw), cells, sugg, parse));
		}

		out.push('');
	}

	return out.join('\n');
}

// ── chunked markdown ───────────────────────────────────────────────

function buildChunkedMarkdown(
	results, baseResults, baselineModel, models, docs, modes,
	budget, concurrency, host, backendVer
) {
	const ts  = new Date().toISOString().slice(0, 16).replace('T', ' ');
	const out = [];

	const get = (model, doc, mode) =>
		results.find(
			r => r.model === model && r.doc === doc && r.mode === mode
		);


	const modeAvgs = (src, model, doc) =>
		modes
			.map(mo => src.find(
				r => r.model === model && r.doc === doc && r.mode === mo
			))
			.filter(r => r && r.avg > 0)
			.map(r => r.avg);

	out.push('# Prose-AI Chunked Pipeline Benchmark', '');
	out.push(`Generated ${ts}.`);
	out.push(`Host: ${host}`);
	out.push(`Backend: ${backendVer}`);
	out.push(
		`Chunk budget: ${budget} chars  |  Concurrency ceiling: ${concurrency}`,
		''
	);
	out.push(
		'> [!NOTE]',
		'> Latency is the mean after discarding the first (cold-load) run.',
		`> Blocks packed into chunks of up to ${budget} chars,`,
		`> dispatched ${concurrency} at a time.`,
		''
	);

	// ── Summary ──────────────────────────────────────────────────

	out.push('## Summary', '');
	out.push('(Latency averaged across all modes.)', '');

	const mw = Math.max('Model'.length, ...models.map(m => m.length));
	const dw = docs.map(d => {
		const vals = models.flatMap(m => {
			const avgs = modeAvgs(results, m, d);
			return avgs.length ? [fmtMs(mean(avgs))] : ['—'];
		});
		return Math.max(d.length, ...vals.map(v => v.length));
	});

	const mkRow = (first, cells) =>
		'| ' + first + ' | ' + cells.join(' | ') + ' |';

	out.push(mkRow(pad('Model', mw), docs.map((d, i) => pad(d, dw[i]))));
	out.push(mkRow('-'.repeat(mw), dw.map(w => '-'.repeat(w))));

	for (const model of models) {
		const cells = docs.map((d, i) => {
			const avgs = modeAvgs(results, model, d);
			return pad(avgs.length ? fmtMs(mean(avgs)) : '—', dw[i]);
		});
		out.push(mkRow(pad(model, mw), cells));
	}

	out.push('');

	// ── Per-mode detail ───────────────────────────────────────────

	out.push('## Per-mode detail', '');

	const CHUNK_HDR = 'chunks';
	const SUGG_HDR  = 'suggestions (long)';

	for (const mode of modes) {
		out.push(`### ${mode}`, '');

		const mdw = docs.map(d => {
			const vals = models.map(m => {
				const r = get(m, d, mode);
				return r ? fmtMs(r.avg) : '—';
			});
			return Math.max(d.length, ...vals.map(v => v.length));
		});
		const chw = Math.max(CHUNK_HDR.length, ...models.map(m => {
			const r = get(m, 'long', mode);
			return r ? String(r.chunk_count).length : 1;
		}));
		const sw = Math.max(SUGG_HDR.length, ...models.map(m => {
			const r = get(m, 'long', mode);
			return r ? String(r.avg_suggestions).length : 1;
		}));

		const mkRow2 = (first, cells, ch, sugg) =>
			'| ' + first + ' | ' + cells.join(' | ') +
			' | ' + ch + ' | ' + sugg + ' |';

		out.push(mkRow2(
			pad('Model', mw),
			docs.map((d, i) => pad(d, mdw[i])),
			pad(CHUNK_HDR, chw),
			pad(SUGG_HDR, sw)
		));
		out.push(mkRow2(
			'-'.repeat(mw),
			mdw.map(w => '-'.repeat(w)),
			'-'.repeat(chw),
			'-'.repeat(sw)
		));

		for (const model of models) {
			const cells = docs.map((d, i) => {
				const r = get(model, d, mode);
				return pad(r ? fmtMs(r.avg) : '—', mdw[i]);
			});
			const longR = get(model, 'long', mode);
			out.push(mkRow2(
				pad(model, mw),
				cells,
				pad(longR ? String(longR.chunk_count) : '—', chw),
				pad(longR ? String(longR.avg_suggestions) : '—', sw)
			));
		}

		out.push('');
	}

	// ── Comparison to baseline ────────────────────────────────────

	if (baseResults && baseResults.length > 0) {
		out.push('## Comparison to baseline', '');
		out.push(
			'Δ = chunked avg − baseline avg.',
			'Negative means chunked is faster.',
			baselineModel ? `Baseline model: ${baselineModel}.` : '',
			''
		);

		const delta = (model, doc) => {
			const cAvgs = modeAvgs(results,     model, doc);
			const bAvgs = modeAvgs(baseResults, baselineModel ?? model, doc);
			if (!cAvgs.length || !bAvgs.length) return null;
			return Math.round(mean(cAvgs)) - Math.round(mean(bAvgs));
		};

		const fmtDelta = d => {
			if (d === null) return '—';
			const sign = d < 0 ? '-' : '+';
			return sign + fmtMs(Math.abs(d));
		};

		const dHdrs = docs.map(d => d + ' Δ');
		const dhw   = docs.map((d, i) => {
			const vals = models.map(m => fmtDelta(delta(m, d)));
			return Math.max(dHdrs[i].length, ...vals.map(v => v.length));
		});

		out.push(mkRow(pad('Model', mw), dHdrs.map((h, i) => pad(h, dhw[i]))));
		out.push(mkRow('-'.repeat(mw), dhw.map(w => '-'.repeat(w))));

		for (const model of models) {
			const cells = docs.map((d, i) =>
				pad(fmtDelta(delta(model, d)), dhw[i])
			);
			out.push(mkRow(pad(model, mw), cells));
		}

		out.push('');
	}

	return out.join('\n');
}

// ── sweep markdown ─────────────────────────────────────────────────

function buildSweepMarkdown(
	results, models, docs, modes, budgets, ceilings, host, backendVer
) {
	const ts  = new Date().toISOString().slice(0, 16).replace('T', ' ');
	const out = [];

	const get = (model, doc, mode, budget, concurrency) =>
		results.find(r =>
			r.model === model && r.doc === doc && r.mode === mode &&
			r.budget === budget && r.concurrency === concurrency
		);

	out.push('# Prose-AI Parameter Sweep', '');
	out.push(`Generated ${ts}.`);
	out.push(`Host: ${host}`);
	out.push(`Backend: ${backendVer}`, '');
	out.push(
		'> [!NOTE]',
		'> Each cell is mean latency (non-cold runs) for one',
		'> (model, doc, mode, budget, concurrency) combination.',
		`> Budgets swept: ${budgets.join(', ')} chars.`,
		`> Concurrency ceilings swept: ${ceilings.join(', ')}.`,
		''
	);

	const cLabelW = Math.max(
		...ceilings.map(c => ('concurrency=' + c).length)
	);

	for (const model of models) {
		for (const doc of docs) {
			for (const mode of modes) {
				out.push(`## ${model}, ${doc} doc, ${mode} mode`, '');

				const colW = budgets.map(b => {
					const hdr  = `budget=${b}`;
					const vals = ceilings.map(c => {
						const r = get(model, doc, mode, b, c);
						return r && r.avg > 0 ? fmtMs(r.avg) : '—';
					});
					return Math.max(hdr.length, ...vals.map(v => v.length));
				});

				const mkRow = (first, cells) =>
					'| ' + first + ' | ' + cells.join(' | ') + ' |';

				out.push(mkRow(
					pad('', cLabelW),
					budgets.map((b, i) => pad(`budget=${b}`, colW[i]))
				));
				out.push(mkRow(
					'-'.repeat(cLabelW),
					colW.map(w => '-'.repeat(w))
				));

				for (const c of ceilings) {
					const cells = budgets.map((b, i) => {
						const r = get(model, doc, mode, b, c);
						return pad(r && r.avg > 0 ? fmtMs(r.avg) : '—', colW[i]);
					});
					out.push(mkRow(pad(`concurrency=${c}`, cLabelW), cells));
				}

				out.push('');
			}
		}
	}

	// ── Recommendation placeholder ────────────────────────────────

	out.push('## Recommendation', '');
	out.push('### Chunk budget', '');
	out.push('Proposed: TODO: xero.', '');
	out.push('Rationale: TODO: xero.', '');
	out.push('### Concurrency ceiling', '');
	out.push('Proposed: TODO: xero.', '');
	out.push('Rationale: TODO: xero.', '');
	out.push('### Model', '');
	out.push('Proposed: TODO: xero.', '');
	out.push('Rationale: TODO: xero.', '');

	return out.join('\n');
}

// ── run: baseline ──────────────────────────────────────────────────

async function runBaseline(opts, models, modes, runs, timeoutMs, host, backendVer) {
	const docs   = opts.docs ?? ['short', 'medium', 'long', 'pathological'];
	const outPfx = opts.out
		? path.resolve(opts.out)
		: path.join(DIR, 'results-baseline');

	await mkdir(path.dirname(outPfx), { recursive: true });

	const fixtures = {};
	for (const doc of docs) {
		const fp = path.join(DIR, 'fixtures', `${doc}.txt`);
		fixtures[doc] = await readFile(fp, 'utf8');
	}

	const combos = [];
	for (const model of models)
		for (const doc of docs)
			for (const mode of modes)
				combos.push({ model, doc, mode });

	const total = combos.length;
	const mPad  = Math.max(...models.map(m => m.length));
	const dPad  = Math.max(...docs.map(d => d.length));
	const moPad = Math.max(...modes.map(m => m.length));
	const nPad  = String(total).length;

	const results = [];

	for (let i = 0; i < combos.length; i++) {
		const { model, doc, mode } = combos[i];
		const n = String(i + 1).padStart(nPad, ' ');
		process.stdout.write(
			`[${n}/${total}] ${pad(model, mPad)}  ` +
			`${pad(doc, dPad)}  ${pad(mode, moPad)}  ... `
		);

		let r;
		try {
			r = await benchCombo(
				model, doc, fixtures[doc], mode, runs, timeoutMs
			);
		} catch (err) {
			process.stdout.write(`ERROR: ${err.message}\n`);
			continue;
		}

		const parseInfo = r.parse_success_rate < 1
			? ` parse=${r.parse_success_rate.toFixed(2)}`
			: '';
		process.stdout.write(
			`${fmtMs(r.avg)} (${r.avg_suggestions} suggestions${parseInfo})\n`
		);
		results.push(r);
	}

	const jsonPath = `${outPfx}.json`;
	await writeFile(jsonPath, JSON.stringify(results, null, 2));
	console.log(`\nWrote ${jsonPath}`);

	const md = buildMarkdown(results, models, docs, modes, host, backendVer);
	const mdPath = `${outPfx}.md`;
	await writeFile(mdPath, md);
	console.log(`Wrote ${mdPath}`);
}

// ── run: chunked ───────────────────────────────────────────────────

async function runChunked(opts, models, modes, runs, timeoutMs, host, backendVer) {
	const docs     = opts.docs ?? ['short', 'medium', 'long', 'pathological'];
	const budget   = CHUNK_CHAR_BUDGET;
	const concurr  = MAX_CONCURRENT;
	const outPfx   = opts.out
		? path.resolve(opts.out)
		: path.join(DIR, 'results-chunked');

	await mkdir(path.dirname(outPfx), { recursive: true });

	const fixtures = {};
	for (const doc of docs) {
		const fp = path.join(DIR, 'fixtures', `${doc}.txt`);
		fixtures[doc] = await readFile(fp, 'utf8');
	}

	const basePath      = opts.baseline ?? path.join(DIR, 'r-phaseD.json');
	const baselineModel = opts.baselineModel ?? 'ministral-3:8b';
	let baseResults = [];
	try {
		baseResults = JSON.parse(await readFile(basePath, 'utf8'));
	} catch {
		console.log(`Note: ${basePath} not found; no delta table.`);
	}

	const combos = [];
	for (const model of models)
		for (const doc of docs)
			for (const mode of modes)
				combos.push({ model, doc, mode });

	const total = combos.length;
	const mPad  = Math.max(...models.map(m => m.length));
	const dPad  = Math.max(...docs.map(d => d.length));
	const moPad = Math.max(...modes.map(m => m.length));
	const nPad  = String(total).length;

	const results = [];

	for (let i = 0; i < combos.length; i++) {
		const { model, doc, mode } = combos[i];
		const n = String(i + 1).padStart(nPad, ' ');
		process.stdout.write(
			`[${n}/${total}] ${pad(model, mPad)}  ` +
			`${pad(doc, dPad)}  ${pad(mode, moPad)}  ... `
		);

		let r;
		try {
			r = await benchComboChunked(
				model, doc, fixtures[doc], mode, runs, timeoutMs,
				budget, concurr
			);
		} catch (err) {
			process.stdout.write(`ERROR: ${err.message}\n`);
			continue;
		}

		process.stdout.write(
			`${fmtMs(r.avg)} ttf=${fmtMs(r.ttf_avg)}` +
			` (${r.avg_suggestions} suggestions, ${r.chunk_count} chunks)\n`
		);
		results.push(r);
	}

	const jsonPath = `${outPfx}.json`;
	await writeFile(jsonPath, JSON.stringify(results, null, 2));
	console.log(`\nWrote ${jsonPath}`);

	const md = buildChunkedMarkdown(
		results, baseResults, baselineModel, models, docs, modes,
		budget, concurr, host, backendVer
	);
	const mdPath = `${outPfx}.md`;
	await writeFile(mdPath, md);
	console.log(`Wrote ${mdPath}`);
}

// ── run: sweep ─────────────────────────────────────────────────────

async function runSweep(opts, models, modes, runs, timeoutMs, host, backendVer) {
	const budgets  = CHUNK_BUDGETS;
	const ceilings = CONCURRENCY_CEILINGS;

	// --quick: 1 doc + 1 mode; --docs/--modes override both
	const sweepDocs  = opts.docs  ?? (opts.quick ? ['medium']   : ['short', 'medium', 'long']);
	const sweepModes = opts.modes ?? (opts.quick ? ['rewrite']  : modes);
	const outPfx     = opts.out
		? path.resolve(opts.out)
		: path.join(DIR, 'results-sweep');

	await mkdir(path.dirname(outPfx), { recursive: true });

	const fixtures = {};
	for (const doc of sweepDocs) {
		const fp = path.join(DIR, 'fixtures', `${doc}.txt`);
		fixtures[doc] = await readFile(fp, 'utf8');
	}

	// full combo list: budget × concurrency × model × doc × mode
	const combos = [];
	for (const budget of budgets)
		for (const concurr of ceilings)
			for (const model of models)
				for (const doc of sweepDocs)
					for (const mode of sweepModes)
						combos.push({ budget, concurr, model, doc, mode });

	const total = combos.length;
	const mPad  = Math.max(...models.map(m => m.length));
	const dPad  = Math.max(...sweepDocs.map(d => d.length));
	const moPad = Math.max(...sweepModes.map(m => m.length));
	const nPad  = String(total).length;

	const results = [];

	for (let i = 0; i < combos.length; i++) {
		const { budget, concurr, model, doc, mode } = combos[i];
		const n = String(i + 1).padStart(nPad, ' ');
		process.stdout.write(
			`[${n}/${total}] b=${budget} c=${concurr}  ` +
			`${pad(model, mPad)}  ${pad(doc, dPad)}  ` +
			`${pad(mode, moPad)}  ... `
		);

		let r;
		try {
			r = await benchComboChunked(
				model, doc, fixtures[doc], mode, runs, timeoutMs,
				budget, concurr
			);
		} catch (err) {
			process.stdout.write(`ERROR: ${err.message}\n`);
			continue;
		}

		process.stdout.write(
			`${fmtMs(r.avg)} ttf=${fmtMs(r.ttf_avg)}` +
			` (${r.avg_suggestions} suggestions, ${r.chunk_count} chunks)\n`
		);
		results.push(r);
	}

	const jsonPath = `${outPfx}.json`;
	await writeFile(jsonPath, JSON.stringify(results, null, 2));
	console.log(`\nWrote ${jsonPath}`);

	const md = buildSweepMarkdown(
		results, models, sweepDocs, sweepModes, budgets, ceilings,
		host, backendVer
	);
	const mdPath = `${outPfx}.md`;
	await writeFile(mdPath, md);
	console.log(`Wrote ${mdPath}`);
}

// ── main ───────────────────────────────────────────────────────────

async function main() {
	const opts = parseArgs();

	if (opts.help) {
		usage(RUNS_PER_COMBO);
		process.exit(0);
	}

	const models    = opts.models  ?? MODELS;
	const modes     = opts.modes   ?? MODES;
	const runs      = opts.runs    ?? RUNS_PER_COMBO;
	const timeoutMs = opts.timeout ?? DEFAULT_TIMEOUT_MS;

	let host = 'unknown', backendVer = 'unknown';
	try {
		host      = execSync('uname -a',            { encoding: 'utf8' }).trim();
	} catch { /* report 'unknown' in the markdown header */ }
	try {
		backendVer = execSync('rapid-mlx --version', { encoding: 'utf8' }).trim();
	} catch { /* report 'unknown' in the markdown header */ }

	if (opts.sweep) {
		await runSweep(opts, models, modes, runs, timeoutMs, host, backendVer);
	} else if (opts.chunked) {
		await runChunked(opts, models, modes, runs, timeoutMs, host, backendVer);
	} else {
		await runBaseline(opts, models, modes, runs, timeoutMs, host, backendVer);
	}
}

main().catch(err => {
	console.error(err.message ?? err);
	process.exit(1);
});
