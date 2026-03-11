/**
 * Hook for live diff data via SSE.
 *
 * Fetches the initial diff from `/api/diff` and subscribes to
 * `/api/diff/stream` for live updates as graph.json changes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GraphDiff } from '../../../graph/diff.js';

/** Return type for the useLiveDiff hook. */
interface LiveDiffResult {
  /** The current diff data, or null if not yet loaded or diff is disabled. */
  diff: GraphDiff | null;
  /** The base ref name (e.g. "main" or "master"). */
  baseRef: string | null;
  /** Whether the initial diff fetch is in progress. */
  loading: boolean;
}

/**
 * Subscribe to live graph diff updates.
 *
 * When enabled, fetches `/api/diff` for the initial diff snapshot and opens
 * an SSE connection to `/api/diff/stream` for live updates. Cleans up the
 * EventSource when disabled or on unmount.
 *
 * @param enabled - Whether the diff feature is currently toggled on
 * @returns The current diff data, base ref, and loading state
 */
export function useLiveDiff(enabled: boolean): LiveDiffResult {
  const [diff, setDiff] = useState<GraphDiff | null>(null);
  const [baseRef, setBaseRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      setDiff(null);
      return;
    }

    setLoading(true);

    // Fetch initial diff
    fetch('/api/diff')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load diff: ${res.status}`);
        return res.json();
      })
      .then((data: GraphDiff) => {
        setDiff(data);
        setBaseRef(data.base);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    // Open SSE stream for live updates
    const es = new EventSource('/api/diff/stream');
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as GraphDiff;
        setDiff(data);
        setBaseRef(data.base);
      } catch {
        // Ignore malformed messages
      }
    };

    return cleanup;
  }, [enabled, cleanup]);

  return { diff, baseRef, loading };
}
