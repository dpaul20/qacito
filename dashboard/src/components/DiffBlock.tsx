interface DiffLine {
  type: 'add' | 'del' | 'ctx';
  text: string;
}

interface DiffBlockProps {
  lines?: DiffLine[];
  filename?: string;
}

const ROW = {
  add: { bg: 'var(--pass-bg)', fg: 'var(--pass-fg)', sign: '+' },
  del: { bg: 'var(--fail-bg)', fg: 'var(--fail-fg)', sign: '-' },
  ctx: { bg: 'transparent', fg: 'var(--color-subtle)', sign: ' ' },
} as const;

export function DiffBlock({ lines = [], filename }: DiffBlockProps) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', background: '#fff' }}>
      {filename && (
        <div style={{ padding: '6px 12px', background: 'var(--gray-50)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-muted)', fontSize: 'var(--text-2xs)' }}>{filename}</div>
      )}
      {lines.map((ln, i) => {
        const r = ROW[ln.type] ?? ROW.ctx;
        return (
          <div key={i} style={{ display: 'flex', background: r.bg, color: r.fg, lineHeight: 1.7 }}>
            <span style={{ width: 18, textAlign: 'center', opacity: 0.6, userSelect: 'none', flexShrink: 0 }}>{r.sign}</span>
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', paddingRight: 10 }}>{ln.text}</span>
          </div>
        );
      })}
    </div>
  );
}
