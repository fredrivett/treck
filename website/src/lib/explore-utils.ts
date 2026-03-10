/**
 * Shared utilities for the explore-any-repo feature.
 *
 * Used by both the API route (server-side validation) and the frontend
 * search bar (client-side validation).
 */

/** Maximum number of source files to parse. */
export const FILE_COUNT_LIMIT = 5000;

/** Maximum repo size in KB (200 MB) — checked via GitHub API before cloning. */
export const REPO_SIZE_LIMIT_KB = 200_000;

/** Graphs younger than this are served without any staleness check. */
export const STALE_AFTER_MS = 86_400_000; // 24 hours

/** Redis TTL — entries are evicted after this regardless of staleness checks. */
export const CACHE_TTL_SECONDS = 2_592_000; // 30 days

/** Default include/exclude patterns for unknown repos. */
export const DEFAULT_INCLUDE = [
  'src/**/*.{ts,tsx,js,jsx}',
  'app/**/*.{ts,tsx,js,jsx}',
  'lib/**/*.{ts,tsx,js,jsx}',
  'packages/**/*.{ts,tsx,js,jsx}',
  'components/**/*.{ts,tsx,js,jsx}',
  'pages/**/*.{ts,tsx,js,jsx}',
  'server/**/*.{ts,tsx,js,jsx}',
  'api/**/*.{ts,tsx,js,jsx}',
];

/** Default exclude patterns — tests, generated code, etc. */
export const DEFAULT_EXCLUDE = [
  '**/*.test.{ts,tsx,js,jsx}',
  '**/*.spec.{ts,tsx,js,jsx}',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/e2e/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/*.d.ts',
];

/**
 * Parse and validate a GitHub URL, returning owner and repo if valid.
 *
 * Only accepts `https://github.com/{owner}/{repo}` (with optional `.git`
 * suffix and trailing slash). Rejects SSH URLs, URLs with extra path
 * segments, and non-GitHub hosts.
 *
 * @param input - The raw URL string from user input
 * @returns Parsed `{ owner, repo }` or `null` if invalid
 */
export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.hostname !== 'github.com') return null;

  // pathname is like /owner/repo or /owner/repo.git or /owner/repo/
  const segments = url.pathname
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean);

  if (segments.length !== 2) return null;

  const [owner, repo] = segments;

  // Validate characters — only allow alphanumeric, hyphens, underscores, dots
  const validPattern = /^[a-zA-Z0-9._-]+$/;
  if (!validPattern.test(owner) || !validPattern.test(repo)) return null;

  return { owner, repo };
}
