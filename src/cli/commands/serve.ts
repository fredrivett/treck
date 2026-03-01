import { exec } from 'node:child_process';
import * as p from '@clack/prompts';
import type { CAC } from 'cac';
import { startServer } from '../../server/index.js';
import { loadConfig } from '../utils/config.js';
import { explainUnresolved, resolveFocusTargets } from '../utils/resolve-targets.js';

interface ServeOptions {
  port?: number;
  open?: boolean;
  focus?: string;
}

/**
 * Register the `treck serve` CLI command.
 *
 * Starts the documentation viewer HTTP server and optionally opens it
 * in the default browser. Supports `--focus` to open with specific
 * symbols or files pre-selected and focused.
 */
export function registerServeCommand(cli: CAC) {
  cli
    .command('serve', 'Start interactive documentation viewer')
    .option('--port <number>', 'Port to run server on (default: 3456)')
    .option('--open', 'Auto-open browser (default: true)')
    .option('--focus <targets>', 'Focus on file:symbol or file (comma-separated)')
    .example('treck serve')
    .example('treck serve --port 8080')
    .example('treck serve --focus src/api/route.ts:GET,src/lib/db.ts:query')
    .action(async (options: ServeOptions) => {
      p.intro('treck viewer');

      const config = loadConfig();
      if (!config) {
        p.cancel('Config not found. Run: treck init');
        process.exit(1);
      }

      const port = options.port ? Number(options.port) : 3456;

      const spinner = p.spinner();
      spinner.start('Building symbol index...');

      try {
        const { url, graph } = await startServer(config.outputDir, port);
        spinner.stop(`Server running at ${url}`);

        // Resolve --focus targets to node IDs and build URL
        let openUrl = url;
        if (options.focus && options.focus.length > 0) {
          if (!graph) {
            p.cancel('No graph data available. Run: treck sync');
            process.exit(1);
          }

          const { nodeIds, unresolved } = resolveFocusTargets(options.focus, graph);

          if (unresolved.length > 0) {
            for (const target of unresolved) {
              const filePath = target.includes(':') ? target.split(':')[0] : target;
              const reason = explainUnresolved(filePath, config);
              p.log.warn(`Could not resolve: ${target}${reason ? ` (${reason})` : ''}`);
            }
            p.cancel('All focus targets must resolve');
            process.exit(1);
          }

          const encoded = nodeIds.map(encodeURIComponent).join(',');
          openUrl = `${url}?selected=${encoded}&focused=${encoded}`;
          p.log.info(`Focused on ${nodeIds.length} node${nodeIds.length > 1 ? 's' : ''}`);
        }

        // Auto-open in browser (unless --no-open)
        if (options.open !== false) {
          const openCmd =
            process.platform === 'darwin'
              ? 'open'
              : process.platform === 'win32'
                ? 'start'
                : 'xdg-open';
          exec(`${openCmd} "${openUrl}"`);
        }

        p.log.message('Press Ctrl+C to stop');

        // Keep process alive
        await new Promise(() => {});
      } catch (error) {
        spinner.stop('Failed to start server');
        p.cancel(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
