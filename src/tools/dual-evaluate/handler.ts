import type { DualEvaluateInput, DualEvaluateOutput } from './schema.js';

const QA_TOOLS = [
  'analyze_project',
  'run_tests',
  'get_coverage',
  'get_test_history',
  'detect_stack',
  'read_files',
  'get_changed_files',
  'get_impacted_specs',
  'check_accessibility',
].join(', ');

export async function dualEvaluateHandler(input: DualEvaluateInput): Promise<DualEvaluateOutput> {
  const contextLine = input.context
    ? `\n**Project/Context:** ${input.context}`
    : '';

  const plan = `## Dual QA Evaluation

**Task:** ${input.task}${contextLine}

---

You are the QA orchestrator. Execute the two independent evaluations below in sequence, then reconcile. Do NOT let Agent A's findings influence Agent B's evaluation.

---

### Agent A — Constructive Evaluator

**Lens:** Optimistic. Look for what works, what passes, what is solid and reliable.
**Task:** ${input.task}
**Available tools:** ${QA_TOOLS}

Run the relevant tools, analyze the results, and produce a verdict:
- **pass** — the area under evaluation is working correctly
- **fail** — there are real problems that need fixing
- **inconclusive** — insufficient data to determine

End with: \`AGENT A VERDICT: [pass|fail|inconclusive]\` followed by your reasoning.

---

### Agent B — Adversarial Evaluator

**Lens:** Skeptical. Look for gaps, edge cases, regressions, and anything that could fail.
**Task:** ${input.task}
**Available tools:** ${QA_TOOLS}

Start fresh — do not consider Agent A's findings. Run the relevant tools independently and produce a verdict using the same format.

End with: \`AGENT B VERDICT: [pass|fail|inconclusive]\` followed by your reasoning.

---

### Reconciliation

After both agents have produced their verdicts:

- **If they agree** → report the shared verdict with **high confidence**.
- **If they disagree** → synthesize a final verdict with **medium confidence** and document what each agent found and why they reached different conclusions.

Final report:
\`\`\`
VERDICT: pass | fail | inconclusive
CONFIDENCE: high | medium
AGENT A: [one-line summary]
AGENT B: [one-line summary]
DISSENT: [if disagreed — what each found and why; omit if agreed]
\`\`\`
`;

  return { plan };
}
