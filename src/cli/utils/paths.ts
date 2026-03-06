/**
 * Path resolution utilities for working across git worktrees.
 *
 * When treck runs in a git worktree (e.g. via Conductor), source file paths
 * stored in doc frontmatter may point to the main worktree. These utilities
 * resolve those paths to work in any worktree.
 */

import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/**
 * Resolve a source file path from doc frontmatter to an absolute path
 * in the current working directory. Used when reading source files.
 */
export function resolveSourcePath(filePath: string, cwd = process.cwd()): string {
  // Relative paths resolve against cwd
  if (!isAbsolute(filePath)) {
    return resolve(cwd, filePath);
  }

  // If the absolute path exists, use it directly
  if (existsSync(filePath)) {
    return filePath;
  }

  // Try to resolve against cwd by extracting the relative source path
  const parts = filePath.split('/');
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(i).join('/');
    if (candidate.startsWith('src/') || candidate.startsWith('lib/')) {
      const resolved = resolve(cwd, candidate);
      if (existsSync(resolved)) {
        return resolved;
      }
    }
  }

  // Fallback to the original path
  return filePath;
}
