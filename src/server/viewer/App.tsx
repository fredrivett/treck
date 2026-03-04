import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router';
import type { FlowGraph as FlowGraphData } from '../../graph/types.js';
import { GraphExplorer } from './components/GraphExplorer';

/** Fetches graph data and renders the GraphExplorer. */
function GraphExplorerWithData() {
  const [graph, setGraph] = useState<FlowGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, []);

  return <GraphExplorer graph={graph} loading={loading} error={error} />;
}

/** Root application component for the treck viewer. */
export default function App() {
  return (
    <BrowserRouter>
      <GraphExplorerWithData />
    </BrowserRouter>
  );
}
