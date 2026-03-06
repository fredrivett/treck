/**
 * Pure helper functions for AI chat over a flow graph.
 *
 * Shared between the local treck server (`src/server/chat.ts`) and the
 * website's Astro API endpoint (`website/src/pages/api/chat.ts`). No
 * Node.js http dependencies — safe to import in any environment.
 */

import type { FlowGraph, GraphNode } from './types.js';

/**
 * Pick example nodes for the system prompt.
 *
 * Selects entry points and the most-connected nodes to teach the AI the
 * ID format and give it a sense of the codebase structure.
 *
 * @param graph - The full flow graph
 * @returns Formatted example node lines
 */
function pickExampleNodes(graph: FlowGraph): string {
  const connectionCount = new Map<string, number>();
  for (const node of graph.nodes) {
    connectionCount.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    connectionCount.set(edge.source, (connectionCount.get(edge.source) || 0) + 1);
    connectionCount.set(edge.target, (connectionCount.get(edge.target) || 0) + 1);
  }

  const entryPoints = graph.nodes.filter((n) => n.entryType);
  const nonEntries = graph.nodes
    .filter((n) => !n.entryType)
    .sort((a, b) => (connectionCount.get(b.id) || 0) - (connectionCount.get(a.id) || 0));

  const examples: GraphNode[] = [];
  // Take up to 5 entry points
  for (const node of entryPoints.slice(0, 5)) {
    examples.push(node);
  }
  // Fill up to 10 total with most-connected nodes
  for (const node of nonEntries) {
    if (examples.length >= 10) break;
    if (!examples.includes(node)) {
      examples.push(node);
    }
  }

  return examples
    .map((n) => {
      const flags = [n.kind, n.isAsync && 'async', n.entryType].filter(Boolean).join(', ');
      const desc = n.description ? ` "${n.description}"` : '';
      return `- ${n.id} [${flags}]${desc}`;
    })
    .join('\n');
}

/**
 * Build the system prompt with example nodes and instructions.
 *
 * @param graph - The full flow graph
 * @returns System prompt string
 */
export function buildSystemPrompt(graph: FlowGraph): string {
  const examples = pickExampleNodes(graph);
  return `You are a code navigation assistant for a TypeScript/JavaScript project.

This project has ${graph.nodes.length} symbols (functions, classes, components, hooks, etc.) and ${graph.edges.length} call relationships between them.

Example nodes in this project:
${examples}

Node IDs follow the format "filePath:symbolName" (e.g. "src/api/route.ts:POST").

## Instructions
- Use search_nodes to find relevant functions, classes, or components
- Use select_nodes to highlight them in the graph visualization so the user can see the code flow
- When explaining code flow, select the key nodes involved so the user can see the visual path
- Keep explanations concise and focused on the code structure
- You can call search_nodes multiple times to explore different parts of the codebase`;
}

/**
 * Execute a search_nodes tool call against the graph.
 *
 * @param query - Search query string
 * @param graph - The full flow graph
 * @returns Array of matching nodes (up to 20)
 */
export function executeSearchNodes(query: string, graph: FlowGraph) {
  const q = query.toLowerCase();
  return graph.nodes
    .filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.filePath.toLowerCase().includes(q) ||
        n.description?.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q),
    )
    .slice(0, 20)
    .map((n) => ({
      id: n.id,
      name: n.name,
      kind: n.kind,
      filePath: n.filePath,
      entryType: n.entryType || undefined,
      description: n.description || undefined,
    }));
}

/**
 * Validate node IDs for a select_nodes tool call.
 *
 * @param nodeIds - Array of node IDs to validate
 * @param graph - The full flow graph
 * @returns Object with validated IDs and any that weren't found
 */
export function executeSelectNodes(nodeIds: string[], graph: FlowGraph) {
  const validIds = new Set(graph.nodes.map((n) => n.id));
  const valid = nodeIds.filter((id) => validIds.has(id));
  const invalid = nodeIds.filter((id) => !validIds.has(id));

  const result: Record<string, unknown> = { selected: valid };
  if (invalid.length > 0) {
    result.not_found = invalid;
  }
  return result;
}
