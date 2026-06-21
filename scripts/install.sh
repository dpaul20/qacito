#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Node >= 20
if ! command -v node &>/dev/null; then
  echo "Error: Node.js not found. Install Node.js 20+ from https://nodejs.org"
  exit 1
fi
NODE_MAJOR=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js 20+ required. Current: $(node -v)"
  exit 1
fi

# Install deps (includes @clack/prompts)
cd "$ROOT"
npm install --silent

# Launch TUI wizard
node scripts/install.mjs
