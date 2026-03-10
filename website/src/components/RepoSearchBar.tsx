import { type FormEvent, useState } from 'react';
import { parseGitHubUrl } from '../lib/explore-utils';

/** Search bar for exploring any GitHub repo's dependency graph. */
export function RepoSearchBar() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      setError('Enter a valid GitHub URL like https://github.com/owner/repo');
      return;
    }

    window.location.href = `/showcases/explore?repo=${parsed.owner}/${parsed.repo}`;
  }

  return (
    <form onSubmit={handleSubmit} className="mb-10">
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          className="flex-1 bg-background border border-border rounded px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
        />
        <button
          type="submit"
          className="bg-foreground text-background px-5 py-2.5 rounded font-mono text-sm font-medium hover:bg-foreground/90 transition-colors shrink-0"
        >
          Explore
        </button>
      </div>
      {error && <p className="text-red-400 text-xs font-mono mt-2">{error}</p>}
    </form>
  );
}
