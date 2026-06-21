#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, cpSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT    = resolve(__dirname, '..');
const STAGING = join(ROOT, 'mcpb-staging');
const SERVER  = join(STAGING, 'server');

process.stderr.write('[build-mcpb] Starting MCPB build...\n');

// 1. Clean staging
if (existsSync(STAGING)) rmSync(STAGING, { recursive: true, force: true });
mkdirSync(SERVER, { recursive: true });

// 2. Copy compiled output
if (!existsSync(join(ROOT, 'dist'))) {
  console.error('[build-mcpb] ERROR: dist/ not found. Run "npm run build" before "npm run build:mcpb".');
  process.exit(1);
}
process.stderr.write('[build-mcpb] Copying dist/ → mcpb-staging/server/\n');
cpSync(join(ROOT, 'dist'), SERVER, { recursive: true });

// 3. Install prod deps
const pkgRaw = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
writeFileSync(join(SERVER, 'package.json'), JSON.stringify(pkgRaw, null, 2));

process.stderr.write('[build-mcpb] Installing production dependencies (omit=dev)...\n');
execSync('npm ci --omit=dev --ignore-scripts', { cwd: SERVER, stdio: 'inherit' });
rmSync(join(SERVER, 'package.json')); // not needed at runtime

// 4. Write manifest with version synced from package.json + optional icon
const manifestRaw = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
manifestRaw.version = pkgRaw.version;
writeFileSync(join(STAGING, 'manifest.json'), JSON.stringify(manifestRaw, null, 2));
const iconSrc = join(ROOT, 'icon.png');
if (existsSync(iconSrc)) copyFileSync(iconSrc, join(STAGING, 'icon.png'));

// 5. Pack
process.stderr.write('[build-mcpb] Packing with @anthropic-ai/mcpb...\n');
execSync('npx @anthropic-ai/mcpb pack', { cwd: STAGING, stdio: 'inherit' });

// Move .mcpb to project root
const packed = join(STAGING, 'qacito.mcpb');
if (existsSync(packed)) {
  cpSync(packed, join(ROOT, 'qacito.mcpb'));
  process.stderr.write('[build-mcpb] ✓ qacito.mcpb ready at project root\n');
} else {
  process.stderr.write('[build-mcpb] ✓ Pack complete (check mcpb-staging/ for output)\n');
}
