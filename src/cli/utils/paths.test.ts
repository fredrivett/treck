import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSourcePath } from './paths.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));

describe('resolveSourcePath', () => {
  const cwd = '/Users/dev/project';

  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
  });

  it('should resolve relative paths against cwd', () => {
    expect(resolveSourcePath('src/index.ts', cwd)).toBe('/Users/dev/project/src/index.ts');
  });

  it('should return absolute path if it exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    expect(resolveSourcePath('/Users/dev/other/src/index.ts', cwd)).toBe(
      '/Users/dev/other/src/index.ts',
    );
  });

  it('should resolve worktree absolute path to cwd when file exists locally', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      // The original absolute path doesn't exist
      if (path === '/Users/dev/other-worktree/src/generator/index.ts') return false;
      // But the resolved local path does
      if (path === '/Users/dev/project/src/generator/index.ts') return true;
      return false;
    });

    expect(resolveSourcePath('/Users/dev/other-worktree/src/generator/index.ts', cwd)).toBe(
      '/Users/dev/project/src/generator/index.ts',
    );
  });

  it('should resolve worktree absolute path with lib/ prefix', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path === '/Users/dev/other-worktree/lib/utils.ts') return false;
      if (path === '/Users/dev/project/lib/utils.ts') return true;
      return false;
    });

    expect(resolveSourcePath('/Users/dev/other-worktree/lib/utils.ts', cwd)).toBe(
      '/Users/dev/project/lib/utils.ts',
    );
  });

  it('should fallback to original path when nothing resolves', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(resolveSourcePath('/nonexistent/path/file.ts', cwd)).toBe('/nonexistent/path/file.ts');
  });
});
