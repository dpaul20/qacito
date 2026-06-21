import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { register as registerQaFullSuite }      from '../prompts/qa-full-suite/index.js';
import { register as registerQaOnChange }       from '../prompts/qa-on-change/index.js';
import { register as registerQaFixFailures }    from '../prompts/qa-fix-failures/index.js';
import { register as registerQaAudit }          from '../prompts/qa-audit/index.js';
import { register as registerQaBlackBoxSuite }  from '../prompts/qa-black-box-suite/index.js';
import { register as registerQaFromDesign }     from '../prompts/qa-from-design/index.js';

type RegisterFn = (server: McpServer) => void;

const slices: Array<{ name: string; register: RegisterFn }> = [
  { name: 'qa:full-suite',       register: registerQaFullSuite },
  { name: 'qa:on-change',        register: registerQaOnChange },
  { name: 'qa:fix-failures',     register: registerQaFixFailures },
  { name: 'qa:audit',            register: registerQaAudit },
  { name: 'qa:black-box-suite',  register: registerQaBlackBoxSuite },
  { name: 'qa:from-design',      register: registerQaFromDesign },
];

export function registerPrompts(server: McpServer): void {
  for (const slice of slices) {
    try {
      slice.register(server);
      process.stderr.write(`[register-prompts] ✓ ${slice.name} registered\n`);
    } catch (err: unknown) {
      process.stderr.write(
        `[register-prompts] ✗ Failed to register "${slice.name}": ` +
          `${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
  process.stderr.write(`[register-prompts] ${slices.length} prompt slice(s) processed.\n`);
}
