import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Route, Routes, useSearchParams } from 'react-router';
import type { FlowGraph as FlowGraphData } from '../../graph/types.js';
import { DocsTree } from './components/DocsTree';
import { DocsViewer } from './components/DocsViewer';
import { FlowControls } from './components/FlowControls';
import { FlowGraph, getNodeCategory, type NodeCategory } from './components/FlowGraph';
import { LoadingSpinner } from './components/LoadingSpinner';
import { Sidebar } from './components/Sidebar';
import { ViewNav } from './components/ViewNav';

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

  // Compute filtered graph for sidebar stats (type + search filters, no entry highlight)
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

  // Set of visible symbol names from the filtered graph, used to sync tree with graph filters.
  // null means "show all" (no filters active or graph not loaded yet).
  const hasFilter = searchQuery.trim() !== '' || enabledTypes !== null;
  const visibleNames = useMemo(() => {
    if (!graph || !hasFilter) return null;
    return new Set(filteredGraph.nodes.map((n) => n.name));
  }, [graph, hasFilter, filteredGraph]);

  return (
    <div className="flex h-full">
      <Sidebar>
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
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
