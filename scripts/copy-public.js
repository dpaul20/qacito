import { cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'src', 'dashboard-server', 'public');
const dest = join(root, 'dist', 'dashboard-server', 'public');

if (existsSync(src)) {
  cpSync(src, dest, { recursive: true, force: true });
  process.stderr.write('Copied dashboard public → dist/dashboard-server/public\n');
} else {
  console.warn('WARNING: src/dashboard-server/public not found. Run npm run build:dashboard first.');
}
