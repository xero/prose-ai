#!/usr/bin/env bash
# prose-ai start script — starts Ollama (or any OpenAI-compatible backend)
# and launches the dev server. To use a different backend, update BACKEND_URL
# in src/llm/config.js — no other changes needed.
set -e

MODEL=$(cat "$(dirname "$0")/.model")

if ! pgrep -x ollama > /dev/null; then
  echo "starting ollama..."
  OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 OLLAMA_NUM_PARALLEL=3 \
    ollama serve &> /tmp/ollama.log &
  sleep 2  # give it a moment to bind
fi

# warm the model
echo "loading model..."
ollama run "$MODEL" "" &> /dev/null &

# load the ui
echo "starting prose-ai..."
cd ~/.local/src/prose-ai
bun run dev
