/**
 * POST /api/chat
 *
 * Serverless chat endpoint for website showcases. Mirrors the local treck
 * server's `/api/chat` handler but runs as a Vercel serverless function.
 * Reads `project` from the request body, loads the showcase graph from the
 * public CDN, then streams an AI response using the same tools as the local
 * viewer.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import type { APIRoute } from 'astro';
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from 'ai';
import { z } from 'zod';
import {
  buildSystemPrompt,
  executeSearchNodes,
  executeSelectNodes,
} from '@treck/graph/chat-helpers.js';
import type { FlowGraph } from '@treck/graph/types.js';
import { showcases } from '../../showcases';

export const prerender = false;

/** Valid showcase slugs — used to prevent path traversal. */
const VALID_SLUGS = new Set(showcases.map((s) => s.slug));

/** POST /api/chat */
export const POST: APIRoute = async (context) => {
  let body: { messages: UIMessage[]; apiKey: string; model?: string; project?: string };
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { project } = body;

  if (!project || !VALID_SLUGS.has(project)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing project' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.apiKey) {
    return new Response(JSON.stringify({ error: 'apiKey is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch the graph JSON from the public static URL (served by Vercel CDN)
  const graphUrl = new URL(`/showcases/${project}.json`, context.url);
  let graph: FlowGraph;
  try {
    const res = await fetch(graphUrl.toString());
    if (!res.ok) throw new Error(`Graph fetch failed: ${res.status}`);
    graph = (await res.json()) as FlowGraph;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: `Failed to load graph: ${message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
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

  return result.toUIMessageStreamResponse();
};
