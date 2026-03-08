/**
 * Tests for node-level graph diffing and diff mermaid rendering
 */

import { describe, expect, it } from 'vitest';
import { diffGraphs, diffToMermaid, formatDiffSummary } from './diff.js';
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

describe('diffGraphs', () => {
  it('returns empty diff for identical graphs', () => {
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A', hash: 'h1' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', hash: 'h2' });
    const graph = makeGraph([nodeA, nodeB]);

    const diff = diffGraphs(graph, graph, { baseRef: 'main' });

    expect(diff.changes.modified).toEqual([]);
    expect(diff.changes.added).toEqual([]);
    expect(diff.changes.removed).toEqual([]);
    expect(diff.nodes).toEqual([]);
    expect(diff.edges).toEqual([]);
    expect(diff.base).toBe('main');
    expect(diff.head).toBe('HEAD');
  });

  it('detects a modified node (different hash)', () => {
    const base = makeGraph([
      makeNode({ id: 'a.ts:A', name: 'A', hash: 'old' }),
      makeNode({ id: 'b.ts:B', name: 'B', hash: 'same' }),
    ]);
    const head = makeGraph([
      makeNode({ id: 'a.ts:A', name: 'A', hash: 'new' }),
      makeNode({ id: 'b.ts:B', name: 'B', hash: 'same' }),
    ]);

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    expect(diff.changes.modified).toEqual(['a.ts:A']);
    expect(diff.changes.added).toEqual([]);
    expect(diff.changes.removed).toEqual([]);
  });

  it('detects an added node (in head only)', () => {
    const base = makeGraph([makeNode({ id: 'a.ts:A', name: 'A' })]);
    const head = makeGraph([
      makeNode({ id: 'a.ts:A', name: 'A' }),
      makeNode({ id: 'b.ts:B', name: 'B' }),
    ]);

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    expect(diff.changes.added).toEqual(['b.ts:B']);
    expect(diff.changes.modified).toEqual([]);
    expect(diff.changes.removed).toEqual([]);
  });

  it('detects a removed node (in base only)', () => {
    const base = makeGraph([
      makeNode({ id: 'a.ts:A', name: 'A' }),
      makeNode({ id: 'b.ts:B', name: 'B' }),
    ]);
    const head = makeGraph([makeNode({ id: 'a.ts:A', name: 'A' })]);

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    expect(diff.changes.removed).toEqual(['b.ts:B']);
    expect(diff.changes.modified).toEqual([]);
    expect(diff.changes.added).toEqual([]);
  });

  it('does not include removed nodes in the subgraph', () => {
    const base = makeGraph([
      makeNode({ id: 'a.ts:A', name: 'A' }),
      makeNode({ id: 'b.ts:B', name: 'B' }),
    ]);
    const head = makeGraph([makeNode({ id: 'a.ts:A', name: 'A' })]);

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    expect(diff.nodes.map((n) => n.id)).not.toContain('b.ts:B');
  });

  it('includes neighbors of changed nodes in the impact subgraph', () => {
    const base = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'old' }),
        makeNode({ id: 'b.ts:B', name: 'B', hash: 'same' }),
        makeNode({ id: 'c.ts:C', name: 'C', hash: 'same' }),
      ],
      [
        { id: 'e1', source: 'b.ts:B', target: 'a.ts:A', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'a.ts:A', target: 'c.ts:C', type: 'direct-call', isAsync: false },
      ],
    );
    const head = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'new' }),
        makeNode({ id: 'b.ts:B', name: 'B', hash: 'same' }),
        makeNode({ id: 'c.ts:C', name: 'C', hash: 'same' }),
      ],
      [
        { id: 'e1', source: 'b.ts:B', target: 'a.ts:A', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'a.ts:A', target: 'c.ts:C', type: 'direct-call', isAsync: false },
      ],
    );

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    const nodeIds = diff.nodes.map((n) => n.id).sort();
    expect(nodeIds).toEqual(['a.ts:A', 'b.ts:B', 'c.ts:C']);
    expect(diff.edges.length).toBe(2);
  });

  it('counts upstream and downstream excluding changed nodes', () => {
    const base = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'old' }),
        makeNode({ id: 'caller.ts:C1', name: 'C1', hash: 'same' }),
        makeNode({ id: 'callee.ts:C2', name: 'C2', hash: 'same' }),
      ],
      [
        { id: 'e1', source: 'caller.ts:C1', target: 'a.ts:A', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'a.ts:A', target: 'callee.ts:C2', type: 'direct-call', isAsync: false },
      ],
    );
    const head = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'new' }),
        makeNode({ id: 'caller.ts:C1', name: 'C1', hash: 'same' }),
        makeNode({ id: 'callee.ts:C2', name: 'C2', hash: 'same' }),
      ],
      [
        { id: 'e1', source: 'caller.ts:C1', target: 'a.ts:A', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'a.ts:A', target: 'callee.ts:C2', type: 'direct-call', isAsync: false },
      ],
    );

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    expect(diff.impact.totalUpstream).toBe(1);
    expect(diff.impact.totalDownstream).toBe(1);
  });

  it('identifies affected entry points in the impact zone', () => {
    const base = makeGraph(
      [
        makeNode({ id: 'db.ts:query', name: 'query', hash: 'old' }),
        makeNode({ id: 'route.ts:GET', name: 'GET', hash: 'same', entryType: 'api-route' }),
      ],
      [
        {
          id: 'e1',
          source: 'route.ts:GET',
          target: 'db.ts:query',
          type: 'direct-call',
          isAsync: false,
        },
      ],
    );
    const head = makeGraph(
      [
        makeNode({ id: 'db.ts:query', name: 'query', hash: 'new' }),
        makeNode({ id: 'route.ts:GET', name: 'GET', hash: 'same', entryType: 'api-route' }),
      ],
      [
        {
          id: 'e1',
          source: 'route.ts:GET',
          target: 'db.ts:query',
          type: 'direct-call',
          isAsync: false,
        },
      ],
    );

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    expect(diff.impact.entryPointsAffected).toEqual(['route.ts:GET']);
  });

  it('respects depth limit for impact zone', () => {
    // Chain: E -> D -> C -> A (changed) -> B
    const base = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'old' }),
        makeNode({ id: 'b.ts:B', name: 'B' }),
        makeNode({ id: 'c.ts:C', name: 'C' }),
        makeNode({ id: 'd.ts:D', name: 'D' }),
        makeNode({ id: 'e.ts:E', name: 'E' }),
      ],
      [
        { id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'c.ts:C', target: 'a.ts:A', type: 'direct-call', isAsync: false },
        { id: 'e3', source: 'd.ts:D', target: 'c.ts:C', type: 'direct-call', isAsync: false },
        { id: 'e4', source: 'e.ts:E', target: 'd.ts:D', type: 'direct-call', isAsync: false },
      ],
    );
    const head = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'new' }),
        makeNode({ id: 'b.ts:B', name: 'B' }),
        makeNode({ id: 'c.ts:C', name: 'C' }),
        makeNode({ id: 'd.ts:D', name: 'D' }),
        makeNode({ id: 'e.ts:E', name: 'E' }),
      ],
      [
        { id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'c.ts:C', target: 'a.ts:A', type: 'direct-call', isAsync: false },
        { id: 'e3', source: 'd.ts:D', target: 'c.ts:C', type: 'direct-call', isAsync: false },
        { id: 'e4', source: 'e.ts:E', target: 'd.ts:D', type: 'direct-call', isAsync: false },
      ],
    );

    const diff = diffGraphs(base, head, { baseRef: 'main', depth: 1 });

    const nodeIds = diff.nodes.map((n) => n.id).sort();
    // depth 1: only immediate neighbors of A → B (callee), C (caller)
    expect(nodeIds).toEqual(['a.ts:A', 'b.ts:B', 'c.ts:C']);
  });

  it('does not flag nodes with same hash as modified', () => {
    const base = makeGraph([makeNode({ id: 'a.ts:A', name: 'A', hash: 'same' })]);
    const head = makeGraph([makeNode({ id: 'a.ts:A', name: 'renamed', hash: 'same' })]);

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    expect(diff.changes.modified).toEqual([]);
    expect(diff.changes.added).toEqual([]);
    expect(diff.changes.removed).toEqual([]);
  });

  it('handles mixed changes (modified + added + removed)', () => {
    const base = makeGraph([
      makeNode({ id: 'a.ts:A', name: 'A', hash: 'old' }),
      makeNode({ id: 'b.ts:B', name: 'B', hash: 'same' }),
      makeNode({ id: 'c.ts:C', name: 'C', hash: 'gone' }),
    ]);
    const head = makeGraph([
      makeNode({ id: 'a.ts:A', name: 'A', hash: 'new' }),
      makeNode({ id: 'b.ts:B', name: 'B', hash: 'same' }),
      makeNode({ id: 'd.ts:D', name: 'D', hash: 'brand-new' }),
    ]);

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    expect(diff.changes.modified).toEqual(['a.ts:A']);
    expect(diff.changes.added).toEqual(['d.ts:D']);
    expect(diff.changes.removed).toEqual(['c.ts:C']);
  });

  it('handles empty base graph (everything added)', () => {
    const base = makeGraph([]);
    const head = makeGraph([
      makeNode({ id: 'a.ts:A', name: 'A' }),
      makeNode({ id: 'b.ts:B', name: 'B' }),
    ]);

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    expect(diff.changes.added).toEqual(['a.ts:A', 'b.ts:B']);
    expect(diff.changes.modified).toEqual([]);
    expect(diff.changes.removed).toEqual([]);
  });

  it('handles empty head graph (everything removed)', () => {
    const base = makeGraph([
      makeNode({ id: 'a.ts:A', name: 'A' }),
      makeNode({ id: 'b.ts:B', name: 'B' }),
    ]);
    const head = makeGraph([]);

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    expect(diff.changes.removed).toEqual(['a.ts:A', 'b.ts:B']);
    expect(diff.changes.modified).toEqual([]);
    expect(diff.changes.added).toEqual([]);
    expect(diff.nodes).toEqual([]);
    expect(diff.edges).toEqual([]);
  });

  it('does not count changed-to-changed edges as upstream or downstream', () => {
    // A (modified) -> B (modified) — neither is upstream/downstream of the other
    const base = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'old-a' }),
        makeNode({ id: 'b.ts:B', name: 'B', hash: 'old-b' }),
      ],
      [{ id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false }],
    );
    const head = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'new-a' }),
        makeNode({ id: 'b.ts:B', name: 'B', hash: 'new-b' }),
      ],
      [{ id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false }],
    );

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    expect(diff.impact.totalUpstream).toBe(0);
    expect(diff.impact.totalDownstream).toBe(0);
  });

  it('includes a changed entry point in entryPointsAffected', () => {
    const base = makeGraph([
      makeNode({ id: 'route.ts:GET', name: 'GET', hash: 'old', entryType: 'api-route' }),
    ]);
    const head = makeGraph([
      makeNode({ id: 'route.ts:GET', name: 'GET', hash: 'new', entryType: 'api-route' }),
    ]);

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    expect(diff.impact.entryPointsAffected).toEqual(['route.ts:GET']);
  });

  it('does not double-count shared callers of multiple changed nodes', () => {
    // Shared caller C -> A (modified), C -> B (modified)
    const base = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'old-a' }),
        makeNode({ id: 'b.ts:B', name: 'B', hash: 'old-b' }),
        makeNode({ id: 'c.ts:C', name: 'C', hash: 'same' }),
      ],
      [
        { id: 'e1', source: 'c.ts:C', target: 'a.ts:A', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'c.ts:C', target: 'b.ts:B', type: 'direct-call', isAsync: false },
      ],
    );
    const head = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'new-a' }),
        makeNode({ id: 'b.ts:B', name: 'B', hash: 'new-b' }),
        makeNode({ id: 'c.ts:C', name: 'C', hash: 'same' }),
      ],
      [
        { id: 'e1', source: 'c.ts:C', target: 'a.ts:A', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'c.ts:C', target: 'b.ts:B', type: 'direct-call', isAsync: false },
      ],
    );

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    // C is a caller of both A and B, but should only be counted once
    expect(diff.impact.totalUpstream).toBe(1);
  });

  it('handles an added node with connections in head graph', () => {
    const base = makeGraph([makeNode({ id: 'a.ts:A', name: 'A', hash: 'same' })]);
    const head = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'same' }),
        makeNode({ id: 'b.ts:B', name: 'B', hash: 'new' }),
      ],
      [{ id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false }],
    );

    const diff = diffGraphs(base, head, { baseRef: 'main' });

    expect(diff.changes.added).toEqual(['b.ts:B']);
    const nodeIds = diff.nodes.map((n) => n.id).sort();
    expect(nodeIds).toContain('b.ts:B');
    expect(nodeIds).toContain('a.ts:A'); // caller of added node
    expect(diff.impact.totalUpstream).toBe(1); // A is upstream of added B
  });
});

describe('diffToMermaid', () => {
  it('includes classDef lines for modified and added', () => {
    const nodes = [makeNode({ id: 'a.ts:A', name: 'A' })];
    const result = diffToMermaid(nodes, [], new Set(['a.ts:A']), new Set());

    expect(result).toContain('classDef modified fill:#fbbf24,stroke:#d97706,stroke-width:2px');
    expect(result).toContain('classDef added fill:#4ade80,stroke:#16a34a,stroke-width:2px');
  });

  it('applies modified class to modified nodes', () => {
    const nodes = [makeNode({ id: 'a.ts:A', name: 'A' })];
    const result = diffToMermaid(nodes, [], new Set(['a.ts:A']), new Set());

    expect(result).toContain('class a_ts_A modified');
  });

  it('applies added class to added nodes', () => {
    const nodes = [makeNode({ id: 'b.ts:B', name: 'B' })];
    const result = diffToMermaid(nodes, [], new Set(), new Set(['b.ts:B']));

    expect(result).toContain('class b_ts_B added');
  });

  it('does not apply classes to unchanged context nodes', () => {
    const nodes = [makeNode({ id: 'a.ts:A', name: 'A' }), makeNode({ id: 'b.ts:B', name: 'B' })];
    const result = diffToMermaid(nodes, [], new Set(['a.ts:A']), new Set());

    expect(result).toContain('class a_ts_A modified');
    expect(result).not.toMatch(/class b_ts_B/);
  });

  it('starts with flowchart LR', () => {
    const result = diffToMermaid([], [], new Set(), new Set());
    expect(result).toMatch(/^flowchart LR/);
  });

  it('renders edges between nodes', () => {
    const nodes = [makeNode({ id: 'a.ts:A', name: 'A' }), makeNode({ id: 'b.ts:B', name: 'B' })];
    const edges = [
      {
        id: 'e1',
        source: 'a.ts:A',
        target: 'b.ts:B',
        type: 'direct-call' as const,
        isAsync: false,
      },
    ];
    const result = diffToMermaid(nodes, edges, new Set(), new Set());

    expect(result).toContain('a_ts_A --> b_ts_B');
  });

  it('groups nodes by file in subgraphs when multiple files', () => {
    const nodes = [
      makeNode({ id: 'src/a.ts:A', name: 'A', filePath: 'src/a.ts' }),
      makeNode({ id: 'src/b.ts:B', name: 'B', filePath: 'src/b.ts' }),
    ];
    const result = diffToMermaid(nodes, [], new Set(), new Set());

    expect(result).toContain('subgraph src_a_ts["src/a.ts"]');
    expect(result).toContain('subgraph src_b_ts["src/b.ts"]');
  });

  it('renders entry point nodes with asymmetric shape', () => {
    const nodes = [makeNode({ id: 'route.ts:GET', name: 'GET', entryType: 'api-route' })];
    const result = diffToMermaid(nodes, [], new Set(['route.ts:GET']), new Set());

    expect(result).toContain('>GET]');
  });

  it('applies both modified and added classes in the same diagram', () => {
    const nodes = [
      makeNode({ id: 'a.ts:A', name: 'A' }),
      makeNode({ id: 'b.ts:B', name: 'B' }),
      makeNode({ id: 'c.ts:C', name: 'C' }),
    ];
    const result = diffToMermaid(nodes, [], new Set(['a.ts:A']), new Set(['b.ts:B']));

    expect(result).toContain('class a_ts_A modified');
    expect(result).toContain('class b_ts_B added');
    expect(result).not.toMatch(/class c_ts_C/);
  });

  it('ignores highlight IDs not in the node list', () => {
    const nodes = [makeNode({ id: 'a.ts:A', name: 'A' })];
    const result = diffToMermaid(
      nodes,
      [],
      new Set(['missing.ts:X']),
      new Set(['also-missing.ts:Y']),
    );

    expect(result).not.toContain('class missing');
    expect(result).not.toContain('class also');
  });

  it('uses subroutine shape for modified nodes in asciiShapes mode', () => {
    const nodes = [makeNode({ id: 'a.ts:A', name: 'A' })];
    const result = diffToMermaid(nodes, [], new Set(['a.ts:A']), new Set(), { asciiShapes: true });

    expect(result).toContain('[["★ A"]]');
    expect(result).not.toContain('classDef');
    expect(result).not.toContain('class a_ts_A');
  });

  it('uses hexagon shape for added nodes in asciiShapes mode', () => {
    const nodes = [makeNode({ id: 'b.ts:B', name: 'B' })];
    const result = diffToMermaid(nodes, [], new Set(), new Set(['b.ts:B']), { asciiShapes: true });

    expect(result).toContain('{{"+ B"}}');
  });

  it('keeps asymmetric shape for entry points in asciiShapes mode', () => {
    const nodes = [makeNode({ id: 'route.ts:GET', name: 'GET', entryType: 'api-route' })];
    const result = diffToMermaid(nodes, [], new Set(['route.ts:GET']), new Set(), {
      asciiShapes: true,
    });

    expect(result).toContain('>GET]');
    expect(result).not.toContain('[[');
  });

  it('uses plain rectangle for unchanged nodes in asciiShapes mode', () => {
    const nodes = [makeNode({ id: 'a.ts:A', name: 'A' })];
    const result = diffToMermaid(nodes, [], new Set(), new Set(), { asciiShapes: true });

    expect(result).toContain('["A"]');
  });
});

describe('formatDiffSummary', () => {
  it('returns "No symbol changes detected." when nothing changed', () => {
    const diff = diffGraphs(makeGraph([]), makeGraph([]), { baseRef: 'main' });
    expect(formatDiffSummary(diff)).toBe('No symbol changes detected.');
  });

  it('summarizes modified, added, and removed counts', () => {
    const base = makeGraph([
      makeNode({ id: 'a.ts:A', name: 'A', hash: 'old' }),
      makeNode({ id: 'c.ts:C', name: 'C' }),
    ]);
    const head = makeGraph([
      makeNode({ id: 'a.ts:A', name: 'A', hash: 'new' }),
      makeNode({ id: 'b.ts:B', name: 'B' }),
    ]);
    const diff = diffGraphs(base, head, { baseRef: 'main' });
    const summary = formatDiffSummary(diff);

    expect(summary).toContain('1 symbols changed');
    expect(summary).toContain('1 added');
    expect(summary).toContain('1 removed');
  });

  it('includes affected entry points', () => {
    const base = makeGraph(
      [
        makeNode({ id: 'db.ts:query', name: 'query', hash: 'old' }),
        makeNode({ id: 'route.ts:GET', name: 'GET', entryType: 'api-route' }),
      ],
      [
        {
          id: 'e1',
          source: 'route.ts:GET',
          target: 'db.ts:query',
          type: 'direct-call',
          isAsync: false,
        },
      ],
    );
    const head = makeGraph(
      [
        makeNode({ id: 'db.ts:query', name: 'query', hash: 'new' }),
        makeNode({ id: 'route.ts:GET', name: 'GET', entryType: 'api-route' }),
      ],
      [
        {
          id: 'e1',
          source: 'route.ts:GET',
          target: 'db.ts:query',
          type: 'direct-call',
          isAsync: false,
        },
      ],
    );
    const diff = diffGraphs(base, head, { baseRef: 'main' });
    const summary = formatDiffSummary(diff);

    expect(summary).toContain('1 entry points affected');
    expect(summary).toContain('route.ts:GET');
  });

  it('only shows relevant parts when a single change type exists', () => {
    const base = makeGraph([]);
    const head = makeGraph([makeNode({ id: 'a.ts:A', name: 'A' })]);
    const diff = diffGraphs(base, head, { baseRef: 'main' });
    const summary = formatDiffSummary(diff);

    expect(summary).toContain('1 added');
    expect(summary).not.toContain('changed');
    expect(summary).not.toContain('removed');
  });

  it('includes upstream/downstream impact counts', () => {
    const base = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'old' }),
        makeNode({ id: 'caller.ts:C', name: 'C' }),
        makeNode({ id: 'callee.ts:D', name: 'D' }),
      ],
      [
        { id: 'e1', source: 'caller.ts:C', target: 'a.ts:A', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'a.ts:A', target: 'callee.ts:D', type: 'direct-call', isAsync: false },
      ],
    );
    const head = makeGraph(
      [
        makeNode({ id: 'a.ts:A', name: 'A', hash: 'new' }),
        makeNode({ id: 'caller.ts:C', name: 'C' }),
        makeNode({ id: 'callee.ts:D', name: 'D' }),
      ],
      [
        { id: 'e1', source: 'caller.ts:C', target: 'a.ts:A', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'a.ts:A', target: 'callee.ts:D', type: 'direct-call', isAsync: false },
      ],
    );
    const diff = diffGraphs(base, head, { baseRef: 'main' });
    const summary = formatDiffSummary(diff);

    expect(summary).toContain('1 upstream callers');
    expect(summary).toContain('1 downstream callees');
  });
});
