/**
 * CLI command for comparing graph changes between git refs.
 *
 * Compares node hashes to find changed, added, and removed symbols,
 * then shows the impact zone with call chain context.
 */

import { watch } from 'node:fs';
import { resolve } from 'node:path';
import type { CAC } from 'cac';
import { StaleChecker } from '../../checker/index.js';
import { diffGraphs, diffToMermaid, formatDiffSummary, type GraphDiff } from '../../graph/diff.js';
import { GraphStore } from '../../graph/graph-store.js';
import type { FlowGraph } from '../../graph/types.js';
import { loadConfig } from '../utils/config.js';
import { detectBaseRef, loadGraphAtRef } from '../utils/git.js';
import { beautifyMermaid } from './show.js';

interface DiffOptions {
  base?: string;
  format?: 'mermaid' | 'json' | 'ascii';
  depth?: number;
  theme?: string;
  watch?: boolean;
}

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
 * @param options - Rendering options
 * @param options.asciiShapes - Use distinct shapes for ASCII rendering
 * @returns Mermaid flowchart string
 */
export function formatDiffMermaid(diff: GraphDiff, options?: { asciiShapes?: boolean }): string {
  return diffToMermaid(
    diff.nodes,
    diff.edges,
    new Set(diff.changes.modified),
    new Set(diff.changes.added),
    options,
  );
}

/**
 * Run a single diff pass and output the result.
 *
 * Extracted from the action handler so it can be called repeatedly in watch mode.
 *
 * @param store - Graph store for reading graph.json
 * @param baseGraph - The base graph snapshot (from a git ref)
 * @param baseRef - Label for the base ref
 * @param headGraph - The current graph snapshot
 * @param options - Output format and depth options
 */
async function runDiff(
  store: GraphStore,
  baseGraph: FlowGraph,
  baseRef: string,
  headGraph: FlowGraph,
  options: DiffOptions,
): Promise<void> {
  const depth = options.depth ? Number(options.depth) : undefined;
  const diff = diffGraphs(baseGraph, headGraph, { baseRef, depth });

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
    case 'ascii': {
      const MAX_ASCII_NODES = 80;
      const asciiOpts = { asciiShapes: true };

      if (diff.nodes.length <= MAX_ASCII_NODES) {
        const mermaid = formatDiffMermaid(diff, asciiOpts);
        const ascii = await beautifyMermaid(mermaid, options.theme);
        process.stdout.write(`${ascii}\n`);
        return;
      }

      for (const tryDepth of [3, 2, 1, 0]) {
        const smaller = diffGraphs(baseGraph, headGraph, { baseRef, depth: tryDepth });
        if (smaller.nodes.length <= MAX_ASCII_NODES) {
          process.stderr.write(
            `\x1b[1;33m⚠ Graph too large at full depth (${diff.nodes.length} nodes). Showing depth ${tryDepth} (${smaller.nodes.length} nodes).\x1b[0m\n`,
          );
          const mermaid = formatDiffMermaid(smaller, asciiOpts);
          const ascii = await beautifyMermaid(mermaid, options.theme);
          process.stdout.write(`${ascii}\n`);
          return;
        }
      }

      process.stderr.write(
        `\x1b[1;33m⚠ Graph too large for ASCII rendering even at depth 0. Use --format mermaid or --format json instead.\x1b[0m\n`,
      );
      return;
    }
    default: {
      process.stdout.write(`${formatDiffMermaid(diff)}\n`);
      return;
    }
  }
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
    .option('--format <format>', 'Output format: mermaid (default), json, ascii')
    .option('--depth <n>', 'Limit impact zone depth (default: full connected flow)')
    .option('--theme <name>', 'ASCII theme (e.g. zinc-dark, tokyo-night, github-light)')
    .option('--watch', 'Re-run diff when graph.json changes')
    .example('treck diff')
    .example('treck diff --base main')
    .example('treck diff --format json')
    .example('treck diff --format ascii')
    .example('treck diff --depth 2')
    .example('treck diff --watch')
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

      await runDiff(store, baseGraph, baseRef, headGraph, options);

      if (options.watch) {
        process.stderr.write('\x1b[2mWatching for changes... (Ctrl+C to stop)\x1b[0m\n');
        const absOutputDir = resolve(process.cwd(), config.outputDir);
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        watch(absOutputDir, { recursive: true }, (_event, filename) => {
          if (filename !== 'graph.json') return;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(async () => {
            const updatedGraph = store.read();
            if (!updatedGraph) return;
            process.stdout.write('\x1Bc'); // Clear terminal
            await runDiff(store, baseGraph, baseRef, updatedGraph, options);
            process.stderr.write('\x1b[2mWatching for changes... (Ctrl+C to stop)\x1b[0m\n');
          }, 500);
        });
        // Keep process alive
        await new Promise(() => {});
      }
    });
}
