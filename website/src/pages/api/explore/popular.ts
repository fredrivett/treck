/**
 * GET /api/explore/popular
 *
 * Returns the most-viewed explored repos in the last ~24 hours.
 * Reads today's and yesterday's daily sorted sets and merges them.
 */

import { Redis } from '@upstash/redis';
import type { APIRoute } from 'astro';
import { mergePopularScores } from '../../../lib/explore-helpers';

export const prerender = false;

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

    const popular = mergePopularScores(todayData, yesterdayData);

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
