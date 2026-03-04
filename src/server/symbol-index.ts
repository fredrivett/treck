/**
 * Server-side symbol index — extends the browser-safe base with SVG rendering.
 *
 * Re-exports all browser-safe functions and adds `buildDocResponseWithSVG`
 * which renders mermaid dependency graphs to SVG using `beautiful-mermaid`.
 */

import { renderMermaidSVG } from 'beautiful-mermaid';
import { buildDocResponse, type SymbolIndex } from '../graph/symbol-index.js';
import type { FlowGraph } from '../graph/types.js';

export type { SymbolEntry, SymbolIndex } from '../graph/symbol-index.js';
export {
  buildDocResponse,
  buildIndexResponse,
  buildSymbolIndexFromGraph,
} from '../graph/symbol-index.js';

/**
 * Build the doc response with server-side SVG rendering for the dependency graph.
 *
 * Wraps the browser-safe `buildDocResponse` and replaces the raw mermaid
 * source with a rendered SVG string.
 *
 * @param docPath - Virtual doc path (e.g. "src/checker/index/StaleChecker.md")
 * @param index - The symbol index for metadata enrichment
 * @param graph - The flow graph for rendering and mermaid generation
 * @returns Enriched doc response with SVG dependency graph, or null
 */
export function buildDocResponseWithSVG(docPath: string, index: SymbolIndex, graph: FlowGraph) {
  const response = buildDocResponse(docPath, index, graph);
  if (!response) return null;

  if (response.dependencyGraph) {
    try {
      response.dependencyGraph = renderMermaidSVG(response.dependencyGraph, {
        bg: '#ffffff',
        fg: '#1e293b',
      });
    } catch {
      // Keep raw mermaid string if rendering fails
    }
  }

  return response;
}
