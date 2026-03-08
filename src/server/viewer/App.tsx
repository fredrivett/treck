import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router';
import type { FlowGraph as FlowGraphData } from '../../graph/types.js';
import { GraphExplorer } from './components/GraphExplorer';
import { TooltipProvider } from './components/ui/tooltip';

/** Fetches graph data and project info, then renders the GraphExplorer. */
function GraphExplorerWithData() {
  const [graph, setGraph] = useState<FlowGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<string | undefined>();

  useEffect(() => {
    fetch('/api/graph')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load graph: ${res.status}`);
        return res.json();
      })
      .then((data: FlowGraphData) => {
        setGraph(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });

    fetch('/api/project-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { graphId: string } | null) => {
        if (data?.graphId) setProject(data.graphId);
      })
      .catch(() => {});
  }, []);

  return <GraphExplorer graph={graph} loading={loading} error={error} project={project} />;
}

/** Root application component for the treck viewer. */
export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <GraphExplorerWithData />
      </TooltipProvider>
    </BrowserRouter>
  );
}
