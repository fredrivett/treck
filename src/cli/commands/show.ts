import type { CAC } from 'cac';
import { connectedSubgraph } from '../../graph/graph-query.js';
import { renderNodeMarkdown } from '../../graph/graph-renderer.js';
import { GraphStore } from '../../graph/graph-store.js';
import { flowToMermaid, nodeToMermaid } from '../../graph/graph-to-mermaid.js';
import { loadConfig } from '../utils/config.js';
import { explainUnresolved, resolveFocusTargets } from '../utils/resolve-targets.js';

interface ShowOptions {
  format?: 'mermaid' | 'markdown' | 'json' | 'ascii';
  depth?: number;
  theme?: string;
}

const USAGE = `Show graph data for symbols in your codebase.

Usage: treck show <targets> [options]

Targets: file:symbol or file path (comma-separated)
  src/api/route.ts:GET               single symbol
  src/api/route.ts                    all symbols in file
  src/api/route.ts:GET,src/lib/db.ts  multiple targets

Options:
  --format <f>  Output format: mermaid (default), markdown, json, ascii
  --depth <n>   Limit traversal depth (default: full connected flow)
  --theme <name> ASCII theme (e.g. zinc-dark, tokyo-night, github-light)

Tip: If file paths contain parentheses or brackets, wrap the target in quotes:
  treck show "src/app/(dashboard)/page.tsx:Home"

Examples:
  treck show src/api/route.ts:GET
  treck show src/api/route.ts:GET --format markdown
  treck show src/api/route.ts:GET --format json
  treck show src/api/route.ts:GET --depth 1
`;

/**
 * Build a metadata header line for a node in --docs output.
 *
 * Shows file path, kind, line range, and entry type info on a single line.
 *
 * @param node - The graph node to describe
 * @returns Formatted metadata string (e.g. "`src/api/route.ts` · async function · lines 10–25")
 */
export function buildMetadataLine(node: {
  filePath: string;
  kind: string;
  isAsync: boolean;
  lineRange: [number, number];
  entryType?: string;
  metadata?: { httpMethod?: string; route?: string; eventTrigger?: string; taskId?: string };
}): string {
  const parts: string[] = [`\`${node.filePath}\``];

  const kindLabel = node.isAsync ? `async ${node.kind}` : node.kind;
  parts.push(kindLabel);

  if (node.lineRange) {
    parts.push(`lines ${node.lineRange[0]}–${node.lineRange[1]}`);
  }

  if (node.entryType) {
    let entryLabel = `entry: ${node.entryType}`;
    if (node.metadata?.httpMethod) {
      entryLabel += ` (${node.metadata.httpMethod}`;
      if (node.metadata.route) entryLabel += ` ${node.metadata.route}`;
      entryLabel += ')';
    } else if (node.metadata?.eventTrigger) {
      entryLabel += ` (${node.metadata.eventTrigger})`;
    } else if (node.metadata?.taskId) {
      entryLabel += ` (${node.metadata.taskId})`;
    }
    parts.push(entryLabel);
  }

  return parts.join(' · ');
}

/**
 * Register the `treck show` CLI command.
 *
 * Outputs graph data to stdout in the chosen format (mermaid, markdown, json, or ascii).
 * Targets are required positional args specifying which symbols to show.
 */
export function registerShowCommand(cli: CAC) {
  cli
    .command('show [targets]', 'Show graph data for symbols')
    .option('--format <format>', 'Output format: mermaid (default), markdown, json, ascii')
    .option('--depth <n>', 'Limit traversal depth (default: full connected flow)')
    .option('--theme <name>', 'ASCII theme (e.g. zinc-dark, tokyo-night, github-light)')
    .example('treck show src/api/route.ts:GET')
    .example('treck show src/api/route.ts:GET --format markdown')
    .example('treck show src/api/route.ts:GET --format json')
    .example('treck show src/api/route.ts:GET --depth 1')
    .action(async (targets: string | undefined, options: ShowOptions) => {
      if (!targets) {
        process.stderr.write(USAGE);
        process.exit(1);
      }

      const config = loadConfig();
      if (!config) {
        process.stderr.write('Error: Config not found. Run: treck init\n');
        process.exit(1);
      }

      const store = new GraphStore(config.outputDir);
      const graph = store.read();
      if (!graph) {
        process.stderr.write('Error: No graph data found. Run: treck sync\n');
        process.exit(1);
      }

      const { nodeIds, unresolved } = resolveFocusTargets(targets, graph);

      if (unresolved.length > 0) {
        for (const target of unresolved) {
          const filePath = target.includes(':') ? target.split(':')[0] : target;
          const reason = explainUnresolved(filePath, config);
          process.stderr.write(`Could not resolve: ${target}${reason ? ` (${reason})` : ''}\n`);
        }
        process.exit(1);
      }

      if (nodeIds.length === 0) {
        process.stderr.write('Error: No symbols matched the given targets.\n');
        process.exit(1);
      }

      const depth = options.depth ? Number(options.depth) : Number.POSITIVE_INFINITY;
      const format = options.format ?? 'mermaid';

      switch (format) {
        case 'json': {
          process.stdout.write(`${formatJsonOutput(nodeIds, graph, depth)}\n`);
          return;
        }
        case 'markdown': {
          process.stdout.write(`${formatDocsOutput(nodeIds, graph, depth)}\n`);
          return;
        }
        case 'ascii': {
          const mermaid = formatMermaidOutput(nodeIds, graph, depth);
          const ascii = await beautifyMermaid(mermaid, options.theme);
          process.stdout.write(`${ascii}\n`);
          return;
        }
        default: {
          process.stdout.write(`${formatMermaidOutput(nodeIds, graph, depth)}\n`);
          return;
        }
      }
    });
}

/**
 * Detect whether the terminal is using a dark color scheme.
 *
 * Checks `COLORFGBG` (fg;bg format — bg > 8 means light) and common
 * terminal-specific env vars. Falls back to dark when unknown.
 */
export function detectDarkMode(): boolean {
  const colorfgbg = process.env.COLORFGBG;
  if (colorfgbg) {
    const bg = Number(colorfgbg.split(';').pop());
    if (!Number.isNaN(bg)) return bg <= 8;
  }
  // iTerm2 and macOS Terminal report profile names but not reliably dark/light,
  // so default to dark (most developer terminals are dark)
  return true;
}

/**
 * Render a mermaid diagram as Unicode box-drawing art for terminal display.
 *
 * Auto-detects dark/light mode for theme selection. Pass a theme name
 * to override (e.g. `"tokyo-night"`, `"github-light"`).
 *
 * @param mermaidSource - Raw mermaid flowchart source
 * @param theme - Optional theme name from beautiful-mermaid's THEMES
 * @returns Unicode box-drawing string
 */
export async function beautifyMermaid(mermaidSource: string, theme?: string): Promise<string> {
  const { renderMermaidASCII, THEMES } = await import('beautiful-mermaid');
  const resolvedTheme = theme
    ? THEMES[theme]
    : THEMES[detectDarkMode() ? 'zinc-dark' : 'zinc-light'];
  return renderMermaidASCII(mermaidSource, { theme: resolvedTheme });
}

/**
 * Format mermaid graph output for the given node IDs.
 *
 * Single target produces a per-node diagram. Multiple targets produce
 * a combined diagram with all targets highlighted.
 *
 * @param nodeIds - Resolved node IDs to include
 * @param graph - The full flow graph
 * @param depth - Traversal depth for neighbor collection
 * @returns Mermaid flowchart string
 */
export function formatMermaidOutput(
  nodeIds: string[],
  graph: import('../../graph/types.js').FlowGraph,
  depth: number,
): string {
  if (nodeIds.length === 1) {
    return nodeToMermaid(graph, nodeIds[0], depth);
  }
  const { nodes, edges } = connectedSubgraph(graph, nodeIds, depth);
  return flowToMermaid(nodes, edges, new Set(nodeIds));
}

/**
 * Format structured JSON output for the given node IDs.
 *
 * Returns the connected subgraph as a JSON string with targets, depth,
 * nodes, and edges. All `GraphNode` and `GraphEdge` fields are preserved.
 *
 * @param nodeIds - Resolved node IDs to include
 * @param graph - The full flow graph
 * @param depth - Traversal depth for neighbor collection
 * @returns Pretty-printed JSON string
 */
export function formatJsonOutput(
  nodeIds: string[],
  graph: import('../../graph/types.js').FlowGraph,
  depth: number,
): string {
  const { nodes, edges } = connectedSubgraph(graph, nodeIds, depth);
  const result = {
    targets: nodeIds,
    depth: depth === Number.POSITIVE_INFINITY ? null : depth,
    nodes,
    edges,
  };
  return JSON.stringify(result, null, 2);
}

/**
 * Format markdown documentation output for the given node IDs.
 *
 * Each symbol gets a metadata header, rendered markdown body, and
 * an embedded mermaid diagram. Multiple symbols are separated by `---`.
 *
 * @param nodeIds - Resolved node IDs to include
 * @param graph - The full flow graph
 * @param depth - Traversal depth for mermaid diagrams
 * @returns Markdown string
 */
export function formatDocsOutput(
  nodeIds: string[],
  graph: import('../../graph/types.js').FlowGraph,
  depth: number,
): string {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const sections: string[] = [];

  for (const nodeId of nodeIds) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const lines: string[] = [];

    // Title
    lines.push(`# ${node.name}`);
    lines.push('');

    // Metadata line
    lines.push(buildMetadataLine(node));
    lines.push('');

    // Rendered markdown body (description, params, calls, etc.)
    // renderNodeMarkdown includes its own "# name" heading, so we skip it
    const body = renderNodeMarkdown(node, graph);
    // Remove the first line (duplicate heading) from renderNodeMarkdown output
    const bodyWithoutHeading = body.replace(/^# .+\n\n?/, '');
    lines.push(bodyWithoutHeading);

    // Mermaid diagram
    const mermaid = nodeToMermaid(graph, nodeId, depth);
    if (mermaid) {
      lines.push('```mermaid');
      lines.push(mermaid);
      lines.push('```');
      lines.push('');
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n---\n\n');
}
