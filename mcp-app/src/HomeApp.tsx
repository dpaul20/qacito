import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { useEffect, useState } from 'react';

// ── Card data ─────────────────────────────────────────────────────────────────

interface Card {
  icon: string;
  name: string;
  description: string;
  prompt: string;
}

interface Category {
  title: string;
  accentColor: string;
  cards: Card[];
}

const CATEGORIES: Category[] = [
  {
    title: '▶ Correr tests',
    accentColor: 'var(--color-run-text)',
    cards: [
      {
        icon: '🏃',
        name: 'Correr todos los tests',
        description: 'Ejecuta el suite completo del proyecto',
        prompt: 'Corré todos los tests del proyecto',
      },
      {
        icon: '🔁',
        name: 'Detectar tests flaky',
        description: 'Identifica tests inestables con múltiples ejecuciones',
        prompt: 'Corré los tests N veces para detectar cuáles son inestables (flaky)',
      },
      {
        icon: '💥',
        name: 'Tests afectados por mis cambios',
        description: 'Corre solo los tests relacionados con tus cambios actuales',
        prompt: 'Analizá qué tests pueden verse afectados por mis cambios actuales y correlos',
      },
      {
        icon: '🔧',
        name: 'Fixear los que fallan',
        description: 'Analiza los fallos y propone correcciones',
        prompt: 'Analizá los tests que están fallando y proponé correcciones',
      },
    ],
  },
  {
    title: '🔍 Analizar el proyecto',
    accentColor: 'var(--color-pass-text)',
    cards: [
      {
        icon: '🗺️',
        name: 'Analizar proyecto',
        description: 'Mapa completo de estructura, stack y cobertura',
        prompt: 'Analizá el proyecto completo y dame un mapa de su estructura, stack y cobertura',
      },
      {
        icon: '✅',
        name: 'Verificar entorno',
        description: 'Comprueba que el entorno está listo para correr tests',
        prompt: 'Verificá que el entorno esté listo para correr tests',
      },
    ],
  },
  {
    title: '📈 Resultados e historial',
    accentColor: 'var(--color-warn-text)',
    cards: [
      {
        icon: '🖼️',
        name: 'Ver último run',
        description: 'Muestra los resultados del run más reciente',
        prompt: 'Mostrame los resultados del último run de tests',
      },
      {
        icon: '📄',
        name: 'Generar reporte',
        description: 'Crea un reporte HTML con el historial de tests',
        prompt: 'Generá un reporte HTML con los resultados de los últimos tests',
      },
    ],
  },
  {
    title: '✨ Generar tests',
    accentColor: 'var(--color-accent-purple)',
    cards: [
      {
        icon: '🔧',
        name: 'Desde OpenAPI',
        description: 'Genera tests a partir de la especificación OpenAPI',
        prompt: 'Generá tests a partir de la especificación OpenAPI del proyecto',
      },
      {
        icon: '♿',
        name: 'Accesibilidad',
        description: 'Analiza la interfaz y genera tests de accesibilidad a11y',
        prompt: 'Analizá la accesibilidad de la interfaz y generá tests a11y',
      },
    ],
  },
];

// ── Main component ────────────────────────────────────────────────────────────

interface HomeMeta {
  toolCount: number;
  projectRoot: string | null;
}

function parseMeta(result: { content?: Array<{ type: string; text?: string }> }): HomeMeta | null {
  const item = result.content?.find((c) => c.type === 'text');
  if (!item || item.type !== 'text' || item.text === undefined) return null;
  try {
    return JSON.parse(item.text) as HomeMeta;
  } catch {
    return null;
  }
}

export function HomeApp() {
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();
  const [meta, setMeta] = useState<HomeMeta | null>(null);

  const { app, error } = useApp({
    appInfo: { name: 'QAcito Home', version: '1.0.0' },
    capabilities: {},
    onAppCreated: (appInstance) => {
      // Register ALL handlers BEFORE connect() is called — these are one-shot events
      appInstance.ontoolresult = async (result) => {
        const parsed = parseMeta(result);
        if (parsed) setMeta(parsed);
      };

      appInstance.onhostcontextchanged = (params) => {
        setHostContext((prev) => ({ ...prev, ...params }));
      };

      appInstance.onerror = (err) => {
        process.stderr.write(`[HomeApp] error: ${String(err)}\n`);
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

  function handleCardClick(prompt: string) {
    void app
      ?.sendMessage({ role: 'user', content: [{ type: 'text', text: prompt }] })
      .then((r) => {
        if (r.isError === true) {
          console.error('[HomeApp] sendMessage rejected', r);
        }
      });
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>🧪</span>
          <span>QAcito</span>
        </h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          Hacé clic en lo que querés hacer
        </p>
        {meta?.projectRoot !== null && meta?.projectRoot !== undefined && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            marginTop: '0.625rem',
            padding: '0.25rem 0.625rem',
            background: 'var(--color-surface)',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            color: 'var(--color-text-muted)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-pass-text)', flexShrink: 0, display: 'inline-block' }} />
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text)' }}>
              {meta.projectRoot}
            </code>
          </div>
        )}
      </div>

      {/* Category sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {CATEGORIES.map((category) => (
          <section key={category.title}>
            <h2 style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: category.accentColor,
              margin: '0 0 0.625rem',
            }}>
              {category.title}
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.5rem',
            }}>
              {category.cards.map((card) => (
                <button
                  key={card.name}
                  onClick={() => { handleCardClick(card.prompt); }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '0.25rem',
                    padding: '0.75rem',
                    background: 'var(--color-surface)',
                    border: '1px solid transparent',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '0.875rem',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = category.accentColor;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
                  }}
                >
                  <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{card.icon}</span>
                  <span style={{ fontWeight: 600 }}>{card.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                    {card.description}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
