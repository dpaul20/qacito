import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  timestamp: string;
  specPath: string;
  projectRoot: string;
  status: 'passed' | 'failed' | 'timeout' | 'error' | 'blocked';
  durationMs: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
}

export interface HistoryFilter {
  projectRoot?: string;
  specPath?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_HISTORY_FILE = path.join(os.homedir(), '.qacito', 'history.jsonl');

// ---------------------------------------------------------------------------
// appendHistory
// ---------------------------------------------------------------------------

/**
 * Appends a single `HistoryEntry` as a JSON line to the history file.
 *
 * - Creates the parent directory (and any ancestors) if they do not exist.
 * - Uses `fs.appendFile` so concurrent writes from multiple sessions are safe
 *   at the OS level (each call is one atomic write syscall on POSIX).
 * - Propagates I/O errors — caller is responsible for wrapping in try/catch.
 *
 * @param entry            The history entry to persist.
 * @param historyFilePath  Override the default file path (useful in tests).
 */
export async function appendHistory(
  entry: HistoryEntry,
  historyFilePath: string = DEFAULT_HISTORY_FILE,
): Promise<void> {
  await fs.mkdir(path.dirname(historyFilePath), { recursive: true });
  await fs.appendFile(historyFilePath, JSON.stringify(entry) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// readHistory
// ---------------------------------------------------------------------------

/**
 * Reads the history JSONL file, applies optional filters, and returns the
 * matching entries.
 *
 * - Returns `[]` when the file does not exist (`ENOENT`).
 * - Skips blank lines and lines that cannot be parsed as JSON, logging a
 *   warning to stderr for each malformed line.
 * - `projectRoot` and `specPath` filters are substring matches.
 * - `limit` takes the last N entries from the filtered results (most recent).
 * - Propagates non-ENOENT I/O errors.
 *
 * @param filter           Optional filter criteria.
 * @param historyFilePath  Override the default file path (useful in tests).
 */
export async function readHistory(
  filter: HistoryFilter = {},
  historyFilePath: string = DEFAULT_HISTORY_FILE,
): Promise<HistoryEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(historyFilePath, 'utf-8');
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') return [];
    throw err;
  }

  const entries: HistoryEntry[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      process.stderr.write(`[history] skipping malformed line: ${trimmed}\n`);
      continue;
    }

    entries.push(parsed as HistoryEntry);
  }

  let filtered = entries;

  if (filter.projectRoot !== undefined) {
    filtered = filtered.filter((e) => e.projectRoot.includes(filter.projectRoot!));
  }

  if (filter.specPath !== undefined) {
    filtered = filtered.filter((e) => e.specPath.includes(filter.specPath!));
  }

  if (filter.limit !== undefined && filter.limit > 0) {
    filtered = filtered.slice(-filter.limit);
  }

  return filtered;
}
