/**
 * React context for sharing graph data with DocsTree and DocsViewer.
 *
 * Provides the symbol index, docs index, and a function to build
 * doc responses — all computed client-side from the graph prop.
 */

import { createContext, useContext } from 'react';
import type { SymbolIndex } from '../../../graph/symbol-index.js';
import type { FlowGraph } from '../../../graph/types.js';
import type { DocsIndex } from './DocsTree';

export interface GraphExplorerContextValue {
  /** The full flow graph. */
  graph: FlowGraph;
  /** Pre-built symbol index for doc lookups. */
  symbolIndex: SymbolIndex;
  /** Pre-built docs index grouped by directory (for DocsTree). */
  docsIndex: DocsIndex;
}

const GraphExplorerCtx = createContext<GraphExplorerContextValue | null>(null);

/** Provider component for the graph explorer context. */
export const GraphExplorerProvider = GraphExplorerCtx.Provider;

/**
 * Access graph explorer context.
 *
 * @returns The context value, or null if graph data is not yet available
 */
export function useGraphExplorer(): GraphExplorerContextValue | null {
  return useContext(GraphExplorerCtx);
}
