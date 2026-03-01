/**
 * Tests for mermaid diagram generation — multi-highlight and shared traversal
 */

import { describe, expect, it } from 'vitest';
import { flowToMermaid, nodeToMermaid } from './graph-to-mermaid.js';
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

describe('nodeToMermaid', () => {
  it('returns empty string for unknown node ID', () => {
    const graph = makeGraph([]);
    expect(nodeToMermaid(graph, 'nonexistent')).toBe('');
  });

  it('generates a flowchart with the target node highlighted', () => {
    const nodeA = makeNode({ id: 'src/a.ts:funcA', name: 'funcA' });
    const nodeB = makeNode({ id: 'src/b.ts:funcB', name: 'funcB' });
    const graph = makeGraph(
      [nodeA, nodeB],
      [
        {
          id: 'e1',
          source: 'src/a.ts:funcA',
          target: 'src/b.ts:funcB',
          type: 'direct-call',
          isAsync: false,
        },
      ],
    );

    const mermaid = nodeToMermaid(graph, 'src/a.ts:funcA');
    expect(mermaid).toContain('flowchart TD');
    expect(mermaid).toContain('funcA');
    expect(mermaid).toContain('funcB');
    // Target should be highlighted (blue style)
    expect(mermaid).toContain('style src_a_ts_funcA fill:#dbeafe');
  });

  it('uses connectedSubgraph for traversal at given depth', () => {
    // A -> B -> C
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B' });
    const nodeC = makeNode({ id: 'c.ts:C', name: 'C' });
    const graph = makeGraph(
      [nodeA, nodeB, nodeC],
      [
        { id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'b.ts:B', target: 'c.ts:C', type: 'direct-call', isAsync: false },
      ],
    );

    // Depth 1 from A: should include A and B but NOT C
    const depth1 = nodeToMermaid(graph, 'a.ts:A', 1);
    expect(depth1).toContain('A');
    expect(depth1).toContain('B');
    expect(depth1).not.toContain('"C"');

    // Depth 2 from A: should include A, B, AND C
    const depth2 = nodeToMermaid(graph, 'a.ts:A', 2);
    expect(depth2).toContain('A');
    expect(depth2).toContain('B');
    expect(depth2).toContain('C');
  });

  it('traverses bidirectionally (includes callers)', () => {
    // A -> B
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A', filePath: 'a.ts' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' });
    const graph = makeGraph(
      [nodeA, nodeB],
      [{ id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false }],
    );

    // From B at depth 1: should include A (caller)
    const mermaid = nodeToMermaid(graph, 'b.ts:B', 1);
    expect(mermaid).toContain('A');
    expect(mermaid).toContain('B');
  });

  it('shows full connected flow with Infinity depth', () => {
    // A -> B -> C -> D
    const nodes = ['A', 'B', 'C', 'D'].map((name) =>
      makeNode({
        id: `${name.toLowerCase()}.ts:${name}`,
        name,
        filePath: `${name.toLowerCase()}.ts`,
      }),
    );
    const graph = makeGraph(nodes, [
      { id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false },
      { id: 'e2', source: 'b.ts:B', target: 'c.ts:C', type: 'direct-call', isAsync: false },
      { id: 'e3', source: 'c.ts:C', target: 'd.ts:D', type: 'direct-call', isAsync: false },
    ]);

    const mermaid = nodeToMermaid(graph, 'a.ts:A', Number.POSITIVE_INFINITY);
    expect(mermaid).toContain('A');
    expect(mermaid).toContain('B');
    expect(mermaid).toContain('C');
    expect(mermaid).toContain('D');
  });
});

describe('flowToMermaid', () => {
  it('highlights multiple nodes when highlightIds is provided', () => {
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A', filePath: 'a.ts' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' });
    const nodeC = makeNode({ id: 'c.ts:C', name: 'C', filePath: 'c.ts' });
    const edges: FlowGraph['edges'] = [
      { id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false },
      { id: 'e2', source: 'b.ts:B', target: 'c.ts:C', type: 'direct-call', isAsync: false },
    ];

    const mermaid = flowToMermaid([nodeA, nodeB, nodeC], edges, new Set(['a.ts:A', 'c.ts:C']));

    // Both A and C should have the highlight style
    expect(mermaid).toContain('style a_ts_A fill:#dbeafe');
    expect(mermaid).toContain('style c_ts_C fill:#dbeafe');
    // B should NOT be highlighted
    expect(mermaid).not.toContain('style b_ts_B fill:#dbeafe');
  });

  it('styles entry points differently from highlights', () => {
    const nodeA = makeNode({
      id: 'a.ts:A',
      name: 'A',
      filePath: 'a.ts',
      entryType: 'api-route',
    });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' });

    const mermaid = flowToMermaid([nodeA, nodeB], [], new Set(['b.ts:B']));

    // B is highlighted (blue)
    expect(mermaid).toContain('style b_ts_B fill:#dbeafe');
    // A is an entry point (purple) but not highlighted
    expect(mermaid).toContain('style a_ts_A fill:#e0e7ff');
  });

  it('does not double-style entry points that are also highlighted', () => {
    const nodeA = makeNode({
      id: 'a.ts:A',
      name: 'A',
      filePath: 'a.ts',
      entryType: 'api-route',
    });

    const mermaid = flowToMermaid([nodeA], [], new Set(['a.ts:A']));

    // Should have the highlight style, NOT the entry point style
    expect(mermaid).toContain('style a_ts_A fill:#dbeafe');
    expect(mermaid).not.toContain('style a_ts_A fill:#e0e7ff');
  });
});
