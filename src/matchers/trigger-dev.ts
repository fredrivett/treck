/**
 * Trigger.dev framework matcher
 *
 * Detects entry points:
 * - task({ id: "..." }) — basic task definition
 * - schemaTask({ id: "..." }) — schema-validated task definition
 * - schedules.task({ id: "...", cron: "..." }) — scheduled/cron task definition
 *
 * Detects connections (string-based, via `tasks.*` namespace):
 * - tasks.trigger("task-id")
 * - tasks.triggerAndWait("task-id")
 * - tasks.batchTrigger("task-id")
 * - tasks.batchTriggerAndWait("task-id")
 * - tasks.triggerAndPoll("task-id")
 *
 * Detects connections (instance-based, calling methods on a task object):
 * - myTask.trigger(payload)
 * - myTask.triggerAndWait(payload)
 * - myTask.batchTrigger(items)
 * - myTask.batchTriggerAndWait(items)
 *
 * Detects connections (multi-task batch via `batch.*`):
 * - batch.trigger([{ id: "task-id", ... }])
 * - batch.triggerAndWait([{ id: "task-id", ... }])
 * - batch.triggerByTask([{ task: myTask, ... }])
 * - batch.triggerByTaskAndWait([{ task: myTask, ... }])
 */

import type { SymbolInfo } from '../extractors/types.js';
import type {
  EntryPointMatch,
  FrameworkMatcher,
  ResolvedConnection,
  RuntimeConnection,
} from './types.js';

/**
 * Extract the task ID from a task/schemaTask/schedules.task definition.
 * Looks for: id: "process-image" (with single, double, or backtick quotes)
 */
function extractTaskId(body: string): string | null {
  const idMatch = body.match(/id\s*:\s*['"`]([^'"`]+)['"`]/);
  return idMatch ? idMatch[1] : null;
}

/**
 * Extract the cron schedule from a schedules.task() definition.
 * Handles both simple string form (`cron: "0 * * * *"`) and object form
 * (`cron: { pattern: "0 5 * * *", timezone: "Asia/Tokyo" }`).
 */
function extractCronSchedule(body: string): string | null {
  // Object form: cron: { pattern: "..." }
  const objectCron = body.match(/cron\s*:\s*\{[^}]*pattern\s*:\s*['"`]([^'"`]+)['"`]/);
  if (objectCron) return objectCron[1];

  // Simple string form: cron: "..."
  const simpleCron = body.match(/cron\s*:\s*['"`]([^'"`]+)['"`]/);
  if (simpleCron) return simpleCron[1];

  return null;
}

/** Names that are known namespaces, not task variable references. */
const NAMESPACE_NAMES = new Set(['tasks', 'batch']);

export const triggerDevMatcher: FrameworkMatcher = {
  name: 'trigger-dev',

  /**
   * Detect task definitions as Trigger.dev entry points.
   *
   * Recognises `task(...)`, `schemaTask(...)`, and `schedules.task(...)`.
   */
  detectEntryPoint(symbol: SymbolInfo, _filePath: string): EntryPointMatch | null {
    if (symbol.kind !== 'const') return null;

    // schedules.task({ id: "...", cron: "..." })
    if (/^schedules\.task\s*\(/.test(symbol.body)) {
      const taskId = extractTaskId(symbol.body);
      const cronSchedule = extractCronSchedule(symbol.body);

      return {
        entryType: 'trigger-scheduled-task',
        metadata: {
          ...(taskId && { taskId }),
          ...(cronSchedule && { cronSchedule }),
        },
      };
    }

    // task({ id: "..." }) or schemaTask({ id: "..." })
    if (/^(?:schema)?[Tt]ask\s*\(/.test(symbol.body)) {
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

  /**
   * Detect all trigger.dev trigger/invoke patterns in a symbol body.
   *
   * Returns `task-trigger` connections for string-ID-based calls (resolvable
   * by task ID) and `task-trigger-ref` connections for instance-based calls
   * (resolvable by matching the variable name to a graph node).
   */
  detectConnections(symbol: SymbolInfo, _filePath: string): RuntimeConnection[] {
    const connections: RuntimeConnection[] = [];
    const loc: [number, number] = [symbol.startLine, symbol.endLine];

    // ── 1. String-based triggers via `tasks.*` namespace ───────────────
    // tasks.trigger("id"), tasks.triggerAndWait("id"),
    // tasks.batchTrigger("id"), tasks.batchTriggerAndWait("id"),
    // tasks.triggerAndPoll("id")
    const stringTriggerPattern =
      /\btasks\.(?:trigger|triggerAndWait|batchTrigger|batchTriggerAndWait|triggerAndPoll)\s*(?:<[^>]*>)?\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match: RegExpExecArray | null;
    match = stringTriggerPattern.exec(symbol.body);
    while (match !== null) {
      connections.push({ type: 'task-trigger', targetHint: match[1], sourceLocation: loc });
      match = stringTriggerPattern.exec(symbol.body);
    }

    // ── 2. Instance-based triggers (myTask.trigger(payload)) ───────────
    // Matches varName.trigger/triggerAndWait/batchTrigger/batchTriggerAndWait
    // where varName is NOT a known namespace (tasks, batch).
    const instanceTriggerPattern =
      /\b(\w+)\.(?:trigger|triggerAndWait|batchTrigger|batchTriggerAndWait)\s*(?:<[^>]*>)?\s*\(/g;
    match = instanceTriggerPattern.exec(symbol.body);
    while (match !== null) {
      const varName = match[1];
      if (!NAMESPACE_NAMES.has(varName)) {
        connections.push({ type: 'task-trigger-ref', targetHint: varName, sourceLocation: loc });
      }
      match = instanceTriggerPattern.exec(symbol.body);
    }

    // ── 3. batch.trigger / batch.triggerAndWait (multi-task, string IDs) ─
    // batch.trigger<...>([{ id: "task-a", ... }, { id: "task-b", ... }])
    if (/\bbatch\.(?:trigger|triggerAndWait)\s*(?:<[^>]*>)?\s*\(/.test(symbol.body)) {
      const batchIdPattern = /\{\s*id\s*:\s*['"`]([^'"`]+)['"`]/g;
      match = batchIdPattern.exec(symbol.body);
      while (match !== null) {
        connections.push({ type: 'task-trigger', targetHint: match[1], sourceLocation: loc });
        match = batchIdPattern.exec(symbol.body);
      }
    }

    // ── 4. batch.triggerByTask / batch.triggerByTaskAndWait (refs) ─────
    // batch.triggerByTask([{ task: childTask1, ... }])
    if (/\bbatch\.(?:triggerByTask|triggerByTaskAndWait)\s*(?:<[^>]*>)?\s*\(/.test(symbol.body)) {
      const batchRefPattern = /\{\s*task\s*:\s*(\w+)/g;
      match = batchRefPattern.exec(symbol.body);
      while (match !== null) {
        connections.push({
          type: 'task-trigger-ref',
          targetHint: match[1],
          sourceLocation: loc,
        });
        match = batchRefPattern.exec(symbol.body);
      }
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
