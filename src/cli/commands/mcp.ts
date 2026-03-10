import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CAC } from 'cac';
import { z } from 'zod';
import { version } from '../../../package.json';
import { StaleChecker } from '../../checker/index.js';
import { executeSearchNodes } from '../../graph/chat-helpers.js';
import { diffGraphs } from '../../graph/diff.js';
import { connectedSubgraph, entryPoints, pathsBetween } from '../../graph/graph-query.js';
import { GraphStore } from '../../graph/graph-store.js';
import { buildSearchIndex, type SearchIndex } from '../../graph/search.js';
import { syncGraph } from '../../graph/sync.js';
import type { FlowGraph, GraphNode } from '../../graph/types.js';
import { loadConfig } from '../utils/config.js';
import { loadGraphAtRef } from '../utils/git.js';
import { resolveFocusTargets } from '../utils/resolve-targets.js';

/** MCP response content for a text result. */
interface McpTextResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Handle `search_nodes` tool — find symbols by name, file path, or description.
 *
 * @param query - Search query string
 * @param graph - The flow graph to search
 * @param index - Optional pre-built search index for better matching
 */
export function handleSearchNodes(
  query: string,
  graph: FlowGraph,
  index?: SearchIndex,
): McpTextResponse {
  const results = executeSearchNodes(query, graph, index);
  return {
    content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
  };
}

/**
 * Handle `show_symbol` tool — get the connected subgraph for one or more targets.
 *
 * @param targets - Comma-separated targets in "filePath:symbolName" format
 * @param depth - Max traversal depth, or undefined for full connected flow
 * @param graph - The flow graph to query
 */
export function handleShowSymbol(
  targets: string,
  depth: number | undefined,
  graph: FlowGraph,
): McpTextResponse {
  const { nodeIds, unresolved } = resolveFocusTargets(targets, graph);
  if (nodeIds.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `No symbols found for: ${targets}. Unresolved: ${unresolved.join(', ')}`,
        },
      ],
      isError: true,
    };
  }
  const d = depth ?? Number.POSITIVE_INFINITY;
  const { nodes, edges } = connectedSubgraph(graph, nodeIds, d);
  const result = { targets: nodeIds, depth: depth ?? null, nodes, edges };
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * Handle `list_entry_points` tool — list all entry points in the project.
 *
 * @param kind - Optional filter by entry type
 * @param graph - The flow graph to query
 */
export function handleListEntryPoints(kind: string | undefined, graph: FlowGraph): McpTextResponse {
  let entries = entryPoints(graph);
  if (kind) {
    entries = entries.filter((n) => n.entryType === kind);
  }
  const summary = entries.map((n) => ({
    id: n.id,
    name: n.name,
    kind: n.kind,
    entryType: n.entryType,
    filePath: n.filePath,
    description: n.description || undefined,
  }));
  return {
    content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
  };
}

/**
 * Handle `find_callers` tool — find all symbols that call a given symbol.
 *
 * @param nodeId - Target node ID
 * @param depth - Max traversal depth (default 1)
 * @param graph - The flow graph to query
 */
export function handleFindCallers(
  nodeId: string,
  depth: number,
  graph: FlowGraph,
): McpTextResponse {
  const reverse = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const neighbors = reverse.get(edge.target) || [];
    neighbors.push(edge.source);
    reverse.set(edge.target, neighbors);
  }
  const visited = new Set<string>([nodeId]);
  let frontier = new Set<string>([nodeId]);
  for (let i = 0; i < depth; i++) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const neighbor of reverse.get(id) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.add(neighbor);
        }
      }
    }
    if (next.size === 0) break;
    frontier = next;
  }
  visited.delete(nodeId);
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const callers = [...visited]
    .map((id) => nodeMap.get(id))
    .filter((n): n is GraphNode => n !== undefined)
    .map((n) => ({
      id: n.id,
      name: n.name,
      kind: n.kind,
      filePath: n.filePath,
      entryType: n.entryType,
    }));
  const edges = graph.edges.filter(
    (e) =>
      (visited.has(e.source) && e.target === nodeId) ||
      (visited.has(e.source) && visited.has(e.target)),
  );
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ target: nodeId, depth, callers, edges }, null, 2),
      },
    ],
  };
}

/**
 * Handle `find_callees` tool — find all symbols that a given symbol calls.
 *
 * @param nodeId - Source node ID
 * @param depth - Max traversal depth (default 1)
 * @param graph - The flow graph to query
 */
export function handleFindCallees(
  nodeId: string,
  depth: number,
  graph: FlowGraph,
): McpTextResponse {
  const forward = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const neighbors = forward.get(edge.source) || [];
    neighbors.push(edge.target);
    forward.set(edge.source, neighbors);
  }
  const visited = new Set<string>([nodeId]);
  let frontier = new Set<string>([nodeId]);
  for (let i = 0; i < depth; i++) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const neighbor of forward.get(id) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.add(neighbor);
        }
      }
    }
    if (next.size === 0) break;
    frontier = next;
  }
  visited.delete(nodeId);
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const callees = [...visited]
    .map((id) => nodeMap.get(id))
    .filter((n): n is GraphNode => n !== undefined)
    .map((n) => ({
      id: n.id,
      name: n.name,
      kind: n.kind,
      filePath: n.filePath,
      entryType: n.entryType,
    }));
  const edges = graph.edges.filter(
    (e) =>
      (e.source === nodeId && visited.has(e.target)) ||
      (visited.has(e.source) && visited.has(e.target)),
  );
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ source: nodeId, depth, callees, edges }, null, 2),
      },
    ],
  };
}

/**
 * Handle `paths_between` tool — find call paths between two symbols.
 *
 * @param from - Source node ID
 * @param to - Target node ID
 * @param maxPaths - Max number of paths to return
 * @param graph - The flow graph to query
 */
export function handlePathsBetween(
  from: string,
  to: string,
  maxPaths: number,
  graph: FlowGraph,
): McpTextResponse {
  const paths = pathsBetween(graph, from, to, maxPaths);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ from, to, pathCount: paths.length, paths }, null, 2),
      },
    ],
  };
}

/**
 * Handle `get_graph_summary` tool — overview stats for the project graph.
 *
 * @param graph - The flow graph to summarize
 */
export function handleGetGraphSummary(graph: FlowGraph): McpTextResponse {
  const kindCounts: Record<string, number> = {};
  for (const node of graph.nodes) {
    kindCounts[node.kind] = (kindCounts[node.kind] || 0) + 1;
  }
  const entryTypeCounts: Record<string, number> = {};
  for (const node of graph.nodes) {
    if (node.entryType) {
      entryTypeCounts[node.entryType] = (entryTypeCounts[node.entryType] || 0) + 1;
    }
  }
  const summary = {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    entryPointCount: graph.nodes.filter((n) => n.entryType).length,
    kindCounts,
    entryTypeCounts,
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
  };
}

/**
 * Handle `diff_graph` tool — compare current graph against a base git ref.
 *
 * Loads graph.json from the base ref via `git show` and diffs it against
 * the current in-memory graph by node hash.
 *
 * @param baseRef - Git ref to compare against (branch, tag, or commit)
 * @param depth - Max traversal depth for impact zone, or undefined for full flow
 * @param graphPath - Relative path to graph.json from repo root
 * @param currentGraph - The current in-memory graph
 */
export function handleDiffGraph(
  baseRef: string,
  depth: number | undefined,
  graphPath: string,
  currentGraph: FlowGraph,
): McpTextResponse {
  let baseGraph: FlowGraph;
  try {
    baseGraph = loadGraphAtRef(baseRef, graphPath);
  } catch (err) {
    return {
      content: [{ type: 'text', text: (err as Error).message }],
      isError: true,
    };
  }

  const result = diffGraphs(baseGraph, currentGraph, { baseRef, depth });
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * Register the `treck mcp` CLI command.
 *
 * Starts an MCP server over stdio, exposing graph queries as tools
 * for AI agents like Claude Code, Cursor, and Windsurf.
 */
export function registerMcpCommand(cli: CAC) {
  cli
    .command('mcp', 'Start MCP server for AI agents')
    .example('treck mcp')
    .action(async () => {
      const config = loadConfig();
      if (!config) {
        // biome-ignore lint/suspicious/noConsole: MCP uses stderr for diagnostics (stdout is reserved for protocol)
        console.error('Config not found. Run: treck init');
        process.exit(1);
      }

      process.stderr.write('Syncing graph...\n');
      const syncResult = syncGraph(config);
      if (syncResult) {
        process.stderr.write(`Graph synced (${syncResult.nodeCount} nodes, ${syncResult.edgeCount} edges)\n`);
      } else {
        process.stderr.write('Sync: no source files matched\n');
      }

      const store = new GraphStore(config.outputDir);
      let graph = store.read();
      if (!graph) {
        // biome-ignore lint/suspicious/noConsole: MCP uses stderr for diagnostics (stdout is reserved for protocol)
        console.error('No graph data found. Run: treck sync');
        process.exit(1);
      }

      let searchIndex = buildSearchIndex(graph);

      const server = new McpServer({
        name: 'treck',
        version,
      });

      server.tool(
        'search_nodes',
        'Search for functions, classes, components, hooks, and other symbols in the codebase by name, file path, or description',
        {
          query: z
            .string()
            .describe('Search query to match against symbol names, file paths, and descriptions'),
        },
        async ({ query }) => handleSearchNodes(query, graph, searchIndex),
      );

      server.tool(
        'show_symbol',
        'Get the call graph neighborhood for a symbol — what it calls, what calls it, and the connecting edges. Targets use the format "filePath:symbolName".',
        {
          targets: z
            .string()
            .describe('Comma-separated targets, e.g. "src/api/route.ts:GET" or "src/lib/db.ts"'),
          depth: z
            .number()
            .optional()
            .describe('Max traversal depth. Omit for full connected flow.'),
        },
        async ({ targets, depth }) => handleShowSymbol(targets, depth, graph),
      );

      server.tool(
        'list_entry_points',
        'List all entry points in the project — API routes, pages, background jobs, middleware, and server actions',
        {
          kind: z
            .string()
            .optional()
            .describe(
              'Filter by entry type: api-route, page, inngest-function, trigger-task, trigger-scheduled-task, middleware, server-action',
            ),
        },
        async ({ kind }) => handleListEntryPoints(kind, graph),
      );

      server.tool(
        'find_callers',
        'Find all symbols that call a given symbol (upstream traversal). Useful for understanding impact of changes.',
        {
          nodeId: z.string().describe('Node ID in "filePath:symbolName" format'),
          depth: z
            .number()
            .optional()
            .describe('Max traversal depth. Default: 1 (direct callers only).'),
        },
        async ({ nodeId, depth }) => handleFindCallers(nodeId, depth ?? 1, graph),
      );

      server.tool(
        'find_callees',
        'Find all symbols that a given symbol calls (downstream traversal). Useful for understanding dependencies.',
        {
          nodeId: z.string().describe('Node ID in "filePath:symbolName" format'),
          depth: z
            .number()
            .optional()
            .describe('Max traversal depth. Default: 1 (direct callees only).'),
        },
        async ({ nodeId, depth }) => handleFindCallees(nodeId, depth ?? 1, graph),
      );

      server.tool(
        'paths_between',
        'Find call paths between two symbols. Returns an array of paths, where each path is an array of node IDs from source to target.',
        {
          from: z.string().describe('Source node ID'),
          to: z.string().describe('Target node ID'),
          maxPaths: z.number().optional().describe('Max number of paths to return. Default: 5.'),
        },
        async ({ from, to, maxPaths }) => handlePathsBetween(from, to, maxPaths ?? 5, graph),
      );

      server.tool(
        'get_graph_summary',
        'Get an overview of the project graph — total symbols, edges, entry points, and counts by kind',
        {},
        async () => handleGetGraphSummary(graph),
      );

      server.tool(
        'diff_graph',
        'Compare current graph against a base branch or commit. Shows which symbols changed, were added or removed, and the full impact zone with call chain context.',
        {
          base: z
            .string()
            .describe('Git ref to compare against (e.g. "main", a commit hash, "HEAD~3")'),
          depth: z
            .number()
            .optional()
            .describe('Max traversal depth for impact zone. Omit for full connected flow.'),
        },
        async ({ base, depth }) =>
          handleDiffGraph(base, depth, `${config.outputDir}/graph.json`, graph),
      );

      server.tool(
        'sync_graph',
        'Re-sync the graph if source code has changed. Checks freshness first and only rebuilds if stale nodes are detected.',
        {},
        async () => {
          const checker = new StaleChecker();
          const checkResult = checker.checkGraph(config.outputDir);

          if (checkResult.errors.length > 0) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({ status: 'error', errors: checkResult.errors }, null, 2),
                },
              ],
              isError: true,
            };
          }

          if (checkResult.staleDocs.length === 0) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    {
                      status: 'up_to_date',
                      totalNodes: checkResult.totalDocs,
                      message: 'Graph is up to date, no sync needed.',
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          const syncResult = syncGraph(config);
          if (!syncResult) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    { status: 'error', message: 'No source files found during sync.' },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          graph = syncResult.graph;
          searchIndex = buildSearchIndex(graph);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    status: 'synced',
                    staleNodesFound: checkResult.staleDocs.length,
                    nodeCount: syncResult.nodeCount,
                    edgeCount: syncResult.edgeCount,
                    entryPointCount: syncResult.entryPointCount,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        },
      );

      const transport = new StdioServerTransport();
      await server.connect(transport);
      // biome-ignore lint/suspicious/noConsole: MCP uses stderr for diagnostics (stdout is reserved for protocol)
      console.error('treck MCP server running on stdio');
    });
}
