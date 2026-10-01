#!/usr/bin/env bash
# Copies keys from .env.local into the linked Vercel project (production) without echoing them.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo "No .env.local found. Copy .env.example to .env.local and fill it in."; exit 1; }

while IFS= read -r line || [ -n "$line" ]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  name="${line%%=*}"
  value="${line#*=}"
  [ -z "$value" ] && continue
  [[ "$name" == VERCEL_* ]] && continue
  for target in production; do
    npx vercel env rm "$name" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | npx vercel env add "$name" "$target" >/dev/null
  done
  echo "set $name"
done < .env.local
