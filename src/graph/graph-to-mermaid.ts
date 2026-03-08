/**
 * Deterministic mermaid diagram generation from graph data
 *
 * Replaces AI-generated mermaid with accurate, graph-derived diagrams.
 */

import { connectedSubgraph } from './graph-query.js';
import type { FlowGraph, GraphEdge, GraphNode } from './types.js';

/**
 * Generate a mermaid flowchart for a specific node and its connections.
 *
 * Traverses callers and callees up to `depth` hops from the target node
 * and renders them as a mermaid flowchart with the target highlighted.
 *
 * @param graph - The full flow graph
 * @param nodeId - The node to center the diagram on
 * @param depth - Traversal depth (default: Infinity for full connected flow)
 */
export function nodeToMermaid(
  graph: FlowGraph,
  nodeId: string,
  depth = Number.POSITIVE_INFINITY,
): string {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  if (!nodeMap.has(nodeId)) return '';

  const { nodes, edges } = connectedSubgraph(graph, [nodeId], depth);
  const included = new Set(nodes.map((n) => n.id));

  return buildMermaid(new Set([nodeId]), included, edges, nodeMap);
}

/**
 * Generate a mermaid flowchart for an entire flow.
 *
 * Renders all provided nodes and edges as a mermaid flowchart.
 * Optionally highlights specific nodes (e.g. entry points or targets).
 *
 * @param nodes - The nodes to include in the diagram
 * @param edges - The edges connecting the nodes
 * @param highlightIds - Set of node IDs to highlight (blue styling)
 */
export function flowToMermaid(
  nodes: GraphNode[],
  edges: GraphEdge[],
  highlightIds?: Set<string>,
): string {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const included = new Set(nodes.map((n) => n.id));
  return buildMermaid(highlightIds ?? new Set<string>(), included, edges, nodeMap);
}

/**
 * Build a mermaid flowchart string from a set of nodes and edges.
 *
 * Groups nodes into subgraphs by file path, applies styling to
 * highlighted nodes and entry points, and renders edge arrows based on type.
 */
function buildMermaid(
  highlightIds: Set<string>,
  includedIds: Set<string>,
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
): string {
  const lines: string[] = ['flowchart TD'];

  // Group nodes by file for subgraphs
  const fileGroups = new Map<string, GraphNode[]>();
  for (const id of includedIds) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const group = fileGroups.get(node.filePath) || [];
    group.push(node);
    fileGroups.set(node.filePath, group);
  }

  // Generate node definitions grouped by file
  for (const [filePath, nodes] of fileGroups) {
    if (fileGroups.size > 1) {
      lines.push(`  subgraph ${sanitizeId(filePath)}["${filePath}"]`);
    }

    for (const node of nodes) {
      const nodeId = sanitizeId(node.id);
      const label = formatNodeLabel(node);
      // Asymmetric shape for entry points — keep in sync with diff.ts:nodeShape
      const shape = node.entryType ? `>${label}]` : `["${label}"]`;
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

  // Style highlighted nodes
  for (const id of highlightIds) {
    if (includedIds.has(id)) {
      const nodeId = sanitizeId(id);
      lines.push(
        `  style ${nodeId} fill:var(--dep-highlight-fill),stroke:var(--dep-highlight-stroke),stroke-width:2px`,
      );
    }
  }

  // Style entry point nodes (unless already highlighted)
  for (const id of includedIds) {
    const node = nodeMap.get(id);
    if (node?.entryType && !highlightIds.has(id)) {
      const nodeId = sanitizeId(id);
      lines.push(
        `  style ${nodeId} fill:var(--dep-entry-fill),stroke:var(--dep-entry-stroke),stroke-width:2px`,
      );
    }
  }

  return lines.join('\n');
}

/** Build a display label for a graph node, including async prefix and metadata. */
export function formatNodeLabel(node: GraphNode): string {
  let label = node.name;
  if (node.isAsync) label = `async ${label}`;
  if (node.metadata?.httpMethod) {
    label = `${node.metadata.httpMethod} ${label}`;
  }
  if (node.metadata?.eventTrigger) {
    label = `${label}\\n${node.metadata.eventTrigger}`;
  }
  if (node.metadata?.taskId) {
    label = `${label}\\n${node.metadata.taskId}`;
  }
  return label;
}

/** Return the mermaid arrow syntax for a given edge type. */
export function edgeArrow(edge: GraphEdge): string {
  if (edge.type === 'error-handler') return '-.->';
  if (edge.type === 'event-emit' || edge.type === 'async-dispatch') return '-.->';
  if (edge.type === 'http-request') return '-->';
  if (edge.type === 'conditional-call') return '-.->';
  return '-->';
}

/** Return a label derived from the edge type, if applicable. */
export function edgeTypeLabel(edge: GraphEdge): string | undefined {
  if (edge.type === 'error-handler') return 'error';
  if (edge.type === 'http-request') return 'HTTP';
  return undefined;
}

/**
 * Sanitize a label for mermaid (escape characters that break parsing)
 */
export function sanitizeLabel(label: string): string {
  return label.replace(/[>"<|]/g, (ch) => `#${ch.charCodeAt(0)};`);
}

/**
 * Sanitize a node ID for mermaid (replace special characters)
 */
export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '_');
}
