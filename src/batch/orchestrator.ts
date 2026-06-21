/**
 * BatchOrchestrator
 *
 * Uses the Anthropic SDK to drive a complete agentic loop:
 *   detect_stack → read_files → get_api_template → write_file → run_tests
 *
 * Tool calls are dispatched DIRECTLY to handler functions — no MCP stdio
 * server is involved in batch mode.
 *
 * Partial failures (one spec fails) do NOT abort the suite; the run
 * continues and failed specs are recorded in the final report.
 */

import Anthropic from '@anthropic-ai/sdk';

// Direct handler imports — batch mode calls handlers without the MCP server.
import { readFilesHandler }   from '../tools/read-files/handler.js';
import { detectStackHandler } from '../tools/detect-stack/handler.js';
import { writeFileHandler }   from '../tools/write-file/handler.js';
import { runTestsHandler }    from '../tools/run-tests/handler.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BatchRunResult {
  specs_generated: number;
  tests_total:     number;
  tests_passed:    number;
  tests_failed:    number;
  duration_ms:     number;
  timestamp:       string;
  /**
   * Per-spec details (optional, used for richer reporting).
   */
  specs: SpecResult[];
}

export interface SpecResult {
  path:   string;
  status: 'passed' | 'failed' | 'error' | 'unknown';
  total:  number;
  passed: number;
  failed: number;
}

export interface BatchOrchestratorOptions {
  apiKey:        string;
  projectPath:   string;
  maxRetries:    number;
  maxIterations: number;
}

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema for the Anthropic API)
// These mirror the Zod schemas defined in each slice's schema.ts.
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'read_files',
    description: 'Read one or more files from the project. Returns content or per-file errors.',
    input_schema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Array of file paths to read (relative to project root or absolute).',
        },
      },
      required: ['paths'],
    },
  },
  {
    name: 'detect_stack',
    description:
      'Analyse a project directory and return its framework, detected routes, package manager, and test script.',
    input_schema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute or sandbox-relative path to the project root.',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file. Creates parent directories if needed.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Destination file path.' },
        content: { type: 'string', description: 'File content to write (must not be empty).' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'run_tests',
    description:
      'Execute a Playwright spec file and return a structured test report (status, summary, failures).',
    input_schema: {
      type: 'object',
      properties: {
        scriptPath: { type: 'string', description: 'Path to the Playwright spec file to run.' },
        timeoutMs:  { type: 'number', description: 'Timeout in ms (default: 120000).' },
        maxRetries: { type: 'number', description: 'Max retry attempts (default: 3).' },
      },
      required: ['scriptPath'],
    },
  },
];

// ---------------------------------------------------------------------------
// Handler dispatch
// ---------------------------------------------------------------------------

/**
 * Maps tool names to their handler functions.
 * All handlers receive the sandbox root (projectPath) as first argument.
 */
async function dispatchTool(
  toolName: string,
  toolInput: unknown,
  projectPath: string,
): Promise<unknown> {
  const input = toolInput as Record<string, unknown>;

  switch (toolName) {
    case 'read_files': {
      const paths = input['paths'] as string[];
      return readFilesHandler(projectPath, { paths });
    }

    case 'detect_stack': {
      const projectPathArg = (input['projectPath'] as string | undefined) ?? projectPath;
      return detectStackHandler(projectPath, { projectPath: projectPathArg });
    }

    case 'write_file': {
      const filePath = input['path'] as string;
      const content  = input['content'] as string;
      return writeFileHandler(projectPath, { path: filePath, content });
    }

    case 'run_tests': {
      const scriptPath = input['scriptPath'] as string;
      const timeoutMs  = (input['timeoutMs']  as number | undefined) ?? 120_000;
      const maxRetries = (input['maxRetries'] as number | undefined) ?? 3;
      return runTestsHandler(projectPath, { scriptPath, timeoutMs, maxRetries });
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ---------------------------------------------------------------------------
// BatchOrchestrator
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full QA cycle via the Anthropic API.
 *
 * Architecture:
 *  - One agentic loop: Claude drives the entire cycle via tool calls.
 *  - Tool calls are dispatched directly to handlers (no MCP server).
 *  - The loop continues until stop_reason === 'end_turn' OR maxIterations.
 *  - After the loop, the orchestrator collects results from the conversation
 *    history (run_tests tool results) and builds the BatchRunResult.
 */
export class BatchOrchestrator {
  private readonly client: Anthropic;
  private readonly opts: BatchOrchestratorOptions;

  constructor(opts: BatchOrchestratorOptions) {
    this.opts = opts;
    this.client = new Anthropic({ apiKey: opts.apiKey });
  }

  async run(): Promise<BatchRunResult> {
    const startMs = Date.now();

    process.stderr.write('[orchestrator] Initialising Anthropic client…\n');

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: this.buildInitialPrompt(),
      },
    ];

    // Collect run_tests results for the final report.
    const specResults: SpecResult[] = [];

    let iterations = 0;

    // -----------------------------------------------------------------------
    // Agentic loop
    // -----------------------------------------------------------------------
    loop: while (iterations < this.opts.maxIterations) {
      iterations++;

      process.stderr.write(
        `[orchestrator] Iteration ${iterations}/${this.opts.maxIterations} — calling Claude…\n`,
      );

      const response = await this.client.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        tools:      TOOL_DEFINITIONS,
        messages,
      });

      process.stderr.write(
        `[orchestrator] stop_reason=${response.stop_reason} ` +
          `content_blocks=${response.content.length}\n`,
      );

      // Append assistant turn to history.
      messages.push({ role: 'assistant', content: response.content });

      // Handle stop reason.
      switch (response.stop_reason) {
        case 'end_turn':
          process.stderr.write('[orchestrator] Claude finished (end_turn).\n');
          break loop;

        case 'tool_use':
          // Execute all tool calls in this turn, then continue.
          {
            const toolResults = await this.executeToolCalls(
              response.content,
              specResults,
            );
            messages.push({ role: 'user', content: toolResults });
          }
          break;

        case 'max_tokens':
          process.stderr.write(
            '[orchestrator] Warning: hit max_tokens limit — continuing loop.\n',
          );
          // Add a continuation nudge.
          messages.push({
            role: 'user',
            content: 'Continue from where you left off.',
          });
          break;

        default:
          process.stderr.write(
            `[orchestrator] Unexpected stop_reason: ${response.stop_reason} — stopping loop.\n`,
          );
          break loop;
      }
    }

    if (iterations >= this.opts.maxIterations) {
      process.stderr.write(
        `[orchestrator] Reached max iterations (${this.opts.maxIterations}), stopping.\n`,
      );
    }

    // -----------------------------------------------------------------------
    // Build report from collected spec results
    // -----------------------------------------------------------------------
    const totalPassed = specResults.reduce((acc, s) => acc + s.passed, 0);
    const totalFailed = specResults.reduce((acc, s) => acc + s.failed, 0);
    const totalTests  = specResults.reduce((acc, s) => acc + s.total,  0);

    return {
      specs_generated: specResults.length,
      tests_total:     totalTests,
      tests_passed:    totalPassed,
      tests_failed:    totalFailed,
      duration_ms:     Date.now() - startMs,
      timestamp:       new Date().toISOString(),
      specs:           specResults,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildInitialPrompt(): string {
    return (
      `Analyse the project at ${this.opts.projectPath}, ` +
      `generate and run Playwright API tests for all detected endpoints.\n\n` +
      `Follow this workflow:\n` +
      `1. Call detect_stack to understand the project framework and routes.\n` +
      `2. Use read_files to inspect relevant source files (package.json, route files, etc.).\n` +
      `3. For each detected API route, write a Playwright spec using write_file ` +
      `   (save specs under ${this.opts.projectPath}/tests/).\n` +
      `4. Run each spec with run_tests.\n` +
      `5. If a spec fails and can_retry is true, rewrite the spec and run again.\n` +
      `6. When all specs have been executed, respond with a brief summary.\n\n` +
      `Important:\n` +
      `- A single spec failure must NOT stop you from running the remaining specs.\n` +
      `- Use the request fixture for API tests (not browser UI selectors).\n` +
      `- Keep specs concise and focused on happy-path HTTP status codes.\n`
    );
  }

  /**
   * Executes all tool_use blocks in a content array.
   * run_tests results are captured into specResults.
   * Partial failures (one tool throws) are recorded as error tool_results — they
   * do not abort the entire batch.
   */
  private async executeToolCalls(
    contentBlocks: Anthropic.ContentBlock[],
    specResults:   SpecResult[],
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const toolUseBlocks = contentBlocks.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      process.stderr.write(
        `[orchestrator] → tool call: ${block.name} (id=${block.id})\n`,
      );

      let resultContent: string;
      let isError = false;

      try {
        const output = await dispatchTool(block.name, block.input, this.opts.projectPath);

        resultContent = JSON.stringify(output);

        // Capture run_tests results for the final report.
        if (block.name === 'run_tests') {
          this.captureTestResult(block.input, output, specResults);
        }

        process.stderr.write(
          `[orchestrator] ← ${block.name} OK (${resultContent.length} chars)\n`,
        );
      } catch (err: unknown) {
        isError       = true;
        resultContent = JSON.stringify({
          error:   err instanceof Error ? err.constructor.name : 'Error',
          message: err instanceof Error ? err.message : String(err),
        });

        process.stderr.write(
          `[orchestrator] ← ${block.name} ERROR: ${
            err instanceof Error ? err.message : String(err)
          }\n`,
        );
      }

      toolResults.push({
        type:        'tool_result',
        tool_use_id: block.id,
        content:     resultContent,
        is_error:    isError,
      });
    }

    return toolResults;
  }

  /**
   * Extracts relevant fields from a run_tests result and appends to specResults.
   */
  private captureTestResult(
    input:       unknown,
    output:      unknown,
    specResults: SpecResult[],
  ): void {
    try {
      const inp = input  as Record<string, unknown>;
      const out = output as Record<string, unknown>;

      const scriptPath = (inp['scriptPath'] as string | undefined) ?? 'unknown';
      const status     = (out['status']     as string | undefined) ?? 'unknown';
      const summary    = (out['summary']    as Record<string, number> | undefined) ?? {};

      specResults.push({
        path:   scriptPath,
        status: (status === 'passed' || status === 'failed' || status === 'error')
          ? status
          : 'unknown',
        total:  summary['total']  ?? 0,
        passed: summary['passed'] ?? 0,
        failed: summary['failed'] ?? 0,
      });
    } catch {
      // Best-effort; if parsing fails, skip this entry.
    }
  }
}
