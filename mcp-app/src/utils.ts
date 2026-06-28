import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import type React from 'react';

type SafeArea = McpUiHostContext['safeAreaInsets'];

export function containerStyle(safeArea: SafeArea): React.CSSProperties {
  return {
    padding: '1rem',
    paddingTop: safeArea?.top === undefined ? '1rem' : `${safeArea.top}px`,
    paddingRight: safeArea?.right === undefined ? '1rem' : `${safeArea.right}px`,
    paddingBottom: safeArea?.bottom === undefined ? '1rem' : `${safeArea.bottom}px`,
    paddingLeft: safeArea?.left === undefined ? '1rem' : `${safeArea.left}px`,
    maxWidth: '720px',
    margin: '0 auto',
    fontFamily: 'var(--font-sans)',
  };
}

export function findTextContent(result: { content?: Array<{ type: string; text?: string }> }): string | undefined {
  return result.content?.find((c) => c.type === 'text')?.text;
}
