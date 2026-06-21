import { readHistory, type HistoryFilter, type HistoryEntry, DEFAULT_HISTORY_FILE } from '../../shared/history.js';
import type { GetTestHistoryInput } from './schema.js';

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface GetTestHistoryOutput {
  entries: HistoryEntry[];
  totalEntries: number;
  historyFile: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Reads the history file and returns filtered entries.
 *
 * @param input            Validated filter input.
 * @param historyFilePath  Optional override path for testability.
 */
export async function getTestHistoryHandler(
  input: GetTestHistoryInput,
  historyFilePath?: string,
): Promise<GetTestHistoryOutput> {
  const filter: HistoryFilter = {};
  if (input.projectRoot !== undefined) filter.projectRoot = input.projectRoot;
  if (input.specPath !== undefined) filter.specPath = input.specPath;
  if (input.limit !== undefined) filter.limit = input.limit;

  const resolvedHistoryFile = historyFilePath ?? DEFAULT_HISTORY_FILE;
  const entries = await readHistory(filter, resolvedHistoryFile);
  return { entries, totalEntries: entries.length, historyFile: resolvedHistoryFile };
}
