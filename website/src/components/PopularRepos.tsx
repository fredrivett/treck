/**
 * Displays recently popular explored repos, fetched client-side from
 * `/api/explore/popular`. Shows a compact list of repo links that
 * navigate to the explore viewer.
 */

import { useEffect, useState } from 'react';

/** Shape matching the API response. */
interface PopularRepo {
  repo: string;
  views: number;
}

/** Client-side component showing trending explored repos. */
export function PopularRepos() {
  const [repos, setRepos] = useState<PopularRepo[]>([]);

  useEffect(() => {
    fetch('/api/explore/popular')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: PopularRepo[]) => setRepos(data))
      .catch(() => {});
  }, []);

  if (repos.length === 0) return null;

  return (
    <div className="mb-8">
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Recently explored (last 24h)</h3>
      <div className="flex flex-wrap gap-2">
        {repos.map(({ repo, views }) => (
          <a
            key={repo}
            href={`/showcases/explore?repo=${repo}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800/50 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700/50 hover:text-white transition-colors"
          >
            <span>{repo}</span>
            <span className="text-xs text-zinc-500">{views}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
