import { describe, test, expect } from 'bun:test';
import { RequestPool }            from '../src/llm/pool.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

describe('sequential runProgressive waves', () => {
	test('a pool can run two progressive batches back to back', async () => {
		const pool = new RequestPool({ limit: 2 });
		const job  = (v) => async () => v;

		const first = [];
		for await (const r of pool.runProgressive([job('a')])) first.push(r);
		expect(first).toEqual([{ index: 0, status: 'fulfilled', value: 'a' }]);

		const second = [];
		for await (const r of pool.runProgressive([job('b'), job('c')])) second.push(r);
		expect(second.length).toBe(2);
		expect(second.every(r => r.status === 'fulfilled')).toBe(true);
	});
});

describe('RequestPool', () => {
	test('runs 5 jobs with limit 2, at most 2 concurrent', async () => {
		const pool   = new RequestPool({ limit: 2 });
		let   active = 0, maxActive = 0;

		const jobs = Array.from({ length: 5 }, () => async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			await delay(20);
			active--;
		});

		await pool.run(jobs);
		expect(maxActive).toBe(2);
	});

	test('all jobs complete when limit exceeds job count', async () => {
		const pool    = new RequestPool({ limit: 10 });
		let   started = 0;

		const jobs = Array.from({ length: 3 }, () => async () => {
			started++;
			return 'ok';
		});

		const results = await pool.run(jobs);
		expect(started).toBe(3);
		expect(results.length).toBe(3);
		expect(results.every(r => r.status === 'fulfilled')).toBe(true);
	});

	test('abort cancels in-flight jobs (AbortSignal.aborted becomes true)',
		async () => {
			const pool    = new RequestPool({ limit: 3 });
			const signals = [];

			const jobs = Array.from({ length: 3 }, () => (sig) => {
				signals.push(sig);
				return new Promise(() => {});  // never resolves
			});

			const run = pool.run(jobs);
			await delay(10);   // let all 3 jobs start

			pool.abort();
			await run;

			expect(signals.length).toBe(3);
			expect(signals.every(s => s.aborted)).toBe(true);
		}
	);

	test('abort clears the pending queue (pending jobs never fire)', async () => {
		const pool    = new RequestPool({ limit: 1 });
		let   started = 0;

		const jobs = [
			()  => { started++; return new Promise(() => {}); },   // in-flight
			()  => { started++; return Promise.resolve('ok'); },   // pending
			()  => { started++; return Promise.resolve('ok'); },   // pending
		];

		const run = pool.run(jobs);
		await delay(10);   // let job 0 start

		pool.abort();
		await run;

		expect(started).toBe(1);
	});

	test('a failing job does not cancel sibling jobs', async () => {
		const pool = new RequestPool({ limit: 3 });

		const jobs = [
			async () => 'ok1',
			async () => { throw new Error('boom'); },
			async () => 'ok3',
		];

		const results = await pool.run(jobs);

		expect(results[0]).toEqual({ status: 'fulfilled', value: 'ok1' });
		expect(results[1].status).toBe('rejected');
		expect(results[1].reason.message).toBe('boom');
		expect(results[2]).toEqual({ status: 'fulfilled', value: 'ok3' });
	});

	test('calling run() while a run is in flight throws', async () => {
		const pool = new RequestPool({ limit: 1 });
		const run  = pool.run([() => delay(100).then(() => 'done')]);

		await delay(10);
		expect(() => pool.run([])).toThrow();

		pool.abort();
		await run;
	});
});

describe('RequestPool — runProgressive', () => {
	test('yields one result per job', async () => {
		const pool    = new RequestPool({ limit: 3 });
		const results = [];

		const jobs = [
			async () => 'a',
			async () => 'b',
			async () => 'c',
		];

		for await (const r of pool.runProgressive(jobs)) {
			results.push(r);
		}

		expect(results.length).toBe(3);
		expect(results.every(r => r.status === 'fulfilled')).toBe(true);
		expect(results.map(r => r.value).sort()).toEqual(['a', 'b', 'c']);
	});

	test('yields in settlement order, not creation order', async () => {
		const pool = new RequestPool({ limit: 2 });

		const jobs = [
			async () => { await delay(50); return 'slow'; },
			async () => { await delay(10); return 'fast'; },
		];

		const results = [];
		for await (const r of pool.runProgressive(jobs)) {
			results.push(r);
		}

		// job 1 (fast, 10 ms) settles before job 0 (slow, 50 ms)
		expect(results[0].index).toBe(1);
		expect(results[0].value).toBe('fast');
		expect(results[1].index).toBe(0);
		expect(results[1].value).toBe('slow');
	});

	test('abort during iteration yields the aborted marker', async () => {
		const pool    = new RequestPool({ limit: 2 });
		const results = [];

		const iterPromise = (async () => {
			for await (const r of pool.runProgressive([
				() => new Promise(() => {}),
				() => new Promise(() => {}),
			])) {
				results.push(r);
			}
		})();

		await delay(10);
		pool.abort();
		await iterPromise;

		expect(results.length).toBe(1);
		expect(results[0].status).toBe('aborted');
	});

	test('rejected job yields rejected result without stopping iteration', async () => {
		const pool    = new RequestPool({ limit: 3 });
		const results = [];

		const jobs = [
			async () => 'ok1',
			async () => { throw new Error('boom'); },
			async () => 'ok3',
		];

		for await (const r of pool.runProgressive(jobs)) {
			results.push(r);
		}

		expect(results.length).toBe(3);
		const rejected = results.find(r => r.status === 'rejected');
		expect(rejected.reason.message).toBe('boom');
		expect(results.filter(r => r.status === 'fulfilled').length).toBe(2);
	});
});
