/**
 * Unified graph explorer component.
 *
 * Self-contained viewer accepting a graph prop. Renders the full experience:
 * sidebar (ViewNav + FlowControls + DocsTree), main area (FlowGraph or
 * DocsViewer), and all filter state. Used by both the local viewer and the
 * website showcases.
 */

import { useCallback, useMemo, useState } from 'react';
import { Route, Routes, useLocation, useSearchParams } from 'react-router';
import { buildIndexResponse, buildSymbolIndexFromGraph } from '../../../graph/symbol-index.js';
import type { FlowGraph as FlowGraphData } from '../../../graph/types.js';
import { ChatPanel } from './ChatPanel';
import { DocsTree } from './DocsTree';
import { DocsViewer } from './DocsViewer';
import { FlowControls } from './FlowControls';
import { FlowGraph, getNodeCategory, type NodeCategory } from './FlowGraph';
import { type GraphExplorerContextValue, GraphExplorerProvider } from './GraphExplorerContext';
import { LoadingSpinner } from './LoadingSpinner';
import { Sidebar } from './Sidebar';
import { ViewNav } from './ViewNav';

interface GraphExplorerProps {
  /** The flow graph data to explore. Null while loading. */
  graph: FlowGraphData | null;
  /** Whether the graph is currently loading. */
  loading?: boolean;
  /** Error message if the graph failed to load. */
  error?: string | null;
}

/** Standalone graph explorer — renders sidebar, graph, and docs from a single graph prop. */
export function GraphExplorer({ graph, loading = false, error = null }: GraphExplorerProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [layoutReady, setLayoutReady] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const isGraphView = location.pathname === '/';

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
    let filtered: Pick<FlowGraphData, 'nodes' | 'edges'> = graph;

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
  }, [graph, searchQuery, enabledTypes]);

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
          graph={graph}
          onLayoutReady={onLayoutReady}
          searchQuery={searchQuery}
          enabledTypes={enabledTypes}
          showConditionals={showConditionals}
        />
      )}
    </div>
  );

  const content = (
    <div className="flex h-full">
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
        />
        <div className="border-t border-border" />
        <DocsTree visibleNames={visibleNames} />
      </Sidebar>
      <main className="flex-1 relative overflow-hidden">
        <Routes>
          <Route path="/" element={graphView} />
          <Route path="/docs" element={<DocsViewer />} />
          <Route path="/docs/*" element={<DocsViewer />} />
        </Routes>
        {isGraphView && (
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-md border border-border bg-background/90 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm"
            title="Open AI chat"
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
          </button>
        )}
        <ChatPanel open={chatOpen} onOpenChange={setChatOpen} />
      </main>
    </div>
  );

  if (contextValue) {
    return <GraphExplorerProvider value={contextValue}>{content}</GraphExplorerProvider>;
  }

  return content;
}
