import picomatch from 'picomatch';
import type { FlowGraph } from '../../graph/types.js';
import type { TreckConfig } from './config.js';

/**
 * Resolve focus targets to graph node IDs.
 *
 * Matches each target as an exact node ID first, then as a file path
 * (all symbols in that file). Unresolved targets are returned separately.
 *
 * @param targets - Comma-separated focus targets (file:symbol or file)
 * @param graph - The loaded flow graph
 * @returns Resolved node IDs and any unresolved target strings
 */
export function resolveFocusTargets(
  targets: string,
  graph: FlowGraph,
): { nodeIds: string[]; unresolved: string[] } {
  const nodeIdSet = new Set(graph.nodes.map((n) => n.id));
  const nodeIds: string[] = [];
  const unresolved: string[] = [];

  const allTargets = targets
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  for (const target of allTargets) {
    if (nodeIdSet.has(target)) {
      nodeIds.push(target);
    } else {
      const fileMatches = graph.nodes.filter((n) => n.filePath === target);
      if (fileMatches.length > 0) {
        nodeIds.push(...fileMatches.map((n) => n.id));
      } else {
        unresolved.push(target);
      }
    }
  }

  return { nodeIds, unresolved };
}

/**
 * Explain why a file path couldn't be resolved against the graph.
 *
 * Checks whether the file is outside the configured scope (not matched
 * by include patterns, or matched by exclude patterns).
 *
 * @param filePath - The file path portion of the unresolved target
 * @param config - The loaded treck config with scope patterns
 * @returns Human-readable reason, or null if the cause is unclear
 */
export function explainUnresolved(filePath: string, config: TreckConfig): string | null {
  const isIncluded = config.scope.include.some((pattern) => picomatch(pattern)(filePath));
  if (!isIncluded) {
    return `not matched by scope.include: ${config.scope.include.join(', ')}`;
  }

  const isExcluded = config.scope.exclude.some((pattern) => picomatch(pattern)(filePath));
  if (isExcluded) {
    return 'matched by scope.exclude';
  }

  return null;
}
