import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useSearchParams } from 'react-router';
import type { FlowGraph as FlowGraphData } from '../../graph/types.js';
import { DocsTree } from './components/DocsTree';
import { DocsViewer } from './components/DocsViewer';
import { FlowControls } from './components/FlowControls';
import { FlowGraph, type NodeCategory } from './components/FlowGraph';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ViewerShell } from './components/ViewerShell';
import { ViewNav } from './components/ViewNav';
import { useGraphFilters } from './hooks/useGraphFilters';

interface GraphViewProps {
  graph: FlowGraphData | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  enabledTypes: Set<NodeCategory> | null;
  showConditionals: boolean;
}

function GraphView({
  graph,
  loading,
  error,
  searchQuery,
  enabledTypes,
  showConditionals,
}: GraphViewProps) {
  const [layoutReady, setLayoutReady] = useState(false);

  const onLayoutReady = useCallback(() => {
    setLayoutReady(true);
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full font-sans text-red-500 gap-2">
        <div className="font-semibold">Error loading graph</div>
        <div className="text-muted-foreground text-sm">{error}</div>
        <div className="text-muted-foreground text-[13px] mt-2">
          Make sure you've run <code className="bg-muted px-1.5 rounded">treck sync</code> first.
        </div>
      </div>
    );
  }

  if (!loading && (!graph || graph.nodes.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-full font-sans text-muted-foreground gap-2">
        <div className="font-semibold text-base">No graph data</div>
        <div className="text-sm">
          Run <code className="bg-muted px-1.5 rounded">treck sync</code> to build the project call
          graph.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      {!layoutReady && (
        <div className="absolute inset-0 z-20 bg-background">
          <LoadingSpinner />
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
}

function Layout() {
  const [graph, setGraph] = useState<FlowGraphData | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);

  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

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

  /** Serialize enabled types to a URL param. */
  const setEnabledTypes = useCallback(
    (types: Set<NodeCategory> | null) => setParam('types', types ? [...types].join(',') : null),
    [setParam],
  );

  useEffect(() => {
    fetch('/api/graph')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load graph: ${res.status}`);
        return res.json();
      })
      .then((data: FlowGraphData) => {
        setGraph(data);
        setGraphLoading(false);
      })
      .catch((err: Error) => {
        setGraphError(err.message);
        setGraphLoading(false);
      });
  }, []);

  const {
    availableTypes,
    hasConditionalEdges,
    filteredGraph,
    onToggleType,
    onSoloType,
    onResetTypes,
  } = useGraphFilters({ graph, searchQuery, enabledTypes, setEnabledTypes });

  // Set of visible symbol names from the filtered graph, used to sync tree with graph filters.
  // null means "show all" (no filters active or graph not loaded yet).
  const hasFilter = searchQuery.trim() !== '' || enabledTypes !== null;
  const visibleNames = useMemo(() => {
    if (!graph || !hasFilter) return null;
    return new Set(filteredGraph.nodes.map((n) => n.name));
  }, [graph, hasFilter, filteredGraph]);

  const sidebarContent = (
    <>
      <ViewNav />
      <FlowControls
        loading={graphLoading}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        nodeCount={filteredGraph.nodes.length}
        edgeCount={filteredGraph.edges.length}
        availableTypes={availableTypes}
        enabledTypes={enabledTypes}
        onToggleType={onToggleType}
        onSoloType={onSoloType}
        onResetTypes={onResetTypes}
        showConditionals={showConditionals}
        onToggleConditionals={() => setParam('conditionals', showConditionals ? null : 'true')}
        hasConditionalEdges={hasConditionalEdges}
      />
      <div className="border-t border-border" />
      <DocsTree visibleNames={visibleNames} />
    </>
  );

  return (
    <ViewerShell sidebarContent={sidebarContent} closeTrigger={location.pathname}>
      <Routes>
        <Route
          path="/"
          element={
            <GraphView
              graph={graph}
              loading={graphLoading}
              error={graphError}
              searchQuery={searchQuery}
              enabledTypes={enabledTypes}
              showConditionals={showConditionals}
            />
          }
        />
        <Route path="/docs" element={<DocsViewer />} />
        <Route path="/docs/*" element={<DocsViewer />} />
      </Routes>
    </ViewerShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
