import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.tsx';
import { Sparkline, isFlaky } from '../components/Sparkline.tsx';
import './Home.css';

const LAST_PROJECT_KEY = 'qacito:lastProjectRoot';

interface RunSummary {
  id: string;
  projectRoot: string;
  specPath: string;
  status: string;
  startedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  history?: string[];
}

interface HealthData {
  passRate: number;
  runsToday: number;
  openFailures: number;
  flakySpecs: number;
}

function computeHealth(runs: RunSummary[]): HealthData {
  if (runs.length === 0) return { passRate: 0, runsToday: 0, openFailures: 0, flakySpecs: 0 };
  const passed = runs.filter((r) => r.status === 'passed').length;
  return {
    passRate: Math.round((passed / runs.length) * 100),
    runsToday: runs.length,
    openFailures: runs.filter((r) => r.failed > 0).length,
    flakySpecs: runs.filter((r) => isFlaky(r.history ?? [])).length,
  };
}

function HealthStrip({ health, scoped, projectCount }: Readonly<{ health: HealthData; scoped: boolean; projectCount: number }>) {
  const first = scoped
    ? { value: `${health.passRate}%`, label: 'Pass rate', color: 'var(--color-pass)' }
    : { value: String(projectCount), label: 'Proyectos', color: 'var(--color-primary)' };
  const items = [
    first,
    { value: String(health.runsToday), label: 'Runs hoy', color: 'var(--color-text)' },
    { value: String(health.openFailures), label: 'Fallas abiertas', color: 'var(--color-fail)' },
    { value: `🎲 ${health.flakySpecs}`, label: 'Specs flaky', color: 'var(--color-blocked)' },
  ];
  return (
    <div className="qa-health">
      {items.map((it, i) => (
        <div key={i} className="qa-health-item">
          <span className="qa-health-value" style={{ color: it.color }}>{it.value}</span>
          <span className="qa-health-label">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  return new Date(iso).toLocaleDateString('es-AR');
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatProjectName(projectRoot: string): string {
  const parts = projectRoot.split(/[/\\]/).filter(Boolean);
  return parts.at(-1) ?? projectRoot;
}

function formatSpecName(specPath: string): string {
  const filename = specPath.split(/[/\\]/).pop() ?? specPath;
  return filename
    .replace(/\.(spec|test)\.(ts|js|tsx|jsx)$/, '')
    .replace(/\.(spec|test)$/, '')
    .replace(/_/g, ' ');
}

interface RunCardProps {
  readonly run: RunSummary;
  readonly href: string;
}

function RunCard({ run, href }: RunCardProps) {
  return (
    <Link to={href} className="run-card card">
      <div className="qa-run-top">
        <span className="qa-run-spec">{formatSpecName(run.specPath)}</span>
        <div className="qa-run-top-right">
          {isFlaky(run.history ?? []) && (
            <span title="Flaky spec" style={{ fontSize: 13 }}>🎲 Flaky</span>
          )}
          <StatusBadge status={run.status} pulse={run.status === 'running'} />
        </div>
      </div>
      <div className="qa-run-project">
        <span className="qa-run-project-name">{formatProjectName(run.projectRoot)}</span>
        <span className="qa-run-project-path">{run.projectRoot}</span>
      </div>
      <div className="qa-run-bottom">
        {(run.history ?? []).length > 0 && (
          <span className="qa-history">
            <Sparkline history={run.history as Array<'passed' | 'failed' | 'skipped'>} />
          </span>
        )}
        {(run.history ?? []).length > 0 && <span className="qa-meta-dot">·</span>}
        <span className="qa-meta">{formatRelative(run.startedAt)}</span>
        <span className="qa-meta-dot">·</span>
        <span className="qa-meta">{formatMs(run.durationMs)}</span>
        <span className="qa-meta-dot">·</span>
        <span className="run-counter pass">{run.passed} pasó</span>
        <span className="run-counter fail">{run.failed} falló</span>
        {run.skipped > 0 && <span className="run-counter skip">{run.skipped} skip</span>}
      </div>
    </Link>
  );
}

export default function Home() {
  const [params] = useSearchParams();
  const projectRoot = params.get('projectRoot');
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectRoot) {
      localStorage.setItem(LAST_PROJECT_KEY, projectRoot);
    } else {
      const last = localStorage.getItem(LAST_PROJECT_KEY);
      if (last) {
        navigate(`/?projectRoot=${encodeURIComponent(last)}`, { replace: true });
      }
    }
  }, [projectRoot, navigate]);

  useEffect(() => {
    if (!projectRoot && localStorage.getItem(LAST_PROJECT_KEY)) return;
    // Always fetch all runs; filter client-side so global view can group by project
    fetch('/api/runs')
      .then((r) => r.json())
      .then((data: { runs: RunSummary[] }) => {
        setRuns(data.runs ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectRoot]);

  if (loading) {
    return (
      <div className="container">
        <div className="empty-state"><p>Cargando runs...</p></div>
      </div>
    );
  }

  // Derive shown runs and project metadata
  const shownRuns = projectRoot ? runs.filter((r) => r.projectRoot === projectRoot) : runs;
  const projectRoots = [...new Set(runs.map((r) => r.projectRoot))];
  const projectCount = projectRoots.length;
  const health = computeHealth(shownRuns);
  const scoped = !!projectRoot;

  if (runs.length === 0) {
    return (
      <div className="container">
        <div className="qa-home-header">
          <div>
            <h1 className="qa-h1">Runs recientes</h1>
            {projectRoot && <p className="qa-subtitle">Proyecto: <code>{projectRoot}</code></p>}
          </div>
        </div>
        <div className="empty-state card">
          <div style={{ fontSize: 40 }}>🧪</div>
          <p>Todavía no hay runs registrados.</p>
          <p style={{ marginTop: 4, fontSize: 13 }}>
            Pedile a Claude que ejecute tus tests con <code>run_tests</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="qa-home-header">
        <div>
          <h1 className="qa-h1">
            {scoped ? `Runs de ${formatProjectName(projectRoot!)}` : 'Todos los proyectos'}
          </h1>
          <p className="qa-subtitle">
            {scoped
              ? <>Filtrado por proyecto: <code>{projectRoot}</code></>
              : 'Vista global — cada proyecto es independiente. Entrá a uno para ver su pass rate.'}
          </p>
        </div>
        <div className="qa-home-actions">
          {scoped && (
            <button
              className="qa-link-btn"
              onClick={() => {
                localStorage.removeItem(LAST_PROJECT_KEY);
                navigate('/');
              }}
            >
              Ver todos los proyectos
            </button>
          )}
          <span className="qa-run-count">{shownRuns.length} runs</span>
        </div>
      </div>

      <HealthStrip health={health} scoped={scoped} projectCount={projectCount} />

      {scoped ? (
        <div className="qa-run-list">
          {shownRuns.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              href={`/run/${run.id}?projectRoot=${encodeURIComponent(projectRoot!)}`}
            />
          ))}
        </div>
      ) : (
        <div className="qa-project-groups">
          {projectRoots.map((root) => {
            const group = runs.filter((r) => r.projectRoot === root);
            const gh = computeHealth(group);
            return (
              <div className="qa-project-group" key={root}>
                <button
                  className="qa-project-head"
                  onClick={() => {
                    localStorage.setItem(LAST_PROJECT_KEY, root);
                    navigate(`/?projectRoot=${encodeURIComponent(root)}`);
                  }}
                >
                  <span className="qa-project-head-name">{formatProjectName(root)}</span>
                  <span className="qa-project-head-meta">{gh.passRate}% pass · {group.length} runs</span>
                  <span className="qa-project-head-go">Ver proyecto →</span>
                </button>
                <div className="qa-run-list">
                  {group.map((run) => (
                    <RunCard key={run.id} run={run} href={`/run/${run.id}`} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
