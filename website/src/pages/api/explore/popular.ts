/**
 * GET /api/explore/popular
 *
 * Returns the most-viewed explored repos in the last ~24 hours.
 * Reads today's and yesterday's daily sorted sets and merges them
 * client-side to avoid ZUNIONSTORE compatibility issues.
 */

import { Redis } from '@upstash/redis';
import type { APIRoute } from 'astro';

export const prerender = false;

/** Maximum number of popular repos to return. */
const TOP_N = 10;

/**
 * Get an Upstash Redis client, or null if env vars are not set.
 *
 * @returns Redis client or null
 */
function getRedis(): Redis | null {
  const url = import.meta.env.UPSTASH_REDIS_REST_URL;
  const token = import.meta.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/** Shape of a popular repo entry returned by this endpoint. */
interface PopularRepo {
  repo: string;
  views: number;
}

export const GET: APIRoute = async () => {
  const redis = getRedis();
  if (!redis) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    // Read both days' sorted sets with scores
    const [todayData, yesterdayData] = await Promise.all([
      redis.zrange<string[]>(`explore:views:${today}`, 0, -1, { withScores: true }),
      redis.zrange<string[]>(`explore:views:${yesterday}`, 0, -1, { withScores: true }),
    ]);

    // Merge scores: zrange with withScores returns [member, score, member, score, ...]
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

    // Sort by views descending, take top N
    const popular: PopularRepo[] = [...merged.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N)
      .map(([repo, views]) => ({ repo, views }));

    return new Response(JSON.stringify(popular), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
