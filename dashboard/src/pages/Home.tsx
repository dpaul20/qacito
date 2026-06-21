import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.tsx';
import './Home.css';

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

export default function Home() {
  const [params] = useSearchParams();
  const projectRoot = params.get('projectRoot');
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = projectRoot
      ? `/api/runs?projectRoot=${encodeURIComponent(projectRoot)}`
      : '/api/runs';

    fetch(url)
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
        <div className="empty-state">
          <p>Cargando runs...</p>
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="container">
        <div className="home-header">
          <div>
            <h1>Runs recientes</h1>
            {projectRoot && <p className="project-context">Proyecto: <code>{projectRoot}</code></p>}
          </div>
        </div>
        <div className="empty-state card">
          <div style={{ fontSize: 40 }}>🧪</div>
          <p>{projectRoot ? 'Todavía no hay runs registrados para este proyecto.' : 'Todavía no hay runs registrados.'}</p>
          <p style={{ marginTop: 4, fontSize: 13 }}>
            Pedile a Claude que ejecute tus tests con <code>run_tests</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="home-header">
        <div>
          <h1>{projectRoot ? `Runs de ${formatProjectName(projectRoot)}` : 'Runs recientes'}</h1>
          <p className="project-context">
            {projectRoot
              ? <>Filtrado por proyecto: <code>{projectRoot}</code></>
              : 'Vista global. Validá el proyecto en cada card antes de confiar en el historial.'}
          </p>
        </div>
        <span className="run-count">{runs.length} runs</span>
      </div>
      <div className="run-list">
        {runs.map((run) => (
          <Link
            to={projectRoot ? `/run/${run.id}?projectRoot=${encodeURIComponent(projectRoot)}` : `/run/${run.id}`}
            key={run.id}
            className="run-card card"
          >
            <div className="run-card-top">
              <span className="run-spec">{run.specPath.split(/[/\\]/).pop()}</span>
              <StatusBadge status={run.status} pulse={run.status === 'running'} />
            </div>
            <div className="run-project-row">
              <span className="run-project-name">{formatProjectName(run.projectRoot)}</span>
              <span className="run-project-path">{run.projectRoot}</span>
            </div>
            <div className="run-card-bottom">
              <span className="run-meta">{formatRelative(run.startedAt)}</span>
              <span className="run-meta">·</span>
              <span className="run-meta">{formatMs(run.durationMs)}</span>
              <span className="run-meta">·</span>
              <span className="run-counter pass">{run.passed} pasó</span>
              <span className="run-counter fail">{run.failed} falló</span>
              {run.skipped > 0 && <span className="run-counter skip">{run.skipped} skip</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
