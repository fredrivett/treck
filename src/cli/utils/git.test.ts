/**
 * Tests for git helper utilities
 */

import { execFile, execFileSync } from 'node:child_process';
import { describe, expect, it, type Mock, vi } from 'vitest';
import { detectBaseRef, getCurrentBranch, loadGraphAtRef } from './git.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  execFile: vi.fn(),
}));

const mockExecFileSync = execFileSync as Mock;
const mockExecFile = execFile as unknown as Mock;

/**
 * Configure the execFile mock to simulate async git commands.
 *
 * @param handler - Maps (cmd, args) to a result string, or throws to simulate failure
 */
function mockExecFileAsync(handler: (cmd: string, args: string[]) => string) {
  mockExecFile.mockImplementation(
    (cmd: string, args: string[], ...rest: unknown[]) => {
      const callback = rest.find((a) => typeof a === 'function') as
        | ((err: Error | null, result?: { stdout: string; stderr: string }) => void)
        | undefined;
      try {
        const result = handler(cmd, args);
        callback?.(null, { stdout: result, stderr: '' });
      } catch (err) {
        callback?.(err as Error);
      }
    },
  );
}

describe('getCurrentBranch', () => {
  it('returns the current branch name', () => {
    mockExecFileSync.mockReturnValue('main\n');

    expect(getCurrentBranch()).toBe('main');
    expect(mockExecFileSync).toHaveBeenCalledWith('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    });
  });

  it('returns undefined in detached HEAD state', () => {
    mockExecFileSync.mockReturnValue('HEAD\n');

    expect(getCurrentBranch()).toBeUndefined();
  });

  it('returns undefined when not in a git repo', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not a git repository');
    });

    expect(getCurrentBranch()).toBeUndefined();
  });
});

describe('detectBaseRef', () => {
  it('returns the branch name when symbolic-ref exists', () => {
    mockExecFileSync.mockReturnValue('refs/remotes/origin/main\n');

    const result = detectBaseRef();

    expect(result).toBe('main');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['symbolic-ref', 'refs/remotes/origin/HEAD'],
      { encoding: 'utf8' },
    );
  });

  it('handles non-main default branches', () => {
    mockExecFileSync.mockReturnValue('refs/remotes/origin/master\n');

    expect(detectBaseRef()).toBe('master');
  });

  it('throws with helpful message on failure', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('git error');
    });

    expect(() => detectBaseRef()).toThrow('Could not detect base branch. Use --base to specify.');
  });
});

describe('loadGraphAtRef', () => {
  it('uses origin/ prefix when remote ref exists', async () => {
    const graph = {
      version: '1.0',
      generatedAt: '2026-03-01T00:00:00Z',
      nodes: [],
      edges: [],
    };
    mockExecFileAsync((_cmd: string, args: string[]) => {
      if (args[0] === 'fetch') return '';
      if (args[0] === 'rev-parse') return '';
      if (args[0] === 'show') return JSON.stringify(graph);
      return '';
    });

    const result = await loadGraphAtRef('main', '_treck/graph.json');

    expect(result).toEqual(graph);
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['show', 'origin/main:_treck/graph.json'],
      { encoding: 'utf8' },
      expect.any(Function),
    );
  });

  it('falls back to bare ref when remote is unavailable', async () => {
    const graph = { version: '1.0', generatedAt: '', nodes: [], edges: [] };
    mockExecFileAsync((_cmd: string, args: string[]) => {
      if (args[0] === 'fetch') throw new Error('offline');
      if (args[0] === 'rev-parse') throw new Error('not found');
      if (args[0] === 'show') return JSON.stringify(graph);
      return '';
    });

    const result = await loadGraphAtRef('main', '_treck/graph.json');

    expect(result).toEqual(graph);
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['show', 'main:_treck/graph.json'],
      { encoding: 'utf8' },
      expect.any(Function),
    );
  });

  it('throws with clear message when graph.json not found', async () => {
    mockExecFileAsync(() => {
      throw new Error('path not found');
    });

    await expect(loadGraphAtRef('main', '_treck/graph.json')).rejects.toThrow(
      'No graph.json found at main:_treck/graph.json',
    );
    await expect(loadGraphAtRef('main', '_treck/graph.json')).rejects.toThrow(
      'Ensure graph.json is committed on the base branch',
    );
  });

  it('skips origin prefix for commit hashes', async () => {
    mockExecFileAsync((_cmd: string, args: string[]) => {
      if (args[0] === 'show') return '{"version":"1.0","generatedAt":"","nodes":[],"edges":[]}';
      return '';
    });

    await loadGraphAtRef('abc123', 'custom/path/graph.json');

    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['show', 'abc123:custom/path/graph.json'],
      { encoding: 'utf8' },
      expect.any(Function),
    );
  });

  it('skips origin prefix for refs already containing a slash', async () => {
    mockExecFileAsync((_cmd: string, args: string[]) => {
      if (args[0] === 'show') return '{"version":"1.0","generatedAt":"","nodes":[],"edges":[]}';
      return '';
    });

    await loadGraphAtRef('origin/main', '_treck/graph.json');

    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['show', 'origin/main:_treck/graph.json'],
      { encoding: 'utf8' },
      expect.any(Function),
    );
  });
});
