#!/usr/bin/env bash
set -e

if ! pgrep -x ollama > /dev/null; then
  echo "starting ollama..."
  ollama serve &> /tmp/ollama.log &
  sleep 2  # give it a moment to bind
fi

# warm the model
echo "loading model..."
ollama run gemma3:4b "" &> /dev/null &

# load the ui
echo "starting prose-ai..."
cd ~/.local/src/prose-ai
bun run dev
