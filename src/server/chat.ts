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
import {
  buildSystemPrompt,
  executeSearchNodes,
  executeSelectNodes,
} from '../graph/chat-helpers.js';
import type { FlowGraph } from '../graph/types.js';

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
  try {
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
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: `Chat request failed: ${message}` }));
  }
}
