import type { FlowGraph as FlowGraphData } from '@treck/graph/types.js';
import { GraphExplorer } from '@viewer/components/GraphExplorer';
import { MemoryRouter } from 'react-router';

interface ShowcaseViewerProps {
  /** Pre-loaded graph data for the showcased project. */
  graph: FlowGraphData;
  /** Showcase project slug — used to route chat requests to the correct graph. */
  project: string;
}

/** Standalone graph viewer for showcasing analysed projects on the website. */
export function ShowcaseViewer({ graph, project }: ShowcaseViewerProps) {
  return (
    <MemoryRouter>
      <GraphExplorer graph={graph} project={project} />
    </MemoryRouter>
  );
}
