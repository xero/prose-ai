# prose-ai

A local, offline prose editor powered by a language model running on your own machine. Paste or write text, pick an editorial mode, and get inline tracked changes you can accept or reject one by one. No cloud, no subscription, no data leaving your machine.

Modes: **Proofread** · **Rewrite** · **Formalize** · **Concise**

Highlight any word or phrase to get contextual **synonyms** via a bubble menu.

>[!NOTE]
> Editorial defaults (Oxford commas, em-dash handling, sentence capitalization, etc.)
> are defined in [`src/llm/prompt.js`](./src/llm/prompt.js) in the `SHARED_RULES` section. Adjust them to
> match your own style guide.

---

## What runs it

- **[Ollama](https://ollama.com)** — runs the language model locally
- **[gemma3:4b](https://ollama.com/library/gemma3)** — Google's 4B model, fast on Apple Silicon and modern CPUs
- **[Bun](https://bun.sh)** — JS runtime and package manager
- **[Vite](https://vite.dev)** — dev server and bundler
- **[Tiptap](https://tiptap.dev)** — rich text editor (MIT, open source)

---

## Install Ollama

### macOS (Homebrew)
```bash
brew install ollama
```

### macOS (direct)
Download from [ollama.com/download](https://ollama.com/download) and run the installer.

### Linux
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Windows
Download the installer from [ollama.com/download](https://ollama.com/download).

---

## Start Ollama and pull the model

```bash
# start the ollama server
ollama serve &> /tmp/ollama.log &

# pull the model (~3.3 GB)
ollama pull gemma3:4b

# warm it into memory (optional — skips cold-load delay on first use)
ollama run gemma3:4b "" &> /dev/null &
```

>[!TIP]
> If you use the **Ollama macOS menu bar app**, it handles `ollama serve` automatically, so you can skip that step.

---

## Install and run prose-ai

```bash
# install dependencies
bun i

# build
bun run build

# start the dev server
bun run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Credits & License

by [xero](https://x-e.ro) & [claude code](https://claude.ai)

[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) — public domain, no rights reserved.
