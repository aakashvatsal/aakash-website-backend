#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f package.json || ! -d src ]]; then
  echo "Run this script from the aakash-website-backend repository root."
  exit 1
fi

wrong_files=(
  "src/hsakaa/media-core.controller.ts"
  "src/hsakaa/media-world-context.service.ts"
  "src/hsakaa/media-growth.service.ts"
  "src/hsakaa/media-social-presence.service.ts"
  "src/hsakaa/media-content-director.service.ts"
  "src/hsakaa/media-public-identity.ts"
  "src/hsakaa/media-presence.service.ts"
  "src/hsakaa/media-core.service.ts"
  "src/hsakaa/media-planning.service.ts"
  "src/hsakaa/media-learning.service.ts"
  "src/hsakaa/media-storytelling-policy.ts"
  "src/hsakaa/dto/media-social-presence.dto.ts"
  "src/hsakaa/dto/media-core.dto.ts"
  "src/hsakaa/schemas/media-metric-snapshot.schema.ts"
  "src/hsakaa/schemas/media-performance-insight.schema.ts"
  "src/hsakaa/schemas/media-social-profile.schema.ts"
)

removed=0
for file in "${wrong_files[@]}"; do
  if [[ -f "$file" ]]; then
    rm -f "$file"
    echo "removed misplaced file: $file"
    removed=$((removed + 1))
  fi
done

echo "Removed $removed misplaced Media file(s)."
echo "Running production build..."
npm run build
