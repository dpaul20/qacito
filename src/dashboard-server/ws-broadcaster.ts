import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';

export interface RunEvent {
  type: 'run_started' | 'test_started' | 'test_result' | 'run_completed';
  payload: Record<string, unknown>;
}

let wss: WebSocketServer | null = null;
const subscriptions = new Map<string, Set<WebSocket>>();

export function createWsServer(httpServer: Server): void {
  wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type?: string; runId?: string };
        if (msg.type === 'subscribe' && typeof msg.runId === 'string') {
          if (!subscriptions.has(msg.runId)) {
            subscriptions.set(msg.runId, new Set());
          }
          subscriptions.get(msg.runId)!.add(ws);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      for (const [, clients] of subscriptions) {
        clients.delete(ws);
      }
    });
  });
}

export function broadcast(runId: string, event: RunEvent): void {
  const clients = subscriptions.get(runId);
  if (!clients || clients.size === 0) return;
  const msg = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export function getWss(): WebSocketServer | null {
  return wss;
}
