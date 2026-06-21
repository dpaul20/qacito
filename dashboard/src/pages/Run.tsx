import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.tsx';
import { useWebSocket, type RunEvent } from '../hooks/useWebSocket.ts';
import './Run.css';

interface TestResult {
  id: string;
  title: string;
  status: string;
  durationMs: number;
  error?: string;
}

interface RunDetail {
  id: string;
  specPath: string;
  projectRoot: string;
  status: string;
  startedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  tests: TestResult[];
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function useTimer(active: boolean): string {
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(Date.now());

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setElapsed(Date.now() - start.current), 250);
    return () => clearInterval(id);
  }, [active]);

  return active ? formatMs(elapsed) : '';
}

export default function Run() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const projectRootParam = params.get('projectRoot');
  const [run, setRun] = useState<RunDetail | null>(null);
  const [tests, setTests] = useState<Map<string, TestResult>>(new Map());
  const [liveStatus, setLiveStatus] = useState<string>('running');
  const [liveSummary, setLiveSummary] = useState({ passed: 0, failed: 0, pending: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isLive = liveStatus === 'running';
  const timer = useTimer(isLive);

  const { events } = useWebSocket({ runId: id ?? '', enabled: isLive });

  // Load initial state
  useEffect(() => {
    if (!id) return;
    fetch(`/api/runs/${id}`)
      .then((r) => r.json())
      .then((data: RunDetail) => {
        setRun(data);
        setLiveStatus(data.status);
        const m = new Map<string, TestResult>();
        for (const t of data.tests) m.set(t.id, t);
        setTests(m);
        setLiveSummary({ passed: data.passed, failed: data.failed, pending: 0 });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  // Apply WebSocket events
  useEffect(() => {
    for (const event of events) {
      applyEvent(event);
    }
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyEvent(event: RunEvent) {
    if (event.type === 'test_started') {
      const title = String(event.payload['title'] ?? '');
      const newTest: TestResult = { id: title, title, status: 'running', durationMs: 0 };
      setTests((prev) => new Map(prev).set(title, newTest));
      setLiveSummary((s) => ({ ...s, pending: s.pending + 1 }));
    } else if (event.type === 'test_result') {
      const title = String(event.payload['title'] ?? '');
      const status = String(event.payload['status'] ?? 'failed');
      const durationMs = Number(event.payload['durationMs'] ?? 0);
      setTests((prev) => {
        const m = new Map(prev);
        m.set(title, { id: title, title, status, durationMs });
        return m;
      });
      setLiveSummary((s) => ({
        passed: status === 'passed' ? s.passed + 1 : s.passed,
        failed: status === 'failed' ? s.failed + 1 : s.failed,
        pending: Math.max(0, s.pending - 1),
      }));
    } else if (event.type === 'run_completed') {
      const status = String(event.payload['status'] ?? 'failed');
      setLiveStatus(status);
      const summary = event.payload['summary'] as { passed: number; failed: number; skipped: number } | undefined;
      if (summary) {
        setLiveSummary({ passed: summary.passed, failed: summary.failed, pending: 0 });
      }
    }
  }

  if (loading) {
    return <div className="container"><div className="empty-state"><p>Cargando run...</p></div></div>;
  }

  if (!run) {
    return (
      <div className="container">
        <div className="empty-state card">
          <p>Run no encontrado.</p>
          <Link to="/" style={{ marginTop: 12, display: 'inline-block', color: 'var(--color-running)', fontSize: 14 }}>← Volver</Link>
        </div>
      </div>
    );
  }

  const testList = [...tests.values()];
  const specName = run.specPath.split(/[/\\]/).pop() ?? run.specPath;
  const backHref = projectRootParam
    ? `/?projectRoot=${encodeURIComponent(projectRootParam)}`
    : '/';

  return (
    <div className="container">
      <div className="run-header card">
        <div className="run-header-left">
          <Link to={backHref} className="back-link">← Runs</Link>
          <h1 className="run-title">{specName}</h1>
          <p className="run-path">{run.specPath}</p>
          <p className="run-project">Proyecto: <code>{run.projectRoot}</code></p>
        </div>
        <div className="run-header-right">
          <StatusBadge status={liveStatus} pulse={isLive} />
          {isLive && <span className="run-timer">{timer}</span>}
          {!isLive && <span className="run-timer">{formatMs(run.durationMs)}</span>}
        </div>
      </div>

      <div className="summary-row">
        <div className="summary-box pass">
          <span className="summary-value">{liveSummary.passed}</span>
          <span className="summary-label">✅ Pasó</span>
        </div>
        <div className="summary-box fail">
          <span className="summary-value">{liveSummary.failed}</span>
          <span className="summary-label">❌ Falló</span>
        </div>
        <div className="summary-box pending">
          <span className="summary-value">{isLive ? liveSummary.pending : run.skipped}</span>
          <span className="summary-label">{isLive ? '⏳ Pendiente' : '⏩ Skipped'}</span>
        </div>
      </div>

      {testList.length === 0 && isLive && (
        <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--color-muted)' }}>
          <p>Esperando resultados...</p>
        </div>
      )}

      {testList.length > 0 && (
        <div className="card test-list">
          <h2>Resultados</h2>
          {testList.map((t) => (
            <div key={t.id} className="test-row">
              <button
                className="test-row-header"
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              >
                <StatusBadge status={t.status} pulse={t.status === 'running'} />
                <span className="test-title">{t.title}</span>
                <span className="test-duration">{t.durationMs > 0 ? formatMs(t.durationMs) : ''}</span>
                {t.error && <span className="expand-icon">{expandedId === t.id ? '▲' : '▼'}</span>}
              </button>
              {expandedId === t.id && t.error && (
                <div className="test-error">
                  <pre>{t.error.slice(0, 600)}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
