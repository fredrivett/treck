import type { FlowGraph as FlowGraphData } from '@treck/graph/types.js';
import { useEffect, useState } from 'react';
import { ShowcaseViewer } from './ShowcaseViewer';

interface ShowcaseLoaderProps {
  /** URL to the graph.json file (e.g. /showcases/tldraw.json). */
  graphUrl: string;
  /** Showcase project slug, passed through to enable the chat feature. */
  project: string;
}

/** Fetches graph data from a URL and renders the ShowcaseViewer once loaded. */
export function ShowcaseLoader({ graphUrl, project }: ShowcaseLoaderProps) {
  const [graph, setGraph] = useState<FlowGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(graphUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load graph: ${res.status}`);
        return res.json();
      })
      .then((data: FlowGraphData) => setGraph(data))
      .catch((err: Error) => setError(err.message));
  }, [graphUrl]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full font-sans text-red-400">
        <div className="text-center">
          <div className="font-semibold">Failed to load graph</div>
          <div className="text-sm text-zinc-500 mt-1">{error}</div>
        </div>
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="flex items-center justify-center h-full font-sans text-zinc-500">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
          <span className="text-sm">Loading graph...</span>
        </div>
      </div>
    );
  }

  return <ShowcaseViewer graph={graph} project={project} />;
}
