/**
 * Builds a FlowGraph from static analysis of TypeScript source files.
 *
 * For each source file, extracts symbols, detects entry points via framework
 * matchers, resolves call-site edges (same-file and cross-file), and discovers
 * runtime connections (event dispatches, task triggers, HTTP calls).
 */

import { getRelativePath } from '../cli/utils/source-files.js';
import { isTrivialBody } from '../extractors/trivial.js';
import type { CallSite, ImportInfo, SymbolInfo } from '../extractors/types.js';
import { TypeScriptExtractor } from '../extractors/typescript/index.js';
import { ContentHasher } from '../hasher/index.js';
import { matchers } from '../matchers/index.js';
import type { ConnectionType, RuntimeConnection } from '../matchers/types.js';
import { resolveImportPath } from './resolve-import/index.js';
import type { EdgeType, FlowGraph, GraphEdge, GraphNode } from './types.js';

/**
 * Map a RuntimeConnection type to a GraphEdge EdgeType.
 * Falls back to 'async-dispatch' for unknown connection types.
 */
function connectionTypeToEdgeType(type: ConnectionType): EdgeType {
  switch (type) {
    case 'inngest-send':
      return 'event-emit';
    case 'inngest-invoke':
      return 'async-dispatch';
    case 'task-trigger':
      return 'async-dispatch';
    case 'task-trigger-ref':
      return 'async-dispatch';
    case 'fetch':
      return 'http-request';
    case 'navigation':
      return 'http-request';
    default:
      return 'async-dispatch';
  }
}

/**
 * Check whether a symbol's fullText indicates it is async.
 * Matches `async function`, `async (`, `async =>`  etc.
 */
function isAsyncSymbol(symbol: SymbolInfo): boolean {
  // Look for the `async` keyword appearing before the function body.
  // The regex ensures `async` is preceded by a word boundary (or start)
  // so we don't match strings like "getAsyncData".
  return /(?:^|\s)async\s/.test(symbol.fullText);
}

/** Builds a {@link FlowGraph} from TypeScript source files by extracting symbols, detecting entry points, and resolving call edges. */
export class GraphBuilder {
  private extractor = new TypeScriptExtractor();
  private hasher = new ContentHasher();

  /**
   * Build a FlowGraph from a set of TypeScript source file paths.
   */
  build(sourceFiles: string[]): FlowGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Map from node id → GraphNode for quick lookup
    const nodeMap = new Map<string, GraphNode>();

    // Map from filePath → SymbolInfo[] for cross-file resolution
    const fileSymbolsMap = new Map<string, SymbolInfo[]>();

    // Set for O(1) membership checks during edge resolution
    const sourceFileSet = new Set(sourceFiles);

    // ── Phase 1: Extract symbols and create nodes ──────────────────────

    for (const filePath of sourceFiles) {
      const { symbols } = this.extractor.extractSymbols(filePath);
      fileSymbolsMap.set(filePath, symbols);

      for (const symbol of symbols) {
        const relPath = getRelativePath(filePath);
        const id = `${relPath}:${symbol.name}`;

        // Detect entry point via framework matchers
        let entryType: GraphNode['entryType'];
        let metadata: GraphNode['metadata'];

        for (const matcher of matchers) {
          const match = matcher.detectEntryPoint(symbol, filePath);
          if (match) {
            entryType = match.entryType;
            metadata = match.metadata;
            break;
          }
        }

        const node: GraphNode = {
          id,
          name: symbol.name,
          kind: symbol.kind,
          filePath: relPath,
          isAsync: isAsyncSymbol(symbol),
          hash: this.hasher.hashSymbol(symbol),
          lineRange: [symbol.startLine, symbol.endLine],
          ...(entryType && { entryType }),
          ...(metadata && Object.keys(metadata).length > 0 && { metadata }),
          hasJsDoc: symbol.jsDoc !== undefined,
          ...(isTrivialBody(symbol.body) && { isTrivial: true }),
          ...(symbol.jsDoc?.description && { description: symbol.jsDoc.description }),
          ...(symbol.structuredParams &&
            symbol.structuredParams.length > 0 && { structuredParams: symbol.structuredParams }),
          ...(symbol.returnType && { returnType: symbol.returnType }),
          ...(symbol.isExported !== undefined && { isExported: symbol.isExported }),
          ...(symbol.jsDoc?.examples &&
            symbol.jsDoc.examples.length > 0 && { examples: symbol.jsDoc.examples }),
          ...(symbol.jsDoc?.deprecated !== undefined && { deprecated: symbol.jsDoc.deprecated }),
          ...(symbol.jsDoc?.throws &&
            symbol.jsDoc.throws.length > 0 && { throws: symbol.jsDoc.throws }),
          ...(symbol.jsDoc?.see && symbol.jsDoc.see.length > 0 && { see: symbol.jsDoc.see }),
        };

        nodes.push(node);
        nodeMap.set(id, node);
      }
    }

    // ── Phase 2: Build edges ───────────────────────────────────────────

    for (const filePath of sourceFiles) {
      const symbols = fileSymbolsMap.get(filePath);
      if (!symbols) continue;

      const imports = this.extractor.extractImports(filePath);

      for (const symbol of symbols) {
        const sourceRelPath = getRelativePath(filePath);
        const sourceId = `${sourceRelPath}:${symbol.name}`;

        // 2a. Direct call edges from call-site analysis
        const callSites = this.extractor.extractCallSites(filePath, symbol.name);
        let order = 0;

        for (const callSite of callSites) {
          const targetId = this.resolveCallSite(
            callSite,
            filePath,
            symbols,
            imports,
            sourceFileSet,
            nodeMap,
          );

          if (targetId && nodeMap.has(targetId)) {
            const isConditional = callSite.conditions && callSite.conditions.length > 0;
            edges.push({
              id: `${sourceId}->${targetId}`,
              source: sourceId,
              target: targetId,
              type: isConditional ? 'conditional-call' : 'direct-call',
              ...(isConditional && {
                conditions: callSite.conditions,
                label: callSite.conditions.map((c) => c.condition).join(' \u2192 '),
              }),
              isAsync: nodeMap.get(targetId)?.isAsync ?? false,
              order: order++,
            });
          }
        }

        // 2b. Runtime connection edges from framework matchers
        for (const matcher of matchers) {
          const connections = matcher.detectConnections(symbol, filePath);

          for (const connection of connections) {
            const resolved = matcher.resolveConnection(connection, sourceFiles, sourceFileSet);
            if (resolved) {
              const targetRelPath = getRelativePath(resolved.targetFilePath);
              const targetId = `${targetRelPath}:${resolved.targetName}`;

              if (nodeMap.has(targetId)) {
                edges.push({
                  id: `${sourceId}->${targetId}`,
                  source: sourceId,
                  target: targetId,
                  type: resolved.edgeType,
                  label: connection.targetHint,
                  isAsync: true,
                });
              } else {
                // Resolved target not in graph — fall through to metadata matching
                this.addUnresolvedConnectionEdge(sourceId, connection, edges, nodeMap);
              }
            } else {
              // Even if the matcher can't resolve, record the connection
              // with the information we have (no target node yet)
              this.addUnresolvedConnectionEdge(sourceId, connection, edges, nodeMap);
            }
          }
        }
      }
    }

    // ── Phase 3: Deduplicate edges ─────────────────────────────────────

    const dedupedEdges = this.deduplicateEdges(edges);

    // Free cached ASTs now that the build is complete
    this.extractor.clearCache();

    return {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      nodes,
      edges: dedupedEdges,
    };
  }

  /**
   * Resolve a call site to a target node ID.
   *
   * Strategy:
   * 1. Same-file match — find a symbol in the same file with the call name
   * 2. Cross-file match — find an import whose local name matches, then
   *    resolve the import path and look up the original symbol name in the
   *    target file's symbols
   * 3. Re-export follow — if the resolved file is a barrel that re-exports
   *    the symbol from another file, follow the chain
   */
  private resolveCallSite(
    callSite: CallSite,
    filePath: string,
    sameFileSymbols: SymbolInfo[],
    imports: ImportInfo[],
    sourceFileSet: Set<string>,
    nodeMap: Map<string, GraphNode>,
  ): string | null {
    const { name } = callSite;

    // 1. Same-file match
    const sameFileMatch = sameFileSymbols.find((s) => s.name === name);
    if (sameFileMatch) {
      const relPath = getRelativePath(filePath);
      return `${relPath}:${sameFileMatch.name}`;
    }

    // 2. Cross-file match via imports
    const importMatch = imports.find((imp) => imp.name === name);
    if (!importMatch) return null;

    const resolvedPath = resolveImportPath(filePath, importMatch.source);
    if (!resolvedPath) return null;

    // Only consider files that are part of the project
    if (!sourceFileSet.has(resolvedPath)) return null;

    const targetRelPath = getRelativePath(resolvedPath);
    const symbolName = importMatch.originalName;
    const directId = `${targetRelPath}:${symbolName}`;

    // If the symbol is defined directly in the resolved file, use it
    if (nodeMap.has(directId)) {
      return directId;
    }

    // 3. Follow re-exports — the resolved file may be a barrel that re-exports
    //    the symbol from another file
    return this.followReExport(resolvedPath, symbolName, sourceFileSet, nodeMap);
  }

  /**
   * Follow a re-export chain to find the actual defining file for a symbol.
   * e.g. index.ts: export { useSearch } from "./use-search" → use-search.ts
   */
  private followReExport(
    barrelPath: string,
    symbolName: string,
    sourceFileSet: Set<string>,
    nodeMap: Map<string, GraphNode>,
    depth = 0,
  ): string | null {
    // Guard against circular re-exports
    if (depth > 5) return null;

    const reExports = this.extractor.extractReExports(barrelPath);
    const match = reExports.find((re) => re.localName === symbolName);
    if (!match) return null;

    const resolvedPath = resolveImportPath(barrelPath, match.source);
    if (!resolvedPath || !sourceFileSet.has(resolvedPath)) return null;

    const targetRelPath = getRelativePath(resolvedPath);
    const targetId = `${targetRelPath}:${match.originalName}`;

    if (nodeMap.has(targetId)) {
      return targetId;
    }

    // The target might itself be another barrel — follow recursively
    return this.followReExport(resolvedPath, match.originalName, sourceFileSet, nodeMap, depth + 1);
  }

  /**
   * Try to create an edge for an unresolved runtime connection.
   * This handles cases where the matcher detected a connection pattern
   * but couldn't resolve it to a specific target symbol.
   */
  private addUnresolvedConnectionEdge(
    sourceId: string,
    connection: RuntimeConnection,
    edges: GraphEdge[],
    nodeMap: Map<string, GraphNode>,
  ): void {
    // Try to find a target node by matching the targetHint against
    // known node metadata (e.g., matching an event name to an inngest function)
    for (const [nodeId, node] of nodeMap) {
      // For invoke connections, match by variable name against inngest function nodes
      const isInvokeMatch =
        connection.type === 'inngest-invoke' &&
        node.entryType === 'inngest-function' &&
        node.name === connection.targetHint;

      // For event/task connections, match by metadata
      let isEventMatch = false;
      let isTaskMatch = false;
      if (node.metadata) {
        isEventMatch =
          connection.type === 'inngest-send' &&
          node.metadata.eventTrigger === connection.targetHint;

        isTaskMatch =
          connection.type === 'task-trigger' && node.metadata.taskId === connection.targetHint;
      }

      const isTaskRefMatch =
        connection.type === 'task-trigger-ref' &&
        (node.entryType === 'trigger-task' || node.entryType === 'trigger-scheduled-task') &&
        node.name === connection.targetHint;

      // For Next.js fetch/navigation, match by route metadata
      const isFetchMatch =
        connection.type === 'fetch' &&
        node.entryType === 'api-route' &&
        node.metadata?.route === connection.targetHint &&
        node.metadata?.httpMethod === connection.httpMethod;

      const isNavigationMatch =
        connection.type === 'navigation' &&
        node.entryType === 'page' &&
        node.metadata?.route === connection.targetHint;

      if (
        isEventMatch ||
        isTaskMatch ||
        isInvokeMatch ||
        isTaskRefMatch ||
        isFetchMatch ||
        isNavigationMatch
      ) {
        edges.push({
          id: `${sourceId}->${nodeId}`,
          source: sourceId,
          target: nodeId,
          type: connectionTypeToEdgeType(connection.type),
          label: connection.targetHint,
          isAsync: true,
        });
        return;
      }
    }
  }

  /**
   * Deduplicate edges by source+target, keeping the first occurrence.
   */
  private deduplicateEdges(edges: GraphEdge[]): GraphEdge[] {
    const seen = new Set<string>();
    const result: GraphEdge[] = [];

    for (const edge of edges) {
      const key = `${edge.source}->${edge.target}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(edge);
      }
    }

    return result;
  }
}
