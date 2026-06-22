#!/usr/bin/env sh
set -e

HOOKS_DIR=".git/hooks"

install_hook() {
  src="scripts/hooks/$1"
  dst="$HOOKS_DIR/$1"
  cp "$src" "$dst"
  chmod +x "$dst"
  echo "  installed $1"
}

mkdir -p scripts/hooks

cat > scripts/hooks/pre-push <<'EOF'
#!/usr/bin/env sh
set -e

echo "[pre-push] Running build:all..."
npm run build:all

echo "[pre-push] Build passed."
EOF

install_hook pre-push
echo "Git hooks installed."
