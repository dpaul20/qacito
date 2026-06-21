import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import { createWsServer } from './ws-broadcaster.js';
import { listRuns, getRun, loadRunsFromDisk } from './run-store.js';
import { listPlans, getLatestPlanForProject, loadPlansFromDisk } from './plans-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dashboardPort = 0;

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    probe.on('error', () => resolve(false));
  });
}

async function findFreePort(start: number, end: number): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found in range ${start}–${end}`);
}

export async function startDashboardServer(): Promise<number> {
  await Promise.all([loadRunsFromDisk(), loadPlansFromDisk()]);

  const app = express();
  app.use(cors());
  app.use(express.json());

  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir));

  // --- API routes ---

  app.get('/api/runs', (_req, res) => {
    const projectRoot = typeof _req.query['projectRoot'] === 'string'
      ? _req.query['projectRoot']
      : undefined;
    res.json({ runs: listRuns(20, projectRoot) });
  });

  app.get('/api/runs/:id', (req, res) => {
    const run = getRun(req.params['id'] ?? '');
    if (!run) { res.status(404).json({ error: 'Run not found' }); return; }
    res.json(run);
  });

  app.get('/api/plans', (_req, res) => {
    res.json({ plans: listPlans() });
  });

  app.get('/api/plans/:projectRoot', (req, res) => {
    const decoded = decodeURIComponent(req.params['projectRoot'] ?? '');
    const plan = getLatestPlanForProject(decoded);
    if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }
    res.json(plan);
  });

  // SPA fallback — must be last
  // Express 5 + path-to-regexp v8 requires named wildcards; '/{*path}' captures everything.
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  const port = await findFreePort(50000, 59999).catch(() => 0);
  if (port === 0) {
    process.stderr.write('[qacito-dashboard] WARNING: Could not find free port, dashboard disabled.\n');
    return 0;
  }

  const httpServer = http.createServer(app);
  createWsServer(httpServer);

  await new Promise<void>((resolve) => httpServer.listen(port, '127.0.0.1', () => resolve()));

  dashboardPort = port;
  process.stderr.write(`[qacito-dashboard] Listening on http://localhost:${port}\n`);
  return port;
}

export function getDashboardPort(): number {
  return dashboardPort;
}

export function getDashboardUrl(): string {
  // Use 127.0.0.1 explicitly — on Windows, "localhost" may resolve to ::1 (IPv6)
  // which can hit a different process if another app is also bound to that port.
  return dashboardPort > 0 ? `http://127.0.0.1:${dashboardPort}` : '';
}
