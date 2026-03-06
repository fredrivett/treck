/**
 * Chat endpoint handler for the treck viewer.
 *
 * Proxies chat messages to the Anthropic Messages API, injecting graph
 * context as a system prompt. Provides `search_nodes` and `select_nodes`
 * tools so the AI can discover and highlight relevant nodes in the graph.
 */

import type { FlowGraph, GraphNode } from '../graph/types.js';

/** Incoming request body from the viewer chat panel. */
interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  apiKey: string;
  model?: string;
}

/** Response sent back to the viewer. */
interface ChatResponse {
  message: string;
  selectedNodeIds: string[];
}

/** Anthropic tool definition. */
const TOOLS = [
  {
    name: 'search_nodes',
    description:
      'Search for functions, classes, components, and other symbols in the codebase. Returns matching nodes with their IDs, names, kinds, file paths, and descriptions. Use this to discover what exists before selecting nodes to show the user.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Search query to match against node names, file paths, and descriptions (case-insensitive substring match)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'select_nodes',
    description:
      'Select nodes in the graph visualization to show the user. This highlights the selected nodes and filters the view to show only their connected subgraph (upstream callers and downstream callees). Use this after searching to show relevant code flow.',
    input_schema: {
      type: 'object' as const,
      properties: {
        node_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of node IDs to select (e.g. ["src/api/route.ts:POST"])',
        },
      },
      required: ['node_ids'],
    },
  },
];

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
 * @returns JSON string of matching nodes (up to 20)
 */
function executeSearchNodes(query: string, graph: FlowGraph): string {
  const q = query.toLowerCase();
  const matches = graph.nodes
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

  return JSON.stringify(matches);
}

/**
 * Validate node IDs for a select_nodes tool call.
 *
 * @param nodeIds - Array of node IDs to validate
 * @param graph - The full flow graph
 * @returns JSON string with validated IDs and any that weren't found
 */
function executeSelectNodes(nodeIds: string[], graph: FlowGraph): string {
  const validIds = new Set(graph.nodes.map((n) => n.id));
  const valid = nodeIds.filter((id) => validIds.has(id));
  const invalid = nodeIds.filter((id) => !validIds.has(id));

  const result: Record<string, unknown> = { selected: valid };
  if (invalid.length > 0) {
    result.not_found = invalid;
  }
  return JSON.stringify(result);
}

/** Anthropic Messages API message content block. */
interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

/** Anthropic Messages API message. */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

/**
 * Handle a POST /api/chat request.
 *
 * Proxies user messages to the Anthropic Messages API with graph context,
 * handles the tool-use loop for search_nodes and select_nodes, and returns
 * the final text response along with any selected node IDs.
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

  let body: ChatRequest;
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

  const model = body.model || 'claude-haiku-4-5-20251001';
  const systemPrompt = buildSystemPrompt(graph);

  // Convert chat messages to Anthropic format
  const messages: AnthropicMessage[] = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let selectedNodeIds: string[] = [];
  const maxToolRounds = 10;

  try {
    for (let round = 0; round < maxToolRounds; round++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': body.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: systemPrompt,
          messages,
          tools: TOOLS,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Anthropic API error: ${errorText}` }));
        return;
      }

      const data = await response.json();

      // Extract text and tool_use blocks from the response
      const contentBlocks: AnthropicContentBlock[] = data.content || [];
      const textParts: string[] = [];
      const toolUseBlocks: AnthropicContentBlock[] = [];

      for (const block of contentBlocks) {
        if (block.type === 'text' && block.text) {
          textParts.push(block.text);
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
        }
      }

      // If no tool calls, we're done
      if (toolUseBlocks.length === 0 || data.stop_reason === 'end_turn') {
        const result: ChatResponse = {
          message: textParts.join('\n') || '',
          selectedNodeIds,
        };
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(result));
        return;
      }

      // Add the assistant's response (with tool_use blocks) to conversation
      messages.push({ role: 'assistant', content: contentBlocks });

      // Process tool calls and build tool_result blocks
      const toolResults: AnthropicContentBlock[] = [];

      for (const block of toolUseBlocks) {
        const name = block.name ?? '';
        const input = block.input ?? {};
        let toolResult: string;

        if (name === 'search_nodes') {
          toolResult = executeSearchNodes(input.query as string, graph);
        } else if (name === 'select_nodes') {
          toolResult = executeSelectNodes(input.node_ids as string[], graph);
          const parsed = JSON.parse(toolResult);
          if (parsed.selected) {
            selectedNodeIds = parsed.selected;
          }
        } else {
          toolResult = JSON.stringify({ error: `Unknown tool: ${name}` });
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: toolResult,
        });
      }

      // Add tool results as a user message (Anthropic format)
      messages.push({ role: 'user', content: toolResults });
    }

    // If we hit max rounds, return what we have
    const result: ChatResponse = {
      message:
        'I explored the codebase but reached the maximum number of steps. Here is what I found so far.',
      selectedNodeIds,
    };
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Chat request failed: ${message}` }));
  }
}
