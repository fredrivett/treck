/**
 * Git helpers for reading graph data from git refs.
 */

import { execFileSync } from 'node:child_process';
import type { FlowGraph } from '../../graph/types.js';

/**
 * Detect the default branch of the remote origin.
 *
 * Uses `git symbolic-ref refs/remotes/origin/HEAD` to find the remote's
 * default branch name (e.g. "main" or "master").
 *
 * @returns The default branch name (without refs/remotes/origin/ prefix)
 * @throws If the symbolic ref cannot be resolved — suggests using `--base`
 */
export function detectBaseRef(): string {
  try {
    const ref = execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      encoding: 'utf8',
    }).trim();
    return ref.replace('refs/remotes/origin/', '');
  } catch {
    throw new Error('Could not detect base branch. Use --base to specify.');
  }
}

/**
 * Load and parse graph.json from a specific git ref.
 *
 * Uses `git show <ref>:<path>` to read the file contents at that commit
 * without checking out the branch.
 *
 * @param baseRef - Git ref (branch name, commit hash, or tag)
 * @param graphPath - Relative path to graph.json from repo root
 * @returns Parsed FlowGraph
 * @throws If graph.json doesn't exist at that ref or contains invalid JSON
 */
export function loadGraphAtRef(baseRef: string, graphPath: string): FlowGraph {
  try {
    const raw = execFileSync('git', ['show', `${baseRef}:${graphPath}`], {
      encoding: 'utf8',
    });
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `No graph.json found at ${baseRef}:${graphPath}. ` +
        'Ensure graph.json is committed on the base branch (run "treck sync" and commit).',
    );
  }
}
