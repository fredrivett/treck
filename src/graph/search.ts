/**
 * Full-text search over graph nodes using MiniSearch.
 *
 * Provides camelCase-aware tokenization so multi-word queries like
 * "dark mode" match identifiers like `useDarkMode`. Used by the MCP
 * server, local chat server, and website chat endpoint.
 */

import MiniSearch from 'minisearch';
import type { FlowGraph } from './types.js';

/** Opaque handle to a built search index. */
export type SearchIndex = MiniSearch;

/**
 * Tokenize text by splitting on camelCase boundaries and common separators.
 *
 * Splits `useDarkMode` into `["use", "dark", "mode"]` and
 * `src/api/route.ts:POST` into `["src", "api", "route", "ts", "post"]`.
 *
 * @param text - Raw text to tokenize
 * @returns Lowercased tokens
 */
export function camelCaseTokenize(text: string): string[] {
  return text
    .split(/[\s/._\-:]+/)
    .flatMap((word) =>
      word
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/\s+/),
    )
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 0);
}

/**
 * Build a MiniSearch index from a flow graph.
 *
 * Index once after loading the graph, then pass the result to
 * `executeSearchNodes` for fast, repeated searches.
 *
 * @param graph - The flow graph to index
 * @returns A reusable search index
 */
export function buildSearchIndex(graph: FlowGraph): SearchIndex {
  const index = new MiniSearch({
    fields: ['name', 'filePath', 'description', 'id'],
    storeFields: ['nodeId'],
    idField: 'docId',
    tokenize: camelCaseTokenize,
    searchOptions: {
      tokenize: camelCaseTokenize,
      boost: { name: 5, description: 2, filePath: 1, id: 1 },
      fuzzy: 0.2,
      prefix: true,
      combineWith: 'OR',
    },
  });

  const docs = graph.nodes.map((n, i) => ({
    docId: i,
    nodeId: n.id,
    name: n.name,
    filePath: n.filePath,
    description: n.description || '',
    id: n.id,
  }));

  index.addAll(docs);
  return index;
}
