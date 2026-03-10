/**
 * POST /api/explore
 *
 * Accepts a GitHub repo URL, clones it, runs treck sync, and returns the
 * dependency graph JSON. Results are cached in Upstash Redis with a 30-day
 * TTL and 24-hour staleness window.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { Redis } from '@upstash/redis';
import type { APIRoute } from 'astro';
import {
  CACHE_TTL_SECONDS,
  DEFAULT_EXCLUDE,
  DEFAULT_INCLUDE,
  FILE_COUNT_LIMIT,
  parseGitHubUrl,
  REPO_SIZE_LIMIT_KB,
  STALE_AFTER_MS,
} from '../../lib/explore-utils';

export const prerender = false;

/** Rate limit: max requests per IP within the window. */
const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 60;

/** Shape of cached data in Redis. */
interface CachedGraph {
  graph: unknown;
  commitSha: string;
  cachedAt: number;
}

/**
 * Get an Upstash Redis client, or null if env vars are not set (local dev).
 *
 * @returns Redis client or null
 */
function getRedis(): Redis | null {
  const url = import.meta.env.UPSTASH_REDIS_REST_URL;
  const token = import.meta.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/**
 * Check and increment rate limit for an IP address.
 *
 * @returns true if the request is allowed, false if rate-limited
 */
async function checkRateLimit(redis: Redis | null, ip: string): Promise<boolean> {
  if (!redis) return true; // skip in local dev
  const key = `rate:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_WINDOW_SECONDS);
  }
  return count <= RATE_LIMIT;
}

/**
 * Fetch the latest commit SHA for a repo's default branch.
 *
 * @returns The commit SHA string
 */
async function getLatestCommitSha(owner: string, repo: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`, {
    headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'treck-explore' },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const commits = (await res.json()) as Array<{ sha: string }>;
  return commits[0].sha;
}

/**
 * Check repo size via GitHub API.
 *
 * @returns Size in KB
 * @throws If the repo doesn't exist or is private
 */
async function getRepoSizeKb(owner: string, repo: string): Promise<number> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'treck-explore' },
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Repository not found or is private');
    throw new Error(`GitHub API error: ${res.status}`);
  }
  const data = (await res.json()) as { size: number };
  return data.size;
}

/**
 * Generate a treck config YAML string for the default scope.
 *
 * @returns YAML config content
 */
function generateConfig(): string {
  const includeYaml = DEFAULT_INCLUDE.map((p) => `    - ${p}`).join('\n');
  const excludeYaml = DEFAULT_EXCLUDE.map((p) => `    - ${p}`).join('\n');

  return `output:
  dir: _treck

scope:
  include:
${includeYaml}

  exclude:
${excludeYaml}
`;
}

/**
 * Recursively remove symlinks that point outside the given root directory.
 *
 * Symlinks within the repo are kept (they're legitimate). Symlinks pointing
 * outside could be used for data exfiltration.
 *
 * @param dir - Directory to scan
 * @param root - The clone root — symlinks must resolve within this
 */
function removeUnsafeSymlinks(dir: string, root: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      try {
        const linkTarget = readlinkSync(fullPath, 'utf-8');
        const resolved = resolve(dir, linkTarget);
        if (!resolved.startsWith(root)) {
          rmSync(fullPath);
        }
      } catch {
        // If we can't resolve it, remove it to be safe
        rmSync(fullPath);
      }
    } else if (entry.isDirectory()) {
      removeUnsafeSymlinks(fullPath, root);
    }
  }
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const redis = getRedis();

  try {
    // 1. Parse request body
    const body = (await request.json()) as { url?: string };
    if (!body.url) {
      return new Response(JSON.stringify({ error: 'Missing url field' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Validate GitHub URL
    const parsed = parseGitHubUrl(body.url);
    if (!parsed) {
      return new Response(
        JSON.stringify({ error: 'Invalid GitHub URL. Use https://github.com/owner/repo' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    const { owner, repo } = parsed;
    const cacheKey = `graph:${owner}/${repo}`;

    // 3. Rate limit
    const ip = clientAddress || 'unknown';
    if (!(await checkRateLimit(redis, ip))) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // 4. Cache check
    if (redis) {
      const cached = await redis.get<CachedGraph>(cacheKey);
      if (cached) {
        const age = Date.now() - cached.cachedAt;
        if (age < STALE_AFTER_MS) {
          // Fresh — return immediately
          return new Response(JSON.stringify(cached.graph), {
            headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
          });
        }
        // Stale — check if repo has new commits
        try {
          const latestSha = await getLatestCommitSha(owner, repo);
          if (latestSha === cached.commitSha) {
            // Same commit — extend freshness and return cached
            await redis.set(
              cacheKey,
              { ...cached, cachedAt: Date.now() },
              { ex: CACHE_TTL_SECONDS },
            );
            return new Response(JSON.stringify(cached.graph), {
              headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
            });
          }
          // Different commit — fall through to rebuild
        } catch {
          // GitHub API error — return stale cache rather than failing
          return new Response(JSON.stringify(cached.graph), {
            headers: { 'Content-Type': 'application/json', 'X-Cache': 'STALE' },
          });
        }
      }
    }

    // 5. Check repo size
    const sizeKb = await getRepoSizeKb(owner, repo);
    if (sizeKb > REPO_SIZE_LIMIT_KB) {
      return new Response(
        JSON.stringify({
          error: `Repository is too large (${Math.round(sizeKb / 1024)}MB). Maximum is 200MB.`,
        }),
        { status: 413, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 6. Clone repo
    const cloneUrl = `https://github.com/${owner}/${repo}.git`;
    const cloneDir = `/tmp/treck-explore/${owner}-${repo}-${Date.now()}`;
    mkdirSync(cloneDir, { recursive: true });

    try {
      try {
        execFileSync(
          'git',
          [
            'clone',
            '--depth',
            '1',
            '--single-branch',
            '--no-tags',
            '--no-recurse-submodules',
            cloneUrl,
            cloneDir,
          ],
          {
            timeout: 30_000,
            env: {
              ...process.env,
              GIT_CONFIG_NOSYSTEM: '1',
              GIT_ATTR_NOSYSTEM: '1',
              GIT_TERMINAL_PROMPT: '0',
              GIT_LFS_SKIP_SMUDGE: '1',
            },
          },
        );
      } catch {
        return new Response(
          JSON.stringify({ error: 'Failed to clone repository. Ensure it exists and is public.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // 7. Symlink safety
      removeUnsafeSymlinks(cloneDir, cloneDir);

      // 8. Write treck config
      const configDir = join(cloneDir, '_treck');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'config.yaml'), generateConfig());

      // 9. Run treck sync
      const treckBin = resolve(import.meta.dirname, '..', '..', '..', '..', 'dist', 'index.mjs');
      try {
        execFileSync('node', [treckBin, 'sync'], {
          cwd: cloneDir,
          timeout: 45_000,
          maxBuffer: 50 * 1024 * 1024, // 50 MB
        });
      } catch {
        return new Response(JSON.stringify({ error: 'Failed to build dependency graph.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 10. Read graph
      const graphFile = join(configDir, 'graph.json');
      if (!existsSync(graphFile)) {
        return new Response(
          JSON.stringify({
            error: 'No graph was generated. The repo may not contain TypeScript/JavaScript files.',
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      const graph = JSON.parse(readFileSync(graphFile, 'utf-8'));

      // Check file count
      if (graph.nodes && graph.nodes.length > FILE_COUNT_LIMIT) {
        return new Response(
          JSON.stringify({
            error: `Graph has too many nodes (${graph.nodes.length}). Maximum is ${FILE_COUNT_LIMIT}.`,
          }),
          { status: 413, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // 11. Get commit SHA for caching
      let commitSha = '';
      try {
        commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: cloneDir,
          encoding: 'utf-8',
        }).trim();
      } catch {
        // Non-critical — cache will just revalidate every time
      }

      // 12. Cache result
      if (redis) {
        const cacheEntry: CachedGraph = { graph, commitSha, cachedAt: Date.now() };
        await redis.set(cacheKey, cacheEntry, { ex: CACHE_TTL_SECONDS });
      }

      return new Response(JSON.stringify(graph), {
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
      });
    } finally {
      // Always clean up the clone directory
      rmSync(cloneDir, { recursive: true, force: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
