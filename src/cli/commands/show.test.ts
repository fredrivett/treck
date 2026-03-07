/**
 * Tests for `treck show` command output formatting
 */

import { describe, expect, it } from 'vitest';
import type { FlowGraph, GraphNode } from '../../graph/types.js';
import {
  beautifyMermaid,
  buildMetadataLine,
  formatDocsOutput,
  formatJsonOutput,
  formatMermaidOutput,
} from './show.js';

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

describe('buildMetadataLine', () => {
  it('includes file path and kind', () => {
    const line = buildMetadataLine({
      filePath: 'src/api/route.ts',
      kind: 'function',
      isAsync: false,
      lineRange: [10, 25],
    });
    expect(line).toContain('`src/api/route.ts`');
    expect(line).toContain('function');
  });

  it('includes async prefix', () => {
    const line = buildMetadataLine({
      filePath: 'src/api/route.ts',
      kind: 'function',
      isAsync: true,
      lineRange: [10, 25],
    });
    expect(line).toContain('async function');
  });

  it('includes line range', () => {
    const line = buildMetadataLine({
      filePath: 'src/test.ts',
      kind: 'function',
      isAsync: false,
      lineRange: [10, 25],
    });
    expect(line).toContain('lines 10–25');
  });

  it('includes entry type with HTTP method and route', () => {
    const line = buildMetadataLine({
      filePath: 'src/api/route.ts',
      kind: 'function',
      isAsync: true,
      lineRange: [10, 25],
      entryType: 'api-route',
      metadata: { httpMethod: 'GET', route: '/api/users' },
    });
    expect(line).toContain('entry: api-route (GET /api/users)');
  });

  it('includes entry type with event trigger', () => {
    const line = buildMetadataLine({
      filePath: 'src/handler.ts',
      kind: 'function',
      isAsync: true,
      lineRange: [1, 10],
      entryType: 'inngest-function',
      metadata: { eventTrigger: 'user/created' },
    });
    expect(line).toContain('entry: inngest-function (user/created)');
  });

  it('includes entry type with task ID', () => {
    const line = buildMetadataLine({
      filePath: 'src/task.ts',
      kind: 'function',
      isAsync: true,
      lineRange: [1, 10],
      entryType: 'trigger-task',
      metadata: { taskId: 'process-image' },
    });
    expect(line).toContain('entry: trigger-task (process-image)');
  });

  it('joins parts with · separator', () => {
    const line = buildMetadataLine({
      filePath: 'src/test.ts',
      kind: 'function',
      isAsync: false,
      lineRange: [1, 5],
    });
    expect(line).toBe('`src/test.ts` · function · lines 1–5');
  });
});

describe('formatMermaidOutput', () => {
  it('produces a flowchart for a single target', () => {
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A', filePath: 'a.ts' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' });
    const graph = makeGraph(
      [nodeA, nodeB],
      [{ id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false }],
    );

    const output = formatMermaidOutput(['a.ts:A'], graph, 1);
    expect(output).toContain('flowchart TD');
    expect(output).toContain('A');
    expect(output).toContain('B');
  });

  it('produces a combined diagram for multiple targets', () => {
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A', filePath: 'a.ts' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' });
    const nodeC = makeNode({ id: 'c.ts:C', name: 'C', filePath: 'c.ts' });
    const graph = makeGraph(
      [nodeA, nodeB, nodeC],
      [
        { id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'b.ts:B', target: 'c.ts:C', type: 'direct-call', isAsync: false },
      ],
    );

    const output = formatMermaidOutput(['a.ts:A', 'c.ts:C'], graph, 1);
    expect(output).toContain('flowchart TD');
    // Both targets should be highlighted
    expect(output).toContain('style a_ts_A fill:var(--dep-highlight-fill)');
    expect(output).toContain('style c_ts_C fill:var(--dep-highlight-fill)');
  });

  it('respects depth parameter', () => {
    // A -> B -> C
    const nodes = ['A', 'B', 'C'].map((name) =>
      makeNode({
        id: `${name.toLowerCase()}.ts:${name}`,
        name,
        filePath: `${name.toLowerCase()}.ts`,
      }),
    );
    const graph = makeGraph(nodes, [
      { id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false },
      { id: 'e2', source: 'b.ts:B', target: 'c.ts:C', type: 'direct-call', isAsync: false },
    ]);

    const depth1 = formatMermaidOutput(['a.ts:A'], graph, 1);
    expect(depth1).toContain('A');
    expect(depth1).toContain('B');
    expect(depth1).not.toContain('"C"');

    const depthInf = formatMermaidOutput(['a.ts:A'], graph, Number.POSITIVE_INFINITY);
    expect(depthInf).toContain('C');
  });
});

describe('formatDocsOutput', () => {
  it('includes title and metadata line', () => {
    const node = makeNode({
      id: 'src/api/route.ts:GET',
      name: 'GET',
      filePath: 'src/api/route.ts',
      isAsync: true,
      lineRange: [10, 25],
      description: 'Fetch all users.',
    });
    const graph = makeGraph([node]);

    const output = formatDocsOutput(['src/api/route.ts:GET'], graph, 1);
    expect(output).toContain('# GET');
    expect(output).toContain('`src/api/route.ts`');
    expect(output).toContain('async function');
    expect(output).toContain('Fetch all users.');
  });

  it('includes mermaid diagram in fenced block', () => {
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A', filePath: 'a.ts' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' });
    const graph = makeGraph(
      [nodeA, nodeB],
      [{ id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false }],
    );

    const output = formatDocsOutput(['a.ts:A'], graph, 1);
    expect(output).toContain('```mermaid');
    expect(output).toContain('flowchart TD');
    expect(output).toContain('```');
  });

  it('separates multiple symbols with ---', () => {
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A', filePath: 'a.ts' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' });
    const graph = makeGraph([nodeA, nodeB]);

    const output = formatDocsOutput(['a.ts:A', 'b.ts:B'], graph, 1);
    expect(output).toContain('# A');
    expect(output).toContain('# B');
    expect(output).toContain('\n---\n');
  });

  it('does not duplicate the heading from renderNodeMarkdown', () => {
    const node = makeNode({
      id: 'a.ts:A',
      name: 'A',
      filePath: 'a.ts',
      description: 'A function.',
    });
    const graph = makeGraph([node]);

    const output = formatDocsOutput(['a.ts:A'], graph, 1);
    // Should only have one "# A" heading (from show wrapper), not two
    const headingCount = (output.match(/^# A$/gm) || []).length;
    expect(headingCount).toBe(1);
  });

  it('includes parameters table from renderNodeMarkdown', () => {
    const node = makeNode({
      id: 'a.ts:add',
      name: 'add',
      filePath: 'a.ts',
      structuredParams: [
        { name: 'a', type: 'number', isOptional: false, isRest: false },
        { name: 'b', type: 'number', isOptional: false, isRest: false },
      ],
    });
    const graph = makeGraph([node]);

    const output = formatDocsOutput(['a.ts:add'], graph, 1);
    expect(output).toContain('**Parameters:**');
    expect(output).toContain('| a |');
    expect(output).toContain('| b |');
  });

  it('includes calls table from renderNodeMarkdown', () => {
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A', filePath: 'a.ts' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' });
    const graph = makeGraph(
      [nodeA, nodeB],
      [{ id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false }],
    );

    const output = formatDocsOutput(['a.ts:A'], graph, 1);
    expect(output).toContain('**Calls:**');
    expect(output).toContain('`B`');
  });
});

describe('formatJsonOutput', () => {
  it('returns valid JSON with correct structure', () => {
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A', filePath: 'a.ts' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' });
    const graph = makeGraph(
      [nodeA, nodeB],
      [{ id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false }],
    );

    const output = formatJsonOutput(['a.ts:A'], graph, Number.POSITIVE_INFINITY);
    const parsed = JSON.parse(output);

    expect(parsed.targets).toEqual(['a.ts:A']);
    expect(parsed.depth).toBeNull();
    expect(parsed.nodes).toBeInstanceOf(Array);
    expect(parsed.edges).toBeInstanceOf(Array);
  });

  it('includes multiple targets in the combined subgraph', () => {
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A', filePath: 'a.ts' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' });
    const nodeC = makeNode({ id: 'c.ts:C', name: 'C', filePath: 'c.ts' });
    const graph = makeGraph(
      [nodeA, nodeB, nodeC],
      [
        { id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false },
        { id: 'e2', source: 'b.ts:B', target: 'c.ts:C', type: 'direct-call', isAsync: false },
      ],
    );

    const output = formatJsonOutput(['a.ts:A', 'c.ts:C'], graph, Number.POSITIVE_INFINITY);
    const parsed = JSON.parse(output);

    expect(parsed.targets).toEqual(['a.ts:A', 'c.ts:C']);
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.edges).toHaveLength(2);
  });

  it('sets depth to number when finite', () => {
    const node = makeNode({ id: 'a.ts:A', name: 'A', filePath: 'a.ts' });
    const graph = makeGraph([node]);

    const output = formatJsonOutput(['a.ts:A'], graph, 2);
    const parsed = JSON.parse(output);

    expect(parsed.depth).toBe(2);
  });

  it('preserves all GraphNode fields', () => {
    const node = makeNode({
      id: 'src/api/route.ts:GET',
      name: 'GET',
      filePath: 'src/api/route.ts',
      kind: 'function',
      isAsync: true,
      hash: 'abc123',
      lineRange: [10, 45] as [number, number],
      description: 'Handles GET requests',
      returnType: 'Promise<Response>',
      hasJsDoc: true,
      isExported: true,
      entryType: 'api-route',
      metadata: { httpMethod: 'GET', route: '/api/analyze' },
    });
    const graph = makeGraph([node]);

    const output = formatJsonOutput(['src/api/route.ts:GET'], graph, Number.POSITIVE_INFINITY);
    const parsed = JSON.parse(output);
    const jsonNode = parsed.nodes[0];

    expect(jsonNode.id).toBe('src/api/route.ts:GET');
    expect(jsonNode.kind).toBe('function');
    expect(jsonNode.isAsync).toBe(true);
    expect(jsonNode.hash).toBe('abc123');
    expect(jsonNode.lineRange).toEqual([10, 45]);
    expect(jsonNode.description).toBe('Handles GET requests');
    expect(jsonNode.returnType).toBe('Promise<Response>');
    expect(jsonNode.hasJsDoc).toBe(true);
    expect(jsonNode.isExported).toBe(true);
    expect(jsonNode.entryType).toBe('api-route');
    expect(jsonNode.metadata).toEqual({ httpMethod: 'GET', route: '/api/analyze' });
  });

  it('preserves all GraphEdge fields', () => {
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A', filePath: 'a.ts' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' });
    const graph = makeGraph(
      [nodeA, nodeB],
      [
        {
          id: 'e1',
          source: 'a.ts:A',
          target: 'b.ts:B',
          type: 'direct-call',
          isAsync: true,
          order: 0,
          label: 'calls B',
        },
      ],
    );

    const output = formatJsonOutput(['a.ts:A'], graph, Number.POSITIVE_INFINITY);
    const parsed = JSON.parse(output);
    const edge = parsed.edges[0];

    expect(edge.id).toBe('e1');
    expect(edge.source).toBe('a.ts:A');
    expect(edge.target).toBe('b.ts:B');
    expect(edge.type).toBe('direct-call');
    expect(edge.isAsync).toBe(true);
    expect(edge.order).toBe(0);
    expect(edge.label).toBe('calls B');
  });
});

describe('beautifyMermaid', () => {
  it('renders a simple flowchart as Unicode box-drawing art', async () => {
    const mermaid = 'flowchart TD\n  A["Start"] --> B["End"]';
    const output = await beautifyMermaid(mermaid);
    // Should contain box-drawing characters, not mermaid source
    expect(output).not.toContain('flowchart');
    expect(output).toContain('Start');
    expect(output).toContain('End');
  });

  it('renders mermaid output from formatMermaidOutput', async () => {
    const nodeA = makeNode({ id: 'a.ts:A', name: 'A', filePath: 'a.ts' });
    const nodeB = makeNode({ id: 'b.ts:B', name: 'B', filePath: 'b.ts' });
    const graph = makeGraph(
      [nodeA, nodeB],
      [{ id: 'e1', source: 'a.ts:A', target: 'b.ts:B', type: 'direct-call', isAsync: false }],
    );

    const mermaid = formatMermaidOutput(['a.ts:A'], graph, 1);
    const output = await beautifyMermaid(mermaid);
    expect(output).not.toContain('flowchart');
    expect(output).toContain('A');
    expect(output).toContain('B');
  });
});
