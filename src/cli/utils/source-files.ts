/**
 * Source file discovery utilities.
 *
 * Finds project source files matching include/exclude glob patterns.
 * Prefers `git ls-files` for automatic gitignore exclusion, with a manual
 * directory walk fallback for non-git repositories.
 */

import { execFile, execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import picomatch from 'picomatch';
import type { TreckConfig } from './config.js';

/**
 * Find all source files matching the scope's include/exclude patterns.
 *
 * Prefers `git ls-files` so gitignored files (e.g. generated code) are
 * automatically excluded. Falls back to a manual directory walk when not
 * inside a git repository.
 *
 * @param rootDir - Root directory to search from
 * @param scope - Include and exclude glob patterns
 */
export function findSourceFiles(rootDir: string, scope: TreckConfig['scope']): string[] {
  const isIncluded = picomatch(scope.include);
  const isExcluded = picomatch(scope.exclude);

  const gitFiles = gitTrackedFilesSync(rootDir);
  if (gitFiles) {
    return gitFiles
      .filter((rel) => isIncluded(rel) && !isExcluded(rel))
      .map((rel) => join(rootDir, rel));
  }

  // Fallback: manual walk when not in a git repo
  const files: string[] = [];

  const walk = (dir: string) => {
    const items = readdirSync(dir);

    for (const item of items) {
      if (item === '.git' || item === 'node_modules') continue;
      const fullPath = join(dir, item);
      const s = statSync(fullPath);

      if (s.isDirectory()) {
        walk(fullPath);
      } else if (s.isFile()) {
        const rel = relative(rootDir, fullPath);
        if (isIncluded(rel) && !isExcluded(rel)) {
          files.push(fullPath);
        }
      }
    }
  };

  walk(rootDir);
  return files;
}

/**
 * Async version of {@link findSourceFiles} that yields to the event loop
 * between I/O operations so spinner animations stay smooth.
 *
 * Prefers `git ls-files` so gitignored files are automatically excluded.
 * Falls back to a manual directory walk when not inside a git repository.
 */
export async function findSourceFilesAsync(
  rootDir: string,
  scope: TreckConfig['scope'],
): Promise<string[]> {
  const isIncluded = picomatch(scope.include);
  const isExcluded = picomatch(scope.exclude);

  const gitFiles = await gitTrackedFilesAsync(rootDir);
  if (gitFiles) {
    return gitFiles
      .filter((rel) => isIncluded(rel) && !isExcluded(rel))
      .map((rel) => join(rootDir, rel));
  }

  // Fallback: manual walk when not in a git repo
  const files: string[] = [];

  const walk = async (dir: string) => {
    const items = await readdir(dir);

    for (const item of items) {
      if (item === '.git' || item === 'node_modules') continue;
      const fullPath = join(dir, item);
      const s = await stat(fullPath);

      if (s.isDirectory()) {
        await walk(fullPath);
      } else if (s.isFile()) {
        const rel = relative(rootDir, fullPath);
        if (isIncluded(rel) && !isExcluded(rel)) {
          files.push(fullPath);
        }
      }
    }
  };

  await walk(rootDir);
  return files;
}

/** Convert an absolute path to a path relative to the current working directory. */
export function getRelativePath(absolutePath: string): string {
  const cwd = process.cwd();
  return absolutePath.startsWith(cwd) ? absolutePath.substring(cwd.length + 1) : absolutePath;
}

/**
 * Count how many times each source file is imported by other files.
 *
 * Parses import/export statements from all source files, resolves relative
 * specifiers, and tallies import counts per file. Used to rank documentation
 * priority (most-imported files first).
 *
 * @param sourceFiles - List of absolute source file paths
 * @returns Map of relative file path to import count
 */
export function countImports(sourceFiles: string[]): Map<string, number> {
  const importCounts = new Map<string, number>();
  const importPattern = /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g;

  for (const file of sourceFiles) {
    try {
      const content = readFileSync(file, 'utf-8');
      for (const match of content.matchAll(importPattern)) {
        const specifier = match[1];

        if (!specifier.startsWith('.')) continue;

        const dir = dirname(file);
        const resolved = resolveImport(dir, specifier, sourceFiles);
        if (resolved) {
          const rel = getRelativePath(resolved);
          importCounts.set(rel, (importCounts.get(rel) || 0) + 1);
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return importCounts;
}

/**
 * List files known to git (tracked + untracked-but-not-ignored).
 *
 * Returns relative paths. Returns `null` if not inside a git repository.
 */
function gitTrackedFilesSync(rootDir: string): string[] | null {
  try {
    const stdout = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: rootDir,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Async version of {@link gitTrackedFilesSync}.
 */
function gitTrackedFilesAsync(rootDir: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd: rootDir, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(stdout.split('\n').filter(Boolean));
      },
    );
  });
}

/**
 * Resolve a relative import specifier to an absolute file path.
 *
 * Tries the exact path, then common extensions (`.ts`, `.tsx`, `.js`, `.jsx`),
 * then `index.*` variants. Only resolves to files in the `sourceFiles` list.
 */
function resolveImport(fromDir: string, specifier: string, sourceFiles: string[]): string | null {
  const base = resolve(fromDir, specifier);

  if (sourceFiles.includes(base)) return base;

  const stripped = base.replace(/\.[jt]sx?$/, '');

  const extensions = ['.ts', '.tsx', '.js', '.jsx'];
  for (const ext of extensions) {
    if (sourceFiles.includes(stripped + ext)) return stripped + ext;
  }

  for (const ext of extensions) {
    const indexPath = join(base, `index${ext}`);
    if (sourceFiles.includes(indexPath)) return indexPath;
  }
  for (const ext of extensions) {
    const indexPath = join(stripped, `index${ext}`);
    if (sourceFiles.includes(indexPath)) return indexPath;
  }

  return null;
}
