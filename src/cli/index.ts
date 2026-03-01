#!/usr/bin/env node

import { cac } from 'cac';
import { version } from '../../package.json';

/** The treck CLI instance, powered by cac. */
const cli = cac('treck');

// Global options
cli.version(version).help();

import { registerCheckCommand } from './commands/check.js';
// Register commands
import { registerInitCommand } from './commands/init.js';
import { registerJsDocCommand } from './commands/jsdoc.js';
import { registerServeCommand } from './commands/serve.js';
import { registerShowCommand } from './commands/show.js';
import { registerSyncCommand } from './commands/sync.js';

registerInitCommand(cli);
registerSyncCommand(cli);
registerCheckCommand(cli);
registerJsDocCommand(cli);
registerServeCommand(cli);
registerShowCommand(cli);

/** Parsed CLI arguments and options. */
const parsed = cli.parse();

// Show help if no command was matched (e.g. "treck" or "treck help")
// but not when --help or --version was explicitly passed (cac handles those)
if (!cli.matchedCommand && !parsed.options.help && !parsed.options.version) {
  cli.outputHelp();
}
