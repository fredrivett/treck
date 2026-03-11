/**
 * Unified graph explorer component.
 *
 * Self-contained viewer accepting a graph prop. Renders the full experience:
 * sidebar (ViewNav + FlowControls + DocsTree), main area (FlowGraph or
 * DocsViewer), and all filter state. Used by both the local viewer and the
 * website showcases.
 */

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { Route, Routes, useLocation, useSearchParams } from 'react-router';
import { buildIndexResponse, buildSymbolIndexFromGraph } from '../../../graph/symbol-index.js';
import type { FlowGraph as FlowGraphData } from '../../../graph/types.js';
import { ChatPanel } from './ChatPanel';
import { DocsTree } from './DocsTree';
import { DocsViewer } from './DocsViewer';
import { type DiffSummary, FlowControls } from './FlowControls';
import { FlowGraph, getNodeCategory, type NodeCategory } from './FlowGraph';
import { type GraphExplorerContextValue, GraphExplorerProvider } from './GraphExplorerContext';
import { LoadingSpinner } from './LoadingSpinner';
import { Sidebar } from './Sidebar';
import { Button, buttonVariants } from './ui/button';
import { Kbd } from './ui/kbd';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable';
import { useLiveDiff } from './useLiveDiff';
import { ViewNav } from './ViewNav';

/** Default size (pixels) for the left sidebar panel. */
const SIDEBAR_DEFAULT_SIZE = 280;
/** Default size (pixels) for the chat panel. */
const CHAT_DEFAULT_SIZE = 400;

interface GraphExplorerProps {
  /** The flow graph data to explore. Null while loading. */
  graph: FlowGraphData | null;
  /** Whether the graph is currently loading. */
  loading?: boolean;
  /** Error message if the graph failed to load. */
  error?: string | null;
  /** Showcase project slug — passed through to the chat panel so requests load the correct graph. */
  project?: string;
}

/** Standalone graph explorer — renders sidebar, graph, and docs from a single graph prop. */
export function GraphExplorer({
  graph,
  loading = false,
  error = null,
  project,
}: GraphExplorerProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [layoutReady, setLayoutReady] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [isOffCenter, setIsOffCenter] = useState(false);
  const recenterRef = useRef<(() => void) | null>(null);
  const sidebarPanelRef = useRef<PanelImperativeHandle>(null);
  const chatPanelRef = useRef<PanelImperativeHandle>(null);
  const isGraphView = location.pathname === '/';

  // Read persisted panel widths from localStorage (pixels)
  const savedSidebarSize = useMemo(() => {
    const v = localStorage.getItem('treck-sidebar-width');
    return v ? Number(v) : SIDEBAR_DEFAULT_SIZE;
  }, []);

  /** Toggle chat panel via collapse/expand on the always-mounted panel. */
  const toggleChat = useCallback(() => {
    const panel = chatPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      const saved = localStorage.getItem('treck-chat-width');
      const target = saved ? Number(saved) : CHAT_DEFAULT_SIZE;
      panel.resize(target);
    } else {
      panel.collapse();
    }
  }, []);

  // Restore saved sidebar width on mount
  useEffect(() => {
    if (savedSidebarSize !== SIDEBAR_DEFAULT_SIZE) {
      sidebarPanelRef.current?.resize(savedSidebarSize);
    }
  }, [savedSidebarSize]);

  // Global keyboard shortcuts (Cmd/Ctrl prefixed so they work in inputs too)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === '/' && isGraphView) {
        e.preventDefault();
        toggleChat();
      }
      if (e.key === '.' && isGraphView && isOffCenter) {
        e.preventDefault();
        recenterRef.current?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGraphView, isOffCenter, toggleChat]);

  const onLayoutReady = useCallback(() => {
    setLayoutReady(true);
  }, []);

  // --- URL-persisted filter state ---

  /** Set or delete a single URL search param. */
  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((prev) => {
        if (value) prev.set(key, value);
        else prev.delete(key);
        return prev;
      });
    },
    [setSearchParams],
  );

  const searchQuery = searchParams.get('q') || '';
  const setSearchQuery = useCallback((q: string) => setParam('q', q || null), [setParam]);

  const enabledTypes = useMemo<Set<NodeCategory> | null>(() => {
    const param = searchParams.get('types');
    if (!param) return null;
    return new Set(param.split(','));
  }, [searchParams]);

  const showConditionals = searchParams.get('conditionals') === 'true';

  // --- Live diff state ---
  const diffEnabled = searchParams.get('diff') === 'true';
  const { diff: diffData, baseRef: diffBaseRef } = useLiveDiff(diffEnabled);

  // --- Unified depth state (single URL param for both diff and focus) ---
  const [focusMaxDepth, setFocusMaxDepth] = useState(0);
  const maxDepth = diffEnabled ? (diffData?.maxDepth ?? 0) : focusMaxDepth;
  const depthParam = searchParams.get('depth');
  const depth = depthParam != null ? Math.min(Number(depthParam), maxDepth) : maxDepth;
  const setDepth = useCallback(
    (d: number) => setParam('depth', d < maxDepth ? String(d) : null),
    [setParam, maxDepth],
  );

  /** When focus max depth changes, update the max. */
  const handleFocusMaxDepthChange = useCallback((maxDepth: number) => {
    setFocusMaxDepth(maxDepth);
  }, []);

  const diffSummary = useMemo<DiffSummary | null>(() => {
    if (!diffData) return null;
    return {
      modified: diffData.changes.modified.length,
      added: diffData.changes.added.length,
      removed: diffData.changes.removed.length,
    };
  }, [diffData]);

  /** Build a full FlowGraphData from the diff subgraph filtered by depth. */
  const diffGraph = useMemo<FlowGraphData | null>(() => {
    if (!diffData || !graph) return null;
    const depths = diffData.nodeDepths;
    // Filter nodes to those within the selected depth
    const nodes = diffData.nodes.filter((n) => (depths[n.id] ?? 0) <= depth);
    // Include removed nodes (ghost nodes) — they have depth 0 (they are changed nodes)
    const allNodes = [...nodes, ...diffData.removedNodes];
    const nodeIds = new Set(allNodes.map((n) => n.id));
    const edges = [...diffData.edges, ...diffData.removedEdges].filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    );
    return { ...graph, nodes: allNodes, edges };
  }, [diffData, depth, graph]);

  // --- Computed graph data ---

  const availableTypes = useMemo(() => {
    if (!graph) return new Map<NodeCategory, number>();
    const counts = new Map<NodeCategory, number>();
    for (const node of graph.nodes) {
      const cat = getNodeCategory(node);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return counts;
  }, [graph]);

  const hasConditionalEdges = useMemo(
    () => !!graph?.edges.some((e) => e.type === 'conditional-call'),
    [graph],
  );

  const filteredGraph = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    // When diff is active, start from the diff subgraph instead of the full graph
    let filtered: Pick<FlowGraphData, 'nodes' | 'edges'> = diffGraph ?? graph;

    if (enabledTypes) {
      const typeMatchIds = new Set(
        filtered.nodes.filter((n) => enabledTypes.has(getNodeCategory(n))).map((n) => n.id),
      );
      filtered = {
        nodes: filtered.nodes.filter((n) => typeMatchIds.has(n.id)),
        edges: filtered.edges.filter(
          (e) => typeMatchIds.has(e.source) && typeMatchIds.has(e.target),
        ),
      };
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchingIds = new Set(
        filtered.nodes
          .filter(
            (n) =>
              n.name.toLowerCase().includes(q) ||
              n.filePath.toLowerCase().includes(q) ||
              n.metadata?.route?.toLowerCase().includes(q) ||
              n.metadata?.eventTrigger?.toLowerCase().includes(q) ||
              n.metadata?.taskId?.toLowerCase().includes(q),
          )
          .map((n) => n.id),
      );
      filtered = {
        nodes: filtered.nodes.filter((n) => matchingIds.has(n.id)),
        edges: filtered.edges.filter((e) => matchingIds.has(e.source) && matchingIds.has(e.target)),
      };
    }

    return filtered;
  }, [graph, searchQuery, enabledTypes, diffGraph]);

  const onToggleType = useCallback(
    (category: NodeCategory) => {
      const current = enabledTypes;
      let next: Set<NodeCategory> | null;
      if (!current) {
        const all = new Set(availableTypes.keys());
        all.delete(category);
        next = all;
      } else {
        next = new Set(current);
        if (next.has(category)) {
          next.delete(category);
        } else {
          next.add(category);
        }
        if (next.size === availableTypes.size) next = null;
      }
      setParam('types', next ? [...next].join(',') : null);
    },
    [enabledTypes, availableTypes, setParam],
  );

  // --- Docs data (computed client-side from graph) ---

  const symbolIndex = useMemo(() => (graph ? buildSymbolIndexFromGraph(graph) : null), [graph]);

  const docsIndex = useMemo(
    () => (symbolIndex ? buildIndexResponse(symbolIndex) : null),
    [symbolIndex],
  );

  // Visible symbol names for DocsTree filter sync
  const hasFilter = searchQuery.trim() !== '' || enabledTypes !== null;
  const visibleNames = useMemo(() => {
    if (!graph || !hasFilter) return null;
    return new Set(filteredGraph.nodes.map((n) => n.name));
  }, [graph, hasFilter, filteredGraph]);

  // Context value for DocsTree and DocsViewer
  const contextValue = useMemo<GraphExplorerContextValue | null>(() => {
    if (!graph || !symbolIndex || !docsIndex) return null;
    return { graph, symbolIndex, docsIndex };
  }, [graph, symbolIndex, docsIndex]);

  // --- Render ---

  const graphView = (
    <div className="w-full h-full relative">
      {!layoutReady && (
        <div className="absolute inset-0 z-20 bg-background">
          <LoadingSpinner />
        </div>
      )}
      {error && (
        <div className="flex flex-col items-center justify-center h-full font-sans text-red-500 gap-2">
          <div className="font-semibold">Error loading graph</div>
          <div className="text-muted-foreground text-sm">{error}</div>
          <div className="text-muted-foreground text-[13px] mt-2">
            Make sure you've run <code className="bg-muted px-1.5 rounded">treck sync</code> first.
          </div>
        </div>
      )}
      {!error && !loading && (!graph || graph.nodes.length === 0) && (
        <div className="flex flex-col items-center justify-center h-full font-sans text-muted-foreground gap-2">
          <div className="font-semibold text-base">No graph data</div>
          <div className="text-sm">
            Run <code className="bg-muted px-1.5 rounded">treck sync</code> to build the project
            call graph.
          </div>
        </div>
      )}
      {graph && (
        <FlowGraph
          graph={diffEnabled && diffGraph ? diffGraph : graph}
          diffData={diffData}
          focusDepth={depth}
          onFocusMaxDepthChange={handleFocusMaxDepthChange}
          onLayoutReady={onLayoutReady}
          searchQuery={searchQuery}
          enabledTypes={enabledTypes}
          showConditionals={showConditionals}
          recenterRef={recenterRef}
          onOffCenterChange={setIsOffCenter}
        />
      )}
    </div>
  );

  /** Persist sidebar width to localStorage when it changes. */
  const onSidebarResize = useCallback((size: { inPixels: number }) => {
    localStorage.setItem('treck-sidebar-width', String(Math.round(size.inPixels)));
  }, []);

  /** Persist chat width to localStorage when it changes and sync open state. */
  const onChatResize = useCallback((size: { inPixels: number }) => {
    if (size.inPixels > 0) {
      localStorage.setItem('treck-chat-width', String(Math.round(size.inPixels)));
      setChatOpen(true);
    } else {
      setChatOpen(false);
    }
  }, []);

  /** Reset the left sidebar to its default width. */
  const resetSidebar = useCallback(() => {
    sidebarPanelRef.current?.resize(SIDEBAR_DEFAULT_SIZE);
  }, []);

  /** Reset the chat panel to its default width. */
  const resetChat = useCallback(() => {
    chatPanelRef.current?.resize(CHAT_DEFAULT_SIZE);
  }, []);

  const content = (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel
        id="sidebar"
        panelRef={sidebarPanelRef}
        defaultSize={SIDEBAR_DEFAULT_SIZE}
        minSize={200}
        maxSize={500}
        order={1}
        groupResizeBehavior="preserve-pixel-size"
        onResize={onSidebarResize}
      >
        <Sidebar>
          <ViewNav />
          <FlowControls
            loading={loading}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            nodeCount={filteredGraph.nodes.length}
            edgeCount={filteredGraph.edges.length}
            availableTypes={availableTypes}
            enabledTypes={enabledTypes}
            onToggleType={onToggleType}
            onSoloType={(category) => setParam('types', category)}
            onResetTypes={() => setParam('types', null)}
            showConditionals={showConditionals}
            onToggleConditionals={() => setParam('conditionals', showConditionals ? null : 'true')}
            hasConditionalEdges={hasConditionalEdges}
            diffEnabled={diffEnabled}
            onToggleDiff={() => {
              setSearchParams((prev) => {
                if (diffEnabled) {
                  prev.delete('diff');
                  prev.delete('depth');
                } else {
                  prev.set('diff', 'true');
                  prev.set('depth', '0'); // diff starts at depth 0 (changed nodes only)
                }
                return prev;
              });
            }}
            baseRef={diffBaseRef}
            diffSummary={diffSummary}
            depth={depth}
            maxDepth={maxDepth}
            onDepthChange={setDepth}
          />
          <div className="border-t border-border" />
          <DocsTree visibleNames={visibleNames} />
        </Sidebar>
      </ResizablePanel>
      <ResizableHandle onDoubleClick={resetSidebar} />
      <ResizablePanel id="main" order={2} minSize={300}>
        <main className="h-full relative overflow-hidden">
          <Routes>
            <Route path="/" element={graphView} />
            <Route path="/docs" element={<DocsViewer />} />
            <Route path="/docs/*" element={<DocsViewer />} />
          </Routes>
          {isGraphView && (
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 items-end">
              <Button
                variant="subtle"
                size="sm"
                onClick={toggleChat}
                title={chatOpen ? 'Close AI chat' : 'Open AI chat'}
                className="gap-1.5"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Chat
                <Kbd mod>/</Kbd>
              </Button>
              <AnimatePresence>
                {isOffCenter && (
                  <motion.button
                    key="recenter"
                    type="button"
                    onClick={() => recenterRef.current?.()}
                    className={buttonVariants({
                      variant: 'subtle',
                      size: 'sm',
                      className: 'gap-1.5 cursor-pointer',
                    })}
                    title="Recenter view on nodes"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                    </svg>
                    Recenter
                    <Kbd mod>.</Kbd>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          )}
        </main>
      </ResizablePanel>
      <ResizableHandle onDoubleClick={resetChat} />
      <ResizablePanel
        id="chat"
        panelRef={chatPanelRef}
        defaultSize={0}
        minSize={280}
        maxSize={600}
        collapsible
        collapsedSize={0}
        order={3}
        groupResizeBehavior="preserve-pixel-size"
        onResize={onChatResize}
      >
        {chatOpen && <ChatPanel onClose={toggleChat} project={project} />}
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  if (contextValue) {
    return <GraphExplorerProvider value={contextValue}>{content}</GraphExplorerProvider>;
  }

  return content;
}
