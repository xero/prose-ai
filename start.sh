#!/usr/bin/env bash
# prose-ai start script — starts Rapid-MLX (or any OpenAI-compatible backend)
# and launches the dev server. To use a different backend, update BACKEND_URL
# in src/llm/config.js — no other changes needed.
#
# The backend runs under a supervisor loop: if Python dies (Metal OOM under
# memory pressure aborts the whole process), it relaunches automatically and
# the next analyze picks it up.
set -e

MODEL=$(cat "$(dirname "$0")/.model")
BASE="http://localhost:8000/v1"
LOG="/tmp/rapid-mlx.log"
cat << x0
[37;40m  [37;40m  [37;40m  [37;40m  [37;40m  [0m [37;40m  [37;40m  [37;40m  [37;40m  [37;40m [0m  [37;40m  [37;40m  [37;40m  [37;40m  [37;40m [0m  [37;40m  [37;40m  [37;40m  [37;40m  [37;40m  [0m [37;40m  [37;40m  [37;40m  [37;40m  [37;40m  [0m [37;40m  [37;40m  [37;40m  [37;40m  [37;40m  [0m [96;46m  [96;46m  [37;40m [0m
[96;46m ▄[96;46m▄ [36;40m▀[96;46m ▄[96;46m▄ [37;40m [0m [96;46m ▄[96;46m▄ [36;40m▀[96;46m ▄[96;46m▄ [36;40m [0m [96;46m ▄[96;46m▄ [36;40m▀[96;46m ▄[96;46m▄ [36;40m▀[0m [96;46m ▄[96;46m▄ [36;40m▀▀[36;40m▀▀[36;40m▀▀[0m [96;46m ▄[96;46m▄ [36;40m▀[96;46m ▄[96;46m▄ [37;40m [0m [96;46m ▄[96;46m▄ [36;40m▀[96;46m ▄[96;46m▄ [36;40m▀[0m [36;40m▄▄[36;40m▄▄[37;40m [0m
[96;46m [96;40m██[96;46m [37;40m [96;46m [96;40m██[96;46m [37;40m [0m [96;46m [96;40m██[96;46m [37;40m [96;46m ▀[96;46m▀ [37;40m [0m [96;46m [96;40m██[96;46m [37;40m [96;46m [96;40m██[96;46m [37;40m [0m [36;40m▀▀[36;40m▀▀[36;40m▀[96;46m ▄[96;46m▄ [37;40m [0m [96;46m [96;40m██[96;46m [36;40m▀▀[36;40m▀▀[36;40m▀[37;40m [0m [96;46m [96;40m██[96;46m [36;40m▄[96;46m [96;40m██[96;46m [37;40m [0m [96;46m [96;40m██[96;46m [37;40m [0m
[36;40m█[96;40m██[36;40m█▀[36;40m▀▀[36;40m▀▀[36;40m[0m  [36;40m▀▀[36;40m▀▀[37;40m  [37;40m  [37;40m  [0m [36;40m▀▀[36;40m▀▀[36;40m▀▀[36;40m▀▀[36;40m▀[37;40m [0m [36;40m▀▀[36;40m▀▀[36;40m▀▀[36;40m▀▀[36;40m▀[37;40m [0m [36;40m▀▀[36;40m▀▀[36;40m▀▀[36;40m▀▀[36;40m▀▀[0m [36;40m▀▀[36;40m▀▀[37;40m [36;40m▀▀[36;40m▀▀[37;40m [0m [36;40m▀▀[36;40m▀▀[36;40m▀[0m
[36;40m▀▀[36;40m▀▀[37;40m  [37;40m  [37;40m  [0m           [0m           [0m           [0m           [0m           [0m      [0m

x0
if ! curl -fs --max-time 2 "$BASE/models" > /dev/null 2>&1; then
  echo "starting rapid-mlx (supervised)..."
  (
    while true; do
      rapid-mlx serve "$MODEL" --port 8000 \
        --gpu-memory-utilization 0.75 \
        --kv-cache-quantization \
        >> "$LOG" 2>&1
      code=$?
      echo "$(date '+%F %T') rapid-mlx exited (code $code) — restarting in 3s" | tee -a "$LOG"
      sleep 3
    done
  ) &
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
