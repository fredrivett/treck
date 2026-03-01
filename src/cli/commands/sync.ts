import { resolve } from 'node:path';
import * as p from '@clack/prompts';
import type { CAC } from 'cac';
import { GraphBuilder } from '../../graph/graph-builder.js';
import { entryPoints } from '../../graph/graph-query.js';
import { GraphStore } from '../../graph/graph-store.js';
import { loadConfig } from '../utils/config.js';
import { findSourceFiles } from '../utils/source-files.js';

/**
 * Register the `treck sync` CLI command.
 *
 * Finds source files, builds the dependency graph, and writes graph.json.
 * Optionally filters to a target path.
 */
export function registerSyncCommand(cli: CAC) {
  cli
    .command('sync [target]', 'Build dependency graph')
    .example('treck sync')
    .example('treck sync src/api/')
    .action(async (target?: string) => {
      p.intro('Syncing documentation');

      try {
        const config = loadConfig();
        if (!config) {
          p.cancel('Config not found. Run: treck init');
          process.exit(1);
        }

        const spinner = p.spinner();

        // Find source files
        spinner.start('Finding source files');

        let sourceFiles = findSourceFiles(process.cwd(), config.scope);

        // If a target path is provided, filter to files under that path
        if (target) {
          const targetPath = resolve(process.cwd(), target);
          sourceFiles = sourceFiles.filter((f) => f.startsWith(targetPath));

          if (sourceFiles.length === 0) {
            spinner.stop('No source files found');
            p.cancel(`No source files found under: ${target}`);
            process.exit(1);
          }
        }

        spinner.stop(
          `Found ${sourceFiles.length} source file${sourceFiles.length === 1 ? '' : 's'}`,
        );

        if (sourceFiles.length === 0 && !target) {
          if (config.scope.include.length === 0) {
            p.log.warn(
              'No include patterns configured.\nCheck scope.include in _treck/config.yaml',
            );
          } else {
            p.log.warn(
              `No files matched include patterns:\n${config.scope.include.map((pat) => `  - ${pat}`).join('\n')}\n\nCheck that your config matches your project structure.`,
            );
          }
          p.outro(`Synced to ${config.outputDir}/`);
          process.exit(0);
        }

        // Build graph
        spinner.start(`Analyzing ${sourceFiles.length} files`);

        const builder = new GraphBuilder();
        const graph = builder.build(sourceFiles);

        spinner.stop(`Graph built: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

        // Write graph.json
        spinner.start('Writing graph.json');

        const store = new GraphStore(config.outputDir);
        store.write(graph);

        spinner.stop('Graph saved');

        // Report stats
        const entries = entryPoints(graph);
        const edgesByType = new Map<string, number>();
        for (const edge of graph.edges) {
          edgesByType.set(edge.type, (edgesByType.get(edge.type) || 0) + 1);
        }

        const stats = [
          `Nodes: ${graph.nodes.length}`,
          `Edges: ${graph.edges.length}`,
          `Entry points: ${entries.length}`,
        ];

        if (edgesByType.size > 0) {
          stats.push('');
          for (const [type, count] of edgesByType) {
            stats.push(`  ${type}: ${count}`);
          }
        }

        const withJsDoc = graph.nodes.filter((n) => n.hasJsDoc).length;
        const withoutJsDoc = graph.nodes.length - withJsDoc;
        stats.push('');
        stats.push(
          `\u2713 Synced ${graph.nodes.length} symbols (${withJsDoc} with JSDoc, ${withoutJsDoc} missing)`,
        );

        p.log.message(stats.join('\n'));

        p.outro(`Synced to ${config.outputDir}/`);
      } catch (error) {
        p.cancel(`Failed to sync: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
