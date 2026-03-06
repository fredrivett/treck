/**
 * Chat endpoint handler for the treck viewer.
 *
 * Uses the Vercel AI SDK to stream responses from the Anthropic API,
 * injecting graph context as a system prompt. Provides `search_nodes`
 * and `select_nodes` tools so the AI can discover and highlight
 * relevant nodes in the graph.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from 'ai';
import { z } from 'zod';
import type { FlowGraph, GraphNode } from '../graph/types.js';

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
function buildSystemPrompt(graph: FlowGraph): string {
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
function executeSearchNodes(query: string, graph: FlowGraph) {
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
function executeSelectNodes(nodeIds: string[], graph: FlowGraph) {
  const validIds = new Set(graph.nodes.map((n) => n.id));
  const valid = nodeIds.filter((id) => validIds.has(id));
  const invalid = nodeIds.filter((id) => !validIds.has(id));

  const result: Record<string, unknown> = { selected: valid };
  if (invalid.length > 0) {
    result.not_found = invalid;
  }
  return result;
}

/**
 * Handle a POST /api/chat request.
 *
 * Streams responses from the Anthropic API with graph context,
 * automatically handling the tool-use loop for search_nodes and
 * select_nodes via the AI SDK.
 *
 * @param req - Incoming HTTP request
 * @param res - HTTP response
 * @param graph - The current flow graph
 */
export async function handleChatRequest(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  graph: FlowGraph,
): Promise<void> {
  // Parse request body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }

  let body: { messages: UIMessage[]; apiKey: string; model?: string };
  try {
    body = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  if (!body.apiKey) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'apiKey is required' }));
    return;
  }

  const anthropic = createAnthropic({ apiKey: body.apiKey });
  const model = body.model || 'claude-haiku-4-5-20251001';
  const systemPrompt = buildSystemPrompt(graph);

  try {
    const result = streamText({
      model: anthropic(model),
      system: systemPrompt,
      messages: await convertToModelMessages(body.messages),
      tools: {
        search_nodes: tool({
          description:
            'Search for functions, classes, components, and other symbols in the codebase. Returns matching nodes with their IDs, names, kinds, file paths, and descriptions. Use this to discover what exists before selecting nodes to show the user.',
          inputSchema: z.object({
            query: z
              .string()
              .describe(
                'Search query to match against node names, file paths, and descriptions (case-insensitive substring match)',
              ),
          }),
          execute: async ({ query }) => executeSearchNodes(query, graph),
        }),
        select_nodes: tool({
          description:
            'Select nodes in the graph visualization to show the user. This highlights the selected nodes and filters the view to show only their connected subgraph (upstream callers and downstream callees). Use this after searching to show relevant code flow.',
          inputSchema: z.object({
            node_ids: z
              .array(z.string())
              .describe('Array of node IDs to select (e.g. ["src/api/route.ts:POST"])'),
          }),
          execute: async ({ node_ids }) => executeSelectNodes(node_ids, graph),
        }),
      },
      stopWhen: stepCountIs(10),
    });

    result.pipeUIMessageStreamToResponse(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Chat request failed: ${message}` }));
  }
}
