import { describe, expect, it } from 'vitest';
import { parseGitHubUrl } from './explore-utils';

describe('parseGitHubUrl', () => {
  it('parses a standard GitHub URL', () => {
    expect(parseGitHubUrl('https://github.com/vercel/next.js')).toEqual({
      owner: 'vercel',
      repo: 'next.js',
    });
  });

  it('parses a URL with .git suffix', () => {
    expect(parseGitHubUrl('https://github.com/vercel/next.js.git')).toEqual({
      owner: 'vercel',
      repo: 'next.js',
    });
  });

  it('parses a URL with trailing slash', () => {
    expect(parseGitHubUrl('https://github.com/vercel/next.js/')).toEqual({
      owner: 'vercel',
      repo: 'next.js',
    });
  });

  it('handles leading and trailing whitespace', () => {
    expect(parseGitHubUrl('  https://github.com/owner/repo  ')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('accepts hyphens, underscores, and dots in owner/repo', () => {
    expect(parseGitHubUrl('https://github.com/my-org/my_repo.js')).toEqual({
      owner: 'my-org',
      repo: 'my_repo.js',
    });
  });

  it('rejects non-GitHub hosts', () => {
    expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
  });

  it('rejects SSH URLs', () => {
    expect(parseGitHubUrl('git@github.com:owner/repo.git')).toBeNull();
  });

  it('rejects HTTP (non-HTTPS)', () => {
    expect(parseGitHubUrl('http://github.com/owner/repo')).toBeNull();
  });

  it('rejects URLs with extra path segments', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo/tree/main')).toBeNull();
  });

  it('rejects URLs with only owner (no repo)', () => {
    expect(parseGitHubUrl('https://github.com/owner')).toBeNull();
  });

  it('rejects empty string', () => {
    expect(parseGitHubUrl('')).toBeNull();
  });

  it('rejects whitespace-only string', () => {
    expect(parseGitHubUrl('   ')).toBeNull();
  });

  it('rejects invalid URLs', () => {
    expect(parseGitHubUrl('not-a-url')).toBeNull();
  });

  it('normalises path traversal (URL constructor resolves ..)', () => {
    // The URL constructor normalises `/../etc/passwd` to `/etc/passwd`,
    // so this is parsed as owner=etc, repo=passwd. This is safe because
    // we reconstruct the clone URL from the parsed owner/repo.
    expect(parseGitHubUrl('https://github.com/../etc/passwd')).toEqual({
      owner: 'etc',
      repo: 'passwd',
    });
  });

  it('rejects URLs with special characters in repo name', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo;rm -rf /')).toBeNull();
  });

  it('rejects github.com subdomain spoofing', () => {
    expect(parseGitHubUrl('https://github.com.evil.com/owner/repo')).toBeNull();
  });

  it('rejects URLs with userinfo (user@)', () => {
    expect(parseGitHubUrl('https://github.com@evil.com/owner/repo')).toBeNull();
  });
});
