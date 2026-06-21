import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { register as registerRunsHistory } from '../resources/runs-history/index.js';
import { register as registerRunDetail }   from '../resources/run-detail/index.js';
import { register as registerProjectInfo } from '../resources/project-info/index.js';

type RegisterFn = (server: McpServer) => void;

const slices: Array<{ name: string; register: RegisterFn }> = [
  { name: 'runs-history', register: registerRunsHistory },
  { name: 'run-detail',   register: registerRunDetail },
  { name: 'project-info', register: registerProjectInfo },
];

export function registerResources(server: McpServer): void {
  for (const slice of slices) {
    try {
      slice.register(server);
      process.stderr.write(`[register-resources] ✓ ${slice.name} registered\n`);
    } catch (err: unknown) {
      process.stderr.write(
        `[register-resources] ✗ Failed to register "${slice.name}": ` +
          `${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
  process.stderr.write(`[register-resources] ${slices.length} resource slice(s) processed.\n`);
}
