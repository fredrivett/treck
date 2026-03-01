/**
 * Trigger.dev framework matcher
 *
 * Detects:
 * - Task definitions (task({ id: "...", run: ... }))
 * - Task triggers (tasks.trigger("task-id") / tasks.triggerAndWait("task-id"))
 * - Batch triggers (tasks.batchTrigger("task-id"))
 */

import type { SymbolInfo } from '../extractors/types.js';
import type {
  EntryPointMatch,
  FrameworkMatcher,
  ResolvedConnection,
  RuntimeConnection,
} from './types.js';

/**
 * Extract the task ID from a task() definition.
 * Looks for: task({ id: "process-image", ... })
 */
function extractTaskId(body: string): string | null {
  const idMatch = body.match(/id\s*:\s*['"`]([^'"`]+)['"`]/);
  return idMatch ? idMatch[1] : null;
}

export const triggerDevMatcher: FrameworkMatcher = {
  name: 'trigger-dev',

  /** Detect `task({ id: "...", run: ... })` definitions as Trigger.dev entry points. */
  detectEntryPoint(symbol: SymbolInfo, _filePath: string): EntryPointMatch | null {
    if (symbol.kind === 'const' && /^task\s*\(/.test(symbol.body)) {
      const taskId = extractTaskId(symbol.body);

      return {
        entryType: 'trigger-task',
        metadata: {
          ...(taskId && { taskId }),
        },
      };
    }

    return null;
  },

  /** Detect `tasks.trigger()`, `tasks.triggerAndWait()`, and `tasks.batchTrigger()` calls. */
  detectConnections(symbol: SymbolInfo, _filePath: string): RuntimeConnection[] {
    const connections: RuntimeConnection[] = [];
    const triggerPattern =
      /\.(?:trigger|triggerAndWait|batchTrigger)\s*(?:<[^>]*>)?\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match: RegExpExecArray | null;
    match = triggerPattern.exec(symbol.body);
    while (match !== null) {
      connections.push({
        type: 'task-trigger',
        targetHint: match[1],
        sourceLocation: [symbol.startLine, symbol.endLine],
      });
      match = triggerPattern.exec(symbol.body);
    }

    return connections;
  },

  /** Resolve a Trigger.dev runtime connection to a concrete graph edge. Not yet implemented. */
  resolveConnection(
    _connection: RuntimeConnection,
    _projectFiles: string[],
  ): ResolvedConnection | null {
    return null;
  },
};
