/**
 * Node-level diff between two graph snapshots.
 *
 * Compares symbol hashes to find modified, added, and removed nodes,
 * then builds an impact subgraph showing the call chain context.
 */

import { connectedSubgraph } from './graph-query.js';
import {
  edgeArrow,
  edgeTypeLabel,
  formatNodeLabel,
  sanitizeId,
  sanitizeLabel,
} from './graph-to-mermaid.js';
import type { FlowGraph, GraphEdge, GraphNode } from './types.js';

/** Complete diff result between two graph snapshots with impact context. */
export interface GraphDiff {
  /** Git ref used as the base for comparison. */
  base: string;
  /** Always "HEAD" — the current working directory graph. */
  head: string;
  /** Classified node changes by type. */
  changes: {
    modified: string[];
    added: string[];
    removed: string[];
  };
  /** Impact analysis of the changes. */
  impact: {
    /** Entry point node IDs within the impact subgraph. */
    entryPointsAffected: string[];
    /** Number of non-changed callers of changed nodes. */
    totalUpstream: number;
    /** Number of non-changed callees of changed nodes. */
    totalDownstream: number;
  };
  /** Nodes in the impact subgraph (changed nodes + neighbors up to depth). */
  nodes: GraphNode[];
  /** Edges in the impact subgraph. */
  edges: GraphEdge[];
}

/**
 * Compare two graph snapshots and produce a diff with impact context.
 *
 * Nodes are compared by hash — different hash means the symbol body changed.
 * The impact subgraph is built from the head graph using `connectedSubgraph`.
 *
 * @param baseGraph - The older graph snapshot (from a git ref)
 * @param headGraph - The current graph snapshot (from disk)
 * @param options - Comparison options
 * @param options.baseRef - Label for the base ref (included in output)
 * @param options.depth - Max traversal depth for impact zone (default: infinite)
 * @returns Full diff result with changes, impact stats, and subgraph
 */
export function diffGraphs(
  baseGraph: FlowGraph,
  headGraph: FlowGraph,
  options: { baseRef: string; depth?: number },
): GraphDiff {
  const baseNodes = new Map(baseGraph.nodes.map((n) => [n.id, n]));
  const headNodes = new Map(headGraph.nodes.map((n) => [n.id, n]));

  const modified: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  for (const [id, node] of headNodes) {
    const baseNode = baseNodes.get(id);
    if (!baseNode) {
      added.push(id);
    } else if (baseNode.hash !== node.hash) {
      modified.push(id);
    }
  }

  for (const id of baseNodes.keys()) {
    if (!headNodes.has(id)) {
      removed.push(id);
    }
  }

  const changedIds = [...modified, ...added];
  const depth = options.depth ?? Number.POSITIVE_INFINITY;

  const { nodes, edges } =
    changedIds.length > 0
      ? connectedSubgraph(headGraph, changedIds, depth)
      : { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };

  const entryPointsAffected = nodes.filter((n) => n.entryType).map((n) => n.id);

  const changedSet = new Set(changedIds);
  const callerIds = new Set<string>();
  const calleeIds = new Set<string>();
  for (const edge of edges) {
    if (changedSet.has(edge.target) && !changedSet.has(edge.source)) {
      callerIds.add(edge.source);
    }
    if (changedSet.has(edge.source) && !changedSet.has(edge.target)) {
      calleeIds.add(edge.target);
    }
  }

  return {
    base: options.baseRef,
    head: 'HEAD',
    changes: { modified, added, removed },
    impact: {
      entryPointsAffected,
      totalUpstream: callerIds.size,
      totalDownstream: calleeIds.size,
    },
    nodes,
    edges,
  };
}

/**
 * Generate a mermaid flowchart for a diff result with change-type highlighting.
 *
 * Uses `classDef` syntax with `modified` and `added` classes. Removed nodes
 * are not included (they don't exist in the head graph).
 *
 * @param nodes - Subgraph nodes to render
 * @param edges - Subgraph edges to render
 * @param modifiedIds - Set of node IDs that were modified
 * @param addedIds - Set of node IDs that were added
 * @returns Mermaid flowchart string with classDef definitions
 */
export function diffToMermaid(
  nodes: GraphNode[],
  edges: GraphEdge[],
  modifiedIds: Set<string>,
  addedIds: Set<string>,
): string {
  const lines: string[] = ['flowchart LR'];
  lines.push('  classDef modified fill:#fbbf24,stroke:#d97706,stroke-width:2px');
  lines.push('  classDef added fill:#4ade80,stroke:#16a34a,stroke-width:2px');

  const includedIds = new Set(nodes.map((n) => n.id));

  // Group nodes by file for subgraphs
  const fileGroups = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const group = fileGroups.get(node.filePath) || [];
    group.push(node);
    fileGroups.set(node.filePath, group);
  }

  for (const [filePath, fileNodes] of fileGroups) {
    if (fileGroups.size > 1) {
      lines.push(`  subgraph ${sanitizeId(filePath)}["${filePath}"]`);
    }

    for (const node of fileNodes) {
      const nodeId = sanitizeId(node.id);
      const label = formatNodeLabel(node);
      const shape = node.entryType ? `([${label}])` : `["${label}"]`;
      const indent = fileGroups.size > 1 ? '    ' : '  ';
      lines.push(`${indent}${nodeId}${shape}`);
    }

    if (fileGroups.size > 1) {
      lines.push('  end');
    }
  }

  // Generate edges
  for (const edge of edges) {
    const sourceId = sanitizeId(edge.source);
    const targetId = sanitizeId(edge.target);
    const arrow = edgeArrow(edge);
    const rawLabel = edge.label || edgeTypeLabel(edge);
    const label = rawLabel ? `|"${sanitizeLabel(rawLabel)}"|` : '';
    lines.push(`  ${sourceId} ${arrow}${label} ${targetId}`);
  }

  // Apply change-type classes
  for (const id of modifiedIds) {
    if (includedIds.has(id)) {
      lines.push(`  class ${sanitizeId(id)} modified`);
    }
  }
  for (const id of addedIds) {
    if (includedIds.has(id)) {
      lines.push(`  class ${sanitizeId(id)} added`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a human-readable text summary of a graph diff.
 *
 * Intended for stderr output so it doesn't pollute structured output on stdout.
 *
 * @param diff - The diff result to summarize
 * @returns Multi-line text summary
 */
export function formatDiffSummary(diff: GraphDiff): string {
  const { modified, added, removed } = diff.changes;
  const parts: string[] = [];

  if (modified.length > 0) parts.push(`${modified.length} symbols changed`);
  if (added.length > 0) parts.push(`${added.length} added`);
  if (removed.length > 0) parts.push(`${removed.length} removed`);

  if (parts.length === 0) return 'No symbol changes detected.';

  const lines: string[] = [parts.join(', ')];

  if (diff.impact.entryPointsAffected.length > 0) {
    lines.push(
      `${diff.impact.entryPointsAffected.length} entry points affected: ${diff.impact.entryPointsAffected.join(', ')}`,
    );
  }

  if (diff.impact.totalUpstream > 0 || diff.impact.totalDownstream > 0) {
    lines.push(
      `Impact: ${diff.impact.totalUpstream} upstream callers, ${diff.impact.totalDownstream} downstream callees`,
    );
  }

  return lines.join('\n');
}
