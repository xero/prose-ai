#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════════╗
# ║   prose-ai — rapid-mlx chunked benchmark runner           ║
# ╚═══════════════════════════════════════════════════════════╝
#
# Ensures rapid-mlx is serving, warms it, and runs the chunked
# benchmark matrix against the model in .model.
#
# Usage:
#   ./bench.sh                    # chunked run, delta vs r-phaseD
#   ./bench.sh --sweep --quick    # budget × concurrency sweep
#
# Results land in benchmarks/r-rapidmlx*.{json,md}.

set -e

cd "$(dirname "$0")"

MODEL=$(cat .model)
BASE="http://localhost:8000/v1"
DOCS="short,medium,long"
MODES="proofread,rewrite,formalize,concise"
RUNS="3"
TIMEOUT_MS="300000"
OUT_PFX="benchmarks/r-rapidmlx"

# ── ensure rapid-mlx is serving ────────────────────────────
if ! curl -fs --max-time 2 "$BASE/models" > /dev/null 2>&1; then
  echo "==> starting rapid-mlx ($MODEL)..."
  echo "    (first-ever run downloads the model — this can take a while)"
  rapid-mlx serve "$MODEL" --port 8000 \
    --gpu-memory-utilization 0.75 \
    --kv-cache-quantization \
    --prefill-step-size 8192 \
    &> /tmp/rapid-mlx.log &
  until curl -fs --max-time 2 "$BASE/models" > /dev/null 2>&1; do sleep 1; done
fi
echo "==> rapid-mlx ready"

# ── warm: load weights + prime the prefix cache ────────────
echo "==> warming $MODEL..."
curl -s "$BASE/chat/completions" -H 'Content-Type: application/json' \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":8}" \
  > /dev/null

# ── run the benchmark ──────────────────────────────────────
MODE_FLAGS="--chunked"
if [[ "$1" == "--sweep" ]]; then
  MODE_FLAGS="$*"
  OUT_PFX="${OUT_PFX}-sweep"
fi

echo ""
echo "==> benchmark config:"
echo "    model:   $MODEL"
echo "    docs:    $DOCS"
echo "    modes:   $MODES"
echo "    runs:    $RUNS per combo (first discarded as cold)"
echo "    timeout: ${TIMEOUT_MS}ms"
echo "    out:     $OUT_PFX"
echo ""

bun run benchmarks/run.js \
	--models  "$MODEL" \
	--docs    "$DOCS" \
	--modes   "$MODES" \
	--runs    "$RUNS" \
	--timeout "$TIMEOUT_MS" \
	--out     "$OUT_PFX" \
	$MODE_FLAGS

echo ""
echo "==> done. results at ${OUT_PFX}.{json,md}"
