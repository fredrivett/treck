/**
 * Shared helpers for the explore feature. Extracted from API routes
 * for testability.
 */

import { readdirSync, readlinkSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Redis } from '@upstash/redis';
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE } from './explore-utils';

/** Rate limit: max requests per IP within the window. */
export const RATE_LIMIT = 5;

/** Rate limit window in seconds. */
export const RATE_WINDOW_SECONDS = 60;

/** Redis key for all-time view counts. */
export const VIEWS_SORTED_SET = 'explore:views';

/** Redis key for last-viewed timestamps. */
export const VIEWS_LAST_SEEN = 'explore:lastViewedAt';

/** Maximum number of popular repos to return. */
export const TOP_N = 10;

/**
 * Check and increment rate limit for an IP address.
 *
 * @param redis - Redis client (or null to skip rate limiting)
 * @param ip - Client IP address
 * @returns true if the request is allowed, false if rate-limited
 */
export async function checkRateLimit(redis: Redis | null, ip: string): Promise<boolean> {
  if (!redis) return true;
  const key = `rate:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_WINDOW_SECONDS);
  }
  return count <= RATE_LIMIT;
}

/**
 * Get today's date as YYYY-MM-DD for the daily views key.
 *
 * @returns Date string in YYYY-MM-DD format
 */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record a view for a repo. Increments the count in both an all-time
 * sorted set and a daily sorted set (with 48h TTL). Also updates the
 * last-viewed timestamp. Non-blocking — errors are silently ignored.
 *
 * @param redis - Redis client (or null in local dev without Redis)
 * @param repoSlug - The `owner/repo` key
 */
export async function trackView(redis: Redis | null, repoSlug: string): Promise<void> {
  if (!redis) return;
  try {
    const dailyKey = `explore:views:${todayKey()}`;
    await Promise.all([
      redis.zincrby(VIEWS_SORTED_SET, 1, repoSlug),
      redis.zincrby(dailyKey, 1, repoSlug),
      redis.expire(dailyKey, 48 * 60 * 60),
      redis.hset(VIEWS_LAST_SEEN, { [repoSlug]: Date.now() }),
    ]);
  } catch {
    // Non-critical — never block the response
  }
}

/**
 * Generate a treck config YAML string for the default scope.
 *
 * @returns YAML config content
 */
export function generateConfig(): string {
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
export function removeUnsafeSymlinks(dir: string, root: string): void {
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

/** Shape of a popular repo entry. */
export interface PopularRepo {
  repo: string;
  views: number;
}

/**
 * Merge two daily view data arrays into a ranked list of popular repos.
 *
 * Each input array follows the Redis ZRANGE WITHSCORES format:
 * `[member, score, member, score, ...]`
 *
 * @param todayData - Today's view data from Redis
 * @param yesterdayData - Yesterday's view data from Redis
 * @param limit - Maximum number of results
 * @returns Sorted array of popular repos (descending by views)
 */
export function mergePopularScores(
  todayData: (string | number)[],
  yesterdayData: (string | number)[],
  limit: number = TOP_N,
): PopularRepo[] {
  const merged = new Map<string, number>();
  for (let i = 0; i < todayData.length; i += 2) {
    const repo = String(todayData[i]);
    const score = Number(todayData[i + 1]);
    merged.set(repo, (merged.get(repo) ?? 0) + score);
  }
  for (let i = 0; i < yesterdayData.length; i += 2) {
    const repo = String(yesterdayData[i]);
    const score = Number(yesterdayData[i + 1]);
    merged.set(repo, (merged.get(repo) ?? 0) + score);
  }

  return [...merged.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([repo, views]) => ({ repo, views }));
}
