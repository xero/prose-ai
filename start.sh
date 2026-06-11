#!/usr/bin/env bash
# prose-ai start script — starts Rapid-MLX (or any OpenAI-compatible backend)
# and launches the dev server. To use a different backend, update BACKEND_URL
# in src/llm/config.js — no other changes needed.
set -e

MODEL=$(cat "$(dirname "$0")/.model")
BASE="http://localhost:8000/v1"

if ! curl -fs --max-time 2 "$BASE/models" > /dev/null 2>&1; then
  echo "starting rapid-mlx..."
  rapid-mlx serve "$MODEL" --port 8000 --gpu-memory-utilization 0.75 \
    &> /tmp/rapid-mlx.log &
  echo "waiting for server (first run downloads the model)..."
  until curl -fs --max-time 2 "$BASE/models" > /dev/null 2>&1; do sleep 1; done
fi

# warm: one tiny completion loads weights and primes the prefix cache
echo "loading model..."
curl -s "$BASE/chat/completions" -H 'Content-Type: application/json' \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":8}" \
  > /dev/null &

# load the ui
echo "starting prose-ai..."
cd ~/.local/src/prose-ai
bun run dev
