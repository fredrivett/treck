/**
 * CLI command for comparing graph changes between git refs.
 *
 * Compares node hashes to find changed, added, and removed symbols,
 * then shows the impact zone with call chain context.
 */

import type { CAC } from 'cac';
import { StaleChecker } from '../../checker/index.js';
import { type GraphDiff, diffGraphs, diffToMermaid, formatDiffSummary } from '../../graph/diff.js';
import { GraphStore } from '../../graph/graph-store.js';
import type { FlowGraph } from '../../graph/types.js';
import { loadConfig } from '../utils/config.js';
import { detectBaseRef, loadGraphAtRef } from '../utils/git.js';

interface DiffOptions {
  base?: string;
  format?: 'mermaid' | 'json';
  depth?: number;
}

const USAGE = `Compare graph changes between git refs at the symbol level.

Usage: treck diff [options]

Head is always the current working directory graph. Run "treck sync" first
to ensure graph.json is up to date.

Options:
  --base <ref>    Base git ref to compare against (default: auto-detect remote default branch)
  --format <f>    Output format: mermaid (default), json
  --depth <n>     Limit impact zone depth (default: full connected flow)

Examples:
  treck diff
  treck diff --base main
  treck diff --base abc123
  treck diff --format json
  treck diff --depth 2
`;

/**
 * Format diff result as pretty-printed JSON.
 *
 * @param diff - The graph diff to serialize
 * @returns JSON string
 */
export function formatDiffJson(diff: GraphDiff): string {
  return JSON.stringify(diff, null, 2);
}

/**
 * Format diff result as a mermaid flowchart with change-type highlighting.
 *
 * @param diff - The graph diff to render
 * @returns Mermaid flowchart string
 */
export function formatDiffMermaid(diff: GraphDiff): string {
  return diffToMermaid(
    diff.nodes,
    diff.edges,
    new Set(diff.changes.modified),
    new Set(diff.changes.added),
  );
}

/**
 * Register the `treck diff` CLI command.
 *
 * Compares the current graph against a base git ref and outputs changed
 * symbols with their call chain context. Writes a text summary to stderr
 * and structured output (mermaid or JSON) to stdout.
 */
export function registerDiffCommand(cli: CAC) {
  cli
    .command('diff', 'Compare graph changes between git refs')
    .option('--base <ref>', 'Base git ref to compare against (default: auto-detect)')
    .option('--format <format>', 'Output format: mermaid (default), json')
    .option('--depth <n>', 'Limit impact zone depth (default: full connected flow)')
    .example('treck diff')
    .example('treck diff --base main')
    .example('treck diff --format json')
    .example('treck diff --depth 2')
    .action(async (options: DiffOptions) => {
      const config = loadConfig();
      if (!config) {
        process.stderr.write('Error: Config not found. Run: treck init\n');
        process.exit(1);
      }

      const store = new GraphStore(config.outputDir);
      const headGraph = store.read();
      if (!headGraph) {
        process.stderr.write('Error: No graph data. Run: treck sync\n');
        process.exit(1);
      }

      // Warn if graph is stale (source files changed since last sync)
      try {
        const checker = new StaleChecker();
        const checkResult = checker.checkGraph(config.outputDir);
        if (checkResult.staleDocs.length > 0) {
          const n = checkResult.staleDocs.length;
          process.stderr.write(
            `\x1b[1;33m⚠ Warning: ${n} stale node${n === 1 ? '' : 's'} detected. Run: treck sync\x1b[0m\n`,
          );
        }
      } catch {
        // Staleness check is best-effort — don't block the diff
      }

      let baseRef: string;
      try {
        baseRef = options.base ?? detectBaseRef();
      } catch (err) {
        process.stderr.write(`Error: ${(err as Error).message}\n`);
        process.exit(1);
      }

      let baseGraph: FlowGraph;
      try {
        const graphPath = `${config.outputDir}/graph.json`;
        baseGraph = loadGraphAtRef(baseRef, graphPath);
      } catch (err) {
        process.stderr.write(`Error: ${(err as Error).message}\n`);
        process.exit(1);
      }

      const depth = options.depth ? Number(options.depth) : undefined;
      const diff = diffGraphs(baseGraph, headGraph, { baseRef, depth });

      // Always write summary to stderr
      process.stderr.write(`${formatDiffSummary(diff)}\n`);

      const hasChanges =
        diff.changes.modified.length > 0 ||
        diff.changes.added.length > 0 ||
        diff.changes.removed.length > 0;

      if (!hasChanges) return;

      const format = options.format ?? 'mermaid';
      switch (format) {
        case 'json': {
          process.stdout.write(`${formatDiffJson(diff)}\n`);
          return;
        }
        default: {
          process.stdout.write(`${formatDiffMermaid(diff)}\n`);
          return;
        }
      }
    });
}
