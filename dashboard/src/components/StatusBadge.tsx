type Status = 'passed' | 'failed' | 'blocked' | 'running' | 'pending' | 'timeout' | 'error';

interface Props {
  status: Status | string;
  pulse?: boolean;
}

const config: Record<string, { label: string; bg: string; color: string }> = {
  passed:  { label: '✅ Pasó',        bg: '#dcfce7', color: '#15803d' },
  failed:  { label: '❌ Falló',       bg: '#fee2e2', color: '#b91c1c' },
  blocked: { label: '🚫 Bloqueado',   bg: '#ffedd5', color: '#c2410c' },
  running: { label: '⏳ Ejecutando',  bg: '#dbeafe', color: '#1d4ed8' },
  pending: { label: '⏸ Pendiente',   bg: '#f3f4f6', color: '#4b5563' },
  timeout: { label: '⏱️ Timeout',    bg: '#fef3c7', color: '#b45309' },
  error:   { label: '⚠️ Error',       bg: '#fef9c3', color: '#a16207' },
};

export default function StatusBadge({ status, pulse }: Props) {
  const cfg = config[status] ?? { label: status, bg: '#f3f4f6', color: '#4b5563' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        background: cfg.bg,
        color: cfg.color,
        animation: pulse ? 'pulse 1.5s ease-in-out infinite' : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </span>
  );
}
