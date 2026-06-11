#!/usr/bin/env bash
set -e

MODEL=$(cat "$(dirname "$0")/../.model")
BASE="http://localhost:8000/v1"

if ! curl -fs --max-time 2 "$BASE/models" > /dev/null 2>&1; then
  echo "starting rapid-mlx ($MODEL)..."
  rapid-mlx serve "$MODEL" --port 8000 --gpu-memory-utilization 0.75 \
    &> /tmp/rapid-mlx.log &
  until curl -fs --max-time 2 "$BASE/models" > /dev/null 2>&1; do sleep 1; done
fi

# warm: load weights + prime the prefix cache
echo "pre-warming model..."
curl -s "$BASE/chat/completions" -H 'Content-Type: application/json' \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":8}" \
  > /dev/null

echo "ready. run:"
echo "  ./bench.sh"
