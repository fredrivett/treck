#!/bin/bash
# Conductor workspace setup: copy .env from main worktree and install deps.

set -e

# Copy .env from the primary worktree (if it exists) so this workspace
# picks up the same environment variables.
cp "$(git worktree list --porcelain | head -1 | cut -d' ' -f2)/.env" .env 2>/dev/null || true

pnpm install
cd website && pnpm install
