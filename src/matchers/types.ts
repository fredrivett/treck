/**
 * Types for pluggable framework matchers
 *
 * Each matcher detects framework-specific patterns:
 * - Entry points (API routes, task definitions, pages)
 * - Runtime connections (event dispatches, task triggers, HTTP calls)
 */

import type { SymbolInfo } from '../extractors/types.js';
import type { EdgeType, EntryPointMetadata, EntryType } from '../graph/types.js';

/**
 * Result of detecting an entry point
 */
export interface EntryPointMatch {
  entryType: EntryType;
  metadata: EntryPointMetadata;
}

/**
 * A runtime connection detected by pattern matching (not yet resolved)
 */
export interface RuntimeConnection {
  type: string; // "inngest-send", "task-trigger", "fetch"
  targetHint: string; // "image/analyze", "process-image", "/api/foo"
  sourceLocation: [number, number]; // line range in source
}

/**
 * A runtime connection that has been resolved to a target symbol
 */
export interface ResolvedConnection {
  targetSymbol: SymbolInfo;
  targetFilePath: string;
  edgeType: EdgeType;
}

/**
 * Interface that all framework matchers implement.
 * To add support for a new framework, create a new file in src/matchers/
 * implementing this interface and add it to the registry in index.ts.
 */
export interface FrameworkMatcher {
  name: string;

  /**
   * Detect if a symbol is an entry point for this framework.
   * Returns null if the symbol is not an entry point.
   */
  detectEntryPoint(symbol: SymbolInfo, filePath: string): EntryPointMatch | null;

  /**
   * Detect runtime connections within a symbol's body.
   * These are calls that cross process boundaries (events, tasks, HTTP).
   */
  detectConnections(symbol: SymbolInfo, filePath: string): RuntimeConnection[];

  /**
   * Resolve a detected connection to a target symbol in the codebase.
   * Returns null if the target cannot be found.
   */
  resolveConnection(
    connection: RuntimeConnection,
    projectFiles: string[],
  ): ResolvedConnection | null;
}
