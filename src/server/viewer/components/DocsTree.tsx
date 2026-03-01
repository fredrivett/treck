import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { docPathToUrl, urlToDocPath } from '../docs-utils';

export type DocsIndex = Record<
  string,
  Array<{
    name: string;
    docPath: string;
    overview: string;
    hasJsDoc?: boolean;
    isTrivial?: boolean;
  }>
>;

export interface TreeNode {
  children: Record<string, TreeNode>;
  symbols: Array<{
    name: string;
    docPath: string;
    overview: string;
    hasJsDoc?: boolean;
    isTrivial?: boolean;
  }>;
}

/** Build a tree from the docs index, optionally filtering to only visible symbol names. */
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

function Guides({ guides, isLast }: { guides: boolean[]; isLast: boolean }) {
  return (
    <>
      {guides.map((hasLine, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: guides are positional and never reorder
        <span key={i} className={hasLine ? 'guide guide-line' : 'guide'} />
      ))}
      <span className={isLast ? 'guide guide-corner' : 'guide guide-tee'} />
    </>
  );
}

interface TreeDirProps {
  name: string;
  node: TreeNode;
  depth: number;
  guides: boolean[];
  isLast: boolean;
  activeDocPath: string | null;
  collapsedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  dirPath: string;
}

function TreeDir({
  name,
  node,
  depth,
  guides,
  isLast,
  activeDocPath,
  collapsedDirs,
  onToggleDir,
  dirPath,
}: TreeDirProps) {
  const hasChildren = Object.keys(node.children).length > 0 || node.symbols.length > 0;
  if (!hasChildren) return null;

  const isCollapsed = collapsedDirs.has(dirPath);
  const childGuides = depth > 0 ? [...guides, !isLast] : [];

  const sortedDirs = Object.keys(node.children).sort();
  const allItems: Array<
    | { type: 'dir'; name: string }
    | {
        type: 'sym';
        sym: {
          name: string;
          docPath: string;
          overview: string;
          hasJsDoc?: boolean;
          isTrivial?: boolean;
        };
      }
  > = [];
  for (const d of sortedDirs) {
    allItems.push({ type: 'dir', name: d });
  }
  for (const sym of node.symbols) {
    allItems.push({ type: 'sym', sym });
  }

  return (
    <div className="tree-dir">
      <button type="button" className="tree-dir-label" onClick={() => onToggleDir(dirPath)}>
        {depth > 0 && <Guides guides={guides} isLast={isLast} />}
        <span className="chevron" style={isCollapsed ? { transform: 'rotate(-90deg)' } : undefined}>
          &#9660;
        </span>
        <span className="dir-name">{name}</span>
      </button>
      {!isCollapsed && (
        <div className="tree-children">
          {allItems.map((item, i) => {
            const itemIsLast = i === allItems.length - 1;
            if (item.type === 'dir') {
              return (
                <TreeDir
                  key={`dir-${item.name}`}
                  name={item.name}
                  node={node.children[item.name]}
                  depth={depth + 1}
                  guides={childGuides}
                  isLast={itemIsLast}
                  activeDocPath={activeDocPath}
                  collapsedDirs={collapsedDirs}
                  onToggleDir={onToggleDir}
                  dirPath={`${dirPath}/${item.name}`}
                />
              );
            }
            const isActive = item.sym.docPath === activeDocPath;
            return (
              <Link
                key={`sym-${item.sym.docPath}`}
                to={docPathToUrl(item.sym.docPath)}
                className={`tree-item ${isActive ? 'active' : ''}`}
              >
                <Guides guides={childGuides} isLast={itemIsLast} />
                <span className="item-name">{item.sym.name}</span>
                {item.sym.hasJsDoc === false && !item.sym.isTrivial && (
                  <span
                    className="ml-auto text-[10px] text-amber-500 opacity-70"
                    title="Missing JSDoc comment"
                  >
                    !
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DocsTreeProps {
  visibleNames: Set<string> | null;
}

/** File tree navigation for browsing documented symbols. */
export function DocsTree({ visibleNames }: DocsTreeProps) {
  const [index, setIndex] = useState<DocsIndex | null>(null);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const location = useLocation();

  const activeDocPath = useMemo(() => urlToDocPath(location.pathname), [location.pathname]);

  // Auto-expand all directories when the search filter changes
  useEffect(() => {
    if (visibleNames !== null) {
      setCollapsedDirs(new Set());
    }
  }, [visibleNames]);

  useEffect(() => {
    fetch('/api/index')
      .then((r) => r.json())
      .then(setIndex);
  }, []);

  const tree = useMemo(() => {
    if (!index) return null;
    return buildTree(index, visibleNames);
  }, [index, visibleNames]);

  const onToggleDir = useCallback((dirPath: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    if (!tree) return;
    const allPaths = new Set<string>();
    function collectPaths(node: TreeNode, path: string) {
      for (const [name, child] of Object.entries(node.children)) {
        const childPath = `${path}/${name}`;
        allPaths.add(childPath);
        collectPaths(child, childPath);
      }
    }
    collectPaths(tree, '');
    setCollapsedDirs(allPaths);
  }, [tree]);

  const expandAll = useCallback(() => {
    setCollapsedDirs(new Set());
  }, []);

  if (!index) {
    return (
      <div className="p-4 flex-1 overflow-auto">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 pt-2 pb-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={collapseAll}
            className="flex-1 px-2 py-1 text-[11px] font-medium text-muted-foreground bg-background border border-border rounded cursor-pointer hover:bg-muted hover:text-foreground flex items-center justify-center gap-1"
          >
            <ChevronsDownUp size={12} />
            Collapse all
          </button>
          <button
            type="button"
            onClick={expandAll}
            className="flex-1 px-2 py-1 text-[11px] font-medium text-muted-foreground bg-background border border-border rounded cursor-pointer hover:bg-muted hover:text-foreground flex items-center justify-center gap-1"
          >
            <ChevronsUpDown size={12} />
            Expand all
          </button>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {tree &&
          Object.entries(tree.children)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, node]) => (
              <TreeDir
                key={name}
                name={name}
                node={node}
                depth={0}
                guides={[]}
                isLast={false}
                activeDocPath={activeDocPath}
                collapsedDirs={collapsedDirs}
                onToggleDir={onToggleDir}
                dirPath={`/${name}`}
              />
            ))}
      </nav>
    </div>
  );
}
