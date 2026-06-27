# QAcito — Architecture

> **Core principle:** Claude decides, QAcito executes. The server never interprets results or chooses what to test.

## System overview

```mermaid
flowchart TB
    subgraph USER["👤 Developer"]
        CD["Claude Desktop / Claude Code"]
    end

    subgraph QACITO["🧪 QAcito MCP Server"]
        direction TB
        MCP["MCP Transport\n(stdio · HTTP :4712)"]

        subgraph TOOLS["Tool Slices"]
            direction LR
            T1["analyze-project\ndetect-stack\ndiscover-routes"]
            T2["start-test-run\nrun-tests\nrun-tests-n-times"]
            T3["get-run-status\nget-test-history\ngenerate-report"]
            T4["setup-auth\ncheck-accessibility\ncheck-environment"]
            T5["read-files · write-file\nget-changed-files\nget-impacted-specs"]
        end

        RS["Run Store\n(in-memory → ~/.qacito/*.jsonl)"]
        SB["Sandbox\nresolveSafe()"]
        DS["Dashboard Server\nExpress :dynamic + WebSocket"]
    end

    subgraph RUNTIME["⚙️ Runtime"]
        PW["Playwright"]
        FS["Filesystem"]
    end

    subgraph UI["🖥️ Dashboard"]
        BR["Browser SPA\nHome · Plan · Run"]
    end

    subgraph CI["🤖 Batch / CI"]
        BA["Batch Orchestrator\n@anthropic-ai/sdk"]
    end

    CD -- "MCP protocol" --> MCP
    MCP --> TOOLS
    TOOLS --> SB
    SB --> FS
    T2 -- "spawn" --> PW
    T2 -- "write run state" --> RS
    T3 -- "read run state" --> RS
    RS -- "WS broadcast" --> DS
    DS -- "HTTP + WS" --> BR
    BA -- "direct SDK calls\n(no MCP client)" --> CD

    classDef server fill:#1e293b,stroke:#334155,color:#f8fafc
    classDef tool fill:#0f172a,stroke:#1e40af,color:#93c5fd
    classDef runtime fill:#14532d,stroke:#166534,color:#86efac
    classDef ui fill:#4a1d96,stroke:#6d28d9,color:#ddd6fe
    classDef user fill:#7c2d12,stroke:#9a3412,color:#fed7aa

    class QACITO,MCP,RS,SB,DS server
    class T1,T2,T3,T4,T5 tool
    class PW,FS runtime
    class BR,UI ui
    class CD,USER user
```

## Async run flow

The most non-obvious behavior: `start_test_run` returns immediately with a `runId`. Playwright runs in the background. Claude polls with `get_run_status` while the Dashboard receives live updates via WebSocket push.

```mermaid
sequenceDiagram
    actor Claude
    participant MCP as MCP Transport
    participant Store as Run Store
    participant PW as Playwright
    participant WS as WebSocket
    participant Dashboard

    Claude->>MCP: start_test_run(spec, projectRoot)
    MCP->>Store: createRun(runId) → status: pending
    MCP-->>Claude: { runId }

    Store->>PW: spawn(spec) [background]
    activate PW

    Claude->>MCP: get_run_status(runId)
    MCP->>Store: getRun(runId)
    Store-->>Claude: { status: "running", … }

    PW-->>Store: test_result events (title, status, durationMs)
    Store->>WS: broadcast(test_result)
    WS->>Dashboard: live update

    PW-->>Store: run_completed (passed/failed, history, regressions)
    deactivate PW
    Store->>WS: broadcast(run_completed)
    WS->>Dashboard: final state

    Claude->>MCP: get_run_status(runId)
    MCP->>Store: getRun(runId)
    Store-->>Claude: { status: "completed", tests: […], regressions: […] }

    Claude->>MCP: generate_report(runId, outputDir)
    MCP-->>Claude: { markdownPath, summary }
```

## Key constraints

- `console.log` → stderr at startup. Any stdout write corrupts the stdio JSON-RPC wire.
- All paths go through `resolveSafe(root, p)` before touching the filesystem or spawning processes.
- Run store mutations are synchronous (no `await` inside read-modify-write cycles) — Node.js single-thread guarantee.
- `runId` is valid only for the lifetime of the server process.
