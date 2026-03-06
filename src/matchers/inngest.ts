/**
 * Inngest framework matcher
 *
 * Detects:
 * - Inngest function definitions (inngest.createFunction)
 * - Event dispatches (inngest.send, step.sendEvent)
 * - Function invocations (step.invoke)
 */

import type { ImportInfo, SymbolInfo } from '../extractors/types.js';
import type {
  EntryPointMatch,
  FrameworkMatcher,
  ResolvedConnection,
  RuntimeConnection,
} from './types.js';

/**
 * Extract the event name from an inngest.createFunction call.
 * Looks for patterns like: { event: "user/created" } or { event: "app/image.analyzed" }
 */
function extractEventTrigger(body: string): string | null {
  // Match event: "..." or event: '...'
  const eventMatch = body.match(/event\s*:\s*['"`]([^'"`]+)['"`]/);
  return eventMatch ? eventMatch[1] : null;
}

/**
 * Extract the function ID from an inngest.createFunction call.
 * Looks for patterns like: { id: "analyze-image" }
 */
function extractFunctionId(body: string): string | null {
  const idMatch = body.match(/id\s*:\s*['"`]([^'"`]+)['"`]/);
  return idMatch ? idMatch[1] : null;
}

export const inngestMatcher: FrameworkMatcher = {
  name: 'inngest',

  /** Detect Inngest function definitions (via `createFunction`) as entry points. */
  detectEntryPoint(
    symbol: SymbolInfo,
    _filePath: string,
    imports?: ImportInfo[],
  ): EntryPointMatch | null {
    if (
      symbol.kind === 'const' &&
      symbol.initializerCall?.functionName === 'createFunction' &&
      symbol.initializerCall.expression.includes('.') &&
      imports?.some((imp) => imp.source.includes('inngest'))
    ) {
      const eventTrigger = extractEventTrigger(symbol.body);
      const taskId = extractFunctionId(symbol.body);

      return {
        entryType: 'inngest-function',
        metadata: {
          ...(eventTrigger && { eventTrigger }),
          ...(taskId && { taskId }),
        },
      };
    }

    return null;
  },

  /** Detect `inngest.send()`, `step.sendEvent()`, and `step.invoke()` calls as runtime connections. */
  detectConnections(symbol: SymbolInfo, _filePath: string): RuntimeConnection[] {
    const connections: RuntimeConnection[] = [];
    let match: RegExpExecArray | null;

    // Detect inngest.send({ name: "event" }) — supports optional array wrapper
    const sendPattern = /\.send\s*\(\s*\[?\s*\{[^}]*name\s*:\s*['"`]([^'"`]+)['"`]/g;
    match = sendPattern.exec(symbol.body);
    while (match !== null) {
      connections.push({
        type: 'inngest-send',
        targetHint: match[1],
        sourceLocation: [symbol.startLine, symbol.endLine],
      });
      match = sendPattern.exec(symbol.body);
    }

    // Detect step.sendEvent("step-name", { name: "event" }) — supports optional array wrapper
    const stepSendPattern =
      /step\.sendEvent\s*\(\s*['"`][^'"`]*['"`]\s*,\s*\[?\s*\{[^}]*name\s*:\s*['"`]([^'"`]+)['"`]/g;
    match = stepSendPattern.exec(symbol.body);
    while (match !== null) {
      connections.push({
        type: 'inngest-send',
        targetHint: match[1],
        sourceLocation: [symbol.startLine, symbol.endLine],
      });
      match = stepSendPattern.exec(symbol.body);
    }

    // Detect step.invoke() — both old API and new API with step name
    const invokePattern =
      /step\.invoke\s*\(\s*(?:['"`][^'"`]*['"`]\s*,\s*)?\{[^}]*function\s*:\s*(\w+)/g;
    match = invokePattern.exec(symbol.body);
    while (match !== null) {
      connections.push({
        type: 'inngest-invoke',
        targetHint: match[1],
        sourceLocation: [symbol.startLine, symbol.endLine],
      });
      match = invokePattern.exec(symbol.body);
    }

    return connections;
  },

  /** Resolve an Inngest runtime connection to a concrete graph edge. Not yet implemented. */
  resolveConnection(
    _connection: RuntimeConnection,
    _projectFiles: string[],
  ): ResolvedConnection | null {
    return null;
  },
};
