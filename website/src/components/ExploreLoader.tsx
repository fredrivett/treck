import type { FlowGraph as FlowGraphData } from '@treck/graph/types.js';
import { useEffect, useState } from 'react';
import { ShowcaseViewer } from './ShowcaseViewer';

interface ExploreLoaderProps {
  /** GitHub owner/repo string, e.g. "vercel/next.js". */
  repo: string;
}

/** Fetches a graph on demand via the explore API and renders the ShowcaseViewer. */
export function ExploreLoader({ repo }: ExploreLoaderProps) {
  const [graph, setGraph] = useState<FlowGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/explore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://github.com/${repo}` }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
        return data as FlowGraphData;
      })
      .then((data) => setGraph(data))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message);
      });

    return () => controller.abort();
  }, [repo]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full font-sans text-red-400">
        <div className="text-center">
          <div className="font-semibold">Failed to build graph</div>
          <div className="text-sm text-zinc-500 mt-1">{error}</div>
          <a
            href="/showcases"
            className="inline-block mt-4 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back to showcases
          </a>
        </div>
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="flex items-center justify-center h-full font-sans text-zinc-500">
        <div className="flex flex-col items-center gap-3">
          <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
          <span className="text-sm">Building graph for {repo}...</span>
          <span className="text-xs text-zinc-600">
            This may take up to a minute for large repos
          </span>
        </div>
      </div>
    );
  }

  return <ShowcaseViewer graph={graph} project={`explore:${repo}`} />;
}
