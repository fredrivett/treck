#!/bin/bash
# Full dev stack: CLI watch + API server + Vite HMR viewer + website.
# Uses CONDUCTOR_PORT if set, otherwise defaults to 3456.
# PORT     = Vite dev server (open in browser)
# PORT + 1 = API server (proxied by Vite)
# PORT + 2 = Astro website dev server

set -e

PORT="${CONDUCTOR_PORT:-3456}"
API_PORT=$((PORT + 1))

# Initial build so serve has something to work with
npm run build

# Run all three processes in parallel
trap 'kill 0' EXIT

npm run dev:cli &
npm run treck -- serve --port "$API_PORT" --no-open &
TRECK_API_PORT=$API_PORT npx vite dev --config src/server/viewer/vite.config.ts --port "$PORT" &
(cd website && npx astro dev --port $((PORT + 2))) &

# Wait briefly for Vite to start, then open browser
sleep 1
open "http://localhost:$PORT" 2>/dev/null || true

wait
