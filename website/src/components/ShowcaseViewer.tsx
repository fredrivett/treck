import type { FlowGraph as FlowGraphData } from '@treck/graph/types.js';
import { FlowControls } from '@viewer/components/FlowControls';
import { FlowGraph, type NodeCategory } from '@viewer/components/FlowGraph';
import { LoadingSpinner } from '@viewer/components/LoadingSpinner';
import { ViewerShell } from '@viewer/components/ViewerShell';
import { useGraphFilters } from '@viewer/hooks/useGraphFilters';
import { useCallback, useState } from 'react';
import { MemoryRouter } from 'react-router';

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

  const onLayoutReady = useCallback(() => {
    setLayoutReady(true);
  }, []);

  const {
    availableTypes,
    hasConditionalEdges,
    filteredGraph,
    onToggleType,
    onSoloType,
    onResetTypes,
  } = useGraphFilters({ graph, searchQuery, enabledTypes, setEnabledTypes });

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
        onSoloType={onSoloType}
        onResetTypes={onResetTypes}
        showConditionals={showConditionals}
        onToggleConditionals={() => setShowConditionals((prev) => !prev)}
        hasConditionalEdges={hasConditionalEdges}
      />
    </>
  );

  return (
    <ViewerShell
      sidebarContent={sidebarContent}
      className="dark font-sans"
      drawerTitle={projectName}
      drawerDescription="Graph controls and filters"
    >
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
    </ViewerShell>
  );
}
