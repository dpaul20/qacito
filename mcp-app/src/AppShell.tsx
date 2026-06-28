import type React from 'react';

interface AppShellProps {
  style: React.CSSProperties;
  app: object | null | undefined;
  error: Error | null | undefined;
  children: React.ReactNode;
}

export function AppShell({ style, app, error, children }: Readonly<AppShellProps>) {
  if (error) {
    return (
      <div style={style}>
        <p style={{ color: 'var(--color-fail-text)' }}>
          <strong>Connection error:</strong> {error.message}
        </p>
      </div>
    );
  }
  if (!app) {
    return (
      <div style={style}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Connecting…</p>
      </div>
    );
  }
  return <>{children}</>;
}
