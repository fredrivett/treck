/**
 * Tests for MCP tool handler functions
 */

import { describe, expect, it, vi } from 'vitest';
import type { FlowGraph, GraphNode } from '../../graph/types.js';
import {
  handleDiffGraph,
  handleFindCallees,
  handleFindCallers,
  handleGetGraphSummary,
  handleListEntryPoints,
  handlePathsBetween,
  handleSearchNodes,
  handleShowSymbol,
} from './mcp.js';

vi.mock('../utils/git.js', () => ({
  loadGraphAtRef: vi.fn(),
}));

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

const nodeA = makeNode({ id: 'src/a.ts:funcA', name: 'funcA', filePath: 'src/a.ts' });
const nodeB = makeNode({
  id: 'src/b.ts:funcB',
  name: 'funcB',
  filePath: 'src/b.ts',
  description: 'Helper function',
});
const nodeC = makeNode({
  id: 'src/c.ts:funcC',
  name: 'funcC',
  filePath: 'src/c.ts',
  entryType: 'api-route',
});
const nodeD = makeNode({
  id: 'src/d.ts:funcD',
  name: 'funcD',
  filePath: 'src/d.ts',
  entryType: 'page',
});

const nodeE = makeNode({
  id: 'src/e.ts:MyClass',
  name: 'MyClass',
  filePath: 'src/e.ts',
  kind: 'class',
});

const testGraph = makeGraph(
  [nodeA, nodeB, nodeC, nodeD, nodeE],
  [
    { source: 'src/c.ts:funcC', target: 'src/a.ts:funcA', type: 'call' },
    { source: 'src/a.ts:funcA', target: 'src/b.ts:funcB', type: 'call' },
  ],
);

const emptyGraph = makeGraph([]);

describe('handleSearchNodes', () => {
  it('returns matching nodes for a known query', () => {
    const result = handleSearchNodes('funcA', testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('src/a.ts:funcA');
  });

  it('matches by description', () => {
    const result = handleSearchNodes('Helper', testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('src/b.ts:funcB');
  });

  it('returns empty array for no matches', () => {
    const result = handleSearchNodes('nonexistent', testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    const result = handleSearchNodes('FUNCA', testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('src/a.ts:funcA');
  });

  it('matches by file path', () => {
    const result = handleSearchNodes('src/b.ts', testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('src/b.ts:funcB');
  });

  it('matches by node ID', () => {
    const result = handleSearchNodes('src/a.ts:funcA', testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('src/a.ts:funcA');
  });

  it('caps results at 20', () => {
    const manyNodes = Array.from({ length: 30 }, (_, i) =>
      makeNode({ id: `src/x.ts:fn${i}`, name: `fn${i}`, filePath: 'src/x.ts' }),
    );
    const largeGraph = makeGraph(manyNodes);
    const result = handleSearchNodes('fn', largeGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(20);
  });

  it('returns empty on empty graph', () => {
    const result = handleSearchNodes('anything', emptyGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(0);
  });
});

describe('handleShowSymbol', () => {
  it('resolves a valid target and returns nodes + edges', () => {
    const result = handleShowSymbol('src/a.ts:funcA', undefined, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.targets).toEqual(['src/a.ts:funcA']);
    expect(parsed.nodes.length).toBeGreaterThanOrEqual(1);
    expect(parsed.edges.length).toBeGreaterThanOrEqual(1);
    expect(result.isError).toBeUndefined();
  });

  it('returns isError for invalid target', () => {
    const result = handleShowSymbol('src/nope.ts:missing', undefined, testGraph);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No symbols found');
  });

  it('respects depth parameter', () => {
    const result = handleShowSymbol('src/c.ts:funcC', 1, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.depth).toBe(1);
    // depth 1 from C should include A (direct callee) but not B
    const nodeIds = parsed.nodes.map((n: { id: string }) => n.id);
    expect(nodeIds).toContain('src/c.ts:funcC');
    expect(nodeIds).toContain('src/a.ts:funcA');
    expect(nodeIds).not.toContain('src/b.ts:funcB');
  });

  it('resolves multiple comma-separated targets', () => {
    const result = handleShowSymbol('src/a.ts:funcA,src/b.ts:funcB', undefined, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.targets).toEqual(['src/a.ts:funcA', 'src/b.ts:funcB']);
    expect(result.isError).toBeUndefined();
  });

  it('resolves file path target to all symbols in that file', () => {
    const result = handleShowSymbol('src/a.ts', undefined, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.targets).toEqual(['src/a.ts:funcA']);
    expect(result.isError).toBeUndefined();
  });

  it('sets depth to null when omitted', () => {
    const result = handleShowSymbol('src/a.ts:funcA', undefined, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.depth).toBeNull();
  });
});

describe('handleListEntryPoints', () => {
  it('returns only entry point nodes', () => {
    const result = handleListEntryPoints(undefined, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(2);
    const ids = parsed.map((n: { id: string }) => n.id);
    expect(ids).toContain('src/c.ts:funcC');
    expect(ids).toContain('src/d.ts:funcD');
  });

  it('filters by kind', () => {
    const result = handleListEntryPoints('api-route', testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].entryType).toBe('api-route');
  });

  it('returns empty for non-matching kind filter', () => {
    const result = handleListEntryPoints('middleware', testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(0);
  });

  it('returns empty on graph with no entry points', () => {
    const noEntries = makeGraph([nodeA, nodeB]);
    const result = handleListEntryPoints(undefined, noEntries);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(0);
  });
});

describe('handleFindCallers', () => {
  it('returns direct callers with depth 1', () => {
    const result = handleFindCallers('src/a.ts:funcA', 1, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.target).toBe('src/a.ts:funcA');
    expect(parsed.depth).toBe(1);
    expect(parsed.callers).toHaveLength(1);
    expect(parsed.callers[0].id).toBe('src/c.ts:funcC');
  });

  it('does not include the target itself', () => {
    const result = handleFindCallers('src/a.ts:funcA', 1, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    const callerIds = parsed.callers.map((c: { id: string }) => c.id);
    expect(callerIds).not.toContain('src/a.ts:funcA');
  });

  it('returns empty callers for a root node', () => {
    const result = handleFindCallers('src/c.ts:funcC', 1, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.callers).toHaveLength(0);
  });

  it('traverses deeper with depth > 1', () => {
    // C -> A -> B, finding callers of B with depth 2 should find both A and C
    const result = handleFindCallers('src/b.ts:funcB', 2, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    const callerIds = parsed.callers.map((c: { id: string }) => c.id);
    expect(callerIds).toContain('src/a.ts:funcA');
    expect(callerIds).toContain('src/c.ts:funcC');
  });

  it('includes relevant edges', () => {
    const result = handleFindCallers('src/a.ts:funcA', 1, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.edges[0].source).toBe('src/c.ts:funcC');
    expect(parsed.edges[0].target).toBe('src/a.ts:funcA');
  });
});

describe('handleFindCallees', () => {
  it('returns direct callees with depth 1', () => {
    const result = handleFindCallees('src/a.ts:funcA', 1, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.source).toBe('src/a.ts:funcA');
    expect(parsed.depth).toBe(1);
    expect(parsed.callees).toHaveLength(1);
    expect(parsed.callees[0].id).toBe('src/b.ts:funcB');
  });

  it('does not include the source itself', () => {
    const result = handleFindCallees('src/a.ts:funcA', 1, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    const calleeIds = parsed.callees.map((c: { id: string }) => c.id);
    expect(calleeIds).not.toContain('src/a.ts:funcA');
  });

  it('returns empty callees for a leaf node', () => {
    const result = handleFindCallees('src/b.ts:funcB', 1, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.callees).toHaveLength(0);
  });

  it('traverses deeper with depth > 1', () => {
    // C -> A -> B, finding callees of C with depth 2 should find both A and B
    const result = handleFindCallees('src/c.ts:funcC', 2, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    const calleeIds = parsed.callees.map((c: { id: string }) => c.id);
    expect(calleeIds).toContain('src/a.ts:funcA');
    expect(calleeIds).toContain('src/b.ts:funcB');
  });

  it('includes relevant edges', () => {
    const result = handleFindCallees('src/a.ts:funcA', 1, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.edges[0].source).toBe('src/a.ts:funcA');
    expect(parsed.edges[0].target).toBe('src/b.ts:funcB');
  });
});

describe('handlePathsBetween', () => {
  it('finds a known path', () => {
    const result = handlePathsBetween('src/c.ts:funcC', 'src/b.ts:funcB', 5, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.pathCount).toBe(1);
    expect(parsed.paths[0]).toEqual(['src/c.ts:funcC', 'src/a.ts:funcA', 'src/b.ts:funcB']);
  });

  it('returns empty for disconnected nodes', () => {
    const result = handlePathsBetween('src/b.ts:funcB', 'src/d.ts:funcD', 5, testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.pathCount).toBe(0);
    expect(parsed.paths).toEqual([]);
  });

  it('respects maxPaths limit', () => {
    // Create a diamond graph: A->B, A->C, B->D, C->D (2 paths from A to D)
    const diamond = makeGraph(
      [
        makeNode({ id: 'a:A', name: 'A', filePath: 'a' }),
        makeNode({ id: 'b:B', name: 'B', filePath: 'b' }),
        makeNode({ id: 'c:C', name: 'C', filePath: 'c' }),
        makeNode({ id: 'd:D', name: 'D', filePath: 'd' }),
      ],
      [
        { source: 'a:A', target: 'b:B', type: 'call' },
        { source: 'a:A', target: 'c:C', type: 'call' },
        { source: 'b:B', target: 'd:D', type: 'call' },
        { source: 'c:C', target: 'd:D', type: 'call' },
      ],
    );
    const result = handlePathsBetween('a:A', 'd:D', 1, diamond);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.pathCount).toBe(1);
  });
});

describe('handleGetGraphSummary', () => {
  it('returns correct counts', () => {
    const result = handleGetGraphSummary(testGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.nodeCount).toBe(5);
    expect(parsed.edgeCount).toBe(2);
    expect(parsed.entryPointCount).toBe(2);
    expect(parsed.kindCounts.function).toBe(4);
    expect(parsed.kindCounts.class).toBe(1);
    expect(parsed.entryTypeCounts['api-route']).toBe(1);
    expect(parsed.entryTypeCounts.page).toBe(1);
  });

  it('handles empty graph', () => {
    const result = handleGetGraphSummary(emptyGraph);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.nodeCount).toBe(0);
    expect(parsed.edgeCount).toBe(0);
    expect(parsed.entryPointCount).toBe(0);
    expect(parsed.kindCounts).toEqual({});
    expect(parsed.entryTypeCounts).toEqual({});
  });
});

describe('handleDiffGraph', () => {
  it('returns diff result with changes and impact', async () => {
    const { loadGraphAtRef } = await import('../utils/git.js');
    const mockLoad = vi.mocked(loadGraphAtRef);

    const baseGraph = makeGraph([
      makeNode({ id: 'src/a.ts:funcA', name: 'funcA', hash: 'old', filePath: 'src/a.ts' }),
      makeNode({ id: 'src/b.ts:funcB', name: 'funcB', hash: 'same', filePath: 'src/b.ts' }),
    ]);
    mockLoad.mockResolvedValue(baseGraph);

    const currentGraph = makeGraph([
      makeNode({ id: 'src/a.ts:funcA', name: 'funcA', hash: 'new', filePath: 'src/a.ts' }),
      makeNode({ id: 'src/b.ts:funcB', name: 'funcB', hash: 'same', filePath: 'src/b.ts' }),
    ]);

    const result = await handleDiffGraph('main', undefined, '_treck/graph.json', currentGraph);
    const parsed = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(parsed.base).toBe('main');
    expect(parsed.head).toBe('HEAD');
    expect(parsed.changes.modified).toEqual(['src/a.ts:funcA']);
    expect(parsed.changes.added).toEqual([]);
    expect(parsed.changes.removed).toEqual([]);
  });

  it('returns isError when base graph cannot be loaded', async () => {
    const { loadGraphAtRef } = await import('../utils/git.js');
    const mockLoad = vi.mocked(loadGraphAtRef);
    mockLoad.mockRejectedValue(new Error('No graph.json found at bad-ref:_treck/graph.json'));

    const result = await handleDiffGraph('bad-ref', undefined, '_treck/graph.json', emptyGraph);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No graph.json found');
  });

  it('returns empty diff when base and current are identical', async () => {
    const { loadGraphAtRef } = await import('../utils/git.js');
    const mockLoad = vi.mocked(loadGraphAtRef);

    const graph = makeGraph([
      makeNode({ id: 'src/a.ts:funcA', name: 'funcA', filePath: 'src/a.ts' }),
    ]);
    mockLoad.mockResolvedValue(graph);

    const result = await handleDiffGraph('main', undefined, '_treck/graph.json', graph);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.changes.modified).toEqual([]);
    expect(parsed.changes.added).toEqual([]);
    expect(parsed.changes.removed).toEqual([]);
    expect(parsed.nodes).toEqual([]);
  });

  it('respects depth parameter', async () => {
    const { loadGraphAtRef } = await import('../utils/git.js');
    const mockLoad = vi.mocked(loadGraphAtRef);

    // Chain: C -> B -> A (changed)
    const baseGraph = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'old' }),
        makeNode({ id: 'b.ts:B', name: 'B' }),
        makeNode({ id: 'c.ts:C', name: 'C' }),
      ],
      [
        { id: 'e1', source: 'b.ts:B', target: 'a.ts:A', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'c.ts:C', target: 'b.ts:B', type: 'direct-call', isAsync: false },
      ],
    );
    mockLoad.mockResolvedValue(baseGraph);

    const currentGraph = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'new' }),
        makeNode({ id: 'b.ts:B', name: 'B' }),
        makeNode({ id: 'c.ts:C', name: 'C' }),
      ],
      [
        { id: 'e1', source: 'b.ts:B', target: 'a.ts:A', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'c.ts:C', target: 'b.ts:B', type: 'direct-call', isAsync: false },
      ],
    );

    const result = await handleDiffGraph('main', 1, '_treck/graph.json', currentGraph);
    const parsed = JSON.parse(result.content[0].text);

    const nodeIds = parsed.nodes.map((n: { id: string }) => n.id);
    expect(nodeIds).toContain('a.ts:A');
    expect(nodeIds).toContain('b.ts:B'); // depth 1 neighbor
    expect(nodeIds).not.toContain('c.ts:C'); // depth 2, should be excluded
  });
});
