import { execFileSync, spawn } from 'node:child_process';
import * as p from '@clack/prompts';
import type { CAC } from 'cac';
import { loadConfig } from '../utils/config.js';
import {
  renderJsDocCoverageStats,
  renderMissingJsDocList,
  scanProjectAsync,
} from '../utils/jsdoc-coverage.js';

interface JsDocOptions {
  verbose?: boolean;
  prompt?: boolean;
  run?: string;
}

/** Map of supported agent names to their CLI commands and argument patterns. */
const AGENTS: Record<string, { cmd: string; args: (prompt: string) => string[]; url: string }> = {
  claude: {
    cmd: 'claude',
    args: (prompt) => [prompt],
    url: 'https://docs.anthropic.com/en/docs/claude-code',
  },
  codex: {
    cmd: 'codex',
    args: (prompt) => ['exec', '--full-auto', prompt],
    url: 'https://github.com/openai/codex',
  },
};

/** Agent prompt for auto-populating JSDoc comments to 100% coverage. */
export const JSDOC_AGENT_PROMPT = `Your task is to add JSDoc comments to TypeScript source files until the project reaches 100% JSDoc coverage.

## What "symbols" means

Symbols are the TypeScript constructs that treck tracks: functions, classes, interfaces, type aliases, enums, and constants. Only **exported** symbols require a /** ... */ JSDoc comment directly above their declaration. Non-exported (file-private) symbols do not need JSDoc.

## Feedback loop

treck tells you what's missing. Run:

  npx treck jsdoc

to see current JSDoc coverage and the list of symbols still missing comments. Repeat until it reports 100%.

## Process

Work file by file, not symbol by symbol:

1. Run \`npx treck jsdoc --verbose\` to get the list of symbols missing JSDoc, grouped by file.
2. For each file in the list:
   a. Read the source file.
   b. Add a JSDoc comment above every exported symbol that is missing one. Skip non-exported symbols.
   c. If a symbol's purpose is unclear from its name, signature, and body, read its generated doc in \`_treck/\` for context on callers and callees.
   d. Do NOT change any code — only add JSDoc comments.
3. After all files are done, run the project's formatter and linter (e.g. \`npm run format\`).
4. Run \`npx treck sync\` to regenerate docs, then \`npx treck jsdoc\` to verify coverage.
5. If any symbols were missed, fix them and repeat step 4.
6. Commit with a message like: \`docs: add JSDoc comments across codebase\`

## Writing JSDoc comments

- First line: a concise summary of what the symbol does (imperative for functions, descriptive for types/constants).
- Body (optional): explain behavior, side effects, or non-obvious details. Omit if the name and signature make it clear.
- \`@param name - description\` — only for parameters whose purpose, constraints, or defaults are not obvious from their name and type. Do not repeat the type.
- \`@returns\` — only when the return value is non-obvious from the signature.
- \`@throws\` — only when the error behavior is meaningful to callers.
- \`@example\` — only when usage is non-obvious.
- Keep comments brief. Do not pad with filler. Engineers can read code — focus on WHY, not restating WHAT.
- Use inline code backticks for parameter names, types, and values in descriptions.
- Match the existing code style (check for single/double quotes, indent size, semicolons, etc.)

## Example

Before:
\`\`\`typescript
export async function callVisionAPI(
  imageUrl: string,
  prompt: string,
  options: { maxTokens?: number; model?: string } = {}
): Promise<string> {
\`\`\`

After:
\`\`\`typescript
/**
 * Calls OpenAI Vision API with rate limiting and retries.
 *
 * Enforces 60 req/min to stay under OpenAI's batch processing limits.
 * Falls back to empty string if the model returns no content.
 *
 * @param imageUrl - URL of the image to analyze (must be publicly accessible)
 * @param prompt - Instructions for the vision model
 * @param options.maxTokens - Response length limit (default: 1000)
 * @param options.model - Model to use (default: \`gpt-4-vision-preview\`)
 * @returns The model's text response, or empty string if no content
 */
export async function callVisionAPI(
\`\`\`

## Important

- Only add JSDoc comments. Do not modify function bodies, signatures, or any other code.
- If a symbol already has a JSDoc comment, skip it.
- If you're unsure what a function does, read its call graph in the treck output and the function body carefully before writing the comment.`;

/**
 * Register the `treck jsdoc` CLI command.
 *
 * Without flags: scans the project and reports JSDoc coverage with a list
 * of symbols missing comments.
 *
 * With `--prompt`: prints a ready-to-use agent prompt to stdout for piping
 * into coding agents like Claude Code, Codex, or Cursor.
 *
 * With `--run <agent>`: spawns the named agent CLI with the prompt directly.
 * Supported agents: claude, codex.
 */
export function registerJsDocCommand(cli: CAC) {
  cli
    .command('jsdoc', 'Show JSDoc coverage or print an agent prompt')
    .option('--verbose', 'Show all symbols missing JSDoc')
    .option('--prompt', 'Print agent prompt to stdout for piping to coding agents')
    .option('--run <agent>', 'Run an agent to auto-populate JSDoc (e.g. claude)')
    .example('treck jsdoc')
    .example('treck jsdoc --prompt | pbcopy')
    .example('treck jsdoc --run claude')
    .action(async (options: JsDocOptions) => {
      if (options.run) {
        const agentName = options.run.toLowerCase();
        const agent = AGENTS[agentName];
        if (!agent) {
          p.log.error(
            `Unknown agent: ${agentName}. Supported agents: ${Object.keys(AGENTS).join(', ')}`,
          );
          process.exit(1);
        }

        try {
          execFileSync('which', [agent.cmd], { stdio: 'ignore' });
        } catch {
          p.log.error(`${agent.cmd} not found. Install it first: ${agent.url}`);
          process.exit(1);
        }

        p.log.info(
          `Running \x1b[1;36m${agent.cmd}\x1b[0m with JSDoc agent prompt\u2026 (Ctrl+C to cancel)`,
        );

        const child = spawn(agent.cmd, agent.args(JSDOC_AGENT_PROMPT), {
          stdio: 'inherit',
          cwd: process.cwd(),
        });

        const code = await new Promise<number>((resolve) => {
          child.on('close', (exitCode) => resolve(exitCode ?? 0));
          child.on('error', () => resolve(1));
        });

        process.exit(code);
        return;
      }

      if (options.prompt) {
        // biome-ignore lint/suspicious/noConsole: intentional raw stdout for pipe-friendly --prompt mode
        console.log(JSDOC_AGENT_PROMPT);
        return;
      }

      p.intro('JSDoc Coverage');

      try {
        const config = loadConfig();
        if (!config) {
          p.cancel('Config not found. Run: treck init');
          process.exit(1);
        }

        const spinner = p.spinner();
        spinner.start('Finding source files');

        const scan = await scanProjectAsync(config.scope, (message) => {
          spinner.message(message);
        });

        spinner.stop('Analysis complete');

        renderJsDocCoverageStats(scan);
        renderMissingJsDocList(scan, options.verbose ?? false);

        const jsDocCoverage =
          scan.exportedSymbols > 0 ? Math.round((scan.withJsDoc / scan.exportedSymbols) * 100) : 0;

        p.outro(
          jsDocCoverage === 100
            ? '\u2728 Full JSDoc coverage!'
            : `${jsDocCoverage}% JSDoc coverage \u2014 fix with:\n  \x1b[1;36mtreck jsdoc --run claude\x1b[0m  Hand off to Claude Code\n  \x1b[1;36mtreck jsdoc --run codex\x1b[0m   Hand off to Codex\n  \x1b[1;36mtreck jsdoc --prompt\x1b[0m      Print agent prompt to stdout`,
        );
      } catch (error) {
        p.cancel(
          `Failed to check JSDoc coverage: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });
}
