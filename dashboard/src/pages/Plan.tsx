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

interface TestPlan {
  id: string;
  projectName: string;
  projectRoot: string;
  baseUrl: string;
  techStack: string[];
  testCases: TestCase[];
  createdAt: string;
  specsDir: string;
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
      <div className="plan-header card">
        <div>
          <h1>{plan.projectName}</h1>
          <p className="plan-meta">
            {plan.testCases.length} test cases &nbsp;·&nbsp;
            {plan.techStack.join(', ')} &nbsp;·&nbsp;
            Base URL: <code>{plan.baseUrl}</code>
          </p>
          <p className="plan-project-root">Proyecto: <code>{plan.projectRoot}</code></p>
          {!projectRoot && (
            <p className="plan-warning">
              Vista sin filtro de proyecto. Este plan puede corresponder al proyecto ms reciente, no necesariamente al actual.
            </p>
          )}
        </div>
        <div className="plan-tags">
          {plan.techStack.map((t) => (
            <span key={t} className="plan-tag">{t}</span>
          ))}
        </div>
      </div>

      <div className="tc-list">
        {plan.testCases.map((tc) => (
          <div key={tc.id} className="tc-card card">
            <button
              className="tc-header"
              onClick={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
            >
              <span className="tc-id">{tc.id}</span>
              <span className="tc-title">{tc.title}</span>
              <span className="tc-category">{tc.category}</span>
              <span className="tc-chevron">{expandedId === tc.id ? '▲' : '▼'}</span>
            </button>
            {expandedId === tc.id && (
              <div className="tc-body">
                <p className="tc-description">{tc.description}</p>
                <p className="tc-url">URL: <code>{tc.url}</code></p>
                <ol className="tc-steps">
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
