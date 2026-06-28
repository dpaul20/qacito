import { listRuns } from '../../dashboard-server/run-store.js';
import { TOOL_COUNT } from '../../shared/registry-meta.js';

export interface QacitoHomeMeta {
  toolCount: number;
  projectRoot: string | null;
}

export async function qacitoHomeHandler(): Promise<QacitoHomeMeta> {
  const runs = listRuns(1);
  const latest = runs[0];
  return { toolCount: TOOL_COUNT, projectRoot: latest?.projectRoot ?? null };
}
