/**
 * Git helpers for reading graph data from git refs.
 */

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import type { FlowGraph } from '../../graph/types.js';

const execFileAsync = promisify(execFile);

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
 * Uses non-blocking `execFile` so git commands (especially `git fetch`)
 * don't block the Node.js event loop. Resolves the ref to a remote tracking
 * branch when possible.
 *
 * @param baseRef - Git ref (branch name, commit hash, or tag)
 * @param graphPath - Relative path to graph.json from repo root
 * @returns Parsed FlowGraph
 * @throws If graph.json doesn't exist at that ref or contains invalid JSON
 */
export async function loadGraphAtRef(baseRef: string, graphPath: string): Promise<FlowGraph> {
  try {
    const gitRef = await resolveGitRef(baseRef);
    const { stdout } = await execFileAsync('git', ['show', `${gitRef}:${graphPath}`], {
      encoding: 'utf8',
    });
    return JSON.parse(stdout);
  } catch {
    throw new Error(
      `No graph.json found at ${baseRef}:${graphPath}. ` +
        'Ensure graph.json is committed on the base branch (run "treck sync" and commit).',
    );
  }
}

/**
 * Resolve a bare branch name to its remote tracking ref.
 *
 * Fetches from origin and prefers `origin/<ref>` when available.
 *
 * @param baseRef - Git ref to resolve
 * @returns The resolved git ref string
 */
async function resolveGitRef(baseRef: string): Promise<string> {
  let gitRef = baseRef;
  if (!baseRef.includes('/') && !/^[0-9a-f]{6,}$/i.test(baseRef)) {
    try {
      await execFileAsync('git', ['fetch', 'origin', baseRef]);
    } catch {
      // Offline or remote unavailable — use whatever is cached locally
    }
    try {
      await execFileAsync('git', ['rev-parse', '--verify', `origin/${baseRef}`]);
      gitRef = `origin/${baseRef}`;
    } catch {
      // Remote ref doesn't exist, use the ref as-is (local branch or tag)
    }
  }
  return gitRef;
}
