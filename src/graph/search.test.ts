/**
 * Tests for MiniSearch-powered graph search
 */

import { describe, expect, it } from 'vitest';
import { executeSearchNodes } from './chat-helpers.js';
import { buildSearchIndex, camelCaseTokenize } from './search.js';
import type { FlowGraph, GraphNode } from './types.js';

function makeNode(overrides: Partial<GraphNode> & { id: string; name: string }): GraphNode {
  return {
    kind: 'function',
    filePath: 'src/test.ts',
    isAsync: false,
    hash: 'abc123',
    lineRange: [1, 5] as [number, number],
    hasJsDoc: false,
    ...overrides,
  };
}

function makeGraph(nodes: GraphNode[], edges: FlowGraph['edges'] = []): FlowGraph {
  return {
    version: '1.0',
    generatedAt: '2026-03-01T00:00:00Z',
    nodes,
    edges,
  };
}

describe('camelCaseTokenize', () => {
  it('splits camelCase identifiers', () => {
    expect(camelCaseTokenize('useDarkMode')).toEqual(['use', 'dark', 'mode']);
  });

  it('splits PascalCase identifiers', () => {
    expect(camelCaseTokenize('DarkModeProvider')).toEqual(['dark', 'mode', 'provider']);
  });

  it('handles consecutive uppercase (acronyms)', () => {
    const tokens = camelCaseTokenize('HTMLParser');
    expect(tokens).toContain('html');
    expect(tokens).toContain('parser');
  });

  it('splits on path separators', () => {
    expect(camelCaseTokenize('src/api/route.ts')).toEqual(['src', 'api', 'route', 'ts']);
  });

  it('splits on colon separator (node IDs)', () => {
    expect(camelCaseTokenize('src/a.ts:funcA')).toEqual(['src', 'a', 'ts', 'func', 'a']);
  });

  it('splits snake_case', () => {
    expect(camelCaseTokenize('snake_case_name')).toEqual(['snake', 'case', 'name']);
  });

  it('splits kebab-case', () => {
    expect(camelCaseTokenize('kebab-case-name')).toEqual(['kebab', 'case', 'name']);
  });

  it('returns empty array for empty string', () => {
    expect(camelCaseTokenize('')).toEqual([]);
  });

  it('lowercases all tokens', () => {
    expect(camelCaseTokenize('FooBAR')).toEqual(
      expect.arrayContaining([expect.stringMatching(/^[a-z]+$/)]),
    );
    for (const token of camelCaseTokenize('FooBAR')) {
      expect(token).toBe(token.toLowerCase());
    }
  });

  it('handles single word', () => {
    expect(camelCaseTokenize('simple')).toEqual(['simple']);
  });

  it('handles numbers in identifiers', () => {
    const tokens = camelCaseTokenize('useState2');
    expect(tokens).toContain('use');
    expect(tokens).toContain('state2');
  });

  it('handles all-uppercase identifiers', () => {
    expect(camelCaseTokenize('GET')).toEqual(['get']);
  });

  it('handles acronyms mid-word', () => {
    const tokens = camelCaseTokenize('getHTTPClient');
    expect(tokens).toContain('get');
    expect(tokens).toContain('client');
    // HTTP should appear as a token (possibly "http")
    expect(tokens.some((t) => t.includes('http'))).toBe(true);
  });
});

describe('buildSearchIndex', () => {
  it('builds without error on empty graph', () => {
    const graph = makeGraph([]);
    const index = buildSearchIndex(graph);
    expect(index).toBeDefined();
  });

  it('builds on graph with nodes', () => {
    const graph = makeGraph([
      makeNode({ id: 'src/a.ts:funcA', name: 'funcA', filePath: 'src/a.ts' }),
    ]);
    const index = buildSearchIndex(graph);
    expect(index).toBeDefined();
  });

  it('index is reusable across multiple searches', () => {
    const graph = makeGraph([
      makeNode({ id: 'src/a.ts:funcA', name: 'funcA', filePath: 'src/a.ts' }),
      makeNode({ id: 'src/b.ts:funcB', name: 'funcB', filePath: 'src/b.ts' }),
    ]);
    const index = buildSearchIndex(graph);

    const r1 = executeSearchNodes('funcA', graph, index);
    const r2 = executeSearchNodes('funcB', graph, index);
    expect(r1.length).toBeGreaterThan(0);
    expect(r1[0].id).toBe('src/a.ts:funcA');
    expect(r2.length).toBeGreaterThan(0);
    expect(r2[0].id).toBe('src/b.ts:funcB');
  });
});

describe('executeSearchNodes with index', () => {
  const nodes = [
    makeNode({ id: 'src/hooks.ts:useDarkMode', name: 'useDarkMode', filePath: 'src/hooks.ts' }),
    makeNode({
      id: 'src/keyboard.ts:useKeyboardShortcuts',
      name: 'useKeyboardShortcuts',
      filePath: 'src/keyboard.ts',
    }),
    makeNode({ id: 'src/a.ts:funcA', name: 'funcA', filePath: 'src/a.ts' }),
    makeNode({
      id: 'src/b.ts:funcB',
      name: 'funcB',
      filePath: 'src/b.ts',
      description: 'Helper function for data processing',
    }),
    makeNode({
      id: 'src/resize.ts:handleResize',
      name: 'handleResize',
      filePath: 'src/resize.ts',
    }),
    makeNode({
      id: 'src/undo.ts:UndoRedoGroup',
      name: 'UndoRedoGroup',
      filePath: 'src/undo.ts',
      kind: 'class',
    }),
    makeNode({
      id: 'src/c.ts:funcC',
      name: 'funcC',
      filePath: 'src/c.ts',
      entryType: 'api-route',
    }),
  ];

  const edges: FlowGraph['edges'] = [
    {
      id: 'e1',
      source: 'src/c.ts:funcC',
      target: 'src/a.ts:funcA',
      type: 'direct-call',
      isAsync: false,
    },
    {
      id: 'e2',
      source: 'src/a.ts:funcA',
      target: 'src/b.ts:funcB',
      type: 'direct-call',
      isAsync: false,
    },
  ];

  const graph = makeGraph(nodes, edges);
  const index = buildSearchIndex(graph);

  it('multi-word query matches camelCase node', () => {
    const results = executeSearchNodes('dark mode', graph, index);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('src/hooks.ts:useDarkMode');
  });

  it('multi-word query matches PascalCase node', () => {
    const results = executeSearchNodes('undo redo', graph, index);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('src/undo.ts:UndoRedoGroup');
  });

  it('multi-word query matches camelCase verb+noun', () => {
    const results = executeSearchNodes('handle resize', graph, index);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('src/resize.ts:handleResize');
  });

  it('keyboard shortcut matches useKeyboardShortcuts', () => {
    const results = executeSearchNodes('keyboard shortcut', graph, index);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('src/keyboard.ts:useKeyboardShortcuts');
  });

  it('single-word query still works (no regression)', () => {
    const results = executeSearchNodes('funcA', graph, index);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.id === 'src/a.ts:funcA')).toBe(true);
  });

  it('prefix matching works', () => {
    const results = executeSearchNodes('func', graph, index);
    expect(results.length).toBeGreaterThanOrEqual(3);
    const ids = results.map((r) => r.id);
    expect(ids).toContain('src/a.ts:funcA');
    expect(ids).toContain('src/b.ts:funcB');
    expect(ids).toContain('src/c.ts:funcC');
  });

  it('matches by description', () => {
    const results = executeSearchNodes('data processing', graph, index);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('src/b.ts:funcB');
  });

  it('matches by file path', () => {
    const results = executeSearchNodes('keyboard', graph, index);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.id === 'src/keyboard.ts:useKeyboardShortcuts')).toBe(true);
  });

  it('empty query returns empty array', () => {
    expect(executeSearchNodes('', graph, index)).toEqual([]);
    expect(executeSearchNodes('   ', graph, index)).toEqual([]);
  });

  it('no matches returns empty array', () => {
    const results = executeSearchNodes('zzzznonexistent', graph, index);
    expect(results).toEqual([]);
  });

  it('caps results at 20', () => {
    const manyNodes = Array.from({ length: 30 }, (_, i) =>
      makeNode({ id: `src/x.ts:handler${i}`, name: `handler${i}`, filePath: 'src/x.ts' }),
    );
    const largeGraph = makeGraph(manyNodes);
    const largeIndex = buildSearchIndex(largeGraph);
    const results = executeSearchNodes('handler', largeGraph, largeIndex);
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it('results include score field', () => {
    const results = executeSearchNodes('dark mode', graph, index);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('score');
    expect(typeof results[0].score).toBe('number');
  });

  it('results include connections field', () => {
    const results = executeSearchNodes('funcA', graph, index);
    const funcAResult = results.find((r) => r.id === 'src/a.ts:funcA');
    expect(funcAResult).toBeDefined();
    expect(funcAResult?.connections).toBe(2); // one incoming edge, one outgoing edge
  });

  it('backwards compatible without index (substring fallback)', () => {
    const results = executeSearchNodes('funcA', graph);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('src/a.ts:funcA');
    // Fallback results should NOT have score/connections
    expect(results[0]).not.toHaveProperty('score');
    expect(results[0]).not.toHaveProperty('connections');
  });

  it('preserves node metadata in results', () => {
    const results = executeSearchNodes('funcC', graph, index);
    const funcC = results.find((r) => r.id === 'src/c.ts:funcC');
    expect(funcC).toBeDefined();
    expect(funcC?.kind).toBe('function');
    expect(funcC?.entryType).toBe('api-route');
    expect(funcC?.filePath).toBe('src/c.ts');
  });

  it('fuzzy matching handles typos', () => {
    const results = executeSearchNodes('keboard', graph, index);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.id === 'src/keyboard.ts:useKeyboardShortcuts')).toBe(true);
  });

  it('name match ranks higher than filePath-only match', () => {
    // "resize" appears in both the name and filePath of handleResize,
    // but only in the filePath of other nodes — name boost should rank it first
    const results = executeSearchNodes('resize', graph, index);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('src/resize.ts:handleResize');
  });

  it('node with no edges has connections 0', () => {
    const results = executeSearchNodes('undo redo', graph, index);
    const undoResult = results.find((r) => r.id === 'src/undo.ts:UndoRedoGroup');
    expect(undoResult).toBeDefined();
    expect(undoResult?.connections).toBe(0);
  });

  it('empty graph with index returns empty array', () => {
    const emptyGraph = makeGraph([]);
    const emptyIndex = buildSearchIndex(emptyGraph);
    expect(executeSearchNodes('anything', emptyGraph, emptyIndex)).toEqual([]);
  });

  it('case-insensitive with index', () => {
    const results = executeSearchNodes('DARK MODE', graph, index);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('src/hooks.ts:useDarkMode');
  });
});
