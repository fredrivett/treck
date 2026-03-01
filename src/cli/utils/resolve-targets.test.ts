/**
 * Tests for shared focus target resolution utilities
 */

import { describe, expect, it } from 'vitest';
import type { FlowGraph, GraphNode } from '../../graph/types.js';
import type { TreckConfig } from './config.js';
import { explainUnresolved, resolveFocusTargets } from './resolve-targets.js';

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

describe('resolveFocusTargets', () => {
  const graph = makeGraph([
    makeNode({ id: 'src/api/route.ts:GET', name: 'GET', filePath: 'src/api/route.ts' }),
    makeNode({ id: 'src/api/route.ts:POST', name: 'POST', filePath: 'src/api/route.ts' }),
    makeNode({ id: 'src/lib/db.ts:query', name: 'query', filePath: 'src/lib/db.ts' }),
  ]);

  it('resolves exact node IDs', () => {
    const result = resolveFocusTargets('src/api/route.ts:GET', graph);
    expect(result.nodeIds).toEqual(['src/api/route.ts:GET']);
    expect(result.unresolved).toEqual([]);
  });

  it('resolves file paths to all symbols in that file', () => {
    const result = resolveFocusTargets('src/api/route.ts', graph);
    expect(result.nodeIds).toEqual(['src/api/route.ts:GET', 'src/api/route.ts:POST']);
    expect(result.unresolved).toEqual([]);
  });

  it('handles comma-separated targets', () => {
    const result = resolveFocusTargets('src/api/route.ts:GET, src/lib/db.ts:query', graph);
    expect(result.nodeIds).toEqual(['src/api/route.ts:GET', 'src/lib/db.ts:query']);
    expect(result.unresolved).toEqual([]);
  });

  it('reports unresolved targets', () => {
    const result = resolveFocusTargets('src/api/route.ts:GET, src/unknown.ts:foo', graph);
    expect(result.nodeIds).toEqual(['src/api/route.ts:GET']);
    expect(result.unresolved).toEqual(['src/unknown.ts:foo']);
  });

  it('handles empty string', () => {
    const result = resolveFocusTargets('', graph);
    expect(result.nodeIds).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });

  it('trims whitespace from targets', () => {
    const result = resolveFocusTargets('  src/api/route.ts:GET  ', graph);
    expect(result.nodeIds).toEqual(['src/api/route.ts:GET']);
  });

  it('mixes exact IDs and file paths', () => {
    const result = resolveFocusTargets('src/api/route.ts:GET, src/lib/db.ts', graph);
    expect(result.nodeIds).toEqual(['src/api/route.ts:GET', 'src/lib/db.ts:query']);
    expect(result.unresolved).toEqual([]);
  });
});

describe('explainUnresolved', () => {
  const config: TreckConfig = {
    outputDir: '_treck',
    scope: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  };

  it('returns reason when file is not matched by include', () => {
    const reason = explainUnresolved('lib/external.ts', config);
    expect(reason).toContain('not matched by scope.include');
  });

  it('returns reason when file is matched by exclude', () => {
    const reason = explainUnresolved('src/api/route.test.ts', config);
    expect(reason).toBe('matched by scope.exclude');
  });

  it('returns null when file is in scope (cause unclear)', () => {
    const reason = explainUnresolved('src/api/route.ts', config);
    expect(reason).toBeNull();
  });
});
