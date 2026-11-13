#!/usr/bin/env bash
# Pull the latest code and rebuild/restart Emberfall with zero data loss.
set -euo pipefail
cd "$(dirname "$0")/.."
PROFILE_ARGS=()
if grep -qE '^CLOUDFLARE_TUNNEL_TOKEN=.+' .env 2>/dev/null; then PROFILE_ARGS=(--profile tunnel); fi
echo "→ Backing up database"
mkdir -p data/backups
[ -f data/emberfall.db ] && docker compose exec -T emberfall node -e "
const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/emberfall.db');
d.exec(\"VACUUM INTO '/data/backups/pre-update-\"+Date.now()+\".db'\")" 2>/dev/null || echo "  (skipped: container not running)"
echo "→ Pulling latest code"
git pull --ff-only
echo "→ Rebuilding and restarting"
docker compose "${PROFILE_ARGS[@]}" up -d --build
docker image prune -f >/dev/null
echo "✓ Emberfall updated"; docker compose ps
