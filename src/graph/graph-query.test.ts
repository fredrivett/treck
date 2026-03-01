/**
 * Tests for connectedSubgraph and other graph query utilities
 */

import { describe, expect, it } from 'vitest';
import { connectedSubgraph } from './graph-query.js';
import type { FlowGraph, GraphNode } from './types.js';

function makeNode(overrides: Partial<GraphNode> & { id: string; name: string }): GraphNode {
  return {
    kind: 'function',
    filePath: 'src/test.ts',
    isAsync: false,
    hash: 'abc123',
    lineRange: [1, 5] as [number, number],
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

describe('connectedSubgraph', () => {
  // A -> B -> C -> D
  //      ^
  //      |
  //      E
  const nodeA = makeNode({ id: 'a.ts:A', name: 'A' });
  const nodeB = makeNode({ id: 'b.ts:B', name: 'B' });
  const nodeC = makeNode({ id: 'c.ts:C', name: 'C' });
  const nodeD = makeNode({ id: 'd.ts:D', name: 'D' });
  const nodeE = makeNode({ id: 'e.ts:E', name: 'E' });

  const graph = makeGraph(
    [nodeA, nodeB, nodeC, nodeD, nodeE],
    [
      { id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false },
      { id: 'e2', source: 'b.ts:B', target: 'c.ts:C', type: 'direct-call', isAsync: false },
      { id: 'e3', source: 'c.ts:C', target: 'd.ts:D', type: 'direct-call', isAsync: false },
      { id: 'e4', source: 'e.ts:E', target: 'b.ts:B', type: 'direct-call', isAsync: false },
    ],
  );

  it('returns only the start node at depth 0', () => {
    const result = connectedSubgraph(graph, ['b.ts:B'], 0);
    expect(result.nodes.map((n) => n.id)).toEqual(['b.ts:B']);
    expect(result.edges).toEqual([]);
  });

  it('returns immediate neighbors at depth 1 (bidirectional)', () => {
    const result = connectedSubgraph(graph, ['b.ts:B'], 1);
    const ids = result.nodes.map((n) => n.id).sort();
    // B's callers: A, E; B's callees: C
    expect(ids).toEqual(['a.ts:A', 'b.ts:B', 'c.ts:C', 'e.ts:E']);
    // Edges between included nodes
    expect(result.edges.length).toBe(3); // A->B, B->C, E->B
  });

  it('expands deeper at depth 2', () => {
    const result = connectedSubgraph(graph, ['b.ts:B'], 2);
    const ids = result.nodes.map((n) => n.id).sort();
    // depth 1: A, C, E; depth 2: D (from C)
    expect(ids).toEqual(['a.ts:A', 'b.ts:B', 'c.ts:C', 'd.ts:D', 'e.ts:E']);
  });

  it('returns full connected component with default (infinite) depth', () => {
    const result = connectedSubgraph(graph, ['b.ts:B']);
    const ids = result.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['a.ts:A', 'b.ts:B', 'c.ts:C', 'd.ts:D', 'e.ts:E']);
    expect(result.edges.length).toBe(4);
  });

  it('handles multiple start nodes', () => {
    const result = connectedSubgraph(graph, ['a.ts:A', 'd.ts:D'], 1);
    const ids = result.nodes.map((n) => n.id).sort();
    // A's callees: B; D's callers: C
    expect(ids).toEqual(['a.ts:A', 'b.ts:B', 'c.ts:C', 'd.ts:D']);
  });

  it('terminates early when frontier is empty', () => {
    // Isolated node with no edges
    const isolated = makeNode({ id: 'x.ts:X', name: 'X' });
    const smallGraph = makeGraph([isolated]);
    const result = connectedSubgraph(smallGraph, ['x.ts:X']);
    expect(result.nodes.map((n) => n.id)).toEqual(['x.ts:X']);
    expect(result.edges).toEqual([]);
  });

  it('only returns edges between included nodes', () => {
    // From A at depth 1: reaches B only. E->B edge should NOT be included
    // because E is not in the subgraph.
    const result = connectedSubgraph(graph, ['a.ts:A'], 1);
    const ids = result.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['a.ts:A', 'b.ts:B']);
    expect(result.edges.length).toBe(1); // only A->B
    expect(result.edges[0].id).toBe('e1');
  });

  it('handles node ID not in graph gracefully', () => {
    const result = connectedSubgraph(graph, ['nonexistent:X']);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
