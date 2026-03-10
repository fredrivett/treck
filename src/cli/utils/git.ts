/**
 * Git helpers for reading graph data from git refs.
 */

import { execFileSync } from 'node:child_process';
import type { FlowGraph } from '../../graph/types.js';

/**
 * Get the current git branch name.
 *
 * Uses `git rev-parse --abbrev-ref HEAD` to determine the current branch.
 *
 * @returns The current branch name, or undefined if not in a git repo or in detached HEAD state
 */
export function getCurrentBranch(): string | undefined {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    return branch === 'HEAD' ? undefined : branch;
  } catch {
    return undefined;
  }
}

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
    // Prefer the remote tracking branch so diffs reflect upstream, not a stale local branch.
    // Only prefix bare branch names — skip if it already contains '/' or looks like a commit hash.
    let gitRef = baseRef;
    if (!baseRef.includes('/') && !/^[0-9a-f]{6,}$/i.test(baseRef)) {
      // Fetch latest from remote so the diff is up to date (silently ignore failures for offline use)
      try {
        execFileSync('git', ['fetch', 'origin', baseRef], { stdio: 'ignore' });
      } catch {
        // Offline or remote unavailable — use whatever is cached locally
      }
      try {
        execFileSync('git', ['rev-parse', '--verify', `origin/${baseRef}`], { stdio: 'ignore' });
        gitRef = `origin/${baseRef}`;
      } catch {
        // Remote ref doesn't exist, use the ref as-is (local branch or tag)
      }
    }
    const raw = execFileSync('git', ['show', `${gitRef}:${graphPath}`], {
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
