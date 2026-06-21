import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.tsx';
import { DiffBlock } from '../components/DiffBlock.tsx';
import { useWebSocket, type RunEvent } from '../hooks/useWebSocket.ts';
import './Run.css';

interface TestArtifacts {
  url: string;
  highlight: string;
  failingStep?: string;
  traceId?: string;
}

interface DiffLine {
  type: 'add' | 'del' | 'ctx';
  text: string;
}

interface TestFix {
  filename: string;
  summary?: string;
  lines: DiffLine[];
}

interface TestResult {
  id: string;
  title: string;
  status: string;
  durationMs: number;
  error?: string;
  regression?: boolean;
  artifacts?: TestArtifacts;
  fix?: TestFix;
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
  history?: string[];
  regressions?: string[];
  recovered?: string[];
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

function RegressionBanner({ regressions = [], recovered = [] }: { regressions?: string[]; recovered?: string[] }) {
  if (!regressions.length && !recovered.length) return null;
  return (
    <div className="qa-regress">
      {regressions.length > 0 && (
        <div className="qa-regress-block qa-regress-bad">
          <span className="qa-regress-head">🔴 {regressions.length} regresión{regressions.length > 1 ? 'es' : ''} <span className="qa-regress-sub">pasaban antes, ahora fallan</span></span>
          <ul className="qa-regress-list">{regressions.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      {recovered.length > 0 && (
        <div className="qa-regress-block qa-regress-good">
          <span className="qa-regress-head">🟢 {recovered.length} recuperado{recovered.length > 1 ? 's' : ''} <span className="qa-regress-sub">fallaban antes, ahora pasan</span></span>
          <ul className="qa-regress-list">{recovered.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

interface TestRowProps {
  test: TestResult;
  expanded: boolean;
  onToggle: () => void;
}

function TestRow({ test, expanded, onToggle }: TestRowProps) {
  const canExpand = !!(test.error ?? test.artifacts ?? test.fix);
  return (
    <div className="test-row">
      <button
        className="test-row-header"
        onClick={canExpand ? onToggle : undefined}
        style={canExpand ? undefined : { cursor: 'default' }}
      >
        <StatusBadge status={test.status} pulse={test.status === 'running'} />
        <span className="test-title">{test.title}</span>
        {test.regression && <span style={{ fontSize: 11, color: 'var(--fail-fg)', fontWeight: 600, padding: '2px 6px', background: 'var(--fail-bg)', borderRadius: 4 }}>regresión</span>}
        <span className="test-duration">{test.durationMs > 0 ? formatMs(test.durationMs) : ''}</span>
        {canExpand && <span className="expand-icon">{expanded ? '▲' : '▼'}</span>}
      </button>
      {expanded && canExpand && (
        <div className="test-error" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {test.error && (
            <pre>{test.error.slice(0, 600)}</pre>
          )}

          {test.artifacts && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Screenshot frame */}
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '6px 10px', background: 'var(--gray-100)', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ display: 'flex', gap: 4 }}>
                    {['#f87171', '#fbbf24', '#34d399'].map((c) => (
                      <i key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' }} />
                    ))}
                  </span>
                  <code style={{ fontSize: 10, color: 'var(--color-muted)' }}>{test.artifacts.url}</code>
                </div>
                <div style={{ position: 'relative', height: 80, background: '#f9fafb' }}>
                  <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, height: 28, borderRadius: 6, border: '2px dashed var(--color-fail)', background: 'rgba(239,68,68,0.06)', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--fail-fg)' }}>✕ {test.artifacts.highlight}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {test.artifacts.failingStep && (
                  <div style={{ fontSize: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Step que falló</div>
                    <code style={{ marginTop: 4, display: 'block', fontSize: 11 }}>{test.artifacts.failingStep}</code>
                  </div>
                )}
                {test.artifacts.traceId && (
                  <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 13, color: 'var(--color-primary)', fontWeight: 500 }}>Ver trace de Playwright ↗</a>
                )}
              </div>
            </div>
          )}

          {test.fix && (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 16, background: 'var(--gray-50)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>🧪 Claude propone un fix</span>
                <button className="qa-apply-fix-btn">Aplicar</button>
              </div>
              {test.fix.summary && <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-subtle)' }}>{test.fix.summary}</p>}
              <DiffBlock filename={test.fix.filename} lines={test.fix.lines} />
            </div>
          )}
        </div>
      )}
    </div>
  );
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
  const [queued, setQueued] = useState<'all' | 'failed' | null>(null);
  const isLive = liveStatus === 'running';
  const timer = useTimer(isLive);

  const { events } = useWebSocket({ runId: id ?? '', enabled: isLive });

  useEffect(() => {
    if (!queued) return;
    const timeout = setTimeout(() => setQueued(null), 2200);
    return () => clearTimeout(timeout);
  }, [queued]);

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
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="qa-rerun-btn" onClick={() => setQueued('all')}>↻ Re-ejecutar</button>
            {run.failed > 0 && (
              <button className="qa-rerun-btn qa-rerun-primary" onClick={() => setQueued('failed')}>↻ Solo los que fallaron</button>
            )}
          </div>
          {queued && <span className="qa-queued">✓ {queued === 'failed' ? `${run.failed} tests` : 'Run'} encolado</span>}
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

      <RegressionBanner regressions={run.regressions} recovered={run.recovered} />

      {testList.length === 0 && isLive && (
        <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--color-muted)' }}>
          <p>Esperando resultados...</p>
        </div>
      )}

      {testList.length > 0 && (
        <div className="card test-list">
          <h2>Resultados</h2>
          {testList.map((t) => (
            <TestRow
              key={t.id}
              test={t}
              expanded={expandedId === t.id}
              onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
