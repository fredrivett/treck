/**
 * Tests for connectedSubgraph and other graph query utilities
 */

import { describe, expect, it } from 'vitest';
import { connectedSubgraph, connectedSubgraphWithDepths } from './graph-query.js';
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

describe('connectedSubgraphWithDepths', () => {
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

  describe('depth map correctness', () => {
    it('assigns depth 0 to start nodes', () => {
      const result = connectedSubgraphWithDepths(graph, ['b.ts:B'], 0);
      expect(result.nodeDepths['b.ts:B']).toBe(0);
    });

    it('assigns depth 1 to immediate neighbors', () => {
      const result = connectedSubgraphWithDepths(graph, ['b.ts:B'], 1);
      expect(result.nodeDepths['b.ts:B']).toBe(0);
      expect(result.nodeDepths['a.ts:A']).toBe(1);
      expect(result.nodeDepths['c.ts:C']).toBe(1);
      expect(result.nodeDepths['e.ts:E']).toBe(1);
    });

    it('assigns increasing depths along the chain', () => {
      const result = connectedSubgraphWithDepths(graph, ['a.ts:A']);
      expect(result.nodeDepths['a.ts:A']).toBe(0);
      expect(result.nodeDepths['b.ts:B']).toBe(1);
      expect(result.nodeDepths['c.ts:C']).toBe(2);
      expect(result.nodeDepths['d.ts:D']).toBe(3);
      // E is reached via reverse edge from B at depth 1
      expect(result.nodeDepths['e.ts:E']).toBe(2);
    });

    it('only includes depths for nodes in the subgraph', () => {
      const result = connectedSubgraphWithDepths(graph, ['a.ts:A'], 1);
      expect(Object.keys(result.nodeDepths).sort()).toEqual(['a.ts:A', 'b.ts:B']);
    });
  });

  describe('maxDepth calculation', () => {
    it('returns 0 for a single start node at depth 0', () => {
      const result = connectedSubgraphWithDepths(graph, ['b.ts:B'], 0);
      expect(result.maxDepth).toBe(0);
    });

    it('returns 1 when neighbors are one hop away', () => {
      const result = connectedSubgraphWithDepths(graph, ['b.ts:B'], 1);
      expect(result.maxDepth).toBe(1);
    });

    it('returns the actual max depth reached, not the limit', () => {
      // From B with limit 10, furthest node is D at depth 2
      const result = connectedSubgraphWithDepths(graph, ['b.ts:B'], 10);
      expect(result.maxDepth).toBe(2);
    });

    it('returns the traversal depth when all nodes reached from chain start', () => {
      const result = connectedSubgraphWithDepths(graph, ['a.ts:A']);
      expect(result.maxDepth).toBe(3);
    });
  });

  describe('empty start nodes', () => {
    it('returns empty nodes, edges, nodeDepths, and maxDepth 0', () => {
      const result = connectedSubgraphWithDepths(graph, []);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.nodeDepths).toEqual({});
      expect(result.maxDepth).toBe(0);
    });
  });

  describe('multiple start nodes', () => {
    it('assigns depth from the nearest start node', () => {
      // Start from A and D: B is 1 hop from A, C is 1 hop from D
      const result = connectedSubgraphWithDepths(graph, ['a.ts:A', 'd.ts:D']);
      expect(result.nodeDepths['a.ts:A']).toBe(0);
      expect(result.nodeDepths['d.ts:D']).toBe(0);
      expect(result.nodeDepths['b.ts:B']).toBe(1);
      expect(result.nodeDepths['c.ts:C']).toBe(1);
      // E is 2 from A (A->B reverse from E)
      expect(result.nodeDepths['e.ts:E']).toBe(2);
    });

    it('reaches more nodes at depth 1 when starting from both ends', () => {
      const result = connectedSubgraphWithDepths(graph, ['a.ts:A', 'd.ts:D'], 1);
      const ids = result.nodes.map((n) => n.id).sort();
      expect(ids).toEqual(['a.ts:A', 'b.ts:B', 'c.ts:C', 'd.ts:D']);
    });

    it('reduces maxDepth when starting from multiple points', () => {
      const fromA = connectedSubgraphWithDepths(graph, ['a.ts:A']);
      const fromBothEnds = connectedSubgraphWithDepths(graph, ['a.ts:A', 'd.ts:D']);
      expect(fromBothEnds.maxDepth).toBeLessThan(fromA.maxDepth);
    });
  });

  describe('depth limit respected', () => {
    it('excludes nodes beyond the depth limit', () => {
      const result = connectedSubgraphWithDepths(graph, ['a.ts:A'], 1);
      expect(result.nodes.map((n) => n.id).sort()).toEqual(['a.ts:A', 'b.ts:B']);
      expect(result.nodeDepths).toEqual({ 'a.ts:A': 0, 'b.ts:B': 1 });
    });

    it('excludes edges to nodes outside the depth limit', () => {
      const result = connectedSubgraphWithDepths(graph, ['a.ts:A'], 1);
      expect(result.edges.length).toBe(1);
      expect(result.edges[0].id).toBe('e1');
    });

    it('depth 2 from A includes B, C, E but not D', () => {
      const result = connectedSubgraphWithDepths(graph, ['a.ts:A'], 2);
      const ids = result.nodes.map((n) => n.id).sort();
      expect(ids).toEqual(['a.ts:A', 'b.ts:B', 'c.ts:C', 'e.ts:E']);
      expect(result.nodeDepths['d.ts:D']).toBeUndefined();
    });
  });

  describe('isolated node', () => {
    it('returns maxDepth 0 for a node with no edges', () => {
      const isolated = makeNode({ id: 'x.ts:X', name: 'X' });
      const smallGraph = makeGraph([isolated]);
      const result = connectedSubgraphWithDepths(smallGraph, ['x.ts:X']);
      expect(result.nodes.map((n) => n.id)).toEqual(['x.ts:X']);
      expect(result.edges).toEqual([]);
      expect(result.nodeDepths).toEqual({ 'x.ts:X': 0 });
      expect(result.maxDepth).toBe(0);
    });
  });
});
