/**
 * Central tool registration.
 *
 * Each slice exports a `register(server)` function that wires its handler
 * and inputSchema into the MCP McpServer instance. This file is the single
 * place that knows about all slices — no other module should import slices
 * directly (unless it's the slice itself).
 *
 * Slices are imported lazily-ish via static imports but each registration call
 * is wrapped in a try/catch: if one slice fails to initialise (e.g. missing
 * native dep), the server still starts with the remaining tools.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// --- Slice imports -----------------------------------------------------------
// Uncomment each line as the corresponding phase is implemented.
import { register as registerReadFiles }   from '../tools/read-files/index.js';
import { register as registerWriteFile }   from '../tools/write-file/index.js';
import { register as registerDetectStack } from '../tools/detect-stack/index.js';
import { register as registerRunTests }    from '../tools/run-tests/index.js';
import { register as registerApiTemplates }       from '../tools/api-templates/index.js';
import { register as registerGetChangedFiles }      from '../tools/get-changed-files/index.js';
import { register as registerGetTestHistory }        from '../tools/get-test-history/index.js';
import { register as registerUpdateVisualBaselines } from '../tools/update-visual-baselines/index.js';
import { register as registerAnalyzeProject }        from '../tools/analyze-project/index.js';
import { register as registerGenerateReport }        from '../tools/generate-report/index.js';
import { register as registerStartTestRun }          from '../tools/start-test-run/index.js';
import { register as registerGetRunStatus }          from '../tools/get-run-status/index.js';
import { register as registerGetCoverage }           from '../tools/get-coverage/index.js';
import { register as registerGetImpactedSpecs }      from '../tools/get-impacted-specs/index.js';
import { register as registerRunTestsNTimes }        from '../tools/run-tests-n-times/index.js';
import { register as registerGenerateFromOpenApi }   from '../tools/generate-from-openapi/index.js';
import { register as registerCheckAccessibility }    from '../tools/check-accessibility/index.js';
import { register as registerCheckEnvironment }      from '../tools/check-environment/index.js';
import { register as registerDiscoverRoutes }        from '../tools/discover-routes/index.js';
import { register as registerSetupAuth }             from '../tools/setup-auth/index.js';
import { register as registerDualEvaluate }          from '../tools/dual-evaluate/index.js';

type RegisterFn = (server: McpServer) => void;

const slices: Array<{ name: string; register: RegisterFn }> = [
  { name: 'read_files',      register: registerReadFiles },
  { name: 'write_file',      register: registerWriteFile },
  { name: 'detect_stack',    register: registerDetectStack },
  { name: 'run_tests',       register: registerRunTests },
  { name: 'get_api_template',       register: registerApiTemplates },
  { name: 'get_changed_files',       register: registerGetChangedFiles },
  { name: 'get_test_history',        register: registerGetTestHistory },
  { name: 'update_visual_baselines', register: registerUpdateVisualBaselines },
  { name: 'analyze_project',         register: registerAnalyzeProject },
  { name: 'generate_report',         register: registerGenerateReport },
  { name: 'start_test_run',          register: registerStartTestRun },
  { name: 'get_run_status',          register: registerGetRunStatus },
  { name: 'get_coverage',            register: registerGetCoverage },
  { name: 'get_impacted_specs',      register: registerGetImpactedSpecs },
  { name: 'run_tests_n_times',       register: registerRunTestsNTimes },
  { name: 'generate_from_openapi',   register: registerGenerateFromOpenApi },
  { name: 'check_accessibility',     register: registerCheckAccessibility },
  { name: 'check_environment',       register: registerCheckEnvironment },
  { name: 'discover_routes',         register: registerDiscoverRoutes },
  { name: 'setup_auth',              register: registerSetupAuth },
  { name: 'dual_evaluate',           register: registerDualEvaluate },
];

/**
 * Registers every known tool slice into `server`.
 * A slice that throws during registration is skipped and logged to stderr.
 */
export function registerTools(server: McpServer): void {
  for (const slice of slices) {
    try {
      slice.register(server);
      process.stderr.write(`[register-tools] ✓ ${slice.name} registered\n`);
    } catch (err: unknown) {
      process.stderr.write(
        `[register-tools] ✗ Failed to register "${slice.name}": ` +
          `${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  process.stderr.write(
    `[register-tools] ${slices.length} slice(s) processed.\n`,
  );
}
