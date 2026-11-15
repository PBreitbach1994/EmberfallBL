#!/usr/bin/env bash
# Pull the latest code and rebuild/restart Emberfall with zero data loss.
set -euo pipefail
cd "$(dirname "$0")/.."
# one-time setup for in-game updates (Admin → Server): a shared secret and this checkout's path
touch .env
if ! grep -qE '^UPDATER_SECRET=.{16,}' .env; then
  sed -i '/^UPDATER_SECRET=/d' .env
  echo "UPDATER_SECRET=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)" >> .env
  echo "→ Generated UPDATER_SECRET for in-game updates"
fi
if ! grep -qE "^HOST_REPO_DIR=$(pwd)\$" .env; then
  sed -i '/^HOST_REPO_DIR=/d' .env
  echo "HOST_REPO_DIR=$(pwd)" >> .env
fi
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
APP_VERSION="$(git rev-parse --short HEAD)" docker compose "${PROFILE_ARGS[@]}" up -d --build
docker image prune -f >/dev/null
echo "✓ Emberfall updated"; docker compose ps
