//  ▓██▀█ ▓██▀█ ▓██▀█   ▓██▀█ ▓██▀█    ▓██▀█ ▀▀
//  ▒██▄█ ▒██▄▀ ▒██ █   ▒██   ▒██▄  █▒ ▒██▄█ ██░
//  ███   ███ █ ███▄█ █▄███   ███▄▄    ███ █ ██▒
//  stream parsing

// createItemExtractor(onItem) → (textDelta) => void
//
// Feed it fragments of a JSON array as they stream in; it calls onItem
// with each complete top-level object the moment its closing brace
// arrives. Tolerates leading <think> noise, markdown fences, and a
// truncated final item (which is simply never emitted).
export const createItemExtractor = (onItem) => {
	let depth    = 0;      // brace depth inside the current object
	let inItem   = false;  // currently capturing an object
	let inString = false;
	let escaped  = false;
	let started  = false;  // saw the opening [ of the array
	let buf      = '';

	return (delta) => {
		for (const ch of delta) {
			if (inItem) buf += ch;

			if (inString) {
				if (escaped)          escaped = false;
				else if (ch === '\\') escaped = true;
				else if (ch === '"')  inString = false;
				continue;
			}

			switch (ch) {
			case '"':
				if (inItem) inString = true;
				break;
			case '[':
				if (!started && !inItem) started = true;
				break;
			case '{':
				if (started && !inItem) {
					inItem = true; buf = '{';
				} else if (inItem) depth++;
				break;
			case '}':
				if (!inItem) break;
				if (depth > 0) {
					depth--; break;
				}
				inItem = false;
				try {
					onItem(JSON.parse(buf));
				} catch {
					console.warn('[prose-ai] dropping unparseable stream item:', buf);
				}
				buf = '';
				break;
			}
		}
	};
};

// parseSSE(response, onDelta) → Promise<void>
// Reads an OpenAI-style SSE stream and calls onDelta with each piece of
// assistant text content. Ignores reasoning_content deltas. Resolves
// when the stream ends ([DONE] or EOF); rejects on read/abort errors.
export const parseSSE = async (response, onDelta) => {
	const reader  = response.body.getReader();
	const decoder = new TextDecoder();
	let   pending = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			pending += decoder.decode(value, { stream: true });

			let nl;
			while ((nl = pending.indexOf('\n')) !== -1) {
				const line = pending.slice(0, nl).trim();
				pending = pending.slice(nl + 1);

				if (!line.startsWith('data:')) continue;
				const payload = line.slice(5).trim();
				if (payload === '[DONE]') return;

				let parsed;
				try {
					parsed = JSON.parse(payload);
				} catch {
					continue;
				}

				const delta = parsed.choices?.[0]?.delta?.content;
				if (typeof delta === 'string' && delta) onDelta(delta);
			}
		}
	} finally {
		reader.releaseLock();
	}
};
