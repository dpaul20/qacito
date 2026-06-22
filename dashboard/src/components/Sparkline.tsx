interface SparklineProps {
  history?: Array<'passed' | 'failed' | 'skipped' | boolean>;
  height?: number;
  barWidth?: number;
  gap?: number;
}

export function Sparkline({ history = [], height = 22, barWidth = 4, gap = 3 }: SparklineProps) {
  const n = history.length || 1;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap, height }} aria-hidden="true">
      {history.map((s, i) => {
        const passed = s === 'passed' || s === true;
        const failed = s === 'failed' || s === false;
        const h = passed ? height : failed ? Math.round(height * 0.55) : Math.round(height * 0.3);
        const color = passed ? 'var(--color-pass)' : failed ? 'var(--color-fail)' : 'var(--gray-300)';
        return (
          <span
            key={i}
            title={String(s)}
            style={{
              width: barWidth,
              height: h,
              borderRadius: 1,
              background: color,
              opacity: (!passed && !failed) ? 0.5 : 0.35 + 0.65 * ((i + 1) / n),
            }}
          />
        );
      })}
    </span>
  );
}

export function isFlaky(history: Array<string | boolean> = []): boolean {
  let flips = 0;
  for (let i = 1; i < history.length; i++) {
    const a = history[i - 1] === 'passed' || history[i - 1] === true;
    const b = history[i] === 'passed' || history[i] === true;
    if (a !== b) flips++;
  }
  return flips >= 2;
}
