import path from 'node:path';

/**
 * Error thrown when a resolved path falls outside the allowed root directory.
 * This prevents path traversal attacks (e.g. "../../etc/passwd").
 */
export class PathOutOfBoundsError extends Error {
  readonly code = 'PathOutOfBounds';

  constructor(requestedPath: string, root: string) {
    super(
      `Path "${requestedPath}" resolves outside the sandbox root "${root}". ` +
        'Access denied.',
    );
    this.name = 'PathOutOfBoundsError';
  }
}

/**
 * Resolves `p` against `root` and asserts the result stays under `root`.
 *
 * - If `p` is absolute it is used directly; if relative it is resolved from `root`.
 * - Both paths are normalised with `path.resolve` so `..` segments are collapsed
 *   before the prefix check, making traversal impossible.
 *
 * @param root  Absolute path to the sandbox root (project directory).
 * @param p     Relative or absolute path supplied by the caller.
 * @returns     The resolved absolute path, guaranteed to be inside `root`.
 * @throws      {@link PathOutOfBoundsError} when the resolved path escapes `root`.
 */
export function resolveSafe(root: string, p: string): string {
  const resolvedRoot = path.resolve(root);
  // When p is absolute, path.resolve returns it unchanged;
  // when relative, it is joined against resolvedRoot.
  const resolvedTarget = path.isAbsolute(p)
    ? path.resolve(p)
    : path.resolve(resolvedRoot, p);

  // Ensure the target is the root itself or strictly nested under it.
  // We append path.sep to root so that a directory named e.g. "/app-extra"
  // is not considered inside "/app".
  const normalizedRoot = resolvedRoot.endsWith(path.sep)
    ? resolvedRoot
    : resolvedRoot + path.sep;

  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(normalizedRoot)
  ) {
    throw new PathOutOfBoundsError(p, resolvedRoot);
  }

  return resolvedTarget;
}
