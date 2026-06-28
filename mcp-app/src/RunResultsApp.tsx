import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { useEffect, useState } from 'react';

// ── Types mirrored from run-store (no import — UI bundle is self-contained) ──

type RunStatus = 'running' | 'passed' | 'failed' | 'timeout' | 'error' | 'blocked';
type TestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'timedOut';

interface TestResult {
  id: string;
  title: string;
  status: TestStatus;
  durationMs: number;
  error?: string;
  regression?: boolean;
}

interface RunDetail {
  id: string;
  projectRoot: string;
  specPath: string;
  status: RunStatus;
  startedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  tests: TestResult[];
  regressions?: string[];
  recovered?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseRun(result: CallToolResult): RunDetail | null {
  const textItem = result.content?.find((c) => c.type === 'text');
  if (!textItem || textItem.type !== 'text') return null;
  try {
    return JSON.parse(textItem.text) as RunDetail;
  } catch {
    return null;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function specFilename(specPath: string): string {
  return specPath.split(/[\\/]/).pop() ?? specPath;
}

// ── Status badge colors ───────────────────────────────────────────────────────

const STATUS_COLORS: Record<RunStatus, { bg: string; text: string }> = {
  passed:  { bg: 'var(--color-pass-bg)',    text: 'var(--color-pass-text)' },
  failed:  { bg: 'var(--color-fail-bg)',    text: 'var(--color-fail-text)' },
  running: { bg: 'var(--color-run-bg)',     text: 'var(--color-run-text)' },
  timeout: { bg: 'var(--color-warn-bg)',    text: 'var(--color-warn-text)' },
  error:   { bg: 'var(--color-fail-bg)',    text: 'var(--color-fail-text)' },
  blocked: { bg: 'var(--color-skip-bg)',    text: 'var(--color-skip-text)' },
};

function TestIcon({ status }: { status: TestStatus }) {
  if (status === 'passed')   return <span style={{ color: 'var(--color-pass-text)' }}>✓</span>;
  if (status === 'failed')   return <span style={{ color: 'var(--color-fail-text)' }}>✗</span>;
  if (status === 'timedOut') return <span style={{ color: 'var(--color-warn-text)' }}>⏱</span>;
  return <span style={{ color: 'var(--color-skip-text)' }}>–</span>;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RunHeader({ run }: { run: RunDetail }) {
  const colors = STATUS_COLORS[run.status] ?? STATUS_COLORS.error;
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
          {specFilename(run.specPath)}
        </h2>
        <span style={{
          padding: '2px 8px',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 600,
          background: colors.bg,
          color: colors.text,
        }}>
          {run.status.toUpperCase()}
        </span>
      </div>
      <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
        Started: {formatDate(run.startedAt)} · Duration: {formatDuration(run.durationMs)}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px', wordBreak: 'break-all' }}>
        {run.specPath}
      </div>
    </div>
  );
}

function SummaryBar({ run }: { run: RunDetail }) {
  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      padding: '0.5rem 0.75rem',
      background: 'var(--color-surface)',
      borderRadius: '6px',
      marginBottom: '1rem',
      flexWrap: 'wrap',
    }}>
      <span style={{ color: 'var(--color-pass-text)', fontWeight: 600 }}>✓ {run.passed} passed</span>
      <span style={{ color: 'var(--color-fail-text)', fontWeight: 600 }}>✗ {run.failed} failed</span>
      <span style={{ color: 'var(--color-skip-text)' }}>– {run.skipped} skipped</span>
      <span style={{ color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
        {run.total} total
      </span>
    </div>
  );
}

function TestList({ tests }: { tests: TestResult[] }) {
  if (tests.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>No test results yet.</p>;
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      {tests.map((test) => (
        <li key={test.id} style={{
          padding: '0.5rem 0.75rem',
          borderRadius: '4px',
          background: 'var(--color-surface)',
          fontSize: '0.875rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span style={{ display: 'flex', gap: '0.375rem', alignItems: 'baseline' }}>
              <TestIcon status={test.status} />
              <span>{test.title}</span>
              {test.regression === true && (
                <span style={{
                  fontSize: '0.65rem',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: 'var(--color-warn-bg)',
                  color: 'var(--color-warn-text)',
                  fontWeight: 600,
                }}>REGRESSION</span>
              )}
            </span>
            <span style={{ color: 'var(--color-text-muted)', flexShrink: 0, fontSize: '0.75rem' }}>
              {formatDuration(test.durationMs)}
            </span>
          </div>
          {test.error !== undefined && (
            <pre style={{
              marginTop: '0.375rem',
              fontSize: '0.75rem',
              color: 'var(--color-fail-text)',
              background: 'var(--color-fail-bg)',
              padding: '0.375rem 0.5rem',
              borderRadius: '4px',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>{test.error}</pre>
          )}
        </li>
      ))}
    </ul>
  );
}

function StringList({ items, label, color }: { items: string[]; label: string; color: string }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: '1rem' }}>
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color, marginBottom: '0.375rem' }}>{label}</h3>
      <ul style={{ listStyle: 'disc', paddingLeft: '1.25rem', margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

// ── Main app component ────────────────────────────────────────────────────────

export function RunResultsApp() {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();

  const { app, error } = useApp({
    appInfo: { name: 'QAcito Run Results', version: '1.0.0' },
    capabilities: {},
    onAppCreated: (appInstance) => {
      appInstance.ontoolresult = async (result) => {
        const parsed = parseRun(result);
        if (parsed) setRun(parsed);
      };

      appInstance.onhostcontextchanged = (params) => {
        setHostContext((prev) => ({ ...prev, ...params }));
      };

      appInstance.onerror = (err) => {
        console.error('[RunResultsApp] error:', err);
      };
    },
  });

  useEffect(() => {
    if (app) {
      setHostContext(app.getHostContext());
    }
  }, [app]);

  const safeArea = hostContext?.safeAreaInsets;
  const containerStyle: React.CSSProperties = {
    padding: '1rem',
    paddingTop: safeArea?.top !== undefined ? `${safeArea.top}px` : '1rem',
    paddingRight: safeArea?.right !== undefined ? `${safeArea.right}px` : '1rem',
    paddingBottom: safeArea?.bottom !== undefined ? `${safeArea.bottom}px` : '1rem',
    paddingLeft: safeArea?.left !== undefined ? `${safeArea.left}px` : '1rem',
    maxWidth: '720px',
    margin: '0 auto',
    fontFamily: 'var(--font-sans)',
  };

  if (error) {
    return (
      <div style={containerStyle}>
        <p style={{ color: 'var(--color-fail-text)' }}>
          <strong>Connection error:</strong> {error.message}
        </p>
      </div>
    );
  }

  if (!app) {
    return (
      <div style={containerStyle}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Connecting…</p>
      </div>
    );
  }

  if (!run) {
    return (
      <div style={containerStyle}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          No run data yet. Call <code>view_run_results</code> to display results.
        </p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <RunHeader run={run} />
      <SummaryBar run={run} />
      <TestList tests={run.tests} />
      <StringList
        items={run.regressions ?? []}
        label="Regressions"
        color="var(--color-warn-text)"
      />
      <StringList
        items={run.recovered ?? []}
        label="Recovered"
        color="var(--color-pass-text)"
      />
    </div>
  );
}
