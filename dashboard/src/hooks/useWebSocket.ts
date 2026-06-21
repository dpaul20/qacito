import { useEffect, useRef, useState } from 'react';

export interface RunEvent {
  type: 'run_started' | 'test_started' | 'test_result' | 'run_completed';
  payload: Record<string, unknown>;
}

interface Options {
  runId: string;
  enabled: boolean;
}

export function useWebSocket({ runId, enabled }: Options) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    function connect() {
      const port = window.location.port;
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retriesRef.current = 0;
        ws.send(JSON.stringify({ type: 'subscribe', runId }));
      };

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data as string) as RunEvent;
          setEvents((prev) => [...prev, event]);
        } catch {
          // ignore malformed
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (retriesRef.current < 3) {
          retriesRef.current++;
          setTimeout(connect, 1500);
        }
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      retriesRef.current = 99; // prevent reconnect on unmount
      wsRef.current?.close();
    };
  }, [runId, enabled]);

  return { events, connected };
}
