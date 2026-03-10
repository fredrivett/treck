/**
 * Pure data types and logic for the docs tree, free of UI/React dependencies.
 *
 * Separated from DocsTree.tsx so tests can import without pulling in
 * React components and their transitive UI dependencies.
 */

/** Shape of the docs index returned by the server. */
export type DocsIndex = Record<
  string,
  Array<{
    name: string;
    docPath: string;
    overview: string;
    hasJsDoc?: boolean;
    isTrivial?: boolean;
    kind?: string;
    entryType?: string;
  }>
>;

/** A node in the docs tree hierarchy. */
export interface TreeNode {
  children: Record<string, TreeNode>;
  symbols: Array<{
    name: string;
    docPath: string;
    overview: string;
    hasJsDoc?: boolean;
    isTrivial?: boolean;
    kind?: string;
    entryType?: string;
  }>;
}

/**
 * Build a tree from the docs index, optionally filtering to only visible symbol names.
 *
 * @param index - The flat docs index grouped by directory
 * @param visibleNames - When set, only includes symbols whose names are in this set
 */
export function buildTree(index: DocsIndex, visibleNames: Set<string> | null): TreeNode {
  const root: TreeNode = { children: {}, symbols: [] };

  for (const [dir, symbols] of Object.entries(index)) {
    const filtered = visibleNames ? symbols.filter((s) => visibleNames.has(s.name)) : symbols;
    if (filtered.length === 0) continue;

    const parts = dir === '.' ? ['.'] : dir.split('/');
    let node = root;
    for (const part of parts) {
      if (!node.children[part]) {
        node.children[part] = { children: {}, symbols: [] };
      }
      node = node.children[part];
    }
    node.symbols.push(...filtered);
  }

  return root;
}
