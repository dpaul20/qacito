import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { useEffect, useState } from 'react';
import type React from 'react';

type SafeArea = McpUiHostContext['safeAreaInsets'];
type AppLike = { getHostContext: () => McpUiHostContext };
type ToolResult = { content?: Array<{ type: string; text?: string }> };

export function useHostContext(
  app: AppLike | null | undefined,
  setHostContext: React.Dispatch<React.SetStateAction<McpUiHostContext | undefined>>,
): void {
  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app, setHostContext]);
}

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

export function findTextContent(result: ToolResult): string | undefined {
  return result.content?.find((c) => c.type === 'text')?.text;
}

export function parseJson<T>(result: ToolResult): T | null {
  const text = findTextContent(result);
  if (text === undefined) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function useMcpApp(
  appName: string,
  onToolResult: (result: ToolResult) => void,
): { app: ReturnType<typeof useApp>['app']; error: ReturnType<typeof useApp>['error']; style: React.CSSProperties } {
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();

  const { app, error } = useApp({
    appInfo: { name: appName, version: '1.0.0' },
    capabilities: {},
    onAppCreated: (appInstance) => {
      appInstance.ontoolresult = async (result) => { onToolResult(result); };
      appInstance.onhostcontextchanged = (params) => {
        setHostContext((prev) => ({ ...prev, ...params }));
      };
      appInstance.onerror = (err) => { console.error(`[${appName}] error:`, err); };
    },
  });

  useHostContext(app, setHostContext);
  const style = containerStyle(hostContext?.safeAreaInsets);

  return { app, error, style };
}
