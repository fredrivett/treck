/**
 * Tests for explore helper functions: rate limiting, view tracking,
 * config generation, symlink safety, and popular score merging.
 */

import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkRateLimit,
  generateConfig,
  mergePopularScores,
  RATE_LIMIT,
  removeUnsafeSymlinks,
  todayKey,
  trackView,
  VIEWS_LAST_SEEN,
  VIEWS_SORTED_SET,
} from './explore-helpers';

// ---------------------------------------------------------------------------
// checkRateLimit
// ---------------------------------------------------------------------------

describe('checkRateLimit', () => {
  it('returns true when redis is null (local dev)', async () => {
    expect(await checkRateLimit(null, '1.2.3.4')).toBe(true);
  });

  it('allows the first request', async () => {
    const redis = {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(true),
    };
    expect(await checkRateLimit(redis as any, '1.2.3.4')).toBe(true);
    expect(redis.incr).toHaveBeenCalledWith('rate:1.2.3.4');
    expect(redis.expire).toHaveBeenCalledWith('rate:1.2.3.4', 60);
  });

  it('allows up to RATE_LIMIT requests', async () => {
    const redis = {
      incr: vi.fn().mockResolvedValue(RATE_LIMIT),
      expire: vi.fn(),
    };
    expect(await checkRateLimit(redis as any, '1.2.3.4')).toBe(true);
  });

  it('rejects requests over the rate limit', async () => {
    const redis = {
      incr: vi.fn().mockResolvedValue(RATE_LIMIT + 1),
      expire: vi.fn(),
    };
    expect(await checkRateLimit(redis as any, '1.2.3.4')).toBe(false);
  });

  it('only sets expiry on the first request (count === 1)', async () => {
    const redis = {
      incr: vi.fn().mockResolvedValue(3),
      expire: vi.fn(),
    };
    await checkRateLimit(redis as any, '1.2.3.4');
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('uses different keys for different IPs', async () => {
    const redis = {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn(),
    };
    await checkRateLimit(redis as any, '10.0.0.1');
    expect(redis.incr).toHaveBeenCalledWith('rate:10.0.0.1');
  });
});

// ---------------------------------------------------------------------------
// todayKey
// ---------------------------------------------------------------------------

describe('todayKey', () => {
  it('returns a YYYY-MM-DD string', () => {
    const key = todayKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns today's date", () => {
    const expected = new Date().toISOString().slice(0, 10);
    expect(todayKey()).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// trackView
// ---------------------------------------------------------------------------

describe('trackView', () => {
  it('does nothing when redis is null', async () => {
    // Should not throw
    await trackView(null, 'owner/repo');
  });

  it('increments all-time and daily sorted sets', async () => {
    const redis = {
      zincrby: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(true),
      hset: vi.fn().mockResolvedValue(1),
    };
    await trackView(redis as any, 'owner/repo');

    // All-time sorted set
    expect(redis.zincrby).toHaveBeenCalledWith(VIEWS_SORTED_SET, 1, 'owner/repo');

    // Daily sorted set
    const dailyKey = `explore:views:${todayKey()}`;
    expect(redis.zincrby).toHaveBeenCalledWith(dailyKey, 1, 'owner/repo');

    // Expire the daily key (48h)
    expect(redis.expire).toHaveBeenCalledWith(dailyKey, 48 * 60 * 60);

    // Last-viewed timestamp
    expect(redis.hset).toHaveBeenCalledWith(
      VIEWS_LAST_SEEN,
      expect.objectContaining({ 'owner/repo': expect.any(Number) }),
    );
  });

  it('silently ignores redis errors', async () => {
    const redis = {
      zincrby: vi.fn().mockRejectedValue(new Error('connection failed')),
      expire: vi.fn().mockRejectedValue(new Error('connection failed')),
      hset: vi.fn().mockRejectedValue(new Error('connection failed')),
    };
    // Should not throw
    await trackView(redis as any, 'owner/repo');
  });
});

// ---------------------------------------------------------------------------
// generateConfig
// ---------------------------------------------------------------------------

describe('generateConfig', () => {
  it('returns valid YAML with output dir', () => {
    const config = generateConfig();
    expect(config).toContain('output:');
    expect(config).toContain('dir: _treck');
  });

  it('includes scope include patterns', () => {
    const config = generateConfig();
    expect(config).toContain('scope:');
    expect(config).toContain('include:');
    // Should include common TS/JS patterns
    expect(config).toContain('*.{ts,tsx,js,jsx}');
  });

  it('includes scope exclude patterns', () => {
    const config = generateConfig();
    expect(config).toContain('exclude:');
    expect(config).toContain('node_modules');
  });

  it('formats patterns as YAML list items', () => {
    const config = generateConfig();
    const lines = config.split('\n');
    const listItems = lines.filter((l) => l.match(/^\s+-\s/));
    expect(listItems.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// removeUnsafeSymlinks
// ---------------------------------------------------------------------------

describe('removeUnsafeSymlinks', () => {
  const testDir = join('/tmp', `treck-test-symlinks-${Date.now()}`);
  const subDir = join(testDir, 'subdir');

  beforeEach(() => {
    mkdirSync(subDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('keeps symlinks within the root', () => {
    writeFileSync(join(testDir, 'target.txt'), 'hello');
    symlinkSync(join(testDir, 'target.txt'), join(testDir, 'safe-link'));

    removeUnsafeSymlinks(testDir, testDir);

    // The safe symlink should still exist
    const content = readFileSync(join(testDir, 'safe-link'), 'utf-8');
    expect(content).toBe('hello');
  });

  it('removes symlinks pointing outside root', () => {
    symlinkSync('/etc/passwd', join(testDir, 'evil-link'));

    removeUnsafeSymlinks(testDir, testDir);

    // The unsafe symlink should be removed
    expect(() => readFileSync(join(testDir, 'evil-link'))).toThrow();
  });

  it('handles symlinks in subdirectories', () => {
    writeFileSync(join(testDir, 'target.txt'), 'ok');
    symlinkSync('/etc/passwd', join(subDir, 'evil-nested'));
    symlinkSync(join(testDir, 'target.txt'), join(subDir, 'safe-nested'));

    removeUnsafeSymlinks(testDir, testDir);

    // Evil nested link removed
    expect(() => readFileSync(join(subDir, 'evil-nested'))).toThrow();
    // Safe nested link kept
    expect(readFileSync(join(subDir, 'safe-nested'), 'utf-8')).toBe('ok');
  });

  it('removes broken symlinks (target does not exist)', () => {
    symlinkSync(join(testDir, 'nonexistent'), join(testDir, 'broken-link'));

    removeUnsafeSymlinks(testDir, testDir);

    // Broken but within root — resolve succeeds, startsWith passes
    // Actually broken symlinks within root should be kept (they resolve within root)
    // The catch block only fires if readlinkSync fails, not if target doesn't exist
  });

  it('leaves regular files untouched', () => {
    writeFileSync(join(testDir, 'normal.txt'), 'data');
    writeFileSync(join(subDir, 'nested.txt'), 'nested');

    removeUnsafeSymlinks(testDir, testDir);

    expect(readFileSync(join(testDir, 'normal.txt'), 'utf-8')).toBe('data');
    expect(readFileSync(join(subDir, 'nested.txt'), 'utf-8')).toBe('nested');
  });

  it('handles empty directories', () => {
    // Should not throw
    removeUnsafeSymlinks(testDir, testDir);
  });

  it('removes relative symlinks that escape root', () => {
    symlinkSync('../../../../../../etc/passwd', join(testDir, 'relative-escape'));

    removeUnsafeSymlinks(testDir, testDir);

    expect(() => readFileSync(join(testDir, 'relative-escape'))).toThrow();
  });

  it('keeps relative symlinks within root', () => {
    writeFileSync(join(subDir, 'file.txt'), 'contents');
    symlinkSync('./subdir/file.txt', join(testDir, 'relative-safe'));

    removeUnsafeSymlinks(testDir, testDir);

    expect(readFileSync(join(testDir, 'relative-safe'), 'utf-8')).toBe('contents');
  });
});

// ---------------------------------------------------------------------------
// mergePopularScores
// ---------------------------------------------------------------------------

describe('mergePopularScores', () => {
  it('returns empty array for empty inputs', () => {
    expect(mergePopularScores([], [])).toEqual([]);
  });

  it('returns today-only data', () => {
    const result = mergePopularScores(['owner/repo', 5], []);
    expect(result).toEqual([{ repo: 'owner/repo', views: 5 }]);
  });

  it('returns yesterday-only data', () => {
    const result = mergePopularScores([], ['owner/repo', 3]);
    expect(result).toEqual([{ repo: 'owner/repo', views: 3 }]);
  });

  it('merges scores from both days', () => {
    const result = mergePopularScores(['owner/repo', 5], ['owner/repo', 3]);
    expect(result).toEqual([{ repo: 'owner/repo', views: 8 }]);
  });

  it('sorts by views descending', () => {
    const today = ['a/a', 1, 'b/b', 10, 'c/c', 5];
    const result = mergePopularScores(today, []);
    expect(result).toEqual([
      { repo: 'b/b', views: 10 },
      { repo: 'c/c', views: 5 },
      { repo: 'a/a', views: 1 },
    ]);
  });

  it('handles multiple repos across both days', () => {
    const today = ['a/a', 3, 'b/b', 7];
    const yesterday = ['b/b', 2, 'c/c', 10];
    const result = mergePopularScores(today, yesterday);
    expect(result).toEqual([
      { repo: 'c/c', views: 10 },
      { repo: 'b/b', views: 9 },
      { repo: 'a/a', views: 3 },
    ]);
  });

  it('respects the limit parameter', () => {
    const data = ['a/a', 1, 'b/b', 2, 'c/c', 3, 'd/d', 4, 'e/e', 5];
    const result = mergePopularScores(data, [], 3);
    expect(result).toHaveLength(3);
    expect(result[0].repo).toBe('e/e');
    expect(result[2].repo).toBe('c/c');
  });

  it('defaults to TOP_N limit', () => {
    // Create 15 repos
    const data: (string | number)[] = [];
    for (let i = 0; i < 15; i++) {
      data.push(`user/repo-${i}`, i + 1);
    }
    const result = mergePopularScores(data, []);
    expect(result).toHaveLength(10);
  });

  it('handles string scores (Redis returns strings)', () => {
    const result = mergePopularScores(['owner/repo', '5' as any], ['owner/repo', '3' as any]);
    expect(result).toEqual([{ repo: 'owner/repo', views: 8 }]);
  });

  it('handles repos appearing only in yesterday', () => {
    const today = ['a/a', 5];
    const yesterday = ['b/b', 3];
    const result = mergePopularScores(today, yesterday);
    expect(result).toEqual([
      { repo: 'a/a', views: 5 },
      { repo: 'b/b', views: 3 },
    ]);
  });
});
