import * as p from '@clack/prompts';
import type { CAC } from 'cac';
import { entryPoints } from '../../graph/graph-query.js';
import { syncGraph } from '../../graph/sync.js';
import { loadConfig } from '../utils/config.js';

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

        spinner.start('Building graph');

        const result = syncGraph(config, target);

        if (!result) {
          spinner.stop('No source files found');
          if (target) {
            p.cancel(`No source files found under: ${target}`);
            process.exit(1);
          }
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

        spinner.stop(`Graph built: ${result.nodeCount} nodes, ${result.edgeCount} edges`);

        // Report stats
        const entries = entryPoints(result.graph);
        const edgesByType = new Map<string, number>();
        for (const edge of result.graph.edges) {
          edgesByType.set(edge.type, (edgesByType.get(edge.type) || 0) + 1);
        }

        const stats = [
          `Nodes: ${result.nodeCount}`,
          `Edges: ${result.edgeCount}`,
          `Entry points: ${entries.length}`,
        ];

        if (edgesByType.size > 0) {
          stats.push('');
          for (const [type, count] of edgesByType) {
            stats.push(`  ${type}: ${count}`);
          }
        }

        const withJsDoc = result.graph.nodes.filter((n) => n.hasJsDoc).length;
        const withoutJsDoc = result.graph.nodes.length - withJsDoc;
        stats.push('');
        stats.push(
          `\u2713 Synced ${result.nodeCount} symbols (${withJsDoc} with JSDoc, ${withoutJsDoc} missing)`,
        );

        p.log.message(stats.join('\n'));

        p.outro(`Synced to ${config.outputDir}/`);
      } catch (error) {
        p.cancel(`Failed to sync: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
