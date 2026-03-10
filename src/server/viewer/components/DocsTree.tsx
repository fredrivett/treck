import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { SymbolIndex } from '../../../graph/symbol-index.js';
import { docPathToUrl, urlToDocPath } from '../docs-utils';
import { type DocsIndex, type TreeNode, buildTree } from './docs-tree-data';
import { useGraphExplorer } from './GraphExplorerContext';
import { LoadingEllipsis } from './LoadingEllipsis';
import { getCategoryColors, getNodeCategory } from './node-categories';
import { SymbolTooltipContent } from './SymbolTooltip';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { useNodeSelection } from './useNodeSelection';

export { buildTree };
export type { DocsIndex, TreeNode };

const guideBase = 'w-4 shrink-0 relative self-stretch';
const guideLine = `${guideBase} before:content-[''] before:absolute before:left-[7px] before:top-0 before:bottom-0 before:border-l before:border-border`;
const guideTee = `${guideBase} before:content-[''] before:absolute before:left-[7px] before:top-0 before:bottom-0 before:border-l before:border-border after:content-[''] after:absolute after:left-[7px] after:top-1/2 after:right-0 after:border-t after:border-border`;
const guideCorner = `${guideBase} before:content-[''] before:absolute before:left-[7px] before:top-0 before:h-1/2 before:border-l before:border-border after:content-[''] after:absolute after:left-[7px] after:top-1/2 after:right-0 after:border-t after:border-border`;

function Guides({ guides, isLast }: { guides: boolean[]; isLast: boolean }) {
  return (
    <>
      {guides.map((hasLine, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: guides are positional and never reorder
        <span key={i} className={hasLine ? guideLine : guideBase} />
      ))}
      <span className={isLast ? guideCorner : guideTee} />
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
  /** When set, symbols act as graph node selectors instead of doc links. */
  onSymbolClick?: (nodeId: string, event: React.MouseEvent) => void;
  /** Currently selected node IDs (for highlighting in graph view). */
  selectedNodes?: Set<string>;
  /** Map from symbol name to graph node ID. */
  nameToNodeId?: Map<string, string>;
  /** Symbol index for looking up full symbol details in tooltips. */
  symbolIndex?: SymbolIndex;
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
  onSymbolClick,
  selectedNodes,
  nameToNodeId,
  symbolIndex,
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
          kind?: string;
          entryType?: string;
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
    <div>
      <button
        type="button"
        className="flex items-center w-full h-[26px] text-[13px] font-medium text-foreground cursor-pointer bg-transparent border-none p-0 text-left font-[inherit] hover:bg-muted"
        onClick={() => onToggleDir(dirPath)}
      >
        {depth > 0 && <Guides guides={guides} isLast={isLast} />}
        <span
          className="w-4 h-4 inline-flex items-center justify-center text-[10px] text-muted-foreground shrink-0 transition-transform duration-150 ease-in-out"
          style={isCollapsed ? { transform: 'rotate(-90deg)' } : undefined}
        >
          &#9660;
        </span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap ml-0.5">{name}</span>
      </button>
      {!isCollapsed && (
        <div>
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
                  onSymbolClick={onSymbolClick}
                  selectedNodes={selectedNodes}
                  nameToNodeId={nameToNodeId}
                  symbolIndex={symbolIndex}
                />
              );
            }
            const colors = getCategoryColors(getNodeCategory(item.sym));
            const nodeId = nameToNodeId?.get(item.sym.name);
            const isSelected = nodeId ? selectedNodes?.has(nodeId) : false;
            const hasSelection = selectedNodes && selectedNodes.size > 0;
            const isDimmed = hasSelection && !isSelected;
            const symInner = (
              <>
                <Guides guides={childGuides} isLast={itemIsLast} />
                <span
                  className="ml-0.5 overflow-hidden text-ellipsis"
                  style={{ color: colors.handle }}
                >
                  {item.sym.name}
                </span>
                {item.sym.hasJsDoc === false && !item.sym.isTrivial && (
                  <span className="ml-auto shrink-0 inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-semibold bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
                    !
                  </span>
                )}
              </>
            );

            const tooltipClasses = `${colors.bg} text-foreground border-0 p-3`;

            if (onSymbolClick && nodeId) {
              return (
                <Tooltip key={`sym-${item.sym.docPath}`}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => onSymbolClick(nodeId, e)}
                      className={`flex items-center w-full h-[26px] text-[13px] no-underline cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis bg-transparent border-none p-0 text-left font-[inherit] hover:bg-muted ${isSelected ? 'bg-border font-medium' : ''} ${isDimmed ? 'opacity-65' : ''}`}
                    >
                      {symInner}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className={tooltipClasses}
                    arrowClassName={`${colors.bg} fill-transparent`}
                    style={{
                      filter: `drop-shadow(0 0 1px ${colors.borderHex}) drop-shadow(0 0 1px ${colors.borderHex}) drop-shadow(0 0 1px ${colors.borderHex})`,
                    }}
                  >
                    <SymbolTooltipContent
                      name={item.sym.name}
                      kind={item.sym.kind}
                      entryType={item.sym.entryType}
                      isTrivial={item.sym.isTrivial}
                      docPath={item.sym.docPath}
                      symbolIndex={symbolIndex}
                    />
                  </TooltipContent>
                </Tooltip>
              );
            }

            const isActive = item.sym.docPath === activeDocPath;
            return (
              <Tooltip key={`sym-${item.sym.docPath}`}>
                <TooltipTrigger asChild>
                  <Link
                    to={docPathToUrl(item.sym.docPath)}
                    className={`flex items-center h-[26px] text-[13px] no-underline cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis hover:bg-muted ${isActive ? 'bg-border font-medium' : ''}`}
                  >
                    {symInner}
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className={tooltipClasses}
                  arrowClassName={`${colors.bg} fill-transparent`}
                  style={{
                    filter: `drop-shadow(0 0 1px ${colors.borderHex}) drop-shadow(0 0 1px ${colors.borderHex}) drop-shadow(0 0 1px ${colors.borderHex})`,
                  }}
                >
                  <SymbolTooltipContent
                    name={item.sym.name}
                    kind={item.sym.kind}
                    entryType={item.sym.entryType}
                    isTrivial={item.sym.isTrivial}
                    docPath={item.sym.docPath}
                    symbolIndex={symbolIndex}
                  />
                </TooltipContent>
              </Tooltip>
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
  const ctx = useGraphExplorer();
  const index: DocsIndex | null = ctx?.docsIndex ?? null;
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const location = useLocation();
  const isGraphView = location.pathname === '/';
  const { selected, clickNode } = useNodeSelection();

  const activeDocPath = useMemo(() => urlToDocPath(location.pathname), [location.pathname]);

  /** Map from symbol name to graph node ID for click-to-select in graph view. */
  const nameToNodeId = useMemo(() => {
    if (!ctx?.graph) return undefined;
    const map = new Map<string, string>();
    for (const node of ctx.graph.nodes) {
      map.set(node.name, node.id);
    }
    return map;
  }, [ctx?.graph]);

  // Auto-expand all directories when the search filter changes
  useEffect(() => {
    if (visibleNames !== null) {
      setCollapsedDirs(new Set());
    }
  }, [visibleNames]);

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
        <div className="text-sm text-muted-foreground">
          Loading
          <LoadingEllipsis />
        </div>
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
                onSymbolClick={isGraphView ? clickNode : undefined}
                selectedNodes={isGraphView ? selected : undefined}
                nameToNodeId={nameToNodeId}
                symbolIndex={ctx?.symbolIndex}
              />
            ))}
      </nav>
    </div>
  );
}
