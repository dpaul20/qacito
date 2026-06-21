#!/usr/bin/env node
import {
  intro, outro, select,
  spinner, log, note, cancel, isCancel,
} from '@clack/prompts';
import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, copyFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { homedir, platform } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const HOME      = homedir();
const IS_WIN    = platform() === 'win32';
const IS_MAC    = platform() === 'darwin';

const CLAUDE_DESKTOP_CONFIG = IS_WIN
  ? join(process.env.APPDATA ?? '', 'Claude', 'claude_desktop_config.json')
  : IS_MAC
    ? join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    : join(HOME, '.config', 'Claude', 'claude_desktop_config.json');

const SKILLS_DIR = join(HOME, '.claude', 'skills');
const DIST_ENTRY = join(ROOT, 'dist', 'server', 'index.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readPkg() {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
}

function registerClaudeCode(distPath) {
  // claude mcp add writes to ~/.claude.json — the correct location for MCPs.
  // settings.json does NOT work for MCP registration.
  const nodeBin = process.execPath;
  execSync(
    `claude mcp add --scope user qacito -- "${nodeBin}" "${distPath}"`,
    { stdio: 'pipe' },
  );
}

function registerClaudeDesktop(distPath) {
  const nodeBin = process.execPath;
  const mcpEntry = { command: nodeBin, args: [distPath] };

  let config = {};
  if (existsSync(CLAUDE_DESKTOP_CONFIG)) {
    try { config = JSON.parse(readFileSync(CLAUDE_DESKTOP_CONFIG, 'utf8')); } catch {}
  }
  config.mcpServers        = config.mcpServers || {};
  config.mcpServers.qacito = mcpEntry;
  mkdirSync(dirname(CLAUDE_DESKTOP_CONFIG), { recursive: true });
  writeFileSync(CLAUDE_DESKTOP_CONFIG, JSON.stringify(config, null, 2) + '\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pkg = readPkg();

  console.log('');
  intro(`  QAcito v${pkg.version} — Autonomous QA for Claude  `);

  // ── Step 1: system check ───────────────────────────────────────────────────
  const sys = spinner();
  sys.start('Checking system');

  const nodeMajor = parseInt(process.version.slice(1));
  if (nodeMajor < 20) {
    sys.stop('System check failed');
    log.error(`Node.js 20+ required — current: ${process.version}`);
    cancel('Installation aborted.');
    process.exit(1);
  }

  const needsBuild = !existsSync(DIST_ENTRY);
  if (needsBuild) {
    sys.message('Building QAcito (first run)…');
    try {
      execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });
    } catch {
      sys.stop('Build failed');
      log.error('Run "npm run build" manually and check for TypeScript errors.');
      cancel('Installation aborted.');
      process.exit(1);
    }
  }

  sys.stop(
    `Node.js ${process.version}` +
    (needsBuild ? '  ·  built from source' : '  ·  dist/ found'),
  );

  // ── Step 2: target selection ───────────────────────────────────────────────
  const target = await select({
    message: 'Where do you use Claude?',
    options: [
      { value: 'code',    label: 'Claude Code',    hint: 'CLI — installs skill + MCP server' },
      { value: 'desktop', label: 'Claude Desktop', hint: 'macOS / Windows app' },
      { value: 'both',    label: 'Both',            hint: 'Claude Code + Claude Desktop' },
    ],
  });

  if (isCancel(target)) {
    cancel('Installation cancelled.');
    process.exit(0);
  }

  // ── Step 3: install ────────────────────────────────────────────────────────
  const inst = spinner();
  inst.start('Installing…');

  const distPath = DIST_ENTRY.replace(/\\/g, '/');

  if (target === 'code' || target === 'both') {
    mkdirSync(SKILLS_DIR, { recursive: true });
    copyFileSync(join(ROOT, 'SKILL.md'), join(SKILLS_DIR, 'qacito.md'));
    inst.message('Skill installed');

    try {
      registerClaudeCode(distPath);
      inst.message('MCP server registered in Claude Code');
    } catch {
      inst.stop('MCP registration failed');
      log.error('Could not run "claude mcp add". Is Claude Code CLI installed and in your PATH?');
      cancel('Installation aborted.');
      process.exit(1);
    }
  }

  if (target === 'desktop' || target === 'both') {
    registerClaudeDesktop(distPath);
    inst.message('MCP server registered in Claude Desktop');
  }

  inst.stop('Installation complete');

  // ── Step 4: next steps ─────────────────────────────────────────────────────
  const restartTarget = target === 'desktop' ? 'Claude Desktop' : 'Claude Code';

  note(
    [
      `Restart ${restartTarget} to activate QAcito.`,
      '',
      'Verify with:  claude mcp list',
      '',
      'First prompt:',
      '"Analyze /path/to/project and write tests."',
    ].join('\n'),
    'Next steps',
  );

  outro('QAcito is ready.');
}

main().catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
