import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import './Plan.css';

interface TestCase {
  id: string;
  title: string;
  description: string;
  steps: string[];
  url: string;
  category: string;
}

interface Coverage {
  flowsFound: number;
  flowsCovered: number;
  uncovered: string[];
}

interface TestPlan {
  id: string;
  projectName: string;
  projectRoot: string;
  baseUrl: string;
  techStack: string[];
  testCases: TestCase[];
  createdAt: string;
  specsDir: string;
  coverage?: Coverage;
}

function CoverageBlock({ coverage }: { coverage: Coverage }) {
  const pct = Math.round((coverage.flowsCovered / coverage.flowsFound) * 100);
  return (
    <div className="qa-coverage">
      <div className="qa-coverage-head">
        <span className="qa-coverage-title">Cobertura de flujos</span>
        <span className="qa-coverage-num">{coverage.flowsCovered}/{coverage.flowsFound} · {pct}%</span>
      </div>
      <div className="qa-coverage-bar"><span style={{ width: `${pct}%` }} /></div>
      {coverage.uncovered.length > 0 && (
        <div className="qa-coverage-gaps">
          <span className="qa-coverage-gaps-label">Sin cobertura:</span>
          {coverage.uncovered.map((f, i) => <span key={i} className="qa-gap-chip">{f}</span>)}
          <button className="qa-gap-action">Generar tests faltantes →</button>
        </div>
      )}
    </div>
  );
}

export default function Plan() {
  const [params] = useSearchParams();
  const projectRoot = params.get('projectRoot');
  const [plan, setPlan] = useState<TestPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const url = projectRoot
      ? `/api/plans/${encodeURIComponent(projectRoot)}`
      : '/api/plans';

    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TestPlan | { plans: TestPlan[] } | null) => {
        if (!data) { setLoading(false); return; }
        if ('plans' in data) {
          setPlan((data as { plans: TestPlan[] }).plans[0] ?? null);
        } else {
          setPlan(data as TestPlan);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectRoot]);

  if (loading) {
    return <div className="container"><div className="empty-state"><p>Cargando plan...</p></div></div>;
  }

  if (!plan) {
    return (
      <div className="container">
        <div className="empty-state card">
          <div style={{ fontSize: 40 }}>📋</div>
          <p>No hay plan de tests generado.</p>
          <p style={{ marginTop: 4, fontSize: 13 }}>
            Pedile a Claude que analice tu proyecto con <code>analyze_project</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="qa-h1">{plan.projectName}</h1>
            <p className="qa-subtitle">
              {plan.testCases.length} test cases · {plan.techStack.join(', ')} · Base URL: <code>{plan.baseUrl}</code>
            </p>
            <p className="qa-run-projline">Proyecto: <code>{plan.projectRoot}</code></p>
            {!projectRoot && (
              <p className="plan-warning">
                Vista sin filtro de proyecto. Este plan puede corresponder al proyecto más reciente.
              </p>
            )}
          </div>
          <div className="qa-plan-tags">
            {plan.techStack.map((t) => (
              <span key={t} className="qa-plan-tag">{t}</span>
            ))}
          </div>
        </div>
        {plan.coverage && <CoverageBlock coverage={plan.coverage} />}
      </div>

      <div className="qa-tc-list">
        {plan.testCases.map((tc) => (
          <div key={tc.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <button
              className="qa-tc-header"
              onClick={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
            >
              <span className="qa-tc-id">{tc.id}</span>
              <span className="qa-tc-title">{tc.title}</span>
              <span className="qa-tc-cat">{tc.category}</span>
              <span className="qa-chevron">{expandedId === tc.id ? '▲' : '▼'}</span>
            </button>
            {expandedId === tc.id && (
              <div className="qa-tc-body">
                <p className="qa-tc-desc">{tc.description}</p>
                <p className="qa-tc-url">URL: <code>{tc.url}</code></p>
                <ol className="qa-tc-steps">
                  {tc.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
