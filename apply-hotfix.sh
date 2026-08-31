#!/usr/bin/env bash
set -euo pipefail
PATCH_FILE="$(cd "$(dirname "$0")" && pwd)/legacy-warning-tail-hotfix.patch"

if [ ! -f "src/modules/reminders/reminders.service.ts" ]; then
  echo "Run from the aakash-website-backend repository root." >&2
  exit 1
fi

echo "Checking patch..."
git apply --check "$PATCH_FILE"
echo "Applying patch..."
git apply "$PATCH_FILE"
echo "Applied. Run: npm run build && npm run lint"
