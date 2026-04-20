// ╔═══════════════════════════════╗
// ║   prose-ai — request pool     ║
// ╚═══════════════════════════════╝

// Concurrency-limited promise pool.
//
// const pool = new RequestPool({ limit: 3 });
// const results = await pool.run([
//   (signal) => fetchChunk(chunk1, signal),
//   (signal) => fetchChunk(chunk2, signal),
// ]);
// // results: [{ status: 'fulfilled', value } | { status: 'rejected', reason }]
//
// pool.runProgressive(jobs) — async generator; yields
//   { index, status: 'fulfilled'|'rejected', value?, reason? }
//   as each job settles. Yields { index: -1, status: 'aborted' } if
//   abort() is called mid-iteration, then stops.
//
// pool.abort() — cancels in-flight jobs and clears the queue;
//   run() resolves immediately with partial results + AbortErrors.
// Calling run()/runProgressive() while a run is in flight throws.
export class RequestPool {
	#limit;
	#active      = false;
	#aborted     = false;
	#running     = 0;
	#pending     = [];
	#ctrls       = new Set();
	#results     = [];
	#total       = 0;
	#settled     = 0;
	#resolve     = null;
	#progressive = false;
	#progQueue   = [];
	#progNotify  = null;

	constructor({ limit }) {
		this.#limit = limit;
	}

	run(jobs) {
		if (this.#active) {
			throw new Error(
				'RequestPool: run() called while a previous run is in flight'
			);
		}
		if (jobs.length === 0) return Promise.resolve([]);

		this.#active      = true;
		this.#aborted     = false;
		this.#progressive = false;
		this.#total       = jobs.length;
		this.#settled     = 0;
		this.#results     = Array.from({ length: jobs.length }, () => null);
		this.#pending     = jobs.map((job, i) => ({ job, i }));
		this.#running     = 0;
		this.#ctrls       = new Set();

		return new Promise((resolve) => {
			this.#resolve = resolve;
			this.#drain();
		});
	}

	async *runProgressive(jobs) {
		if (this.#active) {
			throw new Error(
				'RequestPool: run() called while a previous run is in flight'
			);
		}
		if (jobs.length === 0) return;

		this.#active      = true;
		this.#aborted     = false;
		this.#progressive = true;
		this.#total       = jobs.length;
		this.#settled     = 0;
		this.#progQueue   = [];
		this.#progNotify  = null;
		this.#pending     = jobs.map((job, i) => ({ job, i }));
		this.#running     = 0;
		this.#ctrls       = new Set();

		this.#drain();

		try {
			let yielded = 0;
			while (yielded < this.#total) {
				if (this.#aborted) {
					yield { index: -1, status: 'aborted' };
					break;
				}
				if (this.#progQueue.length > 0) {
					yield this.#progQueue.shift();
					yielded++;
					continue;
				}
				await new Promise(r => { this.#progNotify = r; });
			}
		} finally {
			this.#progressive = false;
		}
	}

	#drain() {
		while (this.#running < this.#limit && this.#pending.length > 0) {
			const { job, i } = this.#pending.shift();
			const ac = new AbortController();
			this.#ctrls.add(ac);
			this.#running++;

			job(ac.signal).then(
				(value)  => this.#settle(i, ac, { status: 'fulfilled', value }),
				(reason) => this.#settle(i, ac, { status: 'rejected',  reason }),
			);
		}
	}

	#settle(i, ac, result) {
		if (this.#aborted) return;
		this.#ctrls.delete(ac);
		this.#running--;
		this.#settled++;

		if (this.#progressive) {
			this.#progQueue.push({ index: i, ...result });
			if (this.#progNotify) { this.#progNotify(); this.#progNotify = null; }
			if (this.#settled < this.#total) {
				this.#drain();
			} else {
				this.#active = false;
			}
		} else {
			this.#results[i] = result;
			if (this.#settled === this.#total) {
				this.#finish();
			} else {
				this.#drain();
			}
		}
	}

	#finish() {
		this.#active  = false;
		const resolve = this.#resolve;
		this.#resolve = null;
		resolve([...this.#results]);
	}

	abort() {
		if (!this.#active) return;
		this.#aborted = true;

		for (const ac of this.#ctrls) ac.abort();
		this.#ctrls.clear();
		this.#running = 0;
		this.#active  = false;

		if (this.#progressive) {
			this.#pending = [];
			if (this.#progNotify) { this.#progNotify(); this.#progNotify = null; }
			return;
		}

		const err = new DOMException('Aborted', 'AbortError');
		for (const { i } of this.#pending) {
			this.#results[i] = { status: 'rejected', reason: err };
		}
		this.#pending = [];

		// fill slots for in-flight jobs (their #settle is now ignored)
		for (let i = 0; i < this.#total; i++) {
			if (this.#results[i] === null) {
				this.#results[i] = { status: 'rejected', reason: err };
			}
		}

		this.#finish();
	}
}
