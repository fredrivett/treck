import type { FlowGraph as FlowGraphData } from '@treck/graph/types.js';
import { FlowControls } from '@viewer/components/FlowControls';
import { FlowGraph, getNodeCategory, type NodeCategory } from '@viewer/components/FlowGraph';
import { LoadingSpinner } from '@viewer/components/LoadingSpinner';
import { Sidebar } from '@viewer/components/Sidebar';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@viewer/components/ui/drawer';
import { Menu } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { MemoryRouter } from 'react-router';
import { useMediaQuery } from 'usehooks-ts';

interface ShowcaseViewerProps {
  /** Pre-loaded graph data for the showcased project. */
  graph: FlowGraphData;
  /** Display name for the project. */
  projectName: string;
}

/** Standalone graph viewer for showcasing analysed projects on the website. */
export function ShowcaseViewer({ graph, projectName }: ShowcaseViewerProps) {
  return (
    <MemoryRouter>
      <ShowcaseViewerInner graph={graph} projectName={projectName} />
    </MemoryRouter>
  );
}

function ShowcaseViewerInner({ graph, projectName }: ShowcaseViewerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [enabledTypes, setEnabledTypes] = useState<Set<NodeCategory> | null>(null);
  const [showConditionals, setShowConditionals] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isDesktop = useMediaQuery('(min-width: 768px)', {
    defaultValue: true,
    initializeWithValue: false,
  });

  const onLayoutReady = useCallback(() => {
    setLayoutReady(true);
  }, []);

  const availableTypes = useMemo(() => {
    const counts = new Map<NodeCategory, number>();
    for (const node of graph.nodes) {
      const cat = getNodeCategory(node);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return counts;
  }, [graph]);

  const hasConditionalEdges = useMemo(
    () => graph.edges.some((e) => e.type === 'conditional-call'),
    [graph],
  );

  const filteredGraph = useMemo(() => {
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
      setEnabledTypes((current) => {
        if (!current) {
          const all = new Set(availableTypes.keys());
          all.delete(category);
          return all;
        }
        const next = new Set(current);
        if (next.has(category)) {
          next.delete(category);
        } else {
          next.add(category);
        }
        if (next.size === availableTypes.size) return null;
        return next;
      });
    },
    [availableTypes],
  );

  const sidebarContent = (
    <>
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{projectName}</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Analysed with <span className="font-medium">treck</span>
        </p>
      </div>
      <FlowControls
        loading={false}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        nodeCount={filteredGraph.nodes.length}
        edgeCount={filteredGraph.edges.length}
        availableTypes={availableTypes}
        enabledTypes={enabledTypes}
        onToggleType={onToggleType}
        onSoloType={(category) => setEnabledTypes(new Set([category]))}
        onResetTypes={() => setEnabledTypes(null)}
        showConditionals={showConditionals}
        onToggleConditionals={() => setShowConditionals((prev) => !prev)}
        hasConditionalEdges={hasConditionalEdges}
      />
    </>
  );

  return (
    <div className="dark flex h-full font-sans">
      {isDesktop ? (
        <Sidebar>{sidebarContent}</Sidebar>
      ) : (
        <Drawer direction="left" open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <DrawerContent className="w-[280px] max-w-[80vw]">
            <DrawerTitle className="sr-only">{projectName}</DrawerTitle>
            <DrawerDescription className="sr-only">Graph controls and filters</DrawerDescription>
            <div className="flex flex-col h-full overflow-hidden">{sidebarContent}</div>
          </DrawerContent>
        </Drawer>
      )}
      <main className="flex-1 relative overflow-hidden">
        {!isDesktop && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="absolute top-3 left-3 z-10 rounded-md p-2 bg-background border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Open sidebar"
          >
            <Menu size={18} />
          </button>
        )}
        <div className="w-full h-full relative">
          {!layoutReady && (
            <div className="absolute inset-0 z-20 bg-background">
              <LoadingSpinner />
            </div>
          )}
          <FlowGraph
            graph={graph}
            onLayoutReady={onLayoutReady}
            searchQuery={searchQuery}
            enabledTypes={enabledTypes}
            showConditionals={showConditionals}
            darkMode
          />
        </div>
      </main>
    </div>
  );
}
