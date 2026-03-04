import type { FlowGraph as FlowGraphData } from '@treck/graph/types.js';
import { GraphExplorer } from '@viewer/components/GraphExplorer';
import { MemoryRouter } from 'react-router';

interface ShowcaseViewerProps {
  /** Pre-loaded graph data for the showcased project. */
  graph: FlowGraphData;
}

/** Standalone graph viewer for showcasing analysed projects on the website. */
export function ShowcaseViewer({ graph }: ShowcaseViewerProps) {
  return (
    <MemoryRouter>
      <div className="dark h-full">
        <GraphExplorer graph={graph} />
      </div>
    </MemoryRouter>
  );
}
