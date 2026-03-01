import * as p from '@clack/prompts';
import type { CAC } from 'cac';
import { loadConfig } from '../utils/config.js';
import {
  renderJsDocCoverageStats,
  renderMissingJsDocList,
  scanProjectAsync,
} from '../utils/jsdoc-coverage.js';

interface StatusOptions {
  verbose?: boolean;
}

/**
 * Register the `treck status` CLI command.
 *
 * Scans the project for JSDoc coverage and displays statistics
 * including a coverage bar and symbols missing JSDoc.
 */
export function registerStatusCommand(cli: CAC) {
  cli
    .command('status', 'Show JSDoc coverage')
    .option('--verbose', 'Show detailed symbol information')
    .action(async (options: StatusOptions) => {
      p.intro('Documentation Status');

      try {
        // Load config
        const config = loadConfig();
        if (!config) {
          p.cancel('Config not found. Run: treck init');
          process.exit(1);
        }

        // Scan project and show coverage
        const spinner = p.spinner();
        spinner.start('Finding source files');

        const scan = await scanProjectAsync(config.scope, (message) => {
          spinner.message(message);
        });

        spinner.stop('Analysis complete');

        renderJsDocCoverageStats(scan);

        // Show symbols missing JSDoc
        renderMissingJsDocList(scan, options.verbose ?? false);

        const jsDocCoverage =
          scan.exportedSymbols > 0 ? Math.round((scan.withJsDoc / scan.exportedSymbols) * 100) : 0;

        if (jsDocCoverage === 100) {
          p.outro('Perfect JSDoc coverage!');
        } else {
          p.outro(
            `${jsDocCoverage}% JSDoc coverage \u2014 run \x1b[1;36mtreck jsdoc\x1b[0m for next steps`,
          );
        }
      } catch (error) {
        p.cancel(
          `Failed to generate status: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });
}
