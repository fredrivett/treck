/**
 * Tests for `treck diff` command output formatting
 */

import { describe, expect, it } from 'vitest';
import { diffGraphs } from '../../graph/diff.js';
import type { FlowGraph, GraphNode } from '../../graph/types.js';
import { formatDiffJson, formatDiffMermaid } from './diff.js';

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

describe('formatDiffJson', () => {
  it('returns valid pretty-printed JSON', () => {
    const base = makeGraph([makeNode({ id: 'a.ts:A', name: 'A', hash: 'old' })]);
    const head = makeGraph([makeNode({ id: 'a.ts:A', name: 'A', hash: 'new' })]);
    const diff = diffGraphs(base, head, { baseRef: 'main' });

    const json = formatDiffJson(diff);
    const parsed = JSON.parse(json);

    expect(parsed.base).toBe('main');
    expect(parsed.head).toBe('HEAD');
    expect(parsed.changes.modified).toContain('a.ts:A');
  });

  it('includes all diff fields', () => {
    const base = makeGraph([]);
    const head = makeGraph([makeNode({ id: 'b.ts:B', name: 'B' })]);
    const diff = diffGraphs(base, head, { baseRef: 'main' });

    const parsed = JSON.parse(formatDiffJson(diff));

    expect(parsed).toHaveProperty('base');
    expect(parsed).toHaveProperty('head');
    expect(parsed).toHaveProperty('changes');
    expect(parsed).toHaveProperty('impact');
    expect(parsed).toHaveProperty('nodes');
    expect(parsed).toHaveProperty('edges');
  });

  it('preserves node and edge data in JSON output', () => {
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A', filePath: 'a.ts', hash: 'old' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' });
    const base = makeGraph([nodeA]);
    const head = makeGraph(
      [{ ...nodeA, hash: 'new' }, nodeB],
      [{ id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false }],
    );
    const diff = diffGraphs(base, head, { baseRef: 'main' });

    const parsed = JSON.parse(formatDiffJson(diff));
    expect(parsed.nodes.length).toBeGreaterThan(0);
    expect(parsed.edges.length).toBeGreaterThan(0);
  });
});

describe('formatDiffMermaid', () => {
  it('returns a mermaid flowchart with classDef styles', () => {
    const base = makeGraph([makeNode({ id: 'a.ts:A', name: 'A', hash: 'old' })]);
    const head = makeGraph([makeNode({ id: 'a.ts:A', name: 'A', hash: 'new' })]);
    const diff = diffGraphs(base, head, { baseRef: 'main' });

    const mermaid = formatDiffMermaid(diff);

    expect(mermaid).toContain('flowchart LR');
    expect(mermaid).toContain('classDef modified');
    expect(mermaid).toContain('classDef added');
    expect(mermaid).toContain('class a_ts_A modified');
  });

  it('highlights added nodes with added class', () => {
    const base = makeGraph([]);
    const head = makeGraph([makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' })]);
    const diff = diffGraphs(base, head, { baseRef: 'main' });

    const mermaid = formatDiffMermaid(diff);

    expect(mermaid).toContain('class b_ts_B added');
  });

  it('uses asciiShapes when option is set', () => {
    const base = makeGraph([makeNode({ id: 'a.ts:A', name: 'A', hash: 'old' })]);
    const head = makeGraph([makeNode({ id: 'a.ts:A', name: 'A', hash: 'new' })]);
    const diff = diffGraphs(base, head, { baseRef: 'main' });

    const mermaid = formatDiffMermaid(diff, { asciiShapes: true });

    expect(mermaid).toContain('[["★ A"]]');
    expect(mermaid).not.toContain('classDef');
  });

  it('returns empty flowchart when no changes', () => {
    const node = makeNode({ id: 'a.ts:A', name: 'A' });
    const diff = diffGraphs(makeGraph([node]), makeGraph([node]), { baseRef: 'main' });

    const mermaid = formatDiffMermaid(diff);

    expect(mermaid).toContain('flowchart LR');
    expect(mermaid).not.toContain('class ');
  });

  it('passes asciiShapes through to diffToMermaid for added nodes', () => {
    const base = makeGraph([]);
    const head = makeGraph([makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' })]);
    const diff = diffGraphs(base, head, { baseRef: 'main' });

    const mermaid = formatDiffMermaid(diff, { asciiShapes: true });

    expect(mermaid).toContain('{{"+ B"}}');
    expect(mermaid).not.toContain('classDef');
  });
});
