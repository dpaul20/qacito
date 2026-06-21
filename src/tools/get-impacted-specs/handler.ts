import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { resolveSafe } from '../../shared/sandbox.js';
import type { GetImpactedSpecsInput, GetImpactedSpecsOutput, SpecImpact } from './schema.js';

const DEFAULT_SPEC_EXTENSIONS = ['.spec.ts', '.spec.js', '.test.ts', '.test.js'];

// Matches: import ... from './foo', require('./foo'), import('./foo')
const RE_IMPORT = /(?:import\s+[^'"]*\s+from|require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"]/g;

async function collectSpecs(dir: string, extensions: string[]): Promise<string[]> {
  const specs: string[] = [];
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return specs;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      specs.push(...await collectSpecs(full, extensions));
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      specs.push(full);
    }
  }
  return specs;
}

function extractImports(source: string, specDir: string): string[] {
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  RE_IMPORT.lastIndex = 0;
  while ((match = RE_IMPORT.exec(source)) !== null) {
    const raw = match[1] ?? match[2] ?? '';
    if (!raw || raw.startsWith('.') === false) continue; // skip bare specifiers (node_modules)
    // Resolve the import path relative to the spec file's directory.
    const resolved = path.resolve(specDir, raw);
    imports.push(resolved);
  }
  return imports;
}

/**
 * Given a list of changed files, returns which spec files import (directly)
 * any of those files. Analysis is static — no runtime or transitive resolution.
 */
export async function getImpactedSpecsHandler(
  sandboxRoot: string,
  input: GetImpactedSpecsInput,
): Promise<GetImpactedSpecsOutput> {
  const projectRoot = resolveSafe(sandboxRoot, input.projectRoot);
  const specsDir    = resolveSafe(projectRoot, input.specsDir ?? 'tests');
  const extensions  = input.extensions ?? DEFAULT_SPEC_EXTENSIONS;

  // Normalise changed files to absolute paths (without extension, for flexible matching).
  const changedAbs = input.changedFiles.map((f) =>
    path.isAbsolute(f) ? f : path.resolve(projectRoot, f),
  );
  const changedNoExt = changedAbs.map((f) => f.replace(/\.[^/.]+$/, ''));

  const specs   = await collectSpecs(specsDir, extensions);
  const impacts: SpecImpact[] = [];

  await Promise.all(
    specs.map(async (specPath) => {
      let source: string;
      try {
        source = await fs.readFile(specPath, 'utf-8');
      } catch {
        return;
      }

      const imports = extractImports(source, path.dirname(specPath));

      const matchedFiles = changedAbs.filter((changed) =>
        imports.some((imp) => {
          const impNoExt = imp.replace(/\.[^/.]+$/, '');
          return (
            imp === changed ||
            impNoExt === changed ||
            imp === changedNoExt[changedAbs.indexOf(changed)] ||
            impNoExt === changedNoExt[changedAbs.indexOf(changed)]
          );
        }),
      );

      if (matchedFiles.length > 0) {
        impacts.push({
          spec:         path.relative(projectRoot, specPath),
          matchedFiles: matchedFiles.map((f) => path.relative(projectRoot, f)),
        });
      }
    }),
  );

  const impactedSpecs   = impacts.map((i) => i.spec);
  const impactedSet     = new Set(impactedSpecs);
  const unimpactedSpecs = specs
    .map((s) => path.relative(projectRoot, s))
    .filter((s) => !impactedSet.has(s));

  return {
    impactedSpecs,
    unimpactedSpecs,
    analysis: impacts,
    totalSpecsScanned: specs.length,
    note: 'Analysis is based on direct static imports only — transitive dependencies are not followed. ' +
          'Specs that exercise changed code via runtime (dynamic requires, DI, etc.) may not appear here.',
  };
}
