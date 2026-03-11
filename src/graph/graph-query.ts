/**
 * Graph query utilities
 *
 * Provides graph traversal algorithms for flow tracing:
 * - Find entry points
 * - BFS from a node to find all reachable nodes
 * - Find paths between two nodes
 */

import type { FlowGraph, GraphEdge, GraphNode } from './types.js';

/**
 * Find all entry point nodes in the graph
 */
export function entryPoints(graph: FlowGraph): GraphNode[] {
  return graph.nodes.filter((node) => node.entryType !== undefined);
}

/**
 * Find all nodes reachable from a starting node via BFS.
 * Returns the subgraph (nodes + edges) reachable from the start.
 */
export function reachableFrom(
  graph: FlowGraph,
  startNodeId: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const adjacency = buildAdjacencyList(graph);
  const visited = new Set<string>();
  const queue: string[] = [startNodeId];
  let head = 0;
  visited.add(startNodeId);

  while (head < queue.length) {
    const current = queue[head++];
    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const reachableNodes = [...visited]
    .map((id) => nodeMap.get(id))
    .filter((n): n is GraphNode => n !== undefined);

  const reachableEdges = graph.edges.filter((e) => visited.has(e.source) && visited.has(e.target));

  return { nodes: reachableNodes, edges: reachableEdges };
}

/**
 * Find all paths between two nodes using DFS.
 * Returns an array of paths, where each path is an array of node IDs.
 * Limits to maxPaths to avoid combinatorial explosion.
 */
export function pathsBetween(
  graph: FlowGraph,
  fromId: string,
  toId: string,
  maxPaths = 10,
): string[][] {
  const adjacency = buildAdjacencyList(graph);
  const results: string[][] = [];

  function dfs(current: string, path: string[], visited: Set<string>): void {
    if (results.length >= maxPaths) return;

    if (current === toId) {
      results.push([...path]);
      return;
    }

    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfs(neighbor, path, visited);
        path.pop();
        visited.delete(neighbor);
      }
    }
  }

  const visited = new Set<string>([fromId]);
  dfs(fromId, [fromId], visited);
  return results;
}

/**
 * Find all nodes connected to the start nodes via bidirectional BFS.
 *
 * Traverses both callers (incoming edges) and callees (outgoing edges)
 * up to `depth` hops from any start node. Returns the subgraph of all
 * reachable nodes and their connecting edges.
 *
 * @param graph - The full flow graph
 * @param startNodeIds - One or more node IDs to start traversal from
 * @param depth - Maximum traversal depth (default: Infinity for full connected flow)
 * @returns Subgraph containing all connected nodes and edges
 */
export function connectedSubgraph(
  graph: FlowGraph,
  startNodeIds: string[],
  depth = Number.POSITIVE_INFINITY,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const { nodes, edges } = connectedSubgraphWithDepths(graph, startNodeIds, depth);
  return { nodes, edges };
}

/**
 * Find all nodes connected to the start nodes via bidirectional BFS, tracking depth.
 *
 * Like `connectedSubgraph`, but also returns a map of node ID → minimum
 * distance (in hops) from the nearest start node, and the maximum depth reached.
 * Start nodes have depth 0.
 *
 * @param graph - The full flow graph
 * @param startNodeIds - One or more node IDs to start traversal from
 * @param depth - Maximum traversal depth (default: Infinity for full connected flow)
 * @returns Subgraph with nodes, edges, per-node depths, and max depth
 */
export function connectedSubgraphWithDepths(
  graph: FlowGraph,
  startNodeIds: string[],
  depth = Number.POSITIVE_INFINITY,
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeDepths: Record<string, number>;
  maxDepth: number;
} {
  const forward = buildAdjacencyList(graph);
  const reverse = buildReverseAdjacencyList(graph);

  const depthMap = new Map<string, number>();
  for (const id of startNodeIds) {
    depthMap.set(id, 0);
  }

  const visited = new Set<string>(startNodeIds);
  let frontier = new Set<string>(startNodeIds);
  let maxReached = 0;

  for (let d = 0; d < depth; d++) {
    const nextFrontier = new Set<string>();
    for (const id of frontier) {
      for (const neighbor of forward.get(id) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          depthMap.set(neighbor, d + 1);
          nextFrontier.add(neighbor);
        }
      }
      for (const neighbor of reverse.get(id) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          depthMap.set(neighbor, d + 1);
          nextFrontier.add(neighbor);
        }
      }
    }
    if (nextFrontier.size === 0) break;
    maxReached = d + 1;
    frontier = nextFrontier;
  }

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const nodes = [...visited]
    .map((id) => nodeMap.get(id))
    .filter((n): n is GraphNode => n !== undefined);

  const edges = graph.edges.filter((e) => visited.has(e.source) && visited.has(e.target));

  const nodeDepths: Record<string, number> = {};
  for (const [id, d] of depthMap) {
    nodeDepths[id] = d;
  }

  return { nodes, edges, nodeDepths, maxDepth: maxReached };
}

/**
 * Build a forward adjacency list from graph edges (source → [targets]).
 */
function buildAdjacencyList(graph: FlowGraph): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const neighbors = adjacency.get(edge.source) || [];
    neighbors.push(edge.target);
    adjacency.set(edge.source, neighbors);
  }
  return adjacency;
}

/**
 * Build a reverse adjacency list from graph edges (target → [sources]).
 */
function buildReverseAdjacencyList(graph: FlowGraph): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const neighbors = adjacency.get(edge.target) || [];
    neighbors.push(edge.source);
    adjacency.set(edge.target, neighbors);
  }
  return adjacency;
}
